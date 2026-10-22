// A 2D site (#/site/<id>, 22 Oct 2026): the 3D planner's features for any generated site, made for a flat map.
// Status bar, rail, Scenario control (presets, levers), Layers, the site's tabs, live results, inspector card, storm
// with rain and flow animation, lever pointers, footer readout, evidence feed, the Findings page and a guided tour.
// Every number on screen comes from the network engine run in the browser on this site's pack.
import { useEffect, useMemo, useRef, useState } from "react";
import { CloudRain, Crosshair, Sun } from "lucide-react";
import { useReports } from "../resident/store";
import { coordsOf, statusLabel } from "../resident/data";
import { Spotlight } from "../ui/Demo";
import { loadPack, runSafe, type Pack, type UploadResult } from "./data";
import { adjusted2, changed2, scenarioName2, sourced2, type C2 } from "./model";
import { LAYERS2, MapView, boundsOf, centreOf, type Flash, type Layers2, type Pick2 } from "./MapView";
import { Rain2D } from "./Rain2D";
import { ControlPanel2, Footer2, LayersPanel2, Legend2, Rail2, Results2, SiteInfoPanel, StatusBar2, Ticker2, type Panel2, type Tab2 } from "./Panels";
import { Card } from "./SitePanels";
import { Findings2 } from "./Findings";
import { TOUR, TourBar, type TourCtx } from "./Tour";

