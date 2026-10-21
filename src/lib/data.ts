// Data for the site: the precomputed results (outputs.json, the sourced run) and the live simulator (screening.ts).
// Both come from simulations/township-3d via scripts/sync-data.mjs; screening.ts is held equal to screening.py by
// check_parity.ts, so a recomputed result and the precomputed one agree when no input is changed.
import { run } from "../sim/screening.ts";

export type ScenarioId = "now" | "upstream" | "upstream_plus_pond";
export type Band = "low" | "medium" | "high" | "unknown";
/** The three scenarios every run computes (the Brief tabulates all three). */
export const SCENARIOS: { id: ScenarioId; label: string }[] = [
  { id: "now", label: "Today" }, { id: "upstream", label: "Upstream change" }, { id: "upstream_plus_pond", label: "+ What-if pond" },
];

export interface Loaded {
  inputs: any;
  outputs: any;
  zonesDrawn: Record<string, number>;
  routes: Record<string, string>;
  trees: { count: number; trees: [number, number, number, number, string][] };
  overlays: { council_line: { paths: [number, number][][] } };
}

export async function loadAll(): Promise<Loaded> {
  const get = (f: string) => fetch(`./data/${f}`).then((r) => {
    if (!r.ok) throw new Error(`${f}: ${r.status}`);
    return r.json();
  });
  const [inputs, outputs, zones, trees, overlays] = await Promise.all(
    [get("inputs.json"), get("outputs.json"), get("zones_meta.json"), get("trees.json"), get("overlays.json")]);
  const zonesDrawn = Object.fromEntries(zones.zones.map((z: any) => [z.id, z.area_ha]));
  const routes = Object.fromEntries(zones.zones.map((z: any) => [z.id, z.route]));
  return { inputs, outputs, zonesDrawn, routes, trees, overlays };
}

/**
 * What the planner sets. One model for every control: the scenario on screen is always "these settings" compared
 * with today's land cover under the same storm and drain.
 *   dev       upstream development, 0 = today's land cover ... 1 = the full upstream change in inputs.json
 *             (Z01 aprons paved, EXT_A built out at its c_upstream). Values in between interpolate C linearly.
 *   pond      the what-if pond on or off, and its size
 */
export interface Controls {
  dev: number;
  extArea: number;            // ha of Area A beyond the model edge
  extC: number;               // EXT_A runoff coefficient when fully built out
  pond: boolean;
  pondSize: number;           // m3
  drainTopWidth: number;      // m (bottom = half, depth scales gently)
  ari: number;                // years, 2..100 (MSMA 2 IDF validity)
  capA: number | null;        // stated capacity of pond A, m3 (planner input)
  capB: number | null;
}

export function sourcedControls(inp: any): Controls {
  return {
    dev: 0, pond: false,
    extArea: inp.external_inflows.EXT_A.area_ha.value,
    extC: inp.external_inflows.EXT_A.c_upstream.value,
    pondSize: inp.what_if_pond.capacity_m3.value,
    drainTopWidth: inp.trunk_drain.section.top_width_m.value,
    ari: inp.storm.ari_years.value,
    capA: inp.ponds.pond_A.capacity_m3.value, capB: inp.ponds.pond_B.capacity_m3.value,
  };
}

/** Which settings differ from the sourced inputs (dev 0 or 1 and the pond switch only pick a scenario). */
export function changedInputs(c: Controls, inp: any): string[] {
  const s = sourcedControls(inp), out: string[] = [];
  if (c.dev > 0 && c.dev < 1) out.push("upstream development");
  if (c.extArea !== s.extArea) out.push("upstream area");
  if (c.extC !== s.extC) out.push("upstream land use");
  if (c.pond && c.pondSize !== s.pondSize) out.push("pond size");
  if (c.drainTopWidth !== s.drainTopWidth) out.push("drain size");
  if (c.ari !== s.ari) out.push("storm");
  if (c.capA !== s.capA || c.capB !== s.capB) out.push("pond capacity");
  return out;
}

/** Give the trunk drain a new top width in place (bottom = half, depth scales gently with the width). */
export function setDrainWidth(inp: any, top: number) {
  const sec = inp.trunk_drain.section;
  const k = top / sec.top_width_m.value;
  sec.top_width_m.value = top;
  sec.bottom_width_m.value = top / 2;
  sec.depth_m.value = Math.max(1, Math.min(3.5, sec.depth_m.value * Math.sqrt(k)));
  for (const f of ["top_width_m", "bottom_width_m", "depth_m"]) sec[f].status = "planner input";
}

