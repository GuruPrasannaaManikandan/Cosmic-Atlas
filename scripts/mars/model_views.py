"""
Orthographic views of a converted NASA model (frontend/public/mars-sites/models/<name>.json/.bin) in the PLAYER's model
frame (glTF with z mirrored, as MarsPrototype.Sites.cs BuildGlbModel loads it; metres, base at y = 0), with a 10 cm grid
and optional labelled region boxes, so component regions can be identified on the model's own geometry and checked.

  python -I scripts/mars/model_views.py --model curiosity --out <dir> [--regions regions.json]

regions.json: {"<component>": [[x0, y0, z0, x1, y1, z1], ...]} (the format site_defs.py writes into site.json)
Writes <model>_side.png (x right, y up), <model>_front.png (z right, y up), <model>_top.png (x right, z up) and, with
--regions, the triangle count each region captures.
"""
import argparse, json
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection

ap = argparse.ArgumentParser()
ap.add_argument('--model', required=True)
ap.add_argument('--dir', default=str(Path(__file__).resolve().parents[2] / 'frontend' / 'public' / 'mars-sites' / 'models'))
ap.add_argument('--out', required=True)
ap.add_argument('--regions', default=None)
a = ap.parse_args()

doc = json.loads((Path(a.dir) / f'{a.model}.json').read_text())
bin_ = (Path(a.dir) / f'{a.model}.bin').read_bytes()
tris, cols = [], []
for p in doc['parts']:
    v = np.frombuffer(bin_, dtype='<f4', count=p['vertexCount'] * 3, offset=p['positionsOffset']).reshape(-1, 3).copy()
    v[:, 2] *= -1  # the player mirrors z
    idx = np.frombuffer(bin_, dtype='<u4', count=p['indexCount'], offset=p['indicesOffset']).reshape(-1, 3)
    t = v[idx]
    tris.append(t)
    cols.append(np.tile(np.clip(np.array(p['color']) * 1.4 + 0.08, 0, 1), (len(t), 1)))
T = np.concatenate(tris)
C = np.concatenate(cols)
lo, hi = T.reshape(-1, 3).min(0), T.reshape(-1, 3).max(0)
print('bounds', lo.round(3).tolist(), hi.round(3).tolist(), 'triangles', len(T))
regions = json.loads(Path(a.regions).read_text()) if a.regions else {}
cent = T.mean(1)
for name, boxes in regions.items():
    m = np.zeros(len(T), bool)
    for b in boxes:
        b = np.array(b)
        m |= np.all((cent >= b[:3]) & (cent <= b[3:]), axis=1)
    print(f'region {name}: {int(m.sum())} triangles')

out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
VIEWS = {'side': (0, 1, 2, False), 'front': (2, 1, 0, False), 'top': (0, 2, 1, False)}
for name, (i, j, depth, _) in VIEWS.items():
    order = np.argsort(T[:, :, depth].mean(1))  # painter's order along the view axis
    fig, ax = plt.subplots(figsize=(12, 12 * (hi[j] - lo[j] + 0.2) / (hi[i] - lo[i] + 0.2)), dpi=110)
    shade = 0.55 + 0.45 * np.abs(np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])[:, depth]) / (np.linalg.norm(np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]), axis=1) + 1e-12)
    pc = PolyCollection(T[order][:, :, [i, j]], facecolors=(C * shade[:, None])[order], edgecolors='none')
    ax.add_collection(pc)
    ax.set_xlim(lo[i] - 0.1, hi[i] + 0.1); ax.set_ylim(lo[j] - 0.1, hi[j] + 0.1); ax.set_aspect('equal')
    ax.set_xticks(np.arange(np.floor(lo[i] * 10) / 10, hi[i] + 0.1, 0.1), minor=True)
    ax.set_yticks(np.arange(np.floor(lo[j] * 10) / 10, hi[j] + 0.1, 0.1), minor=True)
    ax.grid(which='minor', lw=0.3, alpha=0.35); ax.grid(which='major', lw=0.6, alpha=0.6)
    ax.set_xlabel('xyz'[i] + ' (m)'); ax.set_ylabel('xyz'[j] + ' (m)'); ax.set_title(f'{a.model} — {name}')
    for k, (rn, boxes) in enumerate(regions.items()):
        c = plt.cm.tab20(k % 20)
        for b in boxes:
            ax.add_patch(plt.Rectangle((b[i], b[j]), b[i + 3] - b[i], b[j + 3] - b[j], fill=False, ec=c, lw=1.6))
            ax.text(b[i], b[j + 3], rn, color=c, fontsize=8, va='bottom')
    fig.tight_layout(); fig.savefig(out / f'{a.model}_{name}.png'); plt.close(fig)
