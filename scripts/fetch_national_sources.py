"""Download the raw sources for the Malaysia landing map into a folder (not the project): run
    python scripts/fetch_national_sources.py <raw_dir>
then build_national.py. Sources:
  - Natural Earth 1:50m countries and 1:10m states/provinces (public domain), from the natural-earth-vector repo
  - JPS Selangor's public flood-record layers, 2017-2024 (jpsselgis.selangor.gov.my, ArcGIS Server, no login).
    The layer marked "Internal_Use" and the area/district layers are not fetched.
  - JPS "Status Lokasi Banjir Kilat 2017" (archive.data.gov.my, CSV): flash-flood locations by state and town
  - Dartmouth Flood Observatory, large flood events in Malaysia (public ArcGIS copy of the archive), no geometry
curl is used for the downloads: Python's own HTTP client timed out on the JPS server (21 Oct 2026).
"""
import json
import os
import subprocess
import sys

NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
JPS = "https://jpsselgis.selangor.gov.my/gis/rest/services/Hosted/"
JPS_LAYERS = ["Banjir_2017", "Banjir_2018", "Banjir_2019", "Banjir_2020", "Banjir_2022_Upen",
              "Laporan_Banjir_2023", "BANJIR_2024", "Laporan_Banjir_2024"]


def get(url: str) -> bytes:
    return subprocess.run(["curl", "-s", "-m", "300", url], capture_output=True, check=True).stdout


KILAT = ("https://archive.data.gov.my/data/dataset/cbea1eff-77b2-4d92-a713-cb9fda80d521/resource/"
         "c62ef137-e854-4fc1-a9d4-c983a2b262d8/download/status-lokasi-banjir-kilat-2017.csv")
DFO = ("https://services1.arcgis.com/AXaYBvnJsB5Q7sDF/ArcGIS/rest/services/Global_Archive_of_large_flood_events/"
       "FeatureServer/0/query?where=COUNTRY+LIKE+%27%25Malaysia%25%27+OR+OTHERCOUNT+LIKE+%27%25Malaysia%25%27"
       "&outFields=ID,COUNTRY,OTHERCOUNT,LONG,LAT,BEGAN,ENDED,MAINCAUSE,SEVERITY&returnGeometry=false&f=json")


def main(out: str) -> None:
    os.makedirs(out, exist_ok=True)
    for f in ["ne_50m_admin_0_countries", "ne_10m_admin_1_states_provinces"]:
        open(os.path.join(out, f + ".geojson"), "wb").write(get(NE + f + ".geojson"))
    open(os.path.join(out, "kilat2017.csv"), "wb").write(get(KILAT))
    open(os.path.join(out, "dfo_my.json"), "wb").write(get(DFO))
    for s in JPS_LAYERS:
        for layer in json.loads(get(JPS + s + "/FeatureServer?f=json")).get("layers", []):
            feats, off = [], 0
            while True:
                q = json.loads(get(f"{JPS}{s}/FeatureServer/{layer['id']}/query?where=1%3D1&outFields=*"
                                   f"&outSR=4326&f=geojson&resultOffset={off}&resultRecordCount=1000"))
                feats += q.get("features", [])
                if len(q.get("features", [])) < 1000:
                    break
                off += 1000
            json.dump({"type": "FeatureCollection", "features": feats},
                      open(os.path.join(out, f"{s}_{layer['id']}.geojson"), "w"))
            print(s, layer["id"], len(feats))


if __name__ == "__main__":
    main(sys.argv[1])
