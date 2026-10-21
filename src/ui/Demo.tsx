// Guided demo: a scripted walk through the planner view, the Brief and the resident door, for live presentations and
// for recording the video hands-free. Each step sets the app's state (controls, storm, card, panel, page), a camera
// focus, pointers in the model (ring, beam and numbered callout) and a highlight box on the interface element to read.
// Every number in a caption is read from the simulator results, never typed in, so the narration cannot drift from
// the model. Keys: → / Space next · ← back · P play/pause · H clean frame (hide controls) · Esc exit.
import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Pause, Play, X } from "lucide-react";
import { ASSUMED_CAP, adjustedInputs, roomOf, sourcedControls, type Controls } from "../lib/data";
import { run } from "../sim/screening.ts";
import { JPS_RECORDS, toModel } from "../lib/evidence";
import { m3, num } from "../lib/format";
import type { Pick } from "../scene/Township";
import type { PointAt } from "../scene/Overlays";
import type { Panel } from "./Shell";

export type Focus = { t: [number, number, number]; k: number };   // camera target (glTF x, up, -y) and zoom factor
// base = sourced results, cur = what is on screen, national = the map's counts (Landing onData)
export interface Ctx { base: any; cur: any; inputs: any; national?: { flood: number; floodYears: string; flash: number; towns: number; major: number; majorYears: string } }
export interface Step {
  title: string;
  body: (c: Ctx) => string;
  controls?: Partial<Controls>;                                      // on top of the sourced values
  storm: 0 | 1;
  pick?: Pick;
  panel?: Panel;
  route?: "" | "brief" | "resident" | "map";                          // map: the landing globe; Next flies in
  focus: Focus;
  points?: PointAt[];                                                // where to look in the model
  ui?: { sel: string; label: string }[];                             // where to look on the screen
  ms: number;                                                        // autoplay time on this step
}

const OVERVIEW: Focus = { t: [239, 0, 105], k: 1 };
const [rx, ry] = toModel(JPS_RECORDS[0].lat, JPS_RECORDS[0].lon);
const RECORD: [number, number, number] = [rx, 8, -ry];               // JPS's ponding record in Z03, glTF coordinates
const pct = (r: number) => `${Math.round(Math.abs(r - 1) * 100)}%`;
/** The upkeep step's settings, and the same storm with everything kept as built (read live, never typed in). */
const UPKEEP: Partial<Controls> = { ari: 2, silt: 0.3, blocked: 0.3 };
const keptAsBuilt = (inputs: any) => run(adjustedInputs(inputs, { ...sourcedControls(inputs), ari: UPKEEP.ari! })).scenarios.now;

