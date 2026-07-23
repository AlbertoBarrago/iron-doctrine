# Iron Doctrine — Project Status

Last updated: 2026-07-23

This document is the operational source of truth for completed work, known issues and
the next development slice. The README remains the public presentation of the game.

## Current milestone

First Contact is a playable vertical slice:

- start with a capable patrol and recover an abandoned command base;
- explore a full-screen battlefield through persistent fog of war;
- harvest ore, construct a base and produce units;
- fight a paced deterministic AI with victory and defeat conditions;
- restart a finished match or return cleanly to the main menu;
- navigate with mouse, keyboard and tactical radar;
- pause with `P` or open the in-game Setup panel.

The validated source of truth is `main`. At this checkpoint the repository passes:

- 152 automated tests;
- TypeScript project typecheck;
- ESLint and Biome diagnostics;
- production builds for client, server, engine and shared packages.

## Decisions in force

- Simulation state remains deterministic and authoritative inside the engine.
- Render snapshots are the only simulation-to-client presentation boundary.
- The battlefield excludes the command sidebar from its camera viewport.
- Hidden map cells are fully black; explored terrain is remembered but attenuated.
- AI production observes unit build times and difficulty-specific army limits.
- Prettier remains the formatter; ESLint and Biome both provide diagnostics.
- Large changes use dedicated branches and small Conventional Commits.

## Next development slice

### Gameplay correctness

1. Reproduce the reported mixed-selection order issue in the browser.
2. Decide how unarmed selected units should react when an enemy is right-clicked.
3. Playtest unit separation around structures, chokepoints and resource drop-offs.
4. Move AI production from direct spawning into the same facility queues used by players.

### Combat and economy feedback

1. Replace rifle tracers with thin ballistic projectiles and an appropriate shot sound.
2. Add visible gathering and depositing animations.
3. Show invalid, blocked and unavailable orders clearly.
4. Tune ore income, construction time and hostile pressure through complete matches.

### Base building

1. Add buildable wall segments and a clear placement workflow.
2. Give recovered bases a small authored defensive perimeter.
3. Add rocks and terrain features that create meaningful approaches and chokepoints.

### Content and presentation

1. Expand First Contact with authored triggers and reusable mission objectives.
2. Improve unit silhouettes, movement animation and impact feedback.
3. Add maps designed around scouting, expansion and defensible terrain.
4. Run a browser playtest pass at common desktop resolutions.

## Session close procedure

At the end of each development session:

1. update this document with completed work and changed priorities;
2. run tests, typecheck, ESLint, Biome and production build;
3. integrate the validated branch into `main`;
4. push `main` to the canonical `iron-doctrine` repository;
5. leave the local worktree clean on `main`.
