// The site's front door (22 Oct 2026): platform pages (#/sites, #/site/<id>) render on their own, outside the BBR
// app, so the 3D planner, the Brief and the guided demo stay exactly as they were. #/site/bbr opens the 3D planner.
import { useEffect, useState } from "react";
import App from "../App";
import { Portfolio } from "./Portfolio";
import { SiteApp } from "./SiteApp";
import "./platform.css";

function useHash() {
  const [h, setH] = useState(location.hash);
  useEffect(() => { const f = () => setH(location.hash); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  return h.replace(/^#\/?/, "").split("?")[0];
}

export default function Root() {
  const route = useHash();
  if (route === "site/bbr") { location.replace("#/planner"); return null; }
  if (route === "sites") return <Portfolio />;
  if (route.startsWith("site/")) {
    const [id, sub] = route.slice(5).split("/");
    return <SiteApp key={id} id={id} page={sub === "findings" ? "findings" : "map"} tourStart={sub === "tour"} />;
  }
  return <App />;
}
