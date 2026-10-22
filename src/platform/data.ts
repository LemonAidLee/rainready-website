// The platform's data (22 Oct 2026): the site registry (public/sites/index.json), one site pack per site
// (public/sites/<id>/: site.json, inputs.json, outputs.json, geo.json), the live network engine (sim/network.ts, held
// equal to simulations/platform/network.py) and planner uploads. Written by simulations/platform/build_*.py.
import { run, val } from "../sim/network.ts";

export type Band = "low" | "medium" | "high" | "unknown";
export const BAND_COLOR: Record<string, string> = { low: "#1fbf75", medium: "#f2a516", high: "#ff4a3d", unknown: "#6b7785", river: "#4a6c8a" };
export const ROOM: Record<Band, string> = { low: "Room to spare", medium: "Nearly full", high: "Not enough room", unknown: "Outlet not known" };

export interface Metrics {
  storage_gap_m3: number; ponds: number; ponds_over: number; drains: number; drains_over: number;
  crossings: number; crossing_flow_m3_s: number; area_ha: number; area_high_ha: number; duration_h: number;
}
export interface SiteEntry {
  id: string; name: string; kind: "curated" | "generated"; view: "3d" | "2d"; route?: string; state: string;
  centre: [number, number]; councils: string[]; confidence: string; label: string; summary: string;
  tests: { test: string; passed: boolean; detail: string }[]; flood_records: number; rank: number;
  metrics: { now: Metrics; upstream?: Metrics };
}
export interface Site extends Omit<SiteEntry, "metrics" | "rank" | "flood_records"> {
  bbox: [number, number, number, number];
  evidence: { flood_records: { year: number; type: string; place: string; district: string }[]; flash_2017?: { town: string; places: string[] }[] };
  storm: { station: string; distance_km: number };
  sources: string[]; limits: string[]; assumed_capacity_m3?: Record<string, number>;
  build: { script: string; date?: string; fetch_s?: number; build_s?: number };
}
export interface Pack { site: Site; inputs: any; outputs: any; geo: any }

const get = (f: string) => fetch(f).then((r) => { if (!r.ok) throw new Error(`${f}: ${r.status}`); return r.json(); });

export async function loadIndex(): Promise<SiteEntry[]> {
  return (await get("./sites/index.json")).sites;
}

export async function loadPack(id: string): Promise<Pack> {
  const [site, inputs, outputs, geo] = await Promise.all(
    ["site.json", "inputs.json", "outputs.json", "geo.json"].map((f) => get(`./sites/${id}/${f}`)));
  return { site, inputs, outputs, geo };
}

/** The same comparable numbers as build_index.py (portfolio), for a live result (e.g. after an upload). */
export function metricsOf(site: Site, inputs: any, sc: any): Metrics {
  const assumed = site.assumed_capacity_m3 ?? {};
  let gap = 0, pondsOver = 0;
  for (const [pid, p] of Object.entries<any>(sc.ponds)) {
    const cap = p.capacity_m3 || assumed[pid];
    if (cap) { gap += Math.max(0, p.storage_required_m3 - cap); if (p.storage_required_m3 >= cap) pondsOver++; }
  }
  const drains = Object.values<any>(sc.drains);
  const area: Record<string, number> = Object.fromEntries(Object.entries<any>(inputs.zones).map(([z, x]) => [z, val(x.area_ha)]));
  const high = Object.entries<any>(sc.zones).filter(([, z]) => (z.load ?? 0) >= 1).reduce((a, [z]) => a + area[z], 0);
  return {
    storage_gap_m3: Math.round(gap), ponds: Object.keys(sc.ponds).length, ponds_over: pondsOver, drains: drains.length,
    drains_over: drains.filter((d) => (d.ratio ?? 0) >= 1).length, crossings: sc.crossings.length,
    crossing_flow_m3_s: sc.crossings.reduce((a: number, c: any) => a + c.flow_m3_s, 0),
    area_ha: Object.values(area).reduce((a, b) => a + b, 0), area_high_ha: high, duration_h: sc.duration_h,
  };
}

// ---------------------------------------------------------------------------------------------------- uploads
export interface Row { [k: string]: string }
export interface Applied { kind: "pond" | "drain"; id: string; field: string; from: any; to: number; source: string }
export interface UploadResult { inputs: any; applied: Applied[]; skipped: string[]; file: string }

/** A small CSV reader (quoted fields, commas inside quotes, CRLF). */
export function parseCSV(text: string): Row[] {
  const rows: string[][] = [];
  let cur: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') q = false; else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { cur.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cur.push(field); field = ""; if (cur.some((c) => c.trim())) rows.push(cur); cur = [];
    } else field += ch;
  }
  cur.push(field); if (cur.some((c) => c.trim())) rows.push(cur);
  const head = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

