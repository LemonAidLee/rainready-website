// Guided demo: a scripted walk through the planner view, the Brief and the resident door, for live presentations and
// for recording the video hands-free. Each step sets the app's state (scenario, storm, card, Adjust, page) and a camera
// focus. Every number in a caption is read from the simulator results, never typed in, so the narration cannot drift
// from the model. Keys: → / Space next · ← back · P play/pause · H clean frame (hide controls) · Esc exit.
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Pause, Play, X } from "lucide-react";
import type { Adjust, ScenarioId } from "../lib/data";
import { m3, num } from "../lib/format";
import type { Pick } from "../scene/Township";

export type Focus = { t: [number, number, number]; k: number };   // camera target (glTF x, up, -y) and zoom factor
export interface Ctx { base: any; cur: any; inputs: any }            // base = sourced results, cur = what is on screen
export interface Step {
  title: string;
  body: (c: Ctx) => string;
  scenario: ScenarioId;
  storm: 0 | 1;
  pick?: Pick;
  adjust?: Adjust;
  adjustOpen?: boolean;
  route?: "" | "brief" | "resident";
  focus: Focus;
  ms: number;                                                        // autoplay time on this step
}

const OVERVIEW: Focus = { t: [239, 0, 105], k: 1 };
const pct = (r: number) => `${Math.round(Math.abs(r - 1) * 100)}%`;

export const STEPS: Step[] = [
  { title: "One shared picture", scenario: "now", storm: 0, focus: OVERVIEW, ms: 9000,
    body: () => "A simulated township loosely based on Bandar Bukit Raja. Area A and Area B are a simulated pair based on Setia Alam (Shah Alam council) upstream and Bandar Bukit Raja (Klang council) downstream. The ponds, drains, main ditch, council line and flood streets are mapped from OpenStreetMap; the town fabric is invented." },
  { title: "Property lines stop at the fence. Water doesn't.", scenario: "now", storm: 0, focus: { t: [926, 0, -325], k: 2.6 }, ms: 9000,
    body: () => "This dashed line is the Klang / Shah Alam council boundary. One mapped drain crosses it, here at the council corner, and joins the shared trunk drain that carries water west to the main ditch. Two councils, one drain." },
  { title: "Where residents say it floods", scenario: "now", storm: 0, focus: { t: [-240, 0, 100], k: 1.8 }, ms: 9000,
    body: () => "Spots 1 and 2 are streets that residents' associations name as flooding, at least three times a year by their account (Sinar Harian). Spot 3 is where residents asked for larger drains. The pins mark the streets, not measured flood locations." },
  { title: "A 100-year design storm", scenario: "now", storm: 1, focus: OVERVIEW, ms: 9000,
    body: (c) => `RainReady runs the published Malaysian method (MSMA 2nd Edition, DID 2012): a 100-year, ${c.base.scenarios.now.duration_h}-hour storm, ${num(c.base.scenarios.now.intensity_mm_hr, 1)} mm/hr at the JPS Telok Gong gauge. Arrows show water moving along the mapped drains.` },
  { title: "Today: how much the ponds must hold", scenario: "now", storm: 1, pick: { kind: "pond", id: "pond_A" }, focus: { t: [-120, 0, 300], k: 2.2 }, ms: 10000,
    body: (c) => { const s = c.base.scenarios.now; return `Pond A must hold about ${m3(s.ponds.pond_A.storage_required_m3)} and pond B ${m3(s.ponds.pond_B.storage_required_m3)}. The shared trunk drain is at ${Math.round(s.trunk_drain.ratio * 100)}% of its assumed capacity, so the ponds can release ${s.ponds.pond_A.released_m3 + s.ponds.pond_B.released_m3 < 1 ? "nothing" : "only part of it"} during the storm. Storage required, not depth: no pond capacity is public, so none is claimed.`; } },
  { title: "Scenario: more paved land upstream", scenario: "upstream", storm: 1, focus: { t: [1350, 0, -440], k: 2.4 }, ms: 9000,
    body: () => "In Area A, open land is paved, where peak control is not fully achieved. Under MSMA's rule a fully controlled development would not raise peak flow; this scenario tests the case where it is not. A what-if, not a forecast." },
  { title: "The shared drain carries more", scenario: "upstream", storm: 1, focus: OVERVIEW, ms: 10000,
    body: (c) => `With the upstream change, the shared trunk drain carries ${pct(c.base.scenarios.upstream.trunk_drain.change_vs_now)} more. The four zones that drain into it turn amber, on both sides of the council line. This is a difference between scenarios, not a finding of blame.` },
  { title: "What if a pond is added?", scenario: "upstream_plus_pond", storm: 1, pick: { kind: "pond", id: "pond_whatif" }, focus: { t: [-691, 0, 432], k: 2.6 }, ms: 10000,
    body: (c) => { const s = c.base.scenarios.upstream_plus_pond; return `A what-if pond on vacant land (OSM brownfield) holds ${m3(s.what_if_pond.capacity_m3)} during the storm. It cuts pond A's storage need by ${pct(s.ponds.pond_A.change_vs_now)}. Planners can test a pond before anyone builds one.`; } },
  { title: "The biggest unknown: the drain's size", scenario: "upstream", storm: 1, adjust: { drainTopWidth: 10 }, adjustOpen: true, focus: OVERVIEW, ms: 11000,
    body: (c) => `No public record gives the shared drain's size, so it is a slider. At a main-ditch-like 10 m, the ponds can release, and the upstream change raises pond A's storage need by ${pct(c.cur.scenarios.upstream.ponds.pond_A.change_vs_now)}. Decision support under uncertainty: the unknown is shown, not hidden.` },
  { title: "The Shared Capacity Brief", scenario: "now", storm: 1, route: "brief", focus: OVERVIEW, ms: 9000,
    body: () => "One printable page for every party: storage required with and without the upstream change, who maintains each pond and drain, and every assumption with its source and confidence." },
  { title: "The resident door", scenario: "now", storm: 1, route: "resident", focus: OVERVIEW, ms: 10000,
    body: () => "Residents report blocked drains through the messaging they already use; their association checks and forwards each report to the existing official channel. On an official warning they get a move-now plan that links back to it. Clickable mock-ups, example data." },
  { title: "Planners see where storage falls short. Residents act in time.", scenario: "now", storm: 1, focus: OVERVIEW, ms: 9000,
    body: () => "And residents' reports shape the next plan. RainReady: one shared picture of how water moves across council and developer boundaries. Screening estimates, MSMA 2 method; not a design, not a forecast." },
];

