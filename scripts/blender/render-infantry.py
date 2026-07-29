"""Build and render the Iron Doctrine Rifleman source asset.

Run with:
  blender --background --python scripts/blender/render-infantry.py -- \
    --blend assets-src/units/infantry/rifleman.blend \
    --frames-dir /tmp/iron-doctrine-rifleman-frames
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
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

STATE_STEPS = {
    "idle": 1,
    "move": 4,
    "fire": 2,
}


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend", required=True)
    parser.add_argument("--frames-dir", required=True)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])


def material(
    name: str,
    color: tuple[float, float, float, float],
    metallic=0.0,
    roughness=0.75,
):
    value = bpy.data.materials.new(name)
    value.diffuse_color = color
    value.use_nodes = True
    principled = value.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    return value


def apply_material(obj, value) -> None:
    obj.data.materials.append(value)


def parent_to(obj, root) -> None:
    obj.parent = root


def box(name, location, scale, value, bevel=0.035, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Soft equipment edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    apply_material(obj, value)
    return obj


def cylinder_between(name, start, end, radius, value, vertices=10):
    start_vector = Vector(start)
    end_vector = Vector(end)
    direction = end_vector - start_vector
    midpoint = (start_vector + end_vector) / 2
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=direction.length,
        location=midpoint,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    bevel = obj.modifiers.new("Soft equipment edges", "BEVEL")
    bevel.width = 0.02
    bevel.segments = 2
    apply_material(obj, value)
    return obj


def orient_between(obj, start, end) -> None:
    start_vector = Vector(start)
    end_vector = Vector(end)
    direction = end_vector - start_vector
    obj.location = (start_vector + end_vector) / 2
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()


def sphere(name, location, scale, value):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_material(obj, value)
    return obj


def build_rifleman():
    uniform = material("Uniform - field olive", (0.25, 0.3, 0.15, 1))
    uniform_light = material("Uniform - upper planes", (0.38, 0.42, 0.21, 1))
    webbing = material("Webbing", (0.16, 0.17, 0.1, 1))
    boots = material("Boot leather", (0.035, 0.04, 0.03, 1), roughness=0.95)
    skin = material("Skin", (0.48, 0.32, 0.2, 1))
    steel = material("Rifle steel", (0.08, 0.1, 0.08, 1), metallic=0.45)
    wood = material("Rifle furniture", (0.24, 0.13, 0.065, 1))
    red = material("Faction shoulder mark", (0.52, 0.08, 0.055, 1))

    root = bpy.data.objects.new("Rifleman - Iron Pass", None)
    bpy.context.collection.objects.link(root)
    upper = bpy.data.objects.new("Upper body", None)
    bpy.context.collection.objects.link(upper)
    weapon_rig = bpy.data.objects.new("Weapon rig", None)
    bpy.context.collection.objects.link(weapon_rig)
    parent_to(upper, root)
    parent_to(weapon_rig, upper)

    left_foot = box("Left boot", (-0.08, -0.18, 0.08), (0.36, 0.2, 0.15), boots)
    right_foot = box("Right boot", (-0.08, 0.18, 0.08), (0.36, 0.2, 0.15), boots)
    left_thigh = box("Left thigh", (-0.02, -0.14, 0.65), (0.2, 0.2, 0.36), uniform)
    right_thigh = box("Right thigh", (-0.02, 0.14, 0.65), (0.2, 0.2, 0.36), uniform)
    left_shin = box("Left shin", (-0.02, -0.16, 0.33), (0.18, 0.18, 0.36), uniform)
    right_shin = box("Right shin", (-0.02, 0.16, 0.33), (0.18, 0.18, 0.36), uniform)
    for obj in (
        left_foot,
        right_foot,
        left_thigh,
        right_thigh,
        left_shin,
        right_shin,
    ):
        parent_to(obj, root)

    upper_parts = [
        box("Torso", (0, 0, 1.02), (0.5, 0.46, 0.55), uniform, 0.06),
        box("Chest webbing", (0.2, 0, 1.06), (0.08, 0.36, 0.38), webbing, 0.025),
        box("Backpack", (-0.28, 0, 1.05), (0.2, 0.38, 0.46), webbing, 0.05),
        sphere("Head", (0.03, 0, 1.49), (0.18, 0.17, 0.2), skin),
        sphere("Steel helmet", (0.01, 0, 1.62), (0.25, 0.23, 0.12), uniform_light),
        box("Shoulder mark", (0.02, -0.25, 1.18), (0.19, 0.035, 0.16), red, 0.01),
        cylinder_between(
            "Rear arm",
            (0.06, 0.21, 1.2),
            (0.38, 0.13, 1.02),
            0.075,
            uniform,
        ),
    ]
    for obj in upper_parts:
        parent_to(obj, upper)

    weapon_parts = [
        box("Rifle stock", (0.46, -0.11, 1.03), (0.64, 0.09, 0.12), wood, 0.025),
        box("Rifle receiver", (0.68, -0.11, 1.04), (0.28, 0.1, 0.11), steel, 0.02),
        cylinder_between(
            "Rifle barrel",
            (0.78, -0.11, 1.04),
            (1.38, -0.11, 1.04),
            0.035,
            steel,
            vertices=8,
        ),
        cylinder_between(
            "Forward arm",
            (0.06, -0.21, 1.2),
            (0.58, -0.13, 1.03),
            0.075,
            uniform,
        ),
        sphere("Forward hand", (0.59, -0.13, 1.03), (0.08, 0.07, 0.07), skin),
    ]
    for obj in weapon_parts:
        parent_to(obj, weapon_rig)

    return {
        "root": root,
        "upper": upper,
        "weapon_rig": weapon_rig,
        "left_foot": left_foot,
        "right_foot": right_foot,
        "left_thigh": left_thigh,
        "right_thigh": right_thigh,
        "left_shin": left_shin,
        "right_shin": right_shin,
    }


def pose_leg(rig, side: str, foot_x: float, lift: float, knee_bias: float) -> None:
    side_sign = -1 if side == "left" else 1
    hip = Vector((-0.02, side_sign * 0.13, 0.82))
    ankle = Vector((foot_x, side_sign * 0.18, 0.18 + lift))
    knee = (hip + ankle) / 2
    knee.x += knee_bias

    foot = rig[f"{side}_foot"]
    foot.location = (foot_x + 0.06, side_sign * 0.18, 0.08 + lift)
    foot.rotation_euler = (0, -0.16 if lift else 0, 0)
    orient_between(rig[f"{side}_thigh"], hip, knee)
    orient_between(rig[f"{side}_shin"], knee, ankle)


def pose_rifleman(rig, state: str, step: int) -> None:
    rig["upper"].location = (0, 0, 0)
    rig["upper"].rotation_euler = (0, 0, 0)
    rig["weapon_rig"].location = (0, 0, 0)
    pose_leg(rig, "left", -0.02, 0, 0)
    pose_leg(rig, "right", -0.02, 0, 0)

    if state == "move":
        gait = (
            ((0.16, 0, 0.07), (-0.25, 0, 0.04), 0.0, -0.015, 0.025),
            ((-0.04, 0, 0.06), (0.02, 0.11, 0.1), 0.025, 0.025, -0.015),
            ((-0.25, 0, 0.04), (0.16, 0, 0.07), 0.0, 0.015, -0.025),
            ((0.02, 0.11, 0.1), (-0.04, 0, 0.06), 0.025, -0.025, 0.015),
        )
        left, right, body_lift, body_sway, body_pitch = gait[step]
        pose_leg(rig, "left", *left)
        pose_leg(rig, "right", *right)
        rig["upper"].location = (-body_pitch * 0.35, body_sway, body_lift)
        rig["upper"].rotation_euler.y = body_pitch
        rig["weapon_rig"].location.x = -body_pitch * 0.45
    elif state == "fire":
        recoil = 0.12 if step == 0 else 0.045
        rig["weapon_rig"].location.x = -recoil
        rig["upper"].location.x = -recoil * 0.08


def look_at(obj, target=(0, 0, 0.8)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def validate_camera_alignment(scene, camera) -> None:
    origin = world_to_camera_view(scene, camera, Vector((0, 0, 0.8)))
    east = world_to_camera_view(scene, camera, Vector((1, 0, 0.8)))
    screen_angle = math.atan2(-(east.y - origin.y), east.x - origin.x)
    if not math.isclose(screen_angle, 0, abs_tol=1e-6):
        raise RuntimeError(
            f"Camera projects model east at {math.degrees(screen_angle):.3f} degrees"
        )


def configure_scene():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 128
    scene.render.resolution_y = 128
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

    bpy.ops.object.light_add(type="AREA", location=(-3.2, -4.2, 7))
    key = bpy.context.object
    key.name = "Mediterranean key light"
    key.data.energy = 720
    key.data.shape = "DISK"
    key.data.size = 4

    bpy.ops.object.light_add(type="AREA", location=(3.5, 2.5, 4.5))
    fill = bpy.context.object
    fill.name = "Sky fill"
    fill.data.energy = 240
    fill.data.color = (0.54, 0.65, 0.72)
    fill.data.size = 4

    bpy.ops.object.camera_add(location=(0, -7, 7.5))
    camera = bpy.context.object
    camera.name = "RTS orthographic camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.75
    camera.data.lens = 50
    look_at(camera)
    scene.camera = camera
    bpy.context.view_layer.update()
    validate_camera_alignment(scene, camera)


def main():
    args = arguments()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    rig = build_rifleman()
    configure_scene()

    blend_path = Path(args.blend).resolve()
    frames_dir = Path(args.frames_dir).resolve()
    blend_path.parent.mkdir(parents=True, exist_ok=True)
    frames_dir.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    scene = bpy.context.scene
    frame_index = 0
    for state, steps in STATE_STEPS.items():
        for direction_index, direction in enumerate(DIRECTIONS):
            for step in range(steps):
                pose_rifleman(rig, state, step)
                rig["root"].rotation_euler.z = -direction_index * (2 * math.pi / len(DIRECTIONS))
                scene.render.filepath = str(
                    frames_dir / f"{frame_index:03d}-{state}-{direction}-{step:02d}.png"
                )
                bpy.ops.render.render(write_still=True)
                frame_index += 1


if __name__ == "__main__":
    main()
