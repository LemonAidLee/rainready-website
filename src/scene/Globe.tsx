// The landing map: a night globe framed on Malaysia (WEBSITE.md section 8). Land and sea are painted into an
// equirectangular canvas texture; borders, Malaysia's states, official flood records, example resident reports and
// the one catchment model (Bandar Bukit Raja) are drawn on top. Zooming into Bandar Bukit Raja flies down to it and
// hands over to the planner view, which sits on the same coordinates.
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

export type LonLat = [number, number];
export interface National {
  countries: { n: string; my: boolean; r: number[][] }[];
  labels: { n: string; c: LonLat }[];
  states: { n: string; r: number[][]; c: LonLat }[];
  flood: { c: LonLat; y: number; p: string; d: string | null; t: string | null }[];   // JPS Selangor, point-level
  flash: { c: LonLat; s: string; t: string; n: number; e: string[] }[];               // JPS 2017, town-level, all states
  major: { c: LonLat; y: number; m: string; cause: string | null; days: number }[];     // DFO, centre of the region
}
export type MapLayers = { flood: boolean; flash: boolean; major: boolean; reports: boolean; states: boolean };
export interface Report { id: string; lat: number; lon: number; type: string; status: string; note: string; example: boolean }
export type Hover = { x: number; y: number; title: string; lines: string[]; example?: boolean } | null;

export const BBR: LonLat = [101.436, 3.09];                  // the planner model's origin (TOWNSHIP_3D_AND_SIMULATOR.md)
const MALAYSIA: LonLat = [109.4, 4.1];                       // framing centre: the peninsula and Borneo together
export const FLIGHT_MS = 2400;                              // the fly-in
const HOME_DIST = 2.45;                                      // camera distance from the centre (globe radius 1)

/** lon/lat (degrees) to a point on the unit sphere, matching SphereGeometry's equirectangular UVs. */
export function toXYZ([lon, lat]: LonLat, r = 1): THREE.Vector3 {
  const a = THREE.MathUtils.degToRad(lon), b = THREE.MathUtils.degToRad(lat);
  return new THREE.Vector3(r * Math.cos(b) * Math.cos(a), r * Math.sin(b), -r * Math.cos(b) * Math.sin(a));
}

function landTexture(d: National) {
  const W = 4096, H = 2048, cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#17293a"; g.fillRect(0, 0, W, H);                              // sea
  const X = (lon: number) => ((lon + 180) / 360) * W, Y = (lat: number) => ((90 - lat) / 180) * H;
  for (const c of d.countries) {
    g.fillStyle = c.my ? "#0b1219" : "#030507";
    for (const r of c.r) {
      g.beginPath();
      for (let i = 0; i < r.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, X(r[i]), Y(r[i + 1]));
      g.closePath(); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function lineGeometry(ringsList: number[][][], r: number) {
  const pos: number[] = [];
  for (const rings of ringsList) for (const ring of rings) for (let i = 2; i < ring.length; i += 2) {
    if (Math.abs(ring[i] - ring[i - 2]) > 90) continue;      // never draw across the antimeridian
    pos.push(...toXYZ([ring[i - 2], ring[i - 1]], r).toArray(), ...toXYZ([ring[i], ring[i + 1]], r).toArray());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

function graticule() {
  const rings: number[][] = [];
  for (let lat = -80; lat <= 80; lat += 10) { const r: number[] = []; for (let lon = -180; lon <= 180; lon += 2) r.push(lon, lat); rings.push(r); }
  for (let lon = -180; lon < 180; lon += 10) { const r: number[] = []; for (let lat = -88; lat <= 88; lat += 2) r.push(lon, lat); rings.push(r); }
  return lineGeometry([rings], 1.0004);
}

/**
 * Glowing dots of a fixed screen size that float up off the globe on thin stems: they rise in a staggered wave when
 * the page opens, then bob slowly. aRing draws a ring on the surface instead (major events). Far-side dots are dropped.
 * uLift (world units) follows the camera's altitude, so the stems keep about the same length on screen.
 */
const FLOAT = `attribute vec3 aColor; attribute float aDelay; attribute float aHeight;
  uniform float uTime; uniform float uLift;
  vec3 floatUp(vec3 pos, float top, out float rise, out float facing) {
    rise = smoothstep(aDelay, aDelay + 1.1, uTime);
    vec3 n = normalize(pos);
    vec3 p = pos + n * uLift * aHeight * top * rise * (1.0 + 0.12 * sin(uTime * 1.3 + aDelay * 9.0));
    facing = dot(n, normalize(cameraPosition - (modelMatrix * vec4(p, 1.0)).xyz));
    return p;
  }`;

function dotMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uLift: { value: 0.02 } },
    vertexShader: `${FLOAT} attribute float aSize; attribute float aPulse; attribute float aRing; uniform float uPx;
      varying vec3 vColor; varying float vFacing; varying float vRing; varying float vRise;
      void main(){ float rise, facing; vec3 p = floatUp(position, 1.0, rise, facing);
        vColor = aColor; vRing = aRing; vRise = rise; vFacing = facing;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
        gl_PointSize = aSize * uPx * (0.35 + 0.65 * rise) * (1.0 + aPulse * 0.35 * sin(uTime * 3.0 + aDelay * 20.0)); }`,
    fragmentShader: `varying vec3 vColor; varying float vFacing; varying float vRing; varying float vRise;
      void main(){ if (vFacing < 0.05) discard; float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
        float a = vRing > 0.5 ? smoothstep(0.66, 0.8, d) * (1.0 - smoothstep(0.9, 1.0, d)) * 0.9
                              : smoothstep(0.55, 0.25, d) + pow(1.0 - d, 2.0) * 0.55;
        gl_FragColor = vec4(vColor * a * vRise, a * vRise); }`,
  });
}

function stemMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uLift: { value: 0.02 } },
    vertexShader: `${FLOAT} attribute float aTop; varying vec3 vColor; varying float vA;
      void main(){ float rise, facing; vec3 p = floatUp(position, aTop, rise, facing);
        vColor = aColor; vA = facing < 0.05 ? 0.0 : rise * (0.25 + 0.55 * aTop);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0); }`,
    fragmentShader: `varying vec3 vColor; varying float vA; void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(vColor * vA, vA); }`,
  });
}

