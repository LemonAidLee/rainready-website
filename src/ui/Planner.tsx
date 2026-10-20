// Planner view panels: the live results panel, the zone / pond inspector card, the band legend and the About drawer.
import { Droplet, X } from "lucide-react";
import type { ReactNode } from "react";
import { BAND_COLOR, zoneLook, type Controls, type ScenarioId } from "../lib/data";
import { change, drainsTo, m3, num } from "../lib/format";
import type { Pick } from "../scene/Township";

function Delta({ r }: { r: number | null | undefined }) {
  if (r === null || r === undefined) return null;
  const p = Math.round((r - 1) * 100);
  return <span className={`delta ${p > 0 ? "up" : p < 0 ? "down" : ""}`}>{p === 0 ? "= today" : `${p > 0 ? "▲" : "▼"} ${Math.abs(p)} % vs today`}</span>;
}

function Bar({ v, max, mark, color }: { v: number; max: number; mark?: number; color: string }) {
  return (
    <div className="bar">
      <i style={{ transform: `scaleX(${Math.min(1, v / max)})`, background: color }} />
      {mark !== undefined && <em style={{ left: `${Math.min(100, (mark / max) * 100)}%` }} />}
    </div>
  );
}

export function Results(p: { res: any; base: any; scenario: ScenarioId; name: string; c: Controls; storm: number }) {
  const sc = p.res.scenarios[p.scenario], now = p.res.scenarios.now;
  const top = Math.max(...["pond_A", "pond_B"].flatMap((id) => [sc.ponds[id].storage_required_m3, now.ponds[id].storage_required_m3, sc.ponds[id].capacity_m3 ?? 0]));
  const pond = (id: "pond_A" | "pond_B") => {
    const q = sc.ponds[id];
    const over = q.capacity_m3 && q.storage_required_m3 > q.capacity_m3;
    return (
      <div className="res-row" data-spot={`res-${id}`}>
        <div className="res-k">POND {id.slice(-1)} · STORAGE REQUIRED</div>
        <div className="res-v"><b>{m3(q.storage_required_m3)}</b><Delta r={q.change_vs_now} /></div>
        <Bar v={q.storage_required_m3} max={top * 1.08} mark={q.capacity_m3 ?? now.ponds[id].storage_required_m3}
          color={over ? BAND_COLOR.high : "#3aa0ff"} />
        <div className="res-sub">{q.capacity_m3
          ? <>{over ? "Over" : "Within"} the entered capacity {m3(q.capacity_m3)} · {q.gap_m3 > 0 ? "short" : "spare"} {m3(Math.abs(q.gap_m3))}</>
          : <>Marker = today · releases {q.released_m3 < 1 ? "nothing" : m3(q.released_m3)} during the storm</>}</div>
      </div>
    );
  };
  const t = sc.trunk_drain;
  const tc = t.ratio >= 1 ? BAND_COLOR.high : t.ratio >= 0.8 ? BAND_COLOR.medium : "#35d0e6";
  return (
    <aside className="panel panel-right results" data-spot="results">
      <div className="panel-head"><span>SCREENING RESULT</span><em>{p.storm > 0.5 ? "STORM" : "CLEAR DAY"}</em></div>
      <div className="res-scen">{p.name}</div>
      <div className="res-storm">{p.c.ari}-year · {sc.duration_h}-hour design storm · {num(sc.intensity_mm_hr, 1)} mm/h</div>
      {pond("pond_A")}
      {pond("pond_B")}
      <div className="res-row" data-spot="res-trunk">
        <div className="res-k">SHARED TRUNK DRAIN · LOAD</div>
        <div className="res-v"><b style={{ color: tc }}>{Math.round(t.ratio * 100)} %</b><Delta r={t.change_vs_now} /></div>
        <Bar v={t.direct_demand_m3_s} max={Math.max(t.capacity_m3_s, t.direct_demand_m3_s) * 1.15} mark={t.capacity_m3_s} color={tc} />
        <div className="res-sub">{num(t.direct_demand_m3_s, 1)} of {num(t.capacity_m3_s, 1)} m³/s · marker = assumed capacity</div>
      </div>
      {sc.what_if_pond && (
        <div className="res-row" data-spot="res-whatif">
          <div className="res-k">WHAT-IF POND</div>
          <div className="res-v"><b>{m3(Math.min(sc.what_if_pond.storage_required_m3, sc.what_if_pond.capacity_m3 ?? Infinity))}</b><span className="delta down">held</span></div>
          <div className="res-sub">of {m3(sc.what_if_pond.capacity_m3)} · catches zone Z06 before pond A</div>
        </div>
      )}
      <div className="res-foot">Screening estimate, MSMA 2 method. Not a design, not a forecast. No depths.</div>
    </aside>
  );
}

