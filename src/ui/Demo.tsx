// Guided demo: a scripted walk through the planner view, the Brief and the resident door, for live presentations and
// for recording the video hands-free. Each step sets the app's state (controls, storm, card, panel, page), a camera
// focus, pointers in the model (ring, beam and numbered callout) and a highlight box on the interface element to read.
// Every number in a caption is read from the simulator results, never typed in, so the narration cannot drift from
// the model. Keys: → / Space next · ← back · P play/pause · H clean frame (hide controls) · Esc exit.
import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Pause, Play, X } from "lucide-react";
import { ASSUMED_CAP, type Basis, type Controls } from "../lib/data";
import { m3, num } from "../lib/format";
import type { Pick } from "../scene/Township";
import type { PointAt } from "../scene/Overlays";
import type { Panel } from "./Shell";

export type Focus = { t: [number, number, number]; k: number };   // camera target (glTF x, up, -y) and zoom factor
export interface Ctx { base: any; cur: any; inputs: any }            // base = sourced results, cur = what is on screen
export interface Step {
  title: string;
  body: (c: Ctx) => string;
  controls?: Partial<Controls>;                                      // on top of the sourced values
  storm: 0 | 1;
  basis?: Basis;                                                     // what zone colours show (default: storage shortfall)
  pick?: Pick;
  panel?: Panel;
  route?: "" | "brief" | "resident";
  focus: Focus;
  points?: PointAt[];                                                // where to look in the model
  ui?: { sel: string; label: string }[];                             // where to look on the screen
  ms: number;                                                        // autoplay time on this step
}

const OVERVIEW: Focus = { t: [239, 0, 105], k: 1 };
const pct = (r: number) => `${Math.round(Math.abs(r - 1) * 100)}%`;

