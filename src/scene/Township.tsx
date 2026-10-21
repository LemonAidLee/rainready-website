// The 3D township: the exported .glb (simulations/township-3d/exports, TOWNSHIP_3D_AND_SIMULATOR.md 5.7), with the
// zones, pond gauges, what-if pond, upstream blocks and flow arrows driven by the simulator results.
// The glTF carries flat colours only (the Blender toon shaders do not survive export), so the site adds back some of
// the look in the browser: shadows, a procedural window grid on walls and building outlines when zoomed in.
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BAND_COLOR, zoneLook, type Basis, type Controls, type ScenarioId } from "../lib/data";

const DYNAMIC = /^(zone_Z\d\d|pond_[AB]|pond_[AB]_water|pond_whatif|pond_whatif_water|rr_upstream_change|rr_flow_arrows|rr_flow_arrows_cross|tree_proto|council_line|label_.*)$/;
const DRY = 0.1;            // pond gauge on a clear day (display only)
export type Pick = { kind: "zone"; id: string } | { kind: "pond"; id: "pond_A" | "pond_B" | "pond_whatif" } | null;
export type V3 = [number, number, number];

/** Where things are, for the HTML labels, the overlays and the guided demo's pointers (glTF coordinates). */
export interface Anchors {
  labels: Record<string, V3>;               // label_area_A, label_spot_1, label_zone_Z03, ...
  ponds: Record<string, V3>;                // pond_A, pond_B, pond_whatif: centre of the water surface
  drains: Record<string, [number, number][]>; // drain_Dxx path, Blender coordinates (x east, y north)
  zones: THREE.Mesh[];                      // for ground-height raycasts
}

/** Name of the glTF node an object came from (multi-primitive meshes are a group of child meshes). */
function nodeName(o: THREE.Object3D): string {
  if (DYNAMIC.test(o.name)) return o.name;
  return o.parent && DYNAMIC.test(o.parent.name) ? o.parent.name : o.name;
}

function flowMaterial(color: string, widthK: number) {
  // Chevrons that move along the ribbon's U (= distance / 30 m, in the OSM way direction), as drive_scene.py
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,   // ribbons may face down: draw both sides
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
      void main(){ float a = abs(vUv.y - 0.5); float s = fract(vUv.x + a * ${widthK.toFixed(2)} - uTime);
        float m = step(s, 0.38) * step(a, 0.46); if (m * uOpacity < 0.01) discard; gl_FragColor = vec4(uColor, m * uOpacity); }`,
  });
}

/** Procedural window grid on vertical wall faces (3.0 m bays, 3.3 m floors, as style_scene.py), faded out when a bay
 *  is smaller than a few pixels so it never shimmers at overview zoom. Look only. */
function addWindows(mat: THREE.MeshStandardMaterial) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos; varying vec3 vWN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos; varying vec3 vWN;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        float vert = 1.0 - abs(vWN.y);
        if (vert > 0.8) {
          float u = abs(vWN.x) > abs(vWN.z) ? vWPos.z : vWPos.x;
          vec2 g = vec2(fract(u / 3.0), fract((vWPos.y - 0.8) / 3.3));
          float win = step(0.24, g.x) * step(g.x, 0.76) * step(0.36, g.y) * step(g.y, 0.80);
          float px = max(fwidth(u), fwidth(vWPos.y)) / 3.0;
          float sharp = 1.0 - smoothstep(0.10, 0.32, px);
          float amt = mix(0.12, win * 0.82, sharp);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.22, 0.29), amt);
        }`);
  };
  mat.customProgramCacheKey = () => "rr-windows";
}

/**
 * The opening reveal: the township materialises from its centre outwards behind a cyan scan edge, and buildings and
 * trees rise out of the ground. One shared radius for every material (REVEAL.uR, metres); 1e6 = fully shown.
 * Look only: nothing here touches the results.
 */
