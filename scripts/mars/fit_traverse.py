"""Stage 2: establish the frame of MERB_traverse_5130.csv CORRECTED_X/Y against independent terrain.

Hypothesis H: CORRECTED_X/Y are metres east/north of the landing site (sol 1 row is exactly 0,0).
Tests:
  T1  sol-1 row is (0,0); early sols stay inside the 27 m Eagle crater DTM grid (x,y in -13..14 m)
  T2  Endurance-era points fall inside the Endurance DTM grid box (x 667.7..834.8, y -219.4..-43.2)
  T3  Victoria: circle fitted to rim-traverse points vs crater centre from the HiRISE DTM -> absolute offset
      of the landing-site origin, compared with the two published landing coordinates.
Usage: python -I fit_traverse.py <traverse.csv> <victoria_dtm.IMG> <out.json>
"""
import sys, csv, json, math
import numpy as np
import rasterio

R = 3396190.0
D = math.pi / 180
CANDIDATES = {
    'nasa-doppler': (-1.9483, 354.47417),  # NASA mission page (catalogue: Doppler/radiometric solution)
    'cartographic': (-1.9462, 354.4734),   # catalogue note: cartographic (Arvidson et al. 2004 via PDS ODE)
}

trav_path, dtm_path, out_path = sys.argv[1:4]
rows = list(csv.DictReader(open(trav_path)))
S0 = np.array([int(r['START_SOL']) for r in rows])
S1 = np.array([int(r['END_SOL']) for r in rows])
X = np.array([float(r['CORRECTED_X']) for r in rows])
Y = np.array([float(r['CORRECTED_Y']) for r in rows])
res = {'rows': len(rows), 'solRange': [int(S0.min()), int(S1.max())]}

# ---------- T1 ----------
first = rows[0]
early = (S1 <= 60)
res['T1'] = {
    'sol1Row': [float(first['CORRECTED_X']), float(first['CORRECTED_Y'])],
    'earlyRows': int(early.sum()),
    'earlyXRange': [float(X[early].min()), float(X[early].max())],
    'earlyYRange': [float(Y[early].min()), float(Y[early].max())],
}
# first sol at which the rover leaves the Eagle DTM grid
outside = np.where((X < -13) | (X > 13.99) | (Y < -12.99) | (Y > 14))[0]
res['T1']['firstSolOutsideEagleGrid'] = int(S0[outside[0]]) if len(outside) else None

# ---------- T2 ----------
inbox = (X >= 667.72) & (X <= 834.79) & (Y >= -219.43) & (Y <= -43.23)
res['T2'] = {
    'rowsInsideEnduranceGrid': int(inbox.sum()),
    'solsInside': [int(S0[inbox].min()), int(S1[inbox].max())] if inbox.any() else None,
}

# ---------- T3 ----------
with rasterio.open(dtm_path) as s:
    z = s.read(1).astype(np.float64)
    tr = s.transform
    nod = s.nodata
z[z < -1e30] = np.nan
ny, nx = z.shape
cols, rws = np.meshgrid(np.arange(nx) + 0.5, np.arange(ny) + 0.5)
E = tr.c + cols * tr.a
N = tr.f + rws * tr.e
LON0 = 354.5  # central meridian of the DTM projection (label)
lat_grid = N / R / D
lon_grid = LON0 + E / R / D

# crater centre: centroid of the deepest 2% of valid cells, refined by the rim crest circle
valid = ~np.isnan(z)
thr = np.nanpercentile(z, 2)
floor = valid & (z <= thr)
ce, cn = E[floor].mean(), N[floor].mean()
def crest(ce, cn):
    rr = np.hypot(E - ce, N - cn)
    az = np.arctan2(N - cn, E - ce)
    pts = []
    for k in range(360):
        a0 = -math.pi + k * 2 * math.pi / 360
        m = valid & (az >= a0) & (az < a0 + 2 * math.pi / 360) & (rr > 150) & (rr < 700)
        if m.sum() < 20:
            continue
        i = np.argmax(np.where(m, z, -np.inf))
        pts.append((E.flat[i], N.flat[i], rr.flat[i], a0))
    return np.array(pts)
def circfit(x, y):
    A = np.c_[2 * x, 2 * y, np.ones_like(x)]
    b = x ** 2 + y ** 2
    (cx, cy, c), *_ = np.linalg.lstsq(A, b, rcond=None)
    return cx, cy, math.sqrt(c + cx ** 2 + cy ** 2)
for _ in range(3):
    cr = crest(ce, cn)
    ce, cn, rc = circfit(cr[:, 0], cr[:, 1])
cr = crest(ce, cn)
crest_res = np.hypot(cr[:, 0] - ce, cr[:, 1] - cn) - rc
c_lat, c_lon = cn / R / D, LON0 + ce / R / D
res['T3'] = {'victoriaCentre': {'lat': c_lat, 'lonE': c_lon, 'rimCrestRadiusM': rc,
                                'crestCircleRmsM': float(np.sqrt(np.mean(crest_res ** 2))), 'crestAzimuthBins': int(len(cr))}}

def to_latlon(lat0, lon0, x, y):
    return lat0 + y / R / D, lon0 + x / (R * math.cos(lat0 * D)) / D

def to_dtm_en(lat, lon):
    return R * (lon - LON0) * D, R * lat * D

for name, (lat0, lon0) in CANDIDATES.items():
    la, lo = to_latlon(lat0, lon0, X, Y)
    e, n = to_dtm_en(la, lo)
    r = np.hypot(e - ce, n - cn)
    sel = (r > rc - 150) & (r < rc + 150)
    d = {'pointsNearRim': int(sel.sum())}
    if sel.sum() >= 10:
        cx, cy, rf = circfit(e[sel], n[sel])
        d.update({
            'solsNearRim': [int(S0[sel].min()), int(S1[sel].max())],
            'traverseCircleRadiusM': rf,
            'offsetEastM': ce - cx, 'offsetNorthM': cn - cy,
            'offsetM': math.hypot(ce - cx, cn - cy),
            'radialSpreadRmsM': float(np.sqrt(np.mean((np.hypot(e[sel] - cx, n[sel] - cy) - rf) ** 2))),
        })
        # implied landing-site origin if the circle centre coincides with the crater centre
        d['impliedOrigin'] = {'lat': lat0 + (cn - cy) / R / D, 'lonE': lon0 + (ce - cx) / (R * math.cos(lat0 * D)) / D}
    res['T3'][name] = d

# where does the final point land, relative to the published Endeavour DTM extent
for name, (lat0, lon0) in CANDIDATES.items():
    la, lo = to_latlon(lat0, lon0, X[-1], Y[-1])
    res.setdefault('finalPoint', {})[name] = {'sol': int(S1[-1]), 'lat': la, 'lonE': lo,
        'insideEndeavourDtm': bool(-2.4913260156249 <= la <= -2.1248250028995 and 354.55466193 <= lo <= 354.68871972)}

# ordering anomalies (START_SOL not monotonic)
dec = np.where(np.diff(S0) < 0)[0]
res['startSolDecreases'] = [[int(S0[i]), int(S0[i + 1])] for i in dec[:10]]
res['startSolDecreaseCount'] = int(len(dec))
json.dump(res, open(out_path, 'w'), indent=1)
print(json.dumps(res, indent=1))
