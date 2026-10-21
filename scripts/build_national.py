"""Build public/data/national.json for the Malaysia landing map from the raw downloads of
fetch_national_sources.py:
    python scripts/build_national.py <raw_dir> public/data/national.json
Needs shapely (for simplifying outlines). What goes in:
  - country outlines (Natural Earth 1:50m; finer near Malaysia, coarser elsewhere) and label points
  - Malaysia's states (Natural Earth 1:10m admin-1) with label points
  - JPS Selangor's flood records 2017-2024: place, district, year, flood type and position ONLY. The layers also
    carry peak water levels, durations and evacuations; those are left out (house rule: no depths on screen).
    Records in two 2024 layers at the same spot are kept once.
  - Nationwide: JPS "Status Lokasi Banjir Kilat 2017" (data.gov.my, every state), one point per town from
    geocode_national.py (TOWN-level, approximate), with its number of listed locations and a few place names.
  - Nationwide: the Dartmouth Flood Observatory's archive of large flood events in Malaysia, 1991-2021 (centroid of the
    affected region; free for scholarly and educational use). Month, year, cause and duration only.
"""
import csv
import datetime
import glob
import json
import os
import re
import sys

from shapely.geometry import shape

REGION = (90, -12, 132, 24)          # lon/lat box drawn in detail (South-East Asia)
SELANGOR = (100.6, 2.4, 102.1, 4.0)  # sanity box for JPS Selangor records
TYPES = {"kilat": "Flash flood", "monsun": "Monsoon flood", "genang": "Ponding"}


def rings(geom, tol):
    g = shape(geom).simplify(tol, preserve_topology=True)
    polys = [g] if g.geom_type == "Polygon" else list(getattr(g, "geoms", []))
    out = []
    for p in polys:
        if p.is_empty or p.area < tol * tol * 4:
            continue
        out.append([round(v, 3) for xy in p.exterior.coords for v in xy])
    return out


def in_box(lon, lat, b):
    return b[0] <= lon <= b[2] and b[1] <= lat <= b[3]


def main(raw: str, out: str) -> None:
    countries, labels = [], []
    for f in json.load(open(os.path.join(raw, "ne_50m_admin_0_countries.geojson"), encoding="utf-8"))["features"]:
        p = f["properties"]
        lx, ly = p.get("LABEL_X"), p.get("LABEL_Y")
        near = lx is not None and in_box(lx, ly, REGION)
        r = rings(f["geometry"], 0.01 if near else 0.12)
        if r:
            countries.append({"n": p["NAME"], "my": p["ADM0_A3"] == "MYS", "r": r})
        if near and p["ADM0_A3"] not in ("MYS", "MAC", "HKG", "IOA"):
            labels.append({"n": p["NAME"].upper(), "c": [round(lx, 2), round(ly, 2)]})

    states = []
    for f in json.load(open(os.path.join(raw, "ne_10m_admin_1_states_provinces.geojson"), encoding="utf-8"))["features"]:
        p = f["properties"]
        if p.get("adm0_a3") != "MYS":
            continue
        states.append({"n": p["name"], "r": rings(f["geometry"], 0.003),
                       "c": [round(p["longitude"], 3), round(p["latitude"], 3)]})

    flood, seen = [], set()
    for path in sorted(glob.glob(os.path.join(raw, "*anjir*_*.geojson")) + glob.glob(os.path.join(raw, "BANJIR_*.geojson"))):
        name = os.path.basename(path)
        m = re.search(r"(20\d\d)", name)
        if not m or "2021" in name:          # the 2021 service is a two-point "map tour", not records
            continue
        year = int(m.group(1))
        for f in json.load(open(path, encoding="utf-8"))["features"]:
            g, p = f.get("geometry"), f["properties"]
            if not g or g.get("type") != "Point":
                continue
            lon, lat = g["coordinates"][:2]
            if not in_box(lon, lat, SELANGOR):
                continue
            key = (year, round(lon, 4), round(lat, 4))
            if key in seen:
                continue
            seen.add(key)
            place = " ".join(str(p.get("tempat") or p.get("kawasan_banjir") or "").split()).strip(" .")
            kind = TYPES.get(str(p.get("jenis_banjir") or "").split("/")[0].strip().lower())
            district = str(p.get("daerah") or "").strip().title() or None
            flood.append({"c": [round(lon, 5), round(lat, 5)], "y": year, "p": place[:90], "d": district, "t": kind})

    # nationwide: JPS 2017 flash-flood locations, one point per town
    towns = json.load(open(os.path.join(raw, "kilat2017_towns.json"), encoding="utf-8"))
    rows = list(csv.reader(open(os.path.join(raw, "kilat2017.csv"), encoding="utf-8", errors="replace")))[4:]
    agg, cur = {}, ""
    for r in rows:
        if not any(c.strip() for c in r):
            continue
        if r[0].strip():
            cur = r[0].strip()
        if cur.startswith("Sumber"):
            break
        key = f"{cur}|{' '.join(r[1].split())}"
        g = towns.get(key)
        if not g or not g["ok"]:
            continue
        a = agg.setdefault(key, {"c": [g["lon"], g["lat"]], "s": cur.replace("WP ", ""), "t": " ".join(r[1].split()), "n": 0, "e": []})
        a["n"] += 1
        a["e"] += [x.strip(" .") for x in re.split(r",| dan ", r[2]) if x.strip(" .")][:3]
    flash = [dict(a, e=a["e"][:5]) for a in agg.values()]

    # nationwide: large flood events (Dartmouth Flood Observatory), centroid of the affected region
    major = []
    for f in json.load(open(os.path.join(raw, "dfo_my.json"), encoding="utf-8"))["features"]:
        a = f["attributes"]
        if not a.get("BEGAN") or not in_box(a["LONG"], a["LAT"], (99, 0.5, 120, 7.5)):
            continue
        b = datetime.datetime.fromtimestamp(a["BEGAN"] / 1000, datetime.UTC)
        e = datetime.datetime.fromtimestamp(a["ENDED"] / 1000, datetime.UTC) if a.get("ENDED") else b
        major.append({"c": [round(a["LONG"], 3), round(a["LAT"], 3)], "y": b.year, "m": b.strftime("%b"),
                      "cause": (a.get("MAINCAUSE") or "").strip().capitalize() or None, "days": (e - b).days + 1})

    data = {
        "_sources": {
            "outlines": "Natural Earth 1:50m countries and 1:10m states/provinces (public domain)",
            "flood": "JPS Selangor GIS, public flood-record layers 2017-2024 (jpsselgis.selangor.gov.my), read 21 Oct 2026. "
                     "Place, district, year and flood type only; water levels, durations and evacuations left out",
            "flash": "JPS, Status Lokasi Banjir Kilat 2017 (archive.data.gov.my), geocoded to town level with OpenStreetMap "
                     "Nominatim (ODbL); positions approximate",
            "major": "Dartmouth Flood Observatory, Global Active Archive of Large Flood Events (Malaysia, 1991-2021): centroid "
                     "of the affected region; deaths and displacement left out",
        },
        "countries": countries, "labels": labels, "states": states, "flood": flood, "flash": flash, "major": major,
    }
    json.dump(data, open(out, "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
    print(f"{len(flash)} flash-flood towns ({sum(a['n'] for a in flash)} locations), {len(major)} major events")
    print(f"{len(countries)} countries, {len(states)} states, {len(flood)} flood records, "
          f"{os.path.getsize(out) // 1024} kB -> {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
