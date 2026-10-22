// The portfolio (#/sites, 22 Oct 2026): every site in the registry on one page, ranked by storage gap, then by flow
// across council lines. From public/sites/index.json (simulations/platform/build_index.py). A screening comparison
// on mostly assumed inputs, never a verdict on a site; each row opens that site's own view.
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Box, Map as MapIcon } from "lucide-react";
import { Wordmark } from "../ui/Shell";
import { fmt, loadIndex, type SiteEntry } from "./data";

export function Portfolio() {
  const [sites, setSites] = useState<SiteEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<"now" | "upstream">("now");
  useEffect(() => { loadIndex().then(setSites).catch((e) => setError(String(e))); }, []);
  if (error) return <div className="loading">Could not load the sites: {error}</div>;
  if (!sites) return <div className="loading"><div className="loader" />LOADING THE SITES</div>;
  const ranked = [...sites].sort((a, b) => {
    const ma = a.metrics[scenario] ?? a.metrics.now, mb = b.metrics[scenario] ?? b.metrics.now;
    return mb.storage_gap_m3 - ma.storage_gap_m3 || mb.crossing_flow_m3_s - ma.crossing_flow_m3_s;
  });
  const href = (s: SiteEntry) => (s.view === "3d" && s.route ? s.route : `#/site/${s.id}`);

  return (
    <div className="pf-page">
      <header className="statusbar">
        <div className="sb-left">
          <Wordmark />
          <div className="sb-context">PORTFOLIO · {sites.length} SITES · ONE METHOD · RANKED BY STORAGE GAP, THEN FLOW ACROSS COUNCIL LINES</div>
        </div>
        <div className="sb-right">
          <div className="readout"><span>SCENARIO</span><b className="cyan">{scenario === "now" ? "TODAY" : "OPEN LAND BUILT OUT"}</b></div>
          <a className="btn-gold" href="#/"><ArrowLeft size={14} /> MALAYSIA MAP</a>
        </div>
      </header>
      <main className="pf-port">
        <div className="pf-port-head">
          <div>
            <h1>Every township, one picture</h1>
            <p>Each site is a data folder screened by the same engine (MSMA 2, Rational Method and a volume balance over its drain network). Bandar Bukit Raja is hand-built in 3D; the others are generated from open data in seconds and carry lower confidence until their owners upload stated capacities and drain sizes.</p>
          </div>
          <div className="pf-seg">
            <button className={scenario === "now" ? "on" : ""} onClick={() => setScenario("now")}>Today</button>
            <button className={scenario === "upstream" ? "on" : ""} onClick={() => setScenario("upstream")}>Open land built out</button>
          </div>
        </div>
        <table className="pf-table pf-rank">
          <thead>
            <tr><th>#</th><th>Site</th><th className="r">Storage gap</th><th className="r">Ponds over</th><th className="r">Drains over</th>
              <th className="r">Council crossings</th><th className="r">Area not enough room</th><th className="r">JPS flood records</th><th>Confidence</th><th /></tr>
          </thead>
          <tbody>
            {ranked.map((s, i) => {
              const m = s.metrics[scenario] ?? s.metrics.now;
              return (
                <tr key={s.id} onClick={() => { location.hash = href(s); }}>
                  <td className="rank">{i + 1}</td>
                  <td><b>{s.name}</b><small>{s.view === "3d" ? <><Box size={11} /> 3D model, curated</> : <><MapIcon size={11} /> 2D, generated from open data</>} · {s.councils.length} councils</small></td>
                  <td className={`r ${m.storage_gap_m3 > 0 ? "red" : "green"}`}>{fmt(m.storage_gap_m3)} m³</td>
                  <td className="r">{m.ponds_over} / {m.ponds}</td>
                  <td className="r">{m.drains_over} / {m.drains}</td>
                  <td className="r">{m.crossings} · {fmt(m.crossing_flow_m3_s, 1)} m³/s</td>
                  <td className="r">{fmt(m.area_high_ha)} of {fmt(m.area_ha)} ha</td>
                  <td className="r">{s.flood_records}</td>
                  <td><span className={`pf-conf c-${s.confidence}`}>{s.confidence}</span></td>
                  <td><a className="pf-open" href={href(s)}>Open <ArrowRight size={12} /></a></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="pf-port-notes">
          <p><b>How to read it.</b> Storage gap: storage required in a 100-year storm minus pond capacity, summed over ponds that fall short. Capacities are stated where a planner entered them, otherwise assumed (water area × 1.5 m, L). Crossings: links where water from one council's side drains into a drain or pond on another's. Generated sites use typical drain sizes by type, the weakest input.</p>
          <p><b>Adding a site.</b> <code>python build_site.py &lt;id&gt; "&lt;name&gt;" &lt;south&gt; &lt;west&gt; &lt;north&gt; &lt;east&gt;</code>, then <code>python build_index.py</code>. No code changes: the registry lists it here and on the Malaysia map.</p>
        </div>
      </main>
    </div>
  );
}
