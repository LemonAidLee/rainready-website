// The console frame around the 3D view: status bar (top), icon rail (left), evidence ticker and cursor readout (bottom).
import { FileText, Globe2, Info, Layers as LayersIcon, LifeBuoy, Map, PlayCircle, SlidersHorizontal, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { Layers } from "../scene/Township";
import { num } from "../lib/format";

export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="mark">
      <path d="M16 2.5 28 9.25v13.5L16 29.5 4 22.75V9.25z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M16 8c3.4 4.6 6 7.6 6 10.8a6 6 0 0 1-12 0C10 15.6 12.6 12.6 16 8z" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ sub = true }: { sub?: boolean }) {
  return (
    <a className="wordmark" href="#/">
      <Mark />
      <span className="wm-text"><b>RAINREADY</b>{sub && <small>SHARED CATCHMENT SCREENING</small>}</span>
    </a>
  );
}

export function StatusBar(p: { status: "sourced" | "whatif"; storm: number; res: any; scenario: string; scenarioName: string;
                                ari: number; onDemo: () => void; onAbout: () => void }) {
  const sc = p.res.scenarios[p.scenario];
  const r = sc.trunk_drain.ratio;
  return (
    <header className="statusbar">
      <div className="sb-left">
        <Wordmark />
        <div className="sb-context">BANDAR BUKIT RAJA (SIMULATED) · KLANG ⇄ SHAH ALAM · PROPERTY LINES STOP AT THE FENCE. WATER DOESN'T.</div>
      </div>
      <div className="sb-right">
        <div className="readout" data-spot="storm"><span>STORM</span><b>{p.ari}-YR · {sc.duration_h} H · {num(sc.intensity_mm_hr, 1)} MM/H</b></div>
        <div className="readout"><span>SCENARIO</span><b className="cyan">{p.scenarioName.toUpperCase()}</b></div>
        <div className="readout"><span>TRUNK DRAIN</span><b className={p.storm > 0.5 ? (r >= 1 ? "red" : r >= 0.8 ? "amber" : "green") : ""}>{p.storm > 0.5 ? `${Math.round(r * 100)} %` : "DRY"}</b></div>
        <button className={`status-pill ${p.status}`} onClick={p.onAbout} title="How these numbers are made">
          <i /><span className="sp-long">{p.status === "sourced" ? "SCREENING ESTIMATE · MSMA 2" : "YOUR WHAT-IF · MSMA 2"}</span>
          <span className="sp-short">{p.status === "sourced" ? "ESTIMATE" : "WHAT-IF"}</span>
        </button>
        <button className="btn-gold" onClick={p.onDemo}><PlayCircle size={14} /> GUIDED DEMO</button>
      </div>
    </header>
  );
}

export type Panel = "controls" | "layers" | null;

export function Rail(p: { route: string; panel: Panel; setPanel: (x: Panel) => void; onAbout: () => void; onDemo: () => void }) {
  // phones (22 Oct 2026): a short label under each icon; the least-used items stay on the desktop rail only
  const Item = (q: { icon: ReactNode; label: string; short?: string; phone?: false; on?: boolean; onClick?: () => void; href?: string; spot?: string }) => {
    const cls = `rail-btn ${q.on ? "on" : ""} ${q.phone === false ? "no-phone" : ""}`;
    const body = <>{q.icon}<span className="lbl">{q.label}</span><span className="lbl-s">{q.short ?? q.label}</span></>;
    return q.href ? <a className={cls} href={q.href} title={q.label} data-spot={q.spot}>{body}</a>
                  : <button className={cls} onClick={q.onClick} title={q.label} data-spot={q.spot}>{body}</button>;
  };
  const planner = p.route === "planner" || p.route === "demo";
  return (
    <nav className="rail" aria-label="Views">
      <Item icon={<Globe2 size={18} />} label="Malaysia" short="Map" href="#/" on={p.route === ""} />
      <Item icon={<Map size={18} />} label="Planner" short="Model" href="#/planner" on={planner && p.panel === null} />
      <Item icon={<SlidersHorizontal size={18} />} label="Scenario" short="What-if" on={planner && p.panel === "controls"}
        onClick={() => { if (!planner) location.hash = "#/planner"; p.setPanel(p.panel === "controls" ? null : "controls"); }} />
      <Item icon={<LayersIcon size={18} />} label="Layers" on={planner && p.panel === "layers"} spot="rail-layers"
        onClick={() => { if (!planner) location.hash = "#/planner"; p.setPanel(p.panel === "layers" ? null : "layers"); }} />
      <div className="rail-sep" />
      <Item icon={<Users size={18} />} label="Residents" short="Report" href="#/resident" on={p.route === "resident"} />
      <Item icon={<FileText size={18} />} label="Findings" short="Brief" href="#/brief" on={p.route === "brief"} spot="rail-brief" />
      <Item icon={<LifeBuoy size={18} />} label="Recovery" short="After" href="#/after" on={p.route === "after"} spot="rail-after" />
      <div className="rail-grow" />
      <Item icon={<PlayCircle size={18} />} label="Demo" onClick={p.onDemo} />
      <Item icon={<Info size={18} />} label="About" phone={false} onClick={p.onAbout} />
    </nav>
  );
}