export const STEPS: Step[] = [
  { title: "One shared picture", storm: 0, focus: OVERVIEW, ms: 9000,
    points: [{ at: "label_area_A", label: "Area A · upstream, Shah Alam side" }, { at: "label_area_B", label: "Area B · downstream, Klang side" }],
    body: () => "A simulated township loosely based on Bandar Bukit Raja. Area A and Area B are a simulated pair based on Setia Alam (Shah Alam council) upstream and Bandar Bukit Raja (Klang council) downstream. The ponds, drains, main ditch, council line and flood streets are mapped from OpenStreetMap; the town fabric is invented." },
  { title: "Property lines stop at the fence. Water doesn't.", storm: 0, focus: { t: [960, 0, -360], k: 2.4 }, ms: 9000,
    points: [{ at: "crossing", label: "The one mapped drain that crosses the council line" }],
    body: () => "The light curtain is the Klang / Shah Alam council boundary. One mapped drain crosses it at the council corner and joins the shared trunk drain that carries water west to the main ditch. Two councils, one drain." },
  { title: "Where residents say it floods", storm: 0, focus: { t: [-300, 0, 60], k: 1.7 }, ms: 9000,
    points: [{ at: "label_spot_1", label: "Spot 1 · floods 3× a year, residents say" }, { at: "label_spot_2", label: "Spot 2 · retention pond requested" }, { at: "label_spot_3", label: "Spot 3 · bigger drains requested" }],
    body: () => "From the residents' 2024 memorandum (Sinar Harian, 25 May 2024): Spot 1 is the street they say floods at least three times a year. At Spot 2 they ask for a retention pond, and at Spot 3 for bigger drains. The pins mark the streets, not measured flood locations." },
  { title: "A 100-year design storm", storm: 1, focus: OVERVIEW, ms: 11000,
    ui: [{ sel: '[data-spot="storm"]', label: "Design storm" }],
    points: [{ at: "trunk", label: "Shared trunk drain" }],
    body: (c) => `RainReady runs the published Malaysian method (MSMA 2nd Edition, DID 2012): a 100-year, ${c.base.scenarios.now.duration_h}-hour storm, ${num(c.base.scenarios.now.intensity_mm_hr, 1)} mm/h at the JPS Telok Gong gauge. Arrows show water moving along the mapped drains. Red zones drain into a pond or a drain that would be over its assumed capacity: where storage falls short today, not a flood depth.` },
  { title: "Today: how much the ponds must hold", storm: 1, pick: { kind: "pond", id: "pond_A" }, focus: { t: [-120, 0, 300], k: 2.0 }, ms: 12000,
    points: [{ at: "pond_A", label: "Pond A" }, { at: "pond_B", label: "Pond B" }],
    ui: [{ sel: '[data-spot="res-pond_A"]', label: "Storage required" }, { sel: '[data-spot="res-trunk"]', label: "Drain load" }],
    body: (c) => { const s = c.base.scenarios.now; return `Pond A must hold about ${m3(s.ponds.pond_A.storage_required_m3)} and pond B ${m3(s.ponds.pond_B.storage_required_m3)}. The shared trunk drain is at ${Math.round(s.trunk_drain.ratio * 100)}% of its assumed capacity, so the ponds can release ${s.ponds.pond_A.released_m3 + s.ponds.pond_B.released_m3 < 1 ? "nothing" : "only part of it"} during the storm. No pond capacity is public, so the colours use an assumed one (mapped area × 1.5 m, confidence L): against it, pond A is short by about ${m3(s.ponds.pond_A.storage_required_m3 - ASSUMED_CAP.pond_A)}. Storage required, not depth.`; } },
  { title: "Scenario: more paved land upstream", storm: 1, basis: "change", controls: { dev: 1 }, panel: "controls", focus: { t: [1550, 0, -560], k: 1.5 }, ms: 10000,
    points: [{ at: "label_area_A", label: "Blocks rise on open land in Area A" }, { at: "ext", label: "Area A beyond the model edge" }],
    ui: [{ sel: '[data-spot="dev"]', label: "Upstream development" }],
    body: () => "The colours now show the change from today. Slide upstream development to 'built out': open land in Area A is paved where peak control is not fully achieved. Under MSMA's rule a fully controlled development would not raise peak flow; this scenario tests the case where it is not. A what-if, not a forecast." },
  { title: "The shared drain carries more", storm: 1, basis: "change", controls: { dev: 1 }, focus: OVERVIEW, ms: 11000,
    points: [{ at: "trunk", label: "Shared trunk drain: load rises" }],
    ui: [{ sel: '[data-spot="res-trunk"]', label: "Drain load vs today" }],
    body: (c) => { const u = c.base.scenarios.upstream; return `With the upstream change, the shared trunk drain carries ${pct(u.trunk_drain.change_vs_now)} more. The zones that drain into it turn amber, on both sides of the council line.${u.trunk_drain.pond_release_share === 0 && c.base.scenarios.now.trunk_drain.pond_release_share === 0 ? " The ponds' storage need stays the same: the drain is already full, so they release nothing either way." : ""} This is a difference between scenarios, not a finding of blame.`; } },
  { title: "What if a pond is added?", storm: 1, basis: "change", controls: { dev: 1, pond: true }, panel: "controls", pick: null, focus: { t: [-560, 0, 300], k: 2.0 }, ms: 10000,
    points: [{ at: "pond_whatif", label: "What-if pond (invented)" }, { at: "pond_A", label: "Pond A needs less" }],
    ui: [{ sel: '[data-spot="pond"]', label: "What-if pond" }, { sel: '[data-spot="res-pond_A"]', label: "Pond A storage" }],
    body: (c) => { const s = c.base.scenarios.upstream_plus_pond; return `A what-if pond on vacant land (OSM brownfield) holds ${m3(s.what_if_pond.capacity_m3)} during the storm. It cuts pond A's storage need by ${pct(s.ponds.pond_A.change_vs_now)}, so the zones that drain to pond A turn blue. Planners can test a pond, and its size, before anyone builds one.`; } },
  { title: "The biggest unknown: the drain's size", storm: 1, basis: "change", controls: { dev: 1, drainTopWidth: 10 }, panel: "controls", focus: OVERVIEW, ms: 11000,
    points: [{ at: "trunk", label: "Drain ribbon widens" }],
    ui: [{ sel: '[data-spot="drain"]', label: "Drain size: no public record" }, { sel: '[data-spot="res-pond_A"]', label: "Result moves" }],
    body: (c) => `No public record gives the shared drain's size, so it is a slider. At a main-ditch-like 10 m, the ponds can release, and the upstream change raises pond A's storage need by ${pct(c.cur.scenarios.upstream.ponds.pond_A.change_vs_now)}. Decision support under uncertainty: the unknown is shown, not hidden.` },
  { title: "The Shared Capacity Brief", storm: 1, route: "brief", focus: OVERVIEW, ms: 9000,
    ui: [{ sel: '[data-spot="brief-table"]', label: "Storage by scenario" }, { sel: '[data-spot="brief-owners"]', label: "Who holds each piece" }],
    body: () => "One printable page for every party: storage required with and without the upstream change, who maintains each pond and drain, and every assumption with its source and confidence." },
  { title: "The resident door", storm: 1, route: "resident", focus: OVERVIEW, ms: 10000,
    ui: [{ sel: '[data-spot="phone-report"]', label: "Report via chat" }, { sel: '[data-spot="phone-move"]', label: "Move-now plan" }],
    body: () => "Residents report blocked drains through the messaging they already use; their association checks and forwards each report to the existing official channel. On an official warning they get a move-now plan that links back to it. Clickable mock-ups, example data." },
  { title: "Planners see where storage falls short. Residents act in time.", storm: 1, focus: OVERVIEW, ms: 9000,
    body: () => "And residents' reports shape the next plan. RainReady: one shared picture of how water moves across council and developer boundaries. Screening estimates, MSMA 2 method; not a design, not a forecast." },
];

