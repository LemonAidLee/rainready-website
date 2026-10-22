// Scenario control: presets, then one slider per lever. The town is built, so the levers are named for decisions still
// being made: the next parcels upstream, the fixes on the table (a retrofit pond, drain works) and upkeep. Every lever names what it changes in the model ("Watch"),
// and each change re-runs screening.ts in the browser. Values that are not the sourced ones are flagged.
import { Building2, CloudRain, Eye, Gauge, Info, RotateCcw, Waves, Wrench } from "lucide-react";
import { Fragment, useMemo, type ReactNode } from "react";
import { ASSUMED_CAP, PRESET_GROUPS, PRESETS, applyPreset, presetSummary, sourcedControls, type Basis, type Controls,
         type Loaded } from "../lib/data";
import { num } from "../lib/format";
import { HoverTip } from "./HoverTip";

const ARIS = [2, 5, 10, 20, 50, 100];

function Slider(p: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string;
                     onChange: (v: number) => void; ticks?: [number, string][]; sourced?: number; spot?: string }) {
  const changed = p.sourced !== undefined && Math.abs(p.value - p.sourced) > 1e-9;
  const pct = ((p.value - p.min) / (p.max - p.min)) * 100;
  return (
    <div className="slider" data-spot={p.spot}>
      <div className="slider-top"><span>{p.label}</span><b className={changed ? "changed" : ""}>{p.fmt(p.value)}</b></div>
      <input type="range" min={p.min} max={p.max} step={p.step} value={p.value} style={{ ["--pct" as any]: `${pct}%` }}
        onChange={(e) => p.onChange(+e.target.value)} aria-label={p.label} />
      {p.ticks && <div className="ticks">{p.ticks.map(([v, t]) => (
        <button key={t} style={{ left: `${((v - p.min) / (p.max - p.min)) * 100}%` }} onClick={() => p.onChange(v)}>{t}</button>
      ))}</div>}
    </div>
  );
}

// The explanation and "what you will see" wait in a hover tip on the heading (team leader, 22 Oct 2026: less text at once)
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

