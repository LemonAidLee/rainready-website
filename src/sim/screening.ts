/**
 * RainReady screening simulator v2, TypeScript port of screening.py (21 Oct 2026).
 *
 * screening.py is the REFERENCE. This file must give the same numbers on the same inputs.json:
 * check with   node --experimental-strip-types check_parity.ts
 * Any change to the method is made in screening.py first, then ported here, then the parity check is re-run.
 * The method (MSMA 2 IDF, Rational Method, Rational Hydrograph volume, Qpost <= Qpre release, Manning trunk drain,
 * design storm = today's critical duration) is documented in screening.py.
 *
 * No dependencies and no file access, so it runs in the browser or in Node. Screening only: storage required,
 * change versus today, gap when a capacity is given, band. No depths, no times to recede, no compliance verdicts.
 */

export type Value = { value: any; unit?: string; status?: string; source?: string; confidence?: string };
type Num = Value | number;
export type Band = "low" | "medium" | "high" | "unknown";
export type Inputs = any;

export function val(x: any): any {
  return x !== null && typeof x === "object" && !Array.isArray(x) && "value" in x ? x.value : x;
}

/** Every input still marked placeholder, as dotted paths (same order as the Python). */
export function placeholders(node: unknown, path = ""): string[] {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return [];
  const o = node as Record<string, unknown>;
  if (o.status === "placeholder") return [path];
  let out: string[] = [];
  for (const [k, v] of Object.entries(o)) if (!k.startsWith("_")) out = out.concat(placeholders(v, path ? `${path}.${k}` : k));
  return out;
}

/** MSMA 2 Eq. 2.2 (valid for 2 <= T <= 100 years and 0.0833 <= d <= 72 hours). */
export function idfIntensity(idf: any, ariYears: number, dHours: number): number {
  return (val(idf.lambda) * ariYears ** val(idf.kappa)) / (dHours + val(idf.theta)) ** val(idf.eta);
}

/** MSMA 2 Eq. 2.3, peak flow in m3/s. */
export function rationalQ(c: number, iMmHr: number, aHa: number): number {
  return (c * iMmHr * aHa) / 360.0;
}

/** Full-bank capacity (m3/s) of a trapezoidal channel: Q = A R^(2/3) S^(1/2) / n. */
export function manningTrapezoid(section: any): number {
  const b = val(section.bottom_width_m), top = val(section.top_width_m), h = val(section.depth_m);
  const area = ((b + top) / 2.0) * h;
  const side = Math.hypot((top - b) / 2.0, h);
  const r = area / (b + 2.0 * side);
  return (area * r ** (2.0 / 3.0) * Math.sqrt(val(section.slope))) / val(section.manning_n);
}

