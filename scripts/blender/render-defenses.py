"""Author and render the Iron Pass turret and adaptive concrete-wall family.

The turret is split into a fixed base and a directional head so the runtime can
change authoritative facing without duplicating the base in every frame.
Concrete walls provide every N/E/S/W connection mask and remain grid-registered.

Run with:
  blender --background --python scripts/blender/render-defenses.py -- \
    --assets-dir assets-src/structures/defenses \
    --frames-dir /private/tmp/iron-doctrine-defense-frames
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector


FRAME_SIZE = 256
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
WALL_DIRECTIONS = tuple(f"mask-{mask:02d}" for mask in range(16))


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets-dir", required=True)
    parser.add_argument("--frames-dir", required=True)
    parser.add_argument("--assets", default="turret,wall")
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])


def material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic=0.0,
    roughness=0.8,
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
        principled.inputs["Emission Strength"].default_value = 2.2
    if variation:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 5.4
        noise.inputs["Detail"].default_value = 2.2
        noise.inputs["Roughness"].default_value = 0.72
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.2
        ramp.color_ramp.elements[0].color = tuple(
            max(0, channel * (1 - variation)) for channel in color[:3]
        ) + (color[3],)
        ramp.color_ramp.elements[1].position = 0.8
        ramp.color_ramp.elements[1].color = tuple(
            min(1, channel * (1 + variation)) for channel in color[:3]
        ) + (color[3],)
        links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"], principled.inputs["Base Color"])
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = min(0.18, variation)
        bump.inputs["Distance"].default_value = 0.035
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    return value


def materials():
    return {
        "concrete": material(
            "Concrete - weathered blast resistant",
            (0.29, 0.285, 0.245, 1),
            roughness=0.95,
            variation=0.16,
        ),
        "concrete_dark": material(
            "Concrete - soil and oil contact",
            (0.105, 0.105, 0.09, 1),
            roughness=0.98,
            variation=0.1,
        ),
        "olive": material(
            "Armor - field olive weathering",
            (0.14, 0.17, 0.105, 1),
            metallic=0.18,
            roughness=0.8,
            variation=0.12,
        ),
        "olive_light": material(
            "Armor - sun-worn upper plane",
            (0.245, 0.26, 0.16, 1),
            metallic=0.16,
            roughness=0.78,
            variation=0.1,
        ),
        "steel": material(
            "Mechanism - oxidized gun steel",
            (0.07, 0.085, 0.075, 1),
            metallic=0.55,
            roughness=0.66,
            variation=0.08,
        ),
        "steel_light": material(
            "Mechanism - exposed worn edge",
            (0.22, 0.22, 0.18, 1),
            metallic=0.48,
            roughness=0.6,
            variation=0.06,
        ),
        "dark": material(
            "Mechanical recess",
            (0.018, 0.023, 0.021, 1),
            metallic=0.2,
            roughness=0.9,
        ),
        "faction": material(
            "Neutral owner identification panel",
            (0.46, 0.33, 0.16, 1),
            roughness=0.84,
            variation=0.05,
        ),
        "lamp_off": material(
            "Defense status lamp off",
            (0.18, 0.07, 0.025, 1),
            roughness=0.7,
        ),
        "lamp_on": material(
            "Defense status lamp armed",
            (0.72, 0.17, 0.035, 1),
            roughness=0.42,
            emission=(0.95, 0.08, 0.015, 1),
        ),
    }


def apply_material(obj, value) -> None:
    obj.data.materials.append(value)


def box(name, location, scale, value, bevel=0.045, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = tuple(axis / 2 for axis in scale)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Field-worn edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
    apply_material(obj, value)
    return obj


def cylinder(name, location, radius, depth, value, vertices=16, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    modifier = obj.modifiers.new("Field-worn edges", "BEVEL")
    modifier.width = 0.03
    modifier.segments = 1
    apply_material(obj, value)
    return obj


def parent_local(obj, parent) -> None:
    obj.parent = parent


def look_at(obj, target=(0, 0, 0.75)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.materials,
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            datablocks.remove(datablock)


def configure_common_scene() -> None:
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
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.045, 0.052, 0.04, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.58

    bpy.ops.object.light_add(type="AREA", location=(-4.8, -5.8, 9.0))
    key = bpy.context.object
    key.name = "Mediterranean upper-left key"
    key.data.energy = 1050
    key.data.shape = "DISK"
    key.data.size = 5.5
    bpy.ops.object.light_add(type="AREA", location=(4.5, 3.8, 6.0))
    fill = bpy.context.object
    fill.name = "Cool sky fill"
    fill.data.energy = 330
    fill.data.color = (0.54, 0.63, 0.70)
    fill.data.size = 6.0


def configure_turret_camera():
    scene = bpy.context.scene
    bpy.ops.object.camera_add(location=(0, -8.8, 6.9))
    camera = bpy.context.object
    camera.name = "Defense orthographic camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 4.6
    look_at(camera)
    scene.camera = camera
    bpy.context.view_layer.update()
    ground = world_to_camera_view(scene, camera, Vector((0, 0, 0)))
    east = world_to_camera_view(scene, camera, Vector((1, 0, 0)))
    angle = math.atan2(-(east.y - ground.y), east.x - ground.x)
    if not math.isclose(angle, 0, abs_tol=1e-6):
        raise RuntimeError(f"Turret camera projects east at {math.degrees(angle):.3f} degrees")


def build_turret(values):
    base_objects = []
    head_objects = []

    def base_box(*args, **kwargs):
        obj = box(*args, **kwargs)
        base_objects.append(obj)
        return obj

    def base_cylinder(*args, **kwargs):
        obj = cylinder(*args, **kwargs)
        base_objects.append(obj)
        return obj

    base_box(
        "Turret soil-contact foundation",
        (0.05, 0.05, 0.055),
        (2.15, 2.15, 0.11),
        values["concrete_dark"],
        0.05,
    )
    base_box(
        "Turret registered concrete plinth",
        (0, 0, 0.18),
        (1.95, 1.95, 0.27),
        values["concrete"],
        0.08,
    )
    for x, y in ((-0.78, -0.78), (0.78, -0.78), (-0.78, 0.78), (0.78, 0.78)):
        base_cylinder("Foundation anchor bolt", (x, y, 0.35), 0.065, 0.07, values["steel"], 8)
    base_box(
        "Armored equipment bunker",
        (0, 0.08, 0.63),
        (1.48, 1.45, 0.68),
        values["olive"],
        0.1,
    )
    base_box(
        "Bunker sloped roof",
        (0, 0.08, 1.01),
        (1.58, 1.55, 0.16),
        values["olive_light"],
        0.05,
    )
    base_cylinder("Fixed traverse race", (0, 0, 1.12), 0.62, 0.22, values["steel"], 20)
    base_cylinder("Traverse bearing edge", (0, 0, 1.25), 0.5, 0.08, values["steel_light"], 20)
    base_box(
        "Owner armor panel",
        (-0.77, -0.28, 0.68),
        (0.07, 0.62, 0.28),
        values["faction"],
        0.018,
    )
    lamp = base_box(
        "Armed status lamp",
        (0.58, -0.69, 0.82),
        (0.14, 0.08, 0.14),
        values["lamp_off"],
        0.018,
    )
    lamp.data.materials.append(values["lamp_on"])

    head_root = bpy.data.objects.new("Authoritative directional gun head", None)
    bpy.context.collection.objects.link(head_root)
    head_root.location = (0, 0, 1.28)

    housing = cylinder(
        "Cast gun housing",
        (0, 0, 0.25),
        0.47,
        0.48,
        values["olive"],
        18,
    )
    parent_local(housing, head_root)
    head_objects.append(housing)
    mantlet = box(
        "Reinforced gun mantlet",
        (0.38, 0, 0.27),
        (0.46, 0.58, 0.42),
        values["olive_light"],
        0.07,
    )
    parent_local(mantlet, head_root)
    head_objects.append(mantlet)
    barrel = cylinder(
        "Recoiling cannon barrel",
        (0.96, 0, 0.30),
        0.105,
        1.35,
        values["steel"],
        14,
        rotation=(0, math.pi / 2, 0),
    )
    parent_local(barrel, head_root)
    head_objects.append(barrel)
    muzzle = cylinder(
        "Muzzle brake",
        (1.63, 0, 0.30),
        0.16,
        0.30,
        values["steel_light"],
        12,
        rotation=(0, math.pi / 2, 0),
    )
    parent_local(muzzle, head_root)
    head_objects.append(muzzle)
    sight = box(
        "Armored optical sight",
        (0.1, -0.31, 0.58),
        (0.34, 0.22, 0.20),
        values["dark"],
        0.035,
    )
    parent_local(sight, head_root)
    head_objects.append(sight)
    hatch = cylinder(
        "Commander maintenance hatch",
        (-0.08, 0.04, 0.53),
        0.25,
        0.07,
        values["olive_light"],
        14,
    )
    parent_local(hatch, head_root)
    head_objects.append(hatch)

    for obj in base_objects:
        if "foundation" in obj.name.lower() or "anchor" in obj.name.lower():
            obj["build_stage"] = 0
        elif "bunker" in obj.name.lower():
            obj["build_stage"] = 1
        elif "race" in obj.name.lower() or "bearing" in obj.name.lower():
            obj["build_stage"] = 2
        else:
            obj["build_stage"] = 3

    return {
        "base": base_objects,
        "head": head_objects,
        "head_root": head_root,
        "lamp": lamp,
        "barrel": barrel,
        "muzzle": muzzle,
        "barrel_rest": barrel.location.copy(),
        "muzzle_rest": muzzle.location.copy(),
    }


def hide(objects, hidden: bool) -> None:
    for obj in objects:
        obj.hide_render = hidden


def render_frame(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def render_turret(assets_dir: Path, frames_root: Path) -> None:
    clear_scene()
    values = materials()
    rig = build_turret(values)
    configure_common_scene()
    configure_turret_camera()
    hide(rig["base"], False)
    hide(rig["head"], False)
    rig["lamp"].active_material_index = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(assets_dir / "turret.blend"))

    base_dir = frames_root / "turret_base"
    hide(rig["head"], True)
    frame_index = 0
    for state, count in (("construction", 4), ("complete", 4), ("idle", 1)):
        for step in range(count):
            for obj in rig["base"]:
                obj.hide_render = state == "construction" and int(obj.get("build_stage", 3)) > step
            rig["lamp"].active_material_index = (
                1 if state == "complete" and step >= 2 else 0
            )
            render_frame(base_dir / f"{frame_index:03d}-{state}-south-{step:02d}.png")
            frame_index += 1

    head_dir = frames_root / "turret_head"
    hide(rig["base"], True)
    hide(rig["head"], False)
    frame_index = 0
    for state, count in (("idle", 1), ("fire", 2)):
        for direction_index, direction in enumerate(DIRECTIONS):
            rig["head_root"].rotation_euler.z = -direction_index * math.tau / len(DIRECTIONS)
            for step in range(count):
                recoil = 0.0 if state == "idle" or step == 0 else 0.18
                rig["barrel"].location.x = rig["barrel_rest"].x - recoil
                rig["muzzle"].location.x = rig["muzzle_rest"].x - recoil
                render_frame(
                    head_dir / f"{frame_index:03d}-{state}-{direction}-{step:02d}.png"
                )
                frame_index += 1


def configure_wall_camera():
    scene = bpy.context.scene
    # Visibility changes between connection masks must not inherit temporal
    # history from the previously rendered mask.
    scene.eevee.use_taa_reprojection = False
    scene.render.dither_intensity = 0.0
    bpy.ops.object.camera_add(location=(0, 0, 8.0))
    camera = bpy.context.object
    camera.name = "Connection-registered top-down wall camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.4
    camera.rotation_euler = (0, 0, 0)
    look_at(camera, (0, 0, 0))
    scene.camera = camera
    bpy.context.view_layer.update()
    center = world_to_camera_view(scene, camera, Vector((0, 0, 0)))
    east = world_to_camera_view(scene, camera, Vector((1, 0, 0)))
    north = world_to_camera_view(scene, camera, Vector((0, 1, 0)))
    if east.x <= center.x or north.y <= center.y:
        raise RuntimeError("Wall camera does not preserve the N/E grid contract")


def build_wall(values):
    stage_objects: dict[int, list] = {0: [], 1: [], 2: [], 3: []}
    arms: dict[str, list] = {"north": [], "east": [], "south": [], "west": []}

    def register(obj, stage: int, arm: str | None = None):
        obj["build_stage"] = stage
        stage_objects[stage].append(obj)
        if arm:
            arms[arm].append(obj)
        return obj

    register(
        box(
            "Wall center soil contact",
            (0, 0, 0.04),
            (0.72, 0.72, 0.08),
            values["concrete_dark"],
            0.035,
        ),
        0,
    )
    register(
        box(
            "Wall center blast pier",
            (0, 0, 0.42),
            (0.60, 0.60, 0.72),
            values["concrete"],
            0.065,
        ),
        1,
    )
    register(
        box(
            "Wall center armored cap",
            (0, 0, 0.82),
            (0.68, 0.68, 0.12),
            values["olive_light"],
            0.035,
        ),
        2,
    )
    register(
        box(
            "Wall owner identification plate",
            (0, -0.315, 0.56),
            (0.24, 0.035, 0.18),
            values["faction"],
            0.012,
        ),
        3,
    )

    definitions = {
        "north": ((0, 0.68, 0.04), (0.54, 0.84, 0.08), (0, 0.68, 0.39), (0.48, 0.84, 0.64)),
        "east": ((0.68, 0, 0.04), (0.84, 0.54, 0.08), (0.68, 0, 0.39), (0.84, 0.48, 0.64)),
        "south": ((0, -0.68, 0.04), (0.54, 0.84, 0.08), (0, -0.68, 0.39), (0.48, 0.84, 0.64)),
        "west": ((-0.68, 0, 0.04), (0.84, 0.54, 0.08), (-0.68, 0, 0.39), (0.84, 0.48, 0.64)),
    }
    for name, (foot_location, foot_scale, wall_location, wall_scale) in definitions.items():
        register(
            box(
                f"{name.title()} arm soil footing",
                foot_location,
                foot_scale,
                values["concrete_dark"],
                0.025,
            ),
            0,
            name,
        )
        register(
            box(
                f"{name.title()} connected blast wall",
                wall_location,
                wall_scale,
                values["concrete"],
                0.045,
            ),
            1,
            name,
        )
        cap_location = (wall_location[0], wall_location[1], 0.75)
        cap_scale = (wall_scale[0] + 0.05, wall_scale[1] + 0.05, 0.10)
        register(
            box(
                f"{name.title()} connected armored cap",
                cap_location,
                cap_scale,
                values["steel_light"],
                0.025,
            ),
            2,
            name,
        )

    return {"stages": stage_objects, "arms": arms}


def set_wall_mask(rig, mask: int, construction_step: int | None) -> None:
    enabled = {
        "north": bool(mask & 1),
        "east": bool(mask & 2),
        "south": bool(mask & 4),
        "west": bool(mask & 8),
    }
    for stage, objects in rig["stages"].items():
        for obj in objects:
            obj.hide_render = construction_step is not None and stage > construction_step
    for name, objects in rig["arms"].items():
        if enabled[name]:
            continue
        for obj in objects:
            obj.hide_render = True
    bpy.context.view_layer.update()


def render_wall(assets_dir: Path, frames_root: Path) -> None:
    clear_scene()
    values = materials()
    rig = build_wall(values)
    configure_common_scene()
    configure_wall_camera()
    set_wall_mask(rig, 15, None)
    bpy.ops.wm.save_as_mainfile(filepath=str(assets_dir / "concrete_wall.blend"))

    output_dir = frames_root / "concrete_wall"
    frame_index = 0
    for state, count in (("construction", 4), ("idle", 1)):
        for mask, direction in enumerate(WALL_DIRECTIONS):
            for step in range(count):
                set_wall_mask(rig, mask, step if state == "construction" else None)
                render_frame(
                    output_dir / f"{frame_index:03d}-{state}-{direction}-{step:02d}.png"
                )
                frame_index += 1


def main() -> None:
    args = arguments()
    selected = {name.strip() for name in args.assets.split(",") if name.strip()}
    unknown = selected - {"turret", "wall"}
    if unknown:
        raise ValueError(f"Unknown defense assets: {', '.join(sorted(unknown))}")

    assets_dir = Path(args.assets_dir).resolve()
    frames_root = Path(args.frames_dir).resolve()
    assets_dir.mkdir(parents=True, exist_ok=True)
    frames_root.mkdir(parents=True, exist_ok=True)
    if "turret" in selected:
        render_turret(assets_dir, frames_root)
    if "wall" in selected:
        render_wall(assets_dir, frames_root)


if __name__ == "__main__":
    main()
