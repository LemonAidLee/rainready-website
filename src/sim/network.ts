/**
 * RainReady network screening engine, TypeScript port of network.py (22 Oct 2026).
 *
 * network.py is the REFERENCE. This file must give the same numbers, field for field and in the same key order:
 * check with   node --experimental-strip-types check_network.ts   (from simulations/platform)
 * Any change to the method is made in network.py first, then ported here, then the check is re-run.
 *
 * No dependencies and no file access, so it runs in the browser or in Node. Screening only: storage required,
 * change versus today, load, band, crossings. No depths, no times to recede, no compliance verdicts.
 */

export type Inputs = any;
export type Band = "low" | "medium" | "high" | "unknown";
export const OUTFALL = "outfall";

export function val(x: any): any {
  return x !== null && typeof x === "object" && !Array.isArray(x) && "value" in x ? x.value : x;
}

export function placeholders(node: unknown, path = ""): string[] {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return [];
  const o = node as Record<string, unknown>;
  if (o.status === "placeholder") return [path];
  let out: string[] = [];
  for (const [k, v] of Object.entries(o)) if (!k.startsWith("_")) out = out.concat(placeholders(v, path ? `${path}.${k}` : k));
  return out;
}

export function idfIntensity(idf: any, ariYears: number, dHours: number): number {
  return (val(idf.lambda) * ariYears ** val(idf.kappa)) / (dHours + val(idf.theta)) ** val(idf.eta);
}

export function rationalQ(c: number, iMmHr: number, aHa: number): number {
  return (c * iMmHr * aHa) / 360.0;
}

export function manningTrapezoid(section: any): number {
  const b = val(section.bottom_width_m), top = val(section.top_width_m), h = val(section.depth_m);
  const area = ((b + top) / 2.0) * h;
  const side = Math.hypot((top - b) / 2.0, h);
  const r = area / (b + 2.0 * side);
  return (area * r ** (2.0 / 3.0) * Math.sqrt(val(section.slope))) / val(section.manning_n);
}

export function drainCapacity(d: any): [number, number] {
  const lost = Math.min(0.9, Math.max(0.0, val(d.blockage ?? 0.0) || 0.0));
  return [manningTrapezoid(d.section) * (1.0 - lost), lost];
}

export function bandOf(ratio: number | null, mediumFrom: number, highFrom: number): Band {
  if (ratio === null) return "unknown";
  return ratio >= highFrom ? "high" : ratio >= mediumFrom ? "medium" : "low";
}

