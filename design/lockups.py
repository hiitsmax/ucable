# Channel logos, one rule set for all 26 (see the layout comment in render()):
#   row 1 "uCable" (green u + blue Cable), row 2 the channel word, a 3D icon on the right, tightly packed,
#   same text size everywhere, same padding on all four sides. Same gel look as public/logo.png.
# Reads channels.json, writes public/channels/<slug>.png (transparent, trimmed; width varies with the word, height does not).
# run all:  /Applications/Blender.app/Contents/MacOS/Blender -b -P design/lockups.py
# run one:  /Applications/Blender.app/Contents/MacOS/Blender -b -P design/lockups.py -- calcio
import json
import math
import os
import re
import subprocess
import sys
import unicodedata

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
OUT = os.path.join(ROOT, "public", "channels")
FONT = "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf"
SYM = "/System/Library/Fonts/Apple Symbols.ttf"
UNI = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"

# accent per channel slug (sRGB hex). Edit freely, then re-run.
ACCENT = {
    "ai": "#8a5cff", "codice": "#14c25a", "tech": "#10b8ff", "retro": "#ffa400", "game": "#ff3b3b",
    "amarcord": "#ff7a1a", "musica": "#ff3fd0", "rap": "#ffc800", "night": "#5b6bff", "studio": "#00c9a7",
    "calcio": "#7bdc1e", "motori": "#e0201a", "fitness": "#ff5a2d", "mente": "#a97bff", "business": "#f0a800",
    "soldi": "#2fb344", "attualita": "#f2f6ff", "radio": "#ff6666", "comedy": "#ffd800", "cinema": "#d4141f",
    "food": "#ff4a28", "vlog": "#ff7fb0", "misteri": "#7a2cff", "scienza": "#14e0d0", "design": "#ffe6a8",
    "zapping": "#bfe0ff",
}

# channels that are a font glyph; every other slug is built from primitives in icon() below
GLYPH = {
    "ai": ("✦", UNI), "codice": ("⌨", UNI), "tech": ("⌘", UNI), "retro": ("☎", UNI),
    "musica": ("♪", UNI), "rap": ("♛", UNI), "night": ("☾", UNI), "studio": ("♯", UNI),
    "fitness": ("♥", UNI), "business": ("➚", UNI), "soldi": ("€", UNI), "comedy": ("☺", UNI),
    "vlog": ("✈", UNI), "misteri": ("?", UNI), "design": ("✎", UNI), "zapping": ("⇅", UNI),
    "scienza": ("⚛", SYM),
}


def slug(name):
    s = re.sub(r"^ucable\s+", "", name, flags=re.I)
    s = unicodedata.normalize("NFD", s)
    s = re.sub(r"[̀-ͯ]", "", s).lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def lin(c):  # sRGB 0..1 -> linear, Blender node colours are linear
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(lin(int(h[i : i + 2], 16) / 255) for i in (0, 2, 4))


def gel(name, color, transmission=0.1, roughness=0.06, metallic=0.0):
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


def prim(op, mat, loc, rot=(0, 0, 0), scale=(1, 1, 1), flat=False, **kw):
    op(location=loc, rotation=rot, **kw)
    o = bpy.context.active_object
    o.scale = scale
    (bpy.ops.object.shade_flat if flat else bpy.ops.object.shade_smooth)()
    o.data.materials.append(mat)
    return o


