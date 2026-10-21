// Landing page (team leader, 21 Oct 2026): Malaysia on a night globe. Real flood evidence at three levels of detail:
// JPS Selangor's records (point-level, 2017-2024), JPS's 2017 flash-flood list for every state (town-level) and the
// Dartmouth Flood Observatory's major events (region centres); plus EXAMPLE resident reports in the shared report
// format (RESIDENT_PLANNER_INTEGRATION.md). Zooming into Bandar Bukit Raja opens the planner on the same coordinates.
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { ArrowRight, PlayCircle } from "lucide-react";
import { Globe, type Hover, type MapLayers, type National, type Report } from "../scene/Globe";
import { Ticker, Wordmark } from "./Shell";

export function Landing(p: { rail: ReactNode; onEnter: () => void; onDemo: () => void }) {
  const [data, setData] = useState<National | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [layers, setLayers] = useState<MapLayers>({ flood: true, flash: true, major: true, reports: true, states: true });
  const [hover, setHover] = useState<Hover>(null);
  const [far, setFar] = useState(false);
  const [flying, setFlying] = useState(false);

  useEffect(() => {
    const get = (f: string) => fetch(`./data/${f}`).then((r) => { if (!r.ok) throw new Error(`${f}: ${r.status}`); return r.json(); });
    Promise.all([get("national.json"), get("reports_example.json")])
      .then(([n, r]) => { setData(n); setReports(r.reports); })
      .catch((e) => setError(String(e)));
    useGLTF.preload("./data/township.glb", "./draco/");     // so the planner opens without a wait after the fly-in
  }, []);

  const years = useMemo(() => {
    if (!data) return "";
    const ys = data.flood.map((f) => f.y);
    return `${Math.min(...ys)}–${Math.max(...ys)}`;
  }, [data]);

  if (error) return <div className="loading">Could not load the map data: {error}</div>;
  const fly = () => setFlying(true);
  const toggle = (k: keyof typeof layers) => setLayers({ ...layers, [k]: !layers[k] });

  return (
    <div className="app landing">
      <div className="stage globe-stage">
        {data && (
          <Canvas camera={{ fov: 35, near: 0.0002, far: 50, position: [0, 0, 4] }} dpr={[1, 2]} gl={{ antialias: true }}>
            <Suspense fallback={null}>
              <Globe data={data} reports={reports} layers={layers} flying={flying} onFly={fly} onEnter={p.onEnter}
                onHover={setHover} onFar={setFar} />
            </Suspense>
          </Canvas>
        )}
      </div>
      {!data && <div className="loading" style={{ pointerEvents: "none" }}><div className="loader" />LOADING THE MAP</div>}

      <header className="statusbar">
        <div className="sb-left">
          <Wordmark />
          <div className="sb-context">MALAYSIA · ONE SHARED PICTURE OF HOW WATER MOVES ACROSS COUNCIL AND DEVELOPER BOUNDARIES</div>
        </div>
        <div className="sb-right">
          <div className="readout"><span>FLOOD RECORDS · SELANGOR</span><b className="red">{data ? data.flood.length.toLocaleString("en-GB") : "—"} · {years}</b></div>
          <div className="readout"><span>FLASH-FLOOD LOCATIONS · ALL STATES</span><b className="orange-t">{data ? `${data.flash.reduce((a, f) => a + f.n, 0)} · ${data.flash.length} TOWNS · 2017` : "—"}</b></div>
          <div className="readout"><span>MAJOR EVENTS</span><b className="rose-t">{data ? `${data.major.length} · ${Math.min(...data.major.map((m) => m.y))}–${Math.max(...data.major.map((m) => m.y))}` : "—"}</b></div>
          <div className="readout"><span>RESIDENT REPORTS</span><b className="gold-t">{reports.length} EXAMPLE</b></div>
          <div className="readout"><span>CATCHMENT MODELS</span><b className="cyan">1 · BANDAR BUKIT RAJA</b></div>
          <button className="btn-gold" onClick={p.onDemo}><PlayCircle size={14} /> GUIDED DEMO</button>
        </div>
      </header>
      {p.rail}

      <aside className="panel globe-panel">
        <div className="panel-head"><span>MAP LAYERS</span></div>
        <label className="gl-row"><input type="checkbox" checked={layers.flood} onChange={() => toggle("flood")} />
          <i className="gl-dot red" /><span><b>Flood records, Selangor</b><small>JPS Selangor GIS, {years}: one dot per record, at its mapped spot. Place, year and type only</small></span></label>
        <label className="gl-row"><input type="checkbox" checked={layers.flash} onChange={() => toggle("flash")} />
          <i className="gl-dot orange" /><span><b>Flash-flood locations, all states</b><small>JPS list, 2017 (data.gov.my). One dot per town, sized by its count; position approximate</small></span></label>
        <label className="gl-row"><input type="checkbox" checked={layers.major} onChange={() => toggle("major")} />
          <i className="gl-ring rose" /><span><b>Major flood events</b><small>Dartmouth Flood Observatory, 1991–2021: centre of each affected region</small></span></label>
        <label className="gl-row"><input type="checkbox" checked={layers.reports} onChange={() => toggle("reports")} />
          <i className="gl-dot gold" /><span><b>Resident reports <em className="ex">EXAMPLE</em></b><small>Sample data in the shared report format, not real reports</small></span></label>
        <label className="gl-row"><input type="checkbox" checked={layers.states} onChange={() => toggle("states")} />
          <i className="gl-line" /><span><b>State lines</b><small>Natural Earth</small></span></label>
        <div className="gl-row static"><i className="gl-ring" /><span><b>Catchment model</b><small>Where the planner view exists: Bandar Bukit Raja (simulated town on real drains and ponds)</small></span></div>
        <button className="btn-gold gl-go" onClick={fly}>Open Bandar Bukit Raja <ArrowRight size={14} /></button>
      </aside>

      {far && !flying && (
        <div className="globe-hint">No catchment model here yet. This pilot covers <button onClick={fly}>Bandar Bukit Raja</button>.</div>
      )}

      {hover && (
        <div className="globe-tip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <b className={hover.example ? "ex" : ""}>{hover.title}</b>
          {hover.lines.map((l, i) => <span key={i}>{l}</span>)}
        </div>
      )}

      <footer className="footer">
        <span className="lg-note">Drag to turn · scroll to zoom · zoom into Bandar Bukit Raja to open its catchment model</span>
        <span className="lg-note" style={{ marginLeft: "auto" }}>Natural Earth · JPS Selangor · JPS / data.gov.my · Dartmouth Flood Observatory · OSM geocoding · No depths shown</span>
      </footer>
      <Ticker />
      <div className={`fly-fade ${flying ? "on" : ""}`} />
    </div>
  );
}