function capacityOf(p: any): number | null {
  const v = val(p.capacity_m3);
  return typeof v === "number" && v > 0 ? v : null;
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const entries = (o: any): [string, any][] => Object.entries(o ?? {});

/** Drains upstream first. Throws on a loop or on a drain that leads nowhere. */
export function drainOrder(inp: Inputs): string[] {
  const drains = inp.drains ?? {};
  const order: string[] = [], state: Record<string, number> = {};
  const visit = (d: string) => {
    if (state[d] === 2) return;
    if (state[d] === 1) throw new Error(`drain loop at ${d}`);
    state[d] = 1;
    for (const [u, x] of entries(drains)) if (x.drains_to === d) visit(u);
    state[d] = 2;
    order.push(d);
  };
  for (const [d, x] of entries(drains)) if (x.drains_to !== OUTFALL && !(x.drains_to in drains)) throw new Error(`drain ${d} drains to unknown ${x.drains_to}`);
  for (const d of Object.keys(drains)) visit(d);
  return order;
}

/** Drains and ponds must reach a known node; a zone may drain to an outlet not yet known (banded 'unknown'). */
export function validate(inp: Inputs): string[] {
  const bad: string[] = [];
  const drains = inp.drains ?? {};
  for (const [k, p] of entries(inp.ponds))
    if (!(p.drains_to in drains) && p.drains_to !== OUTFALL) bad.push(`ponds.${k} must drain to a drain or the outfall, not ${p.drains_to}`);
  for (const [k, w] of entries(inp.what_if_ponds))
    for (const s of w.serves) if (!(s in inp.zones)) bad.push(`what_if_ponds.${k} serves unknown zone ${s}`);
  try { drainOrder(inp); } catch (e) { bad.push(String((e as Error).message)); }
  return bad;
}

export function runDuration(inp: Inputs, ckey: string, whatifs: string[], dHours: number) {
  const T = val(inp.storm.ari_years);
  const idf = inp.storm.idf;
  const i = idfIntensity(idf, T, dHours);
  const iTc = idfIntensity(idf, T, val(inp.storm.tc_hours));
  const durS = dHours * 3600.0;
  const k = val(inp.method.hydrograph_volume_factor);
  const cPre = val(inp.method.c_predevelopment);

  const zones: Record<string, any> = {};
  for (const [zid, z] of entries(inp.zones)) {
    const q = rationalQ(val(z[ckey]), i, val(z.area_ha));
    zones[zid] = { q_m3_s: q, v_m3: k * q * durS, drains_to: z.drains_to };
  }
  const ext: Record<string, any> = {};
  for (const [eid, e] of entries(inp.external_inflows)) {
    const q = rationalQ(val(e[ckey]), i, val(e.area_ha));
    ext[eid] = { q_m3_s: q, v_m3: k * q * durS, drains_to: e.drains_to };
  }

  const passed: Record<string, [number, number]> = {};
  for (const [zid, z] of Object.entries(zones)) passed[zid] = [z.q_m3_s, z.v_m3];
  const nw: Record<string, any> = {};
  for (const wid of whatifs) {
    const wp = inp.what_if_ponds[wid];
    const cap = capacityOf(wp);
    const outQ = val(wp.outlet_m3_s);
    const vIn = sum(wp.serves.map((s: string) => zones[s].v_m3));
    const qIn = sum(wp.serves.map((s: string) => zones[s].q_m3_s));
    const vRel = Math.min(vIn, outQ * durS);
    const need = vIn - vRel;
    const over = cap ? Math.max(0.0, need - cap) : 0.0;
    nw[wid] = { inflow_m3: vIn, release_m3_s: outQ, released_m3: vRel, storage_required_m3: need, capacity_m3: cap,
                gap_m3: cap ? need - cap : null, ratio: cap ? need / cap : null };
    for (const s of wp.serves) {
      const w = vIn ? zones[s].v_m3 / vIn : 0.0;
      passed[s] = [(Math.min(qIn, outQ) + over / durS) * w, (vRel + over) * w];
    }
  }

  const allowed: Record<string, number> = {};
  for (const pid of Object.keys(inp.ponds ?? {}))
    allowed[pid] = rationalQ(cPre, iTc, sum(Object.values<any>(inp.zones).filter((z) => z.drains_to === pid).map((z) => val(z.area_ha))));

  const drains: Record<string, any> = {}, release: Record<string, number> = {};
  for (const did of drainOrder(inp)) {
    const d = inp.drains[did];
    const [cap, blockage] = drainCapacity(d);
    const direct = sum(Object.entries(zones).filter(([, x]) => x.drains_to === did).map(([z]) => passed[z][0])) +
      sum(Object.values<any>(ext).filter((e) => e.drains_to === did).map((e) => e.q_m3_s)) +
      sum(entries(inp.drains).filter(([, x]) => x.drains_to === did).map(([u]) => drains[u].outflow_m3_s));
    const spare = Math.max(0.0, cap - direct);
    const mine = entries(inp.ponds).filter(([, p]) => p.drains_to === did).map(([pid]) => pid);
    const totalAllowed = sum(mine.map((p) => allowed[p]));
    const share = totalAllowed <= spare ? 1.0 : totalAllowed ? spare / totalAllowed : 0.0;
    for (const p of mine) release[p] = allowed[p] * share;
    drains[did] = { capacity_m3_s: cap, blockage, direct_demand_m3_s: direct, spare_for_ponds_m3_s: spare,
                    pond_release_share: share, ratio: cap ? direct / cap : null,
                    outflow_m3_s: direct + sum(mine.map((p) => release[p])), drains_to: d.drains_to };
  }
  for (const [pid, p] of entries(inp.ponds)) if (p.drains_to === OUTFALL) release[pid] = allowed[pid];

  const ponds: Record<string, any> = {};
  for (const [pid, p] of entries(inp.ponds)) {
    const vIn = sum(Object.entries(zones).filter(([, x]) => x.drains_to === pid).map(([z]) => passed[z][1])) +
      sum(Object.values<any>(ext).filter((e) => e.drains_to === pid).map((e) => e.v_m3));
    const qRel = release[pid];
    const vRel = Math.min(vIn, qRel * durS);
    const need = vIn - vRel;
    const cap = capacityOf(p);
    ponds[pid] = { inflow_m3: vIn, allowed_release_m3_s: allowed[pid], release_m3_s: qRel, released_m3: vRel,
                   storage_required_m3: need, capacity_m3: cap, gap_m3: cap ? need - cap : null,
                   ratio: cap ? need / cap : null, drains_to: p.drains_to };
  }
  return { duration_h: dHours, intensity_mm_hr: i, intensity_tc_mm_hr: iTc, zones, external: ext, ponds, drains,
           what_if_ponds: nw } as any;
}

function scenarioWhatifs(inp: Inputs, sc: any): string[] {
  const w = sc.what_if_ponds ?? [];
  return w === true ? Object.keys(inp.what_if_ponds ?? {}) : w === false ? [] : [...w];
}

function criticalKey(r: any): number {
  if (Object.keys(r.ponds).length) return sum(Object.values<any>(r.ponds).map((p) => p.storage_required_m3));
  return Math.max(0.0, ...Object.values<any>(r.drains).map((d) => d.ratio || 0.0));
}

export function runScenario(inp: Inputs, name: string, designH: number | null = null) {
  const sc = inp.scenarios[name];
  const wi = scenarioWhatifs(inp, sc);
  const runs = (val(inp.storm.durations_h) as number[]).map((d) => runDuration(inp, sc.c, wi, d));
  let crit: any;
  if (designH === null) { crit = runs[0]; for (const r of runs) if (criticalKey(r) > criticalKey(crit)) crit = r; }
  else crit = runs.find((r) => r.duration_h === designH);
  crit.label = sc.label;
  crit.storage_by_duration = runs.map((r) => ({
    duration_h: r.duration_h,
    storage_required_m3: Object.fromEntries(Object.entries<any>(r.ponds).map(([p, v]) => [p, v.storage_required_m3])),
  }));
  return crit;
}

function addBands(inp: Inputs, scenarios: Record<string, any>) {
  const m = inp.method;
  const capMed = val(m.band_capacity_medium_from), capHigh = val(m.band_capacity_high_from);
  const chgMed = val(m.band_change_medium_from), chgHigh = val(m.band_change_high_from);
  const base = scenarios.now;
  for (const sc of Object.values<any>(scenarios)) {
    for (const [pid, p] of Object.entries<any>(sc.ponds)) {
      const b = base.ponds[pid].storage_required_m3;
      p.change_vs_now = b ? p.storage_required_m3 / b : null;
    }
    for (const [did, d] of Object.entries<any>(sc.drains)) {
      const b = base.drains[did].direct_demand_m3_s;
      d.change_vs_now = b ? d.direct_demand_m3_s / b : null;
    }
    for (const z of Object.values<any>(sc.zones)) {
      const to = z.drains_to;
      const node = sc.ponds[to] ?? sc.drains[to] ?? null;
      if (to in sc.ponds && node.ratio !== null) {
        z.band_basis = "capacity"; z.ratio = node.ratio; z.band = bandOf(node.ratio, capMed, capHigh);
      } else if (node !== null) {
        z.band_basis = "change_vs_now"; z.ratio = node.change_vs_now; z.band = bandOf(node.change_vs_now, chgMed, chgHigh);
      } else {
        z.band_basis = "unknown"; z.ratio = null; z.band = "unknown";
      }
      const load = node !== null ? node.ratio : null;
      z.load = load;
      z.load_of = to in sc.ponds ? "pond" : to in sc.drains ? "drain" : null;
      z.band_capacity = bandOf(load, capMed, capHigh);
    }
    for (const d of Object.values<any>(sc.drains)) d.band_capacity = bandOf(d.ratio, capMed, capHigh);
    for (const p of Object.values<any>(sc.ponds)) p.band_capacity = bandOf(p.ratio, capMed, capHigh);
  }
}

export function sideOf(inp: Inputs, id: string): string | null {
  for (const kind of ["zones", "external_inflows", "drains", "ponds"]) {
    const n = inp[kind]?.[id];
    if (n) return n.council ?? null;
  }
  return null;
}

function addBoundaries(inp: Inputs, scenarios: Record<string, any>) {
  const links: [string, string, string][] = [
    ...entries(inp.zones).map(([z, x]) => ["zone", z, x.drains_to] as [string, string, string]),
    ...entries(inp.external_inflows).map(([e, x]) => ["inflow", e, x.drains_to] as [string, string, string]),
    ...entries(inp.drains).map(([d, x]) => ["drain", d, x.drains_to] as [string, string, string]),
    ...entries(inp.ponds).map(([p, x]) => ["pond", p, x.drains_to] as [string, string, string]),
  ];
  for (const sc of Object.values<any>(scenarios)) {
    const cross: any[] = [];
    for (const [kind, a, b] of links) {
      const sa = sideOf(inp, a), sb = sideOf(inp, b);
      if (sa && sb && sa !== sb) {
        const q = kind === "zone" ? sc.zones[a].q_m3_s : kind === "inflow" ? sc.external[a].q_m3_s
          : kind === "drain" ? sc.drains[a].outflow_m3_s : sc.ponds[a].release_m3_s;
        cross.push({ kind, source: a, to: b, from_side: sa, to_side: sb, flow_m3_s: q });
      }
    }
    const sides: Record<string, any> = {};
    for (const [pid, p] of Object.entries<any>(sc.ponds)) {
      const key = sideOf(inp, pid) || "unknown";
      const s = (sides[key] ??= { storage_required_m3: 0.0, capacity_m3: 0.0, ponds: 0, unstated: 0 });
      s.storage_required_m3 += p.storage_required_m3;
      s.ponds += 1;
      if (p.capacity_m3) s.capacity_m3 += p.capacity_m3; else s.unstated += 1;
    }
    for (const s of Object.values<any>(sides)) s.gap_m3 = !s.unstated ? s.storage_required_m3 - s.capacity_m3 : null;
    sc.crossings = cross;
    sc.by_side = sides;
  }
}

export function run(inp: Inputs) {
  const bad = validate(inp);
  if (bad.length) throw new Error("network problems: " + bad.join("; "));
  const ph = placeholders(inp);
  const fixed = val(inp.storm.design_duration_h);
  const now = runScenario(inp, "now", (val(inp.storm.durations_h) as number[]).includes(fixed) ? fixed : null);
  const scenarios: Record<string, any> = {};
  for (const n of Object.keys(inp.scenarios)) scenarios[n] = n === "now" ? now : runScenario(inp, n, now.duration_h);
  addBands(inp, scenarios);
  addBoundaries(inp, scenarios);
  const nodes = new Set([...Object.keys(inp.drains ?? {}), ...Object.keys(inp.ponds ?? {}), OUTFALL]);
  const unknown: string[] = [];
  for (const kind of ["zones", "external_inflows"])
    for (const [k, z] of entries(inp[kind])) if (!nodes.has(z.drains_to)) unknown.push(`${k}: outlet ${z.drains_to}`);
  return {
    engine: "network/1", illustrative: ph.length > 0, placeholder_inputs: ph, outlets_unknown: unknown,
    note: "Screening only (MSMA 2 Rational Method + volume balance over a drain network): storage required, " +
          "change versus today, load, band. No depths, no times, no verdicts. Not a design.",
    scenarios,
  } as any;
}
