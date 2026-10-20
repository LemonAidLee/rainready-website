// Data for the site: the precomputed results (mode A, outputs.json) and the live simulator (mode B, screening.ts).
// Both come from simulations/township-3d via scripts/sync-data.mjs; screening.ts is held equal to screening.py by
// check_parity.ts, so a recomputed result and the precomputed one agree when no input is changed.
import { run } from "../sim/screening.ts";

export type ScenarioId = "now" | "upstream" | "upstream_plus_pond";
export const SCENARIOS: { id: ScenarioId; label: string; short: string }[] = [
  { id: "now", label: "Today", short: "Today" },
  { id: "upstream", label: "Upstream change", short: "Upstream" },
  { id: "upstream_plus_pond", label: "+ What-if pond", short: "+ Pond" },
];
export type Band = "low" | "medium" | "high" | "unknown";

export interface Loaded {
  inputs: any;
  outputs: any;
  zonesDrawn: Record<string, number>;
  routes: Record<string, string>;
  trees: { count: number; trees: [number, number, number, number, string][] };
}

export async function loadAll(): Promise<Loaded> {
  const get = (f: string) => fetch(`./data/${f}`).then((r) => {
    if (!r.ok) throw new Error(`${f}: ${r.status}`);
    return r.json();
  });
  const [inputs, outputs, zones, trees] = await Promise.all([get("inputs.json"), get("outputs.json"), get("zones_meta.json"), get("trees.json")]);
  const zonesDrawn = Object.fromEntries(zones.zones.map((z: any) => [z.id, z.area_ha]));
  const routes = Object.fromEntries(zones.zones.map((z: any) => [z.id, z.route]));
  return { inputs, outputs, zonesDrawn, routes, trees };
}

/** The planner's adjustments (mode B). Undefined = keep the sourced / measured value from inputs.json. */
export interface Adjust {
  drainTopWidth?: number;     // trunk drain top width, m (bottom = half, depth scales gently)
  extArea?: number;           // upstream area beyond the model edge, ha
  extC?: number;              // its runoff coefficient after the upstream change
  pondSize?: number;          // what-if pond capacity, m3
  capA?: number | null;       // stated capacity of pond A, m3 (planner input)
  capB?: number | null;
}

export function isAdjusted(a: Adjust) {
  return Object.values(a).some((v) => v !== undefined && v !== null);
}

/** Inputs with the planner's adjustments applied (a deep copy; inputs.json itself is never changed). */
export function adjustedInputs(base: any, a: Adjust) {
  const inp = JSON.parse(JSON.stringify(base));
  const sec = inp.trunk_drain.section;
  if (a.drainTopWidth !== undefined) {
    const k = a.drainTopWidth / sec.top_width_m.value;
    sec.top_width_m.value = a.drainTopWidth;
    sec.bottom_width_m.value = a.drainTopWidth / 2;
    sec.depth_m.value = Math.max(1, Math.min(3.5, sec.depth_m.value * Math.sqrt(k)));
    for (const f of ["top_width_m", "bottom_width_m", "depth_m"]) sec[f].status = "planner input";
  }
  if (a.extArea !== undefined) Object.assign(inp.external_inflows.EXT_A.area_ha, { value: a.extArea, status: "planner input" });
  if (a.extC !== undefined) Object.assign(inp.external_inflows.EXT_A.c_upstream, { value: a.extC, status: "planner input" });
  if (a.pondSize !== undefined) inp.what_if_pond.capacity_m3.value = a.pondSize;
  if (a.capA !== undefined) inp.ponds.pond_A.capacity_m3.value = a.capA;
  if (a.capB !== undefined) inp.ponds.pond_B.capacity_m3.value = a.capB;
  return inp;
}

/** Mode A when nothing is adjusted (the precomputed file), mode B otherwise (recomputed in the browser). */
export function results(d: Loaded, a: Adjust) {
  return isAdjusted(a) ? run(adjustedInputs(d.inputs, a), d.zonesDrawn) : d.outputs;
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
  low: "#2E9B5F", medium: "#E6A21B", high: "#D2452F", unknown: "#A59A8C", base: "#E9E1D2",
};
