// Shared Capacity Brief (concept feature 4, with the responsibility record, feature 7): one printable page made from
// the same results as the planner view.
import { useMemo } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { ASSUMED_CAP, DRAIN_WIDTHS_COMPARED, SCENARIOS, setDrainWidth, zoneLook } from "../lib/data";
import { change, drainsTo, m3, num } from "../lib/format";
import { run } from "../sim/screening.ts";
import { Wordmark } from "./Shell";

const P = { pond_A: "A", pond_B: "B" } as Record<string, string>;

/** Gap of one pond against its stated capacity, or the assumed one (labelled) until a planner enters it. */
function gapOf(p: any, id: string) {
  const cap = p.capacity_m3 ?? ASSUMED_CAP[id];
  const gap = p.storage_required_m3 - cap;
  return { gap, assumed: p.capacity_m3 === null, text: `${gap > 0 ? "short" : "spare"} ${m3(Math.abs(gap))}` };
}

/**
 * The same inputs re-run with wider trunk drains. Ponds may only release into room left in the drain, so on a full
 * drain the upstream change cannot reach pond storage; with room, it can. The drain's size is the least known input.
 */
function drainRows(inp: any) {
  const w0 = inp.trunk_drain.section.top_width_m.value;
  return [w0, ...DRAIN_WIDTHS_COMPARED.filter((w) => w !== w0)].map((w) => {
    const copy = JSON.parse(JSON.stringify(inp));
    if (w !== w0) setDrainWidth(copy, w);
    return { w, assumed: w === w0, S: run(copy).scenarios };
  });
}

