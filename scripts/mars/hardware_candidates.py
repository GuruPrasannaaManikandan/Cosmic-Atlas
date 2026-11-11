"""
Hardware location aid for M4: find compact BRIGHT features (landers, heat shields, backshells show up in HiRISE as small
bright objects with a shadow) near the catalogue coordinate in the stretched orthoimage written by build_site.py
--check-dir, and lay the best candidates out in one labelled contact sheet for visual identification.

  python -I scripts/mars/hardware_candidates.py --gray <dir>/<site>_ortho_gray.png --res 0.5 --radius 400 --out <png>

Each tile is 48 m across, north up; its label is the candidate's offset from the site origin (east, north in metres).
The tool only proposes; a position is used only after the hardware is identified by eye (recorded in the site file).
"""
import argparse, json
import numpy as np
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument('--gray', required=True)
ap.add_argument('--res', type=float, default=0.5)
ap.add_argument('--radius', type=float, default=400)
ap.add_argument('--count', type=int, default=16)
ap.add_argument('--out', required=True)
a = ap.parse_args()

g = np.asarray(Image.open(a.gray), dtype=np.float64) / 255.0
H, W = g.shape
cy, cx = (H - 1) / 2, (W - 1) / 2


def box(z, k):
    c = np.cumsum(np.cumsum(np.pad(z, k + 1, mode='edge'), 0), 1)
    s = 2 * k + 1
    return (c[s:, s:] - c[:-s, s:] - c[s:, :-s] + c[:-s, :-s])[:z.shape[0], :z.shape[1]] / s ** 2


core = box(g, 1)                    # ~1.5 m: an object a few metres across
ring = box(g, 12)                   # ~12 m neighbourhood
score = core - ring
yy, xx = np.mgrid[0:H, 0:W]
dist = np.hypot((xx - cx) * a.res, (yy - cy) * a.res)
score[dist > a.radius] = -1
cands = []
s = score.copy()
for _ in range(a.count):
    i = int(np.argmax(s))
    y, x = divmod(i, W)
    if s[y, x] <= 0:
        break
    cands.append((x, y, float(s[y, x])))
    s[max(0, y - 30):y + 31, max(0, x - 30):x + 31] = -1  # suppress 15 m around it

T = 96  # 48 m tiles at 0.5 m/px
cols = 4
rows = (len(cands) + cols - 1) // cols
sheet = Image.new('L', (cols * T * 2, rows * (T * 2 + 14)), 0)
d = ImageDraw.Draw(sheet)
meta = []
for k, (x, y, sc) in enumerate(cands):
    tile = Image.fromarray((g[max(0, y - T // 2):y + T // 2, max(0, x - T // 2):x + T // 2] * 255).astype(np.uint8)).resize((T * 2, T * 2), Image.NEAREST)
    ox, oy = (k % cols) * T * 2, (k // cols) * (T * 2 + 14)
    sheet.paste(tile, (ox, oy + 14))
    e, n = (x - cx) * a.res, (cy - y) * a.res
    d.text((ox + 2, oy), f'#{k} E{e:+.0f} N{n:+.0f}', fill=255)
    d.rectangle([ox + T - 4, oy + 14 + T - 4, ox + T + 4, oy + 14 + T + 4], outline=255)
    meta.append({'k': k, 'eastM': e, 'northM': n, 'score': sc})
sheet.save(a.out)
print(json.dumps(meta))
