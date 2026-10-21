// Reverse geocoding for the report form (Waterline's service, unchanged in behaviour): OpenStreetMap Nominatim,
// three layers (address; POI and railway; natural and man-made), closest named feature wins, cached per session,
// rate-limited below Nominatim's one request per second (https://operations.osmfoundation.org/policies/nominatim/).
const DEFAULT_NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
const MIN_REQUEST_INTERVAL_MS = 1100;
const addressCache = new Map<string, string>();
let lastRequestAt = 0;

function getNominatimBaseUrl(): string {
  const env = (import.meta as any).env?.VITE_NOMINATIM_BASE_URL as string | undefined;
  return (env || DEFAULT_NOMINATIM_BASE_URL).replace(/\/+$/, "");
}

function getCacheKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

function distanceBetween(first: number[], second: number[]) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const [firstLatitude, firstLongitude] = first.map(radians);
  const [secondLatitude, secondLongitude] = second.map(radians);
  const latitudeDelta = secondLatitude - firstLatitude;
  const longitudeDelta = secondLongitude - firstLongitude;
  const arc = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

async function waitForRateLimit(signal: AbortSignal) {
  const delay = Math.max(0, MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt));
  if (delay > 0) {
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        window.clearTimeout(timeout);
        reject(new DOMException("The address lookup was cancelled.", "AbortError"));
      };
      const timeout = window.setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, delay);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  if (signal.aborted) throw new DOMException("The address lookup was cancelled.", "AbortError");
  lastRequestAt = Date.now();
}

function getPlaceName(result: any): string {
  const address = result.address || {};
  const primary = result.name || address.building || address.amenity || address.tourism || address.leisure || address.water
    || address.lake || address.river || address.reservoir || address.park || address.road || address.residential
    || address.pedestrian || address.footway || address.path || address.neighbourhood || address.suburb || address.city;
  if (typeof primary !== "string" || !primary.trim()) return "";
  return typeof result.display_name === "string" && result.display_name.trim() ? result.display_name.trim() : primary.trim();
}

async function lookupLayer(coordinates: number[], layer: string, signal: AbortSignal) {
  await waitForRateLimit(signal);
  const [latitude, longitude] = getCacheKey(coordinates[0], coordinates[1]).split(",");
  const query = new URLSearchParams({ lat: latitude, lon: longitude, format: "jsonv2", zoom: "18", addressdetails: "1", layer });
  const response = await fetch(`${getNominatimBaseUrl()}/reverse?${query}`, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`OpenStreetMap lookup failed (${response.status}).`);
  const result = await response.json();
  const place = getPlaceName(result);
  const resultCoordinates = [Number(result.lat), Number(result.lon)];
  if (!place || !resultCoordinates.every(Number.isFinite)) return null;
  return { place, distance: distanceBetween(coordinates, resultCoordinates) };
}

export async function reverseGeocode(coordinates: [number, number], { signal }: { signal?: AbortSignal } = {}): Promise<string> {
  const latitude = Number(coordinates[0]);
  const longitude = Number(coordinates[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("A valid map coordinate is required for address lookup.");
  const cacheKey = getCacheKey(latitude, longitude);
  const cached = addressCache.get(cacheKey);
  if (cached) return cached;
  const requestSignal = signal || new AbortController().signal;
  const candidates: { place: string; distance: number }[] = [];
  let lastError: unknown;
  for (const layer of ["address", "poi,railway", "natural,manmade"]) {
    try {
      const candidate = await lookupLayer([latitude, longitude], layer, requestSignal);
      if (candidate) candidates.push(candidate);
    } catch (error: any) {
      if (error?.name === "AbortError") throw error;
      lastError = error;
    }
  }
  if (!candidates.length) {
    if (lastError) throw lastError;
    throw new Error("OpenStreetMap has no nearby named address or place for this pin.");
  }
  const place = candidates.reduce((nearest, c) => (c.distance < nearest.distance ? c : nearest)).place;
  addressCache.set(cacheKey, place);
  return place;
}
