// Panels of the 2D site view (22 Oct 2026): the site's own tabs (Site, Boundary, Inputs, Upload) and the inspector card.
// House rules: risk bands, never depths; a crossing is a difference, never a blame; every input shows its source.
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ArrowLeft, Download, FileUp, Info, LayoutGrid, RotateCcw, Upload, X } from "lucide-react";
import { val } from "../sim/network.ts";
import { useSwipeToClose } from "../ui/useSwipeToClose";
import { Wordmark } from "../ui/Shell";
import {
  applyRegister, BAND_COLOR, fmt, geojsonRows, loadPack, metricsOf, parseCSV, pct, ROOM, runSafe,
  type Band, type Pack, type UploadResult,
} from "./data";

type Tab = "overview" | "boundary" | "inputs" | "upload";
type Pick = { kind: "zone" | "pond" | "drain" | "whatif"; id: string } | null;

const SCENARIO_WORDS: Record<string, string> = { now: "Today", upstream: "Open land built out", upstream_plus_pond: "+ What-if pond" };

/** A readable name for a node: its own name for ponds and drains (never a raw OSM id), else its id. */
export function nameOf(inputs: any, id: string): string {
  let n: string | undefined = inputs.ponds?.[id]?.name ?? inputs.drains?.[id]?.name;
  if (!n) return id;
  if (/^Unnamed pond$/i.test(n)) {          // tell unnamed ponds apart by the zone they sit in
    const z = Object.entries<any>(inputs.zones).find(([, x]) => x.drains_to === id)?.[0];
    n = z ? `Unnamed pond in ${z}` : `Unnamed pond ${id.replace(/^OSM_\w?/, "")}`;
  }
  return id.startsWith("OSM_") ? n : `${id} · ${n}`;
}

export const shortCouncil = (c: string) => c.replace(/^Majlis (Bandaraya|Perbandaran) /, "").replace(/^Majlis Bandaraya Diraja /, "").toUpperCase();

export function zoneBand(z: any): Band | "river" {
  if (z.drains_to === "outfall") return "river";
  return (z.band_capacity ?? "unknown") as Band;
}

// ------------------------------------------------------------------------------------------------- panels
export function Overview({ pack, m, sc }: { pack: Pack; m: ReturnType<typeof metricsOf>; sc: any }) {
  const { site } = pack;
  const fr = site.evidence.flood_records;
  const years = [...new Set(fr.map((f) => f.year))].sort();
  return (
    <>
      <p className="pf-lede">{site.summary}.</p>
      {site.kind === "generated" && (
        <div className="pf-warn"><Info size={14} /><span><b>Generated from open data</b> by <code>build_site.py</code>{site.build.fetch_s ? ` (downloads ${Math.round(site.build.fetch_s)} s, processing ${Math.round(site.build.build_s ?? 0)} s)` : ""}. Zones, outlets and drain sizes are assumptions to check; most inputs are <b>L</b>. Upload a register to replace them.</span></div>
      )}
      <div className="pf-stats">
        <Stat k="Storage gap" v={`${fmt(m.storage_gap_m3)} m³`} note="ponds, against stated or assumed capacity" tone={m.storage_gap_m3 > 0 ? "red" : "green"} />
        <Stat k="Ponds over" v={`${m.ponds_over} of ${m.ponds}`} tone={m.ponds_over ? "amber" : "green"} />
        <Stat k="Drains over" v={`${m.drains_over} of ${m.drains}`} note="assumed sizes (L)" tone={m.drains_over ? "amber" : "green"} />
        <Stat k="Crossings" v={`${m.crossings}`} note={`${fmt(m.crossing_flow_m3_s, 1)} m³/s across council lines`} tone="cyan" />
      </div>
      <h4>Site tests</h4>
      <ul className="pf-tests">
        {site.tests.map((t) => <li key={t.test} className={t.passed ? "ok" : "no"}><b>{t.passed ? "PASS" : "FAIL"}</b> {t.test}<small>{t.detail}</small></li>)}
      </ul>
      <h4>Flood evidence ({fr.length} JPS records{years.length ? `, ${years[0]}–${years[years.length - 1]}` : ""})</h4>
      <ul className="pf-ev">
        {fr.slice(0, 12).map((f, i) => <li key={i}><b>{f.year}</b> {f.place}<small>{f.type}</small></li>)}
        {fr.length > 12 && <li className="more">+ {fr.length - 12} more</li>}
      </ul>
      <h4>What this cannot tell you</h4>
      <ul className="pf-limits">{site.limits.map((l) => <li key={l}>{l}</li>)}</ul>
      <p className="pf-note">Storm: {val(pack.inputs.storm.ari_years)}-year ARI at gauge {site.storm.station} ({site.storm.distance_km} km away), critical duration {sc.duration_h} h. Screening only: storage required, loads and bands. No depths, no times, no verdicts.</p>
    </>
  );
}

