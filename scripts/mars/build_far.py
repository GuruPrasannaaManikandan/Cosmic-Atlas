"""
Far horizon for a Mars landing site (M5): a coarse terrain ring out to tens of kilometres, from USGS Astrogeology
CONTROLLED CTX DTMs (STAC collection mro_ctx_controlled_usgs_dtms, 20 m posts, read decimated over HTTP), mosaicked in
the site's exact ENU frame, so distant landforms (e.g. Mount Sharp seen from Bradbury Landing) stand where they are.

  far.bin / far.json      uint16 heights, same format as terrain/horizon; nodes inside the mid-range horizon square are
                          left out (the finer horizon is drawn there); datum matched to the site's HiRISE DTM
  far_albedo.jpg          ground shade from the same CTX orthoimages, colourised with the ILLUSTRATIVE soil ramp

  python -I scripts/mars/build_far.py --site curiosity [--half 50000 --spacing 250]

The site package (build_site.py) must exist: the far ring reuses its origin and elevation reference.
"""
from __future__ import annotations

import argparse, json, math, os, sys, time, urllib.request
from pathlib import Path

import numpy as np
import rasterio
from pyproj import CRS, Transformer
from rasterio.windows import from_bounds
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mars_sites import SITES, GDAL_ENV, gdal_href, stac_item, dtm_href  # noqa: E402

R = 3396190.0
MARS_GEO = CRS.from_proj4(f'+proj=longlat +R={R} +no_defs')
STAC = 'https://stac.astrogeology.usgs.gov/api/search'
RAMP_T = np.array([0.0, 0.35, 0.65, 1.0])
RAMP_C = np.array([[0.20, 0.13, 0.09], [0.43, 0.27, 0.17], [0.66, 0.47, 0.32], [0.86, 0.71, 0.53]])  # as build_site.py

ap = argparse.ArgumentParser()
ap.add_argument('--site', required=True)
ap.add_argument('--half', type=float, default=50000)
ap.add_argument('--spacing', type=float, default=250)
ap.add_argument('--albedo-spacing', type=float, default=125)
ap.add_argument('--max-items', type=int, default=400)
ap.add_argument('--cache', default=None, help='directory for the sampled CTX mosaic (re-runs skip the HTTP reads)')
ap.add_argument('--out', default=str(Path(__file__).resolve().parents[2] / 'frontend' / 'public' / 'mars-sites'))
a = ap.parse_args()


class Frame:
    """exact local ENU frame about (lat0, lon0) on the Mars sphere (same as build_site.py)"""

    def __init__(self, lat0_deg, lon0_deg):
        la, lo = math.radians(lat0_deg), math.radians(lon0_deg)
        self.p0 = np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])
        self.E = np.array([-math.sin(lo), math.cos(lo), 0.0])
        self.N = np.array([-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la)])

    def latlon(self, e, n):
        v = R * self.p0 + e[..., None] * self.E + n[..., None] * self.N
        v /= np.linalg.norm(v, axis=-1, keepdims=True)
        return np.degrees(np.arcsin(v[..., 2])), np.degrees(np.arctan2(v[..., 1], v[..., 0]))

    def up(self, e, n, h):
        v = R * self.p0 + e[..., None] * self.E + n[..., None] * self.N
        u = v / np.linalg.norm(v, axis=-1, keepdims=True)
        return (((R + h)[..., None] * u - R * self.p0) * self.p0).sum(-1)


