"""Build and render an Iron Doctrine infantry source asset.

Run with:
  blender --background --python scripts/blender/render-infantry.py -- \
    --role rifleman \
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

STATE_STEPS_BY_ROLE = {
    "rifleman": {"idle": 1, "move": 8, "fire": 2},
    "engineer": {"idle": 1, "move": 8},
    "medic": {"idle": 1, "move": 8, "heal": 4},
}


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--role", choices=STATE_STEPS_BY_ROLE, default="rifleman")
    parser.add_argument("--blend", required=True)
    parser.add_argument("--frames-dir", required=True)
    parser.add_argument("--states")
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])


def material(
    name: str,
    color: tuple[float, float, float, float],
    metallic=0.0,
    roughness=0.75,
    variation=0.0,
):
    value = bpy.data.materials.new(name)
    value.diffuse_color = color
    value.use_nodes = True
    nodes = value.node_tree.nodes
    links = value.node_tree.links
    principled = nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    if variation:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.name = f"{name} surface variation"
        noise.inputs["Scale"].default_value = 7.5
        noise.inputs["Detail"].default_value = 2.5
        noise.inputs["Roughness"].default_value = 0.72

        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.name = f"{name} value range"
        ramp.color_ramp.elements[0].position = 0.24
        ramp.color_ramp.elements[0].color = tuple(
            min(1, channel * (1 - variation)) for channel in color[:3]
        ) + (color[3],)
        ramp.color_ramp.elements[1].position = 0.76
        ramp.color_ramp.elements[1].color = tuple(
            min(1, channel * (1 + variation)) for channel in color[:3]
        ) + (color[3],)
        links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"], principled.inputs["Base Color"])

        bump = nodes.new("ShaderNodeBump")
        bump.name = f"{name} surface grain"
        bump.inputs["Strength"].default_value = min(0.18, variation)
        bump.inputs["Distance"].default_value = 0.025
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], principled.inputs["Normal"])
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
        modifier.segments = 1
    apply_material(obj, value)
    return obj


def tapered_box(
    name,
    location,
    bottom_half_size,
    top_half_size,
    height,
    value,
    bevel=0.018,
):
    bx, by = bottom_half_size
    tx, ty = top_half_size
    half_height = height / 2
    vertices = [
        (-bx, -by, -half_height),
        (bx, -by, -half_height),
        (bx, by, -half_height),
        (-bx, by, -half_height),
        (-tx, -ty, half_height),
        (tx, -ty, half_height),
        (tx, ty, half_height),
        (-tx, ty, half_height),
    ]
    faces = [
        (0, 3, 2, 1),
        (4, 5, 6, 7),
        (0, 1, 5, 4),
        (1, 2, 6, 5),
        (2, 3, 7, 6),
        (3, 0, 4, 7),
    ]
    mesh = bpy.data.meshes.new(f"{name} mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    bpy.context.collection.objects.link(obj)
    if bevel:
        modifier = obj.modifiers.new("Worn cloth edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
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
    bevel.segments = 1
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


def build_infantry(role: str):
    uniform_color = {
        "rifleman": (0.16, 0.2, 0.095, 1),
        "engineer": (0.18, 0.17, 0.095, 1),
        "medic": (0.24, 0.25, 0.17, 1),
    }[role]
    uniform_light_color = {
        "rifleman": (0.26, 0.29, 0.14, 1),
        "engineer": (0.29, 0.25, 0.13, 1),
        "medic": (0.38, 0.38, 0.25, 1),
    }[role]
    uniform = material("Uniform - field cloth", uniform_color, variation=0.12)
    uniform_light = material(
        "Uniform - sun-faded cloth",
        uniform_light_color,
        variation=0.1,
    )
    helmet = material(
        "Helmet - worn olive steel",
        (0.13, 0.16, 0.09, 1),
        metallic=0.16,
        roughness=0.68,
        variation=0.08,
    )
    webbing = material("Webbing", (0.095, 0.105, 0.055, 1), roughness=0.9, variation=0.13)
    boots = material(
        "Boot leather",
        (0.025, 0.028, 0.022, 1),
        roughness=0.92,
        variation=0.08,
    )
    skin = material("Skin", (0.36, 0.245, 0.16, 1), roughness=0.82, variation=0.05)
    steel = material(
        "Rifle steel",
        (0.045, 0.055, 0.048, 1),
        metallic=0.58,
        roughness=0.52,
        variation=0.04,
    )
    wood = material("Rifle furniture", (0.16, 0.075, 0.035, 1), variation=0.14)
    faction_cloth = material(
        "Faction cloth panel",
        (0.5, 0.42, 0.22, 1),
        roughness=0.82,
        variation=0.05,
    )
    medic_canvas = material(
        "Medic canvas",
        (0.68, 0.66, 0.5, 1),
        roughness=0.9,
        variation=0.08,
    )
    medic_red = material(
        "Medic marking",
        (0.48, 0.035, 0.025, 1),
        roughness=0.78,
        variation=0.04,
    )
    engineer_copper = material(
        "Engineer tool copper",
        (0.34, 0.16, 0.055, 1),
        metallic=0.34,
        roughness=0.6,
        variation=0.08,
    )

    role_name = role.capitalize()
    root = bpy.data.objects.new(f"{role_name} - Iron Pass", None)
    bpy.context.collection.objects.link(root)
    upper = bpy.data.objects.new("Upper body", None)
    bpy.context.collection.objects.link(upper)
    weapon_rig = bpy.data.objects.new("Weapon rig", None)
    bpy.context.collection.objects.link(weapon_rig)
    parent_to(upper, root)
    parent_to(weapon_rig, upper)

    left_foot = box("Left boot", (-0.08, -0.18, 0.08), (0.36, 0.19, 0.15), boots, 0.018)
    right_foot = box("Right boot", (-0.08, 0.18, 0.08), (0.36, 0.19, 0.15), boots, 0.018)
    left_thigh = box("Left thigh", (-0.02, -0.14, 0.65), (0.19, 0.19, 0.36), uniform, 0.018)
    right_thigh = box("Right thigh", (-0.02, 0.14, 0.65), (0.19, 0.19, 0.36), uniform, 0.018)
    left_shin = box("Left shin", (-0.02, -0.16, 0.33), (0.165, 0.165, 0.36), uniform, 0.015)
    right_shin = box("Right shin", (-0.02, 0.16, 0.33), (0.165, 0.165, 0.36), uniform, 0.015)
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
        tapered_box(
            "Lower tunic",
            (-0.03, 0, 0.93),
            (0.155, 0.145),
            (0.185, 0.17),
            0.3,
            uniform,
        ),
        tapered_box(
            "Upper tunic",
            (0, 0, 1.17),
            (0.175, 0.17),
            (0.22, 0.24),
            0.34,
            uniform_light,
            0.022,
        ),
        box("Chest webbing", (0.235, 0, 1.13), (0.055, 0.33, 0.24), webbing, 0.012),
        box("Left ammunition pouch", (0.27, -0.1, 1.03), (0.09, 0.12, 0.16), webbing, 0.01),
        box("Right ammunition pouch", (0.27, 0.1, 1.03), (0.09, 0.12, 0.16), webbing, 0.01),
        box(
            "Backpack",
            (-0.255, 0, 1.08),
            (0.2 if role != "rifleman" else 0.17, 0.38, 0.44),
            medic_canvas if role == "medic" else webbing,
            0.025,
        ),
        sphere("Head", (0.03, 0, 1.47), (0.145, 0.135, 0.17), skin),
        cylinder_between(
            "Helmet brim",
            (0.0, 0, 1.57),
            (0.0, 0, 1.605),
            0.205,
            helmet,
            vertices=12,
        ),
        sphere("Steel helmet", (0.0, 0, 1.61), (0.205, 0.19, 0.09), helmet),
        box(
            "Shoulder mark",
            (0.02, -0.22, 1.21),
            (0.17, 0.03, 0.13),
            faction_cloth,
            0.008,
        ),
        cylinder_between(
            "Rear arm",
            (0.06, 0.2, 1.21),
            (0.38, 0.13, 1.02),
            0.065,
            uniform,
        ),
    ]
    for obj in upper_parts:
        parent_to(obj, upper)

    if role == "medic":
        weapon_parts = [
            box(
                "Field injector",
                (0.58, -0.11, 1.04),
                (0.48, 0.08, 0.09),
                medic_canvas,
                0.018,
            ),
            cylinder_between(
                "Injector nozzle",
                (0.79, -0.11, 1.04),
                (1.12, -0.11, 1.04),
                0.022,
                steel,
                vertices=8,
            ),
            box("Injector red band", (0.61, -0.11, 1.04), (0.08, 0.095, 0.105), medic_red, 0.01),
            cylinder_between(
                "Forward arm",
                (0.06, -0.2, 1.21),
                (0.54, -0.13, 1.03),
                0.065,
                uniform,
            ),
            sphere("Forward hand", (0.55, -0.13, 1.03), (0.08, 0.07, 0.07), skin),
        ]
    elif role == "engineer":
        weapon_parts = [
            box(
                "Powered cutter handle",
                (0.43, -0.11, 1.03),
                (0.46, 0.1, 0.12),
                engineer_copper,
                0.025,
            ),
            box(
                "Powered cutter motor",
                (0.69, -0.11, 1.04),
                (0.24, 0.2, 0.2),
                engineer_copper,
                0.025,
            ),
            box(
                "Upper cutter jaw",
                (0.88, -0.17, 1.1),
                (0.34, 0.055, 0.06),
                steel,
                0.012,
                rotation=(0, -0.12, -0.2),
            ),
            box(
                "Lower cutter jaw",
                (0.88, -0.05, 0.98),
                (0.34, 0.055, 0.06),
                steel,
                0.012,
                rotation=(0, 0.12, 0.2),
            ),
            cylinder_between(
                "Forward arm",
                (0.06, -0.2, 1.21),
                (0.48, -0.13, 1.03),
                0.065,
                uniform,
            ),
            sphere("Forward hand", (0.49, -0.13, 1.03), (0.08, 0.07, 0.07), skin),
        ]
    else:
        weapon_parts = [
            box(
                "Rifle stock",
                (0.46, -0.11, 1.03),
                (0.64, 0.09, 0.12),
                wood,
                0.025,
            ),
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
                (0.06, -0.2, 1.21),
                (0.58, -0.13, 1.03),
                0.065,
                uniform,
            ),
            sphere("Forward hand", (0.59, -0.13, 1.03), (0.08, 0.07, 0.07), skin),
        ]
    for obj in weapon_parts:
        parent_to(obj, weapon_rig)

    if role == "engineer":
        engineer_parts = [
            box(
                "Tool roll",
                (-0.39, 0, 1.0),
                (0.13, 0.42, 0.18),
                engineer_copper,
                0.02,
            ),
            cylinder_between(
                "Holstered wrench",
                (-0.39, 0.16, 0.92),
                (-0.39, 0.16, 1.34),
                0.035,
                steel,
                vertices=8,
            ),
        ]
        for obj in engineer_parts:
            parent_to(obj, upper)
    elif role == "medic":
        medic_parts = [
            box("Backpack vertical mark", (-0.37, 0, 1.08), (0.025, 0.08, 0.28), medic_red, 0.005),
            box("Backpack horizontal mark", (-0.37, 0, 1.08), (0.025, 0.27, 0.08), medic_red, 0.005),
            box("Helmet vertical mark", (0.0, -0.192, 1.63), (0.08, 0.018, 0.18), medic_red, 0.004),
            box("Helmet horizontal mark", (0.0, -0.194, 1.63), (0.2, 0.018, 0.065), medic_red, 0.004),
        ]
        for obj in medic_parts:
            parent_to(obj, upper)

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


def pose_infantry(rig, state: str, step: int) -> None:
    rig["upper"].location = (0, 0, 0)
    rig["upper"].rotation_euler = (0, 0, 0)
    rig["weapon_rig"].location = (0, 0, 0)
    pose_leg(rig, "left", -0.02, 0, 0)
    pose_leg(rig, "right", -0.02, 0, 0)

    if state == "move":
        gait = (
            ((0.18, 0, 0.07), (-0.26, 0, 0.04), 0.0, -0.018, 0.025),
            ((0.1, 0, 0.09), (-0.16, 0.025, 0.05), -0.012, -0.028, 0.012),
            ((0, 0, 0.07), (0.02, 0.08, 0.1), 0.018, -0.018, -0.008),
            ((-0.12, 0, 0.05), (0.12, 0.13, 0.12), 0.03, 0.0, -0.022),
            ((-0.26, 0, 0.04), (0.18, 0, 0.07), 0.0, 0.018, -0.025),
            ((-0.16, 0.025, 0.05), (0.1, 0, 0.09), -0.012, 0.028, -0.012),
            ((0.02, 0.08, 0.1), (0, 0, 0.07), 0.018, 0.018, 0.008),
            ((0.12, 0.13, 0.12), (-0.12, 0, 0.05), 0.03, 0.0, 0.022),
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
    elif state == "heal":
        reach = (0.0, 0.08, 0.14, 0.06)[step]
        lift = (0.0, 0.035, 0.065, 0.03)[step]
        rig["weapon_rig"].location = (reach, 0, lift)
        rig["weapon_rig"].rotation_euler.y = (-0.02, -0.09, -0.16, -0.07)[step]
        rig["upper"].location.x = reach * 0.08


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
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.035, 0.042, 0.028, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.38

    bpy.ops.object.light_add(type="AREA", location=(-3.2, -4.2, 7))
    key = bpy.context.object
    key.name = "Mediterranean key light"
    key.data.energy = 920
    key.data.shape = "DISK"
    key.data.size = 3

    bpy.ops.object.light_add(type="AREA", location=(3.5, 2.5, 4.5))
    fill = bpy.context.object
    fill.name = "Sky fill"
    fill.data.energy = 105
    fill.data.color = (0.46, 0.55, 0.62)
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
    state_steps = STATE_STEPS_BY_ROLE[args.role]
    states_argument = args.states or ",".join(state_steps)
    requested_states = tuple(
        state.strip() for state in states_argument.split(",") if state.strip()
    )
    unknown_states = set(requested_states) - set(state_steps)
    if unknown_states:
        raise ValueError(f"Unknown render states: {sorted(unknown_states)}")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    rig = build_infantry(args.role)
    configure_scene()

    blend_path = Path(args.blend).resolve()
    frames_dir = Path(args.frames_dir).resolve()
    blend_path.parent.mkdir(parents=True, exist_ok=True)
    frames_dir.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    scene = bpy.context.scene
    frame_index = 0
    for state in requested_states:
        steps = state_steps[state]
        for direction_index, direction in enumerate(DIRECTIONS):
            for step in range(steps):
                pose_infantry(rig, state, step)
                rig["root"].rotation_euler.z = -direction_index * (2 * math.pi / len(DIRECTIONS))
                scene.render.filepath = str(
                    frames_dir / f"{frame_index:03d}-{state}-{direction}-{step:02d}.png"
                )
                bpy.ops.render.render(write_still=True)
                frame_index += 1


if __name__ == "__main__":
    main()
