"""Build and render the Iron Pass battle tank source asset.

Run with:
  blender --background --python scripts/blender/render-battle-tank.py -- \
    --blend assets-src/vehicles/tank/tank.blend \
    --frames-dir /tmp/iron-doctrine-tank-frames
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


DIRECTIONS = (
    "e",
    "ese",
    "se",
    "sse",
    "s",
    "ssw",
    "sw",
    "wsw",
    "w",
    "wnw",
    "nw",
    "nnw",
    "n",
    "nne",
    "ne",
    "ene",
)


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend", required=True)
    parser.add_argument("--frames-dir", required=True)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])


def material(name: str, color: tuple[float, float, float, float], metallic=0.0, roughness=0.7):
    value = bpy.data.materials.new(name)
    value.diffuse_color = color
    value.use_nodes = True
    principled = value.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Alpha"].default_value = color[3]
    if color[3] < 1:
        value.surface_render_method = "DITHERED"
    return value


def apply_material(obj, value) -> None:
    obj.data.materials.append(value)


def box(name, location, scale, value, bevel=0.08, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Edge wear", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    apply_material(obj, value)
    return obj


def cylinder(name, location, radius, depth, value, vertices=12, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    bevel = obj.modifiers.new("Edge wear", "BEVEL")
    bevel.width = 0.045
    bevel.segments = 2
    apply_material(obj, value)
    return obj


def parent_to(obj, root) -> None:
    obj.parent = root


def build_tank():
    olive = material("Paint - sun-faded olive", (0.24, 0.29, 0.14, 1))
    olive_light = material("Paint - upper planes", (0.34, 0.38, 0.18, 1))
    olive_dark = material("Paint - recesses", (0.12, 0.16, 0.08, 1))
    rubber = material("Track rubber", (0.025, 0.03, 0.025, 1), roughness=0.95)
    steel = material("Exposed steel", (0.13, 0.15, 0.13, 1), metallic=0.35)
    brass = material("Unit marking", (0.74, 0.53, 0.15, 1), metallic=0.2)
    red = material("Faction marking", (0.48, 0.08, 0.055, 1))
    glass = material("Optics", (0.09, 0.22, 0.2, 1), metallic=0.25, roughness=0.22)

    root = bpy.data.objects.new("Battle Tank - Iron Pass", None)
    bpy.context.collection.objects.link(root)

    parts = [
        box("Lower hull", (0, 0, 0.62), (3.9, 2.25, 0.55), olive_dark, 0.16),
        box("Sloped hull", (0.12, 0, 1.05), (3.45, 1.88, 0.62), olive, 0.16),
        box("Glacis", (1.56, 0, 1.08), (0.82, 1.72, 0.52), olive_light, 0.1, (0, -0.27, 0)),
        box("Engine deck", (-1.35, 0, 1.14), (0.82, 1.7, 0.2), olive_light, 0.05),
        box("Left track", (0, 1.16, 0.48), (4.15, 0.46, 0.62), rubber, 0.2),
        box("Right track", (0, -1.16, 0.48), (4.15, 0.46, 0.62), rubber, 0.2),
        cylinder("Turret", (0.18, 0, 1.61), 0.9, 0.48, olive, vertices=10),
        box("Turret mantlet", (0.91, 0, 1.62), (0.45, 0.78, 0.44), olive_dark, 0.12),
        cylinder("Main gun", (2.05, 0, 1.66), 0.13, 2.55, steel, vertices=12, rotation=(0, math.pi / 2, 0)),
        cylinder("Muzzle brake", (3.28, 0, 1.66), 0.2, 0.38, steel, vertices=12, rotation=(0, math.pi / 2, 0)),
        cylinder("Commander hatch", (-0.08, -0.25, 1.91), 0.31, 0.11, olive_light, vertices=12),
        box("Faction plate", (-0.42, -0.91, 1.17), (0.6, 0.055, 0.24), red, 0.02),
        box("Unit stripe", (0.82, 0.94, 1.18), (0.18, 0.055, 0.44), brass, 0.02),
        cylinder("Commander's optic", (0.22, -0.48, 1.92), 0.1, 0.16, glass, vertices=8),
    ]

    for side in (-1, 1):
        for index, x in enumerate((-1.45, -0.72, 0.05, 0.82, 1.48)):
            wheel = cylinder(
                f"{'Left' if side > 0 else 'Right'} road wheel {index + 1}",
                (x, side * 1.24, 0.46),
                0.31 if index not in (0, 4) else 0.36,
                0.13,
                steel,
                vertices=12,
                rotation=(math.pi / 2, 0, 0),
            )
            parts.append(wheel)

    antenna = cylinder(
        "Radio antenna",
        (-0.48, 0.58, 2.43),
        0.025,
        1.25,
        steel,
        vertices=8,
        rotation=(0.08, 0.08, 0),
    )
    parts.append(antenna)
    for obj in parts:
        parent_to(obj, root)
    return root


def look_at(obj, target=(0, 0, 0.8)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def configure_scene():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 192
    scene.render.resolution_y = 192
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = scene.world
    world.color = (0.035, 0.045, 0.03)
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.055, 0.07, 0.045, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.65

    bpy.ops.object.light_add(type="AREA", location=(-3.8, -4.5, 8.5))
    key = bpy.context.object
    key.name = "Mediterranean key light"
    key.data.energy = 1050
    key.data.shape = "DISK"
    key.data.size = 5.0

    bpy.ops.object.light_add(type="AREA", location=(4.5, 3.5, 5))
    fill = bpy.context.object
    fill.name = "Sky fill"
    fill.data.energy = 350
    fill.data.color = (0.54, 0.65, 0.72)
    fill.data.size = 5

    bpy.ops.object.camera_add(location=(7.4, -9.2, 8.6))
    camera = bpy.context.object
    camera.name = "RTS orthographic camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 6.7
    camera.data.lens = 50
    look_at(camera)
    scene.camera = camera


def main():
    args = arguments()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    root = build_tank()
    configure_scene()

    blend_path = Path(args.blend).resolve()
    frames_dir = Path(args.frames_dir).resolve()
    blend_path.parent.mkdir(parents=True, exist_ok=True)
    frames_dir.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    scene = bpy.context.scene
    for index, direction in enumerate(DIRECTIONS):
        root.rotation_euler.z = -index * (2 * math.pi / len(DIRECTIONS))
        scene.render.filepath = str(frames_dir / f"{index:02d}-{direction}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
