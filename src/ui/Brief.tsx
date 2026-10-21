// Findings (#/brief): the Shared Capacity Brief (concept feature 4, with the responsibility record, feature 7), told as
// five short chapters with a picture each, for a first-time reader; the full tables sit in a folded section for
// engineers. Every number is read from the same simulator results as the planner view.
import { useEffect, useMemo } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Droplets, LifeBuoy, Printer, X } from "lucide-react";
import { ASSUMED_CAP, DRAIN_WIDTHS_COMPARED, SCENARIOS, adjustedInputs, roomOf, scenarioOf, setDrainWidth, sourcedControls, zoneLook,
         type Controls } from "../lib/data";
import { change, drainsTo, m3, num } from "../lib/format";
import { run } from "../sim/screening.ts";
import { ASSUMPTION_CHECKS, CHECKS, RECORD } from "../lib/evidence";
import { AssumptionChecks, GroundChecks } from "./Evidence";
import { Wordmark } from "./Shell";
import { HolderChip, ROOM_WORD, Reveal, RoomLabel, Term, pools, roomOfRatio, useReveal, useTips, type Holder } from "./Viz";

const P = { pond_A: "A", pond_B: "B" } as Record<string, string>;

/** Gap of one pond against its stated capacity, or the assumed one (labelled) until a planner enters it, less silt. */
function gapOf(p: any, id: string, silt: number) {
  const gap = p.storage_required_m3 - roomOf(p, id, silt);
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
    copy.storm.design_duration_h.value = null;      // each width finds its own critical duration (see the note)
    return { w, assumed: w === w0, S: run(copy).scenarios };
  });
}

/**
 * Upkeep on today's land cover, under the storm and drain in use: as built, ponds 30 % silted, drain 30 % blocked,
 * both. The storm is held at the clear drain's critical duration, so every row faces the same storm.
 */
const UPKEEP = 0.3;
function upkeepRows(inp: any) {
  const clean = JSON.parse(JSON.stringify(inp));
  clean.trunk_drain.blockage.value = 0;
  clean.storm.design_duration_h.value = null;
  const R0 = run(clean).scenarios.now;
  const blocked = JSON.parse(JSON.stringify(clean));
  blocked.trunk_drain.blockage.value = UPKEEP;
  blocked.storm.design_duration_h.value = R0.duration_h;
  const R1 = run(blocked).scenarios.now;
  return ([["Kept as built", R0, 0], [`Ponds ${UPKEEP * 100} % silted`, R0, UPKEEP], [`Drain ${UPKEEP * 100} % blocked`, R1, 0],
           ["Both", R1, UPKEEP]] as [string, any, number][])
    .map(([label, R, silt]) => ({ label, R, silt, full: (id: string) => R.ponds[id].storage_required_m3 / roomOf(R.ponds[id], id, silt) }));
}

