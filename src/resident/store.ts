// One report store for the whole site: the resident door writes it, the planner's 3D pins and the Malaysia map read
// it. Browser-local (as in Waterline): reports live in this browser only, shared between the resident and association
// demo roles. Other tabs see changes through the storage event.
import { useSyncExternalStore } from "react";
import { coordsOf, migrateStatus, starterReports, type WReport } from "./data";

const REPORT_STORAGE_KEY = "waterline-shared-demo-reports";

function loadStored<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch (error) {
    console.error(`Unable to load ${key} from local storage`, error);
    return fallback;
  }
}

function loadReports(): WReport[] {
  const stored = loadStored<any[] | null>(REPORT_STORAGE_KEY, null);
  const legacy = stored ? null : loadStored<any[] | null>("waterline-demo-reports-bbr", null);
  const sampleIds = new Set(starterReports.map((report) => report.id));
  const reports = stored || legacy || starterReports.map((report) => ({ ...report, isSample: true, updates: [] }));
  if (!Array.isArray(reports)) return [];
  return reports.map((report: any) => {
    const isSample = report.isSample ?? sampleIds.has(report.id);
    // samples always take the current starter text and stage (the stages changed on 21 Oct 2026)
    const starter = isSample ? starterReports.find((s) => s.id === report.id) : null;
    return {
      ...report,
      ...(starter ?? {}),
      status: migrateStatus(starter?.status ?? report.status),
      isSample,
      createdBy: report.createdBy ?? (isSample ? null : "demo-resident"),
      statusNote: report.statusNote || "",
      updates: Array.isArray(report.updates) ? report.updates.map((u: any) => ({ ...u, status: migrateStatus(u.status) })) : [],
    } as WReport;
  });
}

let reports: WReport[] = loadReports();
const subscribers = new Set<() => void>();
const emit = () => subscribers.forEach((f) => f());

export const getReports = () => reports;

/** Save (throws if browser storage is full, e.g. a large photo), then tell every reader. */
export function storeReports(next: WReport[]) {
  try {
    localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.error("Unable to save demo reports locally", error);
    throw new Error("The report could not be saved in browser storage. Try a smaller photo or remove some old demo data.");
  }
  reports = next;
  emit();
}

function subscribe(f: () => void) {
  subscribers.add(f);
  const onStorage = (e: StorageEvent) => { if (e.key === REPORT_STORAGE_KEY) { reports = loadReports(); emit(); } };
  addEventListener("storage", onStorage);
  return () => { subscribers.delete(f); removeEventListener("storage", onStorage); };
}

export function useReports(): WReport[] {
  return useSyncExternalStore(subscribe, getReports);
}

/** A report in the shared format the Malaysia map reads (documentation/RESIDENT_PLANNER_INTEGRATION.md section 3). */
export function toShared(r: WReport) {
  const c = coordsOf(r);
  if (!c) return null;
  const type = r.issue === "Blocked drain" || r.issue === "Damaged culvert" ? "blocked_drain"
    : r.issue === "Flooding / standing water" ? "flooded_street" : "other";
  const status = { Reported: "new", Checked: "verified", Sent: "forwarded", Cleared: "resolved" }[r.status];
  return { id: r.id, lat: c[0], lon: c[1], type, status, note: `${r.issue}: ${r.description}`, example: !!r.isSample };
}
