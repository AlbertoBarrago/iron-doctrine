# Iron Doctrine

A browser-based, real-time strategy engine inspired by classic Command & Conquer
gameplay — built from scratch with original code and assets. Deterministic ECS
simulation, clean architecture, multiplayer-ready.

> Full design rationale: [`docs/SOFTWARE_DESIGN_DOCUMENT.md`](docs/SOFTWARE_DESIGN_DOCUMENT.md)

## Stack

TypeScript (strict) · React · PixiJS · Vite · Zustand · Web Workers · WebSocket ·
Node.js · Docker · pnpm workspaces · Vitest.

## Monorepo layout

```
packages/shared   cross-cutting types, constants, wire protocol
packages/engine   deterministic simulation core (ECS, math, systems) — headless
apps/client       browser app (React + Pixi + sim worker)
apps/server       Node.js lockstep match host
docker/           container + compose definitions
docs/             design document
```

The **engine** is the heart: a deterministic, fixed-step ECS simulation with no
rendering or platform dependencies. It compiles unchanged for the browser worker,
the Node server, and headless tests. Determinism (fixed-point Q16.16 math + seeded
PRNG + ordered systems) is the contract that enables lockstep multiplayer, replays
and savegames.

## Getting started

```bash
pnpm install
pnpm test          # run the engine test suite (incl. determinism gate)
pnpm typecheck     # strict project-references build
pnpm --filter @iron/client dev     # play the vertical slice at http://localhost:5173
pnpm --filter @iron/server dev     # start the match host on :8080
```

### Docker

```bash
docker compose -f docker/docker-compose.yml up --build
# client → http://localhost:8000   server → ws://localhost:8080
```

## Current status

114 tests green; strict typecheck, ESLint and client build all clean.

- ✅ ECS core (entities w/ generational handles, sparse-set stores, queries, scheduler)
- ✅ Fixed-point Q16.16 math, vec2, seeded PRNG (property-tested)
- ✅ Deterministic fixed-step Simulation + snapshots + state hashing
- ✅ Command bus (Move/Stop/Attack/Gather/Spawn/Queue-production/Rally/Cancel)
- ✅ Movement + pathfinding (NavGrid, deterministic A*, path smoothing, flow fields, formations)
- ✅ Combat (weapons, hitscan + projectiles, target acquisition, chase/leash, death)
- ✅ Economy (ore nodes, harvester gather→deposit loop, per-player credits)
- ✅ Base building + production (footprints on navgrid, build queues, construction time, rally points, cancel/refund)
- ✅ Base construction (placement preview, authoritative footprint validation, costs, build progress and deferred activation)
- ✅ Playable UX shell (industrial military HUD, tactical radar, mission briefing, contextual selection and guided tutorial)
- ✅ Playable production UI (select barracks/factory, pay costs, inspect progress/queue, cancel/refund, set rally point)
- ✅ Match lifecycle (deterministic victory/defeat/draw, simulation freeze, end screen and restart)
- ✅ Energy (per-player power balance; **power deficit disables defensive turrets**)
- ✅ Defensive turrets (auto-acquire, power-gated)
- ✅ Fog of war (per-team hidden/explored/visible grid, shared allied vision, rendered)
- ✅ Skirmish AI director (economy + production + aggression, easy/normal/hard)
- ✅ Tech tree (research, prerequisites, production gating)
- ✅ Save / load (full state round-trip) + replay (seed + command log + desync checksums)
- ✅ Networking: WS lockstep relay server + client transport + tested lockstep coordinator
- ✅ PixiJS renderer: interpolation, camera, drag-select, orders, health bars, fog overlay, minimap
- ✅ Particle explosions + synthesized WebAudio SFX
- ✅ In-browser map editor (terrain/resources/spawns → validated JSON export)
- ✅ Web Worker sim bridge (simulation off the main thread)
- ✅ Docker (client + server) & compose

Pending (see SDD roadmap): server-side headless authoritative sim, scripted map
triggers, richer AI behaviours (scout/harass), art & music assets.

## Controls (vertical slice)

Left-drag select · Double-click type-select · Ctrl/Shift add to selection · Right-click terrain to move/set rally ·
Right-click red forces to attack · Wheel zoom · WASD/Arrows pan · Use the command panel to place structures ·
Select a barracks/factory to produce units. The first skirmish includes a five-step interactive tutorial.

## License / IP

Original work. No Command & Conquer names, factions, artwork or audio are used or
included. Any resemblance is limited to genre mechanics.
