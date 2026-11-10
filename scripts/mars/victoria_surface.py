"""
Victoria crater surface detail for the Unity player (Stage 3 visual reconstruction). Inputs are read over HTTP from the
USGS Astrogeology analysis-ready (controlled) products of the SAME HiRISE stereo pair as the existing terrain
(DTEEC_001414_1780_001612_1780_U01): nothing large is downloaded.

Outputs (Assets/CosmicAtlas/Mars/Data):
  victoria_albedo_hr.jpg  0.5 m/px ground shade from the 25 cm RED_A orthoimage, registered to the existing DTM grid
                          (texel (u, v) = DTM cell (c, r) * 2), colourised with an ILLUSTRATIVE soil ramp (RED is one band)
  victoria_normal.png     1 m tangent-space normal map from the DTM itself, relative to the render mesh's smoothed
                          surface (so the 2 m Balanced mesh shows the measured 1 m relief, without double-counting slope)
  victoria_rocks.bytes    rock / clast placements (float32 east, north, up, scale, yaw, category): density and kind are
                          driven by the orthoimage (bright = Burns-formation outcrop, dark = basaltic sand) and by slope;
                          individual rock shapes are ILLUSTRATIVE (below the DTM's resolution)
  victoria_surface.json   provenance, the measured registration offset, statistics

  python -I scripts/mars/victoria_surface.py --data unity/CosmicAtlas/Assets/CosmicAtlas/Mars/Data
"""
import argparse, json, math, os, sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import from_bounds
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mars_sites import R, stac_item, dtm_href, ortho_href, gdal_href, GDAL_ENV  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('--data', required=True)
ap.add_argument('--albedo-res', type=float, default=0.5)
a = ap.parse_args()
data = Path(a.data)
meta = json.load(open(data / 'victoria_height.json'))
W, H = meta['width'], meta['height']
se, sn = meta['spacingM']
E0, N0 = meta['gridEastOfOriginM'], meta['gridNorthOfOriginM']
q = np.fromfile(data / 'victoria_height.bytes', dtype='<u2').reshape(H, W)
valid = q != meta['nodata']
up = np.where(valid, meta['upMinM'] + q * meta['quantStepM'], np.nan)
lat0, lon0 = [math.radians(v) for v in meta['originLatLon']]

# ---------------- local ENU <-> sphere (exact inverse of the prototype's forward ENU) ----------------
p0 = np.array([math.cos(lat0) * math.cos(lon0), math.cos(lat0) * math.sin(lon0), math.sin(lat0)])
Ev = np.array([-math.sin(lon0), math.cos(lon0), 0.0])
Nv = np.array([-math.sin(lat0) * math.cos(lon0), -math.sin(lat0) * math.sin(lon0), math.cos(lat0)])


def enu_to_ard_xy(e, n):
    """ground point (on the sphere) under local (east, north) -> USGS ARD projected x, y (equirectangular, clon 0)"""
    v = R * p0[None, None, :] + e[..., None] * Ev + n[..., None] * Nv
    v /= np.linalg.norm(v, axis=-1, keepdims=True)
    lat = np.arcsin(v[..., 2])
    lon = np.arctan2(v[..., 1], v[..., 0])  # -pi..pi, as the ARD products
    return R * lon, R * lat


def bilinear(img, fx, fy, fill=np.nan):
    x0, y0 = np.floor(fx).astype(int), np.floor(fy).astype(int)
    tx, ty = fx - x0, fy - y0
    h, w = img.shape
    ok = (x0 >= 0) & (y0 >= 0) & (x0 < w - 1) & (y0 < h - 1)
    x0c, y0c = np.clip(x0, 0, w - 2), np.clip(y0, 0, h - 2)
    v = (img[y0c, x0c] * (1 - tx) * (1 - ty) + img[y0c, x0c + 1] * tx * (1 - ty) + img[y0c + 1, x0c] * (1 - tx) * ty + img[y0c + 1, x0c + 1] * tx * ty)
    return np.where(ok, v, fill)