/** GeoJSON features to rows: properties, plus lat / lon of a point (so a register without our ids still matches). */
export function geojsonRows(gj: any): Row[] {
  return (gj.features ?? []).map((f: any) => {
    const r: Row = Object.fromEntries(Object.entries(f.properties ?? {}).map(([k, v]) => [k.toLowerCase(), v == null ? "" : String(v)]));
    if (f.geometry?.type === "Point") { r.lon = String(f.geometry.coordinates[0]); r.lat = String(f.geometry.coordinates[1]); }
    return r;
  });
}

/** Centre of each pond outline in geo.json, for matching a register row by position. */
function pondCentres(geo: any): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const f of geo.features) {
    if (f.properties.kind !== "pond") continue;
    const ring = f.geometry.type === "Polygon" ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
    const n = ring.length;
    out[f.properties.id] = [ring.reduce((a: number, c: number[]) => a + c[1], 0) / n, ring.reduce((a: number, c: number[]) => a + c[0], 0) / n];
  }
  return out;
}

const metres = (a: [number, number], b: [number, number]) =>
  Math.hypot((a[1] - b[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180), (a[0] - b[0]) * 110570);

/**
 * Apply a planner's register to a copy of the inputs. A row matches a pond or drain by its id (our id, or a JPS code
 * such as P13), else a pond by position within 150 m. Values become "planner input" with the row's source. Rows that
 * match nothing, or carry no usable number, are reported, never guessed.
 */
export function applyRegister(base: any, geo: any, rows: Row[], file: string): UploadResult {
  const inputs = JSON.parse(JSON.stringify(base));
  const applied: Applied[] = [], skipped: string[] = [];
  const centres = pondCentres(geo);
  const num = (s: string | undefined) => { if (s === undefined || s === "") return null; const v = Number(s.replace(/[, ]/g, "")); return Number.isFinite(v) && v > 0 ? v : null; };
  rows.forEach((r, i) => {
    const line = `row ${i + 2}`;
    const id = (r.id || r.code || r.kod || r.pond_id || r.drain_id || "").trim();
    const src = r.source || `uploaded register (${file})`;
    let kind = (r.kind || "").toLowerCase();
    let key: string | null = null;
    if (id && id in inputs.ponds) { kind = "pond"; key = id; }
    else if (id && id in inputs.drains) { kind = "drain"; key = id; }
    else if (r.lat && r.lon) {
      const at: [number, number] = [Number(r.lat), Number(r.lon)];
      const near = Object.entries(centres).map(([p, c]) => [p, metres(at, c)] as [string, number]).sort((a, b) => a[1] - b[1])[0];
      if (near && near[1] <= 150) { kind = "pond"; key = near[0]; }
    }
    if (!key) { skipped.push(`${line}: no pond or drain with id "${id || "—"}"${r.lat ? " or within 150 m" : ""}`); return; }
    const set = (node: any, field: string, v: number) => {
      applied.push({ kind: kind as "pond" | "drain", id: key!, field, from: node.value, to: v, source: src });
      Object.assign(node, { value: v, status: "planner input", source: src, confidence: "-" });
    };
    if (kind === "pond") {
      const p = inputs.ponds[key];
      const cap = num(r.capacity_m3), depth = num(r.live_depth_m);
      if (cap) set(p.capacity_m3, "capacity_m3", cap);
      else if (depth && p.water_area_m2) set(p.capacity_m3, "capacity_m3", Math.round(p.water_area_m2 * depth));
      else skipped.push(`${line} (${key}): no capacity_m3 or live_depth_m`);
    } else {
      const sec = inputs.drains[key].section;
      let any = false;
      for (const f of ["top_width_m", "bottom_width_m", "depth_m"]) { const v = num(r[f]); if (v) { set(sec[f], f, v); any = true; } }
      if (!any) skipped.push(`${line} (${key}): no top_width_m, bottom_width_m or depth_m`);
    }
  });
  return { inputs, applied, skipped, file };
}

/** Run the network engine; returns null with the reason when the inputs cannot run. */
export function runSafe(inputs: any): { res: any; error: null } | { res: null; error: string } {
  try { return { res: run(inputs), error: null }; } catch (e) { return { res: null, error: String((e as Error).message) }; }
}

export const fmt = (n: number, d = 0) => n.toLocaleString("en-GB", { maximumFractionDigits: d, minimumFractionDigits: d });
export const pct = (r: number | null | undefined) => (r === null || r === undefined ? "—" : r >= 3 ? "over 300 %" : `${Math.round(r * 100)} %`);
