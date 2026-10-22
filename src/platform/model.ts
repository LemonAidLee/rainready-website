// The levers of a 2D site (22 Oct 2026): the BBR planner's controls (lib/data.ts), made for any drain network. Each
// setting changes a copy of the site's inputs and re-runs the network engine (sim/network.ts) in the browser; the
// engine itself is never changed. Two scenarios per run: "now" (today's land cover, no new pond, same storm, same
// drains) and "current" (these settings), so every change reads as a difference from today.
import { run, val } from "../sim/network.ts";

export interface C2 {
  dev: number;                  // open land built out: 0 = today ... 1 = every open block built (c_upstream)
  pond: boolean;                // the what-if pond W1
  pondSize: number;             // m3
  drainScale: number;           // drain works: every mapped drain's widths x this (depth x its square root)
  ari: number;                  // design storm, years (MSMA 2 IDF valid 2-100)
  silt: number;                 // share of every pond's storage lost (upkeep)
  blocked: number;              // share of every drain's carrying capacity lost (upkeep)
  caps: Record<string, number>; // stated pond capacities typed in by a planner (m3)
}

export function sourced2(inp: any): C2 {
  return { dev: 0, pond: false, pondSize: val(inp.what_if_ponds?.W1?.capacity_m3) ?? 0, drainScale: 1,
           ari: val(inp.storm.ari_years), silt: 0, blocked: 0, caps: {} };
}

export function changed2(c: C2, inp: any): string[] {
  const s = sourced2(inp), out: string[] = [];
  if (c.dev > 0) out.push("open land built");
  if (c.pond) out.push("what-if pond");
  if (c.pond && c.pondSize !== s.pondSize) out.push("pond size");
  if (c.drainScale !== 1) out.push("drain size");
  if (c.ari !== s.ari) out.push("storm");
  if (c.silt > 0) out.push("pond upkeep");
  if (c.blocked > 0) out.push("drain upkeep");
  if (Object.keys(c.caps).length) out.push("pond capacity");
  return out;
}

/** The site's inputs with these settings, as two scenarios (now, current). A deep copy; the pack is never changed. */
export function adjusted2(base: any, c: C2, holdStorm = true): any {
  const inp = JSON.parse(JSON.stringify(base));
  const pi = (node: any, v: number) => Object.assign(node, { value: v, status: "planner input" });
  for (const d of Object.values<any>(inp.drains ?? {})) {
    if (c.drainScale !== 1) {
      const sec = d.section;
      pi(sec.top_width_m, val(sec.top_width_m) * c.drainScale);
      pi(sec.bottom_width_m, val(sec.bottom_width_m) * c.drainScale);
      pi(sec.depth_m, Math.min(3.5, val(sec.depth_m) * Math.sqrt(c.drainScale)));
    }
    if (c.blocked > 0) d.blockage = { value: c.blocked, status: "planner input" };
  }
  for (const [id, p] of Object.entries<any>(inp.ponds ?? {})) {
    if (id in c.caps) pi(p.capacity_m3, c.caps[id]);
    const cap = val(p.capacity_m3);
    if (c.silt > 0 && typeof cap === "number") pi(p.capacity_m3, cap * (1 - c.silt));
  }
  if (c.ari !== val(inp.storm.ari_years)) pi(inp.storm.ari_years, c.ari);
  if (inp.what_if_ponds?.W1 && c.pondSize) pi(inp.what_if_ponds.W1.capacity_m3, c.pondSize);
  for (const z of Object.values<any>(inp.zones)) {
    const now = val(z.c_now), up = val(z.c_upstream);
    z.c_cur = { value: now + c.dev * (up - now), status: c.dev ? "planner input" : "measured" };
  }
  inp.scenarios = {
    now: { c: "c_now", what_if_ponds: [], label: "Today's land cover" },
    current: { c: "c_cur", what_if_ponds: c.pond && inp.what_if_ponds?.W1 ? ["W1"] : [], label: "These settings" },
  };
  // upkeep does not change the storm: hold it at the clean drains' critical duration (as the BBR planner does)
  if (holdStorm && c.blocked > 0) {
    const clean = adjusted2(base, { ...c, blocked: 0 }, false);
    inp.storm.design_duration_h = { value: run(clean).scenarios.now.duration_h, status: "planner input" };
  }
  return inp;
}

