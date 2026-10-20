import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import * as THREE from "three";
import { adjustedInputs, loadAll, results as computeResults, isAdjusted, type Adjust, type Loaded, type ScenarioId } from "./lib/data";
import { Township, type Pick } from "./scene/Township";
import { Rain } from "./scene/Rain";
import { About, AdjustPanel, Card, Dock, Legend, TopBar } from "./ui/Planner";
import { Brief } from "./ui/Brief";
import { Resident } from "./ui/Resident";
import { DemoBar, STEPS, type Focus } from "./ui/Demo";

const TARGET: [number, number, number] = [239, 0, 105];      // model centre in glTF coordinates (x, up, -y)
const VIEW = [0.62, 0.95, 1.0];                              // isometric-style view from the south-south-east

function Camera({ focus }: { focus: Focus | null }) {
  const { size, camera } = useThree();
  const controls = useRef<any>(null);
  // diorama with breathing room, as the reference; narrow screens use more of the width
  const zoom = size.width < 700 ? size.width / 3400 : Math.min(size.width / 4300, size.height / 2500);
  const d = 4000, n = Math.hypot(...VIEW);
  const dir = useMemo(() => new THREE.Vector3(VIEW[0] / n, VIEW[1] / n, VIEW[2] / n), [n]);
  const want = useMemo(() => new THREE.Vector3(), []);
  // guided demo: glide the view to the step's focus (target and zoom), back to the isometric direction
  useFrame((_, dt) => {
    const c = controls.current;
    if (!focus || !c) return;
    const k = Math.min(1, dt * 1.6);
    c.target.lerp(want.set(...focus.t), k);
    camera.position.lerp(want.copy(c.target).addScaledVector(dir, d), k);
    const cam = camera as THREE.OrthographicCamera;
    cam.zoom = THREE.MathUtils.lerp(cam.zoom, zoom * focus.k, k);
    cam.updateProjectionMatrix();
    c.update();
  });
  return (
    <>
      <OrthographicCamera makeDefault zoom={zoom} near={10} far={20000}
        position={[TARGET[0] + dir.x * d, TARGET[1] + dir.y * d, TARGET[2] + dir.z * d]} />
      <OrbitControls ref={controls} target={TARGET} enableDamping dampingFactor={0.08} minZoom={zoom * 0.7} maxZoom={zoom * 9}
        minPolarAngle={0.35} maxPolarAngle={1.2} screenSpacePanning={false} enabled={!focus} />
    </>
  );
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

export default function App() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adjust, setAdjust] = useState<Adjust>({});
  const [scenario, setScenario] = useState<ScenarioId>("now");
  const [storm, setStorm] = useState(0);
  const [pick, setPick] = useState<Pick>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [about, setAbout] = useState(false);
  const [ready, setReady] = useState(false);
  const [demo, setDemo] = useState<number | null>(null);     // guided demo step, or null
  const [playing, setPlaying] = useState(false);
  const [clean, setClean] = useState(false);
  const route = useRoute();
  useEffect(() => { loadAll().then(setData).catch((e) => setError(String(e))); }, []);
  useEffect(() => {          // first visit: run the storm once the model is in; #/demo starts the guided demo
    if (!ready || demo !== null) return;
    if (route === "demo") { setDemo(0); setPlaying(location.hash.includes("play")); setClean(location.hash.includes("clean")); return; }
    const t = setTimeout(() => setStorm(1), 1200);
    return () => clearTimeout(t);
  }, [ready]);
  const res = useMemo(() => (data ? computeResults(data, adjust) : null), [data, adjust]);

  // ---- guided demo: each step sets the app's state
  const go = useCallback((i: number) => setDemo(Math.max(0, Math.min(STEPS.length - 1, i))), []);
  const exit = useCallback(() => {
    setDemo(null); setPlaying(false); setClean(false); setAdjust({}); setAdjustOpen(false); setPick(null);
    location.hash = "#/";
  }, []);
  useEffect(() => {
    if (demo === null) return;
    const s = STEPS[demo];
    setScenario(s.scenario); setStorm(s.storm); setPick(s.pick ?? null);
    setAdjust(s.adjust ?? {}); setAdjustOpen(!!s.adjustOpen); setAbout(false);
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

  if (error) return <div className="loading">Could not load the model data: {error}</div>;
  if (!data || !res) return <div className="loading">Loading the township…</div>;

  const demoBar = demo !== null && (
    <DemoBar step={demo} ctx={{ base: data.outputs, cur: res, inputs: data.inputs }} playing={playing} clean={clean} go={go}
      togglePlay={() => setPlaying(!playing)} toggleClean={() => setClean(!clean)} exit={exit}
      legend={route !== "brief" && route !== "resident" && storm > 0.5 ? <Legend results={res} scenario={scenario} /> : undefined} />
  );
  if (route === "brief" || route === "resident") {
    return (
      <div className={demo !== null ? "with-demo" : ""}>
        {route === "brief"
          ? <Brief inputs={isAdjusted(adjust) ? adjustedInputs(data.inputs, adjust) : data.inputs} results={res} adjusted={isAdjusted(adjust)} />
          : <Resident />}
        {demoBar}
      </div>
    );
  }

  const sc = res.scenarios[scenario];
  const hint = storm < 0.5 ? "Clear day. Press the rain button to run the 100-year design storm."
    : pick ? "Tap elsewhere to close the card." : `100-year, ${sc.duration_h}-hour design storm · tap a zone or pond to see where its water goes`;
  return (
    <div className={`${demo !== null ? "in-demo" : ""} ${clean ? "clean-frame" : ""}`}>
      <div className="stage">
        <Canvas gl={{ antialias: true, alpha: true }} dpr={[1, 2]}>
          <hemisphereLight args={["#fff8ee", "#a9b98f", 1.5]} />
          <directionalLight position={[900, 1400, 1100]} intensity={1.7} color="#fff1dc" />
          <Camera focus={demo !== null ? STEPS[demo].focus : null} />
          <Suspense fallback={null}>
            <Township results={res} scenario={scenario} storm={storm} trees={data.trees.trees} pick={pick}
              onPick={setPick} onReady={() => setReady(true)} />
          </Suspense>
          <Rain strength={storm} />
        </Canvas>
      </div>
      {!ready && <div className="loading" style={{ pointerEvents: "none" }}>Loading the township…</div>}
      <TopBar illustrative={res.illustrative} live={isAdjusted(adjust)} onAbout={() => setAbout(true)}
        onDemo={() => { setDemo(0); setPlaying(false); }} />
      <Card pick={pick} results={res} inputs={data.inputs} routes={data.routes} scenario={scenario} close={() => setPick(null)} />
      {adjustOpen && <AdjustPanel inputs={data.inputs} adjust={adjust} set={setAdjust} close={() => setAdjustOpen(false)} />}
      {demo === null && (
        <Dock scenario={scenario} setScenario={setScenario} storm={storm} toggleStorm={() => setStorm(storm > 0.5 ? 0 : 1)}
          adjustOpen={adjustOpen} toggleAdjust={() => setAdjustOpen(!adjustOpen)} hint={hint}
          legend={storm > 0.5 ? <Legend results={res} scenario={scenario} /> : <span>Mapped ponds, drains and council line · simulated town fabric</span>} />
      )}
      {demoBar}
      {about && <About inputs={data.inputs} results={res} close={() => setAbout(false)} />}
    </div>
  );
}
