"""
Procedural cardboard-box character for a film: a box with a face that hops, squashes and stretches.
Renders a transparent PNG sequence that the film shows with Motion.sequence().

  blender -b -P box_character.py -- --out <film>/assets/3d/box_#### --frames 60 --fps 30 --size 800

Free: Blender (brew install --cask blender). Every key is computed from the frame number,
so a re-render gives the same images.
"""
import argparse
import math
import sys

import bpy
from mathutils import Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True, help="output path pattern, #### becomes the frame number")
ap.add_argument("--frames", type=int, default=60)
ap.add_argument("--fps", type=int, default=30)
ap.add_argument("--size", type=int, default=800)
ap.add_argument("--color", default="#c9a26b", help="cardboard colour")
a = ap.parse_args(argv)


def hex_rgba(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (1.0,)


def material(name, rgba, rough=0.8):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = rough
    return m


# empty scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
scene.render.film_transparent = True
scene.render.resolution_x = scene.render.resolution_y = a.size
scene.render.fps = a.fps
scene.frame_start, scene.frame_end = 1, a.frames
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = a.out

# the box body, with a lid seam
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
body = bpy.context.object
body.name = "Box"
body.data.transform(Matrix.Translation((0, 0, 0.5)))  # origin at the floor, so squash pins the base
bpy.ops.object.modifier_add(type="BEVEL")
body.modifiers["Bevel"].width = 0.03
body.modifiers["Bevel"].segments = 3
body.data.materials.append(material("Cardboard", hex_rgba(a.color)))
tape = material("Tape", (0.85, 0.78, 0.62, 1), 0.4)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 1.0), scale=(0.22, 1.02, 0.02))
bpy.context.object.data.materials.append(tape)
bpy.context.object.parent = body

# face: two eyes and a smile on the front (-Y) side
ink = material("Ink", (0.06, 0.06, 0.07, 1), 0.3)
for x in (-0.18, 0.18):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.06, location=(x, -0.51, 0.62))
    e = bpy.context.object
    e.scale = (1, 0.3, 1.3)
    e.data.materials.append(ink)
    e.parent = body
bpy.ops.mesh.primitive_torus_add(major_radius=0.12, minor_radius=0.018, location=(0, -0.51, 0.42), rotation=(math.pi / 2, 0, 0))
smile = bpy.context.object
smile.data.materials.append(ink)
smile.parent = body
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="DESELECT")
bpy.ops.object.mode_set(mode="OBJECT")
for v in smile.data.vertices:  # keep the lower half of the torus as a smile
    v.select = v.co.y > 0
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.delete(type="VERT")
bpy.ops.object.mode_set(mode="OBJECT")

# light and camera
bpy.ops.object.light_add(type="AREA", location=(2, -3, 4))
bpy.context.object.data.energy = 600
bpy.context.object.data.size = 4
bpy.ops.object.light_add(type="AREA", location=(-3, -1, 2))
bpy.context.object.data.energy = 150
bpy.ops.object.camera_add(location=(2.2, -3.4, 1.9))
cam = bpy.context.object
scene.camera = cam
track = cam.constraints.new("TRACK_TO")
track.target = body
track.track_axis = "TRACK_NEGATIVE_Z"
track.up_axis = "UP_Y"


def spring(t, k=320.0, c=16.0):
    """Same closed-form spring as engine/motion.js (springUnit), mass 1, from rest."""
    if t <= 0:
        return 0.0
    w0 = math.sqrt(k)
    z = c / (2 * math.sqrt(k))
    wd = w0 * math.sqrt(1 - z * z)
    return 1 + math.exp(-z * w0 * t) * (-math.cos(wd * t) - (z * w0 / wd) * math.sin(wd * t))


# hop: anticipate (squash), jump (stretch), land (squash), settle on a spring
hop = 0.5  # seconds in the air
for f in range(1, a.frames + 1):
    t = (f - 1) / a.fps
    cycle = t % 1.0
    if cycle < 0.15:  # anticipation squash
        p = cycle / 0.15
        z, sx, sz = 0.0, 1 + 0.18 * p, 1 - 0.22 * p
    elif cycle < 0.15 + hop:  # in the air: parabola, stretched by speed
        p = (cycle - 0.15) / hop
        z = 4 * 0.6 * p * (1 - p)
        v = abs(1 - 2 * p)
        sx, sz = 1 - 0.12 * v, 1 + 0.18 * v
    else:  # landing: squash that springs back to rest
        s = spring(cycle - 0.15 - hop)
        z, sx, sz = 0.0, 1 + 0.25 * (1 - s), 1 - 0.3 * (1 - s)
    body.location = (0, 0, z)
    body.scale = (sx, sx, sz)
    body.rotation_euler = (0, 0, 0.25 * math.sin(2 * math.pi * t * 0.5))
    body.keyframe_insert("location", frame=f)
    body.keyframe_insert("scale", frame=f)
    body.keyframe_insert("rotation_euler", frame=f)

bpy.ops.render.render(animation=True)
print(f"box_character: rendered {a.frames} frames to {a.out}")
