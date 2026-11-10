"""
NASA 3D Resources GLB -> part-mesh JSON for the Unity Mars player (frontend/public/mars-sites/models/<id>.json).

Keeps every mesh NODE as its own named part (node name + material), so the inspection UI can highlight the model's own
geometry (never invented hotspots). Geometry is the model's; the only change is a uniform scale CALIBRATED to one
sourced dimension, recorded with the deviation of the other axes. Draco-compressed primitives are decoded with DracoPy.
Textured materials keep the texture's mean colour (the player shades parts with flat colours; textures are not shipped).

  python -I scripts/mars/convert_glb.py --glb <file> --out <json> --model-id <id> --source "<credit>" \
      --calibrate height=2.2 [--check width=2.7 length=3.0] [--up y]

Axes: glTF (+y up, right-handed); the Unity loader mirrors z, as for the Stage 2 MER mesh.
"""
import argparse, base64, io, json, os, struct
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--glb', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--model-id', required=True)
ap.add_argument('--source', required=True)
ap.add_argument('--calibrate', required=True, help='axis=metres: height | width (x) | length (z) | footprint')
ap.add_argument('--check', nargs='*', default=[], help='axis=metres to report deviations for')
ap.add_argument('--yaw', type=float, default=0.0, help='rotate about +y (deg) so the model faces +z')
a = ap.parse_args()

raw = open(a.glb, 'rb').read()
_, _, total = struct.unpack('<III', raw[:12])
off, g, bin_ = 12, None, b''
while off < total:
    ln, kind = struct.unpack('<II', raw[off:off + 8])
    chunk = raw[off + 8:off + 8 + ln]
    if kind == 0x4E4F534A:
        g = json.loads(chunk)
    elif kind == 0x004E4942:
        bin_ = chunk
    off += 8 + ln

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def view_bytes(i):
    v = g['bufferViews'][i]
    return bin_[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']], v.get('byteStride')


def accessor(i):
    acc = g['accessors'][i]
    data, stride = view_bytes(acc['bufferView'])
    dt, n = CT[acc['componentType']], NC[acc['type']]
    base = acc.get('byteOffset', 0)
    item = np.dtype(dt).itemsize * n
    if stride and stride != item:
        rows = [np.frombuffer(data, dt, n, base + k * stride) for k in range(acc['count'])]
        arr = np.stack(rows)
    else:
        arr = np.frombuffer(data, dt, acc['count'] * n, base).reshape(acc['count'], n)
    if acc.get('normalized') and dt != np.float32:
        arr = arr.astype(np.float32) / np.iinfo(dt).max
    return arr.astype(np.float64)


def primitive_arrays(p):
    ext = p.get('extensions', {}).get('KHR_draco_mesh_compression')
    if ext:
        import DracoPy
        data, _ = view_bytes(ext['bufferView'])
        m = DracoPy.decode(data)
        pos = np.asarray(m.points, np.float64).reshape(-1, 3)
        idx = np.asarray(m.faces, np.int64).reshape(-1)
        nrm = np.asarray(m.normals, np.float64).reshape(-1, 3) if getattr(m, 'normals', None) is not None and len(m.normals) else None
        return pos, nrm, idx
    pos = accessor(p['attributes']['POSITION'])
    nrm = accessor(p['attributes']['NORMAL']) if 'NORMAL' in p['attributes'] else None
    idx = accessor(p['indices']).reshape(-1).astype(np.int64) if 'indices' in p else np.arange(len(pos))
    return pos, nrm, idx


def node_matrix(n):
    if 'matrix' in n:
        return np.array(n['matrix'], np.float64).reshape(4, 4).T
    t = np.array(n.get('translation', [0, 0, 0]), np.float64)
    x, y, z, w = n.get('rotation', [0, 0, 0, 1])
    r = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    s = np.array(n.get('scale', [1, 1, 1]), np.float64)
    m = np.eye(4)
    m[:3, :3] = r * s
    m[:3, 3] = t
    return m


_tex_cache = {}


def texture_mean(tex_index):
    if tex_index in _tex_cache:
        return _tex_cache[tex_index]
    from PIL import Image
    t = g['textures'][tex_index]
    src = t.get('source')
    for e in t.get('extensions', {}).values():
        src = e.get('source', src)
    img = g['images'][src]
    if 'bufferView' in img:
        data, _ = view_bytes(img['bufferView'])
    else:
        data = base64.b64decode(img['uri'].split(',', 1)[1])
    im = Image.open(io.BytesIO(data)).convert('RGB').resize((64, 64))
    srgb = np.asarray(im, np.float64).reshape(-1, 3) / 255
    lin = np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)
    _tex_cache[tex_index] = lin.mean(0)
    return _tex_cache[tex_index]


def material(i):
    if i is None:
        return 'default', [0.6, 0.6, 0.6], 0.0, 0.8, False
    m = g['materials'][i]
    pbr = m.get('pbrMetallicRoughness', {})
    c = np.array(pbr.get('baseColorFactor', [1, 1, 1, 1])[:3], np.float64)
    tex = 'baseColorTexture' in pbr
    if tex:
        c = c * texture_mean(pbr['baseColorTexture']['index'])
    return m.get('name', f'material{i}'), [round(float(v), 4) for v in c], float(pbr.get('metallicFactor', 1.0)), float(pbr.get('roughnessFactor', 1.0)), tex


