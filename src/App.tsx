import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import { adjustedInputs, loadAll, results as computeResults, isAdjusted, type Adjust, type Loaded, type ScenarioId } from "./lib/data";
import { Township, type Pick } from "./scene/Township";
import { Rain } from "./scene/Rain";
import { About, AdjustPanel, Card, Dock, Legend, TopBar } from "./ui/Planner";
import { Brief } from "./ui/Brief";
import { Resident } from "./ui/Resident";

const TARGET: [number, number, number] = [239, 0, 105];      // model centre in glTF coordinates (x, up, -y)
const VIEW = [0.62, 0.95, 1.0];                              // isometric-style view from the south-south-east

function Camera() {
  const { size } = useThree();
  // diorama with breathing room, as the reference; narrow screens use more of the width
  const zoom = size.width < 700 ? size.width / 3400 : Math.min(size.width / 4300, size.height / 2500);
  const d = 4000, n = Math.hypot(...VIEW);
  return (
    <>
      <OrthographicCamera makeDefault zoom={zoom} near={10} far={20000}
        position={[TARGET[0] + (VIEW[0] / n) * d, TARGET[1] + (VIEW[1] / n) * d, TARGET[2] + (VIEW[2] / n) * d]} />
      <OrbitControls target={TARGET} enableDamping dampingFactor={0.08} minZoom={zoom * 0.7} maxZoom={zoom * 9}
        minPolarAngle={0.35} maxPolarAngle={1.2} screenSpacePanning={false} />
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
  return hash.replace(/^#\/?/, "");
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
  const route = useRoute();
  useEffect(() => { loadAll().then(setData).catch((e) => setError(String(e))); }, []);
  useEffect(() => { if (ready) { const t = setTimeout(() => setStorm(1), 1200); return () => clearTimeout(t); } }, [ready]);
  const res = useMemo(() => (data ? computeResults(data, adjust) : null), [data, adjust]);

  if (error) return <div className="loading">Could not load the model data: {error}</div>;
  if (!data || !res) return <div className="loading">Loading the township…</div>;
  if (route === "brief") return <Brief inputs={isAdjusted(adjust) ? adjustedInputs(data.inputs, adjust) : data.inputs} results={res} adjusted={isAdjusted(adjust)} />;
  if (route === "resident") return <Resident />;

  const sc = res.scenarios[scenario];
  const hint = storm < 0.5 ? "Clear day. Press the rain button to run the 100-year design storm."
    : pick ? "Tap elsewhere to close the card." : `100-year, ${sc.duration_h}-hour design storm · tap a zone or pond to see where its water goes`;
  return (
    <>
      <div className="stage">
        <Canvas gl={{ antialias: true, alpha: true }} dpr={[1, 2]}>
          <hemisphereLight args={["#fff8ee", "#a9b98f", 1.5]} />
          <directionalLight position={[900, 1400, 1100]} intensity={1.7} color="#fff1dc" />
          <Camera />
          <Suspense fallback={null}>
            <Township results={res} scenario={scenario} storm={storm} trees={data.trees.trees} pick={pick}
              onPick={setPick} onReady={() => setReady(true)} />
          </Suspense>
          <Rain strength={storm} />
        </Canvas>
      </div>
      {!ready && <div className="loading" style={{ pointerEvents: "none" }}>Loading the township…</div>}
      <TopBar illustrative={res.illustrative} live={isAdjusted(adjust)} onAbout={() => setAbout(true)} />
      <Card pick={pick} results={res} inputs={data.inputs} routes={data.routes} scenario={scenario} close={() => setPick(null)} />
      {adjustOpen && <AdjustPanel inputs={data.inputs} adjust={adjust} set={setAdjust} close={() => setAdjustOpen(false)} />}
      <Dock scenario={scenario} setScenario={setScenario} storm={storm} toggleStorm={() => setStorm(storm > 0.5 ? 0 : 1)}
        adjustOpen={adjustOpen} toggleAdjust={() => setAdjustOpen(!adjustOpen)} hint={hint}
        legend={storm > 0.5 ? <Legend results={res} scenario={scenario} /> : <span>Mapped ponds, drains and council line · simulated town fabric</span>} />
      {about && <About inputs={data.inputs} results={res} close={() => setAbout(false)} />}
    </>
  );
}
