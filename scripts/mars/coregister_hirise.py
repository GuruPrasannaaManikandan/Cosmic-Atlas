"""
Co-register an UNCONTROLLED HiRISE observation (USGS ARD 'mro_hirise_uncontrolled_observations', ~100 m ground-location
uncertainty) to the CONTROLLED orthoimage of a site's DTM, so hardware seen only in the later image (e.g. Curiosity, which
landed after the controlled pair was taken) gets a position in the controlled HiRISE/MOLA frame.

Both products are equirectangular on the Mars 2015 sphere (clon 0), so the mis-registration is (to first order) a shift.
The shift is measured by phase correlation of gradient-magnitude images (insensitive to the different sun angles) over a
square of terrain around the site, on several sub-squares, and reported with its scatter.

  python -I scripts/mars/coregister_hirise.py --site curiosity --obs ESP_028401_1755_RED --half 600 --out <dir>
  ... --pick <col>:<row>   pixel in <out>/<site>/<obs>_full.png (0.5 m) -> controlled lat/lon

Writes <obs>_full.png / controlled_full.png (same grid, 0.5 m, north up) and coreg.json.
"""
from __future__ import annotations

import argparse, json, math, sys
from pathlib import Path

import numpy as np
import cv2
import rasterio
from pyproj import CRS, Transformer
from rasterio.windows import from_bounds
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mars_sites import SITES, GDAL_ENV, gdal_href, stac_item, ortho_href  # noqa: E402

R = 3396190.0
MARS_GEO = CRS.from_proj4(f'+proj=longlat +R={R} +no_defs')
UNCONTROLLED = 'https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/uncontrolled/{0}/{0}.tif'

ap = argparse.ArgumentParser()
ap.add_argument('--site', required=True)
ap.add_argument('--obs', required=True, help='uncontrolled observation id, e.g. ESP_028401_1755_RED')
ap.add_argument('--half', type=float, default=600)
ap.add_argument('--res', type=float, default=0.5)
ap.add_argument('--out', required=True)
ap.add_argument('--pick', action='append', default=[])
a = ap.parse_args()

s = SITES[a.site]
lat0, lon0 = s['hardwareLatLon']
lon180 = ((lon0 + 180) % 360) - 180
out = Path(a.out) / a.site
out.mkdir(parents=True, exist_ok=True)


def read_grid(href):
    """the square around the site on a common grid (the product's own equirectangular CRS), a.res m per pixel"""
    with rasterio.Env(**GDAL_ENV), rasterio.open(gdal_href(href)) as src:
        tf = Transformer.from_crs(MARS_GEO, src.crs, always_xy=True)
        X0, Y0 = tf.transform(lon180, lat0)
        w = from_bounds(X0 - a.half, Y0 - a.half, X0 + a.half, Y0 + a.half, src.transform)
        n = int(round(2 * a.half / a.res))
        arr = src.read(1, window=w, out_shape=(n, n), boundless=True, fill_value=src.nodata if src.nodata is not None else 0).astype(np.float64)
        crs = src.crs
        nod = src.nodata
    if nod is not None:
        arr[arr == nod] = np.nan
    arr[(arr <= 0) | (arr > 1e30)] = np.nan
    return arr, (X0 - a.half, Y0 + a.half), crs


def stretch(g):
    lo, hi = np.nanpercentile(g, 0.5), np.nanpercentile(g, 99.5)
    return np.clip((np.nan_to_num(g, nan=lo) - lo) / (hi - lo), 0, 1)


item = stac_item(s['dtm'])
ctl, ctl_origin, crs_c = read_grid(ortho_href(item))
unc, unc_origin, crs_u = read_grid(UNCONTROLLED.format(a.obs))
assert np.allclose(ctl_origin, unc_origin, atol=1e-6), 'grids differ'
gc, gu = stretch(ctl), stretch(unc)
Image.fromarray((gc * 255).astype(np.uint8)).save(out / 'controlled_full.png')
Image.fromarray((gu * 255).astype(np.uint8)).save(out / f'{a.obs}_full.png')


def grad(g):
    g = cv2.GaussianBlur(g.astype(np.float32), (0, 0), 2.0)
    gx, gy = cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1)
    m = np.sqrt(gx * gx + gy * gy)
    return (m - m.mean()) / (m.std() + 1e-9)


# shift of the uncontrolled image relative to the controlled one, measured on 3x3 sub-squares (each 2/3 of the side)
n = gc.shape[0]
k = int(n * 2 / 3)
shifts = []
win = cv2.createHanningWindow((k, k), cv2.CV_32F)
for oy in (0, (n - k) // 2, n - k):
    for ox in (0, (n - k) // 2, n - k):
        A, B = grad(gc[oy:oy + k, ox:ox + k]), grad(gu[oy:oy + k, ox:ox + k])
        if np.isnan(unc[oy:oy + k, ox:ox + k]).mean() > 0.2:
            continue
        (dx, dy), resp = cv2.phaseCorrelate(A, B, win)
        shifts.append((dx, dy, resp))
sh = np.array(shifts)
good = sh[sh[:, 2] > 0.05] if (sh[:, 2] > 0.05).sum() >= 3 else sh
dx, dy = np.median(good[:, 0]), np.median(good[:, 1])
spread = float(np.hypot(good[:, 0] - dx, good[:, 1] - dy).max() * a.res)
rep = {'site': a.site, 'observation': a.obs, 'controlled': ortho_href(item), 'resM': a.res, 'halfM': a.half,
       'shiftPx': [float(dx), float(dy)], 'shiftM_east_south': [float(dx * a.res), float(dy * a.res)],
       'subSquares': [[round(x, 2), round(y, 2), round(r, 3)] for x, y, r in shifts], 'maxDeviationM': round(spread, 2)}
# shifted uncontrolled image on the controlled grid (visual check: features should coincide)
M = np.float32([[1, 0, -dx], [0, 1, -dy]])
gu_reg = cv2.warpAffine(gu.astype(np.float32), M, (n, n))
Image.fromarray((np.stack([gc, gu_reg, gc], -1) * 255).astype(np.uint8)).save(out / 'overlay_registered.png')
inv = Transformer.from_crs(crs_c, MARS_GEO, always_xy=True)
for p in a.pick:
    col, row = (float(v) for v in p.split(':'))
    # a feature at (col, row) in the uncontrolled grid sits at (col - dx, row - dy) in the controlled grid
    X = ctl_origin[0] + (col - dx + 0.5) * a.res
    Y = ctl_origin[1] - (row - dy + 0.5) * a.res
    lo, la = inv.transform(X, Y)
    rep.setdefault('picks', []).append({'col': col, 'row': row, 'controlledLatDeg': round(la, 6), 'controlledLonEastDeg': round(lo % 360, 6)})
(out / 'coreg.json').write_text(json.dumps(rep, indent=1))
print(json.dumps(rep, indent=1))
