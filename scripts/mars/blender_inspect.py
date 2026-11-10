"""Inspect a .blend (run inside Blender): objects, parents, mesh sizes, world-space bounds, materials, images.
  blender -b <file.blend> --python scripts/mars/blender_inspect.py
"""
import bpy
from mathutils import Vector

print('=== scene unit scale', bpy.context.scene.unit_settings.scale_length, bpy.context.scene.unit_settings.system)
allmin, allmax = Vector((1e9,) * 3), Vector((-1e9,) * 3)
for o in sorted(bpy.data.objects, key=lambda o: o.name):
    info = f'{o.name:<34} type={o.type:<8} parent={(o.parent.name if o.parent else "-"):<24}'
    if o.type == 'MESH':
        ws = [o.matrix_world @ Vector(c) for c in o.bound_box]
        lo = Vector((min(v.x for v in ws), min(v.y for v in ws), min(v.z for v in ws)))
        hi = Vector((max(v.x for v in ws), max(v.y for v in ws), max(v.z for v in ws)))
        allmin = Vector((min(allmin[i], lo[i]) for i in range(3))); allmax = Vector((max(allmax[i], hi[i]) for i in range(3)))
        mats = [s.material.name for s in o.material_slots if s.material]
        info += f' v={len(o.data.vertices):<6} f={len(o.data.polygons):<6} size=({hi.x-lo.x:.3f},{hi.y-lo.y:.3f},{hi.z-lo.z:.3f}) centre=({(lo.x+hi.x)/2:.3f},{(lo.y+hi.y)/2:.3f},{(lo.z+hi.z)/2:.3f}) uv={len(o.data.uv_layers)} mats={mats}'
    print(info)
print('=== overall world bounds', tuple(round(v, 3) for v in allmin), tuple(round(v, 3) for v in allmax), 'size', tuple(round(allmax[i] - allmin[i], 3) for i in range(3)))
for m in bpy.data.materials:
    imgs = []
    if m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image:
                imgs.append(f'{n.image.name}({n.image.size[0]}x{n.image.size[1]})->' + ','.join(l.to_socket.name for l in n.outputs[0].links))
    print('material', m.name, imgs)
print('=== images', [(i.name, tuple(i.size), i.packed_file is not None) for i in bpy.data.images])
print('=== animations', [a.name for a in bpy.data.actions])