export function ControlPanel(p: { data: Loaded; inputs: any; c: Controls; set: (c: Controls) => void; preset: string | null;
                                  setPreset: (id: string | null) => void; close: () => void }) {
  const s = sourcedControls(p.inputs), c = p.c;
  const summaries = useMemo(() => Object.fromEntries(PRESETS.map((pr) => [pr.id, presetSummary(p.data, pr)])), [p.data]);
  const set = (patch: Partial<Controls>) => { p.set({ ...c, ...patch }); p.setPreset(null); };
  return (
    <aside className="panel panel-left controls" data-spot="controls">
      <div className="panel-head"><span>SCENARIO CONTROL</span><button className="x" onClick={p.close} aria-label="Close">×</button></div>

      <div className="presets" data-spot="presets">
        {PRESETS.map((pr, i) => (
          <Fragment key={pr.id}>
            {pr.group !== PRESETS[i - 1]?.group && <div className={`preset-group g-${pr.group}`}>{PRESET_GROUPS[pr.group]}</div>}
            <HoverTip title={pr.label} tip={<><p>{pr.blurb}.</p><p className="tip-watch">{pr.show === "capacity"
                ? "Numbers: share of capacity used (ponds against assumed capacity, L)" : "Numbers: change from today"}</p></>}>
              <button className={`preset g-${pr.group} ${pr.wide ? "wide" : ""} ${p.preset === pr.id ? "on" : ""}`}
                onClick={() => { p.set(applyPreset(p.inputs, pr)); p.setPreset(pr.id); }}>
                <b>{pr.label}</b>
                <em>{summaries[pr.id]}</em>
              </button>
            </HoverTip>
          </Fragment>
        ))}
      </div>

      <Section n="01" icon={<Building2 size={14} />} title="Next parcels upstream" spot="dev" conf="what-if"
        watch="Blocks rise on the open land left in Area A and fill the area beyond the edge; the shared drain's load moves."
        note="The parcels not yet built, on either side of the line: what a before-you-build check tests. Area beyond the edge: no public catchment boundary, so 50 ha is a stated test value (L). C 0.90 = link and terrace housing, MSMA 2 Table 2.5, where peak control is not fully achieved.">
        <Slider label="Open land in Area A built" value={c.dev} min={0} max={1} step={0.05} sourced={0} spot="dev-slider"
          fmt={(v) => (v === 0 ? "Today" : `${Math.round(v * 100)} %`)} onChange={(v) => set({ dev: v })}
          ticks={[[0, "Today"], [0.5, "Half"], [1, "Built out"]]} />
        <Slider label="Area A beyond the model edge" value={c.extArea} min={0} max={300} step={10} sourced={s.extArea}
          fmt={(v) => `${v} ha`} onChange={(v) => set({ extArea: v })} />
        <Slider label="Runoff C when built" value={c.extC} min={0.65} max={0.95} step={0.01} sourced={s.extC}
          fmt={(v) => `${num(v, 2)}${Math.abs(v - 0.9) < 0.005 ? " · housing" : Math.abs(v - 0.95) < 0.005 ? " · commercial" : ""}`}
          onChange={(v) => set({ extC: v })} />
      </Section>

      <Section n="02" icon={<Waves size={14} />} title="New retrofit pond" spot="pond" conf="what-if"
        watch="The pond appears in zone Z06 and grows with its size; pond A's storage need drops."
        note="The kind of retrofit already funded nearby (e.g. the RM7.3m Taman Mutiara pond). The site and size here are a test, not a proposal.">
        <label className="toggle">
          <input type="checkbox" checked={c.pond} onChange={(e) => set({ pond: e.target.checked })} />
          <span className="sw" /><span>{c.pond ? "Pond added on OSM brownfield land (Z06)" : "No new pond"}</span>
        </label>
        <Slider label="Pond size" value={c.pondSize} min={5000} max={60000} step={1000} sourced={s.pondSize}
          fmt={(v) => `${num(v, 0)} m³`} onChange={(v) => set({ pondSize: v, pond: true })} />
      </Section>

      <Section n="03" icon={<Gauge size={14} />} title="Shared drain works" spot="drain" conf="L"
        watch="The drain ribbon widens; in the storm its colour shows the load (cyan, amber, red over capacity)."
        note="Widening stands for drain works, like the flood projects on Klang's urgent list. The biggest unknown: no public record gives this drain's size. It decides whether the ponds can release during the storm.">
        <Slider label="Top width (concrete trapezoid)" value={c.drainTopWidth} min={3} max={14} step={0.5} sourced={s.drainTopWidth}
          spot="drain-slider" fmt={(v) => `${num(v, 1)} m`} onChange={(v) => set({ drainTopWidth: v })}
          ticks={[[3, "3"], [6, "6 assumed"], [10, "10 main ditch"], [14, "14"]]} />
      </Section>

      <Section n="04" icon={<Wrench size={14} />} title="Keep it working" spot="upkeep" conf="what-if"
        watch="Zones turn red sooner: ponds have less room, and the drain carries less, so the ponds can release less."
        note="A built town still decides every year whether ponds are desilted and drains cleared. Neither share is measured anywhere public: these are what-ifs. Screening simplification: each cuts storage or carrying capacity in proportion. The storm is held the same as with a clear drain. Street drains are not modelled.">
        <Slider label="Pond storage lost (silt, weeds, blocked outlet)" value={c.silt} min={0} max={0.5} step={0.05} sourced={s.silt}
          spot="silt-slider" fmt={(v) => (v === 0 ? "None" : `${Math.round(v * 100)} %`)} onChange={(v) => set({ silt: v })}
          ticks={[[0, "As built"], [0.3, "30 %"], [0.5, "50 %"]]} />
        <Slider label="Shared drain blocked (silt, rubbish)" value={c.blocked} min={0} max={0.6} step={0.05} sourced={s.blocked}
          spot="blocked-slider" fmt={(v) => (v === 0 ? "Clear" : `${Math.round(v * 100)} %`)} onChange={(v) => set({ blocked: v })}
          ticks={[[0, "Clear"], [0.3, "30 %"], [0.6, "60 %"]]} />
      </Section>

      <Section n="05" icon={<CloudRain size={14} />} title="Design storm" spot="storm-sec" conf="H"
        watch="Rain density follows the intensity; every result is re-run at the new return period."
        note="MSMA 2 IDF, gauge 2913001 Telok Gong. 100 yr is the major-system standard for housing (Table 1.1); 10 yr is the minor system.">
        <div className="seg">
          {ARIS.map((a) => <button key={a} className={c.ari === a ? "on" : ""} onClick={() => set({ ari: a })}>{a} yr</button>)}
        </div>
      </Section>

      <Section n="06" icon={<Waves size={14} />} title="Stated pond capacity" spot="cap" conf="planner input"
        watch="Ponds fill to the share of capacity used; zones switch to capacity bands.">
        <div className="caps">
          {(["capA", "capB"] as const).map((k) => (
            <label key={k}><span>Pond {k.slice(-1)}</span>
              <input type="number" min={0} step={1000} placeholder="not public" value={c[k] ?? ""}
                onChange={(e) => set({ [k]: e.target.value === "" ? null : +e.target.value } as Partial<Controls>)} /></label>
          ))}
        </div>
        <button className="link" onClick={() => set({ capA: ASSUMED_CAP.pond_A, capB: ASSUMED_CAP.pond_B })}>
          Use the assumed capacities (mapped area × 1.5 m, L)</button>
      </Section>

      <button className="reset" onClick={() => { p.set(sourcedControls(p.inputs)); p.setPreset("today"); }}>
        <RotateCcw size={13} /> Reset to the sourced values</button>
    </aside>
  );
}
