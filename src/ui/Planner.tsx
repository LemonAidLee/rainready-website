// Planner view interface: top bar, scenario dock, zone / pond card, Adjust panel (live mode) and About drawer.
import { CloudRain, Droplet, FileText, Info, Home, Mountain, SlidersHorizontal, Sun, Waves, X } from "lucide-react";
import type { ReactNode } from "react";
import { BAND_COLOR, SCENARIOS, zoneLook, type Adjust, type ScenarioId } from "../lib/data";
import { change, drainsTo, m3, num } from "../lib/format";
import type { Pick } from "../scene/Township";

export function Wordmark() {
  return (
    <a className="wordmark" href="#/">
      <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden><path d="M16 3c5 7 9 11.5 9 16.5A9 9 0 0 1 7 19.5C7 14.5 11 10 16 3z" fill="currentColor" /></svg>
      RainReady
    </a>
  );
}

export function TopBar(p: { illustrative: boolean; live: boolean; onAbout: () => void }) {
  return (
    <div className="topbar">
      <div className="brand">
        <Wordmark />
        <button className="pill" onClick={p.onAbout} title="How these numbers are made">
          {p.illustrative ? "Illustrative values" : p.live ? "Your what-if · screening estimate" : "Screening estimate · MSMA 2"}
        </button>
        <div className="tagline">Property lines stop at the fence. Water doesn't. A simulated township loosely based on Bandar Bukit Raja.</div>
      </div>
      <div className="top-actions">
        <a className="text-btn" href="#/brief"><FileText size={16} /><span className="lbl">Brief</span></a>
        <a className="text-btn" href="#/resident"><Home size={16} /><span className="lbl">Residents</span></a>
        <button className="icon-btn" onClick={p.onAbout} aria-label="About these numbers"><Info size={18} /></button>
      </div>
    </div>
  );
}

const ICON: Record<ScenarioId, ReactNode> = { now: <Sun size={16} />, upstream: <Mountain size={16} />, upstream_plus_pond: <Waves size={16} /> };

export function Dock(p: { scenario: ScenarioId; setScenario: (s: ScenarioId) => void; storm: number; toggleStorm: () => void;
                          adjustOpen: boolean; toggleAdjust: () => void; hint: string; legend: ReactNode }) {
  return (
    <div className="dock">
      <div className="hint">{p.hint}</div>
      <div className="chips">
        {SCENARIOS.map((s) => (
          <button key={s.id} className={`chip ${p.scenario === s.id ? "on" : ""}`} onClick={() => p.setScenario(s.id)}>
            {ICON[s.id]} {s.label}
          </button>
        ))}
        <button className={`chip square ${p.storm > 0.5 ? "accent" : ""}`} onClick={p.toggleStorm}
          title={p.storm > 0.5 ? "Back to a clear day" : "Run the design storm"} aria-label="Design storm"><CloudRain size={18} /></button>
        <button className={`chip square ${p.adjustOpen ? "on" : ""}`} onClick={p.toggleAdjust} title="Adjust the assumptions"
          aria-label="Adjust"><SlidersHorizontal size={18} /></button>
      </div>
      <div className="legend">{p.legend}</div>
    </div>
  );
}

export function Legend({ results, scenario }: { results: any; scenario: ScenarioId }) {
  const basis = Object.values<any>(results.scenarios[scenario].zones).some((z) => z.band_basis === "capacity") ? "capacity" : "change";
  if (scenario === "now" && basis === "change")
    return <span>Today is the baseline. Pick a scenario to see what changes, or enter a stated pond capacity in <b>Adjust</b>.</span>;
  const items = basis === "capacity"
    ? [["low", "below 80 % of capacity"], ["medium", "80–100 %"], ["high", "over capacity"], ["unknown", "outlet TBD"]]
    : [["low", "no real increase"], ["medium", "up 5–20 %"], ["high", "up > 20 %"], ["unknown", "outlet TBD"]];
  return <>{items.map(([b, t]) => <span key={b}><i style={{ background: BAND_COLOR[b] }} />{t}</span>)}</>;
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return <><dt>{k}</dt><dd>{children}</dd></>;
}

