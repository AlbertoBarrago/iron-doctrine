"""Build and render the first Iron Pass base-structure family.

Frame contract:
  - one fixed RTS camera; structures do not have directional frames;
  - two presentation-only states per structure: idle, operational;
  - operational changes only local machinery, doors and service lamps;
  - output order is stable: 00-idle.png, 01-operational.png.

Run with:
  blender --background --python scripts/blender/render-base-structures.py -- \
    --assets-dir assets-src/structures/base \
    --frames-dir /tmp/iron-doctrine-base-structure-frames
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector


STRUCTURES = ("construction_yard", "power_plant", "barracks", "factory")
STATES = ("idle", "operational")
FRAME_SIZE = 320


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets-dir", required=True)
    parser.add_argument("--frames-dir", required=True)
    parser.add_argument("--structures", default=",".join(STRUCTURES))
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])


def material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic=0.0,
    roughness=0.78,
    variation=0.0,
    emission=None,
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

    if emission is not None:
        principled.inputs["Emission Color"].default_value = emission
        principled.inputs["Emission Strength"].default_value = 2.5

    if variation:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 4.8
        noise.inputs["Detail"].default_value = 2.0
        noise.inputs["Roughness"].default_value = 0.72
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.22
        ramp.color_ramp.elements[0].color = tuple(
            max(0, channel * (1 - variation)) for channel in color[:3]
        ) + (color[3],)
        ramp.color_ramp.elements[1].position = 0.78
        ramp.color_ramp.elements[1].color = tuple(
            min(1, channel * (1 + variation)) for channel in color[:3]
        ) + (color[3],)
        links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"], principled.inputs["Base Color"])
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = min(0.16, variation)
        bump.inputs["Distance"].default_value = 0.035
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    return value


def materials():
    return {
        "concrete": material(
            "Foundation - stained limestone concrete",
            (0.31, 0.29, 0.24, 1),
            roughness=0.94,
            variation=0.14,
        ),
        "concrete_dark": material(
            "Foundation - oil and dust",
            (0.14, 0.135, 0.115, 1),
            roughness=0.98,
            variation=0.12,
        ),
        "olive": material(
            "Cladding - weathered field olive",
            (0.15, 0.18, 0.11, 1),
            roughness=0.82,
            variation=0.13,
        ),
        "olive_light": material(
            "Cladding - sun-faded upper planes",
            (0.25, 0.27, 0.17, 1),
            roughness=0.82,
            variation=0.11,
        ),
        "steel": material(
            "Structure - oxidized steel",
            (0.085, 0.095, 0.085, 1),
            metallic=0.48,
            roughness=0.67,
            variation=0.09,
        ),
        "steel_light": material(
            "Structure - worn exposed steel",
            (0.20, 0.20, 0.17, 1),
            metallic=0.42,
            roughness=0.62,
            variation=0.07,
        ),
        "roof": material(
            "Roof - dusty corrugated metal",
            (0.19, 0.20, 0.16, 1),
            metallic=0.24,
            roughness=0.86,
            variation=0.13,
        ),
        "dark": material(
            "Mechanical recess",
            (0.025, 0.03, 0.028, 1),
            metallic=0.2,
            roughness=0.9,
        ),
        "glass": material(
            "Dusty reinforced glass",
            (0.045, 0.105, 0.105, 1),
            metallic=0.12,
            roughness=0.32,
            variation=0.05,
        ),
        "faction": material(
            "Neutral owner panel",
            (0.46, 0.33, 0.16, 1),
            roughness=0.82,
            variation=0.05,
        ),
        "amber_off": material(
            "Service lamp unpowered",
            (0.20, 0.13, 0.035, 1),
            metallic=0.08,
            roughness=0.65,
        ),
        "amber_on": material(
            "Service lamp operational",
            (0.82, 0.46, 0.08, 1),
            roughness=0.42,
            emission=(0.95, 0.36, 0.035, 1),
        ),
    }


def apply_material(obj, value) -> None:
    obj.data.materials.append(value)


def box(name, location, scale, value, bevel=0.055, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = tuple(axis / 2 for axis in scale)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Chipped field edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
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
    modifier = obj.modifiers.new("Chipped field edges", "BEVEL")
    modifier.width = 0.035
    modifier.segments = 1
    apply_material(obj, value)
    return obj


def foundation(size, values):
    box("Registered concrete foundation", (0, 0, 0.14), (size[0], size[1], 0.28), values["concrete"], 0.08)
    box(
        "Foundation soil contact",
        (0.08, 0.1, 0.045),
        (size[0] + 0.24, size[1] + 0.24, 0.09),
        values["concrete_dark"],
        0.04,
    )
    for x, y in (
        (-size[0] * 0.43, -size[1] * 0.43),
        (size[0] * 0.43, -size[1] * 0.43),
        (-size[0] * 0.43, size[1] * 0.43),
        (size[0] * 0.43, size[1] * 0.43),
    ):
        cylinder("Foundation anchor bolt", (x, y, 0.31), 0.07, 0.07, values["steel"], vertices=8)


def service_lamp(name, location, values):
    lamp = box(name, location, (0.18, 0.10, 0.18), values["amber_off"], 0.02)
    lamp.data.materials.append(values["amber_on"])
    return lamp


def build_construction_yard(values):
    foundation((6.6, 5.4), values)
    box("Command bunker", (-1.25, 0.5, 1.15), (3.0, 3.7, 2.0), values["olive"], 0.12)
    box("Sloped command roof", (-1.25, 0.5, 2.22), (3.25, 3.9, 0.27), values["roof"], 0.06)
    box("Operations window", (-1.25, -1.38, 1.42), (1.65, 0.06, 0.58), values["glass"], 0.02)
    box("Owner command panel", (-2.78, -0.25, 1.36), (0.06, 1.2, 0.48), values["faction"], 0.02)
    box("Vehicle service pad", (1.6, 0.25, 0.36), (2.65, 3.75, 0.16), values["steel"], 0.04)
    box("Service trench", (1.55, 0.25, 0.43), (1.1, 2.7, 0.10), values["dark"], 0.02)
    box("Crane tower", (2.25, 1.72, 1.75), (0.32, 0.32, 2.8), values["steel"], 0.035)
    crane = bpy.data.objects.new("Operational service crane", None)
    bpy.context.collection.objects.link(crane)
    crane.location = (2.25, 1.72, 3.08)
    arm = box("Crane boom", (0, -1.15, 0), (0.28, 2.7, 0.25), values["steel_light"], 0.025)
    hook = cylinder("Crane cable", (0, -2.25, -0.72), 0.025, 1.45, values["dark"], vertices=8)
    hook.parent = crane
    arm.parent = crane
    exhaust = cylinder("Command exhaust", (-2.12, 1.25, 2.72), 0.24, 1.05, values["steel"], vertices=10)
    lamp = service_lamp("Yard service lamp", (1.05, -1.66, 0.72), values)
    return {
        "moving": crane,
        "movement": "rotate_z",
        "lamp": lamp,
        "door": None,
        "fan": None,
        "exhaust": exhaust,
    }


def build_power_plant(values):
    foundation((5.7, 5.2), values)
    box("Turbine hall", (-0.55, 0.35, 1.18), (3.65, 3.65, 2.05), values["olive"], 0.12)
    box("Reinforced turbine roof", (-0.55, 0.35, 2.28), (3.9, 3.9, 0.25), values["roof"], 0.055)
    box("Generator annex", (1.75, -0.25, 0.92), (1.45, 2.65, 1.48), values["olive_light"], 0.09)
    for index, y in enumerate((-1.05, 0.35, 1.55)):
        stack = cylinder(
            f"Heat exhaust stack {index + 1}",
            (-1.45, y, 3.25),
            0.34,
            2.0,
            values["steel"],
            vertices=12,
        )
        cylinder(
            f"Heat exhaust cap {index + 1}",
            (-1.45, y, 4.27),
            0.43,
            0.16,
            values["steel_light"],
            vertices=12,
        )
    cylinder(
        "Cooling fan housing",
        (-0.85, -1.51, 1.17),
        0.62,
        0.10,
        values["dark"],
        vertices=16,
        rotation=(math.pi / 2, 0, 0),
    )
    fan = bpy.data.objects.new("Operational cooling fan", None)
    bpy.context.collection.objects.link(fan)
    fan.location = (-0.85, -1.51, 1.17)
    fan_marker = box(
        "Cooling fan crossbar",
        (0, -0.07, 0),
        (1.04, 0.06, 0.13),
        values["steel_light"],
        0.012,
    )
    fan_marker.parent = fan
    box("Generator bus housing", (0.55, -1.65, 0.78), (1.55, 0.35, 0.72), values["steel"], 0.04)
    lamp = service_lamp("Power service lamp", (1.9, -1.64, 1.45), values)
    return {
        "moving": None,
        "movement": None,
        "lamp": lamp,
        "door": None,
        "fan": fan,
        "exhaust": None,
    }


def build_barracks(values):
    foundation((5.8, 4.8), values)
    box("Barracks block", (-0.35, 0.35, 1.05), (4.7, 3.65, 1.8), values["olive"], 0.10)
    box(
        "Pitched weather roof left",
        (-0.35, -0.60, 2.17),
        (4.95, 2.15, 0.22),
        values["roof"],
        0.04,
        (0.24, 0, 0),
    )
    box(
        "Pitched weather roof right",
        (-0.35, 1.30, 2.17),
        (4.95, 2.15, 0.22),
        values["roof"],
        0.04,
        (-0.24, 0, 0),
    )
    box("Entrance recess", (1.22, -1.54, 0.96), (1.22, 0.16, 1.45), values["dark"], 0.025)
    door = box("Operational personnel door", (1.22, -1.66, 0.96), (1.06, 0.10, 1.38), values["steel"], 0.02)
    for x in (-1.82, -0.72, 0.38):
        box("Reinforced window", (x, -1.50, 1.22), (0.58, 0.06, 0.42), values["glass"], 0.015)
    box("Equipment lockers", (-2.4, 1.66, 0.75), (0.38, 1.25, 0.92), values["steel"], 0.035)
    cylinder("Radio mast", (-1.95, 1.15, 3.0), 0.035, 1.95, values["steel_light"], vertices=8)
    box("Owner company panel", (-2.64, -0.45, 1.18), (0.06, 1.1, 0.5), values["faction"], 0.015)
    lamp = service_lamp("Barracks entrance lamp", (1.85, -1.68, 1.62), values)
    return {
        "moving": None,
        "movement": None,
        "lamp": lamp,
        "door": door,
        "fan": None,
        "exhaust": None,
    }


def build_factory(values):
    foundation((7.2, 5.8), values)
    box("Factory assembly hall", (-0.55, 0.45, 1.45), (4.55, 4.5, 2.65), values["olive"], 0.13)
    box("Heavy factory roof", (-0.55, 0.45, 2.87), (4.85, 4.75, 0.28), values["roof"], 0.055)
    for index, x in enumerate((-1.7, -0.55, 0.6)):
        box(
            f"Sawtooth roof monitor {index + 1}",
            (x, 0.55, 3.18),
            (0.62, 3.35, 0.48),
            values["steel_light"],
            0.035,
            (0, -0.18, 0),
        )
        box(
            f"Sawtooth clerestory {index + 1}",
            (x + 0.30, -0.05, 3.16),
            (0.05, 2.15, 0.31),
            values["glass"],
            0.012,
        )
    box("Vehicle bay recess", (1.02, -1.89, 1.28), (2.42, 0.20, 2.1), values["dark"], 0.025)
    door = box("Operational vehicle shutter", (1.02, -2.03, 1.56), (2.25, 0.12, 1.75), values["steel"], 0.025)
    for z in (0.82, 1.16, 1.50, 1.84, 2.18):
        reinforcement = box(
            "Shutter reinforcement",
            (1.02, -2.10, z),
            (2.16, 0.04, 0.06),
            values["steel_light"],
            0.01,
        )
        reinforcement.parent = door
        reinforcement.matrix_parent_inverse = door.matrix_world.inverted()
    box("Assembly apron", (1.32, -2.58, 0.34), (3.4, 1.05, 0.16), values["steel"], 0.04)
    box("Machine annex", (-2.48, 0.82, 1.02), (1.35, 2.75, 1.78), values["olive_light"], 0.08)
    for index, y in enumerate((0.15, 1.45)):
        cylinder(
            f"Factory exhaust {index + 1}",
            (-2.55, y, 3.15),
            0.25,
            1.65,
            values["steel"],
            vertices=10,
        )
    rail = box("Overhead crane rail", (-0.55, 0.25, 2.48), (3.8, 0.20, 0.20), values["steel_light"], 0.02)
    trolley = box("Operational crane trolley", (-0.55, 0.25, 2.30), (0.58, 0.55, 0.28), values["faction"], 0.025)
    lamp = service_lamp("Factory bay lamp", (2.25, -2.08, 2.32), values)
    return {
        "moving": trolley,
        "movement": "translate_x",
        "lamp": lamp,
        "door": door,
        "fan": None,
        "exhaust": None,
    }


BUILDERS = {
    "construction_yard": build_construction_yard,
    "power_plant": build_power_plant,
    "barracks": build_barracks,
    "factory": build_factory,
}


def pose(rig, state: str) -> None:
    operational = state == "operational"
    rig["lamp"].active_material_index = 1 if operational else 0

    moving = rig["moving"]
    if moving is not None:
        if rig["movement"] == "rotate_z":
            moving.rotation_euler.z = -0.20 if operational else 0.0
        elif rig["movement"] == "translate_x":
            moving.location.x = 0.55 if operational else -0.55

    fan = rig["fan"]
    if fan is not None:
        fan.rotation_euler.y = math.pi / 4 if operational else 0.0

    door = rig["door"]
    if door is not None:
        door.scale.z = 0.22 if operational else 1.0
        door.location.z = 2.18 if operational else (1.56 if "vehicle" in door.name.lower() else 0.96)


def look_at(obj, target=(0, 0, 0.9)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def validate_camera(scene, camera) -> None:
    ground = world_to_camera_view(scene, camera, Vector((0, 0, 0)))
    east = world_to_camera_view(scene, camera, Vector((1, 0, 0)))
    angle = math.atan2(-(east.y - ground.y), east.x - ground.x)
    if not math.isclose(angle, 0, abs_tol=1e-6):
        raise RuntimeError(f"Camera projects model east at {math.degrees(angle):.3f} degrees")
    if not 0.10 < ground.y < 0.48:
        raise RuntimeError(f"Ground origin projects outside the registered lower frame: {ground.y:.3f}")


def configure_scene():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = FRAME_SIZE
    scene.render.resolution_y = FRAME_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = True
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = scene.world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.05, 0.06, 0.04, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.62

    bpy.ops.object.light_add(type="AREA", location=(-5.5, -6.5, 11.0))
    key = bpy.context.object
    key.name = "Mediterranean upper-left key"
    key.data.energy = 1350
    key.data.shape = "DISK"
    key.data.size = 6.0

    bpy.ops.object.light_add(type="AREA", location=(5.5, 4.0, 7.0))
    fill = bpy.context.object
    fill.name = "Cool sky fill"
    fill.data.energy = 410
    fill.data.color = (0.52, 0.62, 0.70)
    fill.data.size = 7.0

    bpy.ops.object.camera_add(location=(0, -14.8, 11.2))
    camera = bpy.context.object
    camera.name = "Base family orthographic camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 9.2
    look_at(camera)
    scene.camera = camera
    bpy.context.view_layer.update()
    validate_camera(scene, camera)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.materials, bpy.data.meshes, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            datablocks.remove(datablock)


def main():
    args = arguments()
    selected = tuple(name.strip() for name in args.structures.split(",") if name.strip())
    unknown = set(selected) - set(STRUCTURES)
    if unknown:
        raise ValueError(f"Unknown structures: {', '.join(sorted(unknown))}")

    assets_dir = Path(args.assets_dir).resolve()
    frames_root = Path(args.frames_dir).resolve()
    assets_dir.mkdir(parents=True, exist_ok=True)
    frames_root.mkdir(parents=True, exist_ok=True)

    for structure in selected:
        clear_scene()
        values = materials()
        rig = BUILDERS[structure](values)
        configure_scene()
        pose(rig, "idle")
        bpy.ops.wm.save_as_mainfile(filepath=str(assets_dir / f"{structure}.blend"))

        output_dir = frames_root / structure
        output_dir.mkdir(parents=True, exist_ok=True)
        for index, state in enumerate(STATES):
            pose(rig, state)
            bpy.context.scene.render.filepath = str(output_dir / f"{index:02d}-{state}.png")
            bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