/** Inputs with the planner's settings applied (a deep copy; inputs.json itself is never changed). */
export function adjustedInputs(base: any, c: Controls) {
  const inp = JSON.parse(JSON.stringify(base));
  const s = sourcedControls(base);
  if (c.drainTopWidth !== s.drainTopWidth) setDrainWidth(inp, c.drainTopWidth);
  const ext = inp.external_inflows.EXT_A;
  if (c.extArea !== s.extArea) Object.assign(ext.area_ha, { value: c.extArea, status: "planner input" });
  // upstream development: the "upstream" C of every zone and inflow goes dev of the way from today to the full change
  const towards = (node: any, full: number) => {
    const v = node.c_now.value + c.dev * (full - node.c_now.value);
    if (v !== node.c_upstream.value) Object.assign(node.c_upstream, { value: v, status: "planner input" });
  };
  for (const z of Object.values<any>(inp.zones)) towards(z, z.c_upstream.value);
  towards(ext, c.extC);
  if (c.ari !== s.ari) Object.assign(inp.storm.ari_years, { value: c.ari, status: "planner input" });
  if (c.pondSize !== s.pondSize) inp.what_if_pond.capacity_m3.value = c.pondSize;
  inp.ponds.pond_A.capacity_m3.value = c.capA;
  inp.ponds.pond_B.capacity_m3.value = c.capB;
  return inp;
}

/** The scenario that shows these settings: always compared with "now" in the same run. */
export function scenarioOf(c: Controls): ScenarioId {
  return c.pond ? "upstream_plus_pond" : c.dev > 0 ? "upstream" : "now";
}

export function results(d: Loaded, c: Controls) {
  // outputs.json holds the sourced run; a pond on today's land cover (dev 0) is not one of its scenarios
  const sourced = changedInputs(c, d.inputs).length === 0 && !(c.pond && c.dev === 0);
  const r = sourced ? d.outputs : run(adjustedInputs(d.inputs, c), d.zonesDrawn);
  // mark the zones the what-if pond catches: against capacity, they are measured against that pond (zoneLook)
  for (const sc of Object.values<any>(r.scenarios))
    if (sc.what_if_pond) for (const s of d.inputs.what_if_pond.serves) sc.zones[s].via_whatif = true;
  return r;
}

export function scenarioName(c: Controls): string {
  const up = c.dev === 0 ? "Today's land cover" : c.dev === 1 ? "Upstream built out" : `Upstream ${Math.round(c.dev * 100)} % built out`;
  return c.pond ? `${up} + what-if pond` : up;
}

// ---- presets: each is a full set of controls, starting from the sourced values, and the colour view that tells
// its story. Three groups, read in order: the problem, what the upstream change does, and fixes to test. Each was
// chosen (team leader, 21 Oct 2026) so that the map looks different from every other preset.
export type PresetGroup = "problem" | "upstream" | "fixes";
export const PRESET_GROUPS: Record<PresetGroup, string> = {
  problem: "The problem", upstream: "Across the council line", fixes: "Fixes to test",
};
export interface Preset {
  id: string; group: PresetGroup; label: string; blurb: string; basis: Basis; wide?: boolean;
  set: (s: Controls) => Partial<Controls>;
}

export const PRESETS: Preset[] = [
  { id: "today", group: "problem", label: "Today's design storm", basis: "capacity", set: () => ({}),
    blurb: "100-year storm on today's land. Where is there not enough room?" },
  { id: "common", group: "problem", label: "A common heavy storm", basis: "capacity", set: () => ({ ari: 2 }),
    blurb: "2-year storm (50 % chance each year). The shared drain fills first" },
  { id: "builtout", group: "upstream", label: "Upstream builds out", basis: "change", set: () => ({ dev: 1 }),
    blurb: "Area A paved where peak control falls short" },
  { id: "bigcatch", group: "upstream", label: "Larger upstream catchment", basis: "change", set: () => ({ dev: 1, extArea: 200 }),
    blurb: "200 ha of Area A drains through the crossing" },
  { id: "pond", group: "fixes", label: "Add a pond", basis: "change", set: () => ({ pond: true, pondSize: 40000 }),
    blurb: "40,000 m³ on vacant land in Z06, before pond A" },
  { id: "drain", group: "fixes", label: "Widen the shared drain", basis: "capacity", set: () => ({ drainTopWidth: 10 }),
    blurb: "10 m, like the main ditch: ponds can release" },
  { id: "together", group: "fixes", label: "Fix it together", basis: "capacity", wide: true,
    set: () => ({ dev: 1, pond: true, pondSize: 40000, drainTopWidth: 10 }),
    blurb: "Upstream built out. The pond alone or the 10 m drain alone leaves red; together they clear it" },
];

/** One line for a preset's card, read from the same simulator: share of capacity, or change from today. */
export function presetSummary(d: Loaded, pr: Preset): string {
  const c = applyPreset(d.inputs, pr), sc = results(d, c).scenarios[scenarioOf(c)];
  const t = sc.trunk_drain, A = sc.ponds.pond_A, B = sc.ponds.pond_B;
  if (pr.basis === "capacity") {
    const full = (p: any, id: string) => `${Math.round((p.storage_required_m3 / (p.capacity_m3 ?? ASSUMED_CAP[id])) * 100)} %`;
    return `A ${full(A, "pond_A")} · B ${full(B, "pond_B")} · drain ${Math.round(t.ratio * 100)} %`;
  }
  const chg = (r: number) => { const v = Math.round((r - 1) * 100); return v === 0 ? "±0" : `${v > 0 ? "+" : "−"}${Math.abs(v)} %`; };
  return `A ${chg(A.change_vs_now)} · B ${chg(B.change_vs_now)} · drain ${chg(t.change_vs_now)}`;
}

