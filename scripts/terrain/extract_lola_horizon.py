"""
Distant horizon terrain for each Apollo site from the LOLA global gridded DEM LDEM_64 (NASA PDS Geosciences Node).

LDEM_64: 64 px/deg (~474 m/px) simple cylindrical, LSB int16, height = DN * 0.5 m relative to the 1737.4 km sphere
(the same reference sphere as the LROC NAC DTMs). One contiguous HTTP range request per site fetches only the rows
around it (~3.3 MB). The rows are resampled (bilinear) onto the app's local site frame (+x east, +z south, metres from
the LM) on a 250 m grid out to +/-24 km, stored as uint16 + JSON sidecar, with heights relative to the LM's DTM height.

Usage (user-approved, ~20 MB of reads):
  python scripts/terrain/extract_lola_horizon.py --out frontend/public/assets/terrain
"""
from __future__ import annotations

import argparse
import json
import math
import urllib.request
from pathlib import Path

import numpy as np

URL = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_64.img"
LBL = URL.replace(".img", ".lbl")
R_MOON = 1737400.0
RES = 64  # pix/deg
LINES, SAMPLES = 11520, 23040
ROW_BYTES = SAMPLES * 2
LINE_OFF, SAMPLE_OFF = 5759.5, 11519.5  # from the label (0-based pixel centres)
SITES = ["tranquility-base", "apollo-12", "apollo-14", "apollo-15", "apollo-16", "apollo-17"]
HALF_M = 24000.0
CELL_M = 250.0


def fetch_rows(r0: int, r1: int) -> np.ndarray:
    req = urllib.request.Request(URL, headers={"Range": f"bytes={r0 * ROW_BYTES}-{r1 * ROW_BYTES - 1}", "User-Agent": "cosmic-atlas-terrain-extract"})
    with urllib.request.urlopen(req, timeout=120) as r:
        if r.status != 206:
            raise RuntimeError(f"expected a partial response (206), got {r.status}")
        buf = r.read()
    a = np.frombuffer(buf, dtype="<i2").reshape(r1 - r0, SAMPLES)
    return a.astype(np.float64) * 0.5  # metres relative to the 1737.4 km sphere


def extract(site: str, out: Path) -> dict:
    dtm = json.loads((out / f"{site}.json").read_text())
    # LM position: the DTM sidecar's grid is centred on the LM; read it back from the catalogue values used there
    lat0, lon0 = dtm["lmLat"], dtm["lmLon"]
    dlat = HALF_M / R_MOON * 180 / math.pi + 2 / RES
    r0 = max(0, int(math.floor(LINE_OFF - (lat0 + dlat) * RES)))
    r1 = min(LINES, int(math.ceil(LINE_OFF - (lat0 - dlat) * RES)) + 1)
    rows = fetch_rows(r0, r1)
    xs = np.arange(-HALF_M, HALF_M + CELL_M / 2, CELL_M)
    zs = np.arange(-HALF_M, HALF_M + CELL_M / 2, CELL_M)
    X, Z = np.meshgrid(xs, zs)
    lat = lat0 + np.degrees(-Z / R_MOON)
    lon = (lon0 + np.degrees(X / (R_MOON * math.cos(math.radians(lat0))))) % 360
    rr = LINE_OFF - lat * RES - r0
    cc = SAMPLE_OFF + (lon - 180) * RES
    ri, ci = np.floor(rr).astype(int), np.floor(cc).astype(int)
    fr, fc = rr - ri, cc - ci
    ri = np.clip(ri, 0, rows.shape[0] - 2)
    c0 = ci % SAMPLES
    c1 = (ci + 1) % SAMPLES
    h = rows[ri, c0] * (1 - fc) * (1 - fr) + rows[ri, c1] * fc * (1 - fr) + rows[ri + 1, c0] * (1 - fc) * fr + rows[ri + 1, c1] * fc * fr
    h_lm_lola = float(h[len(zs) // 2, len(xs) // 2])
    rel = h - dtm["lmHeightDtm"]
    lo, hi = float(rel.min()), float(rel.max())
    q = (np.round((rel - lo) / max(hi - lo, 1e-6) * 65535)).astype("<u2")
    (out / f"{site}.horizon.bin").write_bytes(q.tobytes())
    meta = {
        "site": site,
        "width": len(xs),
        "height": len(zs),
        "cellM": CELL_M,
        "x0": float(xs[0]),
        "z0": float(zs[0]),
        "hMin": lo,
        "hMax": hi,
        "encoding": "uint16 LE, row-major (rows = +z south); h = hMin + v / 65535 * (hMax - hMin), metres relative to the LM",
        "lmHeightLola": h_lm_lola,
        "lmHeightDtm": dtm["lmHeightDtm"],
        "lolaMinusDtmAtLmM": h_lm_lola - dtm["lmHeightDtm"],
        "reliefM": hi - lo,
        "source": {"product": "LOLA LDEM_64 (64 px/deg, ~474 m/px)", "file": URL, "label": LBL, "rowsRead": [r0, r1], "bytesRead": (r1 - r0) * ROW_BYTES},
    }
    (out / f"{site}.horizon.json").write_text(json.dumps(meta, indent=1))
    return meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="frontend/public/assets/terrain")
    a = ap.parse_args()
    out = Path(a.out)
    total = 0
    for s in SITES:
        m = extract(s, out)
        total += m["source"]["bytesRead"]
        print(f"{s}: {m['width']}x{m['height']} @ {m['cellM']:.0f} m, relief {m['reliefM']:.0f} m, LOLA-DTM at LM {m['lolaMinusDtmAtLmM']:+.1f} m, read {m['source']['bytesRead']/1e6:.2f} MB")
    print(f"TOTAL read {total/1e6:.1f} MB")


if __name__ == "__main__":
    main()
