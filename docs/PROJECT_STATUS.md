# Iron Doctrine — Project Status

Last updated: 2026-07-28

This document is the operational source of truth for completed work, known issues and
the next development slice. The README remains the public presentation of the game.

## Current milestone

First Contact is a playable vertical slice:

- start with a capable patrol and recover an abandoned command base;
- explore a full-screen battlefield through persistent fog of war;
- harvest ore, construct a base and produce units;
- read harvester load, extraction and deposit state directly on the battlefield;
- read the remaining capacity of selectable, grounded ore fields;
- run multiple harvesters through shared ore and refinery approaches without deadlocking;
- dispatch a fast, fragile scout buggy with extended vision ahead of the main force;
- drive tanks through ore fields and over hostile infantry without vehicle deadlocks;
- identify infantry roles and industrial structures through grounded silhouettes, materials and motion;
- distinguish active engineers through a presentation-only tool-check animation;
- fight through a deterministic, chunk-rendered Mediterranean environment on Iron Pass;
- fight a paced deterministic AI with victory and defeat conditions;
- restart a finished match or return cleanly to the main menu;
- launch missions from a classic 1990s-inspired RTS command menu;
- navigate with mouse, keyboard and tactical radar;
- pause with `P`, quit to the main menu with `Q` or open the in-game Setup panel.

The validated source of truth is `main`. At this checkpoint the repository passes:

- 230 automated tests;
- TypeScript project typecheck;
- ESLint and Biome diagnostics;
- production builds for client, server, engine and shared packages.

## Decisions in force

- Simulation state remains deterministic and authoritative inside the engine.
- Render snapshots are the only simulation-to-client presentation boundary.
- The battlefield excludes the command sidebar from its camera viewport.
- Hidden map cells are fully black; explored terrain is remembered but attenuated.
- Explored terrain uses a lighter veil than hidden terrain so recently travelled ground remains legible.
- AI production observes unit build times and difficulty-specific army limits.
- AI production uses the same validated facility queues, costs and tech gates as players.
- Completed units wait for a collision-free facility exit instead of spawning into obstacles.
- Unit separation respects navigation bounds and blocked cells; pathfinding recovers displaced units.
- Moving tanks can crush hostile infantry; allies and hostile vehicles retain normal separation.
- Resource nodes remain traversable presentation/economy entities and never stamp navigation obstacles.
- Explicit group attacks preserve one target and assign armed units deterministic, multi-ring
  engagement slots; selected unarmed support units stop instead of entering the kill zone.
- Mouse controls keep contextual orders on RMB, camera drag on MMB and cursor-anchored zoom.
- The procedural 2.5D art direction uses shared military-industrial materials, compact shadows and restrained faction accents.
- Map environment metadata is presentation-only, backwards-compatible and versioned independently
  from authoritative simulation state.
- Static terrain geometry is built once in chunked Pixi containers; camera movement updates its
  transform instead of rebuilding terrain every frame.
- Iron Pass is the first Mediterranean visual slice; realism remains subordinate to RTS
  readability and measurable frame-time budgets.
- Infantry gait and recoil remain presentation-only and derive from immutable render snapshots.
- Engineer tool motion remains presentation-only; the scout is an unarmed player reconnaissance unit.
- Building operation and construction state drive ambient animation without entering the simulation.
- Campaign victories prioritize returning to the campaign route; defeats prioritize retrying the mission.
- Procedural unit silhouettes, ballistic combat cues and distinct weapon audio improve battlefield readability.
- Prettier remains the formatter; ESLint and Biome both provide diagnostics.
- Large changes use dedicated branches and small Conventional Commits.

## Next development slice

### Gameplay correctness

Grouped explicit attack orders now assign up to 16 distinct positions per engagement ring,
continue onto inner rings for larger forces and preserve the selected target. Mixed selections
send only armed units into combat while unarmed support stops. Automated regression covers a
24-unit group; browser playtesting remains the final visual acceptance step.