parts = []
yaw = np.radians(a.yaw)
Y = np.array([[np.cos(yaw), 0, np.sin(yaw), 0], [0, 1, 0, 0], [-np.sin(yaw), 0, np.cos(yaw), 0], [0, 0, 0, 1]])


def walk(ni, parent):
    n = g['nodes'][ni]
    m = parent @ node_matrix(n)
    if 'mesh' in n:
        mesh = g['meshes'][n['mesh']]
        for k, p in enumerate(mesh['primitives']):
            if p.get('mode', 4) != 4:
                continue
            pos, nrm, idx = primitive_arrays(p)
            P = (m @ np.c_[pos, np.ones(len(pos))].T).T[:, :3]
            N = None
            if nrm is not None:
                nm = np.linalg.inv(m[:3, :3]).T
                N = nrm @ nm.T
                N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
            name, col, met, rough, tex = material(p.get('material'))
            parts.append({'name': n.get('name', mesh.get('name', f'node{ni}')), 'mesh': mesh.get('name'), 'material': name, 'color': col,
                          'colorFromTexture': tex, 'metalness': met, 'roughness': rough, '_P': P, '_N': N, '_I': idx})
    for c in n.get('children', []):
        walk(c, m)


scene = g['scenes'][g.get('scene', 0)]
for r in scene['nodes']:
    walk(r, Y)

allp = np.concatenate([p['_P'] for p in parts])
lo, hi = allp.min(0), allp.max(0)
size = hi - lo
# length = the larger horizontal extent, width = the smaller (independent of how the model was oriented)
axes = {'width': min(size[0], size[2]), 'height': size[1], 'length': max(size[0], size[2])}
def foot_triangle_side(P):
    """mean side of the triangle formed by the three lowest vertex clusters (lander footpads)"""
    low = P[P[:, 1] < lo[1] + 0.02 * size[1]]
    c = low[:, [0, 2]].mean(0)
    ang = np.arctan2(low[:, 2] - c[1], low[:, 0] - c[0])
    order = np.argsort(ang)
    gaps = np.diff(np.r_[ang[order], ang[order][0] + 2 * np.pi])
    cuts = np.sort(np.argsort(gaps)[-3:])  # the three largest angular gaps separate the three pads
    groups = np.split(order, cuts[:-1] + 1) if len(cuts) == 3 else [order]
    if len(groups) != 3:
        raise ValueError('could not find three footpads')
    groups[0] = np.r_[groups[0], groups[-1][len(groups[-1]):]]
    cen = [low[gi][:, [0, 2]].mean(0) for gi in groups]
    return float(np.mean([np.linalg.norm(cen[i] - cen[(i + 1) % 3]) for i in range(3)]))


if a.calibrate == 'native':
    ax, val, scale = 'native', None, 1.0
else:
    ax, val = a.calibrate.split('=')
    val = float(val)
    model_dim = foot_triangle_side(allp) if ax == 'foottriangle' else np.sqrt(size[0] * size[2]) if ax == 'footprint' else axes[ax]
    scale = val / model_dim
centre = np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])  # x/z centred, base at y = 0

measured = {k: round(float(v * scale), 4) for k, v in axes.items()}
deviation = {}
for c in a.check:
    k, v = c.split('=')
    deviation[k] = {'sourcedM': float(v), 'modelM': measured[k], 'deviation': round(measured[k] / float(v) - 1, 4)}

# binary payload <out>.bin: per part float32 positions (x,y,z), int8 normals (x,y,z), uint32 indices — offsets in the header
out_parts, blobs, tri, at = [], [], 0, 0
for p in parts:
    P = ((p['_P'] - centre) * scale).astype('<f4')
    N = p['_N'] if p['_N'] is not None else np.tile([0.0, 1.0, 0.0], (len(P), 1))
    Nq = np.clip(np.round(N * 127), -127, 127).astype('<i1')
    I = p['_I'].astype('<u4')
    q = {k: v for k, v in p.items() if not k.startswith('_')}
    q['vertexCount'], q['indexCount'] = int(len(P)), int(len(I))
    q['positionsOffset'] = at; blobs.append(P.tobytes()); at += P.nbytes
    q['normalsOffset'] = at; nb = Nq.tobytes(); pad = (-len(nb)) % 4; blobs.append(nb + bytes(pad)); at += len(nb) + pad
    q['indicesOffset'] = at; blobs.append(I.tobytes()); at += I.nbytes
    lo_p, hi_p = P.min(0), P.max(0)
    q['bounds'] = [round(float(v), 4) for v in (*lo_p, *hi_p)]
    tri += len(I) // 3
    out_parts.append(q)
bin_path = a.out[:-5] + '.bin' if a.out.endswith('.json') else a.out + '.bin'
open(bin_path, 'wb').write(b''.join(blobs))

doc = {
    'model': a.model_id,
    'source': a.source,
    'calibration': {'method': 'model is in metres (native)' if ax == 'native' else f'uniform scale so the model {ax} = {val} m (sourced)', 'scaleFromModelUnits': scale, 'measuredM': measured, 'checks': deviation},
    'axes': 'glTF: +y up, x/z centred, base at y = 0; z mirrored by the Unity loader',
    'binary': os.path.basename(bin_path),
    'binaryBytes': at,
    'parts': out_parts,
    'triangles': tri,
}
json.dump(doc, open(a.out, 'w'), separators=(',', ':'))
print(f'{a.model_id}: {len(out_parts)} parts, {tri} triangles, scale {scale:.5f}, measured {measured}, checks {deviation}')
