# Blender guide for Iron Doctrine

This guide explains the small part of Blender needed to work on Iron Doctrine's production
sprites. It follows the Battle Tank and Rifleman workflows rather than trying to cover Blender as
a whole.

## Mental model

The game does not render Blender models at runtime. Blender is an authoring tool in an offline
pipeline:

```text
Python model recipe
        ↓
editable .blend file
        ↓
transparent PNG frames
        ↓
source sprite sheet
        ↓
deterministic WebP atlas + TypeScript frame IDs
        ↓
PixiJS renderer
```

The authoritative sources for geometry, materials, camera, lighting and poses are
`scripts/blender/render-battle-tank.py` and `scripts/blender/render-infantry.py`. Running either
script rebuilds its `.blend` file from scratch. Changes made only in the Blender UI are useful for
experimentation, but they will be overwritten by the next scripted build. Copy successful
experiments into the Python recipe before treating them as production work.

## Installation

The project targets Blender 5.2 LTS. On macOS:

```sh
brew install --cask blender
blender --version
```

Open the generated source file from the repository root:

```sh
blender assets-src/vehicles/tank/tank.blend
# or
blender assets-src/units/infantry/rifleman.blend
```

## The interface you need

Blender opens with several editors. Four matter for this workflow:

- **3D Viewport**: inspect the model, camera and lights.
- **Outliner**: the object tree in the upper-right. Use it to find parts by their production names.
- **Properties**: object, modifier, material, camera and render settings.
- **Python Console**: `Window > Toggle System Console` is not available in the same way on macOS;
  use the `Scripting` workspace when testing small `bpy` expressions.

The most useful controls in the 3D Viewport are:

| Input                           | Action                                |
| ------------------------------- | ------------------------------------- |
| Middle mouse drag               | Orbit                                 |
| Shift + middle mouse drag       | Pan                                   |
| Mouse wheel or pinch            | Zoom                                  |
| Click                           | Select                                |
| `G`                             | Move the selected object              |
| `R`                             | Rotate it                             |
| `S`                             | Scale it                              |
| `X`, `Y`, `Z` after a transform | Constrain the transform to one axis   |
| `Esc` or right click            | Cancel the active transform           |
| `N`                             | Show exact transform values           |
| `F3`                            | Search for any Blender command        |
| Numpad `0`                      | Enter or leave the active camera view |
| `F12`                           | Render the current view               |

Without a numeric keypad, use `View > Cameras > Active Camera`.

Blender has modes. Stay in **Object Mode** while learning this asset. **Edit Mode** changes a mesh's
vertices and is not required for the current procedural low-poly model. Press `Tab` to switch modes;
if selection or transforms behave unexpectedly, first check the mode selector in the viewport header.

## The Battle Tank scene

The model faces positive X before the root object is rotated into the 16 gameplay directions.
Important objects in the Outliner include:

- `Battle Tank - Iron Pass`: root transform for direction and suspension poses;
- `Suspended chassis`: upper vehicle group displaced by the movement poses;
- `Lower hull`, `Sloped hull`, `Glacis`: main silhouette;
- `Left track`, `Right track` and road wheels: running gear;
- `Turret`, `Turret mantlet`: weapon platform;
- `Main gun`, `Muzzle brake`: parts translated during recoil;
- `RTS orthographic camera`: fixed production camera;
- `Mediterranean key light`, `Sky fill`: shared lighting language.

The camera is orthographic. Objects therefore keep the same apparent size with distance, matching an
RTS view and preventing perspective changes between facings.

Its azimuth is aligned with the model axes: model positive X projects to screen east. The render
script validates this contract before exporting, because even a small camera orbit would make a
vehicle appear to move sideways relative to its runtime heading.

Materials use a restrained military-industrial palette. At 192 × 192 pixels, value separation and
silhouette matter more than fine surface detail. Always judge an edit at gameplay size, not only in a
zoomed Blender viewport.

## How the animation works

This asset uses discrete authored poses rather than a skeletal rig:

| State    | Frames per direction | Purpose                                         |
| -------- | -------------------: | ----------------------------------------------- |
| `idle`   |                    1 | Stable default silhouette                       |
| `move`   |                    2 | Small alternating suspension displacement       |
| `recoil` |                    2 | Fast barrel recoil followed by partial recovery |

