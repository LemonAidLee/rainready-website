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
 *   pond      the what-if pond on or off, and its size (a new retrofit pond, the kind of work already funded nearby)
 *   silt      share of each pond's live storage lost to silt, weeds or a blocked outlet (applied to the capacity the
 *             ponds are measured against here; screening.ts does not use it)
 *   blocked   share of the shared drain's carrying capacity lost to silt and rubbish (inputs trunk_drain.blockage)
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
  silt: number;               // 0..0.5, pond storage lost (upkeep)
  blocked: number;            // 0..0.6, shared drain blocked (upkeep)
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
    silt: 0, blocked: inp.trunk_drain.blockage?.value ?? 0,
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
  if (c.silt !== s.silt) out.push("pond upkeep");
  if (c.blocked !== s.blocked) out.push("drain upkeep");
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
  if (c.blocked !== s.blocked) {
    Object.assign(inp.trunk_drain.blockage, { value: c.blocked, status: "planner input" });
    // upkeep does not change the storm: hold it at the clean drain's critical duration, so a blocked drain is compared
    // with a clean one under the same storm (left free, a blocked drain can shift the critical duration and seem to
    // carry less)
    const clean = JSON.parse(JSON.stringify(inp));
    clean.trunk_drain.blockage.value = s.blocked;
    Object.assign(inp.storm.design_duration_h, { value: run(clean).scenarios.now.duration_h, status: "planner input" });
  }
  return inp;
}

/** The storage a pond is measured against: its entered capacity, else the assumed one, less the share lost to silt. */
export function roomOf(p: any, id: string, silt: number): number {
  return (p.capacity_m3 ?? ASSUMED_CAP[id]) * (1 - silt);
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
  for (const sc of Object.values<any>(r.scenarios)) {
    if (sc.what_if_pond) for (const s of d.inputs.what_if_pond.serves) sc.zones[s].via_whatif = true;
    for (const [id, p] of Object.entries<any>(sc.ponds)) p.room_m3 = roomOf(p, id, c.silt);
  }
  r.storage_lost = c.silt;
  return r;
}

export function scenarioName(c: Controls): string {
  const up = c.dev === 0 ? "Today's land cover" : c.dev === 1 ? "Next parcels built out" : `Next parcels ${Math.round(c.dev * 100)} % built`;
  const upkeep = [c.silt > 0 && `ponds ${Math.round(c.silt * 100)} % silted`, c.blocked > 0 && `drain ${Math.round(c.blocked * 100)} % blocked`].filter(Boolean);
  return `${up}${c.pond ? " + new pond" : ""}${upkeep.length ? ` · ${upkeep.join(", ")}` : ""}`;
}

// ---- presets: each is a full set of controls, starting from the sourced values, and the colour view that tells
// its story. Four groups, read in order: the problem, the next parcels upstream, the fixes on the table, and keeping
// what is built working. Each was chosen (team leader, 21 Oct 2026) so that the map looks different from every
// other preset. The town is built: the levers stand for decisions still being made (retrofits, the parcels not yet
// built, upkeep), not for redesigning it.
export type PresetGroup = "problem" | "upstream" | "fixes" | "upkeep";
export const PRESET_GROUPS: Record<PresetGroup, string> = {
  problem: "The problem", upstream: "Next parcels upstream", fixes: "Fixes on the table", upkeep: "Keep it working",
};
export interface Preset {
  id: string; group: PresetGroup; label: string; blurb: string; show: Basis; wide?: boolean;   // show: the card's summary
  set: (s: Controls) => Partial<Controls>;
}