export const STEPS: Step[] = [
  { title: "Flooding is a national problem", storm: 0, route: "map", focus: OVERVIEW, ms: 11000,
    body: (c) => { const n = c.national; return n
      ? `Every dot is a recorded flood: ${n.flood.toLocaleString("en-GB")} JPS records in Selangor (${n.floodYears}), ${n.flash} flash-flood locations in ${n.towns} towns across every state (JPS, 2017) and ${n.major} major floods since ${n.majorYears.split("–")[0]}. RainReady starts with one catchment: Bandar Bukit Raja.`
      : "Every dot is a recorded flood, from JPS and the Dartmouth Flood Observatory. RainReady starts with one catchment: Bandar Bukit Raja."; } },
  { title: "One shared picture", storm: 0, focus: OVERVIEW, ms: 9000,
    points: [{ at: "label_area_A", label: "Area A · upstream, Shah Alam side" }, { at: "label_area_B", label: "Area B · downstream, Klang side" }],
    body: () => "A simulated township loosely based on Bandar Bukit Raja. Area A and Area B are a simulated pair based on Setia Alam (Shah Alam council) upstream and Bandar Bukit Raja (Klang council) downstream. The ponds, drains, main ditch, council line and flood streets are mapped from OpenStreetMap; the town fabric is invented." },
  { title: "Property lines stop at the fence. Water doesn't.", storm: 0, focus: { t: [960, 0, -360], k: 2.4 }, ms: 9000,
    points: [{ at: "crossing", label: "The one mapped drain that crosses the council line" }],
    body: () => "The light curtain is the Klang / Shah Alam council boundary. One mapped drain crosses it at the council corner and joins the shared trunk drain that carries water west to the main ditch. Two councils, one drain." },
  { title: "Where residents say it floods, and where JPS recorded it", storm: 0, focus: { t: [-300, 0, 60], k: 1.7 }, ms: 11000,
    points: [{ at: "label_spot_1", label: "Spot 1 · floods 3× a year, residents say" }, { at: "label_spot_2", label: "Spot 2 · retention pond requested" }, { at: "label_spot_3", label: "Spot 3 · bigger drains requested" }, { at: RECORD, label: "JPS record · ponding 2023, 2024" }],
    body: () => "From the residents' 2024 memorandum (Sinar Harian, 25 May 2024): Spot 1 is the street they say floods at least three times a year. At Spot 2 they ask for a retention pond, and at Spot 3 for bigger drains. The white diamond is JPS Selangor's own record: ponding here in 2023 and 2024." },
  { title: "A 100-year design storm", storm: 1, focus: OVERVIEW, ms: 11000,
    ui: [{ sel: '[data-spot="storm"]', label: "Design storm" }],
    points: [{ at: "trunk", label: "Shared trunk drain" }],
    body: (c) => `RainReady runs the published Malaysian method (MSMA 2nd Edition, DID 2012): a 100-year, ${c.base.scenarios.now.duration_h}-hour storm, ${num(c.base.scenarios.now.intensity_mm_hr, 1)} mm/h at the JPS Telok Gong gauge. Arrows show water moving along the mapped drains. Red zones drain into a pond or a drain that would be over its assumed capacity: where storage falls short today, not a flood depth.` },
  { title: "Today: how much the ponds must hold", storm: 1, pick: { kind: "pond", id: "pond_A" }, focus: { t: [-120, 0, 300], k: 2.0 }, ms: 12000,
    points: [{ at: "pond_A", label: "Pond A" }, { at: "pond_B", label: "Pond B" }],
    ui: [{ sel: '[data-spot="res-pond_A"]', label: "Storage required" }, { sel: '[data-spot="res-trunk"]', label: "Drain load" }],
    body: (c) => { const s = c.base.scenarios.now; return `Pond A must hold about ${m3(s.ponds.pond_A.storage_required_m3)} and pond B ${m3(s.ponds.pond_B.storage_required_m3)}. The shared trunk drain is at ${Math.round(s.trunk_drain.ratio * 100)}% of its assumed capacity, so the ponds can release ${s.ponds.pond_A.released_m3 + s.ponds.pond_B.released_m3 < 1 ? "nothing" : "only part of it"} during the storm. No pond capacity is public, so the colours use an assumed one: mapped area × 1.5 m of storage, inside MSMA 2's 1–3 m planning range. Against it, pond A is short by about ${m3(s.ponds.pond_A.storage_required_m3 - ASSUMED_CAP.pond_A)}. Storage required, not depth.`; } },
  { title: "The next parcels upstream", storm: 1, controls: { dev: 1 }, panel: "controls", focus: { t: [1550, 0, -560], k: 1.5 }, ms: 10000,
    points: [{ at: "label_area_A", label: "Blocks rise on open land in Area A" }, { at: "ext", label: "Area A beyond the model edge" }],
    ui: [{ sel: '[data-spot="dev"]', label: "Next parcels upstream" }],
    body: () => "The town is built, but not all of it: slide 'next parcels upstream' to built, and the open land left in Area A is paved where peak control is not fully achieved. Under MSMA's rule a fully controlled development would not raise peak flow; this scenario tests the case where it is not. A what-if, not a forecast." },
  { title: "The shared drain carries more", storm: 1, controls: { dev: 1 }, focus: OVERVIEW, ms: 11000,
    points: [{ at: "trunk", label: "Shared trunk drain: load rises" }],
    ui: [{ sel: '[data-spot="res-trunk"]', label: "Drain load vs today" }],
    body: (c) => { const u = c.base.scenarios.upstream; return `With the upstream change, the shared trunk drain carries ${pct(u.trunk_drain.change_vs_now)} more. The zones that drain into it show ▲ ${pct(u.trunk_drain.change_vs_now)} on their tags, on both sides of the council line.${u.trunk_drain.pond_release_share === 0 && c.base.scenarios.now.trunk_drain.pond_release_share === 0 ? " The ponds' storage need stays the same: the drain is already full, so they release nothing either way." : ""} This is a difference between scenarios, not a finding of blame.`; } },
  { title: "A fix on the table: a new pond", storm: 1, controls: { dev: 1, pond: true }, panel: "controls", pick: null, focus: { t: [-560, 0, 300], k: 2.0 }, ms: 10000,
    points: [{ at: "pond_whatif", label: "New retrofit pond (what-if)" }, { at: "pond_A", label: "Pond A needs less" }],
    ui: [{ sel: '[data-spot="pond"]', label: "New retrofit pond" }, { sel: '[data-spot="res-pond_A"]', label: "Pond A storage" }],
    body: (c) => { const s = c.base.scenarios.upstream_plus_pond; return `A retrofit pond, the kind already being added nearby, tested on vacant land (OSM brownfield), holds ${m3(s.what_if_pond.capacity_m3)} during the storm. It cuts pond A's storage need by ${pct(s.ponds.pond_A.change_vs_now)}, so the zones that drain to pond A show ▼ on their tags. Planners can test a pond, and its size, before anyone pays for one.`; } },
  { title: "The biggest unknown: the drain's size", storm: 1, controls: { dev: 1, drainTopWidth: 10 }, panel: "controls", focus: OVERVIEW, ms: 11000,
    points: [{ at: "trunk", label: "Drain ribbon widens" }],
    ui: [{ sel: '[data-spot="drain"]', label: "Drain size: no public record" }, { sel: '[data-spot="res-pond_A"]', label: "Result moves" }],
    body: (c) => `No public record gives the shared drain's size, so it is a slider. At a main-ditch-like 10 m the ponds can release, and the upstream change raises pond A's storage need by ${pct(c.cur.scenarios.upstream.ponds.pond_A.change_vs_now)}. Satellite imagery shows nothing that wide along it, and pond A stays short for any drain under about 12 m: the unknown is shown, and the finding survives it.` },
  { title: "Keep it working", storm: 1, controls: UPKEEP, panel: "controls", focus: OVERVIEW, ms: 12000,
    points: [{ at: "pond_A", label: "Pond A: less room" }, { at: "trunk", label: "Shared drain: partly blocked" }],
    ui: [{ sel: '[data-spot="upkeep"]', label: "Upkeep" }, { sel: '[data-spot="res-pond_A"]', label: "Pond A" }],
    body: (c) => { const k = keptAsBuilt(c.inputs), s = c.cur.scenarios.now, full = (sc: any, silt: number) => Math.round(sc.ponds.pond_A.storage_required_m3 / roomOf(sc.ponds.pond_A, "pond_A", silt) * 100);
      return `A built town still decides every year whether its ponds are desilted and its drains cleared. In a common 2-year storm, kept as built, pond A uses ${full(k, 0)}% of its room and the shared drain ${Math.round(k.trunk_drain.ratio * 100)}%. With the ponds 30% silted and the drain 30% blocked, pond A needs ${full(s, UPKEEP.silt!)}% and the drain ${Math.round(s.trunk_drain.ratio * 100)}%. What-ifs: no upkeep record is public.`; } },
  { title: "The findings, on one page", storm: 1, route: "brief", focus: OVERVIEW, ms: 9000,
    ui: [{ sel: '[data-spot="brief-table"]', label: "How much the ponds must hold" }, { sel: '[data-spot="brief-owners"]', label: "Who looks after what" }],
    body: () => "One page for every party, in five short chapters: how much water the ponds must hold, why they fall short, which fixes help, who looks after each drain and pond, and how sure we are. A companion page, Recovery, explains what happens after a flood, from relief to the courts: who holds each duty, never who is to blame." },
  { title: "Checked against the ground", storm: 1, route: "brief", focus: OVERVIEW, ms: 12000,
    ui: [{ sel: '[data-spot="brief-checks"]', label: "Hits and misses" }],
    body: () => "The screening agrees with JPS's own flood records, an independent flood model and the residents' flood street. It does not explain the residents' three floods a year: those point to street drains it does not model, which is what residents ask to have enlarged. Both key assumptions were tested; the finding holds." },
  { title: "The resident door", storm: 1, route: "resident", focus: OVERVIEW, ms: 11000,
    ui: [{ sel: '[data-spot="wl-map"]', label: "Report on the township map" }, { sel: '[data-spot="wl-recent"]', label: "Track each report" }],
    body: () => "Residents report a blocked drain, a flooded street or another hazard on the township map, with a photo. Their residents' association checks each report and sends it to whoever looks after that place, worked out from the responsibility record: the council of that side, JPS, or 'not settled'. RainReady forwards; it never dispatches anyone. Demo roles and sample reports." },
  { title: "Reports land on the shared picture", storm: 1, focus: { t: [-311, 0, -276], k: 1.8 }, ms: 11000,
    points: [{ at: [-311, 24, -276], label: "A resident's blocked-drain report" }, { at: "trunk", label: "Shared drain" }],
    body: () => "Every open report appears as a pin on the same model, in its drainage zone. A blocked-drain report on a street that drains to the shared drain has a 'Test in planner' button: it sets the drain-blockage lever, so everyone sees what that drain does to the ponds. Residents' reports shape the next plan." },
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
