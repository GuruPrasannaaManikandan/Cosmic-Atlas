"""
COSMIC ATLAS - Solar System expansion asset pipeline (moons, dwarf planets, asteroid belt).

Downloads REAL global maps (no procedural generation) and the main-belt orbital-element sample, converts them to
runtime sizes, and records provenance in frontend/public/assets/astronomy/asset-manifest.json (entries whose id
starts with "ss_" are owned by this script; all other manifest entries are left untouched).

Sources
  * USGS Astrogeology planetary WMS (planetarymaps.usgs.gov) - simple-cylindrical global mosaics, public domain
  * USGS Astropedia browse JPEGs (astrogeology.usgs.gov) - Dawn FC mosaics of Ceres and Vesta, public domain
  * NASA 3D Resources (github.com/nasa/NASA-3D-Resources) - Voyager 2 maps of the Uranian moons, NASA media
  * JPL SBDB Query API (ssd-api.jpl.nasa.gov/sbdb_query.api) - main-belt osculating elements

Usage:  python scripts/build_solar_system_assets.py [--skip-download]
Requires: httpx, Pillow, numpy. Downloads go to a fresh temporary directory and are only decoded as images/JSON.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import sys
import tempfile
import time

import httpx
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX_DIR = os.path.join(ROOT, "frontend", "public", "assets", "astronomy", "textures")
DATA_DIR = os.path.join(ROOT, "frontend", "public", "assets", "astronomy", "data")
MANIFEST = os.path.join(ROOT, "frontend", "public", "assets", "astronomy", "asset-manifest.json")
UA = {"User-Agent": "CosmicAtlas/0.1 (educational; asset pipeline)"}
WMS = "https://planetarymaps.usgs.gov/cgi-bin/mapserv"
NASA3D = "https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/Images%20and%20Textures/"
USGS_PD = "Public domain (USGS Astrogeology; NASA/JPL mission data)"
NASA_MEDIA = "NASA media usage guidelines (no copyright; credit NASA) - NASA 3D Resources"

# id, body, kind, source spec, size, coverage note, colour treatment
MAPS = [
    ("ss_phobos", "Phobos", "wms", ("mars/phobos", "VIKING"), 1024, "global; Viking-based SHADED RELIEF (topographic shading, not albedo)", "grey"),
    ("ss_deimos", "Deimos", "wms", ("mars/deimos", "VIKING"), 1024, "global; Viking-based mosaic (Stooke)", "grey"),
    ("ss_io", "Io", "wms", ("jupiter/io", "SSI_VGR_color"), 2048, "global; Galileo SSI + Voyager colour merge", "color"),
    ("ss_europa", "Europa", "wms", ("jupiter/europa", "GALILEO_VOYAGER"), 2048, "global; Galileo SSI + Voyager mosaic", "as-is"),
    ("ss_ganymede", "Ganymede", "wms", ("jupiter/ganymede", "GALILEO_VOYAGER"), 2048, "global; Galileo SSI + Voyager mosaic", "as-is"),
    ("ss_callisto", "Callisto", "wms", ("jupiter/callisto", "GALILEO_VOYAGER"), 2048, "global; Galileo SSI + Voyager mosaic", "as-is"),
    ("ss_mimas", "Mimas", "wms", ("saturn/mimas", "CASSINI_MIMAS_MOSAIC"), 1024, "global; Cassini ISS mosaic (2017)", "as-is"),
    ("ss_enceladus", "Enceladus", "wms", ("saturn/enceladus", "CASSINI"), 2048, "global; Cassini ISS mosaic", "as-is"),
    ("ss_tethys", "Tethys", "wms", ("saturn/tethys", "CASSINI"), 2048, "global; Cassini ISS mosaic (PIA14931)", "as-is"),
    ("ss_dione", "Dione", "wms", ("saturn/dione", "CASSINI_VOYAGER"), 2048, "global; Cassini + Voyager mosaic", "as-is"),
    ("ss_rhea", "Rhea", "wms", ("saturn/rhea", "CASSINI_VOYAGER"), 2048, "global; Cassini + Voyager mosaic (PIA12803)", "as-is"),
    ("ss_iapetus", "Iapetus", "nasa3d", "Saturn - Iapetus/Saturn - Iapetus.jpg", 1024, "global; albedo-preserving Cassini/Voyager mosaic (shows the dark leading-hemisphere Cassini Regio); smooth southern areas are airbrushed fill", "as-is"),
    ("ss_phoebe", "Phoebe", "wms", ("saturn/phoebe", "CASSINI"), 1024, "global; Cassini ISS mosaic (PIA07775); black no-data gaps replaced by a neutral mean tone", "fill-black"),
    ("ss_triton", "Triton", "wms", ("neptune/triton", "TRITON_VOYAGER2"), 2048, "PARTIAL: Voyager 2 imaged mainly the southern hemisphere (1989); unimaged areas (white no-data) replaced by a neutral mean tone", "fill-white"),
    ("ss_pluto", "Pluto", "wms", ("pluto/pluto", "NEWHORIZONS_PLUTO_MOSAIC"), 2048, "PARTIAL: New Horizons encounter hemisphere at high resolution, far side low resolution, south of ~-30 deg unimaged (white no-data replaced by a neutral mean tone)", "fill-white"),
    ("ss_charon", "Charon", "wms", ("pluto/charon", "NEWHORIZONS_CHARON_MOSAIC"), 2048, "PARTIAL: New Horizons encounter hemisphere; southern latitudes unimaged (white no-data replaced by a neutral mean tone)", "fill-white"),
    ("ss_miranda", "Miranda", "nasa3d", "Uranus - Miranda/Uranus - Miranda.jpg", 1024, "PARTIAL: Voyager 2 (1986) imaged only the southern hemisphere; the unimaged north (black no-data) is replaced by a neutral mean tone", "fill-black"),
    ("ss_ariel", "Ariel", "nasa3d", "Uranus - Ariel/Uranus - Ariel.jpg", 1024, "PARTIAL: Voyager 2 (1986) imaged only the southern hemisphere; the unimaged north (black no-data) is replaced by a neutral mean tone", "fill-black"),
    ("ss_umbriel", "Umbriel", "nasa3d", "Uranus - Umbriel/Uranus - Umbriel.jpg", 1024, "PARTIAL: Voyager 2 (1986) imaged only the southern hemisphere; the unimaged north (black no-data) is replaced by a neutral mean tone", "fill-black"),
    ("ss_titania", "Titania", "nasa3d", "Uranus - Titania/Uranus - Titania.jpg", 1024, "PARTIAL: Voyager 2 (1986) imaged only the southern hemisphere; the unimaged north (black no-data) is replaced by a neutral mean tone", "fill-black"),
    ("ss_oberon", "Oberon", "nasa3d", "Uranus - Oberon/Uranus - Oberon.jpg", 1024, "PARTIAL: Voyager 2 (1986) imaged only the southern hemisphere; the unimaged north (black no-data) is replaced by a neutral mean tone", "fill-black"),
    ("ss_ceres", "Ceres", "url", "https://astrogeology.usgs.gov/ckan/dataset/6ad84c9a-1fad-4869-b4f6-b52c5c2ace36/resource/9f757a65-8d8a-4349-a72d-8062387574b3/download/ceres_dawn_fc_dlr_global_feb2016_1024.jpg", 1024, "global; Dawn FC HAMO mosaic (DLR, Feb 2016), USGS browse product", "as-is"),
    ("ss_vesta", "Vesta", "url", "https://astrogeology.usgs.gov/ckan/dataset/ec63e420-a8bd-4a90-9341-a5754b551574/resource/9306febf-0c7a-49ee-b7b0-a1f043297bf7/download/vesta_dawn_fc_hamo_mosaic_global_1024.jpg", 1024, "global; Dawn FC HAMO mosaic, Claudia Double-Prime longitude system, USGS browse product", "as-is"),
]


def fetch(url: str, params: dict | None = None, tries: int = 4) -> bytes:
    last: Exception | None = None
    for k in range(tries):
        try:
            r = httpx.get(url, params=params, headers=UA, timeout=180, follow_redirects=True)
            r.raise_for_status()
            return r.content
        except httpx.HTTPError as e:
            last = e
            time.sleep(2 + 2 * k)
    raise RuntimeError(f"download failed: {url}: {last}")


def fill_nodata(arr: np.ndarray, white: bool) -> Image.Image:
    """Replace a mission map's flat no-data fill (pure white or pure black) by the neutral mean tone of the imaged
    pixels, feathered at the boundary. This is a labelled reconstruction, not imagery."""
    from PIL import ImageFilter
    mask = (arr.min(axis=2) >= 250) if white else (arr.max(axis=2) <= 6)
    valid = arr[~mask]
    if valid.size == 0:
        raise RuntimeError("no valid pixels")
    tone = float(valid.mean())  # luminance only: unknown colour is shown as neutral grey
    m = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(4))
    w = (np.asarray(m).astype(np.float32) / 255.0)[..., None]
    out = arr * (1 - w) + tone * w
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGB")


def source_url(kind: str, spec, size: int) -> tuple[str, dict | None]:
    if kind == "wms":
        mp, layer = spec
        return WMS, {"map": f"/maps/{mp}_simp_cyl.map", "service": "WMS", "version": "1.1.1", "request": "GetMap", "layers": layer, "styles": "",
                     "srs": "EPSG:4326", "bbox": "-180,-90,180,90", "width": str(size), "height": str(size // 2), "format": "image/jpeg"}
    if kind == "nasa3d":
        return NASA3D + spec.replace(" ", "%20"), None
    return spec, None


def build_maps(tmp: str, entries: list) -> None:
    os.makedirs(TEX_DIR, exist_ok=True)
    for aid, body, kind, spec, size, coverage, _tone in MAPS:
        url, params = source_url(kind, spec, size)
        raw = fetch(url, params)
        with open(os.path.join(tmp, aid + ".bin"), "wb") as f:
            f.write(raw)
        img = Image.open(io.BytesIO(raw))
        img.load()
        img = img.convert("RGB")
        if img.size != (size, size // 2):
            img = img.resize((size, size // 2), Image.LANCZOS)
        arr = np.asarray(img).astype(np.float32)
        if _tone in ("fill-white", "fill-black"):
            img = fill_nodata(arr, white=_tone == "fill-white")
            arr = np.asarray(img).astype(np.float32)
        if arr.std() < 2.0:
            raise RuntimeError(f"{aid}: downloaded image is blank (std={arr.std():.2f}); refusing to store it")
        fname = f"{aid[3:]}_{'2k' if size >= 2048 else '1k'}.jpg"
        out = os.path.join(TEX_DIR, fname)
        img.save(out, "JPEG", quality=86, optimize=True)
        sha = hashlib.sha256(open(out, "rb").read()).hexdigest()
        req = url if params is None else str(httpx.URL(url, params=params))
        license_ = NASA_MEDIA if kind == "nasa3d" else USGS_PD
        src = {"wms": "USGS Astrogeology planetary WMS (planetarymaps.usgs.gov)", "nasa3d": "NASA 3D Resources (Voyager 2 imagery mosaicked by USGS)", "url": "USGS Astropedia browse product"}[kind]
        entries.append({"id": aid, "name": f"{body} global surface map", "path": f"/assets/astronomy/textures/{fname}", "type": "texture", "source": src,
                        "sourceUrl": req, "license": license_, "dimensions": [size, size // 2], "colorSpace": "sRGB", "transparent": False, "category": "solar-system-body",
                        "body": body, "coverage": coverage, "projection": "simple cylindrical (equirectangular), longitude -180..180 as served",
                        "sha256": sha, "retrieved": time.strftime("%Y-%m-%d"), "description": f"{body}: {coverage}."})
        print(f" -> {fname} ({size}x{size // 2}) from {src}")


BELT_EXCLUDE = {"1", "2", "4", "10"}  # Ceres, Pallas, Vesta, Hygiea are individual selectable objects


def build_belt(entries: list) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    api = "https://ssd-api.jpl.nasa.gov/sbdb_query.api"
    cd = json.dumps({"AND": ["H|LT|13.5"]})
    rows, counts = [], {}
    for cls in ("MBA", "OMB"):
        counts[cls] = {
            "known": json.loads(fetch(api, {"fields": "spkid", "sb-class": cls, "limit": "1"}))["count"],
            "numbered": json.loads(fetch(api, {"fields": "spkid", "sb-class": cls, "sb-ns": "n", "limit": "1"}))["count"],
        }
        j = json.loads(fetch(api, {"fields": "pdes,a,e,i,om,w,ma,epoch,H", "sb-class": cls, "sb-ns": "n", "sb-cdata": cd}))
        counts[cls]["sample"] = len(j["data"])
        rows += j["data"]
    epochs = {r[7] for r in rows}
    if len(epochs) != 1:
        raise RuntimeError(f"belt sample has mixed epochs {sorted(epochs)[:5]}")
    keep = [r for r in rows if r[0] not in BELT_EXCLUDE]
    keep.sort(key=lambda r: int(r[0]))
    out = {
        "source": "NASA/JPL SBDB Query API (ssd-api.jpl.nasa.gov/sbdb_query.api), osculating heliocentric ecliptic J2000 elements",
        "selection": "all NUMBERED asteroids of SBDB orbit classes MBA (2.0 < a < 3.2 AU) and OMB (3.2 < a < 4.6 AU) with absolute magnitude H < 13.5; "
                     "(1) Ceres, (2) Pallas, (4) Vesta and (10) Hygiea are excluded here because they are individual catalogue objects",
        "population": counts,
        "epochJdTdb": float(next(iter(epochs))),
        "retrieved": time.strftime("%Y-%m-%d"),
        "fields": ["number", "a_au", "e", "i_deg", "node_deg", "argperi_deg", "M_deg", "H"],
        "rows": [[int(r[0]), round(float(r[1]), 6), round(float(r[2]), 6), round(float(r[3]), 5), round(float(r[4]), 5), round(float(r[5]), 5), round(float(r[6]), 5), round(float(r[8]), 2)] for r in keep],
    }
    path = os.path.join(DATA_DIR, "main_belt_sbdb_h13.5.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    sha = hashlib.sha256(open(path, "rb").read()).hexdigest()
    known = sum(c["known"] for c in counts.values())
    entries.append({"id": "ss_main_belt", "name": "Main-belt asteroid orbital-element sample", "path": "/assets/astronomy/data/main_belt_sbdb_h13.5.json", "type": "data",
                    "source": out["source"], "license": "Public domain (NASA/JPL)", "category": "asteroid-belt", "sha256": sha, "retrieved": out["retrieved"],
                    "description": f"{len(keep)} numbered main-belt asteroids with H < 13.5 out of {known:,} known MBA+OMB objects ({100 * len(keep) / known:.2f}%)."})
    print(f" -> belt sample: {len(keep)} bodies of {known:,} known ({counts})")


def write_manifest(entries: list) -> None:
    m = json.load(open(MANIFEST, encoding="utf-8"))
    m["assets"] = [a for a in m["assets"] if not str(a.get("id", "")).startswith("ss_")] + entries
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(m, f, indent=2)
        f.write("\n")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--maps-only", action="store_true")
    ap.add_argument("--belt-only", action="store_true")
    a = ap.parse_args()
    entries: list = []
    old = json.load(open(MANIFEST, encoding="utf-8"))["assets"]
    with tempfile.TemporaryDirectory(prefix="atlas_dl_") as tmp:
        if not a.belt_only:
            build_maps(tmp, entries)
        else:
            entries += [x for x in old if str(x.get("id", "")).startswith("ss_") and x["id"] != "ss_main_belt"]
        if not a.maps_only:
            build_belt(entries)
        else:
            entries += [x for x in old if x.get("id") == "ss_main_belt"]
    write_manifest(entries)
    print(f"manifest updated with {len(entries)} solar-system entries")
    return 0


if __name__ == "__main__":
    sys.exit(main())

