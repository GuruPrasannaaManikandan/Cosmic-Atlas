"""
Terrain package for one Mars landing site, for the Unity Mars player's SITE MODE (M4).

Inputs (read over HTTP, nothing large is downloaded): the USGS Astrogeology analysis-ready CONTROLLED HiRISE DTM and its
orthoimage for the site (mars_sites.SITES, found in the USGS STAC catalogue, collection mro_hirise_socet_dtms).

Outputs in frontend/public/mars-sites/<site>/ (served by Vite, fetched by Unity at run time):
  height.bin + terrain.json   LOCAL terrain: a square of --size m centred on the site origin, sampled from the DTM at
                              --spacing m on an exact local East-North-Up grid (curvature about the origin included),
                              uint16-quantised. The SAME format as the Victoria prototype (MarsTerrain.cs).
  albedo.jpg                  ground shade from the orthoimage at --albedo m/px over the local square, colourised with
                              the ILLUSTRATIVE soil ramp used for Victoria (HiRISE RED is a single band, not colour).
  horizon.bin + horizon.json  MID-RANGE horizon: the same controlled DTM over its whole footprint (up to --horizon m from
                              the origin) at --horizon-spacing m, with the local square cut out (nodata), same format.
  terrain_check.json          100 random local nodes: DTM height vs quantised height (verifies the quantisation).

Projection-independent: every product is sampled at the exact (lat, lon) of each ENU node through pyproj, so the
equirectangular products and Phoenix's polar-stereographic ones are handled identically.

  python -I scripts/mars/build_site.py --site viking-1 [--size 1400 --spacing 1 --albedo 0.5]
"""
import argparse, json, math, os, sys, time, zlib
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import from_bounds
from pyproj import CRS, Transformer
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mars_sites import SITES, R, stac_item, dtm_href, ortho_href, gdal_href, GDAL_ENV  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('--site', required=True, nargs='+')
ap.add_argument('--size', type=float, default=1400.0, help='local square side (m)')
ap.add_argument('--spacing', type=float, default=1.0)
ap.add_argument('--albedo', type=float, default=0.5)
ap.add_argument('--horizon', type=float, default=9000.0, help='half-size of the horizon square (m)')
ap.add_argument('--horizon-spacing', type=float, default=24.0)
ap.add_argument('--out', default=str(Path(__file__).resolve().parents[2] / 'frontend' / 'public' / 'mars-sites'))
ap.add_argument('--check-dir', default=None, help='also write the stretched orthoimage here (hardware location checks)')
a = ap.parse_args()

MARS_GEO = CRS.from_proj4(f'+proj=longlat +R={R} +no_defs')
RAMP_T = np.array([0.0, 0.35, 0.65, 1.0])
RAMP_C = np.array([[0.20, 0.13, 0.09], [0.43, 0.27, 0.17], [0.66, 0.47, 0.32], [0.86, 0.71, 0.53]])  # victoria_surface.py


class Frame:
    """exact local ENU frame about (lat0, lon0) on the Mars sphere (the inverse of the player's forward ENU)"""

    def __init__(self, lat0_deg, lon0_deg):
        self.lat0, self.lon0 = math.radians(lat0_deg), math.radians(lon0_deg)
        la, lo = self.lat0, self.lon0
        self.p0 = np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])
        self.E = np.array([-math.sin(lo), math.cos(lo), 0.0])
        self.N = np.array([-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la)])

    def latlon(self, e, n):
        v = R * self.p0 + e[..., None] * self.E + n[..., None] * self.N
        v /= np.linalg.norm(v, axis=-1, keepdims=True)
        return np.degrees(np.arcsin(v[..., 2])), np.degrees(np.arctan2(v[..., 1], v[..., 0]))

    def up(self, e, n, h):
        """local up of the surface point at (e, n) with elevation h (curvature about the origin included)"""
        v = R * self.p0 + e[..., None] * self.E + n[..., None] * self.N
        u = v / np.linalg.norm(v, axis=-1, keepdims=True)
        p = (R + h)[..., None] * u
        return ((p - R * self.p0) * self.p0).sum(-1)

    def enu_of(self, lat_deg, lon_deg):
        la, lo = math.radians(lat_deg), math.radians(lon_deg)
        v = np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)]) * R
        d = v - R * self.p0
        return float(d @ self.E), float(d @ self.N)