def sample(href, lat, lon, res):
    """bilinear sample at (lat, lon) arrays from a decimated read covering just the needed part of the raster"""
    with rasterio.Env(**GDAL_ENV), rasterio.open(gdal_href(href)) as src:
        tf = Transformer.from_crs(MARS_GEO, src.crs, always_xy=True)
        X, Y = tf.transform(((lon + 180) % 360) - 180, lat)
        b = src.bounds
        inside = (X > b.left) & (X < b.right) & (Y > b.bottom) & (Y < b.top)
        out = np.full(lat.shape, np.nan)
        if not inside.any():
            return out
        native = abs(src.transform.a)
        f = max(1, int(round(res / native)))
        pad = 2 * res
        x0, x1 = max(b.left, X[inside].min() - pad), min(b.right, X[inside].max() + pad)
        y0, y1 = max(b.bottom, Y[inside].min() - pad), min(b.top, Y[inside].max() + pad)
        w = from_bounds(x0, y0, x1, y1, src.transform)
        shape = (max(2, int(w.height // f)), max(2, int(w.width // f)))
        arr = src.read(1, window=w, out_shape=shape, boundless=True, fill_value=src.nodata if src.nodata is not None else 0).astype(np.float64)
        tr = src.window_transform(w)
        nod = src.nodata
    if nod is not None:
        arr[arr == nod] = np.nan
    arr[(arr < -1e20) | (arr > 1e20)] = np.nan
    sx, sy = tr.a * w.width / shape[1], tr.e * w.height / shape[0]
    fx, fy = (X - tr.c) / sx - 0.5, (Y - tr.f) / sy - 0.5
    xi, yi = np.floor(fx).astype(int), np.floor(fy).astype(int)
    tx, ty = fx - xi, fy - yi
    h, w_ = arr.shape
    ok = inside & (xi >= 0) & (yi >= 0) & (xi < w_ - 1) & (yi < h - 1)
    xc, yc = np.clip(xi, 0, w_ - 2), np.clip(yi, 0, h - 2)
    v = (arr[yc, xc] * (1 - tx) * (1 - ty) + arr[yc, xc + 1] * tx * (1 - ty) + arr[yc + 1, xc] * (1 - tx) * ty + arr[yc + 1, xc + 1] * tx * ty)
    out[ok] = v[ok]
    return out


def write_grid(path_bin, path_json, up, spacing, e0, n0, meta):
    valid = ~np.isnan(up)
    lo, hi = float(np.nanmin(up)), float(np.nanmax(up))
    step = max((hi - lo) / 65534.0, 1e-4)
    q = np.where(valid, np.round((np.nan_to_num(up, nan=lo) - lo) / step), 65535).astype('<u2')
    q.tofile(path_bin)
    path_json.write_text(json.dumps({'width': int(up.shape[1]), 'height': int(up.shape[0]), 'rowOrder': 'north-to-south',
                                     'spacingM': [spacing, spacing], 'gridEastOfOriginM': e0, 'gridNorthOfOriginM': n0,
                                     'upMinM': lo, 'upMaxM': hi, 'quantStepM': step, 'nodata': 65535,
                                     'validCells': int(valid.sum()), 'cells': int(up.size), **meta}, indent=1))


def ctx_items(lat_box, lon_box):
    body = json.dumps({'collections': ['mro_ctx_controlled_usgs_dtms'], 'bbox': [lon_box[0], lat_box[0], lon_box[1], lat_box[1]], 'limit': 500}).encode()
    req = urllib.request.Request(STAC, data=body, headers={'Content-Type': 'application/json', 'User-Agent': 'cosmic-atlas-terrain-pipeline'})
    return json.load(urllib.request.urlopen(req, timeout=120))['features']


t0 = time.time()
sid = a.site
site_dir = Path(a.out) / sid
terr = json.loads((site_dir / 'terrain.json').read_text())
hor = json.loads((site_dir / 'horizon.json').read_text())
lat0, lon0 = terr['originLatLon']
h0 = float(terr['elevationReferenceM'])
fr = Frame(lat0, lon0)
hor_half = min(abs(hor['gridEastOfOriginM']), abs(hor['gridNorthOfOriginM']))

n = int(round(2 * a.half / a.spacing)) + 1
ax = -a.half + np.arange(n) * a.spacing
ee, nn = np.meshgrid(ax, ax[::-1])
lat, lon = fr.latlon(ee, nn)
lat_box = (float(lat.min()), float(lat.max()))
lon_e = lon % 360
lon_box = (float(lon_e.min()), float(lon_e.max())) if lon_e.max() - lon_e.min() < 180 else (float(lon.min()), float(lon.max()))
items = ctx_items(lat_box, lon_box)
print(f'[{sid}] far ring {n}x{n} at {a.spacing:.0f} m over {2 * a.half / 1000:.0f} km; {len(items)} CTX DTMs intersect', flush=True)

# greedy selection from the published footprints (no download): each step takes the DTM adding the most uncovered nodes
from matplotlib.path import Path as MPath  # noqa: E402
pts = np.stack([lon_e.ravel(), lat.ravel()], -1)


def footprint(it):
    g = it.get('geometry') or {}
    polys = g.get('coordinates', []) if g.get('type') == 'Polygon' else [p for mp in g.get('coordinates', []) for p in mp[:1]] if g.get('type') == 'MultiPolygon' else []
    if g.get('type') == 'Polygon':
        polys = polys[:1]
    m = np.zeros(len(pts), bool)
    for ring in polys:
        ring = np.array(ring, dtype=float)
        ring[:, 0] %= 360
        m |= MPath(ring).contains_points(pts)
    return m.reshape(lat.shape)


fps = [(it, footprint(it)) for it in items]
ci, cj = n // 2, n // 2


def read_item(it):
    asset = it['assets'].get('geoid_adjusted_dem') or it['assets']['dem']
    v = sample(asset['href'], lat, lon, a.spacing)
    v[(v < -9000) | (v > 4000)] = np.nan  # outside the plausible range for this region: bad posts
    return v


hgt = np.full(lat.shape, np.nan)
used, tried = [], set()
cache = Path(a.cache) / f'{sid}_far_{n}_{int(a.spacing)}_v3.npz' if a.cache else None
if cache and cache.exists():
    z = np.load(cache, allow_pickle=True)
    hgt, used = z['hgt'], list(z['used'])
    print(f'[{sid}] mosaic from cache {cache}', flush=True)
else:
    # anchor: a DTM with real data at the site (so the whole ring can be tied to the site's HiRISE DTM)
    for k, (it, fp) in sorted(enumerate(fps), key=lambda t: -int(t[1][1].sum())):
        if not fp[ci, cj] or len(tried) > 15:
            continue
        tried.add(k)
        v = read_item(it)
        if not np.isnan(v[ci - 4:ci + 5, cj - 4:cj + 5]).all():
            hgt = v
            used.append({'id': it['id'], 'cells': int((~np.isnan(v)).sum()), 'shiftM': 0.0, 'ortho': it['assets'].get('orthoimage', {}).get('href')})
            print(f'  anchor {it["id"]}: {np.mean(~np.isnan(hgt)):.1%}', flush=True)
            break
    reads = 0
    while reads < a.max_items:
        empty = np.isnan(hgt)
        gains = sorted(((int((fp & empty).sum()), k) for k, (it, fp) in enumerate(fps) if k not in tried), reverse=True)
        if not gains or gains[0][0] < 0.002 * hgt.size:
            break
        _, k = gains[0]
        tried.add(k)
        it = fps[k][0]
        reads += 1
        try:
            v = read_item(it)
        except Exception as e:
            print(f'  skip {it["id"]}: {e!r}'[:160], flush=True)
            continue
        ov = ~np.isnan(hgt) & ~np.isnan(v)
        shift = 0.0
        if ov.sum() >= 200:
            d = hgt[ov] - v[ov]
            shift = float(np.median(d))
            p90 = float(np.percentile(np.abs(d - shift), 90))
            if p90 > 60:  # disagrees with what is already there beyond a datum shift
                print(f'  reject {it["id"]}: inconsistent with neighbours (p90 {p90:.0f} m)', flush=True)
                continue
        elif hgt is not None and (~np.isnan(hgt)).any():
            continue  # cannot be tied to the mosaic yet: try again once neighbours are in
        new = np.isnan(hgt) & ~np.isnan(v)
        if new.sum() > 0.001 * hgt.size:
            hgt[new] = v[new] + shift
            used.append({'id': it['id'], 'cells': int(new.sum()), 'shiftM': round(shift, 1), 'ortho': it['assets'].get('orthoimage', {}).get('href')})
            print(f'  {it["id"]}: +{new.mean():.1%} -> {np.mean(~np.isnan(hgt)):.1%} (shift {shift:+.1f} m)', flush=True)

if cache and not cache.exists():
    cache.parent.mkdir(parents=True, exist_ok=True)
    np.savez(cache, hgt=hgt, used=np.array(used, dtype=object))
# despike: CTX DTMs carry occasional pits/spikes (failed stereo matches) that become towers at 250 m posts; a node far
# from its neighbourhood's median is replaced by that median (the 5x5 median of the valid neighbours)
import scipy.ndimage as nd  # noqa: E402
def _despike(h, size=5, tol=80.0):
    valid = ~np.isnan(h)
    filled = np.where(valid, h, np.nanmedian(h))
    med = nd.median_filter(filled, size=size)
    cnt = nd.uniform_filter(valid.astype(float), size=size)
    bad = valid & (np.abs(h - med) > tol) & (cnt > 0.5)
    out = h.copy()
    out[bad] = med[bad]
    return out, int(bad.sum())
spikes = 0
for _ in range(3):
    hgt, k = _despike(hgt)
    spikes += k
print(f'[{sid}] despiked {spikes} nodes', flush=True)

# datum: match the CTX mosaic to the site's HiRISE DTM where both exist (median difference over the horizon square)
item = stac_item(SITES[sid]['dtm'])
near = (np.abs(ee) < hor_half) & (np.abs(nn) < hor_half)
hi_v = np.full(lat.shape, np.nan)
sh_e, sh_n = SITES[sid].get('productShiftM', (0.0, 0.0))  # the HiRISE product's own frame offset (see mars_sites.py)
lat_s, lon_s = fr.latlon(ee + sh_e, nn + sh_n)
hi_v[near] = sample(dtm_href(item), lat_s[near], lon_s[near], a.spacing)
both = near & ~np.isnan(hi_v) & ~np.isnan(hgt)
offset = float(np.median(hi_v[both] - hgt[both])) if both.sum() > 20 else 0.0
spread = float(np.percentile(np.abs(hi_v[both] - hgt[both] - offset), 90)) if both.sum() > 20 else None
hgt += offset
print(f'[{sid}] datum offset HiRISE - CTX = {offset:+.1f} m over {int(both.sum())} nodes (90th pct residual {spread})', flush=True)

def finer_valid(name):
    """True at far nodes where a finer layer (the HiRISE local terrain or horizon) has data"""
    m = json.loads((site_dir / f'{name}.json').read_text())
    q = np.fromfile(site_dir / ('height.bin' if name == 'terrain' else f'{name}.bin'), dtype='<u2').reshape(m['height'], m['width'])
    sp = m['spacingM'][0]
    c = np.round((ee - m['gridEastOfOriginM']) / sp).astype(int)
    r = np.round((m['gridNorthOfOriginM'] - nn) / sp).astype(int)
    ok = (c >= 0) & (r >= 0) & (c < m['width']) & (r < m['height'])
    v = np.zeros(ee.shape, bool)
    v[ok] = q[r[ok], c[ok]] != 65535
    return v


# the far ring also fills holes in the HiRISE coverage (no void where the DTM strip ends); it is left out only where a
# finer layer has data, and dropped further next to those layers so its 250 m facets never poke through them
fine = finer_valid('terrain') | finer_valid('horizon')
up = fr.up(ee, nn, hgt - h0) - 2.0
import scipy.ndimage as nd  # noqa: E402
dist = nd.distance_transform_edt(~fine) * a.spacing
up -= np.clip(1 - (dist - a.spacing) / (4 * a.spacing), 0, 1) * 25.0
up[fine] = np.nan
write_grid(site_dir / 'far.bin', site_dir / 'far.json', up, a.spacing, float(ax[0]), float(ax[-1]), {
    'source': 'USGS Astrogeology controlled CTX DTMs (collection mro_ctx_controlled_usgs_dtms), mosaicked: ' + ', '.join(u['id'] for u in used),
    'datumOffsetM': offset, 'datumResidualP90M': spread, 'elevationReferenceM': h0, 'despikedNodes': spikes,
    'cutout': 'nodes where the HiRISE local terrain or horizon has data are left out (they are drawn there); the ring fills HiRISE gaps and drops up to 25 m beside the finer layers',
    'curvature': 'up includes the sphere curvature about the origin', 'provenance': 'MEASURED (CTX DTM, ~20 m posts, sampled at %d m)' % a.spacing,
})

# ground shade from the CTX orthoimages of the same DTMs (first that covers each node), colourised (ILLUSTRATIVE)
na = int(round(2 * a.half / a.albedo_spacing)) + 1
axa = -a.half + np.arange(na) * a.albedo_spacing
ea, nb = np.meshgrid(axa, axa[::-1])
lat_a, lon_a = fr.latlon(ea, nb)
g = np.full(lat_a.shape, np.nan)
for u in used:
    if not u['ortho'] or np.mean(~np.isnan(g)) > 0.995:
        continue
    try:
        v = sample(u['ortho'], lat_a, lon_a, a.albedo_spacing)
    except Exception as e:
        print(f'  ortho skip {u["id"]}: {e!r}'[:160], flush=True)
        continue
    v[v <= 0] = np.nan
    new = np.isnan(g) & ~np.isnan(v)
    if new.any():
        # each strip has its own exposure: match its median to what is already there where they overlap
        ov = ~np.isnan(g) & ~np.isnan(v)
        if ov.sum() > 100:
            v = v * (np.median(g[ov]) / np.median(v[ov]))
        g[new] = v[new]
lo_g, hi_g = np.nanpercentile(g, 1), np.nanpercentile(g, 99.5)
t = np.clip((g - lo_g) / max(hi_g - lo_g, 1e-9), 0, 1)
t = np.where(np.isnan(t), 0.35, t)
rgb = np.stack([np.interp(t, RAMP_T, RAMP_C[:, k]) for k in range(3)], -1)
Image.fromarray((rgb * 255).astype(np.uint8)).save(site_dir / 'far_albedo.jpg', quality=88)
meta = json.loads((site_dir / 'far.json').read_text())
meta['albedo'] = {'file': 'far_albedo.jpg', 'spacingM': a.albedo_spacing, 'source': 'CTX orthoimages of the same DTMs, colourised with an ILLUSTRATIVE soil ramp', 'valid': float(np.mean(~np.isnan(g)))}
(site_dir / 'far.json').write_text(json.dumps(meta, indent=1))
print(f'[{sid}] far ring valid {np.mean(~np.isnan(up)):.3f} (of the ring), relief {np.nanmin(up):.0f}..{np.nanmax(up):.0f} m; albedo valid {np.mean(~np.isnan(g)):.3f}; {time.time() - t0:.0f} s', flush=True)
sys.stdout.flush()
os._exit(0)