/**
 * ASSUMED capacities: the storage-shortfall colours, the results panel and the Brief's gaps until a planner enters a
 * stated capacity (labelled as assumed, L wherever shown). Never claimed as stated. The mapped water area
 * (OSM, as measured in the model: pond A 55,611 m², pond B 57,255 m²) times a 1.5 m live-storage band above the
 * normal water level. The 1.5 m is a stated assumption (research/HY_screening_inputs.md section 7), confidence L.
 */
export const ASSUMED_CAP: Record<string, number> = { pond_A: 83400, pond_B: 85900 };

/** Main-ditch-like widths the Brief compares the assumed trunk drain with (the Scenario lever runs 3–14 m). */
export const DRAIN_WIDTHS_COMPARED = [10, 14];

export function applyPreset(inp: any, p: Preset): Controls {
  const s = sourcedControls(inp);
  return { ...s, ...p.set(s) };
}

/**
 * What the zone colours measure (team leader, 21 Oct 2026: "capacity" is the default, so today's shortfall shows):
 *   capacity  each zone against the capacity of what it drains to: the what-if pond when it catches the zone, else
 *             its pond (stated, else ASSUMED_CAP, L) or the trunk drain (its assumed conveyance). Worked out here
 *             from the results; screening.ts is unchanged
 *   change    the screening's own bands: change from today (today is the neutral baseline), or the entered
 *             capacity once a planner enters one; a fall of 5 % or more gets its own colour ("better")
 */
export type Basis = "capacity" | "change";
// Colours mean one thing each (team leader, 21 Oct 2026): green / amber / red only ever describe room for water
// (storage shortfall). The change view has its own scale: blue better, grey about the same, violet worse, magenta
// much worse.
export type Change = "better" | "same" | "worse" | "muchworse";
export type Look = Band | "base" | Change;
const CAP_MEDIUM = 0.8, CAP_HIGH = 1.0;                       // as inputs.json method.band_capacity_*_from
const CHANGE_DOWN = 0.95;                                      // mirror of the +5 % medium band
/** Plain words for the storage-shortfall bands (legend, zone cards, Brief). */
export const ROOM: Record<Band, string> = { low: "Room to spare", medium: "Nearly full", high: "Not enough room", unknown: "Outlet not known" };

/** A zone's load: storage need over the capacity of the pond that catches it, or the trunk drain's flow over its conveyance. */
export function capacityLoad(z: any, sc: any): { ratio: number; of: string } | null {
  const to = z.drains_to, wp = sc.what_if_pond;
  if (z.via_whatif && wp?.capacity_m3) return { ratio: wp.storage_required_m3 / wp.capacity_m3, of: "the what-if pond's size" };
  if (to in sc.ponds) {
    const p = sc.ponds[to], name = to === "pond_A" ? "pond A" : "pond B";
    return { ratio: p.storage_required_m3 / (p.capacity_m3 ?? ASSUMED_CAP[to]),
             of: `${name}'s ${p.capacity_m3 === null ? "assumed" : "entered"} capacity` };
  }
  if (to === "trunk_drain") return { ratio: sc.trunk_drain.ratio, of: "the trunk drain's assumed capacity" };
  return null;
}

/** Colour and label of a zone in one scenario (sc = results.scenarios[scenario]). */
export function zoneLook(z: any, scenario: ScenarioId, sc: any, basis: Basis): { band: Look; label: string } {
  if (basis === "capacity") {
    const l = capacityLoad(z, sc);
    if (!l) return { band: "unknown", label: "Outlet not known" };
    const band: Band = l.ratio >= CAP_HIGH ? "high" : l.ratio >= CAP_MEDIUM ? "medium" : "low";
    return { band, label: `${ROOM[band]}: ${Math.round(l.ratio * 100)} % of ${l.of}` };
  }
  if (z.band_basis === "change_vs_now" && scenario === "now") return { band: "base", label: "Baseline (today)" };
  if (z.band_basis === "change_vs_now" && z.ratio !== null && z.ratio <= CHANGE_DOWN)
    return { band: "better", label: `Better: ${Math.round((1 - z.ratio) * 100)} % less than today` };
  if (z.band === "unknown") return { band: "unknown", label: "Outlet not known" };
  if (z.band_basis === "capacity")
    return { band: z.band, label: `${ROOM[z.band as Band]}: ${Math.round(z.ratio * 100)} % of the entered capacity` };
  const ch: Record<string, [Change, string]> = { low: ["same", "About the same as today"], medium: ["worse", "Worse: up 5–20 % on today"],
                                                 high: ["muchworse", "Much worse: up more than 20 % on today"] };
  return { band: ch[z.band][0], label: ch[z.band][1] };
}

export const BAND_COLOR: Record<string, string> = {
  low: "#1fbf75", medium: "#f2a516", high: "#ff4a3d", unknown: "#6b7785", base: "#c9d4de",
  better: "#3aa0ff", same: "#8d9aa8", worse: "#b07cff", muchworse: "#e957e6",
};
