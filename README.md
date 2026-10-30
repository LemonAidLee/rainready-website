# RainReady website

**Property lines stop at the fence. Water doesn't.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/LemonAidLee/rainready-website/actions/workflows/ci.yml/badge.svg)](https://github.com/LemonAidLee/rainready-website/actions/workflows/ci.yml)
![Vite](https://img.shields.io/badge/Vite-React%20%2B%20three.js-646CFF?logo=vite&logoColor=white)

The web app for [RainReady](https://github.com/LemonAidLee/rainready-project): a planner view and a resident door over a
simulated township loosely based on Bandar Bukit Raja (Klang). Screening estimates use the MSMA 2nd Edition method
(DID Malaysia, 2012). Decision support, not a forecast and not a design.

**Live prototype:** https://rainready-wheat.vercel.app

## Getting started

```
npm install
npm run dev      # http://localhost:5173 (or: npx vite --port 3000)
npm run build    # static site in dist/
```

## Data

`public/data/` and `src/sim/screening.ts` are copied from the project's simulator folder by `scripts/sync-data.mjs`;
the copies are committed so the site builds on its own.

## Licence and data

Code is released under the [MIT licence](LICENSE). Map data © OpenStreetMap contributors (ODbL). Terrain:
Copernicus DEM GLO-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH, provided under COPERNICUS by the
European Union and ESA.
