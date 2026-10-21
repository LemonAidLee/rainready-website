"""Geocode the towns in JPS's "Status Lokasi Banjir Kilat 2017" list (data.gov.my) to town-level points, with
OpenStreetMap's Nominatim (one request per second, results cached), then check each point lies inside its state
(Natural Earth admin-1). Run after fetch_national_sources.py, before build_national.py:
    python scripts/geocode_national.py <raw_dir>
Writes <raw_dir>/kilat2017_towns.json: {"<state>|<town>": {"lon", "lat", "osm": display name, "ok": inside state}}.
The positions are TOWN-level and approximate: each row of the JPS list names several streets and villages.
"""
import csv
import re
import json
import os
import subprocess
import sys
import time
import urllib.parse

from shapely.geometry import Point, shape

UA = "RainReady-hackathon-geocoder/1.0"
STATE_NE = {"WP Kuala Lumpur": "Kuala Lumpur", "WP Labuan": "Labuan", "WP Putrajaya": "Putrajaya"}


def towns(raw: str):
    rows = list(csv.reader(open(os.path.join(raw, "kilat2017.csv"), encoding="utf-8", errors="replace")))[4:]
    cur, out = "", []
    for r in rows:
        if not any(c.strip() for c in r):
            continue
        if r[0].strip():
            cur = r[0].strip()
        if cur.startswith("Sumber"):
            break
        out.append((cur, " ".join(r[1].split()), " ".join(r[2].split()), r[4].strip()))
    return out


def query(q: str):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": q, "format": "json", "limit": 1, "countrycodes": "my"})
    res = subprocess.run(["curl", "-s", "-m", "60", "-A", UA, url], capture_output=True, check=True).stdout
    time.sleep(1.1)
    hits = json.loads(res or b"[]")
    return hits[0] if hits else None


def main(raw: str) -> None:
    cache_path = os.path.join(raw, "kilat2017_towns.json")
    cache = json.load(open(cache_path, encoding="utf-8")) if os.path.exists(cache_path) else {}
    states = {f["properties"]["name"]: shape(f["geometry"]) for f in json.load(open(
        os.path.join(raw, "ne_10m_admin_1_states_provinces.geojson"), encoding="utf-8"))["features"]
        if f["properties"].get("adm0_a3") == "MYS"}
    for state, town, _, _ in towns(raw):
        key = f"{state}|{town}"
        if not town or cache.get(key):
            continue
        name = re.sub(r"\s*\(.*?\)", "", town).replace("Bandaraya ", "").replace("Daerah ", "")
        hit = query(f"{name}, {STATE_NE.get(state, state)}, Malaysia") or query(f"{name}, Malaysia")
        if not hit:
            cache[key] = None
            print("not found:", key)
            continue
        lon, lat = float(hit["lon"]), float(hit["lat"])
        poly = states.get(STATE_NE.get(state, state))
        ok = bool(poly and poly.buffer(0.05).contains(Point(lon, lat)))
        cache[key] = {"lon": round(lon, 5), "lat": round(lat, 5), "osm": hit.get("display_name", "")[:120], "ok": ok}
        print(("ok  " if ok else "OUT ") + key, "->", cache[key]["osm"][:70])
        json.dump(cache, open(cache_path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)


if __name__ == "__main__":
    main(sys.argv[1])
