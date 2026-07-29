"""Build and render the Iron Pass Scout source asset.

Run with:
  blender --background --python scripts/blender/render-scout.py -- \
    --blend assets-src/vehicles/scout/scout.blend \
    --frames-dir /tmp/iron-doctrine-scout-frames
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
        noise.inputs["Scale"].default_value = 5.5
        noise.inputs["Detail"].default_value = 2.2
        noise.inputs["Roughness"].default_value = 0.68
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.25
        ramp.color_ramp.elements[0].color = tuple(
            min(1, channel * (1 - variation)) for channel in color[:3]
        ) + (color[3],)
        ramp.color_ramp.elements[1].position = 0.75
        ramp.color_ramp.elements[1].color = tuple(
            min(1, channel * (1 + variation)) for channel in color[:3]
        ) + (color[3],)
        links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"], principled.inputs["Base Color"])

        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = min(0.12, variation)
        bump.inputs["Distance"].default_value = 0.02
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    return value


def apply_material(obj, value) -> None:
    obj.data.materials.append(value)


def box(name, location, scale, value, bevel=0.04, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Field-worn edges", "BEVEL")
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
    bevel = obj.modifiers.new("Field-worn edges", "BEVEL")
    bevel.width = 0.025
    bevel.segments = 1
    apply_material(obj, value)
    return obj


def parent_to(obj, root) -> None:
    obj.parent = root


def wheel_assembly(name, location, side, materials):
    pivot = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(pivot)
    pivot.location = location

    tire = cylinder(
        f"{name} tire",
        (0, 0, 0),
        0.42,
        0.28,
        materials["rubber"],
        vertices=14,
        rotation=(math.pi / 2, 0, 0),
    )
    rim = cylinder(
        f"{name} steel rim",
        (0, side * 0.015, 0),
        0.23,
        0.3,
        materials["steel"],
        vertices=12,
        rotation=(math.pi / 2, 0, 0),
    )
    spoke = box(
        f"{name} rotation marker",
        (0, side * 0.17, 0),
        (0.34, 0.035, 0.075),
        materials["steel_light"],
        0.012,
    )
    for obj in (tire, rim, spoke):
        parent_to(obj, pivot)
    return pivot


def build_scout():
    materials = {
        "olive": material(
            "Paint - weathered reconnaissance olive",
            (0.15, 0.19, 0.1, 1),
            roughness=0.78,
            variation=0.1,
        ),
        "olive_light": material(
            "Paint - sun-faded upper planes",
            (0.25, 0.28, 0.14, 1),
            roughness=0.74,
            variation=0.08,
        ),
        "olive_dark": material(
            "Paint - frame recesses",
            (0.075, 0.095, 0.055, 1),
            roughness=0.84,
            variation=0.07,
        ),
        "rubber": material("Tire rubber", (0.018, 0.022, 0.019, 1), roughness=0.96),
        "steel": material(
            "Exposed steel",
            (0.075, 0.085, 0.075, 1),
            metallic=0.48,
            roughness=0.58,
            variation=0.05,
        ),
        "steel_light": material(
            "Worn wheel steel",
            (0.17, 0.18, 0.15, 1),
            metallic=0.38,
            roughness=0.62,
        ),
        "glass": material(
            "Dusty armored glass",
            (0.055, 0.13, 0.13, 1),
            metallic=0.18,
            roughness=0.28,
            variation=0.04,
        ),
        "faction": material(
            "Neutral faction cloth",
            (0.5, 0.42, 0.22, 1),
            roughness=0.84,
            variation=0.04,
        ),
    }

    root = bpy.data.objects.new("Scout - Iron Pass", None)
    bpy.context.collection.objects.link(root)
    suspension = bpy.data.objects.new("Suspended body", None)
    bpy.context.collection.objects.link(suspension)
    parent_to(suspension, root)

    body_parts = [
        box("Lower frame", (-0.1, 0, 0.58), (2.95, 1.38, 0.28), materials["olive_dark"], 0.06),
        box("Armored belly", (-0.05, 0, 0.77), (2.7, 1.22, 0.32), materials["olive"], 0.07),
        box(
            "Sloped bonnet",
            (0.84, 0, 1.0),
            (1.15, 1.12, 0.34),
            materials["olive_light"],
            0.055,
            (0, -0.13, 0),
        ),
        box("Cabin", (-0.25, 0, 1.18), (1.02, 1.08, 0.62), materials["olive"], 0.075),
        box("Cabin roof", (-0.32, 0, 1.53), (1.16, 1.15, 0.13), materials["olive_light"], 0.04),
        box(
            "Armored windscreen",
            (0.31, 0, 1.28),
            (0.055, 0.82, 0.31),
            materials["glass"],
            0.018,
            (0, -0.18, 0),
        ),
        box("Left side window", (-0.23, -0.555, 1.29), (0.55, 0.035, 0.27), materials["glass"], 0.01),
        box("Right side window", (-0.23, 0.555, 1.29), (0.55, 0.035, 0.27), materials["glass"], 0.01),
        box("Rear equipment deck", (-1.08, 0, 1.0), (0.64, 1.05, 0.3), materials["olive_dark"], 0.045),
        box("Faction bonnet panel", (0.88, -0.575, 1.08), (0.38, 0.03, 0.18), materials["faction"], 0.008),
        box("Front bumper", (1.5, 0, 0.62), (0.16, 1.38, 0.16), materials["steel"], 0.025),
        box("Rear bumper", (-1.58, 0, 0.62), (0.16, 1.3, 0.16), materials["steel"], 0.025),
    ]
    for obj in body_parts:
        parent_to(obj, suspension)

    spare = cylinder(
        "Rear spare wheel",
        (-1.68, 0, 1.08),
        0.4,
        0.22,
        materials["rubber"],
        vertices=14,
        rotation=(0, math.pi / 2, 0),
    )
    parent_to(spare, suspension)

    antenna = cylinder(
        "Long-range radio antenna",
        (-1.0, 0.43, 2.1),
        0.018,
        1.45,
        materials["steel"],
        vertices=8,
        rotation=(0.09, -0.05, 0),
    )
    parent_to(antenna, suspension)

    wheels = []
    for side in (-1, 1):
        label = "Left" if side < 0 else "Right"
        for axle, x in (("front", 0.92), ("rear", -1.0)):
            wheel = wheel_assembly(
                f"{label} {axle} wheel",
                (x, side * 0.77, 0.43),
                side,
                materials,
            )
            parent_to(wheel, root)
            wheels.append(wheel)

    return {
        "root": root,
        "suspension": suspension,
        "wheels": wheels,
    }


def pose_scout(rig, state: str, step: int) -> None:
    rig["suspension"].location = (0, 0, 0)
    rig["suspension"].rotation_euler = (0, 0, 0)
    for wheel in rig["wheels"]:
        wheel.rotation_euler = (0, 0, 0)

    if state == "move":
        wheel_angle = step * (math.pi / 2)
        for wheel in rig["wheels"]:
            wheel.rotation_euler.y = wheel_angle
        suspension_lift = (0.0, 0.018, 0.0, -0.012)[step]
        suspension_pitch = (0.008, -0.006, -0.008, 0.006)[step]
        rig["suspension"].location.z = suspension_lift
        rig["suspension"].rotation_euler.y = suspension_pitch


def look_at(obj, target=(0, 0, 0.75)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def validate_camera(scene, camera) -> None:
    origin = world_to_camera_view(scene, camera, Vector((0, 0, 0.75)))
    east = world_to_camera_view(scene, camera, Vector((1, 0, 0.75)))
    screen_angle = math.atan2(-(east.y - origin.y), east.x - origin.x)
    if not math.isclose(screen_angle, 0, abs_tol=1e-6):
        raise RuntimeError(
            f"Camera projects model east at {math.degrees(screen_angle):.3f} degrees"
        )
    ground = world_to_camera_view(scene, camera, Vector((0, 0, 0)))
    if not 0 < ground.x < 1 or not 0 < ground.y < 1:
        raise RuntimeError("Ground origin falls outside the Scout frame")


def configure_scene():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 192
    scene.render.resolution_y = 192
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = True
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = scene.world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.035, 0.042, 0.028, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.4

    bpy.ops.object.light_add(type="AREA", location=(-3.6, -4.6, 7.8))
    key = bpy.context.object
    key.name = "Mediterranean key light"
    key.data.energy = 980
    key.data.shape = "DISK"
    key.data.size = 3.6

    bpy.ops.object.light_add(type="AREA", location=(4.2, 3.2, 4.8))
    fill = bpy.context.object
    fill.name = "Sky fill"
    fill.data.energy = 145
    fill.data.color = (0.46, 0.55, 0.62)
    fill.data.size = 4.5

    bpy.ops.object.camera_add(location=(0, -9.8, 7.6))
    camera = bpy.context.object
    camera.name = "RTS orthographic camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 5.15
    look_at(camera)
    scene.camera = camera
    bpy.context.view_layer.update()
    validate_camera(scene, camera)


def main():
    args = arguments()
    requested_states = tuple(state.strip() for state in args.states.split(",") if state.strip())
    unknown_states = set(requested_states) - set(STATE_STEPS)
    if unknown_states:
        raise ValueError(f"Unknown render states: {sorted(unknown_states)}")

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    rig = build_scout()
    configure_scene()

    blend_path = Path(args.blend).resolve()
    frames_dir = Path(args.frames_dir).resolve()
    blend_path.parent.mkdir(parents=True, exist_ok=True)
    frames_dir.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    scene = bpy.context.scene
    frame_index = 0
    for state in requested_states:
        steps = STATE_STEPS[state]
        for direction_index, direction in enumerate(DIRECTIONS):
            for step in range(steps):
                pose_scout(rig, state, step)
                rig["root"].rotation_euler.z = -direction_index * (2 * math.pi / len(DIRECTIONS))
                scene.render.filepath = str(
                    frames_dir / f"{frame_index:03d}-{state}-{direction}-{step:02d}.png"
                )
                bpy.ops.render.render(write_still=True)
                frame_index += 1


if __name__ == "__main__":
    main()
