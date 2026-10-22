// The 2D site's frame (22 Oct 2026), panel for panel the 3D planner's: status bar, icon rail, Scenario control (presets
// and levers, descriptions in hover tips), Layers, the site's own tabs, live results, footer readout and evidence feed.
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Building2, CloudRain, Eye, FileText, Gauge, Globe2, Info, LayoutGrid, Layers as LayersIcon, LifeBuoy, Map as MapIcon,
         PlayCircle, RotateCcw, SlidersHorizontal, Users, Waves, Wrench } from "lucide-react";
import { val } from "../sim/network.ts";
import { Wordmark } from "../ui/Shell";
import { HoverTip } from "../ui/HoverTip";
import { BAND_COLOR, fmt, metricsOf, pct, type Pack, type UploadResult } from "./data";
import { GROUPS2, PRESETS2, applyPreset2, headline, presetSummary2, sourced2, type C2 } from "./model";
import { Boundary, Inputs, Overview, UploadPanel, nameOf, shortCouncil } from "./SitePanels";
import type { Layers2, Pick2 } from "./MapView";

export type Panel2 = "controls" | "layers" | "site" | null;
export type Tab2 = "overview" | "boundary" | "inputs" | "upload";
const m3 = (v: number) => `${fmt(v)} m³`;

export function StatusBar2(p: { pack: Pack; sc: any; c: C2; name: string; status: "sourced" | "whatif" | "register"; storm: number; onTour: () => void; onAbout: () => void }) {
  const h = headline(p.sc);
  return (
    <header className="statusbar">
      <div className="sb-left">
        <Wordmark />
        <div className="sb-context">{p.pack.site.name.toUpperCase()} · {p.pack.site.councils.map(shortCouncil).join(" ⇄ ")} · PROPERTY LINES STOP AT THE FENCE. WATER DOESN'T.</div>
      </div>
      <div className="sb-right">
        <div className="readout" data-spot="storm"><span>STORM</span><b>{p.c.ari}-YR · {p.sc.duration_h} H · {fmt(p.sc.intensity_mm_hr, 1)} MM/H</b></div>
        <div className="readout"><span>SCENARIO</span><b className="cyan">{p.name.toUpperCase()}</b></div>
        <div className="readout"><span>STORAGE GAP</span><b className={p.storm > 0.5 ? (h.gap > 0 ? "red" : "green") : ""}>{p.storm > 0.5 ? m3(h.gap) : "DRY"}</b></div>
        <button className={`status-pill ${p.status === "sourced" ? "sourced" : "whatif"}`} onClick={p.onAbout} title="How these numbers are made">
          <i /><span className="sp-long">{p.status === "register" ? "YOUR REGISTER · MSMA 2" : p.status === "whatif" ? "YOUR WHAT-IF · MSMA 2" : "SCREENING · OPEN DATA · LOW CONFIDENCE"}</span>
          <span className="sp-short">{p.status === "register" ? "REGISTER" : p.status === "whatif" ? "WHAT-IF" : "ESTIMATE · L"}</span>
        </button>
        <button className="btn-gold" onClick={p.onTour}><PlayCircle size={14} /> GUIDED TOUR</button>
      </div>
    </header>
  );
}

