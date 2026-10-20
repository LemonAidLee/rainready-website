// Resident door (concept features 5 and 6): clickable mock-ups only. Everything shown is an EXAMPLE: no real reports,
// no real people, no invented phone numbers or dates. The move-now card builds on official warnings and links to them.
import { useState } from "react";
import { ArrowLeft, MapPin } from "lucide-react";
import { Wordmark } from "./Shell";

type Msg = { me?: boolean; text: string; small?: string };
const STEPS: { msgs: Msg[]; replies: string[] }[] = [
  { msgs: [{ text: "Hi! This is the RainReady line for your residents' association. What would you like to report?" }],
    replies: ["Blocked drain", "Flooded street"] },
  { msgs: [{ me: true, text: "Blocked drain" }, { text: "Thanks. Please share a photo and your location (or the street name)." }],
    replies: ["📷 Photo + 📍 location"] },
  { msgs: [{ me: true, text: "📷 photo · 📍 Spot 1 street", small: "example" },
           { text: "Got it. Your association's volunteer will check it, then it goes to the official channel for this drain with a link. Reference RR-EXAMPLE.", small: "status: received" }],
    replies: ["Track my report"] },
  { msgs: [{ me: true, text: "Track my report" },
           { text: "RR-EXAMPLE · ✅ received · ✅ checked by association · ⏳ forwarded to the official channel · it also appears as a pin in the planner view.", small: "example status" }],
    replies: ["Start again"] },
];

function Chat() {
  const [step, setStep] = useState(0);
  const msgs = STEPS.slice(0, step + 1).flatMap((s) => s.msgs);
  return (
    <div className="phone" data-spot="phone-report"><div className="screen">
      <div className="bar"><span>Residents' association · RainReady</span><span className="example">EXAMPLE</span></div>
      <div className="msgs">{msgs.map((m, i) => <div key={i} className={`msg ${m.me ? "me" : ""}`}>{m.text}{m.small && <small>{m.small}</small>}</div>)}</div>
      <div className="replies">{STEPS[step].replies.map((r) => (
        <button key={r} onClick={() => setStep(step + 1 < STEPS.length ? step + 1 : 0)}>{r}</button>
      ))}</div>
    </div></div>
  );
}

function MoveNow() {
  const [done, setDone] = useState<number[]>([]);
  const items = ["Move the car to the example higher-ground spot", "Lift valuables and documents off the floor", "Switch off the mains if water may enter", "Check on neighbours who may need help"];
  return (
    <div className="phone" data-spot="phone-move"><div className="screen">
      <div className="bar"><span>Move-now plan · Spot 1 street</span><span className="example">EXAMPLE</span></div>
      <div className="msgs">
        <div className="msg" style={{ maxWidth: "100%" }}>
          <b>An official flood warning covers your area.</b> This plan only builds on it, and it is not a forecast.
          Always follow the official warning and the authorities.
          <small><a href="https://publicinfobanjir.water.gov.my/" target="_blank" rel="noreferrer">Open the official warning: Public Infobanjir (JPS)</a> · <a href="https://www.met.gov.my/" target="_blank" rel="noreferrer">METMalaysia</a></small>
        </div>
        {items.map((t, i) => (
          <button key={t} className="msg" style={{ maxWidth: "100%", textAlign: "left", border: 0, cursor: "pointer", opacity: done.includes(i) ? 0.55 : 1 }}
            onClick={() => setDone(done.includes(i) ? done.filter((d) => d !== i) : [...done, i])}>
            {done.includes(i) ? "☑" : "☐"} {t}
          </button>
        ))}
        <div className="msg" style={{ maxWidth: "100%" }}><MapPin size={13} style={{ verticalAlign: -2 }} /> Higher-ground spot: an <b>example</b> spot from the terrain model, until an owner agrees to it.</div>
      </div>
    </div></div>
  );
}

export function Resident() {
  return (
    <div className="page">
      <header>
        <Wordmark />
        <a className="text-btn" href="#/"><ArrowLeft size={16} /> Planner view</a>
      </header>
      <span className="pill">Clickable mock-up · example data</span>
      <h1>The resident door</h1>
      <p>Residents report through the messaging they already use, with no app to install. Their association checks each
        report and forwards it to the existing official channel for that asset, with a link; RainReady does not replace
        that channel. On an official warning, residents get a short move-now plan for their street that links back to
        the warning. Their reports appear as pins in the planner view and shape the next plan.</p>
      <div className="phones" style={{ marginTop: 20 }}><Chat /><MoveNow /></div>
    </div>
  );
}
