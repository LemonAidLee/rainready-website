// What the screening is checked against, and who maintains what: one source for the About drawer, the Brief, the
// planner's cards and pins, and the guided demo. Research: research/HY_ASSUMPTIONS_CHECK.md (checks, assumptions),
// research/RESPONSIBILITY_RECORD.md (owners), research/TBD_VERIFY_RESOLUTION.md (JPS layers).

export type Conf = "H" | "M" | "L";

/** Official flood records (JPS Selangor GIS, Laporan_Banjir_2023 / BANJIR_2024) at or next to the model. */
export const JPS_RECORDS = [
  { name: "Bandar Bukit Raja, Klang", kind: "Ponding", years: "2023, 2024", lat: 3.0906, lon: 101.4317, zone: "Z03" },
  { name: "Setia Alam (upstream, Shah Alam)", kind: "Flash flood", years: "2024", lat: 3.0964, lon: 101.446, zone: null },
];

/** lat/lon to model metres (x east, y north), as the planner's cursor readout (Shell.tsx) in reverse. */
export const toModel = (lat: number, lon: number): [number, number] => [(lon - 101.436) * 111158, (lat - 3.09) * 110572];

/** Does the result match what is known on the ground? Shown with the misses, not only the hits. */
export const CHECKS: { ok: boolean; what: string; finding: string; conf: Conf }[] = [
  { ok: true, what: "JPS's own flood records", conf: "H",
    finding: "Ponding recorded at \"Bandar Bukit Raja\" in 2023 and 2024 falls in zone Z03, which the screening marks \"not enough room\" in the design storm." },
  { ok: true, what: "An independent flood model (FastFlood)", conf: "M",
    finding: "It pools water in ponds A and B and along the shared-drain corridor: the two places the screening flags." },
  { ok: true, what: "The residents' flood street (Jalan Makyong, Spot 1)", conf: "M",
    finding: "Also in Z03; FastFlood pools water within about 60 m of it." },
  { ok: false, what: "Residents report flooding \"at least three times a year\"", conf: "M",
    finding: "Not explained. In a 2-year storm the screening has pond A with room (71 %); only the shared-drain zones are short. Frequent flooding is more likely the street drains, which the screening does not model, and fits the residents' request for bigger drains." },
];

/** The two assumptions the result rests on, and how far the finding depends on them. */
export const ASSUMPTION_CHECKS: { what: string; used: string; evidence: string; holds: string; conf: Conf }[] = [
  { what: "Shared trunk drain size", used: "6 m top width", conf: "M",
    evidence: "Satellite imagery (0.3 m pixels) at five points shows no channel 8 m or wider: a grass-lined channel of a few metres in 10–15 m grass reserves. Exact size unknown (L).",
    holds: "Pond A is short for any drain narrower than about 12 m; a smaller drain only makes it worse." },
  { what: "Live storage above the ponds' normal level", used: "1.5 m", conf: "M",
    evidence: "Inside MSMA 2's own range: its planning chart uses 1–3 m of flood storage and caps normal pond depth at 3.0 m (Chapter 7).",
    holds: "Pond A would need about 2.7 m to hold its storm. By MSMA's chart it is about the right size for 1.5 m if it could release; it cannot, because the shared drain is full." },
];

/**
 * The responsibility record (RESPONSIBILITY_RECORD.md section 3): who maintains each asset under Selangor's published
 * rules (State Assembly answers citing the 1996 Cabinet decision and state cabinet decision MMKN 17/2025). The Brief
 * shows every line; the planner's cards show the lines for what a zone drains to. None is confirmed by the party yet.
 */