export function Rail2(p: { id: string; route: "map" | "findings"; panel: Panel2; setPanel: (x: Panel2) => void; onTour: () => void; onAbout: () => void }) {
  // phones (22 Oct 2026): a short label under each icon; the least-used items stay on the desktop rail only
  const Item = (q: { icon: ReactNode; label: string; short?: string; phone?: false; on?: boolean; onClick?: () => void; href?: string; spot?: string }) => {
    const cls = `rail-btn ${q.on ? "on" : ""} ${q.phone === false ? "no-phone" : ""}`;
    const body = <>{q.icon}<span className="lbl">{q.label}</span><span className="lbl-s">{q.short ?? q.label}</span></>;
    return q.href ? <a className={cls} href={q.href} title={q.label} data-spot={q.spot}>{body}</a>
                  : <button className={cls} onClick={q.onClick} title={q.label} data-spot={q.spot}>{body}</button>;
  };
  const map = p.route === "map";
  const toggle = (x: Panel2) => { if (!map) location.hash = `#/site/${p.id}`; p.setPanel(p.panel === x ? null : x); };
  return (
    <nav className="rail" aria-label="Views">
      <Item icon={<Globe2 size={18} />} label="Malaysia" phone={false} href="#/" />
      <Item icon={<MapIcon size={18} />} label="Site map" short="Map" href={`#/site/${p.id}`} on={map && p.panel === null} />
      <Item icon={<SlidersHorizontal size={18} />} label="Scenario" short="What-if" on={map && p.panel === "controls"} onClick={() => toggle("controls")} spot="rail-scenario" />
      <Item icon={<LayersIcon size={18} />} label="Layers" on={map && p.panel === "layers"} onClick={() => toggle("layers")} />
      <Item icon={<Info size={18} />} label="Site" on={map && p.panel === "site"} onClick={() => toggle("site")} spot="rail-site" />
      <div className="rail-sep" />
      <Item icon={<Users size={18} />} label="Residents" phone={false} href="#/resident" />
      <Item icon={<FileText size={18} />} label="Findings" short="Brief" href={`#/site/${p.id}/findings`} on={p.route === "findings"} spot="rail-findings" />
      <Item icon={<LifeBuoy size={18} />} label="Recovery" phone={false} href="#/after" />
      <Item icon={<LayoutGrid size={18} />} label="All sites" short="Sites" href="#/sites" spot="rail-sites" />
      <div className="rail-grow" />
      <Item icon={<PlayCircle size={18} />} label="Tour" onClick={p.onTour} />
      <Item icon={<Info size={18} />} label="About" phone={false} onClick={p.onAbout} />
    </nav>
  );
}

// ---------------------------------------------------------------------------------------------- scenario control
function Slider(p: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string;
                     onChange: (v: number) => void; ticks?: [number, string][]; sourced?: number; spot?: string; disabled?: boolean }) {
  const changed = p.sourced !== undefined && Math.abs(p.value - p.sourced) > 1e-9;
  const pc = ((p.value - p.min) / (p.max - p.min)) * 100;
  return (
    <div className="slider" data-spot={p.spot}>
      <div className="slider-top"><span>{p.label}</span><b className={changed ? "changed" : ""}>{p.fmt(p.value)}</b></div>
      <input type="range" min={p.min} max={p.max} step={p.step} value={p.value} style={{ ["--pct" as any]: `${pc}%` }} disabled={p.disabled}
        onChange={(e) => p.onChange(+e.target.value)} aria-label={p.label} />
      {p.ticks && <div className="ticks">{p.ticks.map(([v, t]) => (
        <button key={t} style={{ left: `${((v - p.min) / (p.max - p.min)) * 100}%` }} onClick={() => p.onChange(v)}>{t}</button>
      ))}</div>}
    </div>
  );
}

function Section(p: { n: string; icon: ReactNode; title: string; watch: string; note?: ReactNode; children: ReactNode; spot?: string; conf?: string }) {
  return (
    <section className="ctl-sec" data-spot={p.spot}>
      <HoverTip title={p.title} tip={<>{p.note && <p>{p.note}</p>}<p className="tip-watch"><Eye size={12} /> {p.watch}</p></>}>
        <div className="ctl-head" tabIndex={0}><span className="ctl-n">{p.n}</span>{p.icon}<b>{p.title}</b>
          <Info size={12} className="ctl-info" aria-hidden />{p.conf && <span className="conf">{p.conf}</span>}</div>
      </HoverTip>
      {p.children}
    </section>
  );
}

const ARIS = [2, 5, 10, 20, 50, 100];

