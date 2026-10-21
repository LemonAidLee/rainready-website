// Recovery (#/after): "after a flood, who helps and who pays?", in plain words with a picture per part
// (research/AFTER_THE_FLOOD.md). Who holds a duty under the published rules, never who is to blame. Relief is not
// compensation; compensation comes from a court. Not legal advice. Every figure is sourced; none is an example.
import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Camera, Car, ClipboardList, ExternalLink, Gavel, HandCoins, Megaphone, ShieldAlert, ShieldCheck,
         Siren, Tent, Users, Wallet, Waves, Wrench } from "lucide-react";
import { AFTER_STAGES, RECORD, RESIDENT_STEPS, SRI_MUDA } from "../lib/evidence";
import { Wordmark } from "./Shell";
import { HolderChip, Reveal, useReveal, useTips, type Holder } from "./Viz";

const Src = ({ s }: { s: { label: string; url?: string }[] }) => (
  <span className="src">Source: {s.map((x, i) => (
    <span key={i}>{i > 0 && " · "}{x.url ? <a href={x.url} target="_blank" rel="noreferrer">{x.label} <ExternalLink size={10} /></a> : x.label}</span>
  ))}</span>
);

const STAGE_ICON: Record<string, ReactNode> = {
  Before: <Wrench size={20} />, Warning: <Siren size={20} />, During: <Tent size={20} />, "Right after": <HandCoins size={20} />,
  Claims: <ShieldCheck size={20} />, Compensation: <Gavel size={20} />,
};
const STAGE_SHORT: Record<string, string> = {
  Before: "Keep drains and ponds working", Warning: "Official warnings go out", During: "Evacuation and relief centres",
  "Right after": "Cash relief", Claims: "Insurance, if you have flood cover", Compensation: "Only through a court",
};

/** The six stages as a stepper: one short line each; tap a stage for who, what and the source. */
function Timeline() {
  const [i, setI] = useState(0);
  const s = AFTER_STAGES[i];
  return (
    <div className="tl" data-spot="after-stages">
      <div className="tl-rail" role="tablist">
        {AFTER_STAGES.map((st, k) => (
          <button key={st.when} role="tab" aria-selected={k === i} className={`tl-node ${k === i ? "on" : ""} ${k < i ? "done" : ""}`} onClick={() => setI(k)}>
            <span className="tl-dot">{STAGE_ICON[st.when]}</span>
            <b>{st.when}</b><small>{STAGE_SHORT[st.when]}</small>
          </button>
        ))}
      </div>
      <div className="tl-card" role="tabpanel">
        <div className="tl-who"><span>Who</span>{s.who} <span className="conf">{s.conf}</span></div>
        <p>{s.what}{s.verify && <> <span className="verify">[verify] {s.verify}</span></>}</p>
        <Src s={s.source} />
        <div className="tl-nav">
          <button className="text-btn" disabled={i === 0} onClick={() => setI(i - 1)}><ArrowLeft size={14} /> Back</button>
          <button className="text-btn" disabled={i === AFTER_STAGES.length - 1} onClick={() => setI(i + 1)}>Next stage <ArrowRight size={14} /></button>
        </div>
      </div>
    </div>
  );
}

/** A stat drawn as a row of icons: `on` of `n` filled. */
function Pictogram({ n, on, icon, label }: { n: number; on: number; icon: ReactNode; label: string }) {
  return (
    <div className="picto" role="img" aria-label={label}>
      {Array.from({ length: n }, (_, k) => <span key={k} className={k < on ? "on" : ""}>{icon}</span>)}
    </div>
  );
}

/** Selangor's flood aid after the late-2025 floods, families paid by district (Selangor Journal, 21 Feb 2026). */
const AID = [
  { d: "Klang", n: 23450, hi: true }, { d: "Petaling", n: 16917 }, { d: "Kuala Langat", n: 10282 },
  { d: "Other districts", n: 72451 - 23450 - 16917 - 10282 },
];
function AidChart() {
  const max = Math.max(...AID.map((a) => a.n));
  const ref = useReveal<HTMLDivElement>();
  const tips = useTips();
  return (
    <div className="aid" ref={(el) => { (ref as any).current = el; (tips.box as any).current = el; }}>
      {AID.map((a) => (
        <div key={a.d} className="aid-row" {...tips.tip(<><b>{a.d}</b><br />{a.n.toLocaleString("en-GB")} families paid RM1,000<br />{Math.round((a.n / 72451) * 100)} % of all families paid</>)}>
          <span className="aid-d">{a.d}</span>
          <span className="aid-track"><i className={`grow ${a.hi ? "hi" : ""}`} style={{ ["--v" as any]: a.n / max }} /></span>
          <span className="aid-n">{a.n.toLocaleString("en-GB")}</span>
        </div>
      ))}
      {tips.layer}
    </div>
  );
}

