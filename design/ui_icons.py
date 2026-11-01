# The four header buttons of the guide as glossy oval buttons with the icon painted on, like a 2000s decoder:
# GUIDA TV (yellow notepad), PRIMAFILA (film reel), MENU (remote), INTERATTIVI (red button).
# Output: public/ui/icon-<name>.png, transparent, 840x520 (shown ~14vh tall in the guide).
# run: /Applications/Blender.app/Contents/MacOS/Blender -b -P design/ui_icons.py
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lockups import ROOT, gel, hex_rgb, prim, stage  # noqa: E402

OUT = os.path.join(ROOT, "public", "ui")
P = bpy.ops.mesh
FACE = (math.pi / 2, 0, 0)


def button(name, build):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    rim = gel("rim", hex_rgb("#f4f8ff"), transmission=0.0)
    body = gel("body", hex_rgb("#1c5fe0"), transmission=0.1)
    hi = gel("hi", hex_rgb("#7fb8ff"), transmission=0.2)
    yellow = gel("yellow", hex_rgb("#ffd800"), transmission=0.0)
    ink = gel("ink", (0.012, 0.03, 0.12), transmission=0.0)
    pale = gel("pale", hex_rgb("#e4f0ff"), transmission=0.0)
    red = gel("red", hex_rgb("#e0201a"), transmission=0.0)

    # the oval: white rim, blue body, a lighter cap on the upper half for the "gloss"
    prim(P.primitive_uv_sphere_add, rim, (0, 0.08, 0), scale=(2.15, 0.28, 1.32), segments=64, ring_count=32)
    prim(P.primitive_uv_sphere_add, body, (0, 0, 0), scale=(2.0, 0.3, 1.2), segments=64, ring_count=32)
    prim(P.primitive_uv_sphere_add, hi, (0, -0.2, 0.42), scale=(1.55, 0.12, 0.62), segments=48, ring_count=24)
    build(dict(yellow=yellow, ink=ink, pale=pale, red=red, body=body))

    stage(scene, 4.6, 840, 520, cam_loc=(0.5, -12, 0.7))
    scene.render.filepath = os.path.join(OUT, f"icon-{name}.png")
    bpy.ops.render.render(write_still=True)
    print("icon", name)


def guida(m):  # yellow notepad with spiral and lines
    prim(P.primitive_cube_add, m["yellow"], (0, -0.4, 0.02), (0, math.radians(-14), 0), (0.68, 0.07, 0.55), size=2)
    for k in range(4):
        prim(P.primitive_uv_sphere_add, m["ink"], (-0.45 + k * 0.3, -0.5, 0.58), radius=0.08)
    for k in range(3):
        prim(P.primitive_cube_add, m["ink"], (0.02, -0.5, 0.25 - k * 0.2), (0, math.radians(-14), 0), (0.45, 0.02, 0.025), size=2)


def primafila(m):  # film reel: ring, hub, five holes
    prim(P.primitive_torus_add, m["ink"], (0, -0.4, 0), FACE, major_radius=0.62, minor_radius=0.15, major_segments=48, minor_segments=14)
    prim(P.primitive_cylinder_add, m["ink"], (0, -0.4, 0), FACE, radius=0.62, depth=0.1)
    prim(P.primitive_uv_sphere_add, m["pale"], (0, -0.5, 0), radius=0.14)
    for k in range(5):
        a = math.radians(90 + k * 72)
        prim(P.primitive_cylinder_add, m["pale"], (0.36 * math.cos(a), -0.5, 0.36 * math.sin(a)), FACE, radius=0.1, depth=0.06)


def menu(m):  # remote control
    rot = (0, math.radians(20), 0)
    prim(P.primitive_cube_add, m["ink"], (0, -0.4, 0), rot, (0.3, 0.09, 0.82), size=2)
    prim(P.primitive_uv_sphere_add, m["red"], (-0.02, -0.52, 0.5), radius=0.1)
    for k in range(3):
        for j in range(2):
            prim(P.primitive_uv_sphere_add, m["pale"], (-0.1 + j * 0.2 + 0.08 * (1 - k * 0.2), -0.52, 0.2 - k * 0.22), radius=0.08)


def interattivi(m):  # the red button
    prim(P.primitive_uv_sphere_add, m["red"], (0, -0.45, 0), radius=0.58)
    prim(P.primitive_torus_add, m["pale"], (0, -0.4, 0), FACE, major_radius=0.7, minor_radius=0.07, major_segments=48, minor_segments=10)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for n, f in (("guida", guida), ("primafila", primafila), ("menu", menu), ("interattivi", interattivi)):
        button(n, f)
