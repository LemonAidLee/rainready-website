// The 2D site map (22 Oct 2026): everything the 3D planner animates, drawn flat on Leaflet.
//   storm       zones take their risk band (clear day: neutral); drains run with flow, downhill, faster and redder as
//               they fill; every zone sends a flow line to its outlet (gold where it crosses a council line); ponds
//               ripple and carry a fill gauge; rain falls over the map (Rain2D, in SiteApp)
//   built out   blocks that change hatch in gold as the open land is built (the 3D blocks rising)
//   what-if     the pond grows in on its parcel
//   opening     zones reveal outwards; a lever change rings the parts of the map it moves (flash)
// Drains are stored high end first (build_site.py), so the dash animation runs downstream.
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { BAND_COLOR, ROOM, pct, type Band, type Pack } from "./data";
import { nameOf } from "./SitePanels";

export interface Layers2 { zones: boolean; labels: boolean; flow: boolean; boundary: boolean; records: boolean; reports: boolean; basemap: boolean }
export const LAYERS2: Layers2 = { zones: true, labels: true, flow: true, boundary: true, records: true, reports: true, basemap: true };
export type Pick2 = { kind: "zone" | "pond" | "drain" | "whatif"; id: string } | null;
export type Flash = { at: [number, number]; label: string };
export type Pin = { id: string; lat: number; lon: number; label: string; sample: boolean };

type LL = [number, number];
const ringOf = (g: any): number[][] => (g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon"
  ? g.coordinates.reduce((a: any, p: any) => (p[0].length > a.length ? p[0] : a), []) : []);
/** A point inside a polygon's largest ring, good enough for a label: the ring's centroid, nudged in if it falls out. */
export function centreOf(g: any): LL {
  const r = ringOf(g);
  let a = 0, x = 0, y = 0;
  for (let i = 0; i < r.length - 1; i++) {
    const f = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
    a += f; x += (r[i][0] + r[i + 1][0]) * f; y += (r[i][1] + r[i + 1][1]) * f;
  }
  return a ? [y / (3 * a), x / (3 * a)] : [r[0][1], r[0][0]];
}
const linesOf = (g: any): number[][][] => (g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : []);
function nearestOn(g: any, p: LL): LL {
  let best: LL = p, d = Infinity;
  for (const ln of linesOf(g)) for (const c of ln) {
    const e = (c[1] - p[0]) ** 2 + ((c[0] - p[1]) * Math.cos((p[0] * Math.PI) / 180)) ** 2;
    if (e < d) { d = e; best = [c[1], c[0]]; }
  }
  return best;
}
export function boundsOf(features: any[]): L.LatLngBounds | null {
  const b = L.latLngBounds([]);
  for (const f of features) {
    const g = f.geometry;
    const pts = g.type === "Point" ? [g.coordinates] : g.type === "LineString" ? g.coordinates : g.type === "MultiLineString" ? g.coordinates.flat()
      : g.type === "Polygon" ? g.coordinates[0] : g.coordinates.flatMap((p: any) => p[0]);
    for (const c of pts) b.extend([c[1], c[0]]);
  }
  return b.isValid() ? b : null;
}

/** Change of a zone's outlet from today, as ▲ / ▼ (5 % or more), the 3D zone tags' marker. */
function changeTag(z: any, sc: any): string {
  const n = sc.ponds[z.drains_to] ?? sc.drains[z.drains_to];
  const r = n?.change_vs_now;
  if (r === null || r === undefined || Math.abs(r - 1) < 0.05) return "";
  return ` ${r > 1 ? "▲" : "▼"}${Math.round(Math.abs(r - 1) * 100)}%`;
}

