// Shared Capacity Brief (concept feature 4, with the responsibility record, feature 7): one printable page made from
// the same results as the planner view.
import { ArrowLeft, Printer } from "lucide-react";
import { SCENARIOS, zoneLook } from "../lib/data";
import { change, drainsTo, m3, num } from "../lib/format";
import { Wordmark } from "./Planner";

export function Brief({ inputs, results, adjusted }: { inputs: any; results: any; adjusted: boolean }) {
  const inp = inputs, S = results.scenarios, now = S.now;   // the inputs actually used (adjusted if the planner changed any)
  const status = results.illustrative ? "Illustrative values (placeholder inputs)" : adjusted ? "Planner what-if (adjusted assumptions)" : "Screening estimate on sourced and stated values";
  const pond = (id: string, label: string) => (
    <div className="kpi">
      <div className="label">{label}: storage required today</div>
      <div className="big">{m3(now.ponds[id].storage_required_m3)}</div>
      <div className="label">Upstream change: {change(S.upstream.ponds[id].change_vs_now)} · with what-if pond: {change(S.upstream_plus_pond.ponds[id].change_vs_now)}</div>
    </div>
  );
  return (
    <div className="page">
      <header>
        <Wordmark />
        <div className="noprint" style={{ display: "flex", gap: 8 }}>
          <a className="text-btn" href="#/"><ArrowLeft size={16} /> Planner view</a>
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
      <div className="sheet" style={{ marginTop: 12 }}>
        <table className="t">
          <thead><tr><th>Scenario</th><th>Pond A</th><th>Pond B</th><th>Trunk drain load</th><th>Gap vs stated capacity</th></tr></thead>
          <tbody>{SCENARIOS.map((s) => {
            const r = S[s.id];
            const gap = (id: string) => (r.ponds[id].gap_m3 === null ? null : `${id === "pond_A" ? "A" : "B"} ${r.ponds[id].gap_m3 > 0 ? "short" : "spare"} ${m3(Math.abs(r.ponds[id].gap_m3))}`);
            const gaps = [gap("pond_A"), gap("pond_B")].filter(Boolean);
            return (
              <tr key={s.id}><td>{r.label}</td>
                <td className="num">{m3(r.ponds.pond_A.storage_required_m3)} <small>({change(r.ponds.pond_A.change_vs_now)})</small></td>
                <td className="num">{m3(r.ponds.pond_B.storage_required_m3)} <small>({change(r.ponds.pond_B.change_vs_now)})</small></td>
                <td className="num">{num(r.trunk_drain.direct_demand_m3_s, 1)} m³/s <small>({change(r.trunk_drain.change_vs_now)})</small></td>
                <td>{gaps.length ? gaps.join("; ") : "capacities not public: enter them in the planner view"}</td></tr>
            );
          })}</tbody>
        </table>
        <p style={{ fontSize: 12.5, marginBottom: 0 }}>Scenario differences are differences between scenarios, never an attribution of cause or blame.
          The upstream scenario means more paved land upstream <i>where peak control is not fully achieved</i>; under MSMA 1.2.1 (Qpost ≤ Qpre) a fully controlled development would not raise peak flow.</p>
      </div>

      <h2>Zones (draft, awaiting hydrology sign-off)</h2>
      <div className="sheet">
        <table className="t">
          <thead><tr><th>Zone</th><th>Council side</th><th>Area</th><th>C now → upstream</th><th>Drains to</th>{SCENARIOS.slice(1).map((s) => <th key={s.id}>{s.label}</th>)}</tr></thead>
          <tbody>{Object.entries<any>(inp.zones).map(([id, z]) => (
            <tr key={id}><td><b>{id}</b> {z.name}</td><td>{z.council}</td><td className="num">{num(z.area_ha.value, 1)} ha</td>
              <td className="num">{num(z.c_now.value, 2)} → {num(z.c_upstream.value, 2)}</td><td>{drainsTo(z.drains_to)}</td>
              {SCENARIOS.slice(1).map((s) => <td key={s.id}>{zoneLook(S[s.id].zones[id], s.id).label}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>

      <h2>Responsibility record</h2>
      <div className="sheet">
        <table className="t">
          <thead><tr><th>Asset</th><th>Mapped as</th><th>Who maintains it</th><th>Conf.</th></tr></thead>
          <tbody>
            <tr><td>Pond A</td><td>OSM 399570465, "Flood Retention Pond"</td><td>[TBD]</td><td><span className="conf">L</span></td></tr>
            <tr><td>Pond B</td><td>OSM 359496461, "Flood Retention Pond"</td><td>[TBD]</td><td><span className="conf">L</span></td></tr>
            <tr><td>Shared trunk drain</td><td>OSM ditch chain at the council corner to the main ditch</td><td>[TBD]</td><td><span className="conf">L</span></td></tr>
            <tr><td>Main ditch</td><td>OSM way 888406336</td><td>[TBD]</td><td><span className="conf">L</span></td></tr>
            <tr><td>Council-line crossing drain</td><td>OSM drain at 3.09294 N, 101.44433 E</td><td>[TBD]</td><td><span className="conf">L</span></td></tr>
          </tbody>
        </table>
        <p style={{ fontSize: 12.5, marginBottom: 0 }}>Owners are left blank until a source names them. The record exists so that each party can fill in its own line.</p>
      </div>

      <h2>Key assumptions</h2>
      <ul>
        <li>Rainfall: MSMA 2 IDF constants for gauge {inp.storm.idf.station} (H); the gauge was chosen as the nearest listed in Table 2.B1 (M, coordinates to verify).</li>
        <li>Runoff coefficients: MSMA 2 Table 2.5 (major system), area-weighted over the land cover of the <b>simulated</b> model town (M).</li>
        <li>Pond release capped at the pre-development peak flow, former oil palm C 0.40 (MSMA 1.2.1) and by room in the trunk drain (M).</li>
        <li>Trunk drain: concrete trapezoid, top {inp.trunk_drain.section.top_width_m.value} m, n 0.018 (Table 2.3), slope 0.0013: <b>size not measurable from public data (L) and the result depends on it most</b>.</li>
        <li>Upstream area beyond the model edge: {inp.external_inflows.EXT_A.area_ha.value} ha test value (L).</li>
        <li>Stated pond capacities are not public, so they are not claimed. Enter them in the planner view to see the gap.</li>
      </ul>
      <p style={{ fontSize: 12 }}>Sources: MSMA 2nd Edition (DID Malaysia, 2012), Chapters 1 and 2; OpenStreetMap contributors (ODbL); Copernicus DEM GLO-30. The town fabric is a simulated layout loosely based on Bandar Bukit Raja; Area A / Area B are a simulated pair based on Setia Alam (Shah Alam) and Bandar Bukit Raja (Klang).</p>
    </div>
  );
}