1. Harvesters got a fluidity pass: their collision radius shrank from 1.2 to 1 (matching the
   tank), and each harvester now aims at a point offset around the shared node/drop-off
   instead of the exact centre, so a group spreads out instead of piling onto one spot.
   Root cause found in the process: unit separation and straight-line movement can reach a
   genuine deadlock when two units' paths stay nearly parallel and converge on the same
   point — smaller radii make this easier to trigger, not harder, until a floor is
   reached (radius 1 is the verified-safe floor for the existing regression scenario).
   This is a known limitation of the current push-apart separation model, not fully solved
   here; the SDD's planned RVO-lite/steering pass (§12) is the eventual real fix. Still
   pending: an in-browser playtest of harvester flow around chokepoints on the new
   campaign maps (Iron Pass, Siege Line, Black Dawn corridors).

### Combat and economy feedback

1. Show invalid, blocked and unavailable orders clearly.
2. Tune ore income, construction time and hostile pressure through complete matches.

### Campaign persistence

1. Add a local commander profile identified by an exact three-letter callsign.
2. Scope campaign completion and unlocks to that profile in versioned browser `localStorage`.
3. Migrate the current global campaign progress without losing completed missions.

### Commander progression

1. Add a versioned, profile-scoped achievement registry driven by authoritative match metrics.
2. First trophy set: Cartographer, First Strike, Vanguard, Gold Rush, Untouchable and
   Campaign Veteran.
3. Surface unlock notifications in-match and collected decorations in the Battle Report.

### Support units

1. Add an unarmed Medic trained at the barracks.
2. Heal allied infantry only through a dedicated deterministic healing system; vehicles and
   structures remain outside the medical loop.
3. Add treatment animation, explicit/manual healing priority and the Field Medic and Leave
   No One Behind achievements.
4. Explore fast field-treatment actions with limited, readable choices: trauma kit for health,
   stimulant for temporary combat readiness and sedative for fear/panic recovery.

### Battlefield life and cover

1. Add authored rock formations as navigation blockers and approach-shaping terrain; introduce
   combat cover bonuses only after the placement and pathing rules are proven readable.
2. Scatter deterministic war remains and environmental props such as wrecked aircraft, skulls
   and abandoned equipment without polluting authoritative simulation state.
3. Add presentation-only ambient life and flyovers — small animals crossing or fleeing the
   battlefield and distant military aircraft — with restrained frequency and no unit collision.
4. Keep interactive/tactical props in map data while purely cosmetic decoration remains seeded
   by environment metadata.

### Infantry condition and morale

1. Model a small deterministic condition set for individual infantry: steady, shaken, panicked
   and sick/injured.
2. Derive transitions from explicit combat pressure, damage and isolation rather than
   uncontrolled per-frame randomness.
3. Make each state immediately readable through posture, movement, status text and concise
   effects; humorous battlefield copy must not obscure the actual mechanic.
4. Let Medics restore health and stabilize recoverable fear/sickness states through quick,
   explicit treatment actions; no resurrection in the first version.

### Test organization

1. Move colocated unit and integration tests into local `__tests__` directories by module.
2. Preserve cross-package determinism and end-to-end harnesses in a dedicated root test area.
3. Perform the move mechanically on a separate branch without changing behavior.

### Campaign production

All five operations of the First Contact campaign arc are implemented:

- Operation 01 — Base Foundations and Operation 02 — First Contact: playtested, validated.
- Operation 03 — Iron Pass: browser-playtested again on 2026-07-28 and confirmed balanced,
  free of progression or movement blockers and enjoyable through a complete run. A dedicated
  runtime mission (`iron_pass`) uses an authored chokepoint map and a scripted armored ambush
  triggered when the player crosses the pass. The remaining presentation gap is ambient music.
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
2. Browser-playtest the Mediterranean Iron Pass slice at normal and minimum zoom.
3. Profile frame time and GPU memory before adding textured atlases or post-processing.
4. Decide whether authored roads and terrain decoration belong in map format v2.
5. Add maps designed around scouting, expansion and defensible terrain.
6. Run a browser playtest pass at common desktop resolutions.
7. Browser-playtest explored fog readability, scout recognition and engineer idle motion together.
8. Add a restrained ambient soundtrack for exploration and base-building, with a later adaptive
   transition into combat intensity; music must remain independently mutable and volume-controlled.

## Session close procedure

At the end of each development session:

1. update this document with completed work and changed priorities;
2. run tests, typecheck, ESLint, Biome and production build;
3. integrate the validated branch into `main`;
4. push `main` to the canonical `iron-doctrine` repository;
5. leave the local worktree clean on `main`.
