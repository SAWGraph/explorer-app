#!/usr/bin/env python3
"""Precompute aquifer boundary polygons as static GeoJSON.

Aquifers have no geometry in the KG, so we pull real polygons per state from
each state's geological survey ArcGIS service:

  Maine (MGS):     1:24,000 aquifer polygons, joined to the KG by AQUIFERID
                   (MGS-Aquifer.{id:05d}, verified 100% coverage). Carries
                   yield (SYMBOLOGY).

  Illinois (ISGS): the ILWATER/Aquifers service. Per-layer counts match the KG
                   1:1, so we render the real polygons directly:
                     layer 1 "Potential Aquifers < 50 ft"   -> 3,367 (CM, surficial)
                     layer 0 "Major Sand and Gravel Aquifers"->    88 (SG, surficial)
                     layer 3 "Major Rock Aquifers < 500 ft"  ->    14 (BR, bedrock)
                   The KG's CM/SG/BR id numbers are stale shapefile indices that
                   no longer match the service's OBJECTIDs, so we do not join by
                   id. The overlay is spatial context (query matching still uses
                   the KG's S2 cells), so exact id linkage is not needed.

Output is one GeoJSON feature per aquifer for static map rendering.

Usage:
    python3 -m pip install shapely
    python3 scripts/precompute_aquifers.py            # -> src/assets/aquifers.geojson
    python3 scripts/precompute_aquifers.py --self-check

Re-run when aquifer data changes upstream (currently ME + IL only).
"""
import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
from collections import defaultdict

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

SPARQL = "https://frink.apps.renci.org/hydrologykg/sparql"
MGS = ("https://services1.arcgis.com/RbMX0mRVOFNTdLzd/ArcGIS/rest/services/"
       "MGS_Aquifer_24K_Map_Data/FeatureServer/8/query")
ISGS = ("https://maps.isgs.illinois.edu/arcgis/rest/services/ILWATER/"
        "Aquifers/MapServer")
SIMPLIFY = 0.0005  # degrees (~50m); trims detailed polygons, keeps shape
OUT_PATH = "src/assets/aquifers.geojson"
ME_ID_RE = re.compile(r"me_mgs_data#d\.MGS-Aquifer\.(\d+)$")

# ISGS ILWATER layer -> (kind, human aquifer type). Matches KG IL families 1:1.
ISGS_LAYERS = {
    1: ("surficial", "coarse-grained materials (<50 ft)"),
    0: ("surficial", "sand and gravel"),
    3: ("bedrock", "bedrock (<500 ft)"),
}


def run_sparql(query: str) -> list[dict]:
    data = urllib.parse.urlencode({"query": query}).encode()
    req = urllib.request.Request(SPARQL, data=data, headers={
        "Accept": "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded",
    })
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.load(resp)["results"]["bindings"]


def fetch_arcgis(query_url: str, out_fields: str, page: int = 1000):
    """Yield GeoJSON features from an ArcGIS layer, paginated."""
    offset = 0
    while True:
        params = urllib.parse.urlencode({
            "where": "1=1", "outFields": out_fields, "returnGeometry": "true",
            "outSR": "4326", "f": "geojson",
            "resultOffset": offset, "resultRecordCount": page,
        })
        with urllib.request.urlopen(f"{query_url}?{params}", timeout=120) as resp:
            feats = json.load(resp).get("features", [])
        if not feats:
            break
        yield from feats
        offset += len(feats)
        if len(feats) < page:
            break


# --- Maine: MGS polygons joined to the KG by AQUIFERID ---

def build_me_features() -> list[dict]:
    rows = run_sparql("""
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        PREFIX gwml2: <http://gwml2.org/def/gwml2#>
        PREFIX saw_water: <http://sawgraph.spatialai.org/v1/saw_water#>
        SELECT ?aq ?aqType WHERE {
          ?aq rdf:type gwml2:GW_Aquifer .
          FILTER(CONTAINS(STR(?aq), "me_mgs_data#d.MGS-Aquifer."))
          OPTIONAL { ?aq saw_water:aquiferType ?aqType }
        }
    """)
    kg = {r["aq"]["value"]: r.get("aqType", {}).get("value", "") for r in rows}

    geoms: dict[int, list] = defaultdict(list)
    yields: dict[int, str] = {}
    for f in fetch_arcgis(MGS, "AQUIFERID,SYMBOLOGY", page=2000):
        aid = f["properties"].get("AQUIFERID")
        if aid is None or not f.get("geometry"):
            continue
        geoms[int(aid)].append(shape(f["geometry"]))
        yields.setdefault(int(aid), f["properties"].get("SYMBOLOGY") or "")
    print(f"  ME: downloaded MGS polygons for {len(geoms):,} ids", file=sys.stderr)

    features, missing = [], 0
    for iri, raw_type in kg.items():
        m = ME_ID_RE.search(iri)
        polys = geoms.get(int(m.group(1))) if m else None
        if not polys:
            missing += 1
            continue
        boundary = unary_union(polys).simplify(SIMPLIFY, preserve_topology=True)
        features.append(_feature(boundary, {
            "id": iri, "aquiferType": raw_type or "sand and gravel",
            "kind": "surficial", "state": "ME",
            "yield": yields.get(int(m.group(1)), ""), "source": "mgs",
        }))
    if missing:
        print(f"  ME: WARNING {missing} KG aquifers had no MGS polygon", file=sys.stderr)
    print(f"  ME: built {len(features):,} features", file=sys.stderr)
    return features


# --- Illinois: real ISGS ILWATER polygons ---

def build_il_features() -> list[dict]:
    features = []
    for layer, (kind, aq_type) in ISGS_LAYERS.items():
        n = 0
        for f in fetch_arcgis(f"{ISGS}/{layer}/query", "OBJECTID"):
            if not f.get("geometry"):
                continue
            geom = shape(f["geometry"]).simplify(SIMPLIFY, preserve_topology=True)
            oid = f["properties"].get("OBJECTID")
            features.append(_feature(geom, {
                "id": f"isgs.L{layer}.{oid}", "aquiferType": aq_type,
                "kind": kind, "state": "IL", "source": "isgs",
            }))
            n += 1
        print(f"  IL: layer {layer} -> {n:,} features ({aq_type})", file=sys.stderr)
    return features


def _feature(geom, props: dict) -> dict:
    return {"type": "Feature", "properties": props, "geometry": mapping(geom)}


def build_geojson() -> dict:
    return {"type": "FeatureCollection",
            "features": build_me_features() + build_il_features()}


def self_check() -> None:
    # Core path: an ArcGIS geojson feature parses into a valid shapely polygon.
    f = next(fetch_arcgis(f"{ISGS}/1/query", "OBJECTID", page=1))
    g = shape(f["geometry"])
    assert g.is_valid or g.buffer(0).is_valid, "geometry not parseable"
    assert g.area > 0, "empty geometry"
    print("self-check OK: ISGS geojson parses into a valid polygon")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-check", action="store_true")
    ap.add_argument("-o", "--out", default=OUT_PATH)
    args = ap.parse_args()

    if args.self_check:
        self_check()
        return

    fc = build_geojson()
    with open(args.out, "w") as f:
        json.dump(fc, f)
    print(f"wrote {len(fc['features']):,} aquifer boundaries -> {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