def read_window(href, xs, ys, res=None):
    """read the ARD raster around the given projected coordinates (optionally decimated to ~res m)"""
    pad = 40
    with rasterio.Env(**GDAL_ENV), rasterio.open(gdal_href(href)) as src:
        w = from_bounds(np.nanmin(xs) - pad, np.nanmin(ys) - pad, np.nanmax(xs) + pad, np.nanmax(ys) + pad, src.transform)
        native = abs(src.transform.a)
        f = max(1, int(round((res or native) / native)))
        shape = (max(1, int(w.height // f)), max(1, int(w.width // f)))
        arr = src.read(1, window=w, out_shape=shape, boundless=True, fill_value=src.nodata if src.nodata is not None else 0).astype(np.float64)
        tr = src.window_transform(w)
        sx, sy = tr.a * w.width / shape[1], tr.e * w.height / shape[0]
        nod = src.nodata
    if nod is not None:
        arr[arr == nod] = np.nan
    arr[arr < -1e30] = np.nan
    return arr, tr.c, tr.f, sx, sy


item = stac_item('DTEEC_001414_1780_001612_1780_U01')
print('controlled DTM:', item['id'], flush=True)

# ---------------- 1. registration: existing (PDS, uncontrolled) DTM vs USGS controlled DTM ----------------
cc, rr = np.meshgrid(np.arange(W), np.arange(H))
e_grid, n_grid = E0 + cc * se, N0 - rr * sn
X, Y = enu_to_ard_xy(e_grid, n_grid)
dtm, dx0, dy0, dsx, dsy = read_window(dtm_href(item), X, Y)
print('controlled DTM window', dtm.shape, flush=True)


def hp(z):
    """high-pass relief (removes the bowl and any absolute datum difference)"""
    z = np.where(np.isnan(z), np.nanmean(z), z)
    k = 15
    c = np.cumsum(np.cumsum(np.pad(z, k, mode='edge'), 0), 1)
    box = (c[2 * k:, 2 * k:] - c[:-2 * k, 2 * k:] - c[2 * k:, :-2 * k] + c[:-2 * k, :-2 * k]) / (2 * k) ** 2
    return z - box[:z.shape[0], :z.shape[1]]


ctrl = bilinear(dtm, (X - dx0) / dsx, (Y - dy0) / dsy)
# phase correlation over the central valid block (shift of the controlled frame relative to ours, in cells)
cy, cx, B = H // 2, W // 2, 512
A1 = hp(up[cy - B // 2:cy + B // 2, cx - B // 2:cx + B // 2])
A2 = hp(ctrl[cy - B // 2:cy + B // 2, cx - B // 2:cx + B // 2])
win = np.outer(np.hanning(B), np.hanning(B))
F = np.fft.fft2(A1 * win) * np.conj(np.fft.fft2(A2 * win))
corr = np.fft.ifft2(F / np.maximum(np.abs(F), 1e-12)).real
py, px = np.unravel_index(np.argmax(corr), corr.shape)


def sub(c, i, n):
    l, m, r = c[(i - 1) % n], c[i], c[(i + 1) % n]
    d = l - 2 * m + r
    return i + (0.5 * (l - r) / d if d != 0 else 0)


sy_ = sub(corr[:, px], py, B)
sx_ = sub(corr[py, :], px, B)
shift_r = sy_ - B if sy_ > B / 2 else sy_
shift_c = sx_ - B if sx_ > B / 2 else sx_
# ours(r, c) ~ ctrl(r - shift_r, c - shift_c): ground at our cell is at the controlled cell shifted by -shift
off_e, off_n = -shift_c * se, shift_r * sn
peak = float(corr.max())
print(f'registration: controlled frame offset east {off_e:.2f} m, north {off_n:.2f} m (peak {peak:.3f})', flush=True)
Xs, Ys = enu_to_ard_xy(e_grid + off_e, n_grid + off_n)
ctrl2 = bilinear(dtm, (Xs - dx0) / dsx, (Ys - dy0) / dsy)
d = hp(up) - hp(ctrl2)
m = valid & ~np.isnan(d)
rms_after = float(np.sqrt(np.nanmean(d[m] ** 2)))
d0 = hp(up) - hp(ctrl)
rms_before = float(np.sqrt(np.nanmean(d0[valid & ~np.isnan(d0)] ** 2)))
print(f'relief residual rms: before {rms_before:.3f} m, after {rms_after:.3f} m', flush=True)

# ---------------- 2. 0.5 m ground shade from the 25 cm orthoimage ----------------
f = int(round(1 / a.albedo_res))
AW, AH = W * f, H * f
ac, ar = np.meshgrid(np.arange(AW) / f, np.arange(AH) / f)
ea, na = E0 + ac * se + off_e, N0 - ar * sn + off_n
XA, YA = enu_to_ard_xy(ea, na)
oh = ortho_href(item, 'RED_A')
ortho, ox0, oy0, osx, osy = read_window(oh, XA, YA, res=a.albedo_res)
print('ortho window', ortho.shape, 'from', oh.split('/')[-1], flush=True)
shadow = ortho <= 0  # HiRISE DN 0 inside the image footprint = deep shadow on the crater wall, not missing data
ortho = np.where(shadow, np.nan, ortho)
g = bilinear(ortho, (XA - ox0) / osx, (YA - oy0) / osy)
in_shadow = bilinear(shadow.astype(float), (XA - ox0) / osx, (YA - oy0) / osy, 0.0) > 0.5
lo, hi = np.nanpercentile(g, 1), np.nanpercentile(g, 99.5)
t = np.clip((g - lo) / (hi - lo), 0, 1)
t = np.where(np.isnan(t), np.where(in_shadow, 0.02, 0.35), t)
# ILLUSTRATIVE soil ramp (HiRISE RED is a single 570-830 nm band): dark basaltic sand -> brown regolith -> tan outcrop
ramp_t = np.array([0.0, 0.35, 0.65, 1.0])
ramp_c = np.array([[0.20, 0.13, 0.09], [0.43, 0.27, 0.17], [0.66, 0.47, 0.32], [0.86, 0.71, 0.53]])
rgb = np.stack([np.interp(t, ramp_t, ramp_c[:, k]) for k in range(3)], -1)
Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8)).save(data / 'victoria_albedo_hr.jpg', quality=90)

# ---------------- 3. 1 m normal map relative to the render mesh's smoothed surface ----------------
z = np.where(valid, up, np.nanmean(up))


def normals(zz):
    gx = np.zeros_like(zz); gy = np.zeros_like(zz)
    gx[:, 1:-1] = (zz[:, 2:] - zz[:, :-2]) / (2 * se)          # d up / d east
    gy[1:-1, :] = (zz[:-2, :] - zz[2:, :]) / (2 * sn)          # d up / d north (rows run south)
    n = np.stack([-gx, -gy, np.ones_like(zz)], -1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)


def blur(zz, k):
    c = np.cumsum(np.cumsum(np.pad(zz, k, mode='edge'), 0), 1)
    s = 2 * k + 1
    cp = np.pad(c, ((1, 0), (1, 0)))
    return (cp[s:, s:] - cp[:-s, s:] - cp[s:, :-s] + cp[:-s, :-s])[:zz.shape[0], :zz.shape[1]] / s ** 2


nf, nc = normals(z), normals(blur(z, 1))
# express the fine normal in the frame whose z is the coarse normal (tangent ~ east, bitangent ~ north)
tt = np.cross(np.array([0.0, 1.0, 0.0]), nc); tt /= np.linalg.norm(tt, axis=-1, keepdims=True)  # east-ish
bt = np.cross(nc, tt)
ts = np.stack([(nf * tt).sum(-1), (nf * bt).sum(-1), (nf * nc).sum(-1)], -1)
ts = np.where(valid[..., None], ts, [0, 0, 1])
img = ((ts * 0.5 + 0.5) * 255).astype(np.uint8)
Image.fromarray(img).save(data / 'victoria_normal.png')

# ---------------- 4. rock / clast placement from the imagery ----------------
rng = np.random.default_rng(20070911)
slope = np.degrees(np.arccos(np.clip(nc[..., 2], -1, 1)))
bright = t[::f, ::f][:H, :W]
# 2 m ground mask for runtime clast scatter near the camera (uint8: surface brightness 0..255; 0 = outside the DTM)
mk = np.where(valid, np.clip(bright * 254 + 1, 1, 255), 0)[::2, ::2].astype(np.uint8)
mk.tofile(data / 'victoria_ground_mask.bytes')
rocks = []
# per 1 m cell: probabilities per category (0 pebble/clast, 1 cobble, 2 outcrop slab, 3 boulder)
p_slab = np.clip((bright - 0.62) * 2.2, 0, 0.9) * np.clip(slope / 12, 0.25, 1)
p_boulder = np.clip((slope - 18) / 40, 0, 0.12) * (bright > 0.45)
p_cobble = 0.02 + 0.06 * np.clip(slope / 25, 0, 1)
p_pebble = 0.35 + 0.4 * (1 - bright)
for cat, p, smin, smax, per in ((1, p_cobble, 0.15, 0.4, 1), (2, p_slab, 0.5, 2.2, 1), (3, p_boulder, 0.8, 2.0, 1)):
    for _ in range(per):
        hit = valid & (rng.random((H, W)) < p)
        rr_, cc_ = np.nonzero(hit)
        jx, jy = rng.random(len(rr_)), rng.random(len(rr_))
        e_ = E0 + (cc_ + jx) * se
        n_ = N0 - (rr_ + jy) * sn
        zz = bilinear(up, cc_ + jx, rr_ + jy, np.nan)
        sc = smin * (smax / smin) ** rng.random(len(rr_))
        yaw = rng.random(len(rr_)) * 360
        ok = ~np.isnan(zz)
        rocks.append(np.stack([e_[ok], n_[ok], zz[ok], sc[ok], yaw[ok], np.full(ok.sum(), cat)], -1))
rocks = np.concatenate(rocks).astype('<f4')
rocks.tofile(data / 'victoria_rocks.bytes')
counts = {int(k): int((rocks[:, 5] == k).sum()) for k in range(1, 4)}
print('rocks', counts, flush=True)

json.dump({
    'source': {'dtm': item['id'], 'ortho': oh, 'stac': 'https://stac.astrogeology.usgs.gov (mro_hirise_socet_dtms)'},
    'registration': {'method': 'phase correlation of high-pass relief, existing DTM vs USGS controlled DTM (same stereo pair)', 'offsetEastM': off_e, 'offsetNorthM': off_n, 'peak': peak, 'reliefRmsBeforeM': rms_before, 'reliefRmsAfterM': rms_after},
    'albedo': {'file': 'victoria_albedo_hr.jpg', 'metresPerPixel': a.albedo_res, 'size': [AW, AH], 'stretch': [float(lo), float(hi)], 'colour': 'ILLUSTRATIVE ramp: HiRISE RED is a single band'},
    'normal': {'file': 'victoria_normal.png', 'size': [W, H], 'basis': 'tangent space relative to the DTM smoothed over 3 x 3 cells'},
    'groundMask': {'file': 'victoria_ground_mask.bytes', 'size': [mk.shape[1], mk.shape[0]], 'cellM': 2 * se, 'layout': 'uint8 brightness (1..255), 0 = no terrain; rows north to south', 'use': 'runtime clast / pebble scatter near the camera (ILLUSTRATIVE shapes)'},
    'rocks': {'file': 'victoria_rocks.bytes', 'layout': 'float32 x 6: east, north, up, scale, yawDeg, category', 'counts': counts, 'categories': ['clast / pebble', 'cobble', 'outcrop slab (bright Burns formation)', 'boulder (steep slopes)'], 'note': 'placements driven by HiRISE brightness and DTM slope; shapes ILLUSTRATIVE'},
}, open(data / 'victoria_surface.json', 'w'), indent=1)
print('done', flush=True)
sys.stdout.flush()
os._exit(0)