export function Legend({ results, scenario, storm }: { results: any; scenario: ScenarioId; storm: number }) {
  if (storm < 0.5) return <span className="lg-note">Mapped: ponds, drains, council line · simulated: town fabric</span>;
  const basis = Object.values<any>(results.scenarios[scenario].zones).some((z) => z.band_basis === "capacity") ? "capacity" : "change";
  if (scenario === "now" && basis === "change")
    return <span className="lg-note">Today is the baseline · move a lever to see what changes</span>;
  const items = basis === "capacity"
    ? [["low", "< 80 % of capacity"], ["medium", "80–100 %"], ["high", "over capacity"], ["unknown", "outlet unknown"]]
    : [["low", "no real increase"], ["medium", "+5–20 %"], ["high", "> +20 %"], ["unknown", "outlet unknown"]];
  return <>{items.map(([b, t]) => <span key={b} className="lg"><i style={{ background: BAND_COLOR[b] }} />{t}</span>)}</>;
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
      <aside className="panel card" data-spot="card">
        <div className="panel-head"><span>ZONE {p.pick.id}</span><button className="x" onClick={p.close} aria-label="Close"><X size={14} /></button></div>
        <h3>{zi.name}</h3>
        <div className="sub">{zi.council} council side · draft zone, awaiting hydrology sign-off</div>
        <span className="band-tag" style={{ ["--b" as any]: BAND_COLOR[look.band] }}>{look.label}</span>
        <dl>
          <Row k="Area">{num(zi.area_ha.value, 1)} ha</Row>
          <Row k="Runoff C">{num(zi.c_now.value, 2)} today <span className="conf">{zi.c_now.confidence}</span></Row>
          <Row k="Drains to">{drainsTo(z.drains_to)}</Row>
          <Row k="Peak flow">{num(z.q_m3_s, 1)} m³/s ({sc.duration_h}-h storm)</Row>
          {pond && <Row k={`${z.drains_to === "pond_A" ? "Pond A" : "Pond B"} must hold`}>{m3(pond.storage_required_m3)} ({change(pond.change_vs_now)} vs today)</Row>}
          {z.drains_to === "trunk_drain" && <Row k="Trunk drain">{num(sc.trunk_drain.direct_demand_m3_s, 1)} of {num(sc.trunk_drain.capacity_m3_s, 1)} m³/s ({change(sc.trunk_drain.change_vs_now)} vs today)</Row>}
        </dl>
        <div className="note"><b>Route (mapped drains, draft):</b> {p.routes[p.pick.id].replace(/->/g, "→").replace(/\.?$/, ".")} Arrows show each drain's mapped direction: usually, not always, the flow.</div>
      </aside>
    );
  }
  const id = p.pick.id;
  const pond = id === "pond_whatif" ? sc.what_if_pond : sc.ponds[id];
  const name = id === "pond_whatif" ? "What-if pond" : id === "pond_A" ? "Pond A" : "Pond B";
  return (
    <aside className="panel card" data-spot="card">
      <div className="panel-head"><span><Droplet size={12} style={{ verticalAlign: -1 }} /> {name.toUpperCase()}</span><button className="x" onClick={p.close} aria-label="Close"><X size={14} /></button></div>
      <div className="sub">{id === "pond_whatif" ? "Invented what-if on OSM brownfield land in Z06, not a proposal" : "Mapped retention pond (OpenStreetMap), Klang council side"}</div>
      {!pond ? <p className="note">Switch on the what-if pond in Scenario control.</p> : <>
        <div className="sub" style={{ margin: "8px 0 0" }}>Storage required in the {sc.duration_h}-hour design storm</div>
        <div className="big">{m3(pond.storage_required_m3)}</div>
        <dl>
          {"change_vs_now" in pond && <Row k="Vs today">{change(pond.change_vs_now)}</Row>}
          <Row k="Inflow">{m3(pond.inflow_m3)}</Row>
          <Row k="Released">{m3(pond.released_m3)}{"allowed_release_m3_s" in pond && ` (allowed ${num(pond.allowed_release_m3_s, 1)} m³/s, got ${num(pond.release_m3_s, 1)})`}</Row>
          <Row k="Stated capacity">{pond.capacity_m3 ? m3(pond.capacity_m3) : "not public: enter it in Scenario control"}</Row>
          {pond.gap_m3 !== null && pond.gap_m3 !== undefined && <Row k={pond.gap_m3 > 0 ? "Shortfall" : "To spare"}>{m3(Math.abs(pond.gap_m3))}</Row>}
        </dl>
        <div className="note">Water level in the model is a gauge of storage required ({pond.gauge_basis === "capacity" ? "share of the entered capacity" : "share of the largest scenario"}), not a depth. Release is capped at the pre-development peak flow (MSMA 2, Qpost ≤ Qpre) and by room in the shared trunk drain.</div>
      </>}
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
        <div className="panel-head"><span>ABOUT THESE NUMBERS</span><button className="x" onClick={p.close} aria-label="Close"><X size={16} /></button></div>
        <h2>Decision support under uncertainty, not prediction</h2>
        <p>RainReady screens how much storage the township's ponds would need in a design storm, and how that changes with land upstream, using the published Malaysian method (MSMA 2nd Edition, DID 2012). It shows <b>no flood depths, no times, no compliance verdicts</b>, and it is not an alert: for warnings, use <a href="https://publicinfobanjir.water.gov.my/" target="_blank" rel="noreferrer">Public Infobanjir (JPS)</a> and <a href="https://www.met.gov.my/" target="_blank" rel="noreferrer">METMalaysia</a>.</p>
        <h3>Method</h3>
        <ol>
          <li>Rainfall from MSMA 2's IDF equation (Eq. 2.2) for gauge {p.inputs.storm.idf.station}, 100-year ARI (Table 1.1), tested over storm durations; the design storm is today's critical one ({p.results.scenarios.now.duration_h} h).</li>
          <li>Peak flow per zone by the Rational Method, Q = C·i·A/360 (Eq. 2.3); C from Table 2.5, area-weighted over each zone's land cover. All zones are under the method's 80 ha limit.</li>
          <li>Runoff volume = Q × duration (Rational Hydrograph Method, 2.3.2).</li>
          <li>Ponds may release at most the pre-development peak flow (MSMA 1.2.1, Qpost ≤ Qpre; former oil palm, C 0.40), and only what the shared trunk drain still has room for (Manning, assumed section).</li>
          <li>Storage required = inflow − release. Stated pond capacities are not public, so they are a planner input; without one, zones show the <b>change versus today</b>.</li>
        </ol>
        <h3>Independent cross-check</h3>
        <p>A teammate ran FastFlood (Fast Hazard B.V., v1.0.20; Copernicus GLO-30 at 20 m, ESA WorldCover, GPM IMERG design rain) over the same area for a 100-year storm. It shows water collecting in ponds A and B and along the east–west drain corridors, as our zones assume, and an effective runoff coefficient of 0.78–0.79 against our 0.63–0.78. We do not show its depth map: terrain error here is about 1 m. See research/FASTFLOOD_CROSSCHECK.md.</p>
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
          <li>The trunk drain's size is the biggest unknown: try it in Scenario control. The ribbon is drawn 2.5 × its width so it reads at overview zoom.</li>
        </ul>
        <p style={{ fontSize: 12 }}>Map data © OpenStreetMap contributors (ODbL). Terrain: Copernicus DEM GLO-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH, provided under COPERNICUS by the European Union and ESA.</p>
      </div>
    </>
  );
}