/** Full-bank capacity less the share lost to silt and rubbish (planner input "blockage", 0 if absent, capped 0.9). */
export function trunkCapacity(trunk: any): [number, number] {
  const lost = Math.min(0.9, Math.max(0.0, val(trunk.blockage ?? 0.0) || 0.0));
  return [manningTrapezoid(trunk.section) * (1.0 - lost), lost];
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

/** Volume balance for one storm duration. */
export function runDuration(inp: Inputs, ckey: string, withPond: boolean, dHours: number) {
  const T = val(inp.storm.ari_years);
  const idf = inp.storm.idf;
  const i = idfIntensity(idf, T, dHours);
  const iTc = idfIntensity(idf, T, val(inp.storm.tc_hours));
  const durS = dHours * 3600.0;
  const k = val(inp.method.hydrograph_volume_factor);
  const cPre = val(inp.method.c_predevelopment);

  const zones: Record<string, any> = {};
  for (const [zid, z] of Object.entries<any>(inp.zones)) {
    const q = rationalQ(val(z[ckey]), i, val(z.area_ha));
    zones[zid] = { q_m3_s: q, v_m3: k * q * durS, drains_to: z.drains_to };
  }
  const ext: Record<string, any> = {};
  for (const [eid, e] of Object.entries<any>(inp.external_inflows ?? {})) {
    const q = rationalQ(val(e[ckey]), i, val(e.area_ha));
    ext[eid] = { q_m3_s: q, v_m3: k * q * durS, drains_to: e.drains_to };
  }

  const passed: Record<string, [number, number]> = {};
  for (const [zid, z] of Object.entries(zones)) passed[zid] = [z.q_m3_s, z.v_m3];
  let neu: any = null;
  if (withPond) {
    const wp = inp.what_if_pond;
    const cap = capacityOf(wp);
    const outQ = val(wp.outlet_m3_s);
    const vIn = sum(wp.serves.map((s: string) => zones[s].v_m3));
    const qIn = sum(wp.serves.map((s: string) => zones[s].q_m3_s));
    const vRel = Math.min(vIn, outQ * durS);
    const need = vIn - vRel;
    const over = cap ? Math.max(0.0, need - cap) : 0.0;
    neu = { inflow_m3: vIn, release_m3_s: outQ, released_m3: vRel, storage_required_m3: need, capacity_m3: cap,
            gap_m3: cap ? need - cap : null, ratio: cap ? need / cap : null };
    for (const s of wp.serves) {
      const w = vIn ? zones[s].v_m3 / vIn : 0.0;
      passed[s] = [(Math.min(qIn, outQ) + over / durS) * w, (vRel + over) * w];
    }
  }

  const [trunkCap, blockage] = trunkCapacity(inp.trunk_drain);
  const direct =
    sum(Object.entries(zones).filter(([, d]) => d.drains_to === "trunk_drain").map(([z]) => passed[z][0])) +
    sum(Object.values(ext).filter((e: any) => e.drains_to === "trunk_drain").map((e: any) => e.q_m3_s));
  const spare = Math.max(0.0, trunkCap - direct);
  const allowed: Record<string, number> = {};
  for (const pid of Object.keys(inp.ponds)) {
    allowed[pid] = rationalQ(cPre, iTc, sum(Object.values<any>(inp.zones).filter((z) => z.drains_to === pid).map((z) => val(z.area_ha))));
  }
  const totalAllowed = sum(Object.values(allowed));
  const share = totalAllowed <= spare ? 1.0 : totalAllowed ? spare / totalAllowed : 0.0;

  const ponds: Record<string, any> = {};
  for (const [pid, p] of Object.entries<any>(inp.ponds)) {
    const vIn = sum(Object.entries(zones).filter(([, d]) => d.drains_to === pid).map(([z]) => passed[z][1]));
    const qRel = allowed[pid] * share;
    const vRel = Math.min(vIn, qRel * durS);
    const need = vIn - vRel;
    const cap = capacityOf(p);
    ponds[pid] = { inflow_m3: vIn, allowed_release_m3_s: allowed[pid], release_m3_s: qRel, released_m3: vRel,
                   storage_required_m3: need, capacity_m3: cap, gap_m3: cap ? need - cap : null, ratio: cap ? need / cap : null };
  }
  const trunk: any = { capacity_m3_s: trunkCap, blockage, direct_demand_m3_s: direct, spare_for_ponds_m3_s: spare,
                       pond_release_share: share, ratio: direct / trunkCap };
  return { duration_h: dHours, intensity_mm_hr: i, intensity_tc_mm_hr: iTc, zones, external: ext, ponds,
           trunk_drain: trunk, what_if_pond: neu } as any;
}

/** All durations for one scenario; the result is taken at designH, or at the critical duration if null. */
export function runScenario(inp: Inputs, name: string, designH: number | null = null) {
  const sc = inp.scenarios[name];
  const runs = (val(inp.storm.durations_h) as number[]).map((d) => runDuration(inp, sc.c, sc.what_if_pond, d));
  const total = (r: any) => sum(Object.values<any>(r.ponds).map((p) => p.storage_required_m3));
  let crit: any;
  if (designH === null) {
    crit = runs[0];
    for (const r of runs) if (total(r) > total(crit)) crit = r;   // first maximum, as Python's max()
  } else {
    crit = runs.find((r) => r.duration_h === designH);
  }
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
    const t = sc.trunk_drain;
    t.change_vs_now = t.direct_demand_m3_s / base.trunk_drain.direct_demand_m3_s;
    for (const z of Object.values<any>(sc.zones)) {
      const to = z.drains_to;
      if (to in sc.ponds && sc.ponds[to].ratio !== null) {
        z.band_basis = "capacity"; z.ratio = sc.ponds[to].ratio; z.band = bandOf(z.ratio, capMed, capHigh);
      } else if (to in sc.ponds) {
        z.band_basis = "change_vs_now"; z.ratio = sc.ponds[to].change_vs_now; z.band = bandOf(z.ratio, chgMed, chgHigh);
      } else if (to === "trunk_drain") {
        z.band_basis = "change_vs_now"; z.ratio = sc.trunk_drain.change_vs_now; z.band = bandOf(z.ratio, chgMed, chgHigh);
      } else {
        z.band_basis = "unknown"; z.ratio = null; z.band = "unknown";
      }
    }
  }
  for (const pid of Object.keys(inp.ponds)) {
    const top = Math.max(...Object.values<any>(scenarios).map((sc) => sc.ponds[pid].storage_required_m3));
    for (const sc of Object.values<any>(scenarios)) {
      const p = sc.ponds[pid];
      if (p.capacity_m3) { p.gauge = Math.min(1.0, p.storage_required_m3 / p.capacity_m3); p.gauge_basis = "capacity"; }
      else { p.gauge = top ? p.storage_required_m3 / top : 0.0; p.gauge_basis = "largest_scenario"; }
    }
  }
}