/** Glowing boxes around interface elements, re-measured as the layout moves. */
export function Spotlight({ items }: { items: { sel: string; label: string }[] }) {
  const [boxes, setBoxes] = useState<{ r: DOMRect; label: string }[]>([]);
  useEffect(() => {          // bring a highlighted section into view inside its scrolling panel
    const t = setTimeout(() => items.forEach((it) => document.querySelector(it.sel)?.closest(".panel")?.querySelector(it.sel)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" })), 450);
    return () => clearTimeout(t);
  }, [items]);
  useEffect(() => {
    let raf = 0, last = "";
    const tick = () => {
      const b = items.map((it) => ({ el: document.querySelector(it.sel), label: it.label }))
        .filter((x) => x.el).map((x) => ({ r: x.el!.getBoundingClientRect(), label: x.label }))
        .filter((x) => x.r.width > 0 && x.r.bottom > 0 && x.r.top < innerHeight);
      const key = b.map((x) => `${x.r.x|0},${x.r.y|0},${x.r.width|0},${x.r.height|0}`).join(";");
      if (key !== last) { last = key; setBoxes(b); }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [items]);
  return <>{boxes.map((b, i) => (
    <div key={i} className="spot-box" style={{ left: b.r.left - 6, top: b.r.top - 6, width: b.r.width + 12, height: b.r.height + 12 }}>
      <span>{b.label}</span>
    </div>
  ))}</>;
}

export function DemoBar(p: { step: number; ctx: Ctx; playing: boolean; clean: boolean; go: (i: number) => void;
                             togglePlay: () => void; toggleClean: () => void; exit: () => void; legend?: ReactNode }) {
  const s = STEPS[p.step];
  return (
    <div className={`demo ${p.clean ? "clean" : ""}`}>
      <div className="demo-top">
        <span className="demo-count">STEP {String(p.step + 1).padStart(2, "0")} / {STEPS.length}</span>
        <div className="demo-dots">{STEPS.map((_, i) => <button key={i} className={i === p.step ? "on" : i < p.step ? "done" : ""} onClick={() => p.go(i)} aria-label={`Step ${i + 1}`} />)}</div>
      </div>
      <b className="demo-title">{s.title}</b>
      <p className="demo-body">{s.body(p.ctx)}</p>
      {p.legend && <div className="demo-legend-in">{p.legend}</div>}
      <div className="demo-progress"><i key={`${p.step}-${p.playing}`} style={{ animationDuration: `${s.ms}ms`, animationPlayState: p.playing ? "running" : "paused" }} className={p.playing ? "run" : ""} /></div>
      {!p.clean && (
        <div className="demo-ctl">
          <button className="btn sq" onClick={() => p.go(p.step - 1)} disabled={p.step === 0} aria-label="Back"><ChevronLeft size={16} /></button>
          <button className="btn-gold" onClick={p.togglePlay}>{p.playing ? <><Pause size={14} /> PAUSE</> : <><Play size={14} /> PLAY</>}</button>
          <button className="btn sq" onClick={() => p.go(p.step + 1)} disabled={p.step === STEPS.length - 1} aria-label="Next"><ChevronRight size={16} /></button>
          <span className="grow" />
          <button className="btn" onClick={p.toggleClean} title="Hide the controls for recording (H)"><EyeOff size={14} /> CLEAN FRAME</button>
          <button className="btn sq" onClick={p.exit} aria-label="Exit the demo"><X size={16} /></button>
        </div>
      )}
      {p.clean && <button className="demo-unclean" onClick={p.toggleClean} aria-label="Show the controls"><Eye size={14} /></button>}
    </div>
  );
}
