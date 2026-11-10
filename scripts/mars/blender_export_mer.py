"""
NASA 3D Resources "Mars Exploration Rover - Spirit and Opportunity.blend" -> Unity FBX (run inside Blender 5.x):

  blender -b MER.blend --python scripts/mars/blender_export_mer.py -- <unity Assets output dir>

- geometry, hierarchy and pivots are NASA's (articulated: six wheels, rockers / bogies / axles, five solar panel
  sections, the 5-part instrument arm with its turret, the Pancam mast assembly, the high-gain antenna);
- the file's pivot helper boxes (objects with no material: "Cube.*", "_root", "panels_left/right") stay in the hierarchy
  as EMPTY nodes, so joints keep their pivots but no grey helper box is drawn;
- the packed textures are written as PNG next to the FBX, and the packed tangent-space normal maps (tex_*_n.png, present
  in the file but not connected) are connected to their materials so Unity imports them as normal maps.
"""
import os, sys
import bpy

out = sys.argv[sys.argv.index('--') + 1]
tex_dir = os.path.join(out, 'Textures')
os.makedirs(tex_dir, exist_ok=True)

# 1. textures: unpacked, PNG
for img in bpy.data.images:
    if img.size[0] == 0:
        continue
    name = os.path.splitext(img.name)[0] + '.png'
    path = os.path.join(tex_dir, name)
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    img.filepath = path
    print('texture', name, tuple(img.size))

normals = {os.path.splitext(i.name)[0]: i for i in bpy.data.images if i.name.endswith('_n.png')}

# 2. materials: connect the normal maps; flat colours for the untextured foil / silver
for m in bpy.data.materials:
    if not m.node_tree:
        continue
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf:
        continue
    base = next((n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image), None)
    key = None
    if base:
        stem = os.path.splitext(base.image.name)[0]   # tex_body -> tex_body_n
        key = stem + '_n' if stem + '_n' in normals else None
    if key and not bsdf.inputs['Normal'].is_linked:
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = normals[key]; tn.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
        print('normal map', m.name, '<-', key)
    if m.name in ('foil_silver', 'Silver'):
        bsdf.inputs['Base Color'].default_value = (0.78, 0.78, 0.8, 1)
        bsdf.inputs['Metallic'].default_value = 0.9
        bsdf.inputs['Roughness'].default_value = 0.35

# 3. pivot helpers -> empties (same name, transform, parent and children)
helpers = [o for o in bpy.data.objects if o.type == 'MESH' and not any(s.material for s in o.material_slots)]
for o in helpers:
    e = bpy.data.objects.new(o.name + '_pivot', None)
    e.empty_display_size = 0.05
    for c in o.users_collection:
        c.objects.link(e)
    e.parent = o.parent
    e.matrix_world = o.matrix_world.copy()
    for ch in list(o.children):
        mw = ch.matrix_world.copy(); ch.parent = e; ch.matrix_world = mw
    name = o.name
    bpy.data.objects.remove(o, do_unlink=True)
    e.name = name
print('pivot helpers converted to empties:', len(helpers))
for o in [o for o in bpy.data.objects if o.type == 'LIGHT']:
    bpy.data.objects.remove(o, do_unlink=True)

# 4. FBX for Unity (Y up, metres)
fbx = os.path.join(out, 'MER_Opportunity.fbx')
bpy.ops.export_scene.fbx(filepath=fbx, use_selection=False, object_types={'EMPTY', 'MESH'}, apply_unit_scale=True,
                         apply_scale_options='FBX_SCALE_ALL', axis_forward='-Z', axis_up='Y', bake_space_transform=False,
                         use_mesh_modifiers=True, mesh_smooth_type='FACE', use_tspace=True, add_leaf_bones=False,
                         bake_anim=False, path_mode='RELATIVE', embed_textures=False)
print('exported', fbx, os.path.getsize(fbx))