type DotItem = { c: LonLat; color: string; size: number; h: number; delay: number; pulse?: boolean; ring?: boolean };

function attrs(g: THREE.BufferGeometry, a: Record<string, [number[], number]>) {
  for (const [k, [v, n]] of Object.entries(a)) g.setAttribute(k, new THREE.Float32BufferAttribute(v, n));
  return g;
}

function dots(items: DotItem[]) {
  const pos: number[] = [], col: number[] = [], size: number[] = [], pulse: number[] = [], ring: number[] = [], h: number[] = [], dl: number[] = [];
  const c = new THREE.Color();
  for (const it of items) {
    pos.push(...toXYZ(it.c, 1.0012).toArray());
    c.set(it.color); col.push(c.r, c.g, c.b);
    size.push(it.size); pulse.push(it.pulse ? 1 : 0); ring.push(it.ring ? 1 : 0); h.push(it.h); dl.push(it.delay);
  }
  return attrs(new THREE.BufferGeometry(), { position: [pos, 3], aColor: [col, 3], aSize: [size, 1], aPulse: [pulse, 1],
                                             aRing: [ring, 1], aHeight: [h, 1], aDelay: [dl, 1] });
}

function stems(items: DotItem[]) {
  const pos: number[] = [], col: number[] = [], top: number[] = [], h: number[] = [], dl: number[] = [];
  const c = new THREE.Color();
  for (const it of items) {
    if (it.h <= 0) continue;
    const v = toXYZ(it.c, 1.0012).toArray();
    c.set(it.color);
    for (const t of [0, 1]) { pos.push(...v); col.push(c.r, c.g, c.b); top.push(t); h.push(it.h); dl.push(it.delay); }
  }
  return attrs(new THREE.BufferGeometry(), { position: [pos, 3], aColor: [col, 3], aTop: [top, 1], aHeight: [h, 1], aDelay: [dl, 1] });
}

const LAYER_KEYS = ["major", "flood", "flash", "reports"] as const;
type LayerKey = (typeof LAYER_KEYS)[number];

/** Stable pseudo-random 0..1 per index, so the wave and the heights stay the same between renders. */
const rnd = (i: number, k = 1) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };

/** An HTML label pinned to the globe that fades out on the far side, and outside its zoom range. */
function Label(p: { at: LonLat; children: ReactNode; className: string; near?: number; far?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const v = useMemo(() => toXYZ(p.at, 1.002), [p.at]);
  const n = useMemo(() => v.clone().normalize(), [v]);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    if (!el.current) return;
    const d = camera.position.length();
    const facing = n.dot(tmp.copy(camera.position).sub(v).normalize());
    const show = facing > 0.2 && d >= (p.near ?? 0) && d <= (p.far ?? 99);
    el.current.style.opacity = show ? "1" : "0";
  });
  return <Html position={v} center zIndexRange={[5, 0]}><div ref={el} className={p.className}>{p.children}</div></Html>;
}

export function Globe(p: {
  data: National; reports: Report[]; layers: MapLayers;
  flying: boolean; onFly: () => void; onEnter: () => void; onHover: (h: Hover) => void; onFar: (far: boolean) => void;
  sites?: { id: string; name: string; centre: [number, number] }[];   // generated sites (2D view), outside the demo
}) {
  const { camera, gl, size } = useThree();
  const controls = useRef<any>(null);
  const tex = useMemo(() => landTexture(p.data), [p.data]);
  const borders = useMemo(() => lineGeometry(p.data.countries.filter((c) => !c.my).map((c) => c.r), 1.0006), [p.data]);
  const myOutline = useMemo(() => lineGeometry(p.data.countries.filter((c) => c.my).map((c) => c.r), 1.0009), [p.data]);
  const states = useMemo(() => lineGeometry(p.data.states.map((s) => s.r), 1.0008), [p.data]);
  const grid = useMemo(() => graticule(), []);
  // one list per layer; heights vary so the cloud reads as depth rather than a flat carpet
  const items = useMemo(() => ({
    major: p.data.major.map((f, i): DotItem => ({ c: f.c, color: "#ffc9b8", size: 17, h: 0, ring: true, delay: 0.2 + 1.2 * rnd(i, 4) })),
    flood: p.data.flood.map((f, i): DotItem => ({ c: f.c, color: "#ff5a36", size: 4.2, h: 0.35 + 0.65 * rnd(i), delay: 0.6 + 2.0 * rnd(i, 2) })),
    flash: p.data.flash.map((f, i): DotItem => ({ c: f.c, color: "#ffa04a", size: 6.5 + Math.min(7, f.n * 0.9), h: 0.5 + Math.min(0.9, f.n * 0.08), delay: 0.4 + 1.8 * rnd(i, 3) })),
    reports: p.reports.map((r, i): DotItem => ({ c: [r.lon, r.lat], color: "#e3b341", size: 9, h: 1.3, pulse: true, delay: 2.4 + 0.2 * i })),
  }), [p.data, p.reports]);
  const geos = useMemo(() => Object.fromEntries(LAYER_KEYS.map((k) => [k, { dots: dots(items[k]), stems: stems(items[k]) }])) as
    Record<LayerKey, { dots: THREE.BufferGeometry; stems: THREE.BufferGeometry }>, [items]);
  const dotMat = useMemo(() => dotMaterial(), []), stemMat = useMemo(() => stemMaterial(), []);
  const bbr = useMemo(() => toXYZ(BBR, 1.0015), []);
  const bbrN = useMemo(() => bbr.clone().normalize(), [bbr]);
  const ring = useRef<THREE.Mesh>(null);
  const atmosphere = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vN; void main(){ float i = pow(0.72 - dot(vN, vec3(0.0, 0.0, 1.0)), 3.0); gl_FragColor = vec4(0.21, 0.62, 0.85, 1.0) * i; }`,
  }), []);

  // opening shot: from far out, swing in to Malaysia
  const intro = useRef(performance.now());
  // phones: frame between the peninsula and Borneo, from further out, so both fit the narrow screen
  const narrow = size.width < 700;
  const home = useMemo(() => (narrow ? toXYZ([106.5, 3.2]).multiplyScalar(3.3) : toXYZ(MALAYSIA).multiplyScalar(HOME_DIST)), [narrow]);
  useEffect(() => { camera.position.copy(toXYZ([MALAYSIA[0] + 40, MALAYSIA[1] + 12]).multiplyScalar(4.2)); camera.lookAt(0, 0, 0); }, [camera]);

  // hover: the nearest dot within a few pixels, front side only
  const screen = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    const el = gl.domElement;
    type Pt = { base: THREE.Vector3; h: number; tip: Omit<NonNullable<Hover>, "x" | "y"> };
    const at = (c: LonLat, it: DotItem, tip: Pt["tip"]): Pt => ({ base: toXYZ(c, 1.0012), h: it.h, tip });
    const pts: Pt[] = [
      ...(p.layers.reports ? p.reports.map((r, i) => at([r.lon, r.lat], items.reports[i],
        { title: `EXAMPLE · ${r.type.replace("_", " ")}`, lines: [r.note, `Status: ${r.status}`], example: true })) : []),
      ...(p.layers.flood ? p.data.flood.map((f, i) => at(f.c, items.flood[i],
        { title: `${f.t ?? "Flood record"} · ${f.y}`, lines: [f.p || "(no place name)", `${f.d ? f.d + " · " : ""}JPS Selangor record`] })) : []),
      ...(p.layers.flash ? p.data.flash.map((f, i) => at(f.c, items.flash[i],
        { title: "Flash-flood locations · JPS 2017", lines: [`${f.t}, ${f.s}: ${f.n} listed location${f.n > 1 ? "s" : ""}`, `e.g. ${f.e.slice(0, 3).join(", ")}`, "Town-level position, approximate"] })) : []),
      ...(p.layers.major ? p.data.major.map((f, i) => at(f.c, items.major[i],
        { title: `Major flood event · ${f.m} ${f.y}`, lines: [`${f.cause ?? "Cause not stated"} · about ${f.days} day${f.days > 1 ? "s" : ""}`, "Centre of the affected region (Dartmouth Flood Observatory)"] })) : []),
    ];
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const lift = stemMat.uniforms.uLift.value;
      let best: Pt | null = null, bd = 9;
      for (const q of pts) {
        if (q.base.dot(camera.position) - 1 < 0) continue;   // far side of the globe
        screen.copy(q.base).multiplyScalar(1 + (lift * q.h) / 1.0012).project(camera);   // where the dot floats
        const sx = (screen.x + 1) / 2 * r.width, sy = (1 - screen.y) / 2 * r.height, dd = Math.hypot(sx - mx, sy - my);
        if (dd < bd) { bd = dd; best = q; }
      }
      p.onHover(best ? { x: e.clientX, y: e.clientY, ...best.tip } : null);
    };
    const leave = () => p.onHover(null);
    el.addEventListener("pointermove", move); el.addEventListener("pointerleave", leave);
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); };
  }, [p.data, p.reports, p.layers, items, camera, gl]);

  const farShown = useRef(false), entered = useRef(false);
  // the fly-in: a fixed 2.4 s flight that turns towards Bandar Bukit Raja while it descends (log of the altitude),
  // so the page fade (Landing, .fly-fade) can be timed to end as it lands
  const flight = useRef<{ t0: number; dir: THREE.Vector3; alt: number } | null>(null);
  const dir = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime, d = camera.position.length(), c = controls.current;
    dotMat.uniforms.uPx.value = Math.min(2, gl.getPixelRatio());
    dotMat.uniforms.uTime.value = stemMat.uniforms.uTime.value = t;
    dotMat.uniforms.uLift.value = stemMat.uniforms.uLift.value = Math.max(0.0004, (d - 1) * 0.03);
    if (ring.current) {                                       // the model's ring keeps a steady size on screen
      const s = Math.max(0.0004, (d - 1) * 0.011) * (1 + 0.18 * Math.sin(t * 2.5));
      ring.current.scale.setScalar(s);
    }
    if (c) c.rotateSpeed = THREE.MathUtils.clamp((d - 1) * 0.1, 0.0015, 0.3);   // ~ the ground follows the cursor
    const k = Math.min(1, dt * 1.6);
    if (p.flying) {                                           // fly down onto Bandar Bukit Raja
      if (c) c.minDistance = 1.0005;
      if (!flight.current) flight.current = { t0: performance.now(), dir: camera.position.clone().normalize(), alt: d - 1 };
      const f = flight.current, u = Math.min(1, (performance.now() - f.t0) / FLIGHT_MS);
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      dir.copy(f.dir).lerp(bbrN, Math.min(1, e * 1.4)).normalize();
      camera.position.copy(dir).multiplyScalar(1 + Math.exp(THREE.MathUtils.lerp(Math.log(f.alt), Math.log(0.0016), e)));
      camera.lookAt(0, 0, 0);
      if (u >= 1 && !entered.current) { entered.current = true; p.onEnter(); }
      return;
    }
    if (performance.now() - intro.current < 2600) { camera.position.lerp(home, k); camera.lookAt(0, 0, 0); return; }
    // zoomed in close: over Bandar Bukit Raja, hand over; anywhere else, say there is no model here yet
    if (d < 1.03) {
      screen.copy(bbr).project(camera);
      const near = Math.hypot(screen.x, screen.y) < 0.45 && bbr.dot(camera.position) > 1;
      if (near && d < 1.012) { p.onFly(); return; }
      if (!near !== farShown.current) { farShown.current = !near; p.onFar(!near); }
    } else if (farShown.current) { farShown.current = false; p.onFar(false); }
  });

  const showStates = p.layers.states;
  return (
    <>
      <mesh><sphereGeometry args={[1, 128, 96]} /><meshBasicMaterial map={tex} /></mesh>
      <mesh scale={1.06} material={atmosphere}><sphereGeometry args={[1, 64, 48]} /></mesh>
      <lineSegments geometry={grid}><lineBasicMaterial color="#1d3346" transparent opacity={0.35} /></lineSegments>
      <lineSegments geometry={borders}><lineBasicMaterial color="#2e5675" transparent opacity={0.7} /></lineSegments>
      {showStates && <lineSegments geometry={states}><lineBasicMaterial color="#3f7da3" transparent opacity={0.55} /></lineSegments>}
      <lineSegments geometry={myOutline}><lineBasicMaterial color="#35d0e6" transparent opacity={0.9} /></lineSegments>
      {LAYER_KEYS.filter((k) => p.layers[k]).map((k) => (
        <group key={k}>
          <lineSegments geometry={geos[k].stems} material={stemMat} />
          <points geometry={geos[k].dots} material={dotMat} />
        </group>
      ))}

      {/* the one catchment model: Bandar Bukit Raja */}
      <mesh ref={ring} position={bbr} onUpdate={(m) => m.lookAt(bbr.clone().multiplyScalar(2))} onClick={p.onFly}>
        <ringGeometry args={[0.75, 1, 48]} /><meshBasicMaterial color="#35d0e6" transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <Label at={BBR} className="globe-model-wrap">
        <button className="globe-model" onClick={p.onFly}>
          <b>BANDAR BUKIT RAJA</b><span>Catchment model · zoom in or click to open</span>
        </button>
      </Label>

      {/* generated sites from the registry (22 Oct 2026): a gold ring and a link to their 2D view */}
      {(p.sites ?? []).map((s) => (
        <group key={s.id}>
          <SiteRing at={[s.centre[1], s.centre[0]]} />
          <Label at={[s.centre[1], s.centre[0]]} className="globe-model-wrap" far={1.25}>
            <a className="globe-site" href={`#/site/${s.id}`}><b>{s.name.toUpperCase()}</b><span>Generated site · click to open</span></a>
          </Label>
        </group>
      ))}

      {p.layers.flood && (
        <Label at={[101.75, 3.55]} className="globe-cluster" near={1.3}>
          <b>{p.data.flood.length.toLocaleString("en-GB")}</b> official flood records · Selangor
        </Label>
      )}
      {p.data.labels.map((l) => <Label key={l.n} at={l.c} className="globe-country" far={3}>{l.n}</Label>)}
      {showStates && p.data.states.map((s) => (
        <Label key={s.n} at={s.c} className={`globe-state ${s.n === "Selangor" ? "sel" : ""}`} far={1.3}>{s.n.toUpperCase()}</Label>
      ))}

      <OrbitControls ref={controls} enabled={!p.flying} enablePan={false} enableDamping dampingFactor={0.08}
        minDistance={1.004} maxDistance={4.5} zoomSpeed={0.9} />
    </>
  );
}

/** A generated site's ring: gold, steady size on screen (the BBR ring is cyan and drives the fly-in). */
function SiteRing({ at }: { at: LonLat }) {
  const pos = useMemo(() => toXYZ(at, 1.0015), [at]);
  const ref = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  useFrame(() => { if (ref.current) ref.current.scale.setScalar(Math.max(0.0004, (camera.position.length() - 1) * 0.008)); });
  return (
    <mesh ref={ref} position={pos} onUpdate={(m) => m.lookAt(pos.clone().multiplyScalar(2))}>
      <ringGeometry args={[0.7, 1, 40]} /><meshBasicMaterial color="#e3b341" transparent opacity={0.85} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}