/** Bukit Raja's drains and ponds, drawn as a simple map (not to scale), coloured by who holds each one. */
function HolderMap() {
  const tips = useTips();
  const g = (_h: string, body: ReactNode, tip: ReactNode) => <g className="hm-g" {...tips.tip(tip)}>{body}</g>;
  const rec = (id: string) => RECORD.find((r) => r.id === id)!;
  const t = (id: string) => <><b>{rec(id).asset}</b><br />{rec(id).who}<br />Confidence {rec(id).conf}</>;
  return (
    <div className="hm" ref={tips.box} data-spot="after-record">
      <svg viewBox="0 0 480 330" role="img" aria-label="A simple map of Bukit Raja's ponds and drains coloured by who looks after each one">
        <text x="160" y="18" className="hm-area" textAnchor="middle">KLANG SIDE · Bukit Raja</text>
        <text x="412" y="18" className="hm-area" textAnchor="middle">SHAH ALAM SIDE</text>
        <line x1="345" y1="26" x2="345" y2="322" className="hm-council" />
        <text x="350" y="318" className="hm-small">council line</text>
        {g("JPS", <><line x1="40" y1="34" x2="40" y2="300" className="hm-line h-JPS" /><text x="48" y="150" className="hm-lab" transform="rotate(-90 48 150)" textAnchor="middle">Main ditch</text></>, t("main_ditch"))}
        {g("MBDK", <><line x1="40" y1="70" x2="345" y2="70" className="hm-line hm-thick h-MBDK" /><text x="190" y="60" className="hm-lab" textAnchor="middle">Shared drain</text></>, t("trunk_drain"))}
        {g("MBSA", <><line x1="462" y1="34" x2="345" y2="70" className="hm-line h-MBSA" /><text x="408" y="88" className="hm-lab" textAnchor="middle">Crossing drain</text></>, t("crossing"))}
        {g("unsettled", <><rect x="96" y="112" width="100" height="62" rx="10" className="hm-pond" /><text x="146" y="139" className="hm-lab" textAnchor="middle">Pond A</text><text x="146" y="157" className="hm-small" textAnchor="middle">not settled</text></>, t("pond_A"))}
        {g("unsettled", <><rect x="214" y="112" width="100" height="62" rx="10" className="hm-pond" /><text x="264" y="139" className="hm-lab" textAnchor="middle">Pond B</text><text x="264" y="157" className="hm-small" textAnchor="middle">not settled</text></>, t("pond_B"))}
        <line x1="146" y1="112" x2="146" y2="76" className="hm-flow" /><line x1="264" y1="112" x2="264" y2="76" className="hm-flow" />
        {g("MBDK", <>{[205, 225, 245].map((y) => <line key={y} x1="80" y1={y} x2="320" y2={y} className="hm-street h-MBDK" />)}<text x="200" y="268" className="hm-lab" textAnchor="middle">Street drains (Klang side)</text></>, t("street"))}
        {g("MBSA", <>{[150, 175, 200].map((y) => <line key={y} x1="362" y1={y} x2="462" y2={y} className="hm-street h-MBSA" />)}<text x="412" y="228" className="hm-lab" textAnchor="middle">Street drains</text><text x="412" y="243" className="hm-small" textAnchor="middle">(Shah Alam side)</text></>, t("street"))}
        {g("JPS", <><path d="M40 300 C 90 290, 130 312, 180 300 S 270 290, 330 302" className="hm-line h-JPS" fill="none" /><text x="190" y="324" className="hm-lab" textAnchor="middle">Sungai Keramat (river)</text></>, t("river"))}
      </svg>
      <div className="hm-legend">
        {(["MBDK", "MBSA", "JPS", "unsettled"] as Holder[]).map((h) => <HolderChip key={h} h={h} />)}
      </div>
      <p className="note">A simple picture, not to scale. Tap a drain or pond for the rule behind it. Who looks after it, never who is to blame.</p>
      {tips.layer}
    </div>
  );
}