export function ControlPanel2(p: { pack: Pack; inputs: any; c: C2; set: (c: C2) => void; preset: string | null; setPreset: (id: string | null) => void;
                                    sc: any; close: () => void }) {
  const s = sourced2(p.inputs), c = p.c;
  const hasPond = !!p.inputs.what_if_ponds?.W1;
  const presets = PRESETS2.filter((pr) => !pr.needsPond || hasPond);
  const summaries = useMemo(() => Object.fromEntries(presets.map((pr) => [pr.id, presetSummary2(p.inputs, pr)])), [p.inputs]);
  const set = (patch: Partial<C2>) => { p.set({ ...c, ...patch }); p.setPreset(null); };
  const wp = p.inputs.what_if_ponds?.W1;
  // the ponds that matter most here: the fullest, for stated capacities
  const ponds = Object.entries<any>(p.sc.ponds).filter(([, q]) => q.storage_required_m3 > 0).sort((a, b) => (b[1].ratio ?? 0) - (a[1].ratio ?? 0)).slice(0, 5);
  return (
    <aside className="panel panel-left controls" data-spot="controls">
      <div className="panel-head"><span>SCENARIO CONTROL</span><button className="x" onClick={p.close} aria-label="Close">×</button></div>
      <div className="presets" data-spot="presets">
        {presets.map((pr, i) => (
          <Fragment key={pr.id}>
            {pr.group !== presets[i - 1]?.group && <div className={`preset-group g-${pr.group}`}>{GROUPS2[pr.group]}</div>}
            <HoverTip title={pr.label} tip={<><p>{pr.blurb}.</p><p className="tip-watch">Numbers: storage gap against capacity (assumed, L, unless stated), and drains over their assumed size</p></>}>
              <button className={`preset g-${pr.group} ${pr.wide ? "wide" : ""} ${p.preset === pr.id ? "on" : ""}`}
                onClick={() => { p.set(applyPreset2(p.inputs, pr)); p.setPreset(pr.id); }}>
                <b>{pr.label}</b><em>{summaries[pr.id]}</em>
              </button>
            </HoverTip>
          </Fragment>
        ))}
      </div>

      <Section n="01" icon={<Building2 size={14} />} title="Open land built" spot="dev" conf="what-if"
        watch="Blocks with open or vacant land hatch in gold as they are built; their outlets' loads move (▲ on the zone tags)."
        note="The parcels not yet built: what a before-you-build check tests. Built as link and terrace housing, C 0.90 (MSMA 2 Table 2.5). Which blocks are open comes from OpenStreetMap land use (L).">
        <Slider label="Open land built" value={c.dev} min={0} max={1} step={0.05} sourced={0} spot="dev-slider"
          fmt={(v) => (v === 0 ? "Today" : `${Math.round(v * 100)} %`)} onChange={(v) => set({ dev: v })}
          ticks={[[0, "Today"], [0.5, "Half"], [1, "Built out"]]} />
      </Section>

      {hasPond && (
        <Section n="02" icon={<Waves size={14} />} title="New retrofit pond" spot="pond" conf="what-if"
          watch="The pond grows in on its parcel; the outlet it protects needs less storage."
          note={wp._what}>
          <label className="toggle">
            <input type="checkbox" checked={c.pond} onChange={(e) => set({ pond: e.target.checked })} />
            <span className="sw" /><span>{c.pond ? `Pond added in ${wp.serves.join(", ")}` : "No new pond"}</span>
          </label>
          <Slider label="Pond size" value={c.pondSize} min={2000} max={Math.max(80000, s.pondSize * 2)} step={1000} sourced={s.pondSize}
            fmt={(v) => m3(v)} onChange={(v) => set({ pondSize: v, pond: true })} />
        </Section>
      )}

      <Section n="03" icon={<Gauge size={14} />} title="Drain works" spot="drain" conf="L"
        watch="Drains thicken and calm: their colour shows the load (cyan, amber, red over capacity) and the flow slows as they empty."
        note="Every mapped drain wider by this factor (depth by its square root). The drain sizes are typical values by OSM type, not measured: the biggest unknown here. Upload measured sizes on the Site panel.">
        <Slider label="Mapped drains, size" value={c.drainScale} min={0.5} max={3} step={0.1} sourced={1} spot="drain-slider"
          fmt={(v) => `× ${fmt(v, 1)}`} onChange={(v) => set({ drainScale: Math.round(v * 10) / 10 })}
          ticks={[[0.5, "½"], [1, "assumed"], [1.5, "1.5"], [2, "2"], [3, "3"]]} />
      </Section>

      <Section n="04" icon={<Wrench size={14} />} title="Keep it working" spot="upkeep" conf="what-if"
        watch="Zones turn red sooner: ponds have less room, and the drains carry less, so the ponds can release less."
        note="A built town still decides every year whether ponds are desilted and drains cleared. Neither share is measured anywhere public. Each cuts storage or carrying capacity in proportion; the storm is held the same as with clear drains.">
        <Slider label="Pond storage lost (silt, weeds)" value={c.silt} min={0} max={0.5} step={0.05} sourced={0} spot="silt-slider"
          fmt={(v) => (v === 0 ? "None" : `${Math.round(v * 100)} %`)} onChange={(v) => set({ silt: v })} ticks={[[0, "As built"], [0.3, "30 %"], [0.5, "50 %"]]} />
        <Slider label="Drains blocked (silt, rubbish)" value={c.blocked} min={0} max={0.6} step={0.05} sourced={0} spot="blocked-slider"
          fmt={(v) => (v === 0 ? "Clear" : `${Math.round(v * 100)} %`)} onChange={(v) => set({ blocked: v })} ticks={[[0, "Clear"], [0.3, "30 %"], [0.6, "60 %"]]} />
      </Section>

      <Section n="05" icon={<CloudRain size={14} />} title="Design storm" spot="storm-sec" conf="H"
        watch="Rain thickens with the intensity; every result is re-run at the new return period."
        note={`MSMA 2 IDF, gauge ${p.pack.site.storm.station} (${p.pack.site.storm.distance_km} km away). 100 yr is the major-system standard for housing (Table 1.1); 10 yr is the minor system.`}>
        <div className="seg">{ARIS.map((a) => <button key={a} className={c.ari === a ? "on" : ""} onClick={() => set({ ari: a })}>{a} yr</button>)}</div>
      </Section>

      <Section n="06" icon={<Waves size={14} />} title="Stated pond capacity" spot="cap" conf="planner input"
        watch="Ponds fill to the share of the stated capacity; zones recolour against it."
        note="No pond capacity here is public: every one is assumed (mapped water area × 1.5 m, L). Type a stated figure for the fullest ponds, or upload a whole register on the Site panel.">
        <div className="caps caps-list">
          {ponds.map(([id]) => (
            <label key={id}><span title={nameOf(p.inputs, id)}>{nameOf(p.inputs, id).slice(0, 22)}</span>
              <input type="number" min={0} step={1000} placeholder={`assumed ${fmt(val(p.inputs.ponds[id].capacity_m3))}`} value={c.caps[id] ?? ""}
                onChange={(e) => { const caps = { ...c.caps }; if (e.target.value === "") delete caps[id]; else caps[id] = +e.target.value; set({ caps }); }} /></label>
          ))}
        </div>
      </Section>

      <button className="reset" onClick={() => { p.set(sourced2(p.inputs)); p.setPreset("today"); }}><RotateCcw size={13} /> Reset to the generated values</button>
    </aside>
  );
}

