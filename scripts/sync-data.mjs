// The copies are committed, so the site builds without the simulator folder (e.g. on Vercel).
// Copy the simulator's hand-off package into the site, so simulations/township-3d stays the one source of truth:
//   exports/{township.glb, trees.json, inputs.json, outputs.json, overlays.json} -> public/data/
//   data/zones.json -> public/data/zones_meta.json (ids, areas, routes, outlines; no triangles)
//   screening.ts (the TypeScript port, held equal to screening.py)  -> src/sim/screening.ts
//   three's Draco decoder                                           -> public/draco/
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, "..");
const sim = join(site, "..", "simulations", "township-3d");
if (!existsSync(sim)) {
  // e.g. on Vercel, which builds this folder alone: use the copies committed in public/data and src/sim
  console.log("simulator folder not found: using the committed data");
  process.exit(0);
}
mkdirSync(join(site, "public", "data"), { recursive: true });
mkdirSync(join(site, "src", "sim"), { recursive: true });
for (const f of ["township.glb", "trees.json", "inputs.json", "outputs.json", "overlays.json"]) cpSync(join(sim, "exports", f), join(site, "public", "data", f));
// zones.json carries every overlay triangle (4.5 MB); the site needs only ids, areas and routes
const zones = JSON.parse(readFileSync(join(sim, "data", "zones.json"), "utf-8")).zones
  .map(({ id, name, area_ha, drains_to, council, route, outline }) => ({ id, name, area_ha, drains_to, council, route,
    // outline (model metres, 0.1 m): lets the resident door place a report in its zone and council side
    outline: outline.map((ring) => ring.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])) }));
writeFileSync(join(site, "public", "data", "zones_meta.json"), JSON.stringify({ zones }));
rmSync(join(site, "public", "data", "zones.json"), { force: true });
cpSync(join(sim, "screening.ts"), join(site, "src", "sim", "screening.ts"));
cpSync(join(site, "node_modules", "three", "examples", "jsm", "libs", "draco", "gltf"), join(site, "public", "draco"), { recursive: true });
console.log("synced data, simulator and Draco decoder");