def icon(scene, slug, accent, pale, ink, cx, cz, s=1.0):
    """3D icon that recalls the channel, centred at (cx, 0, cz), about 1.9*s wide, facing the camera (-Y)."""
    P = bpy.ops.mesh
    face = (math.pi / 2, 0, 0)  # a torus/cylinder lies in XY by default: stand it up to face the camera

    def at(x, y, z):
        return (cx + x * s, y * s, cz + z * s)

    def sc(*v):
        return tuple(a * s for a in v)

    if slug in GLYPH:
        ch, fp = GLYPH[slug]
        c = bpy.data.curves.new(slug, "FONT")
        c.body, c.font, c.size = ch, bpy.data.fonts.load(fp), 2.3 * s
        c.align_x, c.align_y = "CENTER", "CENTER"
        c.extrude, c.bevel_depth, c.bevel_resolution, c.offset = 0.16 * s, 0.05 * s, 6, 0.03 * s  # offset thickens outline glyphs
        o = bpy.data.objects.new(slug, c)
        scene.collection.objects.link(o)
        o.rotation_euler = face
        o.location = (cx, 0, cz)
        o.data.materials.append(accent)
    elif slug == "calcio":  # football: faceted ball, light + dark patches
        o = prim(P.primitive_ico_sphere_add, accent, at(0, 0, 0), flat=True, radius=0.95 * s, subdivisions=2)
        o.data.materials.append(ink)
        for i, poly in enumerate(o.data.polygons):
            poly.material_index = 1 if i % 4 == 0 else 0
    elif slug == "motori":  # steering wheel
        prim(P.primitive_torus_add, accent, at(0, 0, 0), face, major_radius=0.8 * s, minor_radius=0.15 * s, major_segments=48, minor_segments=16)
        prim(P.primitive_uv_sphere_add, accent, at(0, 0, 0), radius=0.26 * s)
        for a in (0, 60, 120):
            prim(P.primitive_cube_add, accent, at(0, 0, 0), (0, math.radians(a), 0), sc(0.78, 0.07, 0.07), size=2)
    elif slug == "cinema":  # clapperboard
        prim(P.primitive_cube_add, accent, at(0, 0, -0.25), scale=sc(0.85, 0.1, 0.55), size=2)
        prim(P.primitive_cube_add, ink, at(-0.05, -0.02, 0.5), (0, math.radians(-14), 0), sc(0.9, 0.11, 0.16), size=2)
        for k in range(4):
            prim(P.primitive_cube_add, pale, at(-0.55 + k * 0.38, -0.12, 0.5), (0, math.radians(-14), 0), sc(0.09, 0.03, 0.17), size=2)
    elif slug == "attualita":  # globe: blue ocean, light ring, dark meridians
        ocean = gel("ocean", hex_rgb("#1566ff"), transmission=0.05)
        prim(P.primitive_uv_sphere_add, ocean, at(0, 0, 0), radius=0.85 * s)
        prim(P.primitive_torus_add, pale, at(0, 0, 0), (math.radians(70), 0, math.radians(20)), major_radius=1.08 * s, minor_radius=0.06 * s, major_segments=48, minor_segments=10)
        prim(P.primitive_torus_add, ink, at(0, 0, 0), (math.radians(90), 0, 0), major_radius=0.86 * s, minor_radius=0.035 * s, major_segments=48, minor_segments=10)
        prim(P.primitive_torus_add, ink, at(0, 0, 0), (math.radians(90), 0, math.radians(90)), major_radius=0.86 * s, minor_radius=0.035 * s, major_segments=48, minor_segments=10)
    elif slug == "radio":  # studio microphone: big head, grill ring, handle, base
        prim(P.primitive_uv_sphere_add, accent, at(0, 0, 0.4), radius=0.58 * s)
        prim(P.primitive_torus_add, pale, at(0, 0, 0.4), face, major_radius=0.6 * s, minor_radius=0.05 * s, major_segments=40, minor_segments=8)
        prim(P.primitive_cylinder_add, accent, at(0, 0, -0.45), radius=0.22 * s, depth=0.8 * s)
        prim(P.primitive_cylinder_add, accent, at(0, 0, -0.85), radius=0.5 * s, depth=0.1 * s)
    elif slug == "mente":  # focus: concentric rings around a dot
        for r in (0.88, 0.58):
            prim(P.primitive_torus_add, accent, at(0, 0, 0), face, major_radius=r * s, minor_radius=0.1 * s, major_segments=48, minor_segments=12)
        prim(P.primitive_uv_sphere_add, accent, at(0, 0, 0), radius=0.26 * s)
    elif slug == "food":  # pizza: crust, cheese disc, pepperoni
        prim(P.primitive_cylinder_add, pale, at(0, 0, 0), face, radius=0.85 * s, depth=0.16 * s)
        prim(P.primitive_torus_add, accent, at(0, 0, 0), face, major_radius=0.85 * s, minor_radius=0.1 * s, major_segments=48, minor_segments=12)
        for dx, dz in ((-0.3, 0.25), (0.35, 0.3), (0.0, -0.3), (0.45, -0.25), (-0.45, -0.2)):
            prim(P.primitive_cylinder_add, ink, at(dx, -0.09, dz), face, radius=0.16 * s, depth=0.06 * s)
    elif slug == "game":  # gamepad: body, grips, d-pad, two buttons
        prim(P.primitive_cube_add, accent, at(0, 0, 0), scale=sc(0.95, 0.2, 0.52), size=2)
        prim(P.primitive_uv_sphere_add, accent, at(-0.78, 0, -0.18), radius=0.38 * s)
        prim(P.primitive_uv_sphere_add, accent, at(0.78, 0, -0.18), radius=0.38 * s)
        prim(P.primitive_cube_add, pale, at(-0.5, -0.22, 0.05), scale=sc(0.28, 0.04, 0.08), size=2)
        prim(P.primitive_cube_add, pale, at(-0.5, -0.22, 0.05), scale=sc(0.08, 0.04, 0.28), size=2)
        prim(P.primitive_uv_sphere_add, ink, at(0.4, -0.22, 0.12), radius=0.11 * s)
        prim(P.primitive_uv_sphere_add, ink, at(0.62, -0.22, -0.06), radius=0.11 * s)
    elif slug == "amarcord":  # old TV set with antenna
        prim(P.primitive_cube_add, accent, at(0, 0, -0.1), scale=sc(0.95, 0.3, 0.7), size=2)
        prim(P.primitive_cube_add, pale, at(-0.1, -0.31, -0.1), scale=sc(0.62, 0.02, 0.5), size=2)
        for a in (-24, 24):
            prim(P.primitive_cylinder_add, ink, at(a / 40, 0, 0.95), (0, math.radians(a), 0), radius=0.045 * s, depth=0.95 * s)
        prim(P.primitive_uv_sphere_add, ink, at(0.72, -0.31, -0.1), radius=0.09 * s)
    else:  # no icon defined: a plain gem
        prim(P.primitive_uv_sphere_add, accent, at(0, 0, 0), radius=0.85 * s)


