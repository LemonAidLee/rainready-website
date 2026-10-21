// Site-only overlays on top of the .glb, each tied to a control so a change is visible in the model:
//  - the council boundary as a tall light curtain with large labels (the .glb's 14 m curtain reads too small)
//  - the shared trunk drain as a ribbon: width follows the drain-size setting, colour its load in the storm
//  - Area A beyond the model edge: a footprint sized by the upstream-area setting, filling with blocks as
//    upstream development rises, with its flow into the council-corner drain
//  - HTML labels (areas, spots, zones, ponds) at a fixed, readable screen size
//  - the guided demo's pointers (ring, beam and callout on the place to look at)
import { useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { BAND_COLOR, changeTag, zoneChange, zoneLook, type Basis, type Controls, type ScenarioId } from "../lib/data";
import { JPS_RECORDS, toModel } from "../lib/evidence";
import { m3 } from "../lib/format";
import type { Anchors, Layers, V3 } from "./Township";

type XY = [number, number];                                  // model metres: x east, y north (Blender)
const gl = (x: number, h: number, y: number) => new THREE.Vector3(x, h, -y);
const TRUNK_CHAIN = ["drain_D29", "drain_D28", "drain_D26", "drain_D27", "drain_D25", "drain_D24", "drain_D09", "drain_D21", "drain_D05"]; // east to west, as plan_zones.py
const CROSSING = "drain_D32";
export const EXT_ORIGIN: XY = [940, 660];                    // south-west corner of the "Area A beyond the edge" footprint (north of Z01)
const AREA_B: XY = [440, -1150];                              // Area B label: south-west edge, clear of pond B's tag
export const VISUAL_DRAIN_K = 2.5;                          // trunk drain ribbon is drawn 2.5x its width so it reads at overview zoom

/** Ground height under (x, y) from the draped zone overlays (they cover the whole model rectangle). */
function groundFn(zones: THREE.Mesh[]) {
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  let last = 5;
  return (x: number, y: number) => {
    ray.set(new THREE.Vector3(x, 600, -y), down);
    const hit = ray.intersectObjects(zones, false)[0];
    if (hit) last = hit.point.y;
    return last;
  };
}

/** Flat ribbon along a polyline, `lift` m above the ground; uv.x = distance / 30 m (for chevrons), uv.y across. */
function ribbon(path: XY[], width: number, lift: number, ground: (x: number, y: number) => number) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let dist = 0;
  for (let i = 0; i < path.length; i++) {
    const [x, y] = path[i];
    const [ax, ay] = path[Math.max(0, i - 1)], [bx, by] = path[Math.min(path.length - 1, i + 1)];
    let nx = -(by - ay), ny = bx - ax; const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
    if (i > 0) dist += Math.hypot(x - path[i - 1][0], y - path[i - 1][1]);
    const h = ground(x, y) + lift;
    pos.push(x + nx * width / 2, h, -(y + ny * width / 2), x - nx * width / 2, h, -(y - ny * width / 2));
    uv.push(dist / 30, 0, dist / 30, 1);
    if (i > 0) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function chevronMaterial(color: string) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0.9 }, uFlow: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uOpacity; uniform float uFlow; varying vec2 vUv;
      void main(){ float a = abs(vUv.y - 0.5);
        float s = fract(vUv.x * 1.2 + a * 1.4 - uTime);
        float chev = smoothstep(0.0, 0.08, s) * (1.0 - smoothstep(0.34, 0.42, s));
        float edge = smoothstep(0.5, 0.40, a);
        float body = 0.42 + 0.58 * chev * uFlow;
        gl_FragColor = vec4(mix(uColor * 0.55, uColor, chev * uFlow), uOpacity * edge * body); }`,
  });
}

function curtainMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; uniform float uOpacity; varying vec2 vUv;
      void main(){ float h = vUv.y;
        float fade = pow(1.0 - h, 1.6);
        float scan = smoothstep(0.0, 0.02, fract(h * 2.0 - uTime * 0.25)) * (1.0 - smoothstep(0.02, 0.06, fract(h * 2.0 - uTime * 0.25)));
        float ticks = step(0.92, fract(vUv.x * 0.5)) * 0.25;
        vec3 c = vec3(0.80, 0.90, 1.0);
        float a = (0.10 + 0.62 * fade + 0.45 * scan * fade + ticks * fade) * uOpacity;
        gl_FragColor = vec4(c * a, a); }`,
  });
}

