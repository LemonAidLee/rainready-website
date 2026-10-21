// Waterline, the resident report system (teammate's subsystem, github.com/yh1127/RainReady, ported 21 Oct 2026).
// Report stages follow RainReady's rule that it forwards to the official channel and never dispatches anyone
// (team leader, 21 Oct 2026): Reported -> Checked by the residents' association -> Sent to the holder -> Cleared.

export type Status = "Reported" | "Checked" | "Sent" | "Cleared";
export const reportStatuses: Status[] = ["Reported", "Checked", "Sent", "Cleared"];

/** Stage words; "Sent" names the holder when it is known ("Sent to MBDK"). */
export function statusLabel(status: Status, holderShort?: string): string {
  if (status === "Checked") return "Checked by association";
  if (status === "Sent") return holderShort ? `Sent to ${holderShort}` : "Sent to holder";
  return status;
}

/** Older stored reports used the original stages: map them onto the new ones. */
export function migrateStatus(s: string): Status {
  if (s === "Crew Dispatched") return "Sent";
  if (s === "In Progress") return "Checked";
  return (reportStatuses as string[]).includes(s) ? (s as Status) : "Reported";
}

export const reportIssueTypes = [
  "Blocked drain",
  "Damaged culvert",
  "Illegal dumping",
  "Flooding / standing water",
  "Road damage / pothole",
  "Streetlight outage",
  "Fallen tree / blocked path",
  "Water leak / pipe damage",
  "Damaged sidewalk / walkway",
  "Other public-area hazard",
  "Other",
];

export interface Update { status: Status; note: string; author: string; time: string }
export interface WReport {
  id: string; issue: string; description: string; location: string; status: Status; time: string;
  createdAt?: string; createdBy?: string | null; isSample?: boolean; statusNote: string; updates: Update[];
  locationCoordinates?: [number, number]; photoName?: string; photoDataUrl?: string;
}

export const starterReports: Omit<WReport, "statusNote" | "updates">[] = [
  { id: "WL-0248", issue: "Blocked drain", description: "Leaves and silt collecting at the drain opening after rain.", location: "BBR North", status: "Reported", time: "8 min ago" },
  { id: "WL-0247", issue: "Illegal dumping", description: "Household waste beside the stream footpath.", location: "BBR Central", status: "Checked", time: "32 min ago" },
  { id: "WL-0246", issue: "Damaged culvert", description: "Cracked edge at the road crossing; water still flowing.", location: "BBR South", status: "Sent", time: "1 hr ago" },
  { id: "WL-0245", issue: "Blocked drain", description: "Grate partially covered with sediment.", location: "Drainage corridor", status: "Cleared", time: "Yesterday" },
];

export const reportCoordinates: Record<string, [number, number]> = {
  "BBR North": [3.0925, 101.4332],
  "BBR Central": [3.088, 101.439],
  "BBR South": [3.0837, 101.445],
  "Drainage corridor": [3.0864, 101.4314],
  "Northwest sector": [3.0918, 101.4286],
  "Southeast sector": [3.0821, 101.4495],
};

export const coordsOf = (r: WReport): [number, number] | null => r.locationCoordinates ?? reportCoordinates[r.location] ?? null;