def stage(scene, scale, res_x, res_y, cam_loc=(1.2, -15, 1.2), target_loc=(0, 0, 0)):
    """Sky-gradient world (only seen in reflections), three area lights, ortho camera, Cycles + transparent film."""
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
    ramp.color_ramp.elements.new(0.5).color = (0.3, 0.7, 1.0, 1)

    target = bpy.data.objects.new("target", None)
    target.location = target_loc
    scene.collection.objects.link(target)

    def area(loc, energy, size, color=(1, 1, 1)):
        d = bpy.data.lights.new("a", "AREA")
        d.energy, d.size, d.color = energy, size, color
        o = bpy.data.objects.new("a", d)
        scene.collection.objects.link(o)
        o.location = loc
        t = o.constraints.new("TRACK_TO")
        t.target, t.track_axis, t.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"

    area((0, -5, 5), 900, 8)
    area((6, -2, 1), 500, 5, (0.8, 1.0, 0.7))
    area((-6, -3, 0.5), 400, 5, (0.7, 0.9, 1.0))

    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.type, cam.data.ortho_scale = "ORTHO", scale
    cam.location = cam_loc
    scene.collection.objects.link(cam)
    t = cam.constraints.new("TRACK_TO")
    t.target, t.track_axis, t.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
    scene.camera = cam

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.cycles.transparent_max_bounces = 16
    scene.render.film_transparent = True
    scene.render.resolution_x, scene.render.resolution_y = res_x, res_y
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"