export const PRESETS: Preset[] = [
  { id: "today", group: "problem", label: "Today's design storm", show: "capacity", set: () => ({}),
    blurb: "100-year storm on today's land. Where is there not enough room?" },
  { id: "common", group: "problem", label: "A common heavy storm", show: "capacity", set: () => ({ ari: 2 }),
    blurb: "2-year storm (50 % chance each year). The shared drain fills first" },
  { id: "builtout", group: "upstream", label: "Next parcels build out", show: "change", set: () => ({ dev: 1 }),
    blurb: "Open land left in Area A is built, where peak control falls short" },
  { id: "bigcatch", group: "upstream", label: "Larger upstream catchment", show: "change", set: () => ({ dev: 1, extArea: 200 }),
    blurb: "200 ha of Area A drains through the crossing" },
  { id: "pond", group: "fixes", label: "A new retrofit pond", show: "change", set: () => ({ pond: true, pondSize: 40000 }),
    blurb: "40,000 m³ on vacant land in Z06, before pond A: the kind of pond being added nearby" },
  { id: "drain", group: "fixes", label: "Widen the shared drain", show: "capacity", set: () => ({ drainTopWidth: 10 }),
    blurb: "Drain works to 10 m, like the main ditch: ponds can release" },
  { id: "together", group: "fixes", label: "Fix it together", show: "capacity", wide: true,
    set: () => ({ dev: 1, pond: true, pondSize: 40000, drainTopWidth: 10 }),
    blurb: "Next parcels built. The pond alone or the 10 m drain alone leaves red; together they clear it" },
  { id: "neglect", group: "upkeep", label: "Silted and blocked", show: "capacity", set: () => ({ ari: 2, silt: 0.3, blocked: 0.3 }),
    blurb: "A common 2-year storm, ponds 30 % silted and the drain 30 % blocked" },
  { id: "unkept", group: "upkeep", label: "Widened, then left to clog", show: "capacity", set: () => ({ drainTopWidth: 10, blocked: 0.3 }),
    blurb: "The 10 m drain works, then 30 % blocked: the gain is lost" },
];

/** One line for a preset's card, read from the same simulator: share of capacity, or change from today. */
export function presetSummary(d: Loaded, pr: Preset): string {
  const c = applyPreset(d.inputs, pr), sc = results(d, c).scenarios[scenarioOf(c)];
  const t = sc.trunk_drain, A = sc.ponds.pond_A, B = sc.ponds.pond_B;
  if (pr.show === "capacity") {
    const full = (p: any, id: string) => `${Math.round((p.storage_required_m3 / roomOf(p, id, c.silt)) * 100)} %`;
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
 * One risk band on the map (team leader, 21 Oct 2026): every area is coloured by room for water, in every preset;
 * change from today shows as ▲ / ▼ on the zone tags (changeTag), never as a second colour scale.
 *   capacity  the map's band: each zone against the capacity of what it drains to: the what-if pond when it catches
 *             the zone, else its pond (stated, else ASSUMED_CAP, L) or the trunk drain (its assumed conveyance).
 *             Worked out here from the results; screening.ts is unchanged
 *   change    words only (the Brief's scenario columns): the screening's change from today, or the entered capacity
 */
export type Basis = "capacity" | "change";
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
    const full = roomOf(p, to, 0), room = p.room_m3 ?? full;
    return { ratio: p.storage_required_m3 / room,
             of: `${name}'s ${p.capacity_m3 === null ? "assumed" : "entered"} capacity${room < full ? `, ${Math.round((1 - room / full) * 100)} % silted` : ""}` };
  }
  if (to === "trunk_drain") return { ratio: sc.trunk_drain.ratio,
    of: `the trunk drain's assumed capacity${sc.trunk_drain.blockage ? `, ${Math.round(sc.trunk_drain.blockage * 100)} % blocked` : ""}` };
  return null;
}

/** Change from today for a zone, as a ratio (1 = no change): its pond's storage need, or the trunk drain's flow. */
export function zoneChange(z: any, sc: any): number | null {
  if (z.drains_to in sc.ponds) return sc.ponds[z.drains_to].change_vs_now;
  if (z.drains_to === "trunk_drain") return sc.trunk_drain.change_vs_now;
  return null;
}

/** "▲ 10 %" / "▼ 17 %" when a zone's load moved by 5 % or more from today, else null (the zone tags' change marker). */
export function changeTag(r: number | null): string | null {
  if (r === null || Math.abs(r - 1) < 0.05) return null;
  return `${r > 1 ? "▲" : "▼"} ${Math.round(Math.abs(r - 1) * 100)} %`;
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
};
