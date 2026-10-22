// Findings for a 2D site (#/site/<id>/findings, 22 Oct 2026): the BBR Shared Capacity Brief, generated for any site
// from the same results the map shows. Printable. Ownership is only what a public list says (JPS's pond list); all else
// is [TBD], never guessed.
import { useEffect, useMemo } from "react";
import { ArrowLeft, Droplets, Printer } from "lucide-react";
import { val } from "../sim/network.ts";
import { Wordmark } from "../ui/Shell";
import { fmt, pct, runSafe, type Pack } from "./data";
import { adjusted2, headline, scenarioName2, sourced2, type C2 } from "./model";
import { nameOf, shortCouncil } from "./SitePanels";

const m3 = (v: number) => `${fmt(v)} m³`;
const OPTIONS: [string, Partial<C2>][] = [
  ["Today", {}], ["Open land built out", { dev: 1 }], ["+ what-if pond", { dev: 1, pond: true }],
  ["+ drains 1.5 × wider", { dev: 1, drainScale: 1.5 }], ["Both together", { dev: 1, pond: true, drainScale: 1.5 }],
  ["Silted and blocked (2-yr storm)", { ari: 2, silt: 0.3, blocked: 0.3 }],
];

export function Findings2({ pack, base, c, res, adjusted }: { pack: Pack; base: any; c: C2; res: any; adjusted: boolean }) {
  const site = pack.site, sc = res.scenarios.current, h = headline(sc);
  const ponds = Object.entries<any>(sc.ponds).sort((a, b) => b[1].storage_required_m3 - a[1].storage_required_m3);
  const drains = Object.entries<any>(sc.drains).sort((a, b) => (b[1].ratio ?? 0) - (a[1].ratio ?? 0));
  const rows = useMemo(() => OPTIONS.map(([label, o]) => {
    const r = runSafe(adjusted2(base, { ...sourced2(base), ...o })).res;
    return r ? { label, h: headline(r.scenarios.current) } : null;
  }).filter(Boolean) as { label: string; h: ReturnType<typeof headline> }[], [base]);
  useEffect(() => { document.title = `Findings · ${site.name} · RainReady`; return () => { document.title = "RainReady · Shared Catchment Screening"; }; }, [site.name]);
  const f = ponds.filter(([, p]) => p.ratio !== null).sort((a, b) => b[1].ratio - a[1].ratio)[0];
  const listed = (id: string) => pack.inputs.ponds[id]?.listed as string | undefined;
  return (
    <div className="page findings pf-page">
      <header>
        <Wordmark />
        <div className="noprint" style={{ display: "flex", gap: 8 }}>
          <a className="text-btn" href={`#/site/${site.id}`}><ArrowLeft size={16} /> Site map</a>
          <button className="text-btn" onClick={() => print()}><Printer size={16} /> Print</button>
        </div>
      </header>
      <div className="eyebrow"><span className="pill">{adjusted ? "Your what-if settings" : "Screening · generated from open data"}</span><span className="kicker">Shared Capacity Brief · {site.name}</span></div>
      <h1>Where the water has nowhere to go</h1>
      <p className="lead">{site.summary}. {scenarioName2(c)}, {c.ari}-year storm. Most inputs are assumptions from open data (L): read every number as a screening estimate to check, not a finding about the township.</p>

      <div className="headline">
        <Droplets size={22} />
        <p>In a {c.ari}-year storm the ponds fall <b>{m3(h.gap)} short</b> of their assumed capacity{f ? <>; the fullest, <b>{nameOf(pack.inputs, f[0])}</b>, needs {pct(f[1].ratio)} of its room</> : null}. <b>{h.drainsOver} of {h.drains} drains</b> run over their assumed size, and {sc.crossings.length} links carry water across a council line.</p>
      </div>

      <section className="chapter" data-spot="f-ponds">
        <h2><i>1</i> How much the ponds must hold</h2>
        <table className="pf-table">
          <thead><tr><th>Pond</th><th>Council side</th><th className="r">Storage required</th><th className="r">Capacity</th><th className="r">Share</th><th>Listed</th></tr></thead>
          <tbody>{ponds.map(([id, p]) => (
            <tr key={id}><td><b>{nameOf(pack.inputs, id)}</b></td><td>{shortCouncil(pack.inputs.ponds[id].council ?? "")}</td>
              <td className="r">{m3(p.storage_required_m3)}</td>
              <td className="r">{p.capacity_m3 ? m3(p.capacity_m3) : "—"}<small>{pack.inputs.ponds[id].capacity_m3?.status ?? ""}</small></td>
              <td className={`r ${p.ratio >= 1 ? "red" : p.ratio >= 0.8 ? "amber" : ""}`}>{pct(p.ratio)}</td>
              <td><small>{listed(id)?.startsWith("JPS") ? "JPS pond list" : "OSM only"}</small></td></tr>
          ))}</tbody>
        </table>
      </section>

      <section className="chapter">
        <h2><i>2</i> Why: the drains that fill</h2>
        <table className="pf-table">
          <thead><tr><th>Drain</th><th>Side</th><th className="r">Carries</th><th className="r">Assumed capacity</th><th className="r">Load</th></tr></thead>
          <tbody>{drains.map(([id, d]) => (
            <tr key={id}><td><b>{nameOf(pack.inputs, id)}</b></td><td>{shortCouncil(pack.inputs.drains[id].council ?? "")}</td>
              <td className="r">{fmt(d.direct_demand_m3_s, 1)} m³/s</td><td className="r">{fmt(d.capacity_m3_s, 1)} m³/s</td>
              <td className={`r ${d.ratio >= 1 ? "red" : d.ratio >= 0.8 ? "amber" : ""}`}>{pct(d.ratio)}</td></tr>
          ))}</tbody>
        </table>
        <p className="pf-note">A pond releases only what the drain below it has room for (MSMA 2: Qpost ≤ Qpre). A full drain leaves its ponds holding everything.</p>
      </section>

      <section className="chapter">
        <h2><i>3</i> What helps, side by side</h2>
        <table className="pf-table">
          <thead><tr><th>Option</th><th className="r">Storage gap</th><th className="r">Drains over</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td><td className="r">{m3(r.h.gap)}</td><td className="r">{r.h.drainsOver} of {r.h.drains}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="chapter" data-spot="f-cross">
        <h2><i>4</i> Where water crosses council lines</h2>
        <table className="pf-table">
          <thead><tr><th>From</th><th>Into</th><th className="r">Peak flow</th></tr></thead>
          <tbody>{sc.crossings.map((x: any, i: number) => (
            <tr key={i}><td><b>{nameOf(pack.inputs, x.source)}</b><small>{shortCouncil(x.from_side)}</small></td>
              <td><b>{nameOf(pack.inputs, x.to)}</b><small>{shortCouncil(x.to_side)}</small></td><td className="r">{fmt(x.flow_m3_s, 2)} m³/s</td></tr>
          ))}</tbody>
        </table>
        <p className="pf-note">A difference to plan for together, never a blame.</p>
      </section>

      <section className="chapter">
        <h2><i>5</i> Who looks after what</h2>
        <p>Only what a public list says. {Object.values<any>(pack.inputs.ponds).filter((p) => String(p.listed).startsWith("JPS")).length} ponds are on JPS Selangor's pond list (a listing, which does not by itself say who maintains them). Every other pond and drain: owner <b>[TBD]</b>, not public.</p>
      </section>

      <section className="chapter">
        <h2><i>6</i> How sure, and what this cannot tell you</h2>
        <ul className="pf-limits">{site.limits.map((l) => <li key={l}>{l}</li>)}</ul>
        <p className="pf-note">Storm: gauge {site.storm.station} ({site.storm.distance_km} km), {val(base.storm.ari_years)}-year design standard. Sources: {site.sources.join(" · ")}.</p>
      </section>
    </div>
  );
}