export function SiteApp({ id, page, tourStart }: { id: string; page: "map" | "findings"; tourStart: boolean }) {
  const [pack, setPack] = useState<Pack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [c, setC] = useState<C2 | null>(null);
  const [preset, setPreset] = useState<string | null>("today");
  const [storm, setStorm] = useState(0);
  const [panel, setPanel] = useState<Panel2>(innerWidth > 900 ? "controls" : null);
  const [tab, setTab] = useState<Tab2>("overview");
  const [layers, setLayers] = useState<Layers2>(LAYERS2);
  const [pick, setPick] = useState<Pick2>(null);
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const [ll, setLl] = useState<[number, number] | null>(null);
  const [flash, setFlash] = useState<Flash[]>([]);
  const [focus, setFocus] = useState<{ b: any; n: number } | null>(null);
  const [tour, setTour] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [clean, setClean] = useState(false);

  useEffect(() => {
    setPack(null); setError(null); setUpload(null); setPick(null);
    loadPack(id).then((pk) => { setPack(pk); setC(sourced2(pk.inputs)); }).catch((e) => setError(String(e)));
  }, [id]);
  // the storm comes on as the site opens, as in 3D (the tour sets its own)
  useEffect(() => { if (pack && !tourStart) { const t = setTimeout(() => { setTour((cur) => { if (cur === null) setStorm(1); return cur; }); }, 900); return () => clearTimeout(t); } }, [pack]);
  useEffect(() => { if (pack && tourStart && tour === null) { setTour(0); setPlaying(location.hash.includes("play")); setClean(location.hash.includes("clean")); } }, [pack, tourStart]);

  const base = upload?.inputs ?? pack?.inputs;
  const run = useMemo(() => (base && c ? runSafe(adjusted2(base, c)) : null), [base, c]);
  const res = run?.res;
  const inputs = useMemo(() => (base && c ? adjusted2(base, c) : null), [base, c]);

  // resident reports inside this site become pins
  const reports = useReports();
  const pins = useMemo(() => {
    if (!pack) return [];
    const [s, w, n, e] = pack.site.bbox;
    return reports.filter((r) => r.status !== "Cleared").flatMap((r) => {
      const at = coordsOf(r);
      return at && at[0] >= s && at[0] <= n && at[1] >= w && at[1] <= e ? [{ id: r.id, lat: at[0], lon: at[1], label: `${r.issue} · ${statusLabel(r.status)}`, sample: !!r.isSample }] : [];
    });
  }, [reports, pack]);

  // a lever change rings the parts of the map it moves (2.6 s)
  const prev = useRef<C2 | null>(null);
  useEffect(() => {
    const a = prev.current; prev.current = c;
    if (!a || !c || !pack || tour !== null) return;
    const feats = (k: string) => pack.geo.features.filter((f: any) => f.properties.kind === k);
    const at = (f: any): [number, number] => (f.geometry.type === "Point" ? [f.geometry.coordinates[1], f.geometry.coordinates[0]] : f.geometry.type.includes("Line")
      ? (() => { const ln = f.geometry.type === "LineString" ? f.geometry.coordinates : f.geometry.coordinates[0]; const m = ln[Math.floor(ln.length / 2)]; return [m[1], m[0]] as [number, number]; })()
      : centreOf(f.geometry));
    const pts: Flash[] = [];
    if (a.dev !== c.dev) feats("zone").filter((f: any) => pack.inputs.zones[f.properties.id]?.c_upstream.value > pack.inputs.zones[f.properties.id]?.c_now.value + 0.05)
      .slice(0, 3).forEach((f: any) => pts.push({ at: at(f), label: `${f.properties.id} built` }));
    if (a.pond !== c.pond || a.pondSize !== c.pondSize) feats("whatif").forEach((f: any) => pts.push({ at: at(f), label: "New retrofit pond" }));
    if (a.drainScale !== c.drainScale || a.blocked !== c.blocked) feats("drain").slice(0, 3).forEach((f: any) => pts.push({ at: at(f), label: a.blocked !== c.blocked ? `${Math.round(c.blocked * 100)} % blocked` : "Drain works" }));
    if (a.silt !== c.silt || JSON.stringify(a.caps) !== JSON.stringify(c.caps)) {
      const top = Object.entries<any>(res?.scenarios.current.ponds ?? {}).sort((x, y) => (y[1].ratio ?? 0) - (x[1].ratio ?? 0)).slice(0, 3).map(([k]) => k);
      feats("pond").filter((f: any) => top.includes(f.properties.id)).forEach((f: any) => pts.push({ at: at(f), label: a.silt !== c.silt ? `${Math.round(c.silt * 100)} % silted` : "Stated capacity" }));
    }
    if (!pts.length) return;
    setFlash(pts);
    const t = setTimeout(() => setFlash([]), 2600);
    return () => clearTimeout(t);
  }, [c]);

  // ---- guided tour: each step sets the state, moves the map and points at the screen
  useEffect(() => {
    if (tour === null || !pack) return;
    const s = TOUR[tour];
    const ctx = tourCtx();
    if (!ctx) return;
    setC({ ...sourced2(pack.inputs), ...(s.controls?.(ctx) ?? {}) });
    setStorm(s.storm); setPanel(s.panel ?? null); setTab(s.tab ?? "overview"); setPick(s.pick?.(ctx) ?? null); setPreset(null);
    const want = s.page === "findings" ? `#/site/${id}/findings` : `#/site/${id}`;
    if (location.hash.split("?")[0] !== want) history.replaceState(null, "", want + (location.hash.includes("?") ? "?" + location.hash.split("?")[1] : ""));
    dispatchEvent(new HashChangeEvent("hashchange"));
    const b = s.focus?.(ctx);
    if (b) setFocus((f) => ({ b, n: (f?.n ?? 0) + 1 }));
  }, [tour, pack]);
  useEffect(() => {
    if (tour === null || !playing) return;
    if (tour === TOUR.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setTour(tour + 1), TOUR[tour].ms);
    return () => clearTimeout(t);
  }, [tour, playing]);
  useEffect(() => {
    if (tour === null) return;
    const f = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); setTour(Math.min(TOUR.length - 1, tour + 1)); }
      else if (e.key === "ArrowLeft") setTour(Math.max(0, tour - 1));
      else if (e.key.toLowerCase() === "p") setPlaying((v) => !v);
      else if (e.key.toLowerCase() === "h") setClean((v) => !v);
      else if (e.key === "Escape") exitTour();
    };
    addEventListener("keydown", f);
    return () => removeEventListener("keydown", f);
  }, [tour]);
  const startTour = () => { setTour(0); setPlaying(false); };
  const exitTour = () => {
    setTour(null); setPlaying(false); setClean(false); setPick(null);
    if (pack) setC(sourced2(pack.inputs));
    setPreset("today"); setPanel(innerWidth > 900 ? "controls" : null);
    location.hash = `#/site/${id}`;
  };
  function tourCtx(): TourCtx | null {
    if (!pack) return null;
    const feats = (k: string) => pack.geo.features.filter((f: any) => f.properties.kind === k);
    const sc0 = runSafe(adjusted2(pack.inputs, sourced2(pack.inputs))).res;
    return { pack, base: sc0, feats, bounds: (fs: any[]) => boundsOf(fs), run: (cc: Partial<C2>) => runSafe(adjusted2(pack.inputs, { ...sourced2(pack.inputs), ...cc })).res };
  }

  if (error) return <div className="loading">Could not load this site: {error}. <a href="#/sites">All sites</a></div>;
  if (!pack || !c || !res || !inputs) return <div className="loading"><div className="loader" />{run?.error ? `THE SETTINGS CANNOT RUN: ${run.error}` : "OPENING THE SITE"}</div>;

  const sc = res.scenarios.current, now = res.scenarios.now;
  const changed = changed2(c, pack.inputs);
  const status = upload ? "register" : changed.length ? "whatif" : "sourced";
  const name = scenarioName2(c);
  const ctx = tour !== null ? tourCtx() : null;
  const step = tour !== null ? TOUR[tour] : null;
  const rail = <Rail2 id={id} route={page} panel={panel} setPanel={setPanel} onTour={startTour} onAbout={() => { setPanel("site"); setTab("inputs"); }} />;
  const tourBar = tour !== null && ctx && (
    <TourBar step={tour} ctx={{ ...ctx, cur: res }} playing={playing} clean={clean} go={(i) => setTour(Math.max(0, Math.min(TOUR.length - 1, i)))}
      togglePlay={() => setPlaying(!playing)} toggleClean={() => setClean(!clean)} exit={exitTour} />
  );

  if (page === "findings") {
    return (
      <div className={`page-shell ${tour !== null ? "with-demo" : ""} ${clean ? "clean-frame" : ""}`}>
        {rail}
        <Findings2 pack={pack} base={base} c={c} res={res} adjusted={changed.length > 0 || !!upload} />
        {step?.ui && <Spotlight items={step.ui} />}
        {tourBar}
      </div>
    );
  }

  // rain thickens with the intensity, against the sourced 100-year storm (as in 3D)
  const intensity = Math.max(0.3, Math.min(1.3, sc.intensity_mm_hr / (pack.outputs.scenarios.now.intensity_mm_hr || sc.intensity_mm_hr)));
  const zi = zone ? inputs.zones[zone] : null;
  return (
    <div className={`app pf2 ${tour !== null ? "in-demo" : ""} ${clean ? "clean-frame" : ""} ${panel ? "has-panel" : ""} ${storm > 0.5 ? "stormy" : ""}`}>
      <MapView pack={pack} inputs={inputs} sc={sc} storm={storm} layers={layers} pick={pick} setPick={setPick} dev={c.dev}
        pondOn={c.pond && !!sc.what_if_ponds?.W1} flash={flash} focus={focus} pins={pins} onZone={setZone} onMove={setLl}
        inset={[clean ? 0 : 60 + (panel ? 364 : 0), clean ? 0 : 342]} lift={innerWidth < 860 && panel ? Math.round(innerHeight * 0.2) : 0} />
      <Rain2D strength={storm * intensity} />
      <StatusBar2 pack={pack} sc={sc} c={c} name={name} status={status} storm={storm} onTour={startTour} onAbout={() => { setPanel("site"); setTab("inputs"); }} />
      {rail}
      {panel === "controls" && <ControlPanel2 pack={pack} inputs={base} c={c} set={setC} preset={preset} setPreset={setPreset} sc={sc} close={() => setPanel(null)} />}
      {panel === "layers" && <LayersPanel2 layers={layers} set={setLayers} close={() => setPanel(null)} />}
      {panel === "site" && <SiteInfoPanel pack={pack} inputs={inputs} sc={sc} tab={tab} setTab={setTab} upload={upload} setUpload={setUpload}
        liveError={run?.error ?? null} setPick={setPick} close={() => setPanel(null)} />}
      <div className="right-col">
        {pick && <Card pick={pick} inputs={inputs} sc={sc} close={() => setPick(null)} />}
        <Results2 inputs={inputs} sc={sc} now={now} name={name} c={c} storm={storm} />
      </div>
      {tour === null && (
        <div className="viewbar">
          <button className="btn sq" onClick={() => setFocus((f) => ({ b: [[pack.site.bbox[0], pack.site.bbox[1]], [pack.site.bbox[2], pack.site.bbox[3]]], n: (f?.n ?? 0) + 1 }))}
            title="Reset the view" aria-label="Reset the view"><Crosshair size={15} /></button>
          <div className="seg">
            <button className={storm < 0.5 ? "on" : ""} onClick={() => setStorm(0)}><Sun size={13} /> CLEAR</button>
            <button className={storm > 0.5 ? "on storm" : ""} onClick={() => setStorm(1)}><CloudRain size={13} /> STORM</button>
          </div>
          {changed.length > 0 && <span className="changed-note">Changed: {changed.join(", ")}</span>}
        </div>
      )}
      <Footer2 ll={ll} zone={zone} zoneTo={zi ? (zi.drains_to === "outfall" ? "a river" : zi.drains_to) : undefined}
        legend={<Legend2 storm={storm} changed={changed.length > 0} />} />
      <Ticker2 pack={pack} />
      {step?.ui && <Spotlight items={step.ui} />}
      {tourBar}
    </div>
  );
}