export function LayersPanel2({ layers, set, close }: { layers: Layers2; set: (l: Layers2) => void; close: () => void }) {
  const rows: [keyof Layers2, string, string][] = [
    ["zones", "Drainage zones", "Generated zones, coloured by band in the storm"],
    ["labels", "Labels and gauges", "Zone tags with the change from today; pond fill gauges in the storm"],
    ["flow", "Flow", "Drains running downhill and each zone's flow to its outlet, in the storm"],
    ["boundary", "Council boundary", "OSM admin line (not cadastral) and where drains cross it"],
    ["records", "JPS flood records", "Place, year and type, at the mapped spot"],
    ["reports", "Resident reports", "Open reports from the resident door inside this site"],
    ["basemap", "Street map", "OpenStreetMap, dimmed"],
  ];
  return (
    <aside className="panel panel-left layers">
      <div className="panel-head"><span>LAYERS</span><button className="x" onClick={close} aria-label="Close">×</button></div>
      {rows.map(([k, label, help]) => (
        <label key={k} className="layer-row">
          <input type="checkbox" checked={layers[k]} onChange={(e) => set({ ...layers, [k]: e.target.checked })} />
          <span className="sw" /><span><b>{label}</b><small>{help}</small></span>
        </label>
      ))}
    </aside>
  );
}

