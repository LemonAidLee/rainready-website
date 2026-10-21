import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import * as THREE from "three";
import { CloudRain, Crosshair, Sun } from "lucide-react";
import { adjustedInputs, changedInputs, loadAll, results as computeResults, scenarioName, scenarioOf, sourcedControls,
         type Basis, type Controls, type Loaded } from "./lib/data";
import { Township, type Anchors, type Layers, type Pick, type V3 } from "./scene/Township";
import { EXT_ORIGIN, Overlays, Pointers, type PointAt } from "./scene/Overlays";
import { Rain } from "./scene/Rain";
import { WaterBackdrop } from "./scene/WaterBackdrop";
import { About, Card, Legend, Results } from "./ui/Planner";
import { ControlPanel } from "./ui/Controls";
import { Footer, LayersPanel, Rail, StatusBar, Ticker, type Panel } from "./ui/Shell";
import { Brief } from "./ui/Brief";
import { Landing } from "./ui/Landing";
import { Resident } from "./ui/Resident";
import { DemoBar, Spotlight, STEPS, type Focus } from "./ui/Demo";

const TARGET: [number, number, number] = [239, 0, 105];      // model centre in glTF coordinates (x, up, -y)
const ISO = [0.62, 0.95, 1.0];                               // isometric-style view from the south-south-east
const TOP = [0.0, 1.0, 0.03];
type View = "iso" | "top";

function Camera({ focus, view, nonce, inset }: { focus: Focus | null; view: View; nonce: number; inset: [number, number] }) {
  const { size, camera } = useThree();
  const controls = useRef<any>(null);
  // fit the model in the space left free by the side panels, and centre the view there
  const free = size.width - inset[0] - inset[1];
  // 3250: the model plus its east-edge extras (Area A beyond the edge, its tags) clear both panels
  const zoom = size.width < 860 ? size.width / 3000 : Math.min(free / 3250, (size.height - 110) / 2050);
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    if (size.width < 860) cam.setViewOffset(size.width, size.height, 0, -Math.min(170, size.height * 0.2), size.width, size.height);
    else cam.setViewOffset(size.width, size.height, -(inset[0] - inset[1]) / 2, 0, size.width, size.height);
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height, inset[0], inset[1]]);
  const d = 4000;
  const dirOf = (v: number[]) => { const n = Math.hypot(v[0], v[1], v[2]); return new THREE.Vector3(v[0] / n, v[1] / n, v[2] / n); };
  const dir = useMemo(() => dirOf(view === "top" ? TOP : ISO), [view]);
  const want = useMemo(() => new THREE.Vector3(), []);
  const glideUntil = useRef(0);
  useEffect(() => { glideUntil.current = performance.now() + 1600; }, [nonce, view]);
  // guided demo, view switch or reset: glide to the focus (target and zoom) along the view direction
  useFrame((_, dt) => {
    const c = controls.current;
    if (!c || (!focus && performance.now() > glideUntil.current)) return;
    const f = focus ?? { t: TARGET, k: 1 };
    const k = Math.min(1, dt * 2.2);
    c.target.lerp(want.set(...f.t), k);
    camera.position.lerp(want.copy(c.target).addScaledVector(dir, d), k);
    const cam = camera as THREE.OrthographicCamera;
    cam.zoom = THREE.MathUtils.lerp(cam.zoom, zoom * f.k, k);
    cam.updateProjectionMatrix();
    c.update();
  });
  return (
    <>
      <OrthographicCamera makeDefault zoom={zoom} near={10} far={20000}
        position={[TARGET[0] + dir.x * d, TARGET[1] + dir.y * d, TARGET[2] + dir.z * d]} />
      <OrbitControls ref={controls} target={TARGET} enableDamping dampingFactor={0.08} minZoom={zoom * 0.5} maxZoom={zoom * 14}
        minPolarAngle={0.02} maxPolarAngle={1.25} screenSpacePanning={false} enabled={!focus} />
    </>
  );
}

/** Key light with shadows over the whole model (the shadow camera's projection must be rebuilt after its bounds change). */
function KeyLight() {
  const ref = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const l = ref.current;
    if (!l) return;
    const c = l.shadow.camera;
    c.left = -2300; c.right = 2300; c.top = 1700; c.bottom = -1700; c.near = 100; c.far = 6000;
    c.updateProjectionMatrix();
    l.target.position.set(...TARGET); l.target.updateMatrixWorld();
    l.shadow.mapSize.set(4096, 4096); l.shadow.bias = -0.0003; l.shadow.normalBias = 1.2;
  }, []);
  return <directionalLight ref={ref} position={[TARGET[0] - 1500, 850, TARGET[2] + 700]} intensity={2.8} color="#fff0dc" castShadow />;
}

function useRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const f = () => setHash(location.hash);
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  return hash.replace(/^#\/?/, "").split("?")[0];
}

/** Model positions the pointers can name: the council-line crossing, the trunk drain, Area A beyond the edge. */
function extraPoints(a: Anchors | null, c: Controls): Record<string, V3> {
  const side = Math.sqrt(Math.max(1, c.extArea) * 1e4);
  const out: Record<string, V3> = { crossing: [926, 7, -325], ext: [EXT_ORIGIN[0] + side / 2, 6, -(EXT_ORIGIN[1] + side / 2)] };
  const d = a?.drains.drain_D09 ?? a?.drains.drain_D21;
  if (d) { const [x, y] = d[Math.floor(d.length / 2)]; out.trunk = [x, 7, -y]; }
  return out;
}

const LAYERS: Layers = { zones: true, labels: true, flow: true, boundary: true, trees: true, upstream: true };

export default function App() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [controls, setControls] = useState<Controls | null>(null);
  const [preset, setPreset] = useState<string | null>("today");
  const [storm, setStorm] = useState(0);
  const [basis, setBasis] = useState<Basis>("capacity");     // what the zone colours measure (data.ts)
  const [pick, setPick] = useState<Pick>(null);
  const [panel, setPanel] = useState<Panel>(innerWidth > 900 ? "controls" : null);
  const [layers, setLayers] = useState<Layers>(LAYERS);
  const [about, setAbout] = useState(false);
  const [anchors, setAnchors] = useState<Anchors | null>(null);
  const [hover, setHover] = useState<{ zone: string | null; p: V3 } | null>(null);
  const [flash, setFlash] = useState<PointAt[]>([]);
  const [view, setView] = useState<View>("iso");
  const [nonce, setNonce] = useState(0);
  const [demo, setDemo] = useState<number | null>(null);     // guided demo step, or null
  const [playing, setPlaying] = useState(false);
  const [clean, setClean] = useState(false);
  const route = useRoute();
  useEffect(() => { loadAll().then((d) => { setData(d); setControls(sourcedControls(d.inputs)); }).catch((e) => setError(String(e))); }, []);
  const ready = anchors !== null;
  // the planner opens behind a curtain while the first frames compile every shader (Township onShown), then the
  // township grows outwards (REVEAL in Township); labels, the camera glide and the storm follow in that order
  const [shown, setShown] = useState(false);
  const [labelsOn, setLabelsOn] = useState(false);
  useEffect(() => { if (route === "" || route === "brief" || route === "resident") { setShown(false); setLabelsOn(false); } }, [route]);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setLabelsOn(true), 1000);
    return () => clearTimeout(t);
  }, [shown]);
  useEffect(() => {          // #/demo starts the guided demo once the model is in
    if (ready && demo === null && route === "demo") { setDemo(0); setPlaying(location.hash.includes("play")); setClean(location.hash.includes("clean")); }
  }, [ready]);
  useEffect(() => {          // after the reveal, the storm starts (outside the demo, which sets its own)
    if (!shown || demo !== null) return;
    const t = setTimeout(() => setStorm(1), 2000);
    return () => clearTimeout(t);
  }, [shown]);
  useEffect(() => {          // #/demo opened while the page is already loaded
    if (ready && demo === null && route === "demo") { setDemo(0); setPlaying(location.hash.includes("play")); setClean(location.hash.includes("clean")); }
  }, [route]);
  const res = useMemo(() => (data && controls ? computeResults(data, controls) : null), [data, controls]);
  useEffect(() => {          // the landing map: forget the last model's anchors; arriving from it, start top-down
    if (route === "") { setAnchors(null); return; }
    if (route === "planner" && location.hash.includes("from=map")) setView("top");
  }, [route]);
  useEffect(() => {          // ... then, as the reveal finishes, glide into the 3D view
    if (!shown || route !== "planner" || !location.hash.includes("from=map")) return;
    const t = setTimeout(() => { setView("iso"); history.replaceState(null, "", "#/planner"); }, 1500);
    return () => clearTimeout(t);
  }, [shown, route]);

  // a change to a lever briefly points at the part of the model it moves
  const prev = useRef<Controls | null>(null);
  useEffect(() => {
    const a = prev.current; prev.current = controls;
    if (!a || !controls || demo !== null) return;
    const ch = (k: keyof Controls) => a[k] !== controls[k];
    const pts: PointAt[] = [];
    if (ch("dev") || ch("extArea") || ch("extC")) pts.push({ at: "label_area_A", label: "Upstream development" }, { at: "ext", label: "Area A beyond the edge" });
    if (ch("pond") || ch("pondSize")) pts.push({ at: "pond_whatif", label: "What-if pond" });
    if (ch("drainTopWidth")) pts.push({ at: "trunk", label: "Shared trunk drain" });
    if (ch("capA") || ch("capB")) pts.push({ at: "pond_A", label: "Pond A" }, { at: "pond_B", label: "Pond B" });
    if (!pts.length) return;
    setFlash(pts);
    const t = setTimeout(() => setFlash([]), 2600);
    return () => clearTimeout(t);
  }, [controls]);

  // ---- guided demo: each step sets the app's state
  const go = useCallback((i: number) => setDemo(Math.max(0, Math.min(STEPS.length - 1, i))), []);
  const exit = useCallback(() => {
    setDemo(null); setPlaying(false); setClean(false); setPick(null); setBasis("capacity");
    if (data) setControls(sourcedControls(data.inputs));
    setPreset("today"); setNonce((n) => n + 1); setPanel(innerWidth > 900 ? "controls" : null);
    location.hash = "#/planner";
  }, [data]);
  useEffect(() => {
    if (demo === null || !data) return;
    const s = STEPS[demo];
    setControls({ ...sourcedControls(data.inputs), ...(s.controls ?? {}) });
    setStorm(s.storm); setBasis(s.basis ?? "capacity"); setPick(s.pick ?? null); setPanel(s.panel ?? null); setAbout(false); setPreset(null);
    const h = s.route ? `#/${s.route}` : "#/demo";
    if (location.hash.split("?")[0] !== h) history.replaceState(null, "", h + (location.hash.includes("?") ? "?" + location.hash.split("?")[1] : ""));
    dispatchEvent(new HashChangeEvent("hashchange"));
    scrollTo({ top: 0 });
    if (s.route === "brief") {     // on the Brief, glide down to the storage table while the caption is read
      const t = setTimeout(() => scrollTo({ top: 300, behavior: "smooth" }), 3500);
      return () => clearTimeout(t);
    }
  }, [demo]);
  useEffect(() => {          // autoplay: advance after the step's time; stop at the last step
    if (demo === null || !playing) return;
    if (demo === STEPS.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => go(demo + 1), STEPS[demo].ms);
    return () => clearTimeout(t);
  }, [demo, playing]);
  useEffect(() => {          // keys: → / Space next, ← back, P play/pause, H clean frame, Esc exit
    if (demo === null) return;
    const f = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); go(demo + 1); }
      else if (e.key === "ArrowLeft") go(demo - 1);
      else if (e.key.toLowerCase() === "p") setPlaying((v) => !v);
      else if (e.key.toLowerCase() === "h") setClean((v) => !v);
      else if (e.key === "Escape") exit();
    };
    addEventListener("keydown", f);
    return () => removeEventListener("keydown", f);
  }, [demo]);

  const startDemo = () => { setDemo(0); setPlaying(false); location.hash = "#/demo"; };
  const rail = <Rail route={route} panel={panel} setPanel={setPanel} onAbout={() => setAbout(true)} onDemo={startDemo} />;
  if (route === "") return <Landing rail={rail} onEnter={() => { location.hash = "#/planner?from=map"; }} onDemo={startDemo} />;
  if (error) return <div className="loading">Could not load the model data: {error}</div>;
  if (!data || !res || !controls) return <div className="loading"><div className="loader" />LOADING THE TOWNSHIP</div>;

  const scenario = scenarioOf(controls);
  const sc = res.scenarios[scenario];
  const changed = changedInputs(controls, data.inputs);
  const status = changed.length ? "whatif" : "sourced";
  const step = demo !== null ? STEPS[demo] : null;
  const demoBar = demo !== null && (
    <DemoBar step={demo} ctx={{ base: data.outputs, cur: res, inputs: data.inputs }} playing={playing} clean={clean} go={go}
      togglePlay={() => setPlaying(!playing)} toggleClean={() => setClean(!clean)} exit={exit}
      legend={route !== "brief" && route !== "resident" ? <Legend results={res} scenario={scenario} storm={storm} basis={basis} /> : undefined} />
  );

  if (route === "brief" || route === "resident") {
    return (
      <div className={`page-shell ${demo !== null ? "with-demo" : ""} ${clean ? "clean-frame" : ""}`}>
        {rail}
        {route === "brief"
          ? <Brief inputs={changed.length ? adjustedInputs(data.inputs, controls) : data.inputs} results={res} adjusted={changed.length > 0} />
          : <Resident />}
        {step?.ui && <Spotlight items={step.ui} />}
        {demoBar}
        {about && <About inputs={data.inputs} results={res} close={() => setAbout(false)} />}
      </div>
    );
  }

  const rainK = THREE.MathUtils.clamp(sc.intensity_mm_hr / data.outputs.scenarios.now.intensity_mm_hr, 0.3, 1.3);
  const extra = extraPoints(anchors, controls);
  const points: PointAt[] = (step?.points ?? flash).map((p) => (typeof p.at === "string" && extra[p.at] ? { ...p, at: extra[p.at] } : p));
  return (
    <div className={`app ${demo !== null ? "in-demo" : ""} ${clean ? "clean-frame" : ""} ${panel ? "has-panel" : ""}`}>
      <WaterBackdrop />
      <div className="stage">
        <Canvas shadows gl={{ antialias: true, alpha: true }} dpr={[1, 2]}>
          <hemisphereLight args={["#dfe8f5", "#1b2230", 0.85]} />
          <KeyLight />
          <directionalLight position={[1200, 500, 300]} intensity={0.4} color="#9fc3ff" />
          <Camera focus={step && !step.route ? step.focus : null} view={view} nonce={nonce}
            inset={[clean ? 0 : 60 + (panel ? 364 : 0), clean || (demo !== null && innerWidth < 1100) ? 0 : 342]} />
          <Suspense fallback={null}>
            <Township results={res} scenario={scenario} basis={basis} storm={storm} controls={controls} trees={data.trees.trees} pick={pick}
              layers={layers} onPick={setPick} onReady={setAnchors} onHover={setHover} onShown={() => setShown(true)} />
            {anchors && labelsOn && <Overlays anchors={anchors} council={data.overlays.council_line.paths as any} results={res} scenario={scenario} basis={basis}
              controls={controls} storm={storm} layers={layers} pickZone={(id) => setPick({ kind: "zone", id })} />}
            {anchors && points.length > 0 && <Pointers items={points} anchors={anchors} />}
          </Suspense>
          <Rain strength={storm * rainK} />
        </Canvas>
      </div>
      <div className={`planner-curtain ${shown ? "off" : ""}`}><div className="loader" /><span>OPENING THE CATCHMENT MODEL</span></div>
      <StatusBar status={status} storm={storm} res={res} scenario={scenario} scenarioName={scenarioName(controls)} ari={controls.ari}
        onAbout={() => setAbout(true)} onDemo={startDemo} />
      {rail}
      {panel === "controls" && <ControlPanel data={data} inputs={data.inputs} c={controls} set={setControls} preset={preset} setPreset={setPreset} setBasis={setBasis} close={() => setPanel(null)} />}
      {panel === "layers" && <LayersPanel layers={layers} set={setLayers} close={() => setPanel(null)} />}
      <div className="right-col">
        <Card pick={pick} results={res} inputs={data.inputs} routes={data.routes} scenario={scenario} basis={basis} close={() => setPick(null)} />
        <Results res={res} base={data.outputs} scenario={scenario} name={scenarioName(controls)} c={controls} storm={storm} basis={basis} />
      </div>
      {demo === null && (
        <div className="viewbar">
          <div className="seg">
            <button className={view === "iso" ? "on" : ""} onClick={() => setView("iso")}>3D</button>
            <button className={view === "top" ? "on" : ""} onClick={() => setView("top")}>TOP</button>
          </div>
          <button className="btn sq" onClick={() => setNonce((n) => n + 1)} title="Reset the view" aria-label="Reset the view"><Crosshair size={15} /></button>
          <div className="seg">
            <button className={storm < 0.5 ? "on" : ""} onClick={() => setStorm(0)}><Sun size={13} /> CLEAR</button>
            <button className={storm > 0.5 ? "on storm" : ""} onClick={() => setStorm(1)}><CloudRain size={13} /> STORM</button>
          </div>
          <span className="seg-cap">COLOUR BY</span>
          <div className="seg" title="What the zone colours show in the storm">
            <button className={basis === "capacity" ? "on" : ""} onClick={() => setBasis("capacity")}
              title="Is there room for the water? Each zone against the pond or drain it drains to">STORAGE SHORTFALL</button>
            <button className={basis === "change" ? "on" : ""} onClick={() => setBasis("change")}
              title="Did this scenario make it better or worse than today's land cover?">CHANGE FROM TODAY</button>
          </div>
          {changed.length > 0 && <span className="changed-note">Changed: {changed.join(", ")}</span>}
        </div>
      )}
      <Footer hover={hover} zoneName={hover?.zone ? data.inputs.zones[hover.zone]?.name : undefined}
        legend={<Legend results={res} scenario={scenario} storm={storm} basis={basis} />} />
      <Ticker />
      {step?.ui && <Spotlight items={step.ui} />}
      {demoBar}
      {about && <About inputs={data.inputs} results={res} close={() => setAbout(false)} />}
    </div>
  );
}
