// The resident door (#/resident): Waterline, the teammate's resident report system (github.com/yh1127/RainReady),
// ported into the RainReady site on 21 Oct 2026. Layout and flows are Waterline's own; fonts, colours and transitions
// are the site's (resident/waterline.css, scoped under .wl). Joined to RainReady by: the report stages (forward, never
// dispatch), routing by the responsibility record (route.ts), one shared report store (store.ts) read by the 3D
// planner and the Malaysia map, and "Test in planner" on drain reports.
import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./waterline.css";
import {
  AlertTriangle, ArrowRight, Bell, Camera, CheckCircle2, ChevronDown, CircleHelp, Info, LogOut, MapPin, Menu, Plus, Route as RouteIcon,
  Shield, Siren, SlidersHorizontal, Waves, X,
} from "lucide-react";
import { coordsOf, reportIssueTypes, reportStatuses, statusLabel, type Status, type WReport } from "./data";
import { reverseGeocode } from "./geocode";
import { routeFor, useCatchment, type Catchment, type Route } from "./route";
import { storeReports, useReports } from "./store";
import { MoveNow } from "../ui/Resident";

type Role = "resident" | "association";
interface DemoUser { id: string; name: string; role: Role }

const USER_STORAGE_KEY = "waterline-demo-user";
const DEMO_LOCATION_STORAGE_KEY = "waterline-demo-location";
const DEFAULT_DEMO_LOCATION: [number, number] = [3.088, 101.439];
/** Status colours: one blue ramp, light to dark as a report moves on (red / amber / green mean room for water here). */
export const STATUS_COLOR: Record<Status, string> = { Reported: "#a9d4ff", Checked: "#5ea8f2", Sent: "#2f78d0", Cleared: "#6b7785" };
const SATELLITE_CREDIT = "Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community · Powered by Esri";

function loadStored<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch (error) {
    console.error(`Unable to load ${key} from local storage`, error);
    return fallback;
  }
}

function loadDemoUser(): DemoUser | null {
  const user = loadStored<any>(USER_STORAGE_KEY, null);
  if (user?.role === "admin") return { id: "demo-association", name: "Demo Association", role: "association" };   // older role name
  return user?.role === "resident" || user?.role === "association" ? user : null;
}

function loadDemoLocation(): [number, number] {
  const location = loadStored<any>(DEMO_LOCATION_STORAGE_KEY, DEFAULT_DEMO_LOCATION);
  return Array.isArray(location) && location.length === 2 && location.every(Number.isFinite) && satelliteBounds.contains(location as [number, number])
    ? (location as [number, number]) : DEFAULT_DEMO_LOCATION;
}

function IconMark({ children, tone = "" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`icon-mark ${tone}`}>{children}</span>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="eyebrow">{children}</span>;
}

function Tag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

const townshipBounds = L.latLngBounds([3.081465914, 101.42706871], [3.094621794, 101.451616287]);
const satelliteBounds = getSatelliteBounds(townshipBounds);

