"""
Registration check for Mars landing sites: cut a small window of the USGS-controlled HiRISE orthoimage (cloud-optimised
GeoTIFF, read over HTTP; nothing large is downloaded) around a catalogue coordinate, so the hardware can be found in the
image and its position measured in the same frame as the controlled DTM.

  python -I scripts/mars/locate_hardware.py --out <dir> [--half 80] [--site viking-1 ...]

Writes <site>_ortho.png (north up, 0.25 m/px when a RED_A orthoimage exists) and <site>_ortho.json (the window's
geographic bounds and pixel scale, so a pixel picked in the PNG converts back to latitude / longitude).
Projection of the USGS ARD products: Mars 2015 sphere (R 3396190 m), equirectangular, clon 0, standard parallel 0.
"""
import argparse, json, math, sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import from_bounds
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import os  # noqa: E402
from mars_sites import SITES, R, stac_item, ortho_href, gdal_href, GDAL_ENV  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('--out', required=True)
ap.add_argument('--half', type=float, default=80.0, help='half-size of the window (m)')
ap.add_argument('--site', nargs='*')
a = ap.parse_args()
out = Path(a.out)
out.mkdir(parents=True, exist_ok=True)

for sid, s in SITES.items():
    if a.site and sid not in a.site:
        continue
    item = stac_item(s['dtm'])
    href = ortho_href(item, prefer='RED_A')
    lat, lon = s['hardwareLatLon']
    lon = lon - 360 if lon > 180 else lon
    x, y = R * math.radians(lon), R * math.radians(lat)
    with rasterio.Env(**GDAL_ENV), rasterio.open(gdal_href(href)) as src:
        w = from_bounds(x - a.half, y - a.half, x + a.half, y + a.half, src.transform)
        img = src.read(1, window=w, boundless=True, fill_value=0).astype(np.float64)
        tr = src.window_transform(w)
        px = abs(tr.a)
    valid = img[img > 0]
    lo, hi = (np.percentile(valid, 0.5), np.percentile(valid, 99.8)) if valid.size else (0, 1)
    png = np.clip((img - lo) / max(hi - lo, 1e-9) * 255, 0, 255).astype(np.uint8)
    Image.fromarray(png).save(out / f'{sid}_ortho.png')
    meta = {
        'site': sid, 'ortho': href, 'pixelM': px, 'shape': list(img.shape),
        'westEdgeX': tr.c, 'northEdgeY': tr.f, 'catalogueLatLon': s['hardwareLatLon'],
        'note': 'pixel (col,row) -> x = westEdgeX + (col+0.5)*pixelM, y = northEdgeY - (row+0.5)*pixelM; lat = deg(y/R), lon = deg(x/R)',
    }
    (out / f'{sid}_ortho.json').write_text(json.dumps(meta, indent=1))
    print(f'{sid}: {img.shape} at {px:.3f} m/px from {href.split("/")[-1]}', flush=True)

sys.stdout.flush()
os._exit(0)  # GDAL's curl teardown can hang on Windows at interpreter exit