/** Warn if inputs areas no longer match the drawn zones (pass zones.json's areas; the browser has no file access). */
export function checkAreas(inp: Inputs, drawn?: Record<string, number>): string[] {
  if (!drawn) return [];
  return Object.entries<any>(inp.zones)
    .filter(([k, z]) => drawn[k] !== undefined && Math.abs(drawn[k] - val(z.area_ha)) > 0.05)
    .map(([k, z]) => `${k}: inputs ${val(z.area_ha)} ha vs zones.json ${drawn[k]} ha`);
}

export function run(inp: Inputs, drawnAreas?: Record<string, number>) {
  const ph = placeholders(inp);
  const fixed = val(inp.storm.design_duration_h);
  const now = runScenario(inp, "now", (val(inp.storm.durations_h) as number[]).includes(fixed) ? fixed : null);
  const scenarios: Record<string, any> = {};
  for (const n of Object.keys(inp.scenarios)) scenarios[n] = n === "now" ? now : runScenario(inp, n, now.duration_h);
  addBands(inp, scenarios);
  const res: any = {
    illustrative: ph.length > 0,
    label: ph.length ? "ILLUSTRATIVE VALUES - placeholder inputs" : "",
    placeholder_inputs: ph,
    area_warnings: checkAreas(inp, drawnAreas),
    note: "Screening only (MSMA 2 Rational Method + volume balance): storage required, change versus today, band. " +
          "No depths, no times, no verdicts. Not a design.",
    scenarios,
    storage_change: {},
  };
  if (["now", "upstream", "upstream_plus_pond"].every((s) => s in scenarios)) {
    for (const pid of Object.keys(inp.ponds)) {
      res.storage_change[pid] = { now_m3: scenarios.now.ponds[pid].storage_required_m3,
                                  upstream_m3: scenarios.upstream.ponds[pid].storage_required_m3,
                                  upstream_plus_pond_m3: scenarios.upstream_plus_pond.ponds[pid].storage_required_m3 };
    }
  }
  return res;
}