function MapIllustration({ reports, statusFilter, mapStyle, demoLocation, onDemoLocationChange, onSelect }: {
  reports: WReport[]; statusFilter: string; mapStyle: string; demoLocation: [number, number];
  onDemoLocationChange: (c: [number, number]) => void; onSelect: (r: WReport) => void;
}) {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const streetLayer = useRef<L.TileLayer | null>(null);
  const satelliteLayer = useRef<L.ImageOverlay | null>(null);
  const reportLayer = useRef<L.LayerGroup | null>(null);
  const demoLocationLayer = useRef<L.Marker | null>(null);
  const onDemoLocationChangeRef = useRef(onDemoLocationChange);
  onDemoLocationChangeRef.current = onDemoLocationChange;

  useEffect(() => {
    if (!mapElement.current || mapInstance.current) return undefined;
    const map = L.map(mapElement.current, { scrollWheelZoom: false, zoomControl: false, maxZoom: 19, maxBounds: satelliteBounds, maxBoundsViscosity: 1 });
    const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    const satellite = L.imageOverlay("./resident/bbr-satellite.jpg", satelliteBounds, { pane: "tilePane", interactive: false, attribution: SATELLITE_CREDIT });
    const markers = L.layerGroup().addTo(map);
    const demoLocationMarker = L.marker(demoLocation, {
      draggable: true,
      icon: L.divIcon({ className: "demo-location-icon", html: '<span class="demo-location-pulse"><span class="demo-location-dot"></span></span>', iconSize: [24, 24], iconAnchor: [12, 12] }),
      title: "Your demo location", zIndexOffset: 1000,
    }).addTo(map);
    demoLocationMarker.bindTooltip("Your demo location · drag the red pin or tap the map to move it");
    const zoomControl = new L.Control({ position: "topright" });
    zoomControl.onAdd = () => {
      const container = L.DomUtil.create("div", "leaflet-control-zoom leaflet-bar");
      const zoomIn = L.DomUtil.create("a", "leaflet-control-zoom-in", container) as HTMLAnchorElement;
      zoomIn.href = "#"; zoomIn.title = "Zoom in to the red pin"; zoomIn.setAttribute("role", "button"); zoomIn.setAttribute("aria-label", "Zoom in to the red pin"); zoomIn.textContent = "+";
      const zoomOut = L.DomUtil.create("a", "leaflet-control-zoom-out", container) as HTMLAnchorElement;
      zoomOut.href = "#"; zoomOut.title = "Zoom out from the red pin"; zoomOut.setAttribute("role", "button"); zoomOut.setAttribute("aria-label", "Zoom out from the red pin"); zoomOut.textContent = "−";
      const zoomToPin = (direction: number) => map.setView(demoLocationMarker.getLatLng(), map.getZoom() + direction, { animate: false });
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(zoomIn, "click", L.DomEvent.preventDefault).on(zoomIn, "click", () => zoomToPin(1));
      L.DomEvent.on(zoomOut, "click", L.DomEvent.preventDefault).on(zoomOut, "click", () => zoomToPin(-1));
      const updateZoomOutState = () => {
        const disabled = map.getZoom() <= map.getMinZoom();
        zoomOut.classList.toggle("leaflet-disabled", disabled);
        zoomOut.setAttribute("aria-disabled", String(disabled));
      };
      map.on("zoomend", updateZoomOutState);
      updateZoomOutState();
      zoomControl.onRemove = () => { map.off("zoomend", updateZoomOutState); };
      return container;
    };
    zoomControl.addTo(map);
    const updateDemoLocation = (coordinates: L.LatLng | [number, number]) => {
      const requested = Array.isArray(coordinates) ? coordinates : [coordinates.lat, coordinates.lng];
      const position: [number, number] = [
        Math.max(satelliteBounds.getSouth(), Math.min(satelliteBounds.getNorth(), requested[0])),
        Math.max(satelliteBounds.getWest(), Math.min(satelliteBounds.getEast(), requested[1])),
      ];
      demoLocationMarker.setLatLng(position);
      onDemoLocationChangeRef.current(position);
    };
    demoLocationMarker.on("dragend", () => updateDemoLocation(demoLocationMarker.getLatLng()));
    map.on("click", (event: L.LeafletMouseEvent) => {
      if (!satelliteBounds.contains(event.latlng)) return;
      updateDemoLocation(event.latlng);
    });
    mapInstance.current = map; streetLayer.current = street; satelliteLayer.current = satellite;
    reportLayer.current = markers; demoLocationLayer.current = demoLocationMarker;
    return () => {
      map.remove();
      mapInstance.current = null; streetLayer.current = null; satelliteLayer.current = null; reportLayer.current = null; demoLocationLayer.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstance.current, street = streetLayer.current, satellite = satelliteLayer.current;
    if (!map || !street || !satellite) return;
    if (map.hasLayer(street)) map.removeLayer(street);
    if (map.hasLayer(satellite)) map.removeLayer(satellite);
    (mapStyle === "satellite" ? satellite : street).addTo(map);
  }, [mapStyle]);

  useEffect(() => {
    const map = mapInstance.current, markers = reportLayer.current;
    if (!map || !markers) return;
    markers.clearLayers();
    fitMapToViewport(map);
    reports
      .filter((report) => report.status !== "Cleared")
      .filter((report) => statusFilter === "All statuses" || report.status === statusFilter)
      .forEach((report) => {
        const coordinates = coordsOf(report);
        if (!coordinates) return;
        const marker = L.circleMarker(coordinates, { radius: 8, color: "#060b11", weight: 2, fillColor: STATUS_COLOR[report.status], fillOpacity: 1 });
        marker.bindTooltip(`${report.issue} · ${report.location}`);
        marker.on("click", () => onSelect(report));
        markers.addLayer(marker);
      });
  }, [reports, statusFilter, onSelect]);

  useEffect(() => { demoLocationLayer.current?.setLatLng(demoLocation); }, [demoLocation]);

  useEffect(() => {
    const map = mapInstance.current, mapContainer = mapElement.current;
    if (!map || !mapContainer) return undefined;
    const observer = new ResizeObserver(() => fitMapToViewport(map));
    observer.observe(mapContainer);
    fitMapToViewport(map);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="map-stage">
      <div ref={mapElement} className={`osm-map ${mapStyle === "satellite" ? "is-satellite" : ""}`} role="application" aria-label={`${mapStyle === "satellite" ? "Satellite imagery" : "OpenStreetMap"} view of Bandar Bukit Raja`} />
      <div className="map-stamp"><MapPin size={13} /> Bandar Bukit Raja · {mapStyle === "satellite" ? "Satellite imagery" : "OpenStreetMap"}</div>
      <div className="map-geocoding-attribution">{mapStyle === "satellite"
        ? <>{SATELLITE_CREDIT}</>
        : <>Approximate address data · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></>}</div>
    </div>
  );
}

function getSatelliteBounds(bounds: L.LatLngBounds) {
  const center = bounds.getCenter();
  const longitudeSpan = bounds.getEast() - bounds.getWest();
  const latitudeSpan = bounds.getNorth() - bounds.getSouth();
  const groundAspectRatio = (longitudeSpan * Math.cos((center.lat * Math.PI) / 180)) / latitudeSpan;
  const imageAspectRatio = 1852 / 862;
  const expandedLongitudeSpan = longitudeSpan * (imageAspectRatio / groundAspectRatio);
  return L.latLngBounds([bounds.getSouth(), center.lng - expandedLongitudeSpan / 2], [bounds.getNorth(), center.lng + expandedLongitudeSpan / 2]);
}

function fitMapToViewport(map: L.Map) {
  map.invalidateSize({ animate: false } as any);
  map.setMinZoom(map.getBoundsZoom(satelliteBounds));
  map.fitBounds(satelliteBounds, { padding: [0, 0], animate: false });
}

/** Where the report goes, by the responsibility record: zone, council side, holder, channel, confidence. */
function RouteBox({ route, compact = false }: { route: Route; compact?: boolean }) {
  return (
    <div className={`route-box ${compact ? "compact" : ""}`}>
      <RouteIcon size={15} />
      <div>
        <strong>{route.holderShort ? <>Goes to {route.holder}</> : <>Holder not known yet</>} <span className="conf-chip">{route.conf}</span></strong>
        <small>Via {route.channel}.{route.zone ? ` Zone ${route.zone.id}, ${route.side} side.` : route.side ? ` ${route.side} side, outside the planner model.` : ""}</small>
        {!compact && <small className="route-rule">{route.rule}. Who looks after it, never who is to blame.</small>}
      </div>
    </div>
  );
}

function HazardForm({ onSubmit, demoLocation, catchment }: { onSubmit: (d: Partial<WReport>) => void; demoLocation: [number, number]; catchment: Catchment | null }) {
  const [issue, setIssue] = useState("Blocked drain");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [locationManuallyEdited, setLocationManuallyEdited] = useState(false);
  const [locationLookup, setLocationLookup] = useState("loading");
  const [photoName, setPhotoName] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const previousDemoLocation = useRef(demoLocation);
  const route = routeFor({ issue, locationCoordinates: demoLocation, location }, catchment);

  useEffect(() => {
    if (previousDemoLocation.current === demoLocation) return;
    previousDemoLocation.current = demoLocation;
    setLocationManuallyEdited(false);
  }, [demoLocation]);

  useEffect(() => {
    if (locationManuallyEdited) return undefined;
    const controller = new AbortController();
    let active = true;
    setLocation("");
    setLocationLookup("loading");
    const timeout = window.setTimeout(() => {
      reverseGeocode(demoLocation, { signal: controller.signal })
        .then((place) => { if (!active) return; setLocation(place); setLocationLookup("found"); })
        .catch((error) => {
          if (!active || error.name === "AbortError") return;
          console.error("Unable to identify the demo pin with OpenStreetMap", error);
          setLocationLookup("unavailable");
        });
    }, 1200);
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [demoLocation, locationManuallyEdited]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (description.trim().length < 8) { setError("Add a few details so the local report is clear."); return; }
    if (!location.trim()) { setError("Enter the street or landmark nearest to the red map pin."); return; }
    setBusy(true);
    try {
      await onSubmit({ issue, description: description.trim(), location: location.trim(), locationCoordinates: demoLocation, photoName, photoDataUrl });
      setDescription(""); setPhotoName(""); setPhotoDataUrl("");
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save the report.");
    } finally {
      setBusy(false);
    }
  }

  async function selectPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPhotoName(""); setPhotoDataUrl(""); setError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Choose an image file."); event.target.value = ""; return; }
    if (file.size > 12 * 1024 * 1024) { setError("Choose an image under 12 MB so it can be saved in local demo storage."); event.target.value = ""; return; }
    try {
      let photoBlob: Blob = file;
      if (file.size > 700 * 1024) {
        const image = await createImageBitmap(file);
        const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Photo processing is not available in this browser.");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        image.close();
        photoBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The photo could not be compressed."))), "image/jpeg", 0.78);
        });
        if (photoBlob.size > 700 * 1024) throw new Error("This photo is too large to save locally. Choose a smaller image.");
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The photo could not be read.")));
        reader.onerror = () => reject(new Error("The photo could not be read."));
        reader.readAsDataURL(photoBlob);
      });
      setPhotoName(photoBlob === file ? file.name : `${file.name} (compressed)`);
      setPhotoDataUrl(dataUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The photo could not be read.");
      event.target.value = "";
    }
  }

  return (
    <form className="form-card" onSubmit={submit}>
      <div className="form-heading">
        <div><Label>Resident report</Label><h2>Report a local issue</h2><p>Share a hazard or maintenance concern. Your residents' association checks it, then it is sent to whoever looks after that place.</p></div>
        <IconMark tone="orange"><AlertTriangle size={18} /></IconMark>
      </div>
      <div className="form-grid">
        <label>Issue type
          <select value={issue} onChange={(event) => setIssue(event.target.value)}>
            {reportIssueTypes.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
        <div className="full-width location-field">
          <label htmlFor="report-location">Address or place</label>
          <div className="location-input-row">
            <MapPin className="location-pin" size={17} aria-hidden="true" />
            <input id="report-location" type="text" value={location}
              onChange={(event) => { setLocation(event.target.value); setLocationManuallyEdited(true); setLocationLookup("manual"); }}
              placeholder="e.g. Jalan Rodat 12/KU6 or Flood Retention Pond" maxLength={120} required />
          </div>
          <small className="field-note" role="status">
            {locationLookup === "loading" && "Looking up an approximate address for the red pin…"}
            {locationLookup === "found" && "Approximate address from OpenStreetMap. Edit or confirm it; the red pin remains the exact report location."}
            {locationLookup === "unavailable" && "Address unavailable—please add a location description. The red pin coordinates remain the report location."}
            {locationLookup === "manual" && "Address edited by you. The red pin coordinates remain the exact report location."}
          </small>
          <small className="field-note">Red pin coordinates: {demoLocation[0].toFixed(6)}, {demoLocation[1].toFixed(6)}</small>
        </div>
        <div className="full-width"><RouteBox route={route} /></div>
        <label className="full-width">What did you notice?
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe what is blocked, damaged, or at risk…" rows={4} maxLength={400} required />
          <small className="field-note">{description.length}/400 characters</small>
        </label>
        <label className="full-width">Photo (optional)
          <div className="photo-actions">
            <input ref={cameraRef} className="photo-source-input" type="file" accept="image/*" capture="environment" onChange={selectPhoto} />
            <input ref={fileRef} className="photo-source-input" type="file" accept="image/*" onChange={selectPhoto} />
            <button className="button button-outline" type="button" onClick={() => cameraRef.current?.click()}><Camera size={14} /> Take a photo</button>
            <button className="button button-outline" type="button" onClick={() => fileRef.current?.click()}>Choose a photo</button>
          </div>
          {photoName && <small className="field-note">Selected: {photoName} · stored in this browser only</small>}
          <small className="field-note">Photos are resized when needed and stored in this browser only (up to 12 MB before resizing).</small>
        </label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-footer">
        <span><Shield size={14} /> No emergency response is contacted.</span>
        <button className="button button-primary" disabled={busy} type="submit"><Plus size={16} /> {busy ? "Saving…" : "Submit report"}</button>
      </div>
    </form>
  );
}

function statusTone(status: Status) {
  return { Reported: "s1", Checked: "s2", Sent: "s3", Cleared: "s4" }[status];
}

function ReportRow({ report, route, compact = false, onClick }: { report: WReport; route: Route; compact?: boolean; onClick?: (r: WReport) => void }) {
  return (
    <article className={`report-row ${compact ? "report-row-compact" : ""}`}>
      <button className="report-main" type="button" onClick={() => onClick?.(report)}>
        <span className={`report-dot dot-${statusTone(report.status)}`} />
        <span className="report-copy"><strong>{report.issue}</strong>{report.isSample && <small className="report-sample-label">Demo sample</small>}<small><MapPin size={11} /> {report.location} <span>·</span> {report.time}</small></span>
      </button>
      <Tag tone={statusTone(report.status)}>{statusLabel(report.status, route.holderShort)}</Tag>
      {!compact && <p className="report-description">{report.description}</p>}
      {report.statusNote && <p className="report-update-note"><strong>Association update:</strong> {report.statusNote}</p>}
    </article>
  );
}

function NotificationInbox({ reports, routeOf, onClose, onSelectReport }: { reports: WReport[]; routeOf: (r: WReport) => Route; onClose: () => void; onSelectReport: (r: WReport) => void }) {
  return (
    <div className="modal-backdrop notification-backdrop" role="presentation" onClick={onClose}>
      <section className="notification-inbox" role="dialog" aria-modal="true" aria-labelledby="notification-title" onClick={(event) => event.stopPropagation()}>
        <div className="notification-heading">
          <div><Label>COMMUNITY REPORTS</Label><h2 id="notification-title">Notifications</h2></div>
          <button className="modal-close" aria-label="Close notifications" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="notification-list">
          <div className="notification-list-heading"><strong>Issue reports</strong><span>Current progress</span></div>
          {reports.length ? reports.map((report) => (
            <article className="notification-item" key={report.id}>
              <button className="notification-report" type="button" onClick={() => onSelectReport(report)}>
                <span className={`report-dot dot-${statusTone(report.status)}`} />
                <span><strong>{report.issue} · {report.location}</strong><small>{report.id} · {report.time}</small></span>
                <Tag tone={statusTone(report.status)}>{statusLabel(report.status, routeOf(report).holderShort)}</Tag>
              </button>
            </article>
          )) : <div className="empty-state"><Shield size={20} /><strong>No reports yet</strong><p>Community reports will appear here after submission.</p></div>}
        </div>
        <p className="notification-disclaimer"><Info size={14} /> Report updates are available when you sign in. Push notifications are not enabled.</p>
      </section>
    </div>
  );
}

function AdminProgressPicker({ status, holderShort, onChange }: { status: Status; holderShort: string; onChange: (s: Status) => void }) {
  const currentStage = reportStatuses.indexOf(status);
  const progress = currentStage < 0 ? 0 : (currentStage / (reportStatuses.length - 1)) * 100;
  return (
    <div className="admin-progress-picker" role="group" aria-label="Select report progress">
      <div className="admin-progress-track" aria-hidden="true"><span style={{ transform: `scaleX(${progress / 100})` }} /></div>
      {reportStatuses.map((item) => (
        <button className={`admin-progress-step ${item === status ? "active" : ""} ${reportStatuses.indexOf(item) < currentStage ? "complete" : ""}`}
          type="button" key={item} aria-pressed={item === status} onClick={() => onChange(item)}>
          <span className="admin-progress-marker">{reportStatuses.indexOf(item) < currentStage ? "✓" : reportStatuses.indexOf(item) + 1}</span>
          <span>{statusLabel(item, holderShort)}</span>
        </button>
      ))}
    </div>
  );
}

function ReportDetailsModal({ report, route, isAssociation, onClose, onUpdate, onTestInPlanner }: {
  report: WReport; route: Route; isAssociation: boolean; onClose: () => void; onUpdate: (id: string, s: Status, n: string) => void;
  onTestInPlanner?: (r: WReport) => void;
}) {
  const [status, setStatus] = useState<Status>(report.status);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canUpdate = isAssociation && !report.isSample;
  const testable = !!onTestInPlanner && route.floodScope && route.zone?.drains_to === "trunk_drain";

  function submitUpdate(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setBusy(true);
    try {
      onUpdate(report.id, status, note);
      setNote("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save this update.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-dialog-title" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" aria-label="Close report details" onClick={onClose}><X size={18} /></button>
        <Label>{report.isSample ? "SAMPLE HAZARD REPORT · DEMO" : "RESIDENT HAZARD REPORT · DEMO"}</Label>
        <h2 id="report-dialog-title">{report.issue}</h2>
        <Tag tone={statusTone(report.status)}>{statusLabel(report.status, route.holderShort)}</Tag>
        <p>{report.description}</p>
        <div className="modal-location"><MapPin size={15} />{report.location} <span>·</span> {report.time}</div>
        {report.locationCoordinates && <small className="field-note">Map pin coordinates: {report.locationCoordinates.map((coordinate) => coordinate.toFixed(5)).join(", ")}</small>}
        <RouteBox route={route} />
        {testable && <button className="button button-soft full-button test-planner" type="button" onClick={() => onTestInPlanner!(report)}>
          <SlidersHorizontal size={15} /> Test in planner: the shared drain 30 % blocked <ArrowRight size={15} /></button>}
        {report.photoDataUrl && <figure className="report-photo"><img src={report.photoDataUrl} alt={`Resident photo for ${report.issue}`} /><figcaption>{report.photoName}</figcaption></figure>}
        {report.statusNote && <div className="report-status-note"><strong>Latest association update</strong><p>{report.statusNote}</p></div>}
        {report.updates?.length > 0 && <div className="report-update-history">
          <strong>Progress updates</strong>
          {report.updates.map((update, index) => <p key={`${update.time}-${index}`}><b>{statusLabel(update.status, route.holderShort)}</b>{update.note && <> · {update.note}</>}<small>{update.author} · {new Date(update.time).toLocaleString()}</small></p>)}
        </div>}
        {canUpdate && <form className="admin-update-form" onSubmit={submitUpdate}>
          <h3>Update report progress</h3>
          <AdminProgressPicker status={status} holderShort={route.holderShort} onChange={setStatus} />
          <label>Optional note for the resident
            <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={400} rows={3} placeholder="Add a short update if useful…" />
            <small className="field-note">{note.length}/400 characters</small>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save update"}</button>
        </form>}
        {report.isSample && <p className="sample-report-note">Sample data only; this example cannot be updated.</p>}
        <div className="modal-footnote"><Info size={14} /> Demo data is saved in this browser only. Nothing is sent: in a pilot, the association would forward it to the holder's own channel. RainReady never dispatches a crew.</div>
      </section>
    </div>
  );
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (u: DemoUser) => void }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand"><span className="brand-mark"><Waves size={20} /></span><div><strong>waterline</strong><small>RAINREADY · RESIDENT DOOR</small></div></div>
        <Label>ROLE-BASED DEMO ACCESS</Label>
        <h1>Choose a demo role</h1>
        <p className="auth-intro">Sign in to explore the resident or residents' association experience.</p>
        <div className="demo-role-options">
          <button type="button" className="demo-role-card" onClick={() => onAuthenticated({ id: "demo-resident", name: "Demo Resident", role: "resident" })}>
            <IconMark><MapPin size={18} /></IconMark>
            <span><strong>Continue as Resident</strong><small>Report issues and follow your own updates</small></span>
            <ArrowRight size={17} />
          </button>
          <button type="button" className="demo-role-card" onClick={() => onAuthenticated({ id: "demo-association", name: "Demo Association", role: "association" })}>
            <IconMark tone="blue"><Shield size={18} /></IconMark>
            <span><strong>Continue as Residents' association</strong><small>Check reports and send them to whoever looks after that place</small></span>
            <ArrowRight size={17} />
          </button>
        </div>
        <p className="auth-security-note"><Info size={14} /> Prototype access only. There are no real accounts, passwords, or secure sessions. Demo reports and updates are stored in this browser.</p>
      </section>
    </main>
  );
}

export function ResidentApp({ onTestInPlanner, demoRole }: { onTestInPlanner?: (r: WReport) => void; demoRole?: Role | null }) {
  const [view, setView] = useState("map");
  const [storedUser, setUser] = useState<DemoUser | null>(loadDemoUser);
  const user: DemoUser | null = demoRole ? { id: `demo-${demoRole}`, name: demoRole === "resident" ? "Demo Resident" : "Demo Association", role: demoRole } : storedUser;
  const reports = useReports();
  const catchment = useCatchment();
  const [demoLocation, setDemoLocation] = useState<[number, number]>(loadDemoLocation);
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [mapStyle, setMapStyle] = useState("street");
  const [selectedReport, setSelectedReport] = useState<WReport | null>(null);
  const [toast, setToast] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const routeOf = (r: WReport) => routeFor(r, catchment);

  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {          // #/resident?report=ID (from a pin in the planner) opens that report
    const id = new URLSearchParams(location.hash.split("?")[1] ?? "").get("report");
    const r = id ? reports.find((x) => x.id === id) : null;
    if (r && user) {
      setSelectedReport(r);
      history.replaceState(null, "", "#/resident");   // open it once; a later sign-in does not reopen it
    }
  }, [user?.role]);

  function notify(message: string) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 4500);
  }

  function navigate(nextView: string) {
    if (nextView === "admin-inbox" && user?.role !== "association") { notify("The association inbox is available only in the residents' association demo role."); return; }
    if (["prevent", "my-reports"].includes(nextView) && user?.role !== "resident") { notify("Resident reporting screens are available only in the resident demo role."); return; }
    setView(nextView);
  }

  function updateDemoLocation(coordinates: [number, number]) {
    if (!satelliteBounds.contains(coordinates)) return false;
    try {
      localStorage.setItem(DEMO_LOCATION_STORAGE_KEY, JSON.stringify(coordinates));
      setDemoLocation(coordinates);
      return true;
    } catch (error) {
      console.error("Unable to save the demo location locally", error);
      notify("The demo location could not be saved in this browser.");
      return false;
    }
  }

  function signIn(demoUser: DemoUser) {
    try { localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(demoUser)); } catch (error) { console.error("Unable to persist the demo role locally", error); }
    setUser(demoUser);
    setView("map");
    notify(`Signed in to the ${demoUser.role === "resident" ? "resident" : "residents' association"} demo experience.`);
  }

  function submitReport(draft: Partial<WReport>) {
    if (user?.role !== "resident") throw new Error("Only a resident demo account can submit reports.");
    const report: WReport = {
      ...(draft as WReport),
      id: `WL-${Date.now().toString().slice(-8)}-${Math.random().toString(36).slice(2, 6)}`,
      createdBy: user.id, status: "Reported", statusNote: "", updates: [], createdAt: new Date().toISOString(), time: "Just now", isSample: false,
    };
    storeReports([report, ...reports]);
    setView("my-reports");
    notify(`Report ${report.id} saved in this browser. It now shows as a pin in the planner view.`);
  }

  function updateReport(id: string, status: Status, note: string) {
    if (user?.role !== "association") throw new Error("Only the residents' association demo role can update report progress.");
    if (!reportStatuses.includes(status)) throw new Error("Choose a valid report status.");
    const trimmedNote = note.trim();
    if (trimmedNote.length > 400) throw new Error("Keep the update note to 400 characters or fewer.");
    const current = reports.find((report) => report.id === id);
    if (!current || current.isSample) throw new Error("Only submitted resident reports can be updated.");
    const update = { status, note: trimmedNote, author: user.name, time: new Date().toISOString() };
    storeReports(reports.map((report) => (report.id === id ? { ...report, status, statusNote: trimmedNote, updates: [...(report.updates || []), update] } : report)));
    setSelectedReport((selected) => (selected?.id === id ? { ...selected, status, statusNote: trimmedNote, updates: [...(selected.updates || []), update] } : selected));
    notify(`Progress updated for ${id}.`);
  }

  function logOut() {
    try { localStorage.removeItem(USER_STORAGE_KEY); } catch (error) { console.error("Unable to clear the demo role from local storage", error); }
    setUser(null); setView("map"); setSelectedReport(null); setNotificationsOpen(false);
  }

  if (!user) return <div className="wl"><AuthScreen onAuthenticated={signIn} /></div>;

  const isAssociation = user.role === "association";
  const activeNav = isAssociation
    ? [
        { id: "map", icon: MapPin, label: "Township map", group: "Community" },
        { id: "admin-inbox", icon: Shield, label: "Association inbox", group: "Residents' association" },
      ]
    : [
        { id: "map", icon: MapPin, label: "Township map", group: "Community" },
        { id: "prevent", icon: Shield, label: "Report a hazard", group: "Community" },
        { id: "my-reports", icon: Bell, label: "My reports", group: "Community" },
        { id: "move-now", icon: Siren, label: "Move-now plan", group: "Community" },
      ];
  const heading = ({
    map: ["Township overview", "Explore the township map and community reports in Bandar Bukit Raja."],
    prevent: ["Make a local report", "Share an observation. Your residents' association checks it and sends it to whoever looks after that place."],
    "my-reports": ["My reports", "Follow the current status and latest association note for your reports."],
    "admin-inbox": ["Association inbox", "Check resident submissions, then send each to its holder and record the progress."],
    "move-now": ["Move-now plan", "On an official flood warning: a short action list for your street that links back to the warning. Clickable mock-up."],
  } as Record<string, string[]>)[view];
  const ownReports = reports.filter((report) => !report.isSample && report.createdBy === user.id);
  const inboxReports = isAssociation ? reports.filter((report) => !report.isSample) : ownReports;
  const mapReports = isAssociation ? reports : reports.filter((report) => report.isSample || report.createdBy === user.id);
  const openReportCount = inboxReports.filter((report) => report.status !== "Cleared").length;

  return (
    <div className="wl">
      <div className="app-shell">
        <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
          <div className="brand"><span className="brand-mark"><Waves size={20} /></span><span><strong>waterline</strong><small>RAINREADY · RESIDENT DOOR</small></span><button className="close-nav" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><X size={18} /></button></div>
          <div className="township-switch"><span className="switch-icon"><MapPin size={15} /></span><span><small>DEMO TOWNSHIP</small><strong>Bandar Bukit Raja</strong></span><ChevronDown size={14} /></div>
          {(isAssociation ? ["Community", "Residents' association"] : ["Community"]).map((group) => (
            <div className="nav-group" key={group}>
              <span className="nav-caption">{group}</span>
              {activeNav.filter((item) => item.group === group).map(({ id, icon: Icon, label }) => (
                <button key={id} className={`nav-item ${view === id ? "active" : ""}`} onClick={() => { navigate(id); setMobileNavOpen(false); }}>
                  <Icon size={17} /><span>{label}</span>
                </button>
              ))}
            </div>
          ))}
          <div className="sidebar-bottom">
            <div className="demo-card"><IconMark tone="blue"><CircleHelp size={16} /></IconMark><strong>Hackathon prototype</strong><p>BBR street map and illustrative reports. Nothing here contacts SDP, the councils or responders.</p></div>
            <span className="sidebar-version">WATERLINE · RAINREADY RESIDENT DOOR</span>
          </div>
        </aside>

        <main className="main-content">
          <header className="topbar">
            <button className="menu-button" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
            <div className="breadcrumb"><span>Bandar Bukit Raja</span><span>/</span><strong>{heading[0]}</strong></div>
            <div className="topbar-right"><span className="sim-pill"><span /> DEMO ONLY</span><button className="icon-button notification-button" aria-label={`Open notifications, ${openReportCount} open reports`} aria-haspopup="dialog" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(true)}><Bell size={18} /><i>{openReportCount}</i></button><span className="account-meta"><strong>{user.name}</strong><small>{isAssociation ? "Residents' association" : "Resident"}</small></span>{!demoRole && <button className="icon-button logout-button" aria-label="Log out" title="Log out" onClick={logOut}><LogOut size={17} /></button>}</div>
          </header>

          <div className={`content-wrap ${view === "map" ? "content-map-view" : ""}`}>
            <section className="page-heading">
              <div><Label>WATERLINE · RESIDENT RESILIENCE</Label><h1>{heading[0]}</h1><p>{heading[1]}</p></div>
              <span className="updated-badge"><span /> Demo snapshot · 21 Oct 2026</span>
            </section>

            {view === "map" && (
              <section className="map-layout">
                <div className="panel map-panel" data-spot="wl-map">
                  <div className="panel-heading map-heading">
                    <div><Label>COMMUNITY MAP</Label><h2>Bandar Bukit Raja</h2><p>Use OpenStreetMap for road names or switch to BBR satellite imagery.</p></div>
                    <div className="map-controls">
                      <label className="select-control basemap-control"><span>Map</span><select value={mapStyle} onChange={(event) => setMapStyle(event.target.value)}><option value="street">OpenStreetMap</option><option value="satellite">Satellite</option></select><ChevronDown size={13} /></label>
                      <label className="select-control status-filter-control"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option>{reportStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select><ChevronDown size={13} /></label>
                    </div>
                  </div>
                  <MapIllustration reports={mapReports} statusFilter={statusFilter} mapStyle={mapStyle} demoLocation={demoLocation} onDemoLocationChange={updateDemoLocation} onSelect={setSelectedReport} />
                  <p className="map-demo-hint"><i /> Drag the red pin or tap within the map to move your simulated location. This is demo-only.</p>
                  <div className="map-legend">
                    <span><i className="legend-dot dot-s1" /> Reported</span><span><i className="legend-dot dot-s2" /> Checked by association</span><span><i className="legend-dot dot-s3" /> Sent to holder</span>
                  </div>
                </div>
                <aside className="panel latest-panel" data-spot="wl-recent">
                  <div className="side-panel-heading"><div><Label>COMMUNITY PULSE</Label><h2>Recent reports</h2></div></div>
                  <p className="sample-note"><Info size={13} /> Sample and resident-submitted demo reports</p>
                  {mapReports.length ? <div className="recent-list">{mapReports.slice(0, 4).map((report) => <ReportRow key={report.id} report={report} route={routeOf(report)} compact onClick={setSelectedReport} />)}</div> : <div className="empty-state"><Shield size={20} /><strong>No reports yet</strong><p>Submitted hazards will show here and on the map.</p></div>}
                  {isAssociation
                    ? <button className="button button-soft full-button" onClick={() => navigate("admin-inbox")}>Open association inbox <ArrowRight size={15} /></button>
                    : <button className="button button-soft full-button" onClick={() => navigate("prevent")}><Plus size={15} /> Report a hazard</button>}
                </aside>
              </section>
            )}

            {view === "prevent" && !isAssociation && (
              <div className="prevent-layout">
                <div><HazardForm onSubmit={submitReport} demoLocation={demoLocation} catchment={catchment} /></div>
                <aside className="prevent-aside panel"><div className="side-panel-heading"><div><Label>RECENTLY REPORTED</Label><h2>Local observations</h2></div></div>
                  {ownReports.length ? ownReports.map((report) => <ReportRow key={report.id} report={report} route={routeOf(report)} compact onClick={() => setSelectedReport(report)} />) : <div className="empty-state"><strong>No reports yet</strong><p>Your submitted reports and progress will appear here.</p></div>}
                  <div className="safety-tip"><Shield size={16} /><p><strong>Stay safe</strong><br />Keep a safe distance from damaged drains and culverts. Do not enter drainage channels to inspect a hazard.</p></div>
                </aside>
              </div>
            )}

            {view === "my-reports" && !isAssociation && (
              <section className="panel report-management">
                <div className="panel-heading"><div><Label>RESIDENT WORKSPACE · DEMO</Label><h2>My submitted reports</h2><p>Follow the latest status and association update for each report you submitted.</p></div><Tag tone="s2">{ownReports.length} REPORT{ownReports.length === 1 ? "" : "S"}</Tag></div>
                {ownReports.length
                  ? <div className="report-queue">{ownReports.map((report) => <ReportRow key={report.id} report={report} route={routeOf(report)} onClick={() => setSelectedReport(report)} />)}</div>
                  : <div className="empty-state"><Shield size={20} /><strong>No reports yet</strong><p>Submit a hazard report and its progress will show here.</p><button className="button button-primary" onClick={() => navigate("prevent")}><Plus size={15} /> Report a hazard</button></div>}
              </section>
            )}

            {view === "move-now" && !isAssociation && (
              <section className="panel move-now-panel"><div className="phones"><MoveNow /></div></section>
            )}

            {view === "admin-inbox" && isAssociation && (
              <section className="panel report-management">
                <div className="panel-heading"><div><Label>ASSOCIATION WORKSPACE · DEMO</Label><h2>Resident report inbox</h2><p>Open a report to check it, send it to its holder and post a status note.</p></div><Tag tone="s3">{inboxReports.length} REPORT{inboxReports.length === 1 ? "" : "S"}</Tag></div>
                {inboxReports.length
                  ? <div className="report-queue">{inboxReports.map((report) => <ReportRow key={report.id} report={report} route={routeOf(report)} onClick={setSelectedReport} />)}</div>
                  : <div className="empty-state"><Shield size={20} /><strong>Inbox is empty</strong><p>Resident submissions will appear here.</p></div>}
              </section>
            )}
          </div>
        </main>

        {selectedReport && <ReportDetailsModal key={selectedReport.id}
          report={reports.find((report) => report.id === selectedReport.id) || selectedReport}
          route={routeOf(reports.find((report) => report.id === selectedReport.id) || selectedReport)}
          isAssociation={isAssociation} onClose={() => setSelectedReport(null)} onUpdate={updateReport} onTestInPlanner={onTestInPlanner} />}
        {notificationsOpen && <NotificationInbox reports={inboxReports} routeOf={routeOf} onClose={() => setNotificationsOpen(false)}
          onSelectReport={(report) => { setNotificationsOpen(false); setSelectedReport(report); }} />}
        {toast && <div className="toast" role="status"><CheckCircle2 size={16} />{toast}</div>}
        <nav className={`mobile-nav ${isAssociation ? "mobile-nav-admin" : ""}`} aria-label="Resident navigation">
          <button type="button" className={view === "map" ? "active" : ""} aria-current={view === "map" ? "page" : undefined} onClick={() => navigate("map")}><MapPin size={18} /><span>Map</span></button>
          {isAssociation
            ? <button type="button" className={view === "admin-inbox" ? "active" : ""} aria-current={view === "admin-inbox" ? "page" : undefined} onClick={() => navigate("admin-inbox")}><Shield size={18} /><span>Inbox</span></button>
            : <>
              <button type="button" className="mobile-nav-report" onClick={() => navigate("prevent")}><Camera size={20} /><span>Report</span></button>
              <button type="button" className={view === "my-reports" ? "active" : ""} aria-current={view === "my-reports" ? "page" : undefined} onClick={() => navigate("my-reports")}><Bell size={18} /><span>My reports</span></button>
            </>}
        </nav>
      </div>
    </div>
  );
}
