"""Build and render the Iron Pass Harvester source asset.

Run with:
  blender --background --python scripts/blender/render-harvester.py -- \
    --blend assets-src/vehicles/harvester/harvester.blend \
    --frames-dir /tmp/iron-doctrine-harvester-frames
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
    "idle_loaded": 1,
    "move": 4,
    "move_loaded": 4,
    "gather": 4,
    "deposit": 3,
}


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend", required=True)
    parser.add_argument("--frames-dir", required=True)
    parser.add_argument("--states", default=",".join(STATE_STEPS))
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])


def material(
    name: str,
    color: tuple[float, float, float, float],
    metallic=0.0,
    roughness=0.78,
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
        noise.inputs["Scale"].default_value = 6.5
        noise.inputs["Detail"].default_value = 2.4
        noise.inputs["Roughness"].default_value = 0.72
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.28
        ramp.color_ramp.elements[0].color = tuple(
            min(1, channel * (1 - variation)) for channel in color[:3]
        ) + (color[3],)
        ramp.color_ramp.elements[1].position = 0.72
        ramp.color_ramp.elements[1].color = tuple(
            min(1, channel * (1 + variation)) for channel in color[:3]
        ) + (color[3],)
        links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"], principled.inputs["Base Color"])

        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = min(0.15, variation)
        bump.inputs["Distance"].default_value = 0.025
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    return value


def apply_material(obj, value) -> None:
    obj.data.materials.append(value)


def box(name, location, scale, value, bevel=0.05, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Industrial edge wear", "BEVEL")
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
    modifier = obj.modifiers.new("Industrial edge wear", "BEVEL")
    modifier.width = 0.028
    modifier.segments = 1
    apply_material(obj, value)
    return obj


def parent_to(obj, parent) -> None:
    obj.parent = parent


def wheel_assembly(name, location, side, materials):
    pivot = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(pivot)
    pivot.location = location

    tire = cylinder(
        f"{name} tire",
        (0, 0, 0),
        0.5,
        0.38,
        materials["rubber"],
        vertices=16,
        rotation=(math.pi / 2, 0, 0),
    )
    hub = cylinder(
        f"{name} hub",
        (0, side * 0.025, 0),
        0.24,
        0.42,
        materials["steel"],
        vertices=12,
        rotation=(math.pi / 2, 0, 0),
    )
    rotation_mark = box(
        f"{name} rotation marker",
        (0, side * 0.23, 0),
        (0.4, 0.04, 0.08),
        materials["steel_light"],
        0.012,
    )
    for obj in (tire, hub, rotation_mark):
        parent_to(obj, pivot)
    return pivot


def ore_chunk(name, location, scale, ore_material):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_material(obj, ore_material)
    return obj


def build_harvester():
    materials = {
        "yellow": material(
            "Paint - weathered industrial ochre",
            (0.43, 0.31, 0.075, 1),
            roughness=0.82,
            variation=0.12,
        ),
        "yellow_light": material(
            "Paint - sun-faded upper panels",
            (0.59, 0.46, 0.13, 1),
            roughness=0.78,
            variation=0.1,
        ),
        "yellow_dark": material(
            "Paint - grease-darkened recesses",
            (0.18, 0.13, 0.04, 1),
            roughness=0.9,
            variation=0.08,
        ),
        "rubber": material("Heavy tire rubber", (0.014, 0.017, 0.014, 1), roughness=0.98),
        "steel": material(
            "Abraded structural steel",
            (0.095, 0.105, 0.09, 1),
            metallic=0.52,
            roughness=0.62,
            variation=0.08,
        ),
        "steel_light": material(
            "Polished working steel",
            (0.23, 0.24, 0.2, 1),
            metallic=0.62,
            roughness=0.48,
        ),
        "glass": material(
            "Dust-coated cab glass",
            (0.045, 0.11, 0.115, 1),
            metallic=0.22,
            roughness=0.32,
            variation=0.035,
        ),
        "ore": material(
            "Iron Pass ore",
            (0.42, 0.16, 0.055, 1),
            metallic=0.2,
            roughness=0.75,
            variation=0.22,
        ),
        "faction": material(
            "Neutral faction identification",
            (0.48, 0.43, 0.27, 1),
            roughness=0.86,
            variation=0.045,
        ),
    }

    root = bpy.data.objects.new("Harvester - Iron Pass", None)
    bpy.context.collection.objects.link(root)
    suspended = bpy.data.objects.new("Suspended industrial chassis", None)
    bpy.context.collection.objects.link(suspended)
    parent_to(suspended, root)

    chassis_parts = [
        box("Load-bearing frame", (-0.25, 0, 0.69), (4.5, 2.16, 0.34), materials["yellow_dark"], 0.09),
        box("Armored underbody", (-0.15, 0, 0.94), (4.15, 1.92, 0.36), materials["yellow"], 0.09),
        box("Forward machinery deck", (1.22, 0, 1.18), (1.35, 1.76, 0.42), materials["yellow"], 0.08),
        box("Operator cab", (0.55, -0.42, 1.68), (1.08, 1.02, 1.08), materials["yellow"], 0.1),
        box("Cab roof", (0.52, -0.42, 2.25), (1.22, 1.14, 0.14), materials["yellow_light"], 0.045),
        box(
            "Forward windscreen",
            (1.105, -0.42, 1.8),
            (0.04, 0.77, 0.49),
            materials["glass"],
            0.012,
            (0, -0.12, 0),
        ),
        box("Cab side glass", (0.5, -0.945, 1.82), (0.7, 0.035, 0.43), materials["glass"], 0.01),
        box("Hydraulic power housing", (0.15, 0.62, 1.45), (1.35, 0.58, 0.74), materials["yellow_dark"], 0.07),
        cylinder(
            "Hydraulic pressure tank",
            (0.1, 0.76, 1.83),
            0.22,
            0.76,
            materials["steel"],
            vertices=12,
            rotation=(0, math.pi / 2, 0),
        ),
        box("Faction identity panel", (0.48, -1.01, 1.35), (0.68, 0.035, 0.26), materials["faction"], 0.01),
        box("Front impact beam", (2.08, 0, 0.73), (0.2, 2.25, 0.2), materials["steel"], 0.03),
        box("Rear impact beam", (-2.5, 0, 0.73), (0.2, 2.2, 0.2), materials["steel"], 0.03),
    ]
    for obj in chassis_parts:
        parent_to(obj, suspended)

    cargo = bpy.data.objects.new("Articulated ore hopper", None)
    bpy.context.collection.objects.link(cargo)
    cargo.location = (-1.25, 0, 1.05)
    parent_to(cargo, suspended)
    hopper_parts = [
        box("Hopper floor", (0, 0, 0), (2.15, 1.72, 0.16), materials["steel"], 0.045),
        box(
            "Hopper left wall",
            (0, -0.88, 0.45),
            (2.25, 0.16, 1.02),
            materials["yellow"],
            0.055,
            (0.08, 0, 0),
        ),
        box(
            "Hopper right wall",
            (0, 0.88, 0.45),
            (2.25, 0.16, 1.02),
            materials["yellow"],
            0.055,
            (0.08, 0, 0),
        ),
        box("Hopper front bulkhead", (1.02, 0, 0.45), (0.16, 1.72, 1.02), materials["yellow_dark"], 0.05),
    ]
    for obj in hopper_parts:
        parent_to(obj, cargo)

    rear_gate = bpy.data.objects.new("Rear discharge gate pivot", None)
    bpy.context.collection.objects.link(rear_gate)
    rear_gate.location = (-1.08, 0, 0.05)
    parent_to(rear_gate, cargo)
    gate = box(
        "Striped rear discharge gate",
        (0, 0, 0.43),
        (0.14, 1.72, 0.9),
        materials["yellow_light"],
        0.045,
    )
    parent_to(gate, rear_gate)
    for side in (-1, 1):
        stripe = box(
            f"Rear gate warning stripe {'left' if side < 0 else 'right'}",
            (-0.08, side * 0.42, 0.44),
            (0.025, 0.26, 0.72),
            materials["steel"],
            0.006,
            (0.22, 0, 0),
        )
        parent_to(stripe, rear_gate)

    ore_chunks = []
    ore_layout = (
        (-0.64, -0.45, 0.3, 0.34),
        (-0.55, 0.42, 0.31, 0.38),
        (-0.05, -0.36, 0.34, 0.42),
        (0.03, 0.34, 0.31, 0.36),
        (0.47, -0.45, 0.28, 0.31),
        (0.55, 0.37, 0.3, 0.35),
        (-0.28, 0.02, 0.46, 0.4),
        (0.31, 0.0, 0.44, 0.37),
    )
    for index, (x, y, z, scale) in enumerate(ore_layout):
        chunk = ore_chunk(
            f"Visible ore load {index + 1}",
            (x, y, z),
            (scale, scale * 0.82, scale * 0.68),
            materials["ore"],
        )
        parent_to(chunk, cargo)
        ore_chunks.append(chunk)

    collector = bpy.data.objects.new("Collection head lift", None)
    bpy.context.collection.objects.link(collector)
    collector.location = (2.05, 0, 0.66)
    parent_to(collector, root)
    collector_parts = [
        box("Collector crossbeam", (0.38, 0, 0.2), (1.0, 2.75, 0.2), materials["steel"], 0.035),
        box(
            "Left collector cheek",
            (0.48, -1.26, 0.02),
            (1.1, 0.22, 0.65),
            materials["yellow"],
            0.045,
            (0, -0.18, 0),
        ),
        box(
            "Right collector cheek",
            (0.48, 1.26, 0.02),
            (1.1, 0.22, 0.65),
            materials["yellow"],
            0.045,
            (0, -0.18, 0),
        ),
        box("Left lift arm", (-0.25, -0.88, 0.38), (1.05, 0.14, 0.14), materials["steel"], 0.025, (0, -0.25, 0)),
        box("Right lift arm", (-0.25, 0.88, 0.38), (1.05, 0.14, 0.14), materials["steel"], 0.025, (0, -0.25, 0)),
    ]
    for obj in collector_parts:
        parent_to(obj, collector)

    intake = bpy.data.objects.new("Rotating intake drum", None)
    bpy.context.collection.objects.link(intake)
    intake.location = (0.58, 0, -0.03)
    parent_to(intake, collector)
    drum = cylinder(
        "Ore intake drum",
        (0, 0, 0),
        0.32,
        2.32,
        materials["steel_light"],
        vertices=14,
        rotation=(math.pi / 2, 0, 0),
    )
    parent_to(drum, intake)
    for tine_index in range(8):
        angle = tine_index * math.pi / 4
        tine = box(
            f"Collector tooth {tine_index + 1}",
            (math.cos(angle) * 0.37, -1.18, math.sin(angle) * 0.37),
            (0.42, 0.1, 0.08),
            materials["steel"],
            0.012,
            (0, -angle, 0),
        )
        mirrored = box(
            f"Collector tooth {tine_index + 1} mirrored",
            (math.cos(angle) * 0.37, 1.18, math.sin(angle) * 0.37),
            (0.42, 0.1, 0.08),
            materials["steel"],
            0.012,
            (0, -angle, 0),
        )
        parent_to(tine, intake)
        parent_to(mirrored, intake)

    gather_fragments = []
    for index, (x, y, z, scale) in enumerate(
        (
            (0.9, -0.52, 0.18, 0.1),
            (1.02, 0.08, 0.28, 0.085),
            (0.84, 0.55, 0.14, 0.11),
        )
    ):
        fragment = ore_chunk(
            f"Collected ore fragment {index + 1}",
            (x, y, z),
            (scale, scale * 0.8, scale * 0.7),
            materials["ore"],
        )
        fragment.hide_render = True
        parent_to(fragment, collector)
        gather_fragments.append(fragment)

    wheels = []
    for side in (-1, 1):
        label = "Left" if side < 0 else "Right"
        for axle, x in (("front", 1.3), ("middle", -0.35), ("rear", -1.75)):
            wheel = wheel_assembly(
                f"{label} {axle} wheel",
                (x, side * 1.16, 0.5),
                side,
                materials,
            )
            parent_to(wheel, root)
            wheels.append(wheel)

    exhaust = cylinder(
        "Diesel exhaust stack",
        (-0.18, 0.78, 2.25),
        0.09,
        1.05,
        materials["steel"],
        vertices=10,
        rotation=(0.04, -0.03, 0),
    )
    parent_to(exhaust, suspended)

    return {
        "root": root,
        "suspended": suspended,
        "wheels": wheels,
        "collector": collector,
        "intake": intake,
        "cargo": cargo,
        "rear_gate": rear_gate,
        "ore_chunks": ore_chunks,
        "gather_fragments": gather_fragments,
    }


def pose_harvester(rig, state: str, step: int) -> None:
    rig["suspended"].location = (0, 0, 0)
    rig["suspended"].rotation_euler = (0, 0, 0)
    rig["collector"].location = (2.05, 0, 0.66)
    rig["collector"].rotation_euler = (0, 0, 0)
    rig["intake"].rotation_euler = (0, 0, 0)
    rig["cargo"].rotation_euler = (0, 0, 0)
    rig["rear_gate"].rotation_euler = (0, 0, 0)
    for wheel in rig["wheels"]:
        wheel.rotation_euler = (0, 0, 0)
    for chunk in rig["ore_chunks"]:
        chunk.hide_render = True
    for fragment in rig["gather_fragments"]:
        fragment.hide_render = True

    if state in ("idle_loaded", "move_loaded", "deposit"):
        for chunk in rig["ore_chunks"]:
            chunk.hide_render = False

    if state in ("move", "move_loaded"):
        wheel_angle = step * (math.pi / 2)
        for wheel in rig["wheels"]:
            wheel.rotation_euler.y = wheel_angle
        rig["suspended"].location.z = (0.0, 0.018, 0.0, -0.014)[step]
        rig["suspended"].rotation_euler.y = (0.005, -0.007, -0.005, 0.007)[step]
    elif state == "gather":
        lift = (0.1, -0.025, -0.1, -0.025)[step]
        rig["collector"].location.z += lift
        rig["collector"].rotation_euler.y = (0.08, -0.03, -0.14, -0.03)[step]
        rig["intake"].rotation_euler.y = step * (math.pi / 2)
        rig["suspended"].location.z = (0.0, -0.01, -0.018, -0.008)[step]
        visible_ore = (2, 4, 6, 8)[step]
        for chunk in rig["ore_chunks"][:visible_ore]:
            chunk.hide_render = False
        for fragment in rig["gather_fragments"][:step]:
            fragment.hide_render = False
    elif state == "deposit":
        tip = (0.0, -0.28, -0.5)[step]
        rig["cargo"].rotation_euler.y = tip
        rig["rear_gate"].rotation_euler.y = (0.0, -0.48, -0.85)[step]
        remaining_ore = (8, 5, 2)[step]
        for chunk in rig["ore_chunks"][remaining_ore:]:
            chunk.hide_render = True


def look_at(obj, target=(0, 0, 1.0)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def validate_camera(scene, camera) -> None:
    origin = world_to_camera_view(scene, camera, Vector((0, 0, 1.0)))
    east = world_to_camera_view(scene, camera, Vector((1, 0, 1.0)))
    screen_angle = math.atan2(-(east.y - origin.y), east.x - origin.x)
    if not math.isclose(screen_angle, 0, abs_tol=1e-6):
        raise RuntimeError(
            f"Camera projects model east at {math.degrees(screen_angle):.3f} degrees"
        )
    ground = world_to_camera_view(scene, camera, Vector((0, 0, 0)))
    if not (0.25 < ground.x < 0.75 and 0.15 < ground.y < 0.62):
        raise RuntimeError(f"Ground origin projects outside the expected footprint: {ground}")


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
    scene.render.image_settings.compression = 20
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = scene.world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.05, 0.048, 0.032, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.62

    bpy.ops.object.light_add(type="AREA", location=(-4.2, -5.5, 9.5))
    key = bpy.context.object
    key.name = "Mediterranean industrial key light"
    key.data.energy = 1150
    key.data.shape = "DISK"
    key.data.size = 5.5

    bpy.ops.object.light_add(type="AREA", location=(5.5, 4.0, 6.5))
    fill = bpy.context.object
    fill.name = "Cool sky fill"
    fill.data.energy = 380
    fill.data.color = (0.5, 0.61, 0.7)
    fill.data.size = 5

    bpy.ops.object.camera_add(location=(0, -13.5, 9.8))
    camera = bpy.context.object
    camera.name = "RTS orthographic camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 7.6
    camera.data.lens = 50
    look_at(camera)
    scene.camera = camera
    bpy.context.view_layer.update()
    validate_camera(scene, camera)


def main():
    args = arguments()
    selected_states = tuple(state.strip() for state in args.states.split(",") if state.strip())
    unknown_states = set(selected_states) - set(STATE_STEPS)
    if unknown_states:
        raise ValueError(f"Unknown Harvester states: {sorted(unknown_states)}")

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    rig = build_harvester()
    configure_scene()

    blend_path = Path(args.blend).resolve()
    frames_dir = Path(args.frames_dir).resolve()
    blend_path.parent.mkdir(parents=True, exist_ok=True)
    frames_dir.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    scene = bpy.context.scene
    frame_index = 0
    for state, steps in STATE_STEPS.items():
        if state not in selected_states:
            continue
        for direction_index, direction in enumerate(DIRECTIONS):
            for step in range(steps):
                pose_harvester(rig, state, step)
                rig["root"].rotation_euler.z = -direction_index * (
                    2 * math.pi / len(DIRECTIONS)
                )
                scene.render.filepath = str(
                    frames_dir / f"{frame_index:03d}-{state}-{direction}-{step:02d}.png"
                )
                bpy.ops.render.render(write_still=True)
                frame_index += 1


if __name__ == "__main__":
    main()
