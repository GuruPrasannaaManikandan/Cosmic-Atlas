"""Stage 2 prototype assets for Victoria crater (Unity, Assets/CosmicAtlas/Mars/Data).

Inputs (downloaded with approval, kept outside the repo):
  --dtm    DTEEC_001414_1780_001612_1780_U01.IMG   HiRISE DTM, 1.0119 m, equirectangular (clon 354.5), R 3396.19 km
  --ortho  PSP_001414_1780_RED_A_01_ORTHO.JP2      HiRISE RED orthoimage, 0.253 m, same projection
  --mer    mer_b_decoded.json                      NASA MER-B GLB decoded by scripts (geometry + material factors)
  --trav   MERB_traverse_5130.csv                  WUSTL traverse (CORRECTED_X/Y, metres from the landing site)
  --tie    fit_victoria.json                       Victoria tie: crater centre in traverse coordinates
Outputs into --out (unity/CosmicAtlas/Assets/CosmicAtlas/Mars/Data — NOT Resources, so only the Mars scene ships them):
  victoria_height.bytes / .json   uint16 heights in the prototype ENU frame (origin = crater centre, curvature applied)
  victoria_albedo.png             orthoimage resampled to the DTM extent (grayscale RED band — NOT colour)
  mer_b_mesh.json                 rover mesh in metres, calibrated by footprint (see notes in the json)
  victoria_route.json             rim-drive points (sols 951-1686) registered LOCALLY by the Victoria tie
Run with: python -I prepare_victoria_prototype.py --dtm ... (all paths absolute)
"""
import argparse, csv, json, math
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from rasterio.enums import Resampling
from PIL import Image

R = 3396190.0
D = math.pi / 180
CLON = 354.5  # projection central meridian (label)

ap = argparse.ArgumentParser()
for k in ('dtm', 'ortho', 'mer', 'trav', 'tie', 'fit', 'out'):
    ap.add_argument('--' + k, required=True)
a = ap.parse_args()
fit = json.load(open(a.fit))
vc = fit['T3']['victoriaCentre']
lat0, lon0 = vc['lat'], vc['lonE']


def enu(lat, lon, h):
    """exact sphere ENU of (lat, lon, h above sphere) about (lat0, lon0, 0)"""
    la, lo = lat * D, lon * D
    p = np.stack([(R + h) * np.cos(la) * np.cos(lo), (R + h) * np.cos(la) * np.sin(lo), (R + h) * np.sin(la)], -1)
    l0, g0 = lat0 * D, lon0 * D
    p0 = np.array([R * math.cos(l0) * math.cos(g0), R * math.cos(l0) * math.sin(g0), R * math.sin(l0)])
    d = p - p0
    e = np.array([-math.sin(g0), math.cos(g0), 0])
    n = np.array([-math.sin(l0) * math.cos(g0), -math.sin(l0) * math.sin(g0), math.cos(l0)])
    u = np.array([math.cos(l0) * math.cos(g0), math.cos(l0) * math.sin(g0), math.sin(l0)])
    return d @ e, d @ n, d @ u


# ---------------- terrain ----------------
with rasterio.open(a.dtm) as s:
    z = s.read(1).astype(np.float64)
    tr = s.transform
    bounds = s.bounds
