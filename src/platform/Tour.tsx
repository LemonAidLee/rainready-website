// The guided tour of a 2D site (22 Oct 2026): the BBR demo's walk, generated for any site. Each step sets the levers,
// the storm, the panel and the map view, and points at the screen. Every number in a caption is read from this site's
// own results (the engine run in the browser), never typed in. Keys: → / Space next · ← back · P play · H clean · Esc.
import { ChevronLeft, ChevronRight, Eye, EyeOff, Pause, Play, X } from "lucide-react";
import { val } from "../sim/network.ts";
import { fmt, pct, type Pack } from "./data";
import { headline, type C2 } from "./model";
import { nameOf, shortCouncil } from "./SitePanels";
import type { Pick2 } from "./MapView";
import type { Panel2, Tab2 } from "./Panels";

export interface TourCtx { pack: Pack; base: any; cur?: any; feats: (k: string) => any[]; bounds: (fs: any[]) => any; run: (c: Partial<C2>) => any }
export interface TourStep {
  title: string; body: (c: TourCtx) => string; ms: number; storm: 0 | 1;
  controls?: (c: TourCtx) => Partial<C2>; panel?: Panel2; tab?: Tab2; page?: "findings";
  pick?: (c: TourCtx) => Pick2; focus?: (c: TourCtx) => any; ui?: { sel: string; label: string }[];
}

const m3 = (v: number) => `${fmt(v)} m³`;
const all = (c: TourCtx) => [[c.pack.site.bbox[0], c.pack.site.bbox[1]], [c.pack.site.bbox[2], c.pack.site.bbox[3]]];
const fullest = (sc: any) => Object.entries<any>(sc.ponds).filter(([, p]) => p.ratio !== null).sort((a, b) => b[1].ratio - a[1].ratio)[0];
const featOf = (c: TourCtx, kind: string, id: string) => c.feats(kind).filter((f) => f.properties.id === id);
const sides = (c: TourCtx) => c.pack.site.councils.map(shortCouncil).map((s) => s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase())).join(" and ");

export const TOUR: TourStep[] = [
  { title: "One shared picture, generated", storm: 0, ms: 9000, focus: all,
    body: (c) => `${c.pack.site.name}: ${c.pack.site.summary}. Built automatically from open data (OpenStreetMap, Copernicus terrain, JPS Selangor's pond list), so most inputs are assumptions, marked L. Screening, not design.`,
    ui: [{ sel: '[data-spot="storm"]', label: "Screening estimate" }] },
  { title: "Property lines stop at the fence", storm: 0, ms: 10000,
    focus: (c) => c.bounds([...c.feats("council_line"), ...c.feats("crossing_point")]) ?? all(c),
    body: (c) => { const x = c.base.scenarios.now.crossings; const q = x.reduce((a: number, y: any) => a + y.flow_m3_s, 0);
      return `The gold line is the boundary between ${sides(c)}. In a 100-year storm, ${x.length} links carry about ${fmt(q, 1)} m³/s from one council's side into the other's drains and ponds. A difference to plan for together, not a blame.`; },
    panel: "site", tab: "boundary", ui: [{ sel: '[data-spot="site-panel"]', label: "Where water crosses" }] },
  { title: "Where it has flooded", storm: 0, ms: 9000, focus: (c) => c.bounds(c.feats("flood")) ?? all(c),
    body: (c) => { const r = c.pack.site.evidence.flood_records; const ys = [...new Set(r.map((x) => x.year))].sort();
      return `The red dots are JPS Selangor's own flood records: ${r.length} inside this area, ${ys[0]}–${ys[ys.length - 1]}. Place, year and type only: no depths.`; } },
  { title: "A 100-year design storm", storm: 1, ms: 10000, focus: all,
    body: (c) => { const s = c.base.scenarios.now; return `MSMA 2 storm for gauge ${c.pack.site.storm.station.split(" ")[0]}, ${c.pack.site.storm.distance_km} km away: ${fmt(s.intensity_mm_hr, 1)} mm/h over ${s.duration_h} h, the duration that needs the most storage. Drains run downhill; each zone sends its water to its outlet. Red means more water than room, never a depth.`; },
    ui: [{ sel: '[data-spot="storm"]', label: "Design storm" }] },
  { title: "Where storage falls short", storm: 1, ms: 11000,
    focus: (c) => { const f = fullest(c.base.scenarios.now); return f ? c.bounds(featOf(c, "pond", f[0])) : all(c); },
    pick: (c) => { const f = fullest(c.base.scenarios.now); return f ? { kind: "pond", id: f[0] } : null; },
    body: (c) => { const s = c.base.scenarios.now, f = fullest(s), h = headline(s);
      return f ? `${nameOf(c.pack.inputs, f[0])} needs ${m3(f[1].storage_required_m3)}: ${pct(f[1].ratio)} of its assumed capacity (water area × 1.5 m, L). Across the site the ponds fall ${m3(h.gap)} short.` : "No pond falls short in this storm."; },
    ui: [{ sel: '[data-spot="results"]', label: "Storage required" }] },
  { title: "Scenario: the open land built", storm: 1, ms: 11000, controls: () => ({ dev: 1 }), panel: "controls", focus: all,
    body: (c) => { const a = headline(c.base.scenarios.now), b = headline(c.run({ dev: 1 }).scenarios.current);
      return `Gold hatching: every open or vacant block built as housing. The storage gap goes from ${m3(a.gap)} to ${m3(b.gap)}, and ${b.drainsOver} of ${b.drains} drains run over their assumed size. What a before-you-build check would test.`; },
    ui: [{ sel: '[data-spot="dev"]', label: "Open land built" }] },
  { title: "What if a pond is added?", storm: 1, ms: 11000, controls: () => ({ dev: 1, pond: true }), panel: "controls",
    focus: (c) => c.bounds(c.feats("whatif")) ?? all(c),
    body: (c) => { const w = c.pack.inputs.what_if_ponds?.W1; if (!w) return "This site has no open parcel large enough for a what-if pond.";
      const a = headline(c.run({ dev: 1 }).scenarios.current), b = headline(c.run({ dev: 1, pond: true }).scenarios.current);
      return `A retrofit pond of ${m3(val(w.capacity_m3))} on open land in ${w.serves.join(", ")}. With the land built out, the storage gap moves from ${m3(a.gap)} to ${m3(b.gap)}. A test, not a proposal.`; },
    ui: [{ sel: '[data-spot="pond"]', label: "New retrofit pond" }] },
  { title: "The biggest unknown: drain sizes", storm: 1, ms: 11000, controls: () => ({ drainScale: 1.5 }), panel: "controls", focus: all,
    body: (c) => { const a = headline(c.base.scenarios.now), b = headline(c.run({ drainScale: 1.5 }).scenarios.current);
      return `No public record gives these drains' sizes: they are typical values by type. Make every drain 1.5 × wider and the drains over capacity go from ${a.drainsOver} to ${b.drainsOver} of ${a.drains}; the storage gap from ${m3(a.gap)} to ${m3(b.gap)}.`; },
    ui: [{ sel: '[data-spot="drain"]', label: "Drain size: not public" }] },
  { title: "Keep it working", storm: 1, ms: 10000, controls: () => ({ ari: 2, silt: 0.3, blocked: 0.3 }), panel: "controls", focus: all,
    body: (c) => { const a = headline(c.run({ ari: 2 }).scenarios.current), b = headline(c.run({ ari: 2, silt: 0.3, blocked: 0.3 }).scenarios.current);
      return `A common 2-year storm. Kept as built, the gap is ${m3(a.gap)} with ${a.drainsOver} drains over; with ponds 30 % silted and drains 30 % blocked it is ${m3(b.gap)} with ${b.drainsOver} over. Upkeep is a decision too.`; },
    ui: [{ sel: '[data-spot="upkeep"]', label: "Upkeep" }] },
  { title: "Replace our assumptions", storm: 1, ms: 9000, panel: "site", tab: "upload", focus: all,
    body: () => "A council or developer uploads its own pond and drain register (CSV or GeoJSON): stated capacities and measured sizes replace ours, in the browser, and every figure here moves with them. Nothing is sent to a server.",
    ui: [{ sel: '[data-spot="site-panel"]', label: "Upload a register" }] },
  { title: "Findings, for this site", storm: 1, ms: 9000, page: "findings",
    body: () => "One printable page from the same results: how much the ponds must hold, the drains that fill, where water crosses council lines, every input with its source, and what this cannot tell you.",
    ui: [{ sel: '[data-spot="f-ponds"]', label: "How much the ponds must hold" }] },
  { title: "One method, every township", storm: 1, ms: 9000, focus: all,
    body: (c) => `${c.pack.site.name} is one folder of data screened by the same engine as Bandar Bukit Raja. Adding a township is two commands; every site is ranked on one page, All sites. Screening estimates, MSMA 2 method; not a design, not a forecast.`,
    ui: [{ sel: '[data-spot="rail-sites"]', label: "All sites" }] },
];

