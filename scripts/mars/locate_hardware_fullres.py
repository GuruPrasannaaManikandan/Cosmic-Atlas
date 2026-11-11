"""
Hardware location (M5): read every controlled HiRISE orthoimage of a site's DTM pair at FULL resolution (~0.25 m) in a
square around the catalogue coordinate, in the product's own projection (no resampling), and write

  <out>/<site>/<image>_overview.png    the whole square, contrast-stretched, 1 px = (2*half/1600) m, north up
  <out>/<site>/<image>_tile_<e>_<n>.png  full-resolution tiles (default 100 m) with their offsets from the catalogue point
  <out>/<site>/<image>.json             pixel -> lat/lon for that product (so a feature found by eye becomes a coordinate)

and print the ENU offset / lat-lon of any pixel given with --pick image:col:row (pixel in the full-resolution square).
The tool only cuts and converts; hardware is identified by eye and the evidence is recorded in the site definition.

  python -I scripts/mars/locate_hardware_fullres.py --site phoenix --half 400 --out <dir>
  python -I scripts/mars/locate_hardware_fullres.py --site phoenix --half 400 --out <dir> --pick PSP_008591_2485:1610:1702
"""
from __future__ import annotations

import argparse, json, math, sys
from pathlib import Path

import numpy as np
import rasterio
from pyproj import CRS, Transformer
from rasterio.windows import from_bounds
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mars_sites import SITES, GDAL_ENV, gdal_href, stac_item  # noqa: E402

R = 3396190.0
MARS_GEO = CRS.from_proj4(f'+proj=longlat +R={R} +no_defs')

ap = argparse.ArgumentParser()
ap.add_argument('--site', required=True)
ap.add_argument('--half', type=float, default=400, help='half-width of the square (m)')
ap.add_argument('--tile', type=float, default=100, help='full-resolution tile size (m); 0 = none')
ap.add_argument('--center', default=None, help='lat,lonE to centre on instead of the catalogue coordinate')
ap.add_argument('--out', required=True)
ap.add_argument('--decimate', type=int, default=1, help='read every n-th pixel (wide searches)')
ap.add_argument('--pick', action='append', default=[], help='image:col:row in the full-resolution square')
a = ap.parse_args()

s = SITES[a.site]
lat0, lon0 = (float(v) for v in a.center.split(',')) if a.center else s['hardwareLatLon']
item = stac_item(s['dtm'])
orthos = sorted({v['href'] for k, v in item['assets'].items() if (k.startswith('ortho_') or k.endswith('_ORTHO')) and 'thumbnail' not in k and 'label' not in k
                 and v['href'].lower().endswith('.tif') and '_RED_' in v['href']})
out = Path(a.out) / a.site
out.mkdir(parents=True, exist_ok=True)


def enu(lat, lon):
    la0, lo0, la, lo = map(math.radians, (lat0, lon0, lat, lon))
    p0 = np.array([math.cos(la0) * math.cos(lo0), math.cos(la0) * math.sin(lo0), math.sin(la0)])
    E = np.array([-math.sin(lo0), math.cos(lo0), 0.0])
    N = np.array([-math.sin(la0) * math.cos(lo0), -math.sin(la0) * math.sin(lo0), math.cos(la0)])
    d = R * np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)]) - R * p0
    return float(d @ E), float(d @ N)


report = {'site': a.site, 'centreLatLon': [lat0, lon0], 'images': []}
done = set()
# each observation comes as a full-resolution ortho (RED_A, ~0.25 m) and decimated ones (RED_B / RED_C): keep the finest
for href in sorted(orthos, key=lambda h: ('_RED_A_' not in h, h)):
    name = href.rsplit('/', 1)[1].split('_RED')[0]
    if name in done:
        continue
    done.add(name)
    with rasterio.Env(**GDAL_ENV), rasterio.open(gdal_href(href)) as src:
        fwd = Transformer.from_crs(MARS_GEO, src.crs, always_xy=True)
        inv = Transformer.from_crs(src.crs, MARS_GEO, always_xy=True)
        lon180 = ((lon0 + 180) % 360) - 180
        X0, Y0 = fwd.transform(lon180, lat0)
        px = abs(src.transform.a)
        w = from_bounds(X0 - a.half, Y0 - a.half, X0 + a.half, Y0 + a.half, src.transform).round_offsets().round_lengths()
        dec = max(1, a.decimate)
        arr = src.read(1, window=w, out_shape=(int(w.height // dec), int(w.width // dec)), boundless=True,
                       fill_value=src.nodata if src.nodata is not None else 0).astype(np.float64)
        tr = src.window_transform(w) * rasterio.Affine.scale(w.width / arr.shape[1], w.height / arr.shape[0])
        px = abs(tr.a)
        crs = src.crs.to_proj4()
    if src.nodata is not None:
        arr[arr == src.nodata] = np.nan
    arr[(arr < -1e30) | (arr > 1e30) | (arr <= 0)] = np.nan
    valid = float(np.mean(~np.isnan(arr)))

    def pix_latlon(col, row):
        x, y = tr.c + (col + 0.5) * tr.a, tr.f + (row + 0.5) * tr.e
        lon, lat = inv.transform(x, y)
        return lat, lon % 360

    meta = {'image': name, 'href': href, 'crs': crs, 'pixelM': px, 'shape': list(arr.shape), 'valid': valid,
            'transform': [tr.a, tr.b, tr.c, tr.d, tr.e, tr.f]}
    report['images'].append(meta)
    (out / f'{name}.json').write_text(json.dumps(meta, indent=1))
    if valid < 0.05:
        print(f'{name}: no data in this square ({valid:.2%})', flush=True)
        continue
    lo, hi = np.nanpercentile(arr, 0.5), np.nanpercentile(arr, 99.8)
    g = np.clip((np.nan_to_num(arr, nan=lo) - lo) / (hi - lo), 0, 1)
    img = Image.fromarray((g * 255).astype(np.uint8))
    ov = img.resize((1600, int(1600 * g.shape[0] / g.shape[1])), Image.LANCZOS)
    ov.save(out / f'{name}_overview.png')
    if a.tile > 0:
        tp = int(round(a.tile / px))
        for r0 in range(0, g.shape[0], tp):
            for c0 in range(0, g.shape[1], tp):
                sub = g[r0:r0 + tp, c0:c0 + tp]
                if sub.size == 0 or np.isnan(arr[r0:r0 + tp, c0:c0 + tp]).mean() > 0.9:
                    continue
                cx, cy = c0 + sub.shape[1] / 2, r0 + sub.shape[0] / 2
                e = (cx - g.shape[1] / 2) * px
                n = (g.shape[0] / 2 - cy) * px
                Image.fromarray((sub * 255).astype(np.uint8)).save(out / f'{name}_tile_E{e:+05.0f}_N{n:+05.0f}_c{c0}_r{r0}.png')
    print(f'{name}: {arr.shape} px at {px:.3f} m, valid {valid:.1%}', flush=True)
    for p in a.pick:
        im, col, row = p.split(':')
        if im != name:
            continue
        la, lo_ = pix_latlon(float(col), float(row))
        e, n = enu(la, lo_)
        print(json.dumps({'image': name, 'col': float(col), 'row': float(row), 'latDeg': round(la, 6), 'lonEastDeg': round(lo_, 6),
                          'eastM_from_catalogue': round(e, 1), 'northM_from_catalogue': round(n, 1)}), flush=True)
(out / 'report.json').write_text(json.dumps(report, indent=1))
