// Landing page (team leader, 21 Oct 2026): Malaysia on a night globe. Real flood evidence at three levels of detail:
// JPS Selangor's records (point-level, 2017-2024), JPS's 2017 flash-flood list for every state (town-level) and the
// Dartmouth Flood Observatory's major events (region centres); plus the resident door's reports (resident/store.ts:
// demo samples and any made in this browser) in the shared report format (RESIDENT_PLANNER_INTEGRATION.md). Zooming into Bandar Bukit Raja opens the planner on the same coordinates.
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { ArrowRight, PlayCircle } from "lucide-react";
import { Globe, type Hover, type MapLayers, type National, type Report } from "../scene/Globe";
import { Ticker, Wordmark } from "./Shell";
import { toShared, useReports } from "../resident/store";
import { loadIndex, type SiteEntry } from "../platform/data";

export function Landing(p: { rail: ReactNode; onEnter: () => void; onDemo: () => void;
                              onData?: (n: { flood: number; floodYears: string; flash: number; towns: number; major: number; majorYears: string }) => void;
                              fly?: boolean; inDemo?: boolean }) {   // fly: the guided demo asks for the fly-in
  // the site registry (22 Oct 2026): listed outside the guided demo only, so the demo's frames stay as recorded
  const [sites, setSites] = useState<SiteEntry[] | null>(null);
  useEffect(() => { if (!p.inDemo) loadIndex().then(setSites).catch(() => setSites(null)); }, [p.inDemo]);
  const others = !p.inDemo && sites ? sites.filter((s) => s.view === "2d") : [];
  const [data, setData] = useState<National | null>(null);
  const stored = useReports();
  const reports = useMemo(() => stored.filter((r) => r.status !== "Cleared").map(toShared).filter(Boolean) as Report[], [stored]);
  const [error, setError] = useState<string | null>(null);
  const [layers, setLayers] = useState<MapLayers>({ flood: true, flash: true, major: true, reports: true, states: true });
  const [hover, setHover] = useState<Hover>(null);
  const [sheet, setSheet] = useState(false);          // phones: the layer list stays folded until asked for
  const [far, setFar] = useState(false);
  const [flying, setFlying] = useState(false);

  useEffect(() => {
    const get = (f: string) => fetch(`./data/${f}`).then((r) => { if (!r.ok) throw new Error(`${f}: ${r.status}`); return r.json(); });
    get("national.json")
      .then((n) => setData(n))
      .catch((e) => setError(String(e)));
    useGLTF.preload("./data/township.glb", "./draco/");     // so the planner opens without a wait after the fly-in
  }, []);

  useEffect(() => { if (p.fly) setFlying(true); }, [p.fly]);
  useEffect(() => {          // the counts the guided demo reads aloud
    if (!data || !p.onData) return;
    const fy = data.flood.map((f) => f.y), my = data.major.map((m) => m.y);
    p.onData({ flood: data.flood.length, floodYears: `${Math.min(...fy)}–${Math.max(...fy)}`, flash: data.flash.reduce((a, f) => a + f.n, 0),
               towns: data.flash.length, major: data.major.length, majorYears: `${Math.min(...my)}–${Math.max(...my)}` });
  }, [data]);

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
                onHover={setHover} onFar={setFar} sites={others} />
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
          <div className="readout"><span>RESIDENT REPORTS</span><b className="gold-t">{reports.length} OPEN{reports.some((r) => r.example) ? " · INCL. SAMPLES" : ""}</b></div>
          <div className="readout"><span>CATCHMENT MODELS</span><b className="cyan">{others.length ? `${others.length + 1} · BBR IN 3D + ${others.length} GENERATED` : "1 · BANDAR BUKIT RAJA"}</b></div>
          <button className="btn-gold" onClick={p.onDemo}><PlayCircle size={14} /> GUIDED DEMO</button>
        </div>
      </header>
      {p.rail}

      <aside className={`panel globe-panel ${sheet ? "open" : ""}`}>
        <div className="panel-head"><span>MAP LAYERS</span>
          <button className="gl-toggle" onClick={() => setSheet(!sheet)} aria-expanded={sheet}>{sheet ? "Hide" : "Layers"}</button></div>
        <label className="gl-row"><input type="checkbox" checked={layers.flood} onChange={() => toggle("flood")} />
          <i className="gl-dot red" /><span><b>Flood records, Selangor</b><small>JPS Selangor GIS, {years}: one dot per record, at its mapped spot. Place, year and type only</small></span></label>
        <label className="gl-row"><input type="checkbox" checked={layers.flash} onChange={() => toggle("flash")} />
          <i className="gl-dot orange" /><span><b>Flash-flood locations, all states</b><small>JPS list, 2017 (data.gov.my). One dot per town, sized by its count; position approximate</small></span></label>
        <label className="gl-row"><input type="checkbox" checked={layers.major} onChange={() => toggle("major")} />
          <i className="gl-ring rose" /><span><b>Major flood events</b><small>Dartmouth Flood Observatory, 1991–2021: centre of each affected region</small></span></label>
        <label className="gl-row"><input type="checkbox" checked={layers.reports} onChange={() => toggle("reports")} />
          <i className="gl-dot gold" /><span><b>Resident reports <em className="ex">DEMO</em></b><small>From the resident door: demo samples and reports made in this browser</small></span></label>
        <label className="gl-row"><input type="checkbox" checked={layers.states} onChange={() => toggle("states")} />
          <i className="gl-line" /><span><b>State lines</b><small>Natural Earth</small></span></label>
        <div className="gl-row static"><i className="gl-ring" /><span><b>Catchment model</b><small>Where the planner view exists: Bandar Bukit Raja (simulated town on real drains and ponds)</small></span></div>
        <button className="btn-gold gl-go" onClick={fly}>Open Bandar Bukit Raja <ArrowRight size={14} /></button>
        {others.length > 0 && (
          <div className="gl-sites">
            {others.map((s) => <a key={s.id} href={`#/site/${s.id}`}><span>{s.name}<br /><small>Generated from open data · 2D · confidence {s.confidence}</small></span><ArrowRight size={13} /></a>)}
            <a href="#/sites"><span>All sites, ranked<br /><small>Portfolio: every site, one method</small></span><ArrowRight size={13} /></a>
          </div>
        )}
      </aside>

      {far && !flying && (
        <div className="globe-hint">{others.length
          ? <>No catchment model here yet. Open <button onClick={fly}>Bandar Bukit Raja</button>{others.map((s) => <span key={s.id}>, <a href={`#/site/${s.id}`}>{s.name}</a></span>)} or <a href="#/sites">all sites</a>.</>
          : <>No catchment model here yet. This pilot covers <button onClick={fly}>Bandar Bukit Raja</button>.</>}</div>
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