export function Brief({ inputs, results, adjusted }: { inputs: any; results: any; adjusted: boolean }) {
  const inp = inputs, S = results.scenarios, now = S.now;   // the inputs actually used (adjusted if the planner changed any)
  const status = results.illustrative ? "Illustrative values (placeholder inputs)" : adjusted ? "Planner what-if (adjusted assumptions)" : "Screening estimate on sourced and stated values";
  const drains = useMemo(() => drainRows(inp), [inp]);
  const noRoom = S.now.trunk_drain.pond_release_share === 0 && S.upstream.trunk_drain.pond_release_share === 0;
  const anyAssumed = ["pond_A", "pond_B"].some((id) => now.ponds[id].capacity_m3 === null);
  const pond = (id: string, label: string) => (
    <div className="kpi">
      <div className="label">{label}: storage required today</div>
      <div className="big">{m3(now.ponds[id].storage_required_m3)}</div>
      <div className="label">Upstream change: {change(S.upstream.ponds[id].change_vs_now)}{noRoom && " (the shared drain has no room for pond release, see below)"} · with what-if pond: {change(S.upstream_plus_pond.ponds[id].change_vs_now)}</div>
    </div>
  );
  return (
    <div className="page">
      <header>
        <Wordmark />
        <div className="noprint" style={{ display: "flex", gap: 8 }}>
          <a className="text-btn" href="#/planner"><ArrowLeft size={16} /> Planner view</a>
          <button className="text-btn" onClick={() => print()}><Printer size={16} /> Print</button>
        </div>
      </header>
      <span className="pill">{status}</span>
      <h1>Shared Capacity Brief</h1>
      <p>Storage the township's ponds would need in a 100-year design storm, how it changes with land upstream, and who
        holds each piece. Prepared from mapped drains and ponds (OpenStreetMap), MSMA 2nd Edition (DID 2012) and stated
        assumptions. <b>Decision support, not a forecast and not a design.</b> No depths, no times, no verdicts.</p>

      <h2>Design storm</h2>
      <div className="kpis">
        <div className="kpi"><div className="label">Return period</div><div className="big">100 years</div><div className="label">MSMA 2 Table 1.1 (link house, major system)</div></div>
        <div className="kpi"><div className="label">Critical duration today</div><div className="big">{now.duration_h} h</div><div className="label">{num(now.intensity_mm_hr, 1)} mm/hr at gauge {inp.storm.idf.station.split(" ")[0]}</div></div>
        <div className="kpi"><div className="label">Shared trunk drain, today</div><div className="big">{Math.round(now.trunk_drain.ratio * 100)} %</div><div className="label">of its assumed conveyance ({num(now.trunk_drain.capacity_m3_s, 1)} m³/s, confidence L)</div></div>
      </div>

      <h2>Storage required</h2>
      <div className="kpis">{pond("pond_A", "Pond A")}{pond("pond_B", "Pond B")}</div>
      <div className="sheet" style={{ marginTop: 12 }} data-spot="brief-table">
        <table className="t">
          <thead><tr><th>Scenario</th><th>Pond A</th><th>Pond B</th><th>Trunk drain load</th><th>Gap vs capacity</th></tr></thead>
          <tbody>{SCENARIOS.map((s) => {
            const r = S[s.id];
            return (
              <tr key={s.id}><td>{r.label}</td>
                <td className="num">{m3(r.ponds.pond_A.storage_required_m3)} <small>({change(r.ponds.pond_A.change_vs_now)})</small></td>
                <td className="num">{m3(r.ponds.pond_B.storage_required_m3)} <small>({change(r.ponds.pond_B.change_vs_now)})</small></td>
                <td className="num">{num(r.trunk_drain.direct_demand_m3_s, 1)} m³/s <small>({change(r.trunk_drain.change_vs_now)})</small></td>
                <td style={{ whiteSpace: "nowrap" }}>{["pond_A", "pond_B"].map((id) => <div key={id}>{P[id]} {gapOf(r.ponds[id], id).text}</div>)}</td></tr>
            );
          })}</tbody>
        </table>
        <p style={{ fontSize: 12.5, marginBottom: 0 }}>Capacity used for the gap: {["pond_A", "pond_B"].map((id) => {
          const c = now.ponds[id].capacity_m3;
          return `Pond ${P[id]} ${c === null ? `${m3(ASSUMED_CAP[id])} assumed` : `${m3(c)} entered by the planner`}`;
        }).join(", ")}.{anyAssumed && <> Stated capacities are not public; an assumed one is the mapped water area × 1.5 m of live storage <span className="conf">L</span>, until a planner enters a stated figure.</>}</p>
        <p style={{ fontSize: 12.5, marginBottom: 0 }}>Scenario differences are differences between scenarios, never an attribution of cause or blame.
          The upstream scenario means more paved land upstream <i>where peak control is not fully achieved</i>; under MSMA 1.2.1 (Qpost ≤ Qpre) a fully controlled development would not raise peak flow.</p>
      </div>

      <h2>What the upstream change does depends on the shared drain</h2>
      <p>Ponds may only release into room left in the shared trunk drain. When the drain is full, they release nothing,
        so the upstream change shows up in the drain, not in pond storage. When it has room, the same upstream change
        takes some of that room and the ponds must hold more. No public record gives the drain's size <span className="conf">L</span>,
        so the Brief runs the same method at wider sizes.</p>
      <div className="sheet" data-spot="brief-drain">
        <table className="t">
          <thead><tr><th>Drain top width</th><th>Load today</th><th>Ponds release today → with upstream change</th><th>Pond A: today → upstream change</th><th>Pond B: today → upstream change</th></tr></thead>
          <tbody>{drains.map(({ w, assumed, S: R }) => {
            const share = (s: string) => `${Math.round(R[s].trunk_drain.pond_release_share * 100)} %`;
            const cell = (id: string) => {
              const a = R.now.ponds[id], b = R.upstream.ponds[id];
              return <>{m3(a.storage_required_m3)} → {m3(b.storage_required_m3)} <small>({change(b.change_vs_now)})</small>
                <br /><small>gap: {gapOf(a, id).text} → {gapOf(b, id).text}</small></>;
            };
            return (
              <tr key={w}><td style={{ whiteSpace: "nowrap" }}><b>{w} m</b> <small>{assumed ? "as assumed" : "test size"}</small></td>
                <td className="num">{Math.round(R.now.trunk_drain.ratio * 100)} %</td>
                <td className="num">{share("now")} → {share("upstream")} <small>of allowed</small></td>
                <td className="num">{cell("pond_A")}</td><td className="num">{cell("pond_B")}</td></tr>
            );
          })}</tbody>
        </table>
        <p style={{ fontSize: 12.5, marginBottom: 0 }}>Each row re-runs the screening with only the drain's size changed (bottom half the top width, depth scaled with it). A wider drain also changes the critical storm duration, so storage today differs between rows. Gap against the capacity named above.</p>
      </div>

      <h2>Zones (draft, awaiting hydrology sign-off)</h2>
      <div className="sheet">
        <table className="t">
          <thead><tr><th>Zone</th><th>Council side</th><th>Area</th><th>C now → upstream</th><th>Drains to</th><th>Storage shortfall today</th>{SCENARIOS.slice(1).map((s) => <th key={s.id}>{s.label}</th>)}</tr></thead>
          <tbody>{Object.entries<any>(inp.zones).map(([id, z]) => (
            <tr key={id}><td><b>{id}</b> {z.name}</td><td>{z.council}</td><td className="num">{num(z.area_ha.value, 1)} ha</td>
              <td className="num">{num(z.c_now.value, 2)} → {num(z.c_upstream.value, 2)}</td><td>{drainsTo(z.drains_to)}</td>
              <td>{zoneLook(now.zones[id], "now", now, "capacity").label}</td>
              {SCENARIOS.slice(1).map((s) => <td key={s.id}>{zoneLook(S[s.id].zones[id], s.id, S[s.id], "change").label}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>

      <h2>Responsibility record</h2>
      <div className="sheet" data-spot="brief-owners">
        <table className="t">
          <thead><tr><th>Asset</th><th>Mapped as</th><th>Who maintains it</th><th>Conf.</th></tr></thead>
          <tbody>
            <tr><td>Pond A</td><td>OSM 399570465; JPS pond K02 (Persiaran Batu Belah, 12 acres)</td><td>JPS Selangor: on its phase-1 pond list (surveyed 2011)</td><td><span className="conf">M</span></td></tr>
            <tr><td>Pond B</td><td>OSM 359496461; JPS pond K03 (Persiaran Batu Belah, 14 acres)</td><td>JPS Selangor: on its phase-1 pond list (surveyed 2011)</td><td><span className="conf">M</span></td></tr>
            <tr><td>Shared trunk drain</td><td>OSM ditch chain from the council corner to the main ditch</td><td>Assumed MBDK (Selangor rule: drains to monsoon drains are the council's)</td><td><span className="conf">L</span></td></tr>
            <tr><td>Main ditch</td><td>OSM way 888406336</td><td>Assumed JPS Selangor (Selangor rule: drains to rivers are JPS's)</td><td><span className="conf">L</span></td></tr>
            <tr><td>Council-line crossing drain</td><td>OSM drain at 3.09294 N, 101.44433 E</td><td>Assumed MBSA above the line, MBDK below it</td><td><span className="conf">L</span></td></tr>
          </tbody>
        </table>
        <p style={{ fontSize: 12.5, marginBottom: 0 }}>Sources: JPS Selangor GIS, layer Kolam_Fasa_JPS (read 21 Oct 2026); the Selangor rule for unowned drains (Utusan, 4 Sep 2025). Lines marked L are assumptions until the party confirms its own line; the record exists so that each party can.</p>
      </div>

      <h2>Key assumptions</h2>
      <ul>
        <li>Rainfall: MSMA 2 IDF constants for gauge {inp.storm.idf.station} (H); the gauge (Telok Gong, 2.995 N 101.368 E on JPS's station layer, about 13 km south-west) is the nearest listed in Table 2.B1 (H).</li>
        <li>Runoff coefficients: MSMA 2 Table 2.5 (major system), area-weighted over the land cover of the <b>simulated</b> model town (M).</li>
        <li>Pond release capped at the pre-development peak flow, former oil palm C 0.40 (MSMA 1.2.1) and by room in the trunk drain (M).</li>
        <li>Trunk drain: concrete trapezoid, top {inp.trunk_drain.section.top_width_m.value} m, n 0.018 (Table 2.3), slope 0.0013: <b>size not measurable from public data (L) and the result depends on it most</b>.</li>
        <li>Upstream area beyond the model edge: {inp.external_inflows.EXT_A.area_ha.value} ha test value (L).</li>
        <li>Stated pond capacities are not public, so none is claimed. Until a planner enters one, gaps are shown against an assumed capacity: mapped water area × 1.5 m of live storage (Pond A {m3(ASSUMED_CAP.pond_A)}, Pond B {m3(ASSUMED_CAP.pond_B)}), confidence L.</li>
      </ul>
      <p style={{ fontSize: 12 }}>Sources: MSMA 2nd Edition (DID Malaysia, 2012), Chapters 1 and 2; OpenStreetMap contributors (ODbL); Copernicus DEM GLO-30. The town fabric is a simulated layout loosely based on Bandar Bukit Raja; Area A / Area B are a simulated pair based on Setia Alam (Shah Alam) and Bandar Bukit Raja (Klang).</p>
    </div>
  );
}