/** Vertical light curtain along the council line, H m tall. */
function curtain(path: XY[], H: number, ground: (x: number, y: number) => number) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let dist = 0;
  path.forEach(([x, y], i) => {
    if (i > 0) dist += Math.hypot(x - path[i - 1][0], y - path[i - 1][1]);
    const h = ground(x, y);
    pos.push(x, h, -y, x, h + H, -y);
    uv.push(dist / 40, 0, dist / 40, 1);
    if (i > 0) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function chain(drains: Record<string, XY[]>, ids: string[]): XY[] {
  const out: XY[] = [];
  for (const id of ids) {
    let p = drains[id];
    if (!p) continue;
    if (out.length) {
      const e = out[out.length - 1];
      if (Math.hypot(e[0] - p[0][0], e[1] - p[0][1]) > Math.hypot(e[0] - p[p.length - 1][0], e[1] - p[p.length - 1][1])) p = [...p].reverse();
    }
    out.push(...p);
  }
  return out;
}

// What residents said about each street (Sinar Harian, 25 May 2024): only Jalan Makyong is reported as flooding
const SPOT_NOTE: Record<number, string> = { 1: "Residents report flooding", 2: "Residents ask for a retention pond", 3: "Residents ask for bigger drains" };
// where each spot's stem meets its box, and extra stem length: the three spots are close on screen, so their boxes
// lean apart (Spot 1 west, Spot 3 east and higher, clear of Spot 2)
const SPOT_AX: Record<number, string> = { 1: "78%", 2: "50%", 3: "22%" };
const SPOT_LIFT: Record<number, string> = { 1: "0px", 2: "0px", 3: "26px" };
const loadColor = (r: number) => (r >= 1 ? BAND_COLOR.high : r >= 0.8 ? BAND_COLOR.medium : "#35d0e6");

// ---------------------------------------------------------------------------------------------------------------

export function Overlays(p: {
  anchors: Anchors; council: XY[][]; results: any; scenario: ScenarioId; basis: Basis; controls: Controls; storm: number;
  layers: Layers; pickZone: (id: string) => void;
  reports?: { id: string; issue: string; status: string; label: string; lat: number; lon: number; sample: boolean }[];
}) {
  const ground = useMemo(() => groundFn(p.anchors.zones), [p.anchors]);
  // level of detail: at overview zoom only areas, spots and ponds are labelled; zones, drain and council tags join
  // once the view is zoomed in, so labels never pile up
  const { camera, size } = useThree();
  const [detail, setDetail] = useState(false);
  const baseZoom = size.width < 860 ? size.width / 3000 : Math.min((size.width - 760) / 3250, (size.height - 110) / 2050);   // as App's Camera fit
  const sc = p.results.scenarios[p.scenario];

  // ---- council boundary
  const council = useMemo(() => {
    const mat = curtainMaterial();
    const line = new THREE.MeshBasicMaterial({ color: "#e8f4ff", transparent: true, opacity: 0.9, depthWrite: false });
    return { mat, line, curtains: p.council.map((c) => curtain(c, 130, ground)), bands: p.council.map((c) => ribbon(c, 12, 1.4, ground)) };
  }, [p.council, ground]);

  // ---- trunk drain and the crossing drain
  const trunkPath = useMemo(() => chain(p.anchors.drains as any, TRUNK_CHAIN), [p.anchors]);
  const crossPath = useMemo(() => (p.anchors.drains[CROSSING] ?? []) as XY[], [p.anchors]);
  const trunkW = p.controls.drainTopWidth * VISUAL_DRAIN_K;
  const trunkGeo = useMemo(() => ribbon(trunkPath, trunkW, 2.2, ground), [trunkPath, trunkW, ground]);
  const crossGeo = useMemo(() => ribbon(crossPath, 12, 2.4, ground), [crossPath, ground]);
  const trunkMat = useMemo(() => chevronMaterial("#35d0e6"), []);
  const crossMat = useMemo(() => chevronMaterial("#ffd27a"), []);
  const ratio = sc.trunk_drain.ratio as number;
  const trunkMid = trunkPath[Math.floor(trunkPath.length * 0.22)] ?? [0, 300];

  // ---- Area A beyond the model edge
  const side = Math.sqrt(Math.max(1, p.controls.extArea) * 1e4);
  const [ox, oy] = EXT_ORIGIN;
  const baseH = useMemo(() => ground(1300, 590) - 0.5, [ground]);
  const ext = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); g.translate(0.5, 0, -0.5);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uSize: { value: 700 } },
      vertexShader: `varying vec2 vP; uniform float uSize; void main(){ vP = position.xz * uSize; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vP; uniform float uSize;
        void main(){ vec2 g = abs(fract(vP / 50.0 - 0.5) - 0.5) * 50.0; float line = 1.0 - smoothstep(0.0, 1.6, min(g.x, g.y));
          vec2 e = min(abs(vP), abs(vec2(uSize, -uSize) - vP)); float edge = 1.0 - smoothstep(0.0, 6.0, min(e.x, e.y));
          vec3 c = mix(vec3(0.08, 0.12, 0.16), vec3(0.45, 0.85, 1.0), max(line * 0.35, edge));
          gl_FragColor = vec4(c, 0.55 + 0.4 * max(line * 0.5, edge)); }`,
    });
    return { g, mat };
  }, []);
  const N = 22;                                               // block grid per side (scaled with the footprint)
  const blocks = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: "#d9dde2", roughness: 0.9 }), N * N);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.raycast = () => {};
    // fill order: a fixed shuffle, so raising development adds blocks without moving the ones already shown
    const order = [...Array(N * N).keys()].map((i) => [i, Math.sin(i * 12.9898) * 43758.5453 % 1] as const).sort((a, b) => a[1] - b[1]).map(([i]) => i);
    const hgt = [...Array(N * N).keys()].map((i) => 7 + (Math.abs(Math.sin(i * 7.31)) * 9));
    return { mesh, order, hgt };
  }, []);
  const extShown = useRef(0);
  const extFlowGeo = useMemo(() => {
    // into the model across its north edge, then south through Area A to the drain along the council line
    const end = crossPath.length ? crossPath[0] : ([1188, 325] as XY);
    const sx = ox + Math.min(side / 2, 260);
    return ribbon([[sx, oy + Math.min(side / 2, 200)], [sx, oy], [sx, 600], [end[0], 420], end], 14, 2.6, ground);
  }, [ox, oy, side, crossPath, ground]);
  const extFlowMat = useMemo(() => chevronMaterial("#ffd27a"), []);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime, k = Math.min(1, dt * 3);
    const d = (camera as THREE.OrthographicCamera).zoom > baseZoom * 1.45;
    if (d !== detail) setDetail(d);
    council.mat.uniforms.uTime.value = t;
    council.mat.uniforms.uOpacity.value = THREE.MathUtils.lerp(council.mat.uniforms.uOpacity.value, p.layers.boundary ? 1 : 0, k);
    const storming = p.storm > 0.5;
    trunkMat.uniforms.uTime.value = t * (0.4 + 0.9 * Math.min(1.4, ratio));
    trunkMat.uniforms.uColor.value.lerp(new THREE.Color(storming ? loadColor(ratio) : "#35d0e6"), k);
    trunkMat.uniforms.uFlow.value = storming ? 1 : 0.25;
    trunkMat.uniforms.uOpacity.value = storming && ratio >= 1 ? 0.75 + 0.2 * Math.sin(t * 4) : 0.85;
    crossMat.uniforms.uTime.value = t * 0.8; crossMat.uniforms.uFlow.value = storming ? 1 : 0.25;
    extFlowMat.uniforms.uTime.value = t * 0.8; extFlowMat.uniforms.uFlow.value = storming ? 1 : 0.3;
    extFlowMat.uniforms.uOpacity.value = p.layers.upstream ? 0.85 : 0;
    // upstream blocks: count follows development, footprint follows the area
    extShown.current = THREE.MathUtils.lerp(extShown.current, p.controls.dev, k);
    const n = Math.round(extShown.current * N * N), cell = side / N, m = new THREE.Matrix4();
    for (let j = 0; j < N * N; j++) {
      const i = blocks.order[j], gx = i % N, gy = Math.floor(i / N);
      const on = j < n && p.layers.upstream;
      m.makeScale(on ? cell * 0.62 : 0, on ? blocks.hgt[i] : 0, on ? cell * 0.62 : 0)
        .setPosition(ox + (gx + 0.5) * cell, baseH, -(oy + (gy + 0.5) * cell));
      blocks.mesh.setMatrixAt(i, m);
    }
    blocks.mesh.instanceMatrix.needsUpdate = true;
    ext.mat.uniforms.uSize.value = side;
  });

  const L = p.anchors.labels;
  const pos = (k: string, dy = 0): V3 | null => (L[k] ? [L[k][0], L[k][1] + dy, L[k][2]] : null);
  const extCentre: V3 = [ox + side / 2, baseH + 30, -(oy + side / 2)];
  const bandOf = (id: string) => zoneLook(sc.zones[id], p.scenario, sc, p.basis).band;
  const ponds = sc.ponds;
  // labels never swallow clicks (their wrappers overlap zone tags); clickable tags opt back in (.tag-zone)
  const html = { zIndexRange: [4, 2] as [number, number], center: true, wrapperClass: "html-pass" };

  return (
    <group>
      {/* council boundary */}
      {council.curtains.map((g, i) => <mesh key={`c${i}`} geometry={g} material={council.mat} renderOrder={6} />)}
      {p.layers.boundary && council.bands.map((g, i) => <mesh key={`b${i}`} geometry={g} material={council.line} renderOrder={5} />)}

      {/* shared trunk drain and the council-line crossing */}
      <mesh geometry={trunkGeo} material={trunkMat} renderOrder={7} />
      <mesh geometry={crossGeo} material={crossMat} renderOrder={7} />

      {/* Area A beyond the model edge */}
      {p.layers.upstream && (
        <mesh geometry={ext.g} material={ext.mat} position={[ox, baseH, -oy]} scale={[side, 1, side]} renderOrder={1} />
      )}
      <primitive object={blocks.mesh} />
      <mesh geometry={extFlowGeo} material={extFlowMat} renderOrder={7} />

      {/* labels */}
      {p.layers.labels && <>
        {pos("label_area_A", 40) && <Html position={pos("label_area_A", 40)!} {...html}>
          <div className="tag tag-area lean-west"><b>AREA A</b><span>Shah Alam side · upstream</span></div></Html>}
        {/* the .glb's Area B tag sits on Spot 2; Area B is most of the model, so its label goes at the model's
            south-west edge, clear of the pond B tag */}
        {<Html position={gl(AREA_B[0], ground(...AREA_B) + 40, AREA_B[1]).toArray()} {...html}>
          <div className="tag tag-area"><b>AREA B</b><span>Klang side · downstream</span></div></Html>}
        {p.layers.upstream && <Html position={extCentre} {...html}>
          <div className="tag tag-ext lean-west"><b>AREA A · BEYOND MODEL EDGE</b>
            <span>{Math.round(p.controls.extArea)} ha (assumed) · {Math.round(p.controls.dev * 100)} % built out</span></div></Html>}
        {[1, 2, 3].map((i) => pos(`label_spot_${i}`, 20) && (
          <Html key={i} position={pos(`label_spot_${i}`, 20)!} {...html}>
            <div className={`tag tag-spot ${i === 1 ? "" : "req"}`} style={{ ["--ax" as any]: SPOT_AX[i], ["--lift" as any]: SPOT_LIFT[i] }}><i />
              <b>SPOT {i}</b><span>{SPOT_NOTE[i]}</span></div></Html>
        ))}
        {/* official flood records (JPS Selangor GIS) at their recorded positions: the screening's check on the ground */}
        {JPS_RECORDS.map((r) => {
          const [x, y] = toModel(r.lat, r.lon);
          return (
            <Html key={r.name} position={gl(x, ground(x, y) + 14, y).toArray()} {...html}>
              <div className="tag tag-record" title={`${r.kind} recorded by JPS Selangor: ${r.name}`}>
                <i /><b>JPS RECORD</b><span>{r.kind} · {r.years}</span></div></Html>
          );
        })}
        {/* resident reports from the resident door (resident/store.ts), at their pin; a tap opens the report there */}
        {p.layers.reports && (p.reports ?? []).map((r) => {
          const [x, y] = toModel(r.lat, r.lon);
          if (x < -1222 || x > 1700 || y < -830 || y > 608) return null;
          return (
            <Html key={r.id} position={gl(x, ground(x, y) + 12, y).toArray()} center zIndexRange={[3, 1]} wrapperClass="html-pass">
              <button className={`tag tag-report st-${r.status}`} title={`${r.issue} · ${r.label}${r.sample ? " · demo sample" : ""}. Open the report`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); location.hash = `#/resident?report=${encodeURIComponent(r.id)}`; }}>
                <i /><b>{r.sample ? "SAMPLE REPORT" : "REPORT"}</b><span>{r.issue}</span></button></Html>
          );
        })}
        {/* zone tags stop their clicks: the canvas would read them as a click on empty ground and clear the pick */}
        {(detail || p.storm > 0.5) && Object.keys(sc.zones).map((id) => pos(`label_zone_${id}`) && (
          <Html key={id} position={pos(`label_zone_${id}`)!} center zIndexRange={[1, 0]} wrapperClass="html-pass">
            <button className="tag tag-zone" style={{ ["--b" as any]: BAND_COLOR[p.storm > 0.5 ? bandOf(id) : "base"] }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); p.pickZone(id); }}>{id}{(() => { const c = changeTag(zoneChange(sc.zones[id], sc)); return c && <em>{c}</em>; })()}</button></Html>
        ))}
        {(["pond_A", "pond_B"] as const).map((id) => p.anchors.ponds[id] && (
          <Html key={id} position={[p.anchors.ponds[id][0], p.anchors.ponds[id][1] + 26, p.anchors.ponds[id][2]]} {...html}>
            <div className="tag tag-pond"><b>POND {id.slice(-1)}</b>
              <span>{p.storm > 0.5 ? `${m3(ponds[id].storage_required_m3)} needed` : "Retention pond (mapped)"}</span></div></Html>
        ))}
        {p.controls.pond && p.anchors.ponds.pond_whatif && (
          <Html position={[p.anchors.ponds.pond_whatif[0], p.anchors.ponds.pond_whatif[1] + 30, p.anchors.ponds.pond_whatif[2]]} {...html}>
            <div className="tag tag-pond whatif"><b>NEW POND</b><span>{m3(p.controls.pondSize)} · what-if</span></div></Html>
        )}
        {detail && <Html position={gl(trunkMid[0], ground(trunkMid[0], trunkMid[1]) + 18, trunkMid[1]).toArray()} {...html}>
          <div className="tag tag-drain" style={{ ["--b" as any]: p.storm > 0.5 ? loadColor(ratio) : "#35d0e6" }}>
            <b>SHARED TRUNK DRAIN</b><span>{p.controls.drainTopWidth} m wide · {p.storm > 0.5 ? `${Math.round(ratio * 100)} % of capacity` : "assumed section"}</span></div></Html>}
        {p.layers.boundary && detail && <>
          <Html position={gl(1500, ground(1500, 200) + 40, 170).toArray()} {...html}>
            <div className="tag tag-council">KLANG <small>council side</small></div></Html>
          <Html position={gl(1560, ground(1560, 340) + 50, 395).toArray()} {...html}>
            <div className="tag tag-council">SHAH ALAM <small>council side</small></div></Html>
        </>}
      </>}
    </group>
  );
}

