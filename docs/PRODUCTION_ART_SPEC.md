# Production art specification

## Scope

Iron Pass is the reference production slice. Work proceeds in this order:

1. authored vehicles: Tank, Scout and Harvester;
2. authored base structures and their operational states;
3. realistic Mediterranean terrain, resources and structural ground contact.

Gameplay scope remains unchanged while these families are replaced.

## Runtime topology

Blender is an offline authoring dependency. Deterministic scripts generate editable `.blend`
sources and transparent direction/state sheets. The asset compiler validates and packs them into
one typed WebP atlas consumed by Pixi. Missing or invalid runtime frames retain the procedural
painter as a fallback.

## Shared contracts

- Model positive X projects to screen east and is validated numerically.
- Mobile production assets use 16 authored directions.
- Ground-contact geometry remains registered while suspended mass carries motion.
- Owner tint preserves material value separation.
- Vehicle selection footprints follow authoritative facing.
- Every asset is accepted at normal and minimum gameplay zoom, not only in Blender.
- Cosmetic animation never enters deterministic simulation state.

## Vehicle requirements

### Scout

- Low, forward-biased four-wheel reconnaissance silhouette.
- Exposed wheels, armored cabin, glazing and radio equipment remain readable.
- States: idle and a four-pose wheel/suspension movement cycle.
- No weapon or firing state.

### Harvester

- Heavy industrial collection vehicle, visually distinct from combat armor.
- Collection head, ore storage and cargo state remain readable without relying on the HUD.
- States: idle, movement, gathering and depositing.

## Structure requirements

- Construction Yard, Power Plant, Barracks and Factory are the representative first family.
- Massing communicates function before decals or color.
- Foundations visibly register with the terrain.
- Construction, operational, powered-down, damaged and destroyed states are authored where the
  simulation exposes the required presentation data.

## Terrain requirements

- Replace tile-like repetition with connected limestone, compacted soil and road surfaces.
- Rock and structure edges create believable contact, debris and material transition.
- Traversable lanes, blocked formations and ore remain immediately legible.
- Detail is deterministic, bounded and presentation-only.

## Validation

- Exact source frame counts and typed frame IDs.
- Camera-axis and ground-origin checks in render scripts.
- Unit tests for runtime state/facing selection and fallback behavior.
- Full test, typecheck, lint and production build gates.
- Manual straight-line, turning, minimum-zoom and mixed-faction playtest.
