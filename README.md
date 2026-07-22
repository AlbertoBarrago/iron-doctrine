# Iron Doctrine

Iron Doctrine is an original browser real-time strategy game inspired by the clarity,
pace and physical command interfaces of the classic 1990s genre.

The goal is a real game, not a technology demo: build a base, control an economy,
produce an army and make readable tactical decisions on a battlefield that reacts to
the player.

The current build is an early playable vertical slice. Its foundations are solid, but
game feel, balance, visual identity and content are still actively evolving.

## Play the current build

Requirements: Node.js 20+ and pnpm.

```bash
pnpm install
pnpm --filter @iron/client dev
```

Open <http://localhost:5173>, configure a skirmish and start playing.

You can also create a battlefield in the Map Forge, save it in the local level catalog
or exchange it as a JSON file. Locally saved maps appear in the skirmish setup screen.

## How to play

- Left-click a unit or building to select it.
- Drag with the left mouse button to select a squad.
- Right-click terrain to move selected units or set a production rally point.
- Right-click a red unit or building to attack it.
- Select a harvester and right-click an ore field to gather from that field.
- Use the contextual selection card for available orders such as Harvest and Stop.
- Use the right command panel to construct buildings and produce units.
- Click or drag on the tactical radar to explore the battlefield without moving units.
- Use the mouse wheel to zoom and WASD or the arrow keys to move the camera.

The objective is to destroy the enemy construction yard without losing your own.

## What works today

- Configurable skirmishes with AI difficulty, preparation time and enemy starting force.
- Base construction, power management, resource harvesting and unit production.
- Infantry, vehicles, defensive turrets, combat, fog of war and victory conditions.
- Contextual unit and building orders with a guided first-match tutorial.
- Local map catalog, validated JSON import/export and a full-screen map editor.
- Save/load, deterministic replays and the networking foundation for multiplayer.
- Original industrial military interface, tactical radar, effects and synthesized audio.

The project currently has 127 automated tests. Tests, strict type checking, linting and
the production build are expected to stay green on every change.

## Roadmap

The next work is ordered around player value rather than subsystem novelty.

### Now — make the match understandable and enjoyable

- [ ] Clarify what every structure unlocks and why the player should build it.
- [ ] Tune economy, construction timings, unit costs and AI pressure through playtesting.
- [ ] Improve battlefield readability, silhouettes, scale and selection feedback.
- [ ] Replace remaining prototype presentation with a coherent original visual language.
- [ ] Add useful feedback for invalid orders, unavailable production and blocked placement.

### Next — turn the sandbox into a game

- [ ] Add scenario objectives, map triggers and authored mission events.
- [ ] Expand AI with scouting, defense, expansion and threat-aware attacks.
- [ ] Build a balanced original faction roster with meaningful counters.
- [ ] Add terrain types, chokepoints and maps designed around strategic choices.
- [ ] Introduce a proper campaign/skirmish content pipeline and persistent settings.

### Later — production and release

- [ ] Run authoritative matches on the headless server with ownership validation.
- [ ] Add end-to-end match tests, performance budgets and accessibility verification.
- [ ] Produce original art, animation, music and a complete audio pass.
- [ ] Harden deployment, telemetry, crash reporting and release packaging.

The detailed technical milestones and architectural decisions remain in the
[software design document](docs/SOFTWARE_DESIGN_DOCUMENT.md).

## Want to collaborate?

Yes — especially if you care about RTS games and can explain why a moment feels clear,
confusing, satisfying or unfair.

Useful ways to contribute:

- Play a match and report the first moment where you no longer know what to do.
- Create and share maps through the editor's JSON format.
- Propose balance changes with the scenario and expected player behaviour attached.
- Improve code with focused, tested changes that preserve deterministic simulation.
- Contribute original visual or audio work that fits the game's identity.

Before starting a large change, align it with the current roadmap. Small, reviewable
contributions are preferable to broad rewrites.

## Development

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm --filter @iron/server dev
```

The monorepo contains:

```text
packages/shared   shared formats and network contracts
packages/engine   deterministic headless game simulation
apps/client       React, PixiJS and the simulation worker
apps/server       multiplayer match host foundation
docker            reproducible local and production containers
docs              architecture and longer-term design
```

The simulation uses fixed steps, fixed-point math and seeded randomness. Given the
same commands and seed, it produces the same outcome in the browser, server, replay
runner and tests.

## Map Forge

The editor supports blocked terrain, ore fields, player spawns, live validation,
50–250% zoom and scrollable detail editing. Hold Ctrl or Command while using the mouse
wheel to zoom. `Save level` stores a map locally; import/export uses the versioned
`MapDef` JSON format.

## License and intellectual property

Iron Doctrine is original work. It does not include Command & Conquer names, factions,
artwork or audio. Its inspiration is limited to genre conventions and game-design
principles.
