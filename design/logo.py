# uCable logo, 2000s "frutiger aero" gel style. Renders public/logo.png (transparent).
# run: /Applications/Blender.app/Contents/MacOS/Blender -b -P design/logo.py
import math
import os

import bpy

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "logo.png"))
FONT = "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf"

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def gel(name, color, transmission=0.0, roughness=0.06, metallic=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = roughness
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Coat Weight"].default_value = 0.7
    b.inputs["Coat Roughness"].default_value = 0.02
    b.inputs["Transmission Weight"].default_value = transmission
    b.inputs["IOR"].default_value = 1.45
    return m


AQUA = gel("aqua", (0.0, 0.12, 0.9), transmission=0.1)
LIME = gel("lime", (0.15, 0.8, 0.0), transmission=0.12)
GOLD = gel("gold", (1.0, 0.55, 0.03), roughness=0.2, metallic=1.0)
GLASS = gel("glass", (0.9, 0.97, 1.0), transmission=1.0, roughness=0.0)

font = bpy.data.fonts.load(FONT)


def text(s, mat):
    c = bpy.data.curves.new(s, "FONT")
    c.body, c.font, c.size = s, font, 1.7
    c.extrude, c.bevel_depth, c.bevel_resolution = 0.13, 0.04, 8
    o = bpy.data.objects.new(s, c)
    scene.collection.objects.link(o)
    o.rotation_euler = (math.pi / 2, 0, 0)  # stand the text up, facing the camera
    o.data.materials.append(mat)
    return o


def sphere(r, loc, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=48, ring_count=24)
    o = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    o.data.materials.append(mat)
    return o


u, cable = text("u", LIME), text("Cable", AQUA)
bpy.context.view_layer.update()
gap = 0.14
W = u.dimensions.x + gap + cable.dimensions.x
u.location.x = -W / 2
cable.location.x = -W / 2 + u.dimensions.x + gap

# the "cable": a golden wave under the word, a glossy plug at each end
cu = bpy.data.curves.new("wire", "CURVE")
cu.dimensions, cu.bevel_depth, cu.bevel_resolution = "3D", 0.07, 8
sp = cu.splines.new("BEZIER")
sp.bezier_points.add(3)
pts = [(-W / 2 - 0.1, 0, -0.45), (-W / 6, 0, -0.85), (W / 6, 0, -0.15), (W / 2 + 0.1, 0, -0.55)]
for p, xyz in zip(sp.bezier_points, pts):
    p.co = xyz
    p.handle_left_type = p.handle_right_type = "AUTO"
wire = bpy.data.objects.new("wire", cu)
scene.collection.objects.link(wire)
wire.data.materials.append(GOLD)
sphere(0.18, pts[0], GOLD)
sphere(0.18, pts[-1], GOLD)

# aero bubbles
sphere(0.3, (W / 2 + 0.15, -0.25, 1.5), GLASS)
sphere(0.15, (W / 2 + 0.6, -0.3, 1.0), GLASS)
sphere(0.12, (-W / 2 - 0.2, -0.3, 1.25), GLASS)

# sky-gradient world: shows up in the glossy reflections only (film is transparent)
world = bpy.data.worlds.new("sky")
scene.world = world
world.use_nodes = True
nt = world.node_tree
coord, sep, ramp = (nt.nodes.new(t) for t in ("ShaderNodeTexCoord", "ShaderNodeSeparateXYZ", "ShaderNodeValToRGB"))
nt.links.new(coord.outputs["Generated"], sep.inputs[0])
nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
nt.links.new(ramp.outputs["Color"], nt.nodes["Background"].inputs["Color"])
nt.nodes["Background"].inputs["Strength"].default_value = 0.8
ramp.color_ramp.elements[0].color = (0.02, 0.2, 0.7, 1)
ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
mid = ramp.color_ramp.elements.new(0.5)
mid.color = (0.3, 0.7, 1.0, 1)


def area(loc, energy, size, color=(1, 1, 1)):
    d = bpy.data.lights.new("a", "AREA")
    d.energy, d.size, d.color = energy, size, color
    o = bpy.data.objects.new("a", d)
    scene.collection.objects.link(o)
    o.location = loc
    t = o.constraints.new("TRACK_TO")
    t.target, t.track_axis, t.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"


target = bpy.data.objects.new("target", None)
target.location = (0, 0, 0.1)
scene.collection.objects.link(target)
area((0, -5, 5), 700, 6)
area((5, -2, 1), 400, 4, (0.8, 1.0, 0.7))
area((-5, -3, 0.5), 300, 4, (0.7, 0.9, 1.0))

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.data.lens = 75
cam.location = (1.6, -15, 1.9)
scene.collection.objects.link(cam)
t = cam.constraints.new("TRACK_TO")
t.target, t.track_axis, t.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
scene.camera = cam

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 96
scene.cycles.use_denoising = True
scene.cycles.transparent_max_bounces = 16
scene.render.film_transparent = True
scene.render.resolution_x, scene.render.resolution_y = 1800, 860
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = OUT
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.render.render(write_still=True)
print("wrote", OUT)
