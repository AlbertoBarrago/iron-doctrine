# Animation system specification

## Overview

Iron Doctrine presents every gameplay entity through an explicit lifecycle derived from
authoritative simulation state and sequenced presentation events. Animation never changes gameplay
outcomes.

## Phase 0 context

- **Architecture:** deterministic 20 Hz simulation worker with interpolated PixiJS presentation.
- **Scale:** representative budget of 200 visible entities and 60 FPS on a desktop browser.
- **Asset stack:** Blender 5.2 LTS → deterministic source sheets → typed WebP atlases.
- **Reliability:** missing assets fall back by family; presentation must not affect save, replay or
  simulation hashes.

## State sources

Use immutable snapshots for persistent state:

- construction progress, production queue and build progress;
- position, facing, movement, targeting, healing and cargo;
- HP ratio, ownership and remaining resource amount.

Use sequenced `PresentationEvent` records for discrete events that may occur between published
snapshots:

- weapon fired;
- entity damaged or removed;
- ore deposited.

Each event has a monotonic sequence, simulation tick, kind, position and typed payload. The
renderer deduplicates by sequence. Events are presentation inputs, not mutable simulation
components. Unit production, building completion, ore depletion and combat-vs-recycle removal
still require explicit engine-side event causes before they can be represented without inference.

## Presentation clock

One client clock drives authored sprites, procedural fallback animation, particles, command
feedback and ambient effects.

- It advances only while gameplay is running.
- It clamps long frame deltas after tab suspension.
- Resume never catches up time elapsed while paused.
- Music and gameplay SFX observe the same paused state.

## Building lifecycle

Priority:

```text
destroyed → construction → completion → exit → producing/active → idle
```

Persistent damage is an independent overlay at HP thresholds, avoiding a Cartesian multiplication
of every authored frame.

| Family            | Authored contract                                               |
| ----------------- | --------------------------------------------------------------- |
| Construction Yard | `construction:4`, `complete:4`, `idle:1`, `service:4`           |
| Power Plant       | `construction:4`, `complete:4`, `generate:6`                    |
| Barracks          | `construction:4`, `complete:4`, `idle:1`, `produce:6`, `exit:4` |
| Factory           | `construction:4`, `complete:4`, `idle:1`, `produce:8`, `exit:6` |
| Turret            | staged base plus 16-direction head with idle/fire states        |
| Concrete wall     | one authored frame for each N/E/S/W connection mask             |

Construction frames are selected from authoritative progress. Completion and exit are one-shots.
Production and generation are loops selected from current state.

## Unit lifecycle

Priority:

```text
death → spawn → hit → action → move → damaged idle → idle
```

- Infantry actions include fire and heal. Engineer work is not shown until a real gameplay action
  exists.
- Vehicle movement keeps tracks or wheels registered while suspended mass carries weight.
- Harvester empty/loaded, gathering and depositing frames follow authoritative cargo state.
- Persistent vehicle damage uses bounded smoke and sparks rather than duplicate directional sheets.

## Resources and effects

- Resource snapshots expose original and remaining quantity for continuous depletion.
- Fragment count, fragment scale and ground scarring derive from the authoritative ratio.
- Damage smoke uses at most one persistent emitter per entity.
- Spawn, completion, hit and debris effects use bounded pools.
- Pool exhaustion drops decorative particles before tactical feedback.

## Atlas architecture

Production assets are separated into logical atlases:

- `vehicles`
- `infantry`
- `structures`
- `defenses`
- `world` when resource and environmental sprite families are introduced

Every atlas has an explicit maximum width and height. No generated texture may exceed 8192 pixels;
4096-pixel pages are preferred when automatic pagination is added.

## Failure behaviour

Fallback order:

1. requested state and direction;
2. idle in the same direction;
3. closest authored direction;
4. procedural family painter.

A missing action frame must never leave a stale previous action visible.

## Testing and acceptance

- Pure tests cover state priority, one-shot lifetime and event deduplication.
- Worker integration tests cover five-tick batching without lost events.
- Pause tests prove that sprites, particles, feedback and audio do not advance.
- Asset tests enforce atlas dimensions, frame order and group ownership.
- Runtime review covers normal/minimum zoom, mixed factions and 200 visible entities.
- Full tests, typecheck, ESLint, Biome and production build remain merge gates.

## Delivery order

1. Multi-atlas pipeline and failure isolation.
2. Pausable presentation clock and transition/event contracts.
3. Four production buildings from construction through unit exit.
4. Spawn, hit, damage and destruction lifecycle shared by units and buildings.
5. Infantry roles, defensive structures and resource depletion.