export function Card(p: { pick: Pick; results: any; inputs: any; routes: Record<string, string>; scenario: ScenarioId; close: () => void }) {
  if (!p.pick) return null;
  const sc = p.results.scenarios[p.scenario];
  if (p.pick.kind === "zone") {
    const z = sc.zones[p.pick.id], zi = p.inputs.zones[p.pick.id], look = zoneLook(z, p.scenario);
    const pond = sc.ponds[z.drains_to];
    return (
      <aside className="card">
        <button className="icon-btn close" onClick={p.close} aria-label="Close"><X size={16} /></button>
        <h3>{p.pick.id} · {zi.name}</h3>
        <div className="sub">{zi.council} council side · draft zone, awaiting hydrology sign-off</div>
        <span className="band-tag" style={{ background: BAND_COLOR[look.band], color: look.band === "base" ? "var(--ink)" : "#fff" }}>{look.label}</span>
        <dl style={{ marginTop: 12 }}>
          <Row k="Area">{num(zi.area_ha.value, 1)} ha</Row>
          <Row k="Runoff C">{num(zi[p.scenario === "now" ? "c_now" : "c_upstream"].value, 2)} <span className="conf">{zi.c_now.confidence}</span></Row>
          <Row k="Drains to">{drainsTo(z.drains_to)}</Row>
          <Row k="Peak flow">{num(z.q_m3_s, 1)} m³/s in the {sc.duration_h}-hour design storm</Row>
          {pond && <Row k={`${z.drains_to === "pond_A" ? "Pond A" : "Pond B"} must hold`}>{m3(pond.storage_required_m3)} ({change(pond.change_vs_now)} vs today)</Row>}
          {z.drains_to === "trunk_drain" && <Row k="Trunk drain load">{num(sc.trunk_drain.direct_demand_m3_s, 1)} of {num(sc.trunk_drain.capacity_m3_s, 1)} m³/s ({change(sc.trunk_drain.change_vs_now)} vs today)</Row>}
        </dl>
        <div className="note"><b>Route (mapped drains, draft):</b> {p.routes[p.pick.id].replace(/->/g, "→").replace(/\.?$/, ".")} Arrows show each drain's mapped direction: usually, not always, the flow.</div>
      </aside>
    );
  }
  const id = p.pick.id;
  const pond = id === "pond_whatif" ? sc.what_if_pond : sc.ponds[id];
  const name = id === "pond_whatif" ? "What-if pond" : id === "pond_A" ? "Pond A" : "Pond B";
  return (
    <aside className="card">
      <button className="icon-btn close" onClick={p.close} aria-label="Close"><X size={16} /></button>
      <h3><Droplet size={16} style={{ verticalAlign: -2, color: "var(--water)" }} /> {name}</h3>
      <div className="sub">{id === "pond_whatif" ? "Invented what-if on OSM brownfield land in Z06, not a proposal" : "Mapped retention pond (OpenStreetMap), Klang council side"}</div>
      {!pond ? <p className="note">Shown only in the “+ What-if pond” scenario.</p> : <>
        <div className="sub" style={{ margin: "6px 0 0" }}>Storage required in the {sc.duration_h}-hour, 100-year design storm</div>
        <div className="big">{m3(pond.storage_required_m3)}</div>
        <dl style={{ marginTop: 10 }}>
          {"change_vs_now" in pond && <Row k="Vs today">{change(pond.change_vs_now)}</Row>}
          <Row k="Inflow">{m3(pond.inflow_m3)}</Row>
          <Row k="Released">{m3(pond.released_m3)}{"allowed_release_m3_s" in pond && ` (allowed ${num(pond.allowed_release_m3_s, 1)} m³/s, got ${num(pond.release_m3_s, 1)})`}</Row>
          <Row k="Stated capacity">{pond.capacity_m3 ? m3(pond.capacity_m3) : "not public: enter it in Adjust"}</Row>
          {pond.gap_m3 !== null && pond.gap_m3 !== undefined && <Row k={pond.gap_m3 > 0 ? "Shortfall" : "To spare"}>{m3(Math.abs(pond.gap_m3))}</Row>}
        </dl>
        <div className="note">Water level in the model is a gauge of storage required ({pond.gauge_basis === "capacity" ? "share of the entered capacity" : "share of the largest scenario"}), not a depth. Release is capped at the pre-development peak flow (MSMA 2, Qpost ≤ Qpre) and by room in the shared trunk drain.</div>
      </>}
    </aside>
  );
}

export function AdjustPanel(p: { inputs: any; adjust: Adjust; set: (a: Adjust) => void; close: () => void }) {
  const sec = p.inputs.trunk_drain.section, ext = p.inputs.external_inflows.EXT_A;
  const a = p.adjust;
  const field = (label: string, value: number, unit: string, min: number, max: number, step: number, key: keyof Adjust, help: string) => (
    <div className="field">
      <label><span>{label}</span><b>{num(value, step < 0.1 ? 2 : step < 1 ? 1 : 0)} {unit}</b></label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => p.set({ ...a, [key]: +e.target.value })} />
      <small>{help}</small>
    </div>
  );
  const cap = (label: string, key: "capA" | "capB") => (
    <div className="field">
      <label><span>{label}</span></label>
      <input type="number" min={0} step={1000} placeholder="not public: enter a stated figure" value={a[key] ?? ""}
        onChange={(e) => p.set({ ...a, [key]: e.target.value === "" ? null : +e.target.value })} />
    </div>
  );
  return (
    <aside className="panel">
      <button className="icon-btn close" style={{ position: "absolute", top: 8, right: 8, width: 30, height: 30 }} onClick={p.close} aria-label="Close"><X size={16} /></button>
      <h4>Adjust the assumptions</h4>
      <div className="sub" style={{ fontSize: 12, color: "var(--ink-3)" }}>Recomputed live in your browser with the same MSMA 2 method. These are what-ifs, not facts.</div>
      {field("Trunk drain top width", a.drainTopWidth ?? sec.top_width_m.value, "m", 3, 14, 0.5, "drainTopWidth",
        "Not measurable from public data (confidence L). It decides whether the ponds can release during the storm.")}
      {field("Upstream area beyond the edge", a.extArea ?? ext.area_ha.value, "ha", 0, 300, 10, "extArea",
        "Area A land draining through the council-line crossing. No public boundary (L).")}
      {field("Upstream C after the change", a.extC ?? ext.c_upstream.value, "", 0.65, 0.95, 0.01, "extC",
        "0.90 = link and terrace housing (MSMA 2 Table 2.5), where peak control is not fully achieved.")}
      {field("What-if pond size", a.pondSize ?? p.inputs.what_if_pond.capacity_m3.value, "m³", 0, 60000, 1000, "pondSize",
        "Holds what it catches during the storm and empties afterwards.")}
      {cap("Stated capacity, pond A (m³)", "capA")}
      {cap("Stated capacity, pond B (m³)", "capB")}
      <button className="text-btn" onClick={() => p.set({})}>Reset to the sourced values</button>
    </aside>
  );
}