def render(slug_, word, accent_hex, out_png):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    font = bpy.data.fonts.load(FONT)

    def text(s, mat, size):
        c = bpy.data.curves.new(s, "FONT")
        c.body, c.font, c.size = s, font, size
        c.extrude, c.bevel_depth, c.bevel_resolution = 0.13 * size / 1.7, 0.04 * size / 1.7, 8
        o = bpy.data.objects.new(s, c)
        scene.collection.objects.link(o)
        o.rotation_euler = (math.pi / 2, 0, 0)
        o.data.materials.append(mat)
        return o

    lime = gel("lime", hex_rgb("#3ddc10"))
    aqua = gel("aqua", hex_rgb("#2d6bff"))  # brighter than the old logo so it holds on the blue guide
    accent = gel("accent", tuple(0.8 * c for c in hex_rgb(accent_hex)), transmission=0.0)  # a bit darker: reflections wash gel out
    pale = gel("pale", hex_rgb("#d8ecff"), transmission=0.0)
    ink = gel("ink", (0.01, 0.015, 0.05), transmission=0.0)
    gold = gel("gold", hex_rgb("#ff8c08"), roughness=0.2, metallic=1.0, transmission=0.0)

    # Deterministic layout, the same rules for every channel (units: 1 unit = 110 px):
    #   row 1  "uCable"      size 1.52, left aligned
    #   row 2  channel word  size 1.90, left aligned, directly under row 1 (gap 0.2)
    #   icon   to the right, a bit shorter than the two rows together, 0.3 from the widest row
    # No shrink-to-fit: every logo has the same text size, a long word just makes a wider logo.
    # Afterwards the picture is trimmed to its content + the same padding on all four sides (see trim()).
    S_NAME, S_MARK, ROW_GAP, ICON_GAP = 1.9, 1.52, 0.2, 0.3
    name = text(word, accent, S_NAME)
    u, cable = text("u", lime, S_MARK), text("Cable", aqua, S_MARK)
    bpy.context.view_layer.update()
    cap = 0.72 * S_NAME  # cap height of the name row
    name.location = (0, 0, 0)
    base1 = cap + ROW_GAP
    u.location = (0, 0, base1)
    cable.location = (u.dimensions.x + 0.08, 0, base1)
    row_w = max(name.dimensions.x, u.dimensions.x + 0.08 + cable.dimensions.x)
    block_h = base1 + 0.72 * S_MARK  # from the name's baseline to the top of "uCable"
    isz = 0.78 * block_h / 1.9  # icon scale: about 1.9 units tall at scale 1; a bit smaller than the two rows together
    half = {"game": 1.3, "amarcord": 1.05, "cinema": 1.0}.get(slug_, 0.95)  # half width of the icon at scale 1 (wide ones need more room)
    icon_cx = row_w + ICON_GAP + half * isz
    icon(scene, slug_, accent, pale, ink, icon_cx, block_h / 2, isz)

    total_w = icon_cx + half * isz
    px_per_unit = 110
    scale = max(total_w + 2.0, 8.0)  # generous canvas, trimmed afterwards
    stage(scene, scale, int(scale * px_per_unit), int(8.0 * px_per_unit), cam_loc=(total_w / 2 + 0.8, -15, block_h / 2 + 0.8), target_loc=(total_w / 2, 0, block_h / 2))
    scene.render.filepath = out_png
    bpy.ops.render.render(write_still=True)


def trim(png, pad=22):
    """Crop to the content and add the SAME padding on every side. Blender's Python has no PIL: use the system python3."""
    code = (
        "import sys;from PIL import Image;p=sys.argv[1];pad=int(sys.argv[2]);im=Image.open(p).convert('RGBA');"
        "b=im.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox();w,h=b[2]-b[0],b[3]-b[1];"
        "out=Image.new('RGBA',(w+2*pad,h+2*pad),(0,0,0,0));out.paste(im.crop(b),(pad,pad));out.save(p)"
    )
    subprocess.run(["python3", "-c", code, png, str(pad)], check=True)


if __name__ == "__main__":
    only = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    os.makedirs(OUT, exist_ok=True)
    for c in json.load(open(os.path.join(ROOT, "channels.json"), encoding="utf-8")):
        s = slug(c["name"])
        if only and s not in only:
            continue
        png = os.path.join(OUT, s + ".png")
        render(s, re.sub(r"^ucable\s+", "", c["name"], flags=re.I), ACCENT.get(s, "#bfe0ff"), png)
        trim(png)
        print("logo", s)