def sample(href, lat, lon, res=None, fill=np.nan):
    """bilinear sample of a raster at (lat, lon) arrays, in the raster's own CRS (optionally from a decimated read)"""
    with rasterio.Env(**GDAL_ENV), rasterio.open(gdal_href(href)) as src:
        tf = Transformer.from_crs(MARS_GEO, src.crs, always_xy=True)
        lon180 = ((lon + 180) % 360) - 180
        X, Y = tf.transform(lon180, lat)
        pad = 4 * abs(src.transform.a) * (1 if res is None else max(1, res / abs(src.transform.a)))
        w = from_bounds(np.nanmin(X) - pad, np.nanmin(Y) - pad, np.nanmax(X) + pad, np.nanmax(Y) + pad, src.transform)
        native = abs(src.transform.a)
        f = max(1, int(round((res or native) / native)))
        shape = (max(2, int(w.height // f)), max(2, int(w.width // f)))
        nod = src.nodata
        arr = src.read(1, window=w, out_shape=shape, boundless=True, fill_value=nod if nod is not None else 0).astype(np.float64)
        tr = src.window_transform(w)
        sx, sy = tr.a * w.width / shape[1], tr.e * w.height / shape[0]
        info = {'native': native, 'decimation': f, 'crs': src.crs.to_proj4()}
    if nod is not None:
        arr[arr == nod] = np.nan
    arr[(arr < -1e30) | (arr > 1e30)] = np.nan
    fx, fy = (X - tr.c) / sx - 0.5, (Y - tr.f) / sy - 0.5
    x0, y0 = np.floor(fx).astype(int), np.floor(fy).astype(int)
    tx, ty = fx - x0, fy - y0
    h, w_ = arr.shape
    ok = (x0 >= 0) & (y0 >= 0) & (x0 < w_ - 1) & (y0 < h - 1)
    x0c, y0c = np.clip(x0, 0, w_ - 2), np.clip(y0, 0, h - 2)
    v = (arr[y0c, x0c] * (1 - tx) * (1 - ty) + arr[y0c, x0c + 1] * tx * (1 - ty)
         + arr[y0c + 1, x0c] * (1 - tx) * ty + arr[y0c + 1, x0c + 1] * tx * ty)
    return np.where(ok, v, fill), info


def quantise(up):
    valid = ~np.isnan(up)
    lo, hi = float(np.nanmin(up)), float(np.nanmax(up))
    step = max((hi - lo) / 65534.0, 1e-4)
    q = np.where(valid, np.round((np.nan_to_num(up, nan=lo) - lo) / step), 65535).astype('<u2')
    return q, lo, hi, step


def write_grid(path_bin, path_json, up, spacing, e0, n0, meta):
    q, lo, hi, step = quantise(up)
    q.tofile(path_bin)
    m = {'width': int(up.shape[1]), 'height': int(up.shape[0]), 'rowOrder': 'north-to-south', 'spacingM': [spacing, spacing],
         'gridEastOfOriginM': e0, 'gridNorthOfOriginM': n0, 'upMinM': lo, 'upMaxM': hi, 'quantStepM': step, 'nodata': 65535,
         'validCells': int((~np.isnan(up)).sum()), 'cells': int(up.size), **meta}
    path_json.write_text(json.dumps(m, indent=1))
    return q, lo, step


def build(sid):
    t0 = time.time()
    s = SITES[sid]
    lat0, lon0 = s['hardwareLatLon']
    lon0 = lon0 - 360 if lon0 > 180 else lon0
    out = Path(a.out) / sid
    out.mkdir(parents=True, exist_ok=True)
    item = stac_item(s['dtm'])
    fr = Frame(lat0, lon0)
    print(f'[{sid}] origin {lat0:.6f}, {lon0:.6f}  DTM {item["id"]}', flush=True)

    # ---- 1. local terrain, exact ENU grid ----
    half = a.size / 2
    n_cells = int(round(a.size / a.spacing)) + 1
    ax = -half + np.arange(n_cells) * a.spacing
    ee, nn = np.meshgrid(ax, ax[::-1])  # rows run north -> south
    lat, lon = fr.latlon(ee, nn)
    h, info = sample(dtm_href(item), lat, lon)
    h0 = float(np.nanmedian(h))
    up = fr.up(ee, nn, h - h0)
    q, lo, step = write_grid(out / 'height.bin', out / 'terrain.json', up, a.spacing, float(ax[0]), float(ax[-1]), {
        'source': f'USGS Astrogeology controlled HiRISE DTM {item["id"]} (collection mro_hirise_socet_dtms)',
        'dtmUrl': dtm_href(item), 'dtmNativeM': info['native'], 'dtmCrs': info['crs'],
        'originLatLon': [lat0, lon0], 'originSource': s['source'],
        'elevationReferenceM': h0, 'elevationDatum': 'as in the DTM (USGS ARD: Mars 2015 sphere, R 3396190 m)',
        'curvature': f'up includes the sphere curvature about the origin (R {R / 1000:.2f} km)',
    })
    rng = np.random.default_rng(7)
    vc = np.argwhere(~np.isnan(up))
    pick = vc[rng.choice(len(vc), size=min(100, len(vc)), replace=False)]
    chk = [{'col': int(c), 'row': int(r), 'upM': float(up[r, c]), 'quantisedM': float(lo + q[r, c] * step)} for r, c in pick]
    (out / 'terrain_check.json').write_text(json.dumps({'samples': chk, 'maxQuantErrorM': max(abs(c['upM'] - c['quantisedM']) for c in chk)}, indent=0))
    print(f'[{sid}] local {up.shape}, valid {np.mean(~np.isnan(up)):.3f}, relief {np.nanmin(up):.1f}..{np.nanmax(up):.1f} m', flush=True)

    # ---- 2. ground shade from the orthoimage ----
    na = int(round(a.size / a.albedo)) + 1
    axa = -half + np.arange(na) * a.albedo
    ea, nb = np.meshgrid(axa, axa[::-1])
    lat_a, lon_a = fr.latlon(ea, nb)
    oh = ortho_href(item, 'RED_A')
    g, oinfo = sample(oh, lat_a, lon_a, res=a.albedo, fill=np.nan)
    g = np.where(g <= 0, np.nan, g)
    lo_g, hi_g = np.nanpercentile(g, 1), np.nanpercentile(g, 99.5)
    t = np.clip((g - lo_g) / max(hi_g - lo_g, 1e-9), 0, 1)
    t = np.where(np.isnan(t), 0.35, t)
    rgb = np.stack([np.interp(t, RAMP_T, RAMP_C[:, k]) for k in range(3)], -1)
    Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8)).save(out / 'albedo.jpg', quality=88)
    if a.check_dir:  # for hardware location checks; kept OUT of the served folder
        Path(a.check_dir).mkdir(parents=True, exist_ok=True)
        Image.fromarray((t * 255).astype(np.uint8)).save(Path(a.check_dir) / f'{sid}_ortho_gray.png')
    print(f'[{sid}] albedo {rgb.shape[:2]} from {oh.split("/")[-1]} (valid {np.mean(~np.isnan(g)):.3f})', flush=True)

    # ---- 3b. rocks and clasts: WHERE from the imagery and the DTM (as for Victoria), WHAT they look like ILLUSTRATIVE ----
    f = int(round(a.spacing / a.albedo))
    bright = t[::f, ::f][:up.shape[0], :up.shape[1]]
    valid = ~np.isnan(up)
    z = np.where(valid, up, np.nanmean(up))
    gx = np.zeros_like(z); gy = np.zeros_like(z)
    gx[:, 1:-1] = (z[:, 2:] - z[:, :-2]) / (2 * a.spacing); gy[1:-1, :] = (z[:-2, :] - z[2:, :]) / (2 * a.spacing)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    mk = np.where(valid, np.clip(bright * 254 + 1, 1, 255), 0)[::2, ::2].astype(np.uint8)
    mk.tofile(out / 'ground_mask.bin')
    rng = np.random.default_rng(zlib.crc32(sid.encode()))  # deterministic per site
    p_slab = np.clip((bright - 0.62) * 2.2, 0, 0.9) * np.clip(slope / 12, 0.25, 1) * 0.5
    p_boulder = np.clip((slope - 18) / 40, 0, 0.12) * (bright > 0.45)
    p_cobble = 0.02 + 0.06 * np.clip(slope / 25, 0, 1)
    rocks = []
    H_, W_ = up.shape
    for cat, p_, smin, smax in ((1, p_cobble, 0.15, 0.4), (2, p_slab, 0.4, 1.6), (3, p_boulder, 0.8, 2.0)):
        hit = valid & (rng.random((H_, W_)) < p_)
        rr_, cc_ = np.nonzero(hit)
        jx, jy = rng.random(len(rr_)), rng.random(len(rr_))
        e_ = ax[0] + (cc_ + jx) * a.spacing
        n_ = ax[-1] - (rr_ + jy) * a.spacing
        r0, c0 = np.clip(rr_, 0, H_ - 2), np.clip(cc_, 0, W_ - 2)
        zz = (up[r0, c0] * (1 - jx) * (1 - jy) + up[r0, c0 + 1] * jx * (1 - jy) + up[r0 + 1, c0] * (1 - jx) * jy + up[r0 + 1, c0 + 1] * jx * jy)
        sc = smin * (smax / smin) ** rng.random(len(rr_))
        ok = ~np.isnan(zz)
        rocks.append(np.stack([e_[ok], n_[ok], zz[ok], sc[ok], (rng.random(len(rr_)) * 360)[ok], np.full(ok.sum(), cat)], -1))
    rocks = np.concatenate(rocks).astype('<f4')
    rocks.tofile(out / 'rocks.bin')
    print(f'[{sid}] rocks {[(k, int((rocks[:, 5] == k).sum())) for k in (1, 2, 3)]}', flush=True)

    # ---- 3. mid-range horizon from the same DTM ----
    hs = a.horizon_spacing
    nh_ = int(round(2 * a.horizon / hs)) + 1
    axh = -a.horizon + np.arange(nh_) * hs
    eh, nh2 = np.meshgrid(axh, axh[::-1])
    lat_h, lon_h = fr.latlon(eh, nh2)
    hh, hinfo = sample(dtm_href(item), lat_h, lon_h, res=hs)
    uph = fr.up(eh, nh2, hh - h0) - 0.5  # 0.5 m below the local terrain where they overlap (no z-fighting)
    inner = (np.abs(eh) < half - 2 * hs) & (np.abs(nh2) < half - 2 * hs)  # the local square replaces the horizon here
    uph[inner] = np.nan
    write_grid(out / 'horizon.bin', out / 'horizon.json', uph, hs, float(axh[0]), float(axh[-1]), {
        'source': f'{item["id"]} decimated to ~{hs:.0f} m (same controlled DTM)', 'decimation': hinfo['decimation'],
        'cutout': f'nodes within {half - 2 * hs:.0f} m of the origin are left out (the local terrain is drawn there)',
    })
    print(f'[{sid}] horizon {uph.shape}, valid {np.mean(~np.isnan(uph)):.3f}; {time.time() - t0:.0f} s', flush=True)


failed = []
for sid in a.site:
    try:
        build(sid)
    except Exception as e:  # one site's failure must not stop the others
        failed.append(sid)
        print(f'[{sid}] FAILED: {e!r}', flush=True)
print('failed:', failed, flush=True)
sys.stdout.flush()
os._exit(1 if failed else 0)  # GDAL's curl teardown can hang on Windows at interpreter exit
