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

/** Inputs with the planner's settings applied (a deep copy; inputs.json itself is never changed). */
export function adjustedInputs(base: any, c: Controls) {
  const inp = JSON.parse(JSON.stringify(base));
  const s = sourcedControls(base);
  const sec = inp.trunk_drain.section;
  if (c.drainTopWidth !== s.drainTopWidth) {
    const k = c.drainTopWidth / sec.top_width_m.value;
    sec.top_width_m.value = c.drainTopWidth;
    sec.bottom_width_m.value = c.drainTopWidth / 2;
    sec.depth_m.value = Math.max(1, Math.min(3.5, sec.depth_m.value * Math.sqrt(k)));
    for (const f of ["top_width_m", "bottom_width_m", "depth_m"]) sec[f].status = "planner input";
  }
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
  return sourced ? d.outputs : run(adjustedInputs(d.inputs, c), d.zonesDrawn);
}

export function scenarioName(c: Controls): string {
  const up = c.dev === 0 ? "Today's land cover" : c.dev === 1 ? "Upstream built out" : `Upstream ${Math.round(c.dev * 100)} % built out`;
  return c.pond ? `${up} + what-if pond` : up;
}

// ---- presets: each is a full set of controls, starting from the sourced values
export interface Preset { id: string; label: string; blurb: string; set: (s: Controls) => Partial<Controls> }

export const PRESETS: Preset[] = [
  { id: "today", label: "Today", blurb: "Baseline: today's land cover, 100-year storm", set: () => ({}) },
  { id: "builtout", label: "Upstream built out", blurb: "Area A paved, peak control not fully achieved", set: () => ({ dev: 1 }) },
  { id: "pond", label: "Built out + pond", blurb: "Add a 25,000 m³ what-if pond above pond A", set: () => ({ dev: 1, pond: true }) },
  { id: "bigdrain", label: "Main-ditch-size drain", blurb: "10 m shared drain: ponds can release", set: () => ({ dev: 1, drainTopWidth: 10 }) },
  { id: "bigcatch", label: "Large upstream catchment", blurb: "200 ha of Area A drains through the crossing", set: () => ({ dev: 1, extArea: 200 }) },
  { id: "minor", label: "10-year storm", blurb: "Minor-system storm instead of 100-year", set: () => ({ ari: 10, dev: 1 }) },
  { id: "capacity", label: "Assumed pond capacity", blurb: "Area × 1.5 m live storage (assumption, L)", set: () => ({ capA: ASSUMED_CAP.pond_A, capB: ASSUMED_CAP.pond_B, dev: 1 }) },
];

/**
 * ASSUMED stated capacities for the "Assumed pond capacity" preset only (never the default): the mapped water area
 * (OSM, as measured in the model: pond A 55,611 m², pond B 57,255 m²) times a 1.5 m live-storage band above the
 * normal water level. The 1.5 m is a stated assumption (research/HY_screening_inputs.md section 7), confidence L.
 */
export const ASSUMED_CAP = { pond_A: 83400, pond_B: 85900 };

export function applyPreset(inp: any, p: Preset): Controls {
  const s = sourcedControls(inp);
  return { ...s, ...p.set(s) };
}

/** Colour of a zone: today is the baseline (neutral) unless a capacity was entered. */
export function zoneLook(z: any, scenario: ScenarioId): { band: Band | "base"; label: string } {
  if (z.band_basis === "change_vs_now" && scenario === "now") return { band: "base", label: "Baseline (today)" };
  const what = z.band_basis === "capacity" ? "of entered capacity" : "vs today";
  const lbl: Record<Band, string> = {
    low: z.band_basis === "capacity" ? "Below 80 % of capacity" : "No real increase",
    medium: z.band_basis === "capacity" ? "80–100 % of capacity" : "Up 5–20 %",
    high: z.band_basis === "capacity" ? "Over capacity" : "Up more than 20 %",
    unknown: "Outlet not known",
  };
  return { band: z.band, label: z.band === "unknown" ? lbl.unknown : `${lbl[z.band as Band]} (${what})` };
}

export const BAND_COLOR: Record<string, string> = {
  low: "#1fbf75", medium: "#f2a516", high: "#ff4a3d", unknown: "#6b7785", base: "#c9d4de",
};