export function results2(base: any, c: C2): any {
  return run(adjusted2(base, c));
}

export function scenarioName2(c: C2): string {
  const up = c.dev === 0 ? "Today's land cover" : c.dev === 1 ? "Open land built out" : `Open land ${Math.round(c.dev * 100)} % built`;
  const fix = [c.pond && "new pond", c.drainScale !== 1 && `drains ×${c.drainScale}`].filter(Boolean);
  const keep = [c.silt > 0 && `ponds ${Math.round(c.silt * 100)} % silted`, c.blocked > 0 && `drains ${Math.round(c.blocked * 100)} % blocked`].filter(Boolean);
  return `${up}${fix.length ? ` + ${fix.join(", ")}` : ""}${keep.length ? ` · ${keep.join(", ")}` : ""}`;
}

// ---- presets: the BBR planner's nine, in the same four groups, for any network
export type Group2 = "problem" | "upstream" | "fixes" | "upkeep";
export const GROUPS2: Record<Group2, string> = { problem: "The problem", upstream: "Open land upstream", fixes: "Fixes on the table", upkeep: "Keep it working" };
export interface Preset2 { id: string; group: Group2; label: string; blurb: string; wide?: boolean; set: (s: C2) => Partial<C2>; needsPond?: boolean }
export const PRESETS2: Preset2[] = [
  { id: "today", group: "problem", label: "Today's design storm", set: () => ({}), blurb: "100-year storm on today's land. Where is there not enough room?" },
  { id: "common", group: "problem", label: "A common heavy storm", set: () => ({ ari: 2 }), blurb: "2-year storm (50 % chance each year): which drains fill first" },
  { id: "half", group: "upstream", label: "Half the open land built", set: () => ({ dev: 0.5 }), blurb: "Half of every open and vacant block built as housing" },
  { id: "builtout", group: "upstream", label: "Open land built out", set: () => ({ dev: 1 }), blurb: "Every open and vacant block built as housing (C 0.90)" },
  { id: "pond", group: "fixes", label: "A new retrofit pond", needsPond: true, set: () => ({ pond: true }), blurb: "The what-if pond on the largest open parcel upstream of the most loaded pond" },
  { id: "drains", group: "fixes", label: "Enlarge the drains", set: () => ({ drainScale: 1.5 }), blurb: "Drain works: every mapped drain 1.5 × wider" },
  { id: "together", group: "fixes", label: "Fix it together", wide: true, set: () => ({ dev: 1, pond: true, drainScale: 1.5 }),
    blurb: "Open land built out, with the what-if pond and the drain works together" },
  { id: "neglect", group: "upkeep", label: "Silted and blocked", set: () => ({ ari: 2, silt: 0.3, blocked: 0.3 }), blurb: "A common 2-year storm, ponds 30 % silted and drains 30 % blocked" },
  { id: "unkept", group: "upkeep", label: "Enlarged, then left to clog", set: () => ({ drainScale: 1.5, blocked: 0.3 }), blurb: "The 1.5 × drains, then 30 % blocked: how much of the gain is lost" },
];

export function applyPreset2(inp: any, pr: Preset2): C2 {
  const s = sourced2(inp);
  return { ...s, ...pr.set(s) };
}

/** Headline numbers of one result: storage gap, the fullest pond, drains over capacity. */
export function headline(sc: any) {
  const ponds = Object.entries<any>(sc.ponds);
  const gap = ponds.reduce((a, [, p]) => a + (p.capacity_m3 ? Math.max(0, p.storage_required_m3 - p.capacity_m3) : 0), 0);
  const fullest = ponds.filter(([, p]) => p.ratio !== null).sort((a, b) => b[1].ratio - a[1].ratio)[0];
  const drains = Object.entries<any>(sc.drains);
  const worstDrain = drains.sort((a, b) => (b[1].ratio ?? 0) - (a[1].ratio ?? 0))[0];
  return { gap, fullest, worstDrain, drainsOver: drains.filter(([, d]) => (d.ratio ?? 0) >= 1).length, drains: drains.length };
}

export function presetSummary2(base: any, pr: Preset2): string {
  const sc = results2(base, applyPreset2(base, pr)).scenarios.current;
  const h = headline(sc);
  return `gap ${Math.round(h.gap / 1000)}k m³ · drains over ${h.drainsOver}/${h.drains}`;
}
