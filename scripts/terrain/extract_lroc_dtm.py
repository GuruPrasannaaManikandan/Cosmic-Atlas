"""
Extract site heightmaps from the official LROC NAC Digital Terrain Models (NASA PDS) by WINDOWED range reads.

Only the rows around each Apollo landing site are fetched (the GeoTIFFs are striped, one row per block). The DTMs are
equirectangular on a 1737.4 km sphere (CRS in the file), heights in metres relative to that sphere, tied to LOLA
(README: e.g. Apollo 11 RMS 1.81 m). Each output is resampled (bilinear) onto the app's local site frame
(+x east, +z south, metres from the LM, the same equirectangular tangent plane as frontend/src/surface/geo.ts) and
stored as uint16 (0 = no data) plus a JSON sidecar with the scale/offset and provenance.

Usage (user-approved windowed reads, ~60 MB total):
  python scripts/terrain/extract_lroc_dtm.py --out frontend/public/assets/terrain
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.env import Env
from rasterio.windows import Window

R_MOON = 1737400.0
BASE = "https://pds.mcp.nasa.gov/data/store/img/lunar_reconnaissance_orbiter/pds4/lroc/lro-l-lroc-5-rdr/LROLRC_2001/DATA/SDP/NAC_DTM/APOLLO{n}/NAC_DTM_APOLLO{n}.TIF"
PRODUCT = "https://data.lroc.im-ldi.com/lroc/view_rdr_product/NAC_DTM_APOLLO{n}"

# LM positions (LROC 2016 / NSSDCA 2017, east-positive) and LROC elevations (GLD100) — same values as the catalogue
SITES = {
    11: dict(site="tranquility-base", lat=0.67416, lon=23.47314, elev=-1926, half_ns=800, half_ew=1500),
    12: dict(site="apollo-12", lat=-3.0128, lon=336.5781, elev=-1422, half_ns=800, half_ew=1500),
    14: dict(site="apollo-14", lat=-3.64589, lon=342.52806, elev=-1062, half_ns=800, half_ew=1500),
    15: dict(site="apollo-15", lat=26.13239, lon=3.6333, elev=-1931, half_ns=800, half_ew=1800),
    16: dict(site="apollo-16", lat=-8.9734, lon=15.5011, elev=8, half_ns=400, half_ew=1500),
    17: dict(site="apollo-17", lat=20.1911, lon=30.7723, elev=-2626, half_ns=1000, half_ew=3000),
}


def lon180(lon: float) -> float:
    return ((lon + 180) % 360) - 180


def extract(n: int, cfg: dict, out: Path) -> dict:
    url = "/vsicurl/" + BASE.format(n=n)
    with rasterio.open(url) as src:
        crs = src.crs.to_proj4()
        lat_ts = float(src.crs.to_dict().get("lat_ts", 0.0))
        lon_0 = float(src.crs.to_dict().get("lon_0", 180.0))
        T = src.transform
        res = T.a
        # DTM coordinates of the LM: equirectangular x = R cos(lat_ts) (lon - lon_0), y = R lat
        def to_xy(lat, lon):
            dlon = ((lon - lon_0 + 540) % 360) - 180
            return R_MOON * math.cos(math.radians(lat_ts)) * math.radians(dlon), R_MOON * math.radians(lat)

        lx, ly = to_xy(cfg["lat"], cfg["lon"])
        col_lm, row_lm = ~T * (lx, ly)
        rows_half = int(math.ceil(cfg["half_ns"] / res)) + 2
        r0 = max(0, int(row_lm) - rows_half)
        r1 = min(src.height, int(row_lm) + rows_half)
        win = Window(0, r0, src.width, r1 - r0)
        data = src.read(1, window=win).astype(np.float64)
        bytes_read = (r1 - r0) * src.width * 4
        nod = src.nodata
        data[(data == nod) | ~np.isfinite(data) | (data < -1e30)] = np.nan
        Tw = rasterio.windows.transform(win, T)

    # output grid in the local site frame, at the DTM's own post spacing
    cell = res
    half_ew = cfg["half_ew"]
    half_ns = cfg["half_ns"]
    xs = np.arange(-half_ew, half_ew + cell / 2, cell)
    zs = np.arange(-half_ns, half_ns + cell / 2, cell)  # +z = south
    X, Z = np.meshgrid(xs, zs)
    lat0, lon0 = cfg["lat"], cfg["lon"]
    lat = lat0 + np.degrees(-Z / R_MOON)
    lon = lon0 + np.degrees(X / (R_MOON * math.cos(math.radians(lat0))))
    dlon = ((lon - lon_0 + 540) % 360) - 180
    px = R_MOON * math.cos(math.radians(lat_ts)) * np.radians(dlon)
    py = R_MOON * np.radians(lat)
    inv = ~Tw
    c = inv.a * px + inv.b * py + inv.c - 0.5  # pixel-centre convention
    r = inv.d * px + inv.e * py + inv.f - 0.5
    c0 = np.floor(c).astype(int)
    rr0 = np.floor(r).astype(int)
    fc, fr = c - c0, r - rr0
    H, W = data.shape
    ok = (c0 >= 0) & (rr0 >= 0) & (c0 + 1 < W) & (rr0 + 1 < H)
    c0c, r0c = np.clip(c0, 0, W - 2), np.clip(rr0, 0, H - 2)
    a = data[r0c, c0c]
    b = data[r0c, c0c + 1]
    d = data[r0c + 1, c0c]
    e = data[r0c + 1, c0c + 1]
    h = a * (1 - fc) * (1 - fr) + b * fc * (1 - fr) + d * (1 - fc) * fr + e * fc * fr
    h[~ok] = np.nan

    # height at the LM (bilinear) vs the LROC published elevation
    iz, ix = len(zs) // 2, len(xs) // 2
    h_lm = float(h[iz, ix])
    valid = np.isfinite(h)
    hmin, hmax = float(np.nanmin(h)), float(np.nanmax(h))
    span = max(hmax - hmin, 1e-6)
    q = np.zeros(h.shape, dtype=np.uint16)
    q[valid] = (1 + np.round((h[valid] - hmin) / span * 65534)).astype(np.uint16)
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{cfg['site']}.bin").write_bytes(q.astype("<u2").tobytes())
    meta = {
        "site": cfg["site"],
        "apollo": n,
        "width": int(len(xs)),
        "height": int(len(zs)),
        "cellM": cell,
        "x0": float(xs[0]),
        "z0": float(zs[0]),
        "hMin": hmin,
        "hMax": hmax,
        "encoding": "uint16 little-endian, row-major (rows = +z south); 0 = no data; h = hMin + (v - 1) / 65534 * (hMax - hMin)",
        "heightRef": "metres relative to the 1737.4 km lunar sphere (DTM datum)",
        "lmLat": cfg["lat"],
        "lmLon": cfg["lon"],
        "lmHeightDtm": h_lm,
        "lmElevationLroc": cfg["elev"],
        "lmDeltaM": h_lm - cfg["elev"] if math.isfinite(h_lm) else None,
        "validFraction": float(valid.mean()),
        "source": {
            "product": f"NAC_DTM_APOLLO{n}",
            "productPage": PRODUCT.format(n=n),
            "file": BASE.format(n=n),
            "crs": crs,
            "postSpacingM": res,
            "rowsRead": [r0, r1],
            "bytesRead": bytes_read,
            "accuracy": "tied to LOLA (see the product README)",
        },
    }
    (out / f"{cfg['site']}.json").write_text(json.dumps(meta, indent=1))
    return meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="frontend/public/assets/terrain")
    ap.add_argument("--only", type=int, nargs="*")
    a = ap.parse_args()
    total = 0
    with Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".TIF", GDAL_HTTP_MAX_RETRY="3"):
        for n, cfg in SITES.items():
            if a.only and n not in a.only:
                continue
            m = extract(n, cfg, Path(a.out))
            total += m["source"]["bytesRead"]
            print(f"Apollo {n}: {m['width']}x{m['height']} @ {m['cellM']:.0f} m, valid {m['validFraction']*100:.0f}%, "
                  f"h {m['hMin']:.0f}..{m['hMax']:.0f} m, LM DTM {m['lmHeightDtm']:.1f} vs LROC {m['lmElevationLroc']} (Δ {m['lmDeltaM'] if m['lmDeltaM'] is None else round(m['lmDeltaM'], 1)} m), read {m['source']['bytesRead']/1e6:.1f} MB")
    print(f"TOTAL read ≈ {total/1e6:.1f} MB")


if __name__ == "__main__":
    main()