export type RecordLine = { id: string; asset: string; mapped: string; who: string; short: string; rule: string; conf: Conf; confirmed: boolean };
export const RECORD: RecordLine[] = [
  { id: "pond_A", asset: "Pond A", mapped: "OSM 399570465; JPS pond K02", conf: "L", confirmed: false, short: "Not settled",
    who: "Not settled: Sime Darby Property while not handed over; MBDK once handed over, with the state as owner. JPS lists it",
    rule: "Developer ponds are the developer's until handover (2020); handed-over ponds are maintained by the council (1996 Cabinet decision, stated 2014). Handover status not public" },
  { id: "pond_B", asset: "Pond B", mapped: "OSM 359496461; JPS pond K03", conf: "L", confirmed: false, short: "Not settled",
    who: "Not settled, as pond A", rule: "As pond A" },
  { id: "trunk_drain", asset: "Shared trunk drain", mapped: "OSM ditch chain, council corner to the main ditch", conf: "M", confirmed: false, short: "MBDK",
    who: "MBDK", rule: "Secondary drain linked to a main drain: the council's (state cabinet, MMKN 17/2025); Klang side" },
  { id: "main_ditch", asset: "Main ditch", mapped: "OSM way 888406336", conf: "M", confirmed: false, short: "JPS Selangor",
    who: "JPS Selangor", rule: "Main drain linked to a river: JPS (MMKN 17/2025)" },
  { id: "crossing", asset: "Council-line crossing drain", mapped: "OSM drain at 3.09294 N, 101.44433 E", conf: "M", confirmed: false, short: "MBSA / MBDK",
    who: "MBSA above the council line, MBDK below it", rule: "Secondary drain (MMKN 17/2025), split at the council line" },
  { id: "street", asset: "Street drains", mapped: "Many; the drains residents report", conf: "M", confirmed: false, short: "The council of its side",
    who: "The council of the side they are on (MBDK or MBSA), cleaned by its contractor; JKR inside a JKR road reserve", rule: "Secondary and tertiary drains: the council's; JKR road reserve: JKR (MMKN 17/2025)" },
  { id: "river", asset: "Sungai Keramat", mapped: "River reach south of zone Z03", conf: "M", confirmed: false, short: "JPS Selangor",
    who: "JPS Selangor", rule: "Rivers and tributaries: JPS (stated 2014 and 2022)" },
];
export const recordOf = (id: string) => RECORD.find((r) => r.id === id);
/** Street drains of a zone: the council of its side (zones carry "Klang" or "Shah Alam"). */
export const streetDrainsOf = (council: string) => (council === "Shah Alam" ? "MBSA" : "MBDK");

/**
 * After the water: who does what when a township floods (research/AFTER_THE_FLOOD.md). Who holds a duty under the
 * published rules, never who is to blame; relief is not compensation. The "After the water" page and the Brief read
 * these; the Bukit Raja lines come from RECORD.
 */
export type Stage = { when: string; who: string; what: string; source: { label: string; url?: string }[]; conf: Conf | "M–H"; verify?: string };
export const AFTER_STAGES: Stage[] = [
  { when: "Before", who: "The council (MBDK, MBSA), JPS Selangor, and the developer for ponds not yet handed over", conf: "M",
    what: "Maintain drains, rivers and ponds under the state's published rules. For each asset at Bukit Raja, see below.",
    source: [{ label: "Responsibility record (Selangor State Assembly answers)" }] },
  { when: "Warning", who: "METMalaysia (rain), JPS Public Infobanjir (river levels), NADMA (SMS alerts)", conf: "H",
    what: "Issue the official warnings. RainReady never issues its own; it links back to these.",
    source: [{ label: "Public Infobanjir", url: "https://publicinfobanjir.water.gov.my/" }, { label: "METMalaysia", url: "https://www.met.gov.my/" }] },
  { when: "During", who: "The district disaster management committee, chaired by the District Officer, with state and national committees above it", conf: "M",
    what: "Runs evacuation and the temporary relief centres (PPS).",
    source: [{ label: "Arahan MKN No. 20 (2012 revision); review announced May 2024", url: "https://www.bharian.com.my/amp/berita/nasional/2024/05/1244218/dasar-pengurusan-bencana-negara-akan-disemak-semula-ahmad-zahid" }],
    verify: "whether a revised directive has been issued" },
  { when: "Right after", who: "Federal government (NADMA) and the Selangor government", conf: "M–H",
    what: "Cash relief, not compensation. Federal Bantuan Wang Ihsan: RM1,000 per head of household registered at or with a relief centre (RM10,000 to heirs on a death). Selangor's Bantuan Selangor Bangkit after the late-2025 floods: RM1,000 per family, about 72,451 families paid by Feb 2026, Klang the most (23,450).",
    source: [{ label: "MOF", url: "https://mof.gov.my/portal/ms/berita/akhbar/bantuan-wang-ihsan-rm1-000-diperluas-untuk-setiap-ketua-isi-rumah-terjejas-banjir" },
             { label: "Berita Harian, Dec 2025", url: "https://www.bharian.com.my/amp/berita/nasional/2025/12/1484615/bhplus" },
             { label: "Selangor Journal, Feb 2026", url: "https://selangorjournal.my/?p=263857" }] },
  { when: "Claims", who: "The household's own insurer", conf: "M–H",
    what: "Pays only if the policy covers flood. Home contents need flood cover; a car needs the special perils add-on, since standard comprehensive cover excludes flood. Uptake is low: one insurer said 11 % of its motor customers had it, and about two-thirds of 2021 flood losses were uninsured.",
    source: [{ label: "Motorist", url: "https://www.motorist.my/article/6200/special-perils-add-on-is-flood-coverage-worth-it-in-malaysia" },
             { label: "NST, 2022", url: "https://nst.com.my/amp/news-cars-bikes-trucks/2022/11/846045/motorists-still-not-insured-against-flood" },
             { label: "Bank Negara via Insurance Business" }] },
  { when: "Compensation", who: "The civil courts", conf: "H",
    what: "Compensation for a loss comes only from a claim in court against whoever owed the duty. Slow and costly: the Taman Sri Muda claim took almost five years.",
    source: [{ label: "See the Taman Sri Muda ruling below" }] },
];