/** The full tables, for engineers (folded under the chapters). */
function Engineers({ inputs, results, adjusted }: { inputs: any; results: any; adjusted: boolean }) {
  const inp = inputs, S = results.scenarios, now = S.now;   // the inputs actually used (adjusted if the planner changed any)
  const status = results.illustrative ? "Illustrative values (placeholder inputs)" : adjusted ? "Planner what-if (adjusted assumptions)" : "Screening estimate on sourced and stated values";
  const drains = useMemo(() => drainRows(inp), [inp]);
  const upkeep = useMemo(() => upkeepRows(inp), [inp]);
  const silt: number = results.storage_lost ?? 0;
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
    <div className="eng-body">
      <span className="pill">{status}</span>
      <p>Storage the township's ponds would need in a 100-year design storm, how it changes with the next parcels upstream,
        with the fixes on the table and with upkeep, and who holds each piece. Prepared from mapped drains and ponds (OpenStreetMap), MSMA 2nd Edition (DID 2012) and stated
        assumptions. <b>Decision support, not a forecast and not a design.</b> No depths, no times, no verdicts.</p>

      <h3>Design storm</h3>
      <div className="kpis">
        <div className="kpi"><div className="label">Return period</div><div className="big">100 years</div><div className="label">MSMA 2 Table 1.1 (link house, major system)</div></div>
        <div className="kpi"><div className="label">Critical duration today</div><div className="big">{now.duration_h} h</div><div className="label">{num(now.intensity_mm_hr, 1)} mm/hr at gauge {inp.storm.idf.station.split(" ")[0]}</div></div>
        <div className="kpi"><div className="label">Shared trunk drain, today</div><div className="big">{Math.round(now.trunk_drain.ratio * 100)} %</div><div className="label">of its assumed conveyance ({num(now.trunk_drain.capacity_m3_s, 1)} m³/s, confidence L)</div></div>
      </div>

      <h3>Storage required</h3>
      <div className="kpis">{pond("pond_A", "Pond A")}{pond("pond_B", "Pond B")}</div>
      <div className="sheet" style={{ marginTop: 12 }} data-spot="eng-table">
        <table className="t">
          <thead><tr><th>Scenario</th><th>Pond A</th><th>Pond B</th><th>Trunk drain load</th><th>Gap vs capacity</th></tr></thead>
          <tbody>{SCENARIOS.map((s) => {
            const r = S[s.id];
            return (
              <tr key={s.id}><td>{r.label}</td>
                <td className="num">{m3(r.ponds.pond_A.storage_required_m3)} <small>({change(r.ponds.pond_A.change_vs_now)})</small></td>
                <td className="num">{m3(r.ponds.pond_B.storage_required_m3)} <small>({change(r.ponds.pond_B.change_vs_now)})</small></td>
                <td className="num">{num(r.trunk_drain.direct_demand_m3_s, 1)} m³/s <small>({change(r.trunk_drain.change_vs_now)})</small></td>
                <td style={{ whiteSpace: "nowrap" }}>{["pond_A", "pond_B"].map((id) => <div key={id}>{P[id]} {gapOf(r.ponds[id], id, silt).text}</div>)}</td></tr>
            );
          })}</tbody>
        </table>
        <p style={{ fontSize: 12.5, marginBottom: 0 }}>Capacity used for the gap: {["pond_A", "pond_B"].map((id) => {
          const c = now.ponds[id].capacity_m3;
          return `Pond ${P[id]} ${c === null ? `${m3(ASSUMED_CAP[id])} assumed` : `${m3(c)} entered by the planner`}`;
        }).join(", ")}{silt > 0 && `, less ${Math.round(silt * 100)} % lost to silt (planner what-if)`}.{anyAssumed && <> Stated capacities are not public; an assumed one is the mapped water area × 1.5 m of live storage <span className="conf">L</span>, until a planner enters a stated figure.</>}</p>
        <p style={{ fontSize: 12.5, marginBottom: 0 }}>Scenario differences are differences between scenarios, never an attribution of cause or blame.
          The upstream scenario means more paved land upstream <i>where peak control is not fully achieved</i>; under MSMA 1.2.1 (Qpost ≤ Qpre) a fully controlled development would not raise peak flow.</p>
      </div>

      <h3>What the upstream change does depends on the shared drain</h3>
      <p>Ponds may only release into room left in the shared trunk drain. When the drain is full, they release nothing,
        so the upstream change shows up in the drain, not in pond storage. When it has room, the same upstream change
        takes some of that room and the ponds must hold more. No public record gives the drain's size <span className="conf">L</span>,
        so the Brief runs the same method at wider sizes.</p>
      <div className="sheet" data-spot="eng-drain">
        <table className="t">
          <thead><tr><th>Drain top width</th><th>Load today</th><th>Ponds release today → with upstream change</th><th>Pond A: today → upstream change</th><th>Pond B: today → upstream change</th></tr></thead>
          <tbody>{drains.map(({ w, assumed, S: R }) => {
            const share = (s: string) => `${Math.round(R[s].trunk_drain.pond_release_share * 100)} %`;
            const cell = (id: string) => {
              const a = R.now.ponds[id], b = R.upstream.ponds[id];
              return <>{m3(a.storage_required_m3)} → {m3(b.storage_required_m3)} <small>({change(b.change_vs_now)})</small>
                <br /><small>gap: {gapOf(a, id, silt).text} → {gapOf(b, id, silt).text}</small></>;
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

      <h3>Keeping it working: silt and blockage</h3>
      <p>The township is built, so part of every year's decision is upkeep: are the ponds desilted and the shared drain
        kept clear? Neither is measured anywhere public, so the Brief tests {UPKEEP * 100} % of each, on today's land cover
        and the storm and drain in use. Each row faces the same storm.</p>
      <div className="sheet" data-spot="eng-upkeep">
        <table className="t">
          <thead><tr><th>Upkeep</th><th>Pond A: share of its room</th><th>Pond B: share of its room</th><th>Shared drain load</th></tr></thead>
          <tbody>{upkeep.map((u) => (
            <tr key={u.label}><td><b>{u.label}</b></td>
              <td className="num">{Math.round(u.full("pond_A") * 100)} %</td><td className="num">{Math.round(u.full("pond_B") * 100)} %</td>
              <td className="num">{Math.round(u.R.trunk_drain.ratio * 100)} %</td></tr>
          ))}</tbody>
        </table>
        <p style={{ fontSize: 12.5, marginBottom: 0 }}>Silt cuts the room a pond is measured against (the capacity named above);
          blockage cuts the drain's carrying capacity, and with it the ponds' release. Both in proportion: a screening
          simplification <span className="conf">L</span>. Street drains, where residents' frequent floods point, are not modelled.
          Who desilts and who clears is in the responsibility record below.</p>
      </div>

      <h3>Does the screening match the ground?</h3>
      <div className="sheet" data-spot="eng-checks">
        <GroundChecks />
        <h3 style={{ marginTop: 16 }}>The two assumptions it rests on</h3>
        <AssumptionChecks />
      </div>

      <h3>Zones (draft, awaiting hydrology sign-off)</h3>
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

      <h3>Responsibility record</h3>
      <p>Who maintains each asset under Selangor's published rules. Even the two ponds have no settled maintainer on
        public record: the deciding fact, whether they have been handed over, is not public. <b>No line is confirmed by
        the party yet</b>; one letter from each moves its line to confirmed.</p>
      <div className="sheet" data-spot="eng-owners">
        <table className="t">
          <thead><tr><th>Asset</th><th>Mapped as</th><th>Who maintains it, by the rules</th><th>Rule</th><th>Conf.</th><th>Confirmed by the party</th></tr></thead>
          <tbody>{RECORD.map((r) => (
            <tr key={r.id}><td>{r.asset}</td><td>{r.mapped}</td><td>{r.who}</td><td>{r.rule}</td>
              <td><span className="conf">{r.conf}</span></td><td>{r.confirmed ? "Yes" : "Not yet"}</td></tr>
          ))}</tbody>
        </table>
        <p style={{ fontSize: 12.5, marginBottom: 0 }}>Sources: Selangor State Assembly answers (2014, citing the Cabinet decision of 6 June 1996; 2020; 2022; 2025, citing state cabinet decision MMKN 17/2025 of 4 June 2025); JPS Selangor GIS, pond register Kolam_Fasa_JPS (K02, K03: land-title field blank), read 21 Oct 2026. The record says who maintains an asset under the rules, never who is to blame.</p>
      </div>

      <h3>Key assumptions</h3>
      <ul>
        <li>Rainfall: MSMA 2 IDF constants for gauge {inp.storm.idf.station} (H); the gauge (Telok Gong, 2.995 N 101.368 E on JPS's station layer, about 13 km south-west) is the nearest listed in Table 2.B1 (H).</li>
        <li>Runoff coefficients: MSMA 2 Table 2.5 (major system), area-weighted over the land cover of the <b>simulated</b> model town (M).</li>
        <li>Pond release capped at the pre-development peak flow, former oil palm C 0.40 (MSMA 1.2.1) and by room in the trunk drain (M).</li>
        <li>Trunk drain: concrete trapezoid, top {inp.trunk_drain.section.top_width_m.value} m, n 0.018 (Table 2.3), slope 0.0013. The exact size is not public (L); satellite imagery shows no channel 8 m or wider, and pond A is short for any drain narrower than about 12 m (checks above).</li>
        <li>Upkeep: pond storage lost to silt and drain blockage are planner what-ifs, not measurements (none is public); each cuts storage or carrying capacity in proportion (L).</li>
        <li>Upstream area beyond the model edge: {inp.external_inflows.EXT_A.area_ha.value} ha test value (L).</li>
        <li>Stated pond capacities are not public, so none is claimed. Until a planner enters one, gaps are shown against an assumed capacity: mapped water area × 1.5 m of live storage (Pond A {m3(ASSUMED_CAP.pond_A)}, Pond B {m3(ASSUMED_CAP.pond_B)}). 1.5 m sits inside MSMA 2's planning range of 1–3 m (Chapter 7); pond A would need about 2.7 m.</li>
      </ul>
      <p style={{ fontSize: 12 }}>Sources: MSMA 2nd Edition (DID Malaysia, 2012), Chapters 1 and 2; OpenStreetMap contributors (ODbL); Copernicus DEM GLO-30. The town fabric is a simulated layout loosely based on Bandar Bukit Raja; Area A / Area B are a simulated pair based on Setia Alam (Shah Alam) and Bandar Bukit Raja (Klang).</p>
    </div>
  );
}

/** Findings chapter 3: each fix, read live from the simulator on the sourced inputs at today's land cover. */
const OPTIONS: { label: string; sub: string; set: Partial<Controls> }[] = [
  { label: "Today", sub: "As built", set: {} },
  { label: "A new pond", sub: "40,000 m³ on vacant land", set: { pond: true, pondSize: 40000 } },
  { label: "A wider shared drain", sub: "Drain works to 10 m", set: { drainTopWidth: 10 } },
  { label: "Both together", sub: "New pond + 10 m drain", set: { pond: true, pondSize: 40000, drainTopWidth: 10 } },
  { label: "Both, then left to clog", sub: "Drain 30 % blocked", set: { pond: true, pondSize: 40000, drainTopWidth: 10, blocked: 0.3 } },
];
function optionRows(base: any, ari: number) {
  return OPTIONS.map((o) => {
    const c: Controls = { ...sourcedControls(base), ari, ...o.set };
    const sc = run(adjustedInputs(base, c)).scenarios[scenarioOf(c)];
    const A = sc.ponds.pond_A, B = sc.ponds.pond_B;
    return { ...o, a: A.storage_required_m3 / roomOf(A, "pond_A", c.silt), b: B.storage_required_m3 / roomOf(B, "pond_B", c.silt), d: sc.trunk_drain.ratio };
  });
}

/** Holders per line of the responsibility record (owner colours, always with the name). */
const HOLDERS: Record<string, Holder[]> = {
  pond_A: ["unsettled"], pond_B: ["unsettled"], trunk_drain: ["MBDK"], main_ditch: ["JPS"], crossing: ["MBSA", "MBDK"],
  street: ["MBDK", "MBSA"], river: ["JPS"],
};
const SHORT: Record<Holder, string> = { MBDK: "MBDK", MBSA: "MBSA", JPS: "JPS Selangor", unsettled: "Not settled", agencies: "Agencies" };

/** A pond drawn as a tank: the box is its room; water fills it and spills over the rim when it needs more. */
function Tank({ name, need, room, assumed }: { name: string; need: number; room: number; assumed: boolean }) {
  const r = need / room, k = roomOfRatio(r);
  const fill = Math.min(r, 1), spill = Math.min(Math.max(r - 1, 0), 1);
  const tips = useTips();
  return (
    <div className="tank-wrap" ref={tips.box}>
      <div className="tank-name">{name}</div>
      <div className={`tank t-${k}`} style={{ ["--fill" as any]: fill, ["--spill" as any]: spill }}
        {...tips.tip(<><b>{name}</b><br />Must hold {m3(need)}<br />Room {m3(room)}{assumed ? " (assumed)" : ""}<br />{Math.round(r * 100)} % of its room</>)}>
        <div className="tank-spill" />
        <div className="tank-box"><div className="tank-water" /></div>
      </div>
      <div className="tank-pct">{Math.round(r * 100)} %</div>
      <RoomLabel r={r} />
      <div className="tank-sub">Must hold <b>{m3(need)}</b> (≈ {pools(need)} Olympic pools)<br />Room for {m3(room)}{assumed ? <Term t=" (assumed)" d="No official pond size is public. Room = the pond's mapped area × 1.5 m of storage, inside the national manual's 1–3 m range." /> : ""}</div>
      {tips.layer}
    </div>
  );
}

/** Findings chapter 2: where the water goes, drawn upright so it reads on a phone too. */
function FlowDiagram({ drain, release }: { drain: number; release: number }) {
  const k = roomOfRatio(drain), col = { low: "#1fbf75", medium: "#f2a516", high: "#ff4a3d" }[k];
  const fillW = 336 * Math.min(drain, 1);
  return (
    <svg viewBox="0 0 380 400" className="flow" role="img" aria-label={`Rain runs into the ponds and the shared drain. The shared drain is ${Math.round(drain * 100)} % full, so the ponds release ${release < 0.005 ? "nothing" : `${Math.round(release * 100)} % of what they are allowed`}.`}>
      <defs><marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#9aabbb" /></marker></defs>
      <line x1="190" y1="2" x2="190" y2="92" className="fl-council" />
      <text x="184" y="100" className="fl-small" textAnchor="end">Shah Alam</text><text x="196" y="100" className="fl-small">Klang</text>
      <rect x="12" y="10" width="166" height="62" rx="4" className="fl-node" />
      <text x="95" y="36" className="fl-t" textAnchor="middle">Upstream, Area A</text><text x="95" y="56" className="fl-small" textAnchor="middle">streets and roofs</text>
      <rect x="202" y="10" width="166" height="62" rx="4" className="fl-node" />
      <text x="285" y="36" className="fl-t" textAnchor="middle">Bukit Raja side</text><text x="285" y="56" className="fl-small" textAnchor="middle">streets and roofs</text>
      <line x1="95" y1="72" x2="95" y2="232" className="fl-arrow" markerEnd="url(#ar)" />
      <line x1="245" y1="72" x2="245" y2="114" className="fl-arrow" markerEnd="url(#ar)" />
      <line x1="325" y1="72" x2="325" y2="114" className="fl-arrow" markerEnd="url(#ar)" />
      <rect x="208" y="118" width="74" height="62" rx="4" className="fl-node" /><text x="245" y="154" className="fl-t" textAnchor="middle">Pond A</text>
      <rect x="290" y="118" width="74" height="62" rx="4" className="fl-node" /><text x="327" y="154" className="fl-t" textAnchor="middle">Pond B</text>
      <line x1="245" y1="180" x2="245" y2="232" className={`fl-arrow ${release < 0.005 ? "fl-blocked" : ""}`} markerEnd="url(#ar)" />
      <line x1="327" y1="180" x2="327" y2="232" className={`fl-arrow ${release < 0.005 ? "fl-blocked" : ""}`} markerEnd="url(#ar)" />
      {release < 0.005 && <><circle cx="286" cy="206" r="11" fill="#ff4a3d" /><path d="M281 201l10 10M291 201l-10 10" stroke="#fff" strokeWidth="2" />
        <text x="286" y="226" className="fl-small fl-red" textAnchor="middle">can't empty</text></>}
      <rect x="22" y="236" width="336" height="52" rx="5" className="fl-node" />
      <rect x="22" y="236" width={fillW} height="52" rx="5" fill={col} opacity="0.32" className="fl-fill" />
      <text x="190" y="259" className="fl-t" textAnchor="middle">Shared drain</text>
      <text x="190" y="278" className="fl-small" textAnchor="middle">{Math.round(drain * 100)} % full · {ROOM_WORD[k].toLowerCase()}</text>
      <line x1="190" y1="288" x2="190" y2="330" className="fl-arrow" markerEnd="url(#ar)" />
      <rect x="62" y="334" width="256" height="52" rx="4" className="fl-node" />
      <text x="190" y="357" className="fl-t" textAnchor="middle">Main ditch, then the river</text><text x="190" y="376" className="fl-small" textAnchor="middle">looked after by JPS Selangor</text>
    </svg>
  );
}

/** Findings chapter 3 chart: pond A and the shared drain, as a share of their room, per fix. One axis (% of room). */
function OptionsChart({ rows }: { rows: ReturnType<typeof optionRows> }) {
  const max = 2;
  const tips = useTips();
  const ref = useReveal<HTMLDivElement>();
  const bar = (v: number, what: string, row: string) => (
    <div className="ob" {...tips.tip(<><b>{row}</b><br />{what}: {Math.round(v * 100)} % of its room<br />{ROOM_WORD[roomOfRatio(v)]}</>)}>
      <span className="ob-k">{what}</span>
      <span className="ob-track"><i className={`grow r-${roomOfRatio(v)}`} style={{ ["--v" as any]: Math.min(v, max) / max }} /></span>
      <span className="ob-v">{Math.round(v * 100)} %{v > max ? " ▸" : ""}</span>
    </div>
  );
  return (
    <div className="opts" ref={(el) => { (ref as any).current = el; (tips.box as any).current = el; }}>
      <div className="opts-legend">Bar = how full it gets in the storm · <span className="dash" /> dashed line = 100 %, full · bars stop at 200 %</div>
      {rows.map((r) => (
        <div key={r.label} className="opt">
          <div className="opt-l"><b>{r.label}</b><small>{r.sub}</small></div>
          <div className="opt-bars">
            {bar(r.a, "Pond A", r.label)}{bar(r.d, "Shared drain", r.label)}
          </div>
          <div className="opt-tag">{r.a < 1 && r.d < 1 ? <span className="room room-low">✓ Clears it</span> : <span className="room room-high">✕ Still short</span>}</div>
        </div>
      ))}
      {tips.layer}
    </div>
  );
}

export function Brief({ inputs, base, results, adjusted }: { inputs: any; base: any; results: any; adjusted: boolean }) {
  const S = results.scenarios, now = S.now;
  const ari = inputs.storm.ari_years.value;
  const status = results.illustrative ? "Illustrative values" : adjusted ? "Your what-if settings" : "Screening estimate";
  const silt: number = results.storage_lost ?? 0;
  const tank = (id: string) => ({ need: now.ponds[id].storage_required_m3, room: roomOf(now.ponds[id], id, silt), assumed: now.ponds[id].capacity_m3 === null });
  const A = tank("pond_A"), B = tank("pond_B");
  const rows = useMemo(() => optionRows(base, ari), [base, ari]);
  const together = rows.find((r) => r.label === "Both together")!;
  const singles = rows.filter((r) => r.label === "A new pond" || r.label === "A wider shared drain");
  const confirmed = RECORD.filter((r) => r.confirmed).length;
  useEffect(() => {          // print everything, including the folded engineer section
    const open = () => document.querySelectorAll<HTMLDetailsElement>(".findings details").forEach((d) => (d.open = true));
    addEventListener("beforeprint", open);
    return () => removeEventListener("beforeprint", open);
  }, []);
  const storm = <Term t={`${ari}-year storm`} d={`A storm this heavy has about a ${num(100 / ari, ari >= 10 ? 0 : 1)} % chance of happening in any year. ${ari === 100 ? "Malaysia's drainage manual (MSMA 2) uses it as the design standard for housing areas." : ""}`} />;
  return (
    <div className="page findings">
      <header>
        <Wordmark />
        <div className="noprint" style={{ display: "flex", gap: 8 }}>
          <a className="text-btn" href="#/planner"><ArrowLeft size={16} /> Planner view</a>
          <button className="text-btn" onClick={() => print()}><Printer size={16} /> Print</button>
        </div>
      </header>
      <div className="eyebrow"><span className="pill">{status}</span><span className="kicker">Shared Capacity Brief</span></div>
      <h1>Where the water has nowhere to go</h1>
      <p className="lead">The one-page summary for councils, the developer and residents: how much water the ponds must hold,
        why they fall short, what helps, and who looks after what.</p>

      <Reveal className="headline">
        <Droplets size={22} />
        <p>In a {storm}, <b>pond A must hold about {m3(A.need)}</b>, about {pools(A.need)} Olympic pools. It has room for
          about {m3(A.room)}. The ponds can't empty because <b>the shared drain is already {Math.round(now.trunk_drain.ratio * 100)} % full</b>.</p>
      </Reveal>

      <nav className="chapters noprint" aria-label="Chapters">
        {["The problem", "Why", "What helps", "Who looks after what", "How sure"].map((t, i) => <a key={t} href={`#/brief`} onClick={(e) => { e.preventDefault(); document.getElementById(`ch${i + 1}`)?.scrollIntoView({ behavior: "smooth" }); }}><i>{i + 1}</i>{t}</a>)}
      </nav>

      <section className="chapter" id="ch1" data-spot="brief-table">
        <h2><i>1</i> The ponds must hold more water than they have room for</h2>
        <p>Each tank is a pond's room. The water is what it must hold in a {storm}. Red water above the rim is what does not fit.</p>
        <Reveal className="tanks">
          <Tank name="Pond A" {...A} />
          <Tank name="Pond B" {...B} />
          <div className="drain-card">
            <div className="tank-name">Shared drain</div>
            <div className="dc-pct">{Math.round(now.trunk_drain.ratio * 100)} %</div>
            <RoomLabel r={now.trunk_drain.ratio} />
            <div className="dc-meter"><i className={`grow r-${roomOfRatio(now.trunk_drain.ratio)}`} style={{ ["--v" as any]: Math.min(now.trunk_drain.ratio, 1.5) / 1.5 }} /><em style={{ left: `${100 / 1.5}%` }} /></div>
            <div className="tank-sub">of what it can carry{now.trunk_drain.blockage > 0 ? `, ${Math.round(now.trunk_drain.blockage * 100)} % blocked` : ""}. Its size is not public: <Term t="assumed 6 m wide" d="No record gives this drain's size. Satellite images show nothing 8 m or wider along it. The finding holds for any drain under about 12 m." /></div>
          </div>
        </Reveal>
        {silt > 0 && <p className="note">With your setting, each pond has lost {Math.round(silt * 100)} % of its room to silt.</p>}
      </section>

      <section className="chapter" id="ch2">
        <h2><i>2</i> Why: the shared drain is full, so the ponds can't empty</h2>
        <div className="split">
          <Reveal className="flow-wrap"><FlowDiagram drain={now.trunk_drain.ratio} release={now.trunk_drain.pond_release_share} /></Reveal>
          <ol className="steps">
            <li><b>Rain runs off streets and roofs</b> on both sides of the council line.</li>
            <li><b>Ponds catch it</b> and should let it out slowly into the shared drain.</li>
            <li><b>The shared drain also carries water from upstream</b> and from streets that drain straight into it.</li>
            <li><b>In a big storm the drain fills first.</b> With no room left, the ponds can't empty, so they must hold everything.</li>
            <li>So <b>the shortfall is the shared drain, not only the ponds.</b> A bigger pond alone helps less than you'd think.</li>
          </ol>
        </div>
      </section>

      <section className="chapter" id="ch3">
        <h2><i>3</i> What helps: no single fix is enough</h2>
        <p>Each fix tested in the same {storm}, on today's land. Bars show how full pond A and the shared drain get.
          {singles.every((r) => r.a >= 1 || r.d >= 1) && together.a < 1 && together.d < 1 ? <> One fix alone leaves something short. <b>Together, they clear it.</b> Left to clog, the gain is lost.</> : null}</p>
        <OptionsChart rows={rows} />
        <p className="note">A pond and a drain may belong to different holders (chapter 4). That is why one shared picture matters.
          Try these in the planner's Scenario control.</p>
      </section>

      <section className="chapter" id="ch4" data-spot="brief-owners">
        <h2><i>4</i> Who looks after what</h2>
        <p>Selangor's published rules say who maintains each drain and pond. This says who looks after it, <b>never who is to blame</b>.</p>
        <Reveal className="confirm">
          <div className="confirm-n"><b>{confirmed}</b> of {RECORD.length}</div>
          <div className="confirm-bar">{RECORD.map((r) => <i key={r.id} className={r.confirmed ? "on" : ""} />)}</div>
          <div className="confirm-t">lines confirmed by the holder so far. One letter from each moves its line to confirmed: the pilot's measure.</div>
        </Reveal>
        <div className="owners">
          {RECORD.map((r) => (
            <div key={r.id} className={`owner ${r.conf === "L" ? "unsettled" : ""}`}>
              <div className="owner-asset">{r.asset}</div>
              <div className="owner-chips">{HOLDERS[r.id].map((h) => <HolderChip key={h} h={h} label={SHORT[h]} />)}</div>
              <div className="owner-why">{r.id === "pond_A" || r.id === "pond_B" ? "Developer until handed over, then the council. Handover status not public." : r.who}</div>
              <div className="owner-foot"><span className="conf">{r.conf}</span> {r.conf === "L" ? "the deciding fact is not public" : "an official rule applies"}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="chapter" id="ch5" data-spot="brief-checks">
        <h2><i>5</i> How sure are we?</h2>
        <p>We checked the result against what is known on the ground, and we show the miss too.</p>
        <Reveal className="checks-grid">
          {CHECKS.map((c) => (
            <div key={c.what} className={`check ${c.ok ? "ok" : "miss"}`}>
              <div className="check-i">{c.ok ? <Check size={16} /> : <X size={16} />}</div>
              <b>{c.ok ? "Agrees" : "Does not explain"}: {c.what}</b>
              <p>{c.finding}</p>
            </div>
          ))}
        </Reveal>
        <div className="assume">
          {ASSUMPTION_CHECKS.map((a) => (
            <div key={a.what} className="assume-card"><b>{a.what}: {a.used}</b><p>{a.holds}</p><span className="conf">{a.conf}</span></div>
          ))}
        </div>
        <p className="note">A screening estimate using Malaysia's drainage manual (MSMA 2). Not a design and not a forecast: it never predicts a flood depth.</p>
      </section>

      <a className="teaser noprint" href="#/after">
        <LifeBuoy size={22} />
        <span><b>After a flood: who helps, who pays</b><small>Relief, insurance and the courts in plain words, and what it means for Bukit Raja.</small></span>
        <ArrowRight size={18} />
      </a>

      <details className="eng">
        <summary><ChevronDown size={16} /> For engineers: methods, full tables and assumptions</summary>
        <Engineers inputs={inputs} results={results} adjusted={adjusted} />
      </details>
    </div>
  );
}
