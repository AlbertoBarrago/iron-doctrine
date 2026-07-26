# Iron Doctrine — Project Status

Last updated: 2026-07-25

This document is the operational source of truth for completed work, known issues and
the next development slice. The README remains the public presentation of the game.

## Current milestone

First Contact is a playable vertical slice:

- start with a capable patrol and recover an abandoned command base;
- explore a full-screen battlefield through persistent fog of war;
- harvest ore, construct a base and produce units;
- read harvester load, extraction and deposit state directly on the battlefield;
- run multiple harvesters through shared ore and refinery approaches without deadlocking;
- identify infantry roles and industrial structures through grounded silhouettes, materials and motion;
- fight a paced deterministic AI with victory and defeat conditions;
- restart a finished match or return cleanly to the main menu;
- launch missions from a classic 1990s-inspired RTS command menu;
- navigate with mouse, keyboard and tactical radar;
- pause with `P`, quit to the main menu with `Q` or open the in-game Setup panel.

The validated source of truth is `main`. At this checkpoint the repository passes:

- 193 automated tests;
- TypeScript project typecheck;
- ESLint and Biome diagnostics;
- production builds for client, server, engine and shared packages.

## Decisions in force

- Simulation state remains deterministic and authoritative inside the engine.
- Render snapshots are the only simulation-to-client presentation boundary.
- The battlefield excludes the command sidebar from its camera viewport.
- Hidden map cells are fully black; explored terrain is remembered but attenuated.
- AI production observes unit build times and difficulty-specific army limits.
- AI production uses the same validated facility queues, costs and tech gates as players.
- Completed units wait for a collision-free facility exit instead of spawning into obstacles.
- Unit separation respects navigation bounds and blocked cells; pathfinding recovers displaced units.
- Mouse controls keep contextual orders on RMB, camera drag on MMB and cursor-anchored zoom.
- The procedural 2.5D art direction uses shared military-industrial materials, compact shadows and restrained faction accents.
- Infantry gait and recoil remain presentation-only and derive from immutable render snapshots.
- Building operation and construction state drive ambient animation without entering the simulation.
- Campaign victories prioritize returning to the campaign route; defeats prioritize retrying the mission.
- Prettier remains the formatter; ESLint and Biome both provide diagnostics.
- Large changes use dedicated branches and small Conventional Commits.

## Next development slice

### Gameplay correctness

1. Reproduce the reported mixed-selection order issue in the browser.
2. Decide how unarmed selected units should react when an enemy is right-clicked.
3. Playtest unit separation around structures, chokepoints and resource drop-offs.

### Combat and economy feedback

1. Show invalid, blocked and unavailable orders clearly.
2. Tune ore income, construction time and hostile pressure through complete matches.

### Campaign persistence

1. Add a local commander profile identified by an exact three-letter callsign.
2. Scope campaign completion and unlocks to that profile in versioned browser `localStorage`.
3. Migrate the current global campaign progress without losing completed missions.

### Campaign production

All five operations of the First Contact campaign arc are implemented:

- Operation 01 — Base Foundations and Operation 02 — First Contact: playtested, validated.
- Operation 03 — Iron Pass: browser-playtested. A dedicated runtime mission (`iron_pass`)
  with an authored chokepoint map and a scripted armored ambush triggered when the player
  crosses the pass.
- Operation 04 — Siege Line: browser-playtested, confirmed playable. A dedicated runtime
  mission (`siege_line`) with an authored defensible-corridor map and escalating scripted
  assault waves the player must hold against before counter-attacking the hostile command.
  Difficulty/pacing tuning is still expected as a follow-up, but the base loop holds up.
- Operation 05 — Black Dawn: implemented, browser playtest still outstanding. A dedicated
  runtime mission (`black_dawn`) with an authored stronghold-gate map and a scripted last
  stand triggered once the hostile command drops below a critical health threshold.

Next: playtest and balance Black Dawn, then revisit Siege Line's wave pacing/difficulty.
Beyond that, the campaign is expected to grow with further operations/chapters — scope and
narrative for those are not yet defined.

### Base building

1. Add buildable wall segments and a clear placement workflow.
2. Give recovered bases a small authored defensive perimeter.
3. Add rocks and terrain features that create meaningful approaches and chokepoints.

### Content and presentation

1. Expand First Contact with authored triggers and reusable mission objectives.
2. Playtest the new infantry and structure art pass at normal and minimum zoom.
3. Add maps designed around scouting, expansion and defensible terrain.
4. Run a browser playtest pass at common desktop resolutions.

## Session close procedure

At the end of each development session:

1. update this document with completed work and changed priorities;
2. run tests, typecheck, ESLint, Biome and production build;
3. integrate the validated branch into `main`;
4. push `main` to the canonical `iron-doctrine` repository;
5. leave the local worktree clean on `main`.