export function MapView(p: {
  pack: Pack; inputs: any; sc: any; storm: number; layers: Layers2; pick: Pick2; setPick: (x: Pick2) => void;
  dev: number; pondOn: boolean; flash: Flash[]; focus: { b: L.LatLngBoundsExpression; n: number } | null; pins: Pin[];
  onZone: (id: string | null) => void; onMove: (ll: LL | null) => void; inset: [number, number];
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const g = useRef<Record<string, L.Layer & any>>({});
  const cb = useRef(p);
  cb.current = p;

  // ---- build once per site
  useEffect(() => {
    if (!el.current || map.current) return;
    const [s, w, n, e] = p.pack.site.bbox;
    const mp = L.map(el.current, { zoomControl: false, attributionControl: false, zoomSnap: 0.25,
                                   maxBounds: [[s - 0.04, w - 0.04], [n + 0.04, e + 0.04]] });
    L.control.zoom({ position: "bottomright" }).addTo(mp);
    g.current.tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, className: "pf-tiles" }).addTo(mp);
    const narrow = innerWidth < 760;
    mp.fitBounds([[s, w], [n, e]], narrow ? { padding: [10, 10] } : { paddingTopLeft: [p.inset[0] + 20, 20], paddingBottomRight: [p.inset[1] + 20, 70] });
    const feats = (k: string) => ({ type: "FeatureCollection", features: p.pack.geo.features.filter((f: any) => f.properties.kind === k) }) as any;
    const pick = (kind: NonNullable<Pick2>["kind"]) => (f: any, l: L.Layer) => l.on("click", (ev: any) => {
      L.DomEvent.stopPropagation(ev); cb.current.setPick({ kind, id: f.properties.id });
    });
    let zi = 0;
    g.current.zones = L.geoJSON(feats("zone"), {
      style: () => ({ className: "pf-zone" }),
      onEachFeature: (f, l: any) => {
        pick("zone")(f, l);
        l.on("mouseover", () => cb.current.onZone(f.properties.id));
        l.on("mouseout", () => cb.current.onZone(null));
        l.on("add", () => l.getElement()?.style.setProperty("--i", String(zi++)));
      },
    }).addTo(mp);
    // hatch for land that is built in the upstream scenario (the 3D blocks rising)
    const up = { ...feats("zone"), features: feats("zone").features.filter((f: any) => {
      const z = p.inputs.zones[f.properties.id]; return z && z.c_upstream.value > z.c_now.value + 0.005; }) };
    g.current.built = L.geoJSON(up, { style: () => ({ stroke: false, fillColor: "url(#pf-hatch)", fillOpacity: 0, className: "pf-built" }), interactive: false }).addTo(mp);
    const svg = mp.getPanes().overlayPane.querySelector("svg");
    if (svg && !svg.querySelector("#pf-hatch")) {
      const ns = "http://www.w3.org/2000/svg";
      const defs = document.createElementNS(ns, "defs");
      defs.innerHTML = '<pattern id="pf-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
        '<rect width="9" height="9" fill="rgba(227,179,65,0.10)"/><line x1="0" y1="0" x2="0" y2="9" stroke="#e3b341" stroke-width="3"/></pattern>';
      svg.prepend(defs);
    }
    // flow lines: every zone to its outlet (pond, drain, or the river where water leaves)
    const byId = (k: string) => Object.fromEntries(p.pack.geo.features.filter((f: any) => f.properties.kind === k).map((f: any) => [f.properties.id, f.geometry]));
    const pondG = byId("pond"), drainG = byId("drain");
    const river = { type: "MultiLineString", coordinates: p.pack.geo.features.filter((f: any) => f.properties.kind === "river").flatMap((f: any) => linesOf(f.geometry)) };
    const flows: L.Polyline[] = [];
    for (const f of feats("zone").features) {
      const id = f.properties.id, z = p.inputs.zones[id];
      if (!z) continue;
      const a = centreOf(f.geometry);
      const to = z.drains_to;
      const b: LL | null = pondG[to] ? centreOf(pondG[to]) : drainG[to] ? nearestOn(drainG[to], a) : to === "outfall" && river.coordinates.length ? nearestOn(river, a) : null;
      if (!b) continue;
      const side = p.inputs.ponds[to]?.council ?? p.inputs.drains[to]?.council;
      const cross = !!(side && z.council && side !== z.council);
      const ln = L.polyline([a, b], { className: `pf-flowline ${cross ? "cross" : ""}`, interactive: false, weight: cross ? 2.5 : 1.6 });
      (ln as any)._zone = id;
      flows.push(ln);
    }
    g.current.flows = L.layerGroup(flows);
    L.geoJSON(feats("river"), { style: { color: "#3aa0ff", weight: 5, opacity: 0.85 }, interactive: false }).addTo(mp);
    g.current.drains = L.geoJSON(feats("drain"), { style: () => ({ weight: 4, className: "pf-drain" }), onEachFeature: pick("drain") }).addTo(mp);
    g.current.drainFlow = L.geoJSON(feats("drain"), { style: () => ({ weight: 2.5, color: "#e8f6ff", opacity: 0.9, className: "pf-drainflow", dashArray: "5 11" }), interactive: false });
    g.current.ponds = L.geoJSON(feats("pond"), { style: () => ({ className: "pf-pond" }), onEachFeature: pick("pond") }).addTo(mp);
    g.current.whatif = L.geoJSON(feats("whatif"), { style: () => ({ color: "#e3b341", weight: 2, dashArray: "4 4", fillColor: "#e3b341", fillOpacity: 0.4, className: "pf-grow" }),
                                                   onEachFeature: pick("whatif") });
    g.current.boundary = L.layerGroup([
      L.geoJSON(feats("council_line"), { style: { color: "#e3b341", weight: 3, dashArray: "8 6" }, interactive: false }),
      L.geoJSON(feats("crossing_point"), { pointToLayer: (_f, ll) => L.marker(ll, { icon: L.divIcon({ className: "pf-cross", html: "<span>⇄</span>", iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false }) }),
    ]).addTo(mp);
    g.current.records = L.geoJSON(feats("flood"), {
      pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 5, color: "#ff5a36", weight: 2, fillColor: "#ff5a36", fillOpacity: 0.55 })
        .bindTooltip(`JPS flood record · ${f.properties.year} · ${f.properties.type}<br>${f.properties.place}`),
    }).addTo(mp);
    g.current.labels = L.layerGroup().addTo(mp);
    g.current.gauges = L.layerGroup().addTo(mp);
    g.current.pins = L.layerGroup().addTo(mp);
    g.current.flash = L.layerGroup().addTo(mp);
    mp.on("click", () => cb.current.setPick(null));
    mp.on("mousemove", (e: L.LeafletMouseEvent) => cb.current.onMove([e.latlng.lat, e.latlng.lng]));
    mp.on("mouseout", () => cb.current.onMove(null));
    map.current = mp;
    return () => { mp.remove(); map.current = null; g.current = {}; };
  }, [p.pack]);

  // ---- every result, storm and layer change restyles the map
  useEffect(() => {
    const mp = map.current, G = g.current;
    if (!mp || !G.zones) return;
    const on = (layer: any, show: boolean) => { if (show && !mp.hasLayer(layer)) layer.addTo(mp); if (!show && mp.hasLayer(layer)) layer.remove(); };
    const storm = p.storm > 0.5, sc = p.sc;
    on(G.tiles, p.layers.basemap);
    on(G.zones, p.layers.zones);
    on(G.built, p.layers.zones);
    on(G.boundary, p.layers.boundary);
    on(G.records, p.layers.records);
    on(G.flows, storm && p.layers.flow);
    on(G.drainFlow, storm && p.layers.flow);
    on(G.whatif, p.pondOn);
    const bandOf = (z: any): Band | "river" => (z.drains_to === "outfall" ? "river" : (z.band_capacity ?? "unknown"));
    G.zones.setStyle((f: any) => {
      const z = sc.zones[f.properties.id], sel = p.pick?.kind === "zone" && p.pick.id === f.properties.id;
      const b = z ? bandOf(z) : "unknown";
      return { color: sel ? "#e3b341" : storm ? "#0b141d" : "rgba(214,225,235,0.35)", weight: sel ? 3 : 1,
               fillColor: storm ? BAND_COLOR[b] : "#9aabbb", fillOpacity: storm ? (b === "river" ? 0.18 : 0.42) : 0.08 };
    });
    G.zones.eachLayer((l: any) => {
      const id = l.feature.properties.id, z = sc.zones[id], b = bandOf(z);
      l.unbindTooltip().bindTooltip(`${id} · ${z.drains_to === "outfall" ? "drains to a river (not modelled)" : z.drains_to === "TBD" ? "outlet not known"
        : `${ROOM[b as Band]}: ${pct(z.load)} of its outlet`}`, { sticky: true });
    });
    G.built.setStyle(() => ({ fillOpacity: Math.min(0.85, p.dev * 0.85) }));
    G.drains.setStyle((f: any) => {
      const d = sc.drains[f.properties.id], sel = p.pick?.kind === "drain" && p.pick.id === f.properties.id;
      return { color: storm && d ? BAND_COLOR[d.band_capacity] : "#35d0e6", weight: sel ? 7 : d ? 3 + Math.min(4, (d.ratio ?? 0) * 1.5) : 3, opacity: 0.95 };
    });
    G.drainFlow.eachLayer((l: any) => {
      const d = sc.drains[l.feature.properties.id];
      l.getElement()?.style.setProperty("--dur", `${Math.max(0.35, Math.min(3, 1.4 / Math.max(0.25, d?.ratio ?? 0.25)))}s`);
    });
    G.flows.eachLayer((l: any) => {
      const z = sc.zones[l._zone];
      l.getElement()?.style.setProperty("--dur", `${Math.max(0.5, Math.min(3.5, 1.2 / Math.max(0.2, z?.q_m3_s ?? 0.2)))}s`);
    });
    G.ponds.setStyle((f: any) => {
      const q = sc.ponds[f.properties.id], sel = p.pick?.kind === "pond" && p.pick.id === f.properties.id;
      return { color: sel ? "#e3b341" : storm && q ? BAND_COLOR[q.band_capacity] : "#3aa0ff", weight: sel ? 4 : 2.5, fillColor: "#3aa0ff", fillOpacity: 0.75 };
    });
    G.ponds.eachLayer((l: any) => l.getElement()?.classList.toggle("storm", storm));
    // labels: zone tags (with the change from today), pond gauges in the storm
    G.labels.clearLayers(); G.gauges.clearLayers();
    if (p.layers.labels) {
      G.zones.eachLayer((l: any) => {
        const id = l.feature.properties.id, z = sc.zones[id], tag = storm && z ? changeTag(z, sc) : "";
        L.marker(centreOf(l.feature.geometry), { interactive: false, icon: L.divIcon({ className: "pf-ztag", iconSize: [0, 0],
          html: `<span class="${tag.includes("▲") ? "up" : tag ? "down" : ""}">${id}${tag}</span>` }) }).addTo(G.labels);
      });
      if (storm) {
        const ranked = Object.entries<any>(sc.ponds).filter(([, q]) => q.storage_required_m3 > 1000 && q.ratio !== null).sort((a, b) => b[1].ratio - a[1].ratio).slice(0, 8);
        G.ponds.eachLayer((l: any) => {
          const id = l.feature.properties.id, hit = ranked.find(([k]) => k === id);
          if (!hit) return;
          const q = hit[1], r = Math.min(1, q.ratio), name = id.startsWith("OSM_") ? nameOf(p.inputs, id).replace("Unnamed pond in", "Pond ·").slice(0, 18) : id;
          L.marker(centreOf(l.feature.geometry), { interactive: false, icon: L.divIcon({ className: "pf-gauge", iconSize: [0, 0],
            html: `<div><b>${name}</b><i><em style="transform:scaleX(${r})" class="${q.ratio >= 1 ? "high" : q.ratio >= 0.8 ? "medium" : "low"}"></em></i><span>${pct(q.ratio)}</span></div>` }) }).addTo(G.gauges);
        });
      }
    }
    G.pins.clearLayers();
    if (p.layers.reports) for (const r of p.pins) L.circleMarker([r.lat, r.lon], { radius: 6, color: "#e3b341", weight: 2, fillColor: "#e3b341", fillOpacity: 0.6 })
      .bindTooltip(`${r.sample ? "SAMPLE REPORT · " : "RESIDENT REPORT · "}${r.label}`).addTo(G.pins);
  }, [p.sc, p.storm, p.layers, p.pick, p.dev, p.pondOn, p.pins]);

  // ---- a lever change rings the parts of the map it moves (2.6 s, as in 3D)
  useEffect(() => {
    const G = g.current;
    if (!G.flash) return;
    G.flash.clearLayers();
    for (const f of p.flash) L.marker(f.at, { interactive: false, icon: L.divIcon({ className: "pf-ping", iconSize: [0, 0], html: `<i></i><span>${f.label}</span>` }) }).addTo(G.flash);
  }, [p.flash]);

  // ---- the guided tour moves the view
  useEffect(() => {
    if (p.focus && map.current) map.current.flyToBounds(p.focus.b, { padding: [60, 60], paddingTopLeft: [p.inset[0] + 40, 60], paddingBottomRight: [p.inset[1] + 40, 200], duration: 1.4 } as any);
  }, [p.focus?.n]);

  return <div className="stage pf-map" ref={el} />;
}