Each state is rendered in 16 directions. The result is 80 frames ordered by state, direction and
step. Runtime code loops `move`, triggers `recoil` when the authoritative weapon cooldown restarts,
and returns to `idle` automatically. These choices remain presentation-only and do not affect
simulation determinism.

The pose values live in `pose_tank()`:

- movement displaces only `Suspended chassis` vertically by a small amount;
- tracks and road wheels remain fixed to the root so ground contact never moves;
- recoil translates the gun and muzzle brake backward along the tank's local X axis;
- every pose resets all animated transforms before applying its own offsets.

That reset is important. Without it, state changes would accumulate transforms and later frames
would depend on render order.

## The Rifleman scene

The Rifleman uses the same camera-axis and 16-direction contract as the tank. In the Outliner,
`Rifleman - Iron Pass` is the direction root, `Upper body` carries restrained body motion and
`Weapon rig` carries recoil. Boots and legs remain attached to the root.

Its two movement frames alternate the feet along local X while the root stays fixed. This is the
infantry version of keeping tank tracks grounded: locomotion changes the pose around a stable world
contact instead of translating the sprite. Fire briefly moves the weapon backward; the runtime
effect layer remains responsible for muzzle flash and projectiles.

## Production build

From the repository root:

```sh
frames_dir="$(mktemp -d /tmp/iron-doctrine-tank-frames.XXXXXX)"
blender --background --python scripts/blender/render-battle-tank.py -- \
  --blend assets-src/vehicles/tank/tank.blend \
  --frames-dir "$frames_dir"
node scripts/blender/compose-battle-tank.mjs \
  "$frames_dir" assets-src/vehicles/tank/tank.png
pnpm assets:build
```

This workflow writes:

- the editable `tank.blend`;
- the 80-frame `tank.png` source sheet;
- the generated WebP atlas and Pixi metadata;
- compile-time-safe frame IDs in `assets.gen.ts`.

For the Rifleman, use the parallel commands:

```sh
frames_dir="$(mktemp -d /tmp/iron-doctrine-rifleman-frames.XXXXXX)"
blender --background --python scripts/blender/render-infantry.py -- \
  --blend assets-src/units/infantry/rifleman.blend \
  --frames-dir "$frames_dir"
node scripts/blender/compose-infantry.mjs \
  "$frames_dir" assets-src/units/infantry/rifleman.png
pnpm assets:build
```

Blender may create `tank.blend1`, a local backup of the previous file. It is not a production asset
and must not be committed.

Never paint individual direction frames by hand. A correction belongs in the model, material,
camera, light or pose so every facing remains consistent and the export stays reproducible.

## A safe first exercise

Change one material without changing geometry:

1. Find the `olive` material definition in `build_tank()`.
2. Adjust only its RGB values slightly.
3. Render to a temporary `.blend` path and temporary frames directory.
4. Compose a temporary sheet.
5. Compare the east, south, west and north facings at 100% size.
6. Revert the experiment or apply it intentionally to the production render.

This teaches the complete pipeline while keeping silhouette, frame order and runtime behaviour
unchanged.

## Acceptance checklist

Before committing a Blender asset change:

- all expected frames render without errors;
- transparent edges are clean;
- the silhouette is recognizable at normal and minimum gameplay zoom;
- lighting remains consistent across every facing and state;
- animation does not move the unit's apparent ground contact;
- the manifest frame counts match the source sheet exactly;
- `pnpm assets:build`, tests, typecheck, lint and build pass;
- generated outputs are committed with their editable source.

## Common problems

**The model disappeared or looks tiny**

Select `Battle Tank - Iron Pass` in the Outliner and use `View > Frame Selected`. Then enter the
active camera view to judge the production framing.

**Transforms use an unexpected axis**

The tank root rotates for direction. Child objects such as the gun are authored in local tank space.
Prefer explicit numeric transforms in Python over dragging parts by eye.

**A UI edit vanished**

The render script deletes the scene and rebuilds it. Move durable changes into
`render-battle-tank.py`.

**The asset compiler reports the wrong frame count**

Keep `STATE_STEPS`, the composer state counts and `assets-src/manifest.json` aligned. The compiler
rejects partial or implicit grids by design.

**The game still shows the procedural tank**

Run `pnpm assets:build`, restart the Vite development server and check the browser console. A missing
or invalid production atlas deliberately falls back to the procedural painter.