export function DemoBar(p: { step: number; ctx: Ctx; playing: boolean; clean: boolean; go: (i: number) => void;
                             togglePlay: () => void; toggleClean: () => void; exit: () => void; legend?: ReactNode }) {
  const s = STEPS[p.step];
  return (
    <div className={`demo ${p.clean ? "clean" : ""}`}>
      <div className="demo-top">
        <span className="demo-count">{p.step + 1} / {STEPS.length}</span>
        <b className="demo-title">{s.title}</b>
      </div>
      <p className="demo-body">{s.body(p.ctx)}</p>
      {p.legend && <div className="legend demo-legend-in">{p.legend}</div>}
      <div className="demo-progress"><i key={`${p.step}-${p.playing}`} style={{ animationDuration: `${s.ms}ms`, animationPlayState: p.playing ? "running" : "paused" }} className={p.playing ? "run" : ""} /></div>
      {!p.clean && (
        <div className="demo-ctl">
          <button className="chip square" onClick={() => p.go(p.step - 1)} disabled={p.step === 0} aria-label="Back"><ChevronLeft size={18} /></button>
          <button className="chip accent" onClick={p.togglePlay}>{p.playing ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Play</>}</button>
          <button className="chip square" onClick={() => p.go(p.step + 1)} disabled={p.step === STEPS.length - 1} aria-label="Next"><ChevronRight size={18} /></button>
          <button className="chip" onClick={p.toggleClean} title="Hide the controls for recording (H)"><EyeOff size={16} /> Clean frame</button>
          <button className="chip square" onClick={p.exit} aria-label="Exit the demo"><X size={18} /></button>
        </div>
      )}
      {p.clean && <button className="demo-unclean" onClick={p.toggleClean} aria-label="Show the controls"><Eye size={14} /></button>}
    </div>
  );
}