export const REVEAL = { uR: { value: 1e6 }, uRC: { value: new THREE.Vector2(239, 105) } };   // centre: model middle (glTF x, z)
export const REVEAL_MS = 1800, REVEAL_MAX = 1900;
function addReveal(mat: THREE.Material, rise: number) {
  if ((mat as any).__reveal || (mat as THREE.ShaderMaterial).isShaderMaterial) return;
  (mat as any).__reveal = true;
  const prev = mat.onBeforeCompile.bind(mat), prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.uniforms.uR = REVEAL.uR; sh.uniforms.uRC = REVEAL.uRC;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uR; uniform vec2 uRC; varying float vRD;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec4 rw = modelMatrix * vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          rw = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #endif
        vRD = length(rw.xz - uRC);
        float rk = clamp((uR - vRD) / 260.0, 0.0, 1.0);
        transformed.y -= (1.0 - rk * rk * (3.0 - 2.0 * rk)) * ${rise.toFixed(1)};`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uR; varying float vRD;")
      .replace("#include <dithering_fragment>", `#include <dithering_fragment>
        if (vRD > uR) discard;
        float edge = 1.0 - smoothstep(0.0, 26.0, uR - vRD);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.32, 0.86, 0.95), edge * 0.85);`);
  };
  mat.customProgramCacheKey = () => prevKey() + `|reveal${rise}`;
  mat.needsUpdate = true;
}

interface Prepared {
  zones: Record<string, { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }>;
  water: Record<string, THREE.Object3D>;
  gauges: Record<string, [number, number]>;
  whatif: THREE.Object3D | null;
  upstream: THREE.Mesh | null;
  flow: THREE.ShaderMaterial[];
  flowMeshes: THREE.Mesh[];
  edges: THREE.LineSegments | null;
  trees: THREE.InstancedMesh[];
  anchors: Anchors;
  stats: { merged: number; groups: number };
}

function prepare(root: THREE.Object3D, trees: [number, number, number, number, string][]): Prepared {
  if (root.userData.__prepared) return root.userData.__prepared;   // it edits the scene: run once per loaded model
  root.updateMatrixWorld(true);
  const out: Prepared = { zones: {}, water: {}, gauges: {}, whatif: null, upstream: null, flow: [], flowMeshes: [], edges: null,
    trees: [], anchors: { labels: {}, ponds: {}, drains: {}, zones: [] }, stats: { merged: 0, groups: 0 } };
  const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  const drop: THREE.Object3D[] = [];
  const v = new THREE.Vector3(), box = new THREE.Box3();
  root.traverse((o) => {
    const name = nodeName(o);
    if (/^drain_D\d+$/.test(o.name) && Array.isArray(o.userData.path)) out.anchors.drains[o.name] = o.userData.path;
    if (/^label_/.test(o.name)) {                 // 3D text tags: replaced by HTML labels (readable at any zoom)
      out.anchors.labels[o.name] = o.getWorldPosition(v).toArray() as V3;
      drop.push(o); return;
    }
    if (/^pond_(A|B|whatif)_water$/.test(o.name)) {
      out.water[o.name] = o; out.gauges[o.name] = [o.userData.gauge_z_empty, o.userData.gauge_z_full];
      box.setFromObject(o); box.getCenter(v);
      out.anchors.ponds[o.name.replace("_water", "")] = [v.x, box.max.y, v.z];
    }
    if (o.name === "pond_whatif") out.whatif = o;
    if (o.name === "council_line" && (o as THREE.Mesh).isMesh) { o.visible = false; return; }   // redrawn larger (Overlays)
    if (!(o as THREE.Mesh).isMesh) return;
    const m = o as THREE.Mesh;
    if (name === "council_line") { m.visible = false; return; }
    if (/^label_/.test(name)) return;
    if (/^zone_Z\d\d$/.test(name)) {
      const mat = new THREE.MeshBasicMaterial({ color: BAND_COLOR.base, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
      m.material = mat; m.renderOrder = 2; out.zones[name.slice(5)] = { mesh: m, mat }; out.anchors.zones.push(m);
      return;
    }
    if (name === "rr_upstream_change") { out.upstream = m; m.raycast = () => {}; m.castShadow = true; m.receiveShadow = true; return; }
    if (name === "rr_flow_arrows" || name === "rr_flow_arrows_cross") {
      const mat = flowMaterial(name.endsWith("cross") ? "#ffd27a" : "#bfeaff", name.endsWith("cross") ? 1.1 : 0.9);
      m.material = mat; m.renderOrder = 3; m.raycast = () => {}; out.flow.push(mat); out.flowMeshes.push(m);
      return;
    }
    if (DYNAMIC.test(name)) { m.receiveShadow = true; return; }   // ponds, pond water, what-if pond, tree prototype
    // everything else is static: merge by material
    const mat = m.material as THREE.Material;
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    for (const a of Object.keys(g.attributes)) if (a !== "position" && a !== "normal") g.deleteAttribute(a);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    g.morphAttributes = {};
    const key = mat.uuid;
    if (!groups.has(key)) groups.set(key, { mat, geos: [] });
    groups.get(key)!.geos.push(g);
    drop.push(m);
  });
  for (const m of drop) m.parent?.remove(m);
  const merged = new THREE.Group(); merged.name = "static_merged";
  const buildingGeos: THREE.BufferGeometry[] = [];
  for (const { mat, geos } of groups.values()) {
    const g = mergeGeometries(geos, false);
    if (!g) continue;
    const std = mat as THREE.MeshStandardMaterial;
    if (std.isMeshStandardMaterial) { std.roughness = /water/.test(std.name) ? 0.25 : 0.92; std.metalness = 0; }
    if (/^web_wall_/.test(mat.name)) addWindows(std);
    const mesh = new THREE.Mesh(g, mat);
    mesh.raycast = () => {};
    mesh.matrixAutoUpdate = false;
    const isBuilding = /^web_(wall|roof)_/.test(mat.name);
    mesh.castShadow = isBuilding || /^web_(plinth|bank)/.test(mat.name);
    mesh.receiveShadow = true;
    if (isBuilding) buildingGeos.push(g);
    merged.add(mesh);
    out.stats.groups++; out.stats.merged += geos.length;
  }
  root.add(merged);
  // building outlines (the Blender look's inverted hulls do not export): shown only when zoomed in, see Township
  if (buildingGeos.length) {
    const eg = new THREE.EdgesGeometry(mergeGeometries(buildingGeos.map((g) => g.clone().deleteAttribute("normal")), false)!, 40);
    const lines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: "#2b2620", transparent: true, opacity: 0 }));
    lines.raycast = () => {}; lines.matrixAutoUpdate = false;
    root.add(lines); out.edges = lines;
  }
  // trees: one prototype, instanced (trees.json rows are Blender coordinates: glTF position = (x, z, -y))
  const proto = root.getObjectByName("tree_proto");
  if (proto) {
    proto.visible = false;
    const parts: THREE.Mesh[] = [];
    proto.traverse((o) => (o as THREE.Mesh).isMesh && parts.push(o as THREE.Mesh));
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (const part of parts) {
      const inst = new THREE.InstancedMesh(part.geometry, part.material, trees.length);
      trees.forEach(([x, y, z, sc], i) => inst.setMatrixAt(i, mtx.compose(p.set(x, z, -y), q, s.set(sc, sc, sc))));
      inst.raycast = () => {}; inst.castShadow = true; inst.receiveShadow = true;
      root.add(inst); out.trees.push(inst);
    }
  }
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const rise = (m as THREE.InstancedMesh).isInstancedMesh || /^web_(wall|roof)_/.test(mat.name) ? 40 : 0;
      addReveal(mat, rise);
    }
  });
  root.userData.__prepared = out;
  return out;
}

const lerp = THREE.MathUtils.lerp;

export interface Layers { zones: boolean; labels: boolean; flow: boolean; boundary: boolean; trees: boolean; upstream: boolean }

export function Township(props: {
  results: any; scenario: ScenarioId; basis: Basis; storm: number; controls: Controls; trees: [number, number, number, number, string][];
  pick: Pick; layers: Layers; onPick: (p: Pick) => void; onReady: (a: Anchors) => void; onHover?: (h: { zone: string | null; p: V3 } | null) => void;
  onShown?: () => void;                     // the model has rendered (shaders compiled): lift the curtain
}) {
  const { scene } = useGLTF("./data/township.glb", "./draco/");
  const prep = useMemo(() => prepare(scene, props.trees), [scene, props.trees]);
  const { gl, camera } = useThree();
  const target = useRef({ zones: {} as Record<string, { c: THREE.Color; o: number }>, water: {} as Record<string, number>, up: 0, pond: 0, pondK: 1, flow: 0 });
  useEffect(() => props.onReady(prep.anchors), [prep]);

  // targets from the results, the settings and the storm (0 clear day ... 1 design storm)
  const sc = props.results.scenarios[props.scenario];
  useEffect(() => {
    const t = target.current;
    for (const [id, z] of Object.entries<any>(sc.zones)) {
      const look = zoneLook(z, props.scenario, sc, props.basis);
      const on = props.storm > 0.5;
      const sel = props.pick?.kind === "zone" && props.pick.id === id;
      t.zones[id] = { c: new THREE.Color(on ? BAND_COLOR[look.band] : BAND_COLOR.base),
                      o: props.layers.zones ? (on && look.band !== "base" ? 0.5 : 0.12) + (sel ? 0.22 : 0) : (sel ? 0.3 : 0) };
    }
    for (const pid of ["pond_A", "pond_B"]) t.water[`${pid}_water`] = props.storm > 0.5 ? sc.ponds[pid].gauge : DRY;
    const w = sc.what_if_pond;
    t.water.pond_whatif_water = props.storm > 0.5 && w ? (w.ratio === null || w.ratio === undefined ? 0.6 : Math.min(1, w.ratio)) : 0;
    t.up = props.layers.upstream ? props.controls.dev : 0;
    t.pond = props.controls.pond ? 1 : 0;
    // the what-if pond's footprint follows its size (area ~ volume at a fixed depth): 25,000 m3 is the modelled pond
    t.pondK = Math.sqrt(Math.max(0.05, props.controls.pondSize / 25000));
    t.flow = props.layers.flow ? props.storm : 0;
  }, [sc, props.scenario, props.basis, props.storm, props.pick, props.controls, props.layers]);

  useEffect(() => { for (const t of prep.trees) t.visible = props.layers.trees; }, [props.layers.trees, prep]);

  // the reveal: hidden for the first frames (they compile every shader, behind App's curtain), then grow outwards
  const reveal = useRef<{ frames: number; t0: number }>({ frames: 0, t0: 0 });
  useEffect(() => { REVEAL.uR.value = 0; reveal.current = { frames: 0, t0: 0 }; return () => { REVEAL.uR.value = 1e6; }; }, [prep]);

  const pondScale = useRef(0);
  useFrame((state, dt) => {
    const rv = reveal.current;
    if (!rv.t0) {
      if (++rv.frames === 4) { rv.t0 = performance.now(); props.onShown?.(); }
    } else if (REVEAL.uR.value < 1e6) {
      const u = Math.min(1, (performance.now() - rv.t0) / REVEAL_MS);
      REVEAL.uR.value = u >= 1 ? 1e6 : REVEAL_MAX * (1 - Math.pow(1 - u, 3));
    }
    const t = target.current, k = Math.min(1, dt * 2.5);
    for (const [id, z] of Object.entries(prep.zones)) {
      const g = t.zones[id];
      if (!g) continue;
      z.mat.color.lerp(g.c, k); z.mat.opacity = lerp(z.mat.opacity, g.o, k);
    }
    for (const [n, o] of Object.entries(prep.water)) {
      const [e, f] = prep.gauges[n] ?? [0, 0];
      const want = e + (t.water[n] ?? DRY) * (f - e);
      o.position.y = lerp(o.position.y, want, k);
    }
    if (prep.upstream?.morphTargetInfluences) {
      prep.upstream.morphTargetInfluences[0] = lerp(prep.upstream.morphTargetInfluences[0], t.up, k);
    }
    pondScale.current = lerp(pondScale.current, t.pond * t.pondK, k);
    if (prep.whatif) {
      prep.whatif.visible = pondScale.current > 0.02;
      prep.whatif.scale.set(pondScale.current, Math.min(1, pondScale.current * 3), pondScale.current);
    }
    for (const m of prep.flow) {
      m.uniforms.uTime.value = state.clock.elapsedTime * 0.8;
      const on = t.flow > 0.01 && REVEAL.uR.value >= 1e6;   // the arrows join once the reveal is complete
      m.uniforms.uOpacity.value = lerp(m.uniforms.uOpacity.value, on ? 0.15 + 0.8 * t.flow : 0, k);
    }
    if (prep.edges) {   // outlines fade in once a building is more than a few pixels wide
      const z = (camera as THREE.OrthographicCamera).zoom;
      const want = THREE.MathUtils.clamp((z - 0.9) / 1.2, 0, 0.55);
      const mat = prep.edges.material as THREE.LineBasicMaterial;
      mat.opacity = lerp(mat.opacity, want, k);
      prep.edges.visible = mat.opacity > 0.01;
    }
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const n = nodeName(e.object);
    if (/^zone_Z\d\d$/.test(n)) props.onPick({ kind: "zone", id: n.slice(5) });
    else if (/^pond_(A|B)/.test(n)) props.onPick({ kind: "pond", id: n.startsWith("pond_A") ? "pond_A" : "pond_B" });
    else if (n.startsWith("pond_whatif")) props.onPick({ kind: "pond", id: "pond_whatif" });
  };
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!props.onHover) return;
    const n = nodeName(e.object);
    props.onHover({ zone: /^zone_Z\d\d$/.test(n) ? n.slice(5) : null, p: e.point.toArray() as V3 });
  };
  return (
    <primitive object={scene} onClick={onClick} onPointerMissed={() => props.onPick(null)} onPointerMove={onMove}
      onPointerOver={() => (gl.domElement.style.cursor = "crosshair")} onPointerOut={() => { gl.domElement.style.cursor = ""; props.onHover?.(null); }} />
  );
}
