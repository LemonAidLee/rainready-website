// Where a report goes: its zone and council side from the planner model's zone outlines and the OSM council line,
// then the holder by the responsibility record's rules (research/RESPONSIBILITY_RECORD.md). Who looks after it,
// never who is to blame. RainReady forwards to the holder's existing channel; it never dispatches anyone.
import { useEffect, useState } from "react";
import { toModel } from "../lib/evidence";
import type { WReport } from "./data";
import { coordsOf } from "./data";

type XY = [number, number];
interface Zone { id: string; name: string; drains_to: string; council: string; outline: XY[][] }
export interface Catchment { zones: Zone[]; council: XY[][] }

let cache: Promise<Catchment> | null = null;
function loadCatchment(): Promise<Catchment> {
  cache ??= Promise.all([fetch("./data/zones_meta.json").then((r) => r.json()), fetch("./data/overlays.json").then((r) => r.json())])
    .then(([z, o]) => ({ zones: z.zones.filter((x: any) => Array.isArray(x.outline)), council: o.council_line.paths }));
  return cache;
}
export function useCatchment(): Catchment | null {
  const [c, setC] = useState<Catchment | null>(null);
  useEffect(() => { loadCatchment().then(setC).catch(() => setC(null)); }, []);
  return c;
}

/** The planner model's rectangle, model metres (TOWNSHIP_3D_AND_SIMULATOR.md decision 18). */
export const MODEL_RECT = { x0: -1222, x1: 1700, y0: -830, y1: 608 };
export const inModel = ([x, y]: XY) => x >= MODEL_RECT.x0 && x <= MODEL_RECT.x1 && y >= MODEL_RECT.y0 && y <= MODEL_RECT.y1;

function inRing(p: XY, ring: XY[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPolygon = (p: XY, rings: XY[][]) => rings.length > 0 && inRing(p, rings[0]) && !rings.slice(1).some((r) => inRing(p, r));

/** Which side of the council line a point is on: the side of the nearest line segment, calibrated on a Shah Alam zone. */
function sideOf(p: XY, c: Catchment): "Klang" | "Shah Alam" | null {
  const segs: [XY, XY][] = c.council.flatMap((path) => path.slice(1).map((b, i) => [path[i], b] as [XY, XY]));
  if (!segs.length) return null;
  const cross = (q: XY) => {
    let best = Infinity, sign = 0;
    for (const [a, b] of segs) {
      const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L));
      const d = Math.hypot(q[0] - (a[0] + t * dx), q[1] - (a[1] + t * dy));
      if (d < best) { best = d; sign = Math.sign(dx * (q[1] - a[1]) - dy * (q[0] - a[0])); }
    }
    return sign;
  };
  const ref = c.zones.find((z) => z.council === "Shah Alam");
  if (!ref) return null;
  const [x0, y0] = ref.outline[0][0];
  const refSign = cross(ref.outline[0].reduce(([sx, sy], [x, y]) => [sx + x / ref.outline[0].length, sy + y / ref.outline[0].length], [0, 0] as XY)) || cross([x0, y0]);
  return cross(p) === refSign ? "Shah Alam" : "Klang";
}

const DRAINS = new Set(["Blocked drain", "Damaged culvert", "Flooding / standing water", "Illegal dumping"]);
const STREET = new Set(["Road damage / pothole", "Damaged sidewalk / walkway", "Streetlight outage", "Fallen tree / blocked path"]);

export interface Route {
  xy: XY | null; inModel: boolean; zone: Zone | null; side: "Klang" | "Shah Alam" | null;
  holder: string; holderShort: string; channel: string; rule: string; conf: "H" | "M" | "L" | "-"; floodScope: boolean;
}

/** Route one report. Without coordinates or the catchment data, the association checks first. */
export function routeFor(r: Pick<WReport, "issue" | "locationCoordinates" | "location">, c: Catchment | null): Route {
  const ll = coordsOf(r as WReport);
  const xy = ll ? (toModel(ll[0], ll[1]) as XY) : null;
  const zone = xy && c ? c.zones.find((z) => inPolygon(xy, z.outline)) ?? null : null;
  const side = zone ? (zone.council === "Shah Alam" ? "Shah Alam" : "Klang") : xy && c ? sideOf(xy, c) : null;
  const council = side === "Shah Alam" ? { long: "MBSA (Shah Alam City Council)", short: "MBSA" } : side === "Klang" ? { long: "MBDK (Klang Royal City Council)", short: "MBDK" } : null;
  const base = { xy, inModel: !!xy && inModel(xy), zone, side, floodScope: DRAINS.has(r.issue) };
  if (DRAINS.has(r.issue) && council)
    return { ...base, holder: council.long, holderShort: council.short, conf: "M", channel: "the council's complaint channel (Sispaa or iClean Selangor)",
      rule: "Street and secondary drains are the council's on its side of the line; main drains and rivers go to JPS (state cabinet decision MMKN 17/2025)" };
  if (STREET.has(r.issue) && council)
    return { ...base, holder: council.long, holderShort: council.short, conf: "L", channel: "the council's complaint channel (Sispaa)",
      rule: "Local roads, paths, lamps and trees are usually the council's; JKR holds roads in its own reserves" };
  if (r.issue === "Water leak / pipe damage")
    return { ...base, holder: "Air Selangor (water supply)", holderShort: "Air Selangor", conf: "M", channel: "Air Selangor's fault line or app",
      rule: "Treated-water pipes belong to the state water operator" };
  return { ...base, holder: "Not known yet", holderShort: "", conf: "-", channel: "the residents' association checks it first",
    rule: "No published rule matched: shown as a gap, never guessed" };
}