// ---- guided demo pointers -------------------------------------------------------------------------------------

export type PointAt = { at: V3 | string; label: string };      // a glTF point, or an anchor key (label_spot_1, pond_A, ...)

export function resolvePoint(a: Anchors, at: V3 | string): V3 | null {
  if (typeof at !== "string") return at;
  if (a.labels[at]) return [a.labels[at][0], a.labels[at][1] - 25, a.labels[at][2]];
  if (a.ponds[at]) return a.ponds[at];
  return null;
}

export function Pointers({ items, anchors }: { items: PointAt[]; anchors: Anchors }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      void main(){ float r = length(vUv - 0.5) * 2.0;
        float ring = smoothstep(0.08, 0.0, abs(r - 0.92)) + smoothstep(0.06, 0.0, abs(r - fract(uTime * 0.6)));
        float dot = smoothstep(0.16, 0.10, r);
        float a = clamp(ring * (1.0 - r * 0.3) + dot, 0.0, 1.0); if (a < 0.02) discard;
        gl_FragColor = vec4(1.0, 0.82, 0.36, a); }`,
  }), []);
  const beam = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffd27a", transparent: true, opacity: 0.55, depthTest: false }), []);
  useFrame((s) => { mat.uniforms.uTime.value = s.clock.elapsedTime; });
  return (
    <>
      {items.map((it, i) => {
        const p = resolvePoint(anchors, it.at);
        if (!p) return null;
        return (
          <group key={i} position={p}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} material={mat} renderOrder={20} position={[0, 2, 0]}>
              <planeGeometry args={[110, 110]} />
            </mesh>
            <mesh material={beam} renderOrder={20} position={[0, 60, 0]}>
              <cylinderGeometry args={[1.2, 1.2, 120, 6]} />
            </mesh>
            <Html position={[0, 125, 0]} center zIndexRange={[9, 5]}>
              <div className="pointer-callout"><span>{String(i + 1).padStart(2, "0")}</span>{it.label}</div>
            </Html>
          </group>
        );
      })}
    </>
  );
}