export function LayersPanel({ layers, set, close }: { layers: Layers; set: (l: Layers) => void; close: () => void }) {
  const rows: [keyof Layers, string, string][] = [
    ["zones", "Drainage zones", "Nine draft zones, coloured by band in the storm"],
    ["labels", "Labels", "Areas, spots, zones, ponds, drain"],
    ["flow", "Flow arrows", "Mapped drain directions (OSM)"],
    ["boundary", "Council boundary", "Klang / Shah Alam line (OSM, not cadastral)"],
    ["upstream", "Next parcels upstream", "Area A blocks and the area beyond the edge"],
    ["trees", "Trees", "Invented street and park trees"],
    ["reports", "Resident reports", "Open reports from the resident door, at their pin"],
  ];
  return (
    <aside className="panel panel-left layers">
      <div className="panel-head"><span>LAYERS</span><button className="x" onClick={close} aria-label="Close">×</button></div>
      {rows.map(([k, label, help]) => (
        <label key={k} className="layer-row">
          <input type="checkbox" checked={layers[k]} onChange={(e) => set({ ...layers, [k]: e.target.checked })} />
          <span className="sw" /><span><b>{label}</b><small>{help}</small></span>
        </label>
      ))}
    </aside>
  );
}

const EVIDENCE = [
  ["BBR", "Residents say Jalan Makyong floods at least three times a year, since the big flood of December 2021", "Sinar Harian, 25 May 2024"],
  ["BBR", "583 residents across 48 associations petitioned the Menteri Besar", "2024"],
  ["BBR", "Residents ask for more retention ponds and bigger drains, upstream in Setia Alam and in BBR phase 1", "Sinar Harian, 25 May 2024"],
  ["SDP", "Managing director: \"quite urgent, and this is a top priority for us\"", "The Edge, 21 Nov 2024"],
  ["SELANGOR", "Over 300 retention ponds with no owner identified; about 55 taken over so far", "Sinar Harian, 5 May 2025"],
  ["KLANG", "17 urgent flood projects across 13 hotspots in the MBDK area", "Bernama, 5 May 2025"],
  ["SHAH ALAM", "RM150m flood plan for Setia Alam on Sungai Binjai and Sungai Puloh", "FMT, 5 Feb 2025"],
  ["METHOD", "MSMA 2nd Edition (DID Malaysia, 2012): Rational Method, IDF Eq. 2.2, Table 2.5 runoff coefficients", "DID"],
  ["DATA", "Map data © OpenStreetMap contributors (ODbL) · Terrain: Copernicus DEM GLO-30", "open data"],
];

export function Ticker() {
  const items = [...EVIDENCE, ...EVIDENCE];
  return (
    <div className="ticker" aria-label="Evidence feed">
      <div className="ticker-label">EVIDENCE</div>
      <div className="ticker-track"><div className="ticker-run">
        {items.map(([k, t, s], i) => <span key={i} className="tick"><i />{k}<b>{t}</b><em>{s}</em></span>)}
      </div></div>
    </div>
  );
}

export function Footer(p: { hover: { zone: string | null; p: [number, number, number] } | null; zoneName?: string; legend: ReactNode }) {
  const lat = p.hover ? 3.09 + -p.hover.p[2] / 110572 : null, lon = p.hover ? 101.436 + p.hover.p[0] / 111158 : null;
  return (
    <div className="footer">
      <div className="ft-cursor">
        <span>CURSOR</span><b>{lat === null ? "—" : `${lat.toFixed(4)} N, ${lon!.toFixed(4)} E`}</b>
        <span>ZONE</span><b>{p.hover?.zone ? `${p.hover.zone} · ${p.zoneName}` : "—"}</b>
      </div>
      <div className="ft-legend">{p.legend}</div>
      <div className="ft-right"><span className="live"><i />LIVE COMPUTE</span></div>
    </div>
  );
}