function Stat({ k, v, note, tone }: { k: string; v: string; note?: string; tone: string }) {
  return <div className="pf-stat"><span>{k}</span><b className={tone}>{v}</b>{note && <small>{note}</small>}</div>;
}

export function Boundary({ inputs, sc, setPick }: { inputs: any; sc: any; setPick: (x: Pick) => void }) {
  const kindOf = (id: string) => (id in inputs.zones ? "zone" : id in inputs.ponds ? "pond" : id in inputs.drains ? "drain" : null) as any;
  const sides = Object.entries<any>(sc.by_side);
  return (
    <>
      <p className="pf-lede">Where water leaves one council's area and enters another's in this scenario. A <b>difference, not a blame</b>: it shows where planning on one side meets drains and ponds on the other.</p>
      {sc.crossings.length === 0 ? <p className="pf-note">No mapped link crosses a council line here.</p> : (
        <table className="pf-table">
          <thead><tr><th>From</th><th>Into</th><th className="r">Peak flow</th></tr></thead>
          <tbody>
            {sc.crossings.map((c: any, i: number) => (
              <tr key={i} onClick={() => kindOf(c.source) && setPick({ kind: kindOf(c.source), id: c.source })}>
                <td><b>{nameOf(inputs, c.source)}</b> <small>{c.kind} · {shortCouncil(c.from_side)}</small></td>
                <td><b>{nameOf(inputs, c.to)}</b> <small>{shortCouncil(c.to_side)}</small></td>
                <td className="r">{fmt(c.flow_m3_s, 2)} m³/s</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h4>Storage by council side</h4>
      <table className="pf-table">
        <thead><tr><th>Side</th><th className="r">Required</th><th className="r">Capacity</th><th className="r">Balance</th></tr></thead>
        <tbody>
          {sides.map(([s, v]) => (
            <tr key={s}><td>{shortCouncil(s)} <small>{v.ponds} ponds</small></td><td className="r">{fmt(v.storage_required_m3)} m³</td>
              <td className="r">{v.unstated ? "not all stated" : `${fmt(v.capacity_m3)} m³`}</td>
              <td className={`r ${v.gap_m3 > 0 ? "red" : "green"}`}>{v.gap_m3 === null ? "—" : v.gap_m3 > 0 ? `${fmt(v.gap_m3)} m³ short` : `${fmt(-v.gap_m3)} m³ spare`}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="pf-note">Capacities are assumed (water area × 1.5 m, L) until a planner uploads stated ones. The gap is storage required minus capacity, summed per side.</p>
    </>
  );
}

export function Inputs({ inputs, site }: { inputs: any; site: any }) {
  const rows: [string, any][] = [];
  const walk = (node: any, path: string) => {
    if (node && typeof node === "object" && !Array.isArray(node)) {
      if ("value" in node && "status" in node) { rows.push([path, node]); return; }
      for (const [k, v] of Object.entries(node)) if (!k.startsWith("_")) walk(v, path ? `${path}.${k}` : k);
    }
  };
  walk({ storm: inputs.storm, method: inputs.method }, "");
  const counts: Record<string, number> = {};
  const all: [string, any][] = [];
  const walkAll = (node: any, path: string) => {
    if (node && typeof node === "object" && !Array.isArray(node)) {
      if ("value" in node && "status" in node) { all.push([path, node]); counts[node.status] = (counts[node.status] ?? 0) + 1; return; }
      for (const [k, v] of Object.entries(node)) if (!k.startsWith("_")) walkAll(v, path ? `${path}.${k}` : k);
    }
  };
  walkAll(inputs, "");
  return (
    <>
      <p className="pf-lede">Every input carries its status, source and confidence (H / M / L). Of {all.length} values: {Object.entries(counts).map(([s, n]) => `${n} ${s}`).join(" · ")}.</p>
      <table className="pf-table pf-inputs">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}><td><b>{k.replace(/^(storm|method)\./, "")}</b><small>{v.source}</small></td>
              <td className="r">{Array.isArray(v.value) ? v.value.join(", ") : v.value === null ? "—" : String(v.value)}<small>{v.status} · {v.confidence}</small></td></tr>
          ))}
        </tbody>
      </table>
      <p className="pf-note">Zones, drains and ponds: click one on the map to see its values and where each comes from.</p>
      <h4>Sources</h4>
      <ul className="pf-limits">{site.sources.map((s: string) => <li key={s}>{s}</li>)}</ul>
    </>
  );
}

export function UploadPanel({ pack, upload, setUpload, liveError }: { pack: Pack; upload: UploadResult | null; setUpload: (u: UploadResult | null) => void; liveError: string | null }) {
  const [err, setErr] = useState<string | null>(null);
  const read = async (f: File) => {
    setErr(null);
    try {
      const text = await f.text();
      const rows = /\.(geo)?json$/i.test(f.name) ? geojsonRows(JSON.parse(text)) : parseCSV(text);
      if (!rows.length) throw new Error("no rows found");
      setUpload(applyRegister(pack.inputs, pack.geo, rows, f.name));
    } catch (e) { setErr(`Could not read ${f.name}: ${(e as Error).message}`); }
  };
  return (
    <>
      <p className="pf-lede">Replace our assumptions with your own register: stated pond capacities (or live storage depth) and measured drain sizes. The result reruns here, in your browser; nothing is uploaded to a server.</p>
      <a className="btn-ghost" href={`./sites/${pack.site.id}/register_template.csv`} download><Download size={14} /> Template for this site (CSV)</a>
      <label className="pf-drop">
        <FileUp size={20} /><b>Choose a CSV or GeoJSON register</b>
        <small>Columns: kind, id (ours or a JPS code), capacity_m3 or live_depth_m; for drains top_width_m, bottom_width_m, depth_m; optional source. Rows without an id match a pond within 150 m by lat / lon.</small>
        <input type="file" accept=".csv,.json,.geojson,text/csv,application/json" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
      </label>
      {err && <div className="pf-warn red"><X size={14} /><span>{err}</span></div>}
      {liveError && <div className="pf-warn red"><X size={14} /><span>The uploaded values cannot run: {liveError}</span></div>}
      {upload && (
        <>
          <h4><Upload size={13} /> {upload.file}: {upload.applied.length} values applied</h4>
          <table className="pf-table">
            <tbody>
              {upload.applied.map((a, i) => (
                <tr key={i}><td><b>{a.id}</b> <small>{a.field}</small></td><td className="r">{a.from === null ? "—" : fmt(a.from, 2)} → <b>{fmt(a.to, 2)}</b></td></tr>
              ))}
            </tbody>
          </table>
          {upload.skipped.length > 0 && <><h4>Not applied ({upload.skipped.length})</h4><ul className="pf-limits">{upload.skipped.map((s) => <li key={s}>{s}</li>)}</ul></>}
          <button className="btn-ghost" onClick={() => setUpload(null)}><RotateCcw size={14} /> Back to the generated values</button>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------------------------------------- the card
export function Card({ pick, inputs, sc, close }: { pick: NonNullable<Pick>; inputs: any; sc: any; close: () => void }) {
  const sheet = useRef<HTMLDivElement>(null);
  useSwipeToClose(sheet, close, `${pick.kind}:${pick.id}`);   // phones: swipe the card down
  const V = ({ k, v }: { k: string; v: any }) => (
    <div className="pf-kv"><span>{k}</span><b>{v && typeof v === "object" && "value" in v
      ? `${typeof v.value === "number" ? fmt(v.value, v.value < 1 ? 4 : v.value < 100 ? 2 : 0) : v.value ?? "—"} ${(v.unit ?? "").replace("m3", "m³").replace(/^-$/, "")}` : v}</b>
      {v && typeof v === "object" && "status" in v && <small>{v.status} · {v.confidence} · {v.source}</small>}</div>
  );
  let body: JSX.Element | null = null, title = pick.id, sub = "";
  if (pick.kind === "zone") {
    const z = inputs.zones[pick.id], r = sc.zones[pick.id], b = zoneBand(r);
    sub = `${shortCouncil(z.council ?? "")} · drains to ${z.drains_to === "outfall" ? "a river" : nameOf(inputs, z.drains_to)}`;
    body = <>
      <div className="pf-band" style={{ borderColor: BAND_COLOR[b] }}>{b === "river" ? "Drains to a river (not modelled)" : z.drains_to === "TBD" ? "Outlet not known" : `${ROOM[b as Band]}: ${pct(r.load)} of its outlet's capacity`}</div>
      <V k="Why it drains there" v={z.drains_to_basis} />
      <V k="Area" v={z.area_ha} /><V k="Runoff C today" v={z.c_now} /><V k="Runoff C built out" v={z.c_upstream} />
      <V k="Peak flow (this scenario)" v={`${fmt(r.q_m3_s, 2)} m³/s`} />
    </>;
  } else if (pick.kind === "pond") {
    const p = inputs.ponds[pick.id], r = sc.ponds[pick.id];
    title = p.name; sub = `${pick.id} · ${shortCouncil(p.council ?? "")} · ${p.listed}`;
    body = <>
      <div className="pf-band" style={{ borderColor: BAND_COLOR[r.band_capacity] }}>Storage required {fmt(r.storage_required_m3)} m³ · {pct(r.ratio)} of capacity</div>
      <V k="Capacity" v={p.capacity_m3} /><V k="Water area (mapped)" v={`${fmt(p.water_area_m2)} m²`} />
      <V k="Releases into" v={`${p.drains_to === "outfall" ? "where water leaves the area" : nameOf(inputs, p.drains_to)} (${p.drains_to_basis})`} />
      <V k="Allowed release (Qpost ≤ Qpre)" v={`${fmt(r.allowed_release_m3_s, 2)} m³/s, of which ${fmt(r.release_m3_s, 2)} fits`} />
    </>;
  } else if (pick.kind === "drain") {
    const d = inputs.drains[pick.id], r = sc.drains[pick.id];
    title = d.name; sub = `${pick.id} · ${shortCouncil(d.council ?? "")} · flows to ${d.drains_to}`;
    body = r ? <>
      <div className="pf-band" style={{ borderColor: BAND_COLOR[r.band_capacity] }}>Carries {fmt(r.direct_demand_m3_s, 1)} of {fmt(r.capacity_m3_s, 1)} m³/s · {pct(r.ratio)}</div>
      <V k="Top width" v={d.section.top_width_m} /><V k="Bottom width" v={d.section.bottom_width_m} /><V k="Depth" v={d.section.depth_m} />
      <V k="Slope" v={d.section.slope} /><V k="Manning n" v={d.section.manning_n} /><V k="Where it goes" v={d.drains_to_basis} />
    </> : null;
  } else if (pick.kind === "whatif") {
    const w = inputs.what_if_ponds.W1, r = sc.what_if_ponds?.W1;
    title = "What-if pond"; sub = w._what;
    body = <>{r && <div className="pf-band" style={{ borderColor: "#e3b341" }}>Holds {fmt(r.storage_required_m3)} m³ of its {fmt(r.capacity_m3 ?? 0)} m³</div>}
      <V k="Size" v={w.capacity_m3} /><V k="Serves" v={w.serves.join(", ")} /></>;
  }
  return (
    <div ref={sheet} className="panel pf-card">
      <div className="panel-head"><span>{title}</span><button className="icon-btn" onClick={close} aria-label="Close"><X size={14} /></button></div>
      <div className="pf-card-sub">{sub}</div>
      <div className="pf-card-body">{body}</div>
    </div>
  );
}