/** The Taman Sri Muda ruling, as reported. Not final: no appeal decision or damages reported as of 21 Oct 2026. */
export const SRI_MUDA = {
  date: "29 September 2026",
  court: "Shah Alam High Court, Judicial Commissioner Dr Shoba Rajah",
  claim: "50 Taman Sri Muda residents, over the December 2021 flood; special damages sought RM3,767,148.51, plus general and aggravated damages",
  held: "The federal government (the court found breaches by NADMA and METMalaysia), the Selangor JPS director and Shah Alam City Council (MBSA), jointly",
  why: [
    "Each owed an operational duty: JPS to run and maintain the flood assets it controls; the council to repair, clear and maintain local drains, although JPS owns the main flood works; NADMA and MET to warn and respond competently.",
    "\"Act of God\" rejected: it is inapplicable where reasonable human intervention was available. Rain above the design standard was not enough on its own.",
  ],
  status: "Not final. Damages not yet assessed (case management 6 Oct 2026); Selangor said it would take legal advice before deciding whether to appeal.",
  limits: "Sri Muda was a river and pump flood, not a township drainage flood: it shows how duties are read, not what would happen at Bukit Raja. Councils keep a statutory immunity for approving building plans (s. 95(2), Street, Drainage and Building Act 1974; Highland Towers, Federal Court 2006), so upkeep, not approval, is where duties were found.",
  sources: [
    { label: "The Star, 30 Sep 2026", url: "https://www.thestar.com.my/news/nation/2026/09/30/authorities-held-liable-over-2021-floods" },
    { label: "FMT, 29 Sep 2026", url: "https://www.freemalaysiatoday.com/category/nation/2026/09/29/taman-sri-muda-residents-win-suit-against-govt-others-over-2021-floods" },
    { label: "Media Selangor", url: "https://mediaselangor.com/en/2026/09/398538" },
    { label: "Malay Mail, 30 Sep 2026", url: "https://www.malaymail.com/news/malaysia/2026/09/30/selangor-mulls-appeal-after-high-court-finds-authorities-liable-for-2021-taman-sri-muda-floods/237147" },
  ],
};

/** What a resident can do after a flood, in order. */
export const RESIDENT_STEPS = [
  { t: "Record the damage", d: "Before cleaning up: dated photos, a list of what was lost, receipts. Insurers, aid officers and a court all ask for it." },
  { t: "Register for relief", d: "At the relief centre or the district office: the federal and state cash aid go to registered households." },
  { t: "Claim on your insurance", d: "If your home or car policy covers flood (special perils for a car)." },
  { t: "Report what failed", d: "To the holder's official channel: iClean Selangor or Sispaa for council drains. RainReady forwards, never replaces." },
  { t: "Act together", d: "Through your residents' association: a shared, dated record carries more weight, as the 2024 memorandum and the Sri Muda claim show." },
];
