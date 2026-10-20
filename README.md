# RainReady website

One shared picture of how water moves across council and developer boundaries. A simulated township loosely based on
Bandar Bukit Raja (Klang), with screening estimates from the MSMA 2nd Edition method (DID Malaysia, 2012). Decision
support, not a forecast and not a design. Sime Darby Property University Hackathon 2026.

```
npm install
npm run dev      # http://localhost:5173 (or: npx vite --port 3000)
npm run build    # static site in dist/
```

`public/data/` and `src/sim/screening.ts` are copied from the project's simulator folder by `scripts/sync-data.mjs`;
the copies are committed so the site builds on its own. Map data © OpenStreetMap contributors (ODbL). Terrain:
Copernicus DEM GLO-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH, provided under COPERNICUS by the
European Union and ESA.