export function SiteInfoPanel(p: { pack: Pack; inputs: any; sc: any; tab: Tab2; setTab: (t: Tab2) => void; upload: UploadResult | null;
                                   setUpload: (u: UploadResult | null) => void; liveError: string | null; setPick: (x: Pick2) => void; close: () => void }) {
  const m = metricsOf(p.pack.site, p.inputs, p.sc);
  return (
    <aside className="panel panel-left pf-info" data-spot="site-panel">
      <div className="panel-head"><span>SITE</span><button className="x" onClick={p.close} aria-label="Close">×</button></div>
      <div className="pf-tabs">
        {(["overview", "boundary", "inputs", "upload"] as Tab2[]).map((t) => (
          <button key={t} className={p.tab === t ? "on" : ""} onClick={() => p.setTab(t)} data-spot={`tab-${t}`}>
            {t === "overview" ? "Site" : t === "boundary" ? "Boundary" : t === "inputs" ? "Inputs" : "Upload"}
          </button>
        ))}
      </div>
      <div className="pf-body">
        {p.tab === "overview" && <Overview pack={p.pack} m={m} sc={p.sc} />}
        {p.tab === "boundary" && <Boundary inputs={p.inputs} sc={p.sc} setPick={p.setPick} />}
        {p.tab === "inputs" && <Inputs inputs={p.inputs} site={p.pack.site} />}
        {p.tab === "upload" && <UploadPanel pack={p.pack} upload={p.upload} setUpload={p.setUpload} liveError={p.liveError} />}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------------------------- results
function Delta({ r }: { r: number | null | undefined }) {
  if (r === null || r === undefined) return null;
  const v = Math.round((r - 1) * 100);
  return <span className={`delta ${v > 0 ? "up" : v < 0 ? "down" : ""}`}>{v === 0 ? "= today" : `${v > 0 ? "▲" : "▼"} ${Math.abs(v)} % vs today`}</span>;
}
function Bar({ v, max, mark, color }: { v: number; max: number; mark?: number; color: string }) {
  return <div className="bar"><i style={{ transform: `scaleX(${Math.min(1, v / max)})`, background: color }} />
    {mark !== undefined && <em style={{ left: `${Math.min(100, (mark / max) * 100)}%` }} />}</div>;
}

export function Results2(p: { inputs: any; sc: any; now: any; name: string; c: C2; storm: number }) {
  const [open, setOpen] = useState(false);       // phones: a one-line summary until tapped
  const sc = p.sc, h = headline(sc), hNow = headline(p.now);
  const ponds = Object.entries<any>(sc.ponds).filter(([, q]) => q.ratio !== null && q.storage_required_m3 > 0).sort((a, b) => b[1].ratio - a[1].ratio).slice(0, 3);
  const top = Math.max(1, ...ponds.flatMap(([, q]) => [q.storage_required_m3, q.capacity_m3 ?? 0]));
  const [did, d] = h.worstDrain ?? [null, null];
  const dc = d ? (d.ratio >= 1 ? BAND_COLOR.high : d.ratio >= 0.8 ? BAND_COLOR.medium : "#35d0e6") : "#35d0e6";
  const w = sc.what_if_ponds?.W1;
  const cross = sc.crossings.reduce((a: number, x: any) => a + x.flow_m3_s, 0);
  return (
    <aside className={`panel panel-right results ${open ? "open" : ""}`} data-spot="results">
      <button className="res-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{p.name}</span><b>Gap {m3(h.gap)} · {h.drainsOver}/{h.drains} drains over</b><i>{open ? "Less" : "More"}</i>
      </button>
      <div className="panel-head"><span>SCREENING RESULT</span><em>{p.storm > 0.5 ? "STORM" : "CLEAR DAY"}</em></div>
      <div className="res-scen">{p.name}</div>
      <div className="res-storm">{p.c.ari}-year · {sc.duration_h}-hour design storm · {fmt(sc.intensity_mm_hr, 1)} mm/h</div>
      <div className="res-row" data-spot="res-gap">
        <div className="res-k">STORAGE GAP · ALL PONDS</div>
        <div className="res-v"><b style={{ color: h.gap > 0 ? BAND_COLOR.high : BAND_COLOR.low }}>{m3(h.gap)}</b>
          {hNow.gap ? <Delta r={h.gap / hNow.gap} /> : null}</div>
        <div className="res-sub">Storage required beyond capacity, summed over the ponds that fall short (capacities assumed, L, unless stated)</div>
      </div>
      {ponds.map(([id, q]) => (
        <div className="res-row" key={id} data-spot={`res-${id}`}>
          <div className="res-k">{nameOf(p.inputs, id).toUpperCase().slice(0, 34)} · STORAGE</div>
          <div className="res-v"><b>{m3(q.storage_required_m3)}</b><Delta r={q.change_vs_now} /></div>
          <Bar v={q.storage_required_m3} max={top * 1.08} mark={q.capacity_m3 ?? undefined} color={q.ratio >= 1 ? BAND_COLOR.high : "#3aa0ff"} />
          <div className="res-sub">{pct(q.ratio)} of its {p.inputs.ponds[id]?.capacity_m3?.status === "planner input" || p.c.caps[id] ? "stated" : "assumed (L)"} capacity · releases {q.released_m3 < 1 ? "nothing" : m3(q.released_m3)} during the storm</div>
        </div>
      ))}
      {d && (
        <div className="res-row" data-spot="res-drain">
          <div className="res-k">MOST LOADED DRAIN · {nameOf(p.inputs, did!).toUpperCase().slice(0, 26)}</div>
          <div className="res-v"><b style={{ color: dc }}>{pct(d.ratio)}</b><Delta r={d.change_vs_now} /></div>
          <Bar v={d.direct_demand_m3_s} max={Math.max(d.capacity_m3_s, d.direct_demand_m3_s) * 1.15} mark={d.capacity_m3_s} color={dc} />
          <div className="res-sub">{fmt(d.direct_demand_m3_s, 1)} of {fmt(d.capacity_m3_s, 1)} m³/s · marker = assumed capacity{d.blockage > 0 && `, ${Math.round(d.blockage * 100)} % blocked`} · {h.drainsOver} of {h.drains} drains over</div>
        </div>
      )}
      <div className="res-row" data-spot="res-cross">
        <div className="res-k">ACROSS COUNCIL LINES</div>
        <div className="res-v"><b className="cyan-t">{fmt(cross, 1)} m³/s</b><span className="delta">{sc.crossings.length} links</span></div>
        <div className="res-sub">Peak flow leaving one council's side into another's drains and ponds. A difference, not a blame</div>
      </div>
      {w && (
        <div className="res-row" data-spot="res-whatif">
          <div className="res-k">NEW RETROFIT POND (WHAT-IF)</div>
          <div className="res-v"><b>{m3(Math.min(w.storage_required_m3, w.capacity_m3 ?? Infinity))}</b><span className="delta down">held</span></div>
          <div className="res-sub">of {m3(w.capacity_m3 ?? 0)} · catches {p.inputs.what_if_ponds.W1.serves.join(", ")}</div>
        </div>
      )}
      <div className="res-foot">Screening estimate, MSMA 2 method, on mostly assumed inputs. Not a design, not a forecast. No depths.</div>
    </aside>
  );
}

// ---------------------------------------------------------------------------------------------- footer, ticker
export function Legend2({ storm, changed }: { storm: number; changed: boolean }) {
  if (storm < 0.5) return <span className="lg-note">Mapped: drains, ponds, council line (OSM) · generated: zones and outlets</span>;
  const items = [["low", "room to spare"], ["medium", "nearly full"], ["high", "not enough room"], ["unknown", "outlet unknown"], ["river", "drains to a river"]];
  return <>
    <span className="lg-note" title="No pond capacity is public: mapped water area × 1.5 m, confidence L. Not flood depths.">On assumed capacities (L):</span>
    {items.map(([b, t]) => <span key={b} className="lg"><i style={{ background: BAND_COLOR[b] }} />{t}</span>)}
    <span className="lg"><i style={{ background: "#e3b341" }} />flow across a council line</span>
    {changed && <span className="lg-note">▲▼ change from today</span>}
  </>;
}

export function Footer2(p: { ll: [number, number] | null; zone: string | null; zoneTo?: string; legend: ReactNode }) {
  return (
    <div className="footer">
      <div className="ft-cursor">
        <span>CURSOR</span><b>{p.ll ? `${p.ll[0].toFixed(4)} N, ${p.ll[1].toFixed(4)} E` : "—"}</b>
        <span>ZONE</span><b>{p.zone ? `${p.zone}${p.zoneTo ? ` → ${p.zoneTo}` : ""}` : "—"}</b>
      </div>
      <div className="ft-legend">{p.legend}</div>
      <div className="ft-right"><span className="live"><i />LIVE COMPUTE</span></div>
    </div>
  );
}

export function Ticker2({ pack }: { pack: Pack }) {
  const s = pack.site;
  const recs = s.evidence.flood_records.slice().reverse().slice(0, 8).map((f) => ["JPS", `${f.place}: ${f.type === "Not stated" ? "flood" : f.type.toLowerCase()}`, String(f.year)]);
  const items = [
    ...recs,
    ["SITE", `${s.evidence.flood_records.length} JPS flood records inside the area`, "JPS Selangor GIS"],
    ["METHOD", "MSMA 2nd Edition (DID Malaysia, 2012): Rational Method, IDF Eq. 2.2, Table 2.5 runoff coefficients", "DID"],
    ["DATA", "Map data © OpenStreetMap contributors (ODbL) · Terrain: Copernicus DEM GLO-30 · Pond list: JPS Selangor", "open data"],
  ];
  const all = [...items, ...items];
  return (
    <div className="ticker" aria-label="Evidence feed">
      <div className="ticker-label">EVIDENCE</div>
      <div className="ticker-track"><div className="ticker-run">
        {all.map(([k, t, src], i) => <span key={i} className="tick"><i />{k}<b>{t}</b><em>{src}</em></span>)}
      </div></div>
    </div>
  );
}

export function useStateTab() { return useState<Tab2>("overview"); }
