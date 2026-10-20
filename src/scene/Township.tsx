// The 3D township: the exported .glb (simulations/township-3d/exports, TOWNSHIP_3D_AND_SIMULATOR.md 5.7), with the
// zones, pond gauges, what-if pond, upstream blocks and flow arrows driven by the simulator results.
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BAND_COLOR, zoneLook, type ScenarioId } from "../lib/data";

const DYNAMIC = /^(zone_Z\d\d|pond_[AB]|pond_[AB]_water|pond_whatif|pond_whatif_water|rr_upstream_change|rr_flow_arrows|rr_flow_arrows_cross|tree_proto)$/;
const DRY = 0.1;            // pond gauge on a clear day (display only)
export type Pick = { kind: "zone"; id: string } | { kind: "pond"; id: "pond_A" | "pond_B" | "pond_whatif" } | null;

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

interface Prepared {
  zones: Record<string, { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }>;
  water: Record<string, THREE.Object3D>;
  gauges: Record<string, [number, number]>;
  whatif: THREE.Object3D[];
  upstream: THREE.Mesh | null;
  flow: THREE.ShaderMaterial[];
  stats: { merged: number; groups: number };
}

function prepare(root: THREE.Object3D, trees: [number, number, number, number, string][]): Prepared {
  if (root.userData.__prepared) return root.userData.__prepared;   // it edits the scene: run once per loaded model
  root.updateMatrixWorld(true);
  const out: Prepared = { zones: {}, water: {}, gauges: {}, whatif: [], upstream: null, flow: [], stats: { merged: 0, groups: 0 } };
  const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  const drop: THREE.Mesh[] = [];
  root.traverse((o) => {
    const name = nodeName(o);
    if (/^pond_(A|B|whatif)_water$/.test(o.name)) {
      out.water[o.name] = o; out.gauges[o.name] = [o.userData.gauge_z_empty, o.userData.gauge_z_full];
    }
    if (o.name === "pond_whatif" || o.name === "pond_whatif_water") out.whatif.push(o);
    if (!(o as THREE.Mesh).isMesh) return;
    const m = o as THREE.Mesh;
    if (/^zone_Z\d\d$/.test(name)) {
      const mat = new THREE.MeshBasicMaterial({ color: BAND_COLOR.base, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
      m.material = mat; m.renderOrder = 2; out.zones[name.slice(5)] = { mesh: m, mat };
      return;
    }
    if (name === "rr_upstream_change") { out.upstream = m; m.raycast = () => {}; return; }
    if (name === "rr_flow_arrows" || name === "rr_flow_arrows_cross") {
      const mat = flowMaterial(name.endsWith("cross") ? "#fff3cf" : "#e9f6ff", name.endsWith("cross") ? 1.1 : 0.9);
      m.material = mat; m.renderOrder = 3; m.raycast = () => {}; out.flow.push(mat);
      return;
    }
    if (DYNAMIC.test(name)) return;             // ponds, pond water, what-if pond, tree prototype: kept as they are
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
  for (const { mat, geos } of groups.values()) {
    const g = mergeGeometries(geos, false);
    if (!g) continue;
    const mesh = new THREE.Mesh(g, mat);
    mesh.raycast = () => {};
    mesh.matrixAutoUpdate = false;
    merged.add(mesh);
    out.stats.groups++; out.stats.merged += geos.length;
  }
  root.add(merged);
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
      inst.raycast = () => {};
      root.add(inst);
    }
  }
  root.userData.__prepared = out;
  return out;
}

const lerp = THREE.MathUtils.lerp;

export function Township(props: {
  results: any; scenario: ScenarioId; storm: number; trees: [number, number, number, number, string][];
  pick: Pick; onPick: (p: Pick) => void; onReady: (info: string) => void;
}) {
  const { scene } = useGLTF("./data/township.glb", "./draco/");
  const prep = useMemo(() => prepare(scene, props.trees), [scene, props.trees]);
  const { gl } = useThree();
  const target = useRef({ zones: {} as Record<string, { c: THREE.Color; o: number }>, water: {} as Record<string, number>, up: 0, pond: 0, flow: 0 });
  useEffect(() => props.onReady(`${prep.stats.merged} static meshes merged into ${prep.stats.groups} draw groups`), [prep]);

  // targets from the results, the scenario and the storm (0 clear day ... 1 design storm)
  const sc = props.results.scenarios[props.scenario];
  useEffect(() => {
    const t = target.current;
    for (const [id, z] of Object.entries<any>(sc.zones)) {
      const look = zoneLook(z, props.scenario);
      const on = props.storm > 0.5;
      const sel = props.pick?.kind === "zone" && props.pick.id === id;
      t.zones[id] = { c: new THREE.Color(on ? BAND_COLOR[look.band] : BAND_COLOR.base),
                      o: (on && look.band !== "base" ? 0.5 : 0.2) + (sel ? 0.18 : 0) };
    }
    for (const pid of ["pond_A", "pond_B"]) t.water[`${pid}_water`] = props.storm > 0.5 ? sc.ponds[pid].gauge : DRY;
    const w = sc.what_if_pond;
    t.water.pond_whatif_water = props.storm > 0.5 && w ? Math.min(1, w.ratio ?? 1) : 0;
    t.up = props.scenario === "now" ? 0 : 1;
    t.pond = props.scenario === "upstream_plus_pond" ? 1 : 0;
    t.flow = props.storm;
  }, [sc, props.scenario, props.storm, props.pick]);

  const pondScale = useRef(0);
  useFrame((state, dt) => {
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
    pondScale.current = lerp(pondScale.current, t.pond, k);
    const bank = prep.whatif.find((o) => o.name === "pond_whatif");
    if (bank) { bank.visible = pondScale.current > 0.02; bank.scale.set(pondScale.current, 1, pondScale.current); }
    for (const m of prep.flow) {
      m.uniforms.uTime.value = state.clock.elapsedTime * 0.8;
      m.uniforms.uOpacity.value = lerp(m.uniforms.uOpacity.value, 0.15 + 0.75 * t.flow, k);
    }
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const n = nodeName(e.object);
    if (/^zone_Z\d\d$/.test(n)) props.onPick({ kind: "zone", id: n.slice(5) });
    else if (/^pond_(A|B)/.test(n)) props.onPick({ kind: "pond", id: n.startsWith("pond_A") ? "pond_A" : "pond_B" });
    else if (n.startsWith("pond_whatif")) props.onPick({ kind: "pond", id: "pond_whatif" });
  };
  return (
    <primitive object={scene} onClick={onClick} onPointerMissed={() => props.onPick(null)}
      onPointerOver={() => (gl.domElement.style.cursor = "pointer")} onPointerOut={() => (gl.domElement.style.cursor = "")} />
  );
}