export function After() {
  return (
    <div className="page recovery">
      <header>
        <Wordmark />
        <a className="text-btn noprint" href="#/planner"><ArrowLeft size={16} /> Planner view</a>
      </header>
      <div className="eyebrow"><span className="pill">Who holds the duty, not who is to blame</span><span className="kicker">Not legal advice</span></div>
      <h1>After a flood: who helps, who pays</h1>
      <p className="lead">Relief, insurance and the courts in plain words, and what it means for Bukit Raja.</p>

      <Reveal className="keys" spot="after-keys">
        <div className="key"><Wallet size={22} /><b>No one pays automatically</b><span>What arrives on its own is relief, not compensation for what you lost.</span></div>
        <div className="key"><ShieldAlert size={22} /><b>Insurance, only with flood cover</b><span>Most homes and cars in Malaysia are not covered for flood.</span></div>
        <div className="key"><HandCoins size={22} /><b>RM1,000 + RM1,000 relief</b><span>Per household from the federal government, and per family from Selangor after the late-2025 floods.</span></div>
        <div className="key"><Gavel size={22} /><b>A court decides compensation</b><span>In Sept 2026 a court held public authorities liable for a Selangor flood. Not final.</span></div>
      </Reveal>

      <section className="chapter">
        <h2><i>1</i> What happens, step by step</h2>
        <p>Tap a stage to see who is in charge and what they do.</p>
        <Timeline />
      </section>

      <section className="chapter">
        <h2><i>2</i> The money: relief is small, and most losses are not insured</h2>
        <div className="money">
          <Reveal className="stat">
            <Pictogram n={3} on={2} icon={<Wallet size={30} />} label="About 2 in 3 ringgit lost were not insured" /><small className="picto-key">filled = not insured</small>
            <b>About 2 in every 3 ringgit</b><span>lost in the 2021 floods was not insured.</span>
            <Src s={[{ label: "Bank Negara Malaysia, via Insurance Business" }]} />
          </Reveal>
          <Reveal className="stat">
            <Pictogram n={9} on={1} icon={<Car size={20} />} label="About 1 in 9 cars covered" /><small className="picto-key">filled = covered for flood</small>
            <b>About 1 in 9 cars</b><span>of one insurer's customers had flood cover (the "special perils" add-on).</span>
            <Src s={[{ label: "NST, 2022", url: "https://nst.com.my/amp/news-cars-bikes-trucks/2022/11/846045/motorists-still-not-insured-against-flood" }]} />
          </Reveal>
        </div>
        <h3 className="sub-h">Selangor's flood aid reached 72,451 families. Klang had the most.</h3>
        <p className="note">Families paid RM1,000 under Bantuan Selangor Bangkit after the late-2025 floods, by district, as of 21 Feb 2026.
          District counts differ slightly between reports.</p>
        <AidChart />
        <Src s={[{ label: "Selangor Journal, 21 Feb 2026", url: "https://selangorjournal.my/?p=263857" }]} />
      </section>

      <section className="chapter">
        <h2><i>3</i> At Bukit Raja: who looks after each drain and pond</h2>
        <p>If one of these fails, this is who holds the duty under Selangor's published rules. The two ponds are not
          settled on public record: it depends on whether the developer has handed them over.</p>
        <HolderMap />
      </section>

      <section className="chapter" data-spot="after-ruling">
        <h2><i>4</i> A court case that matters: Taman Sri Muda</h2>
        <p>Residents of Taman Sri Muda, Shah Alam, sued after the December 2021 flood. In September 2026 the High Court
          agreed with them. <b>It is not final.</b></p>
        <Reveal className="case">
          <ol className="case-tl">
            <li><b>Dec 2021</b><span>Flood at Taman Sri Muda</span></li>
            <li><b>2022</b><span>50 residents sue</span></li>
            <li className="hit"><b>29 Sep 2026</b><span>High Court: the authorities are liable</span></li>
            <li className="next"><b>Next</b><span>Damages hearing; an appeal is possible</span></li>
          </ol>
          <div className="found">
            <div><Wrench size={20} /><b>The council</b><span>must keep local drains clear and repaired, even where JPS owns the main flood works</span></div>
            <div><Waves size={20} /><b>JPS</b><span>must run and maintain the flood works it controls</span></div>
            <div><Siren size={20} /><b>NADMA and MET</b><span>must warn people and respond properly</span></div>
          </div>
          <p className="case-chip"><span>"Act of God" defence rejected</span> Heavy rain was not an excuse where people could have acted.</p>
          <p className="note">{SRI_MUDA.limits} <span className="verify">[verify] appeal and damages</span></p>
          <Src s={SRI_MUDA.sources} />
        </Reveal>
      </section>

      <section className="chapter" data-spot="after-steps">
        <h2><i>5</i> What you can do, in order</h2>
        <Reveal className="rsteps">
          {RESIDENT_STEPS.map((s, k) => (
            <div key={s.t} className="rstep">
              <span className="rstep-n">{k + 1}</span>
              {[<Camera size={20} />, <ClipboardList size={20} />, <ShieldCheck size={20} />, <Megaphone size={20} />, <Users size={20} />][k]}
              <b>{s.t}</b><span>{s.d}</span>
            </div>
          ))}
        </Reveal>
      </section>

      <a className="teaser" href="#/brief">
        <ShieldCheck size={22} />
        <span><b>Where RainReady fits</b><small>It never decides fault. It keeps one shared, dated picture of who holds each drain and pond, where storage falls short, and what residents report: see the Findings.</small></span>
        <ArrowRight size={18} />
      </a>
      <p className="note">Sources and confidence for every line: research note "After the Water" (21 Oct 2026). Not legal advice; the
        Sri Muda ruling is read from press reports of the judgment.</p>
    </div>
  );
}
