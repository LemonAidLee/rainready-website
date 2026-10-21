// "Does the screening match the ground?" and "the two assumptions it rests on": shown in the About drawer and the
// Brief from the same lists (lib/evidence.ts), misses included.
import { Check, X } from "lucide-react";
import { ASSUMPTION_CHECKS, CHECKS } from "../lib/evidence";

export function GroundChecks() {
  return (
    <ul className="checks">
      {CHECKS.map((c) => (
        <li key={c.what} className={c.ok ? "ok" : "miss"}>
          <i>{c.ok ? <Check size={13} /> : <X size={13} />}</i>
          <div><b>{c.what}</b> <span className="conf">{c.conf}</span><br />{c.finding}</div>
        </li>
      ))}
    </ul>
  );
}

export function AssumptionChecks() {
  return (
    <table className="t">
      <thead><tr><th>Assumption</th><th>Used</th><th>What the evidence says</th><th>Does the finding hold?</th><th>Conf.</th></tr></thead>
      <tbody>{ASSUMPTION_CHECKS.map((a) => (
        <tr key={a.what}><td>{a.what}</td><td className="num">{a.used}</td><td>{a.evidence}</td><td>{a.holds}</td><td><span className="conf">{a.conf}</span></td></tr>
      ))}</tbody>
    </table>
  );
}