export function About(p: { inputs: any; results: any; close: () => void }) {
  const rows: [string, any][] = [];
  const walk = (node: any, path: string) => {
    if (node && typeof node === "object" && !Array.isArray(node)) {
      if ("status" in node && "value" in node) { rows.push([path, node]); return; }
      for (const [k, v] of Object.entries(node)) if (!k.startsWith("_") && k !== "zones" && k !== "cover_ha") walk(v, path ? `${path}.${k}` : k);
    }
  };
  walk(p.inputs, "");
  const show = (v: any) => (v === null ? "—" : Array.isArray(v) ? v.join(", ") : typeof v === "number" ? num(v, v < 10 && v % 1 ? 3 : 0) : String(v));
  return (
    <>
      <div className="drawer-bg" onClick={p.close} />
      <div className="drawer">
        <button className="icon-btn" style={{ float: "right" }} onClick={p.close} aria-label="Close"><X size={18} /></button>
        <h2>About these numbers</h2>
        <p><b>Decision support under uncertainty, not prediction.</b> RainReady screens how much storage the township's ponds would need in a design storm, and how that changes with land upstream, using the published Malaysian method (MSMA 2nd Edition, DID 2012). It shows <b>no flood depths, no times, no compliance verdicts</b>, and it is not an alert: for warnings, use <a href="https://publicinfobanjir.water.gov.my/" target="_blank" rel="noreferrer">Public Infobanjir (JPS)</a> and <a href="https://www.met.gov.my/" target="_blank" rel="noreferrer">METMalaysia</a>.</p>
        <h3>Method</h3>
        <ol>
          <li>Rainfall from MSMA 2's IDF equation (Eq. 2.2) for gauge {p.inputs.storm.idf.station}, 100-year ARI (Table 1.1), tested over storm durations; the design storm is today's critical one ({p.results.scenarios.now.duration_h} h).</li>
          <li>Peak flow per zone by the Rational Method, Q = C·i·A/360 (Eq. 2.3); C from Table 2.5, area-weighted over each zone's land cover. All zones are under the method's 80 ha limit.</li>
          <li>Runoff volume = Q × duration (Rational Hydrograph Method, 2.3.2).</li>
          <li>Ponds may release at most the pre-development peak flow (MSMA 1.2.1, Qpost ≤ Qpre; former oil palm, C 0.40), and only what the shared trunk drain still has room for (Manning, assumed section).</li>
          <li>Storage required = inflow − release. Stated pond capacities are not public, so they are a planner input; without one, zones show the <b>change versus today</b>.</li>
        </ol>
        <h3>Every input</h3>
        <table className="t">
          <thead><tr><th>Input</th><th>Value</th><th>Status</th><th>Conf.</th><th>Source</th></tr></thead>
          <tbody>{rows.map(([k, v]) => (
            <tr key={k}><td>{k}</td><td className="num">{show(v.value)} {v.unit && v.unit !== "-" ? v.unit : ""}</td><td>{v.status}</td><td><span className="conf">{v.confidence}</span></td><td>{v.source}</td></tr>
          ))}</tbody>
        </table>
        <p style={{ marginTop: 10 }}>Runoff coefficients per zone are measured from the model's land cover: see each zone's card.</p>
        <h3>Limits</h3>
        <ul>
          <li>The town fabric is a <b>simulated layout loosely based on Bandar Bukit Raja</b>; the ponds, drains, main ditch, council line and flood streets are mapped (OpenStreetMap). Area A and Area B are a simulated pair based on Setia Alam (Shah Alam) and Bandar Bukit Raja (Klang).</li>
          <li>Zone edges are a draft from mapped roads and drains, not an official catchment.</li>
          <li>Screening, not design: MSMA does not recommend the Rational Method for designing storage. Only the trunk drain is counted as conveyance, so storage required is an upper-end figure.</li>
          <li>The trunk drain's size is the biggest unknown: try it in <b>Adjust</b>.</li>
        </ul>
        <p style={{ fontSize: 12 }}>Map data © OpenStreetMap contributors (ODbL). Terrain: Copernicus DEM GLO-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH, provided under COPERNICUS by the European Union and ESA.</p>
      </div>
    </>
  );
}
