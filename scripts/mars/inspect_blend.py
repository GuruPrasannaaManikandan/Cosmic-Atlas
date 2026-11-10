"""Inspect a .blend file without Blender: parse the header, the block list and the SDNA, then list objects, meshes
(vertex/face counts), materials and parenting. Used to evaluate NASA's "Mars Exploration Rover - Spirit and
Opportunity.blend" for part-level engineering inspection (Stage 2). Read-only; nothing is executed from the file.
Usage: python -I inspect_blend.py <file.blend> <out.json>
"""
import sys, struct, json, re

path, out = sys.argv[1], sys.argv[2]
b = open(path, 'rb').read()
if b[:7] != b'BLENDER':
    raise SystemExit('not a .blend (maybe compressed)')
# legacy header: BLENDER + ptr('_'|'-') + endian('v'|'V') + version(3)  = 12 bytes
# Blender 5 header: BLENDER + header size(2) + '-' + format(2) + 'v' + version(4) = 17 bytes
if b[7:8] in (b'_', b'-'):
    ptr = 4 if b[7:8] == b'_' else 8
    end = '<' if b[8:9] == b'v' else '>'
    version = b[9:12].decode()
    off = 12
    bhead = 'legacy'
else:
    hsize = int(b[7:9])
    ptr = 8
    end = '<' if b[12:13] == b'v' else '>'
    version = b[13:17].decode()
    off = hsize
    bhead = 'large'

blocks = []
while off < len(b):
    code = b[off:off + 4]
    if bhead == 'legacy':
        size = struct.unpack(end + 'i', b[off + 4:off + 8])[0]
        old = b[off + 8:off + 8 + ptr]
        sdna, count = struct.unpack(end + 'ii', b[off + 8 + ptr:off + 16 + ptr])
        hlen = 16 + ptr
    else:  # BHead8 large: code(4) sdna(4) old(8) len(8) nr(8)
        sdna = struct.unpack(end + 'i', b[off + 4:off + 8])[0]
        old = b[off + 8:off + 16]
        size, count = struct.unpack(end + 'qq', b[off + 16:off + 32])
        hlen = 32
    data_off = off + hlen
    blocks.append((code, size, old, sdna, count, data_off))
    if code == b'ENDB':
        break
    off = data_off + size

# ---- SDNA ----
dna = next(x for x in blocks if x[0] == b'DNA1')
d = b[dna[5]:dna[5] + dna[1]]
p = 0
assert d[p:p + 4] == b'SDNA'; p += 4
def tag(t):
    global p
    assert d[p:p + 4] == t, (t, d[p:p + 4]); p += 4
def align4():
    global p
    p = (p + 3) & ~3
tag(b'NAME'); n = struct.unpack(end + 'i', d[p:p + 4])[0]; p += 4
names = []
for _ in range(n):
    e = d.index(b'\0', p); names.append(d[p:e].decode('latin1')); p = e + 1
align4(); tag(b'TYPE'); n = struct.unpack(end + 'i', d[p:p + 4])[0]; p += 4
types = []
for _ in range(n):
    e = d.index(b'\0', p); types.append(d[p:e].decode('latin1')); p = e + 1
align4(); tag(b'TLEN')
tlen = list(struct.unpack(end + 'h' * len(types), d[p:p + 2 * len(types)])); p += 2 * len(types)
align4(); tag(b'STRC'); n = struct.unpack(end + 'i', d[p:p + 4])[0]; p += 4
structs = []
for _ in range(n):
    t, nf = struct.unpack(end + 'hh', d[p:p + 4]); p += 4
    fields = []
    for _ in range(nf):
        ft, fn = struct.unpack(end + 'hh', d[p:p + 4]); p += 4
        fields.append((types[ft], names[fn]))
    structs.append((types[t], fields))
sidx = {s[0]: i for i, s in enumerate(structs)}

def fsize(ftype, fname):
    arr = 1
    for m in re.findall(r'\[(\d+)\]', fname):
        arr *= int(m)
    if fname.startswith('*') or fname.startswith('(*'):
        return ptr * arr
    return tlen[types.index(ftype)] * arr

def layout(sname):
    o = 0; lay = {}
    for ft, fn in structs[sidx[sname]][1]:
        key = re.sub(r'[\*\(\)]|\[.*', '', fn)
        lay[key] = (o, ft, fn)
        o += fsize(ft, fn)
    return lay

def read_field(block, sname, field):
    lay = layout(sname)
    if field not in lay:
        return None
    o, ft, fn = lay[field]
    base = block[5]
    if ft == 'int' and '[' not in fn and '*' not in fn:
        return struct.unpack(end + 'i', b[base + o:base + o + 4])[0]
    if ft == 'char':
        raw = b[base + o:base + o + fsize(ft, fn)]
        return raw.split(b'\0')[0].decode('utf8', 'replace')
    if '*' in fn:
        return b[base + o:base + o + ptr]
    return None

def id_name(block):
    return read_field(block, structs[block[3]][0], 'id') and None

idlay = layout('ID')
def name_of(block):
    o, ft, fn = idlay['name']
    raw = b[block[5] + o:block[5] + o + fsize(ft, fn)]
    return raw.split(b'\0')[0].decode('utf8', 'replace')

old_to_block = {blk[2]: blk for blk in blocks}
res = {'file': path.split('/')[-1].split('\\')[-1], 'blenderVersion': version, 'pointerSize': ptr, 'endian': end,
       'blocks': len(blocks), 'objects': [], 'meshes': [], 'materials': []}

mesh_lay = layout('Mesh')
vf = next((k for k in ('verts_num', 'totvert') if k in mesh_lay), None)
ff = next((k for k in ('faces_num', 'totpoly', 'totface') if k in mesh_lay), None)
for blk in blocks:
    sname = structs[blk[3]][0] if blk[3] < len(structs) else None
    code2 = blk[0][:2] if blk[0][2:] == b'\x00\x00' else blk[0]  # ID codes are 2 letters + two NULs
    if code2 == b'ME':
        res['meshes'].append({'name': name_of(blk), 'verts': read_field(blk, 'Mesh', vf) if vf else None,
                              'faces': read_field(blk, 'Mesh', ff) if ff else None})
    elif code2 == b'MA':
        res['materials'].append(name_of(blk))
    elif code2 == b'OB':
        par = read_field(blk, 'Object', 'parent')
        datap = read_field(blk, 'Object', 'data')
        parent = name_of(old_to_block[par]) if par and par in old_to_block and par != b'\0' * ptr else None
        data = name_of(old_to_block[datap]) if datap and datap in old_to_block and datap != b'\0' * ptr else None
        res['objects'].append({'name': name_of(blk), 'type': read_field(blk, 'Object', 'type'), 'parent': parent, 'data': data})

res['meshCount'] = len(res['meshes'])
res['objectCount'] = len(res['objects'])
res['totalVerts'] = sum(m['verts'] or 0 for m in res['meshes'])
res['totalFaces'] = sum(m['faces'] or 0 for m in res['meshes'])
json.dump(res, open(out, 'w'), indent=1)
print(json.dumps({k: v for k, v in res.items() if k not in ('objects', 'meshes')}, indent=1))
print('objects:', [(o['name'], o['type'], o['parent']) for o in res['objects']][:80])
print('meshes (largest):', sorted(res['meshes'], key=lambda m: -(m['verts'] or 0))[:15])