z[z < -1e30] = np.nan
ny, nx = z.shape
ii, jj = np.meshgrid(np.arange(nx) + 0.5, np.arange(ny) + 0.5)
E = tr.c + ii * tr.a
N = tr.f + jj * tr.e
lat = N / R / D
lon = CLON + E / R / D
ref = float(np.nanmedian(z))  # heights are stored relative to this (Mars 2000 areoid elevation, label)
ee, nn, uu = enu(lat, lon, np.nan_to_num(z - ref))
uu[np.isnan(z)] = np.nan
# the mesh keeps a regular grid: equirectangular easting (standard parallel 0) is scaled by cos(lat0) to ground metres;
# the remaining difference to exact ENU east/north is measured and written to the metadata (planarGridVsEnuMaxM)
COSL = math.cos(lat0 * D)
grid_e = (E - (lon0 - CLON) * D * R) * COSL
grid_n = (N - lat0 * D * R)
planar_err = float(np.nanmax(np.hypot(ee - grid_e, nn - grid_n)[~np.isnan(z)]))
lo_, hi_ = float(np.nanmin(uu)), float(np.nanmax(uu))
q = np.full(uu.shape, 65535, np.uint16)
ok = ~np.isnan(uu)
q[ok] = np.round((uu[ok] - lo_) / (hi_ - lo_) * 65534).astype(np.uint16)
q.tofile(a.out + '/victoria_height.bytes')
step = (hi_ - lo_) / 65534
meta = {
    'source': 'HiRISE DTM DTEEC_001414_1780_001612_1780_U01 (MRO-M-HIRISE-5-DTM-V1.0)',
    'width': nx, 'height': ny, 'rowOrder': 'north-to-south', 'spacingM': [abs(tr.a) * COSL, abs(tr.e)], 'projectionSpacingM': [abs(tr.a), abs(tr.e)],
    'originLatLon': [lat0, lon0], 'originNote': 'Victoria crater centre fitted to the DTM rim crest (fit_traverse.py)',
    'gridEastOfOriginM': float(grid_e[0, 0]), 'gridNorthOfOriginM': float(grid_n[0, 0]),
    'upMinM': lo_, 'upMaxM': hi_, 'quantStepM': step, 'nodata': 65535,
    'elevationReferenceM': ref, 'elevationDatum': 'Mars 2000 areoid (label NOTE)',
    'curvature': 'up includes the sphere curvature about the origin (R 3396.19 km)',
    'planarGridVsEnuMaxM': planar_err,
    'validCells': int(ok.sum()), 'cells': int(q.size),
}
json.dump(meta, open(a.out + '/victoria_height.json', 'w'), indent=1)
# verification sample for the gate "terrain within 0.05 m of the DTM at 100 random points"
rng = np.random.default_rng(7)
idx = rng.choice(np.flatnonzero(ok), 100, replace=False)
back = lo_ + q.flat[idx] * step
meta_check = {'maxQuantErrM': float(np.max(np.abs(back - uu.flat[idx]))), 'samples': [
    {'col': int(i % nx), 'row': int(i // nx), 'upM': float(uu.flat[i])} for i in idx]}
json.dump(meta_check, open(a.out + '/victoria_height_check.json', 'w'))

# ---------------- albedo (orthoimage) ----------------
with rasterio.open(a.ortho) as s:
    w = from_bounds(*bounds, transform=s.transform)
    # 3072 x 4096 (block-compressible) covering exactly the DTM extent; texels are ~0.42 x 0.42 m on the ground
    tw, th = 3072, 4096
    img = s.read(1, window=w, out_shape=(th, tw), resampling=Resampling.average, boundless=True, fill_value=0)
Image.fromarray(img).save(a.out + '/victoria_albedo.png', optimize=True)

# ---------------- rover mesh ----------------
mer = json.load(open(a.mer))
P = np.concatenate([np.array(m['positions']).reshape(-1, 3) for m in mer['meshes']])
size = P.max(0) - P.min(0)  # glTF Y up; Z is the long (wing-to-wing) side
PDS = {'widthAtPanelM': 2.25, 'lengthAtPanelM': 1.51, 'heightM': 1.54}  # pds-mer-insthost
s_w = PDS['widthAtPanelM'] / size[2]
s_l = PDS['lengthAtPanelM'] / size[0]
scale = (s_w + s_l) / 2
c = (P.max(0) + P.min(0)) / 2
c[1] = P.min(0)[1]
meshes = []
for m in mer['meshes']:
    p = (np.array(m['positions']).reshape(-1, 3) - c) * scale
    meshes.append({'material': m['material'], 'color': m['color'], 'metalness': m['metalness'], 'roughness': m['roughness'],
                   'positions': np.round(p, 5).ravel().tolist(), 'normals': np.round(np.array(m['normals']), 4).tolist(),
                   'indices': m['indices']})
dims = size * scale
json.dump({
    'source': 'NASA 3D Resources: Mars Exploration Rover - Opportunity (MER-B).glb (Draco), decoded with three.js',
    'calibration': {'method': 'footprint: mean of width-at-panel and length-at-panel scales (PDS instrument host)',
                    'scaleFromModelUnits': scale, 'scaleByWidth': s_w, 'scaleByLength': s_l},
    'measuredM': {'width': float(dims[2]), 'length': float(dims[0]), 'height': float(dims[1])},
    'pdsM': PDS,
    'deviation': {'width': float(dims[2] / PDS['widthAtPanelM'] - 1), 'length': float(dims[0] / PDS['lengthAtPanelM'] - 1),
                  'height': float(dims[1] / PDS['heightM'] - 1)},
    'axes': 'x = model X (rover length), y up, z = model Z (wing to wing)',
    'meshes': meshes,
}, open(a.out + '/mer_b_mesh.json', 'w'))

# ---------------- route (locally registered) ----------------
tie = json.load(open(a.tie))['cartographic']
tcx, tcy = tie['traverseCentre']
pts = []
for r in csv.DictReader(open(a.trav)):
    s0, s1 = int(r['START_SOL']), int(r['END_SOL'])
    x, y = float(r['CORRECTED_X']), float(r['CORRECTED_Y'])
    if 951 <= s0 <= 1686 and math.hypot(x - tcx, y - tcy) < 900:
        pts.append([s0, s1, round(x - tcx, 2), round(y - tcy, 2)])
json.dump({
    'source': 'MERB_traverse_5130.csv (WUSTL / PDS Geosciences Node; not a PDS archive product)',
    'registration': 'LOCAL: translation that puts the rim-drive circle centre on the DTM rim-crest centre (fit_victoria.py). '
                    'Absolute registration of the traverse frame is unresolved (~316-335 m at Victoria: 2.8 deg rotation or ~300 m offset).',
    'localUncertaintyM': 'about 15 m RMS radial scatter on the rim drive, plus up to ~20 m if the frame is rotated 2.8 deg about the landing site',
    'fields': ['startSol', 'endSol', 'eastM', 'northM (flat arrays)'],
    'startSol': [p[0] for p in pts], 'endSol': [p[1] for p in pts], 'eastM': [p[2] for p in pts], 'northM': [p[3] for p in pts],
}, open(a.out + '/victoria_route.json', 'w'))
print(json.dumps({'terrain': meta, 'quantMaxErr': meta_check['maxQuantErrM'], 'albedo': [tw, th],
                  'rover': {'scale': scale, 'measured': dims.tolist()}, 'routePoints': len(pts)}, indent=1))