export function TourBar(p: { step: number; ctx: TourCtx; playing: boolean; clean: boolean; go: (i: number) => void;
                             togglePlay: () => void; toggleClean: () => void; exit: () => void }) {
  const s = TOUR[p.step];
  return (
    <div className={`demo ${p.clean ? "clean" : ""}`}>
      <div className="demo-top">
        <span className="demo-count">STEP {String(p.step + 1).padStart(2, "0")} / {TOUR.length}</span>
        <div className="demo-dots">{TOUR.map((_, i) => <button key={i} className={i === p.step ? "on" : i < p.step ? "done" : ""} onClick={() => p.go(i)} aria-label={`Step ${i + 1}`} />)}</div>
      </div>
      <b className="demo-title">{s.title}</b>
      <p className="demo-body">{s.body(p.ctx)}</p>
      <div className="demo-progress"><i key={`${p.step}-${p.playing}`} style={{ animationDuration: `${s.ms}ms`, animationPlayState: p.playing ? "running" : "paused" }} className={p.playing ? "run" : ""} /></div>
      {!p.clean && (
        <div className="demo-ctl">
          <button className="btn sq" onClick={() => p.go(p.step - 1)} disabled={p.step === 0} aria-label="Back"><ChevronLeft size={16} /></button>
          <button className="btn-gold" onClick={p.togglePlay}>{p.playing ? <><Pause size={14} /> PAUSE</> : <><Play size={14} /> PLAY</>}</button>
          <button className="btn sq" onClick={() => p.go(p.step + 1)} disabled={p.step === TOUR.length - 1} aria-label="Next"><ChevronRight size={16} /></button>
          <span className="grow" />
          <button className="btn" onClick={p.toggleClean} title="Hide the controls for recording (H)"><EyeOff size={14} /> CLEAN FRAME</button>
          <button className="btn sq" onClick={p.exit} aria-label="Exit the tour"><X size={16} /></button>
        </div>
      )}
      {p.clean && <button className="demo-unclean" onClick={p.toggleClean} aria-label="Show the controls"><Eye size={14} /></button>}
    </div>
  );
}
