"""Victoria tie: find the crater centre in TRAVERSE coordinates by maximising rim-drive inliers (|r - rc| < 30 m),
then compare with the crater centre from the HiRISE DTM to derive offset / rotation / scale of the traverse frame.
Usage: python -I fit_victoria.py <traverse.csv> <fit_traverse.json> <out.json>"""
import sys, csv, json, math
import numpy as np
R = 3396190.0; D = math.pi / 180
rows = list(csv.DictReader(open(sys.argv[1])))
prev = json.load(open(sys.argv[2]))
S0 = np.array([int(r['START_SOL']) for r in rows]); X = np.array([float(r['CORRECTED_X']) for r in rows]); Y = np.array([float(r['CORRECTED_Y']) for r in rows])
vc = prev['T3']['victoriaCentre']; rc = vc['rimCrestRadiusM']
out = {'rimCrestRadiusM': rc}
for name, (lat0, lon0) in {'nasa-doppler': (-1.9483, 354.47417), 'cartographic': (-1.9462, 354.4734)}.items():
    # true ENU of the crater centre from this origin
    te = (vc['lonE'] - lon0) * D * R * math.cos(lat0 * D); tn = (vc['lat'] - lat0) * D * R
    near = np.hypot(X - te, Y - tn) < 1500
    xs, ys = X[near], Y[near]
    gx = np.arange(te - 800, te + 801, 4.0); gy = np.arange(tn - 800, tn + 801, 4.0)
    best = (-1, None)
    for cx in gx:
        dx2 = (xs - cx) ** 2
        for cy in gy:
            n = np.count_nonzero(np.abs(np.sqrt(dx2 + (ys - cy) ** 2) - rc) < 30)
            if n > best[0]: best = (n, (cx, cy))
    cx, cy = best[1]
    # refine: least squares centre with radius fixed to rc on inliers
    for _ in range(20):
        r = np.hypot(xs - cx, ys - cy); inl = np.abs(r - rc) < 30
        ux, uy = (xs[inl] - cx) / r[inl], (ys[inl] - cy) / r[inl]
        e = r[inl] - rc
        J = np.c_[-ux, -uy]
        step, *_ = np.linalg.lstsq(J, -e, rcond=None)
        cx, cy = cx + step[0], cy + step[1]
    r = np.hypot(xs - cx, ys - cy); inl = np.abs(r - rc) < 30
    ang_t = math.atan2(cy, cx); ang_true = math.atan2(tn, te)
    out[name] = {
        'trueCentreENU': [te, tn], 'traverseCentre': [float(cx), float(cy)],
        'inliers': int(inl.sum()), 'pointsWithin1500m': int(near.sum()),
        'inlierSolRange': [int(S0[near][inl].min()), int(S0[near][inl].max())],
        'inlierRadialRmsM': float(np.sqrt(np.mean((r[inl] - rc) ** 2))),
        'offsetM': float(math.hypot(te - cx, tn - cy)), 'offsetEN': [float(te - cx), float(tn - cy)],
        'rotationDeg': math.degrees(ang_true - ang_t), 'scale': math.hypot(te, tn) / math.hypot(cx, cy),
        'distanceTraverse': math.hypot(cx, cy), 'distanceTrue': math.hypot(te, tn),
    }
json.dump(out, open(sys.argv[3], 'w'), indent=1); print(json.dumps(out, indent=1))
