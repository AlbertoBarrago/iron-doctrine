# Iron Doctrine — Project Status

Last updated: 2026-07-29

This document is the operational source of truth for completed work, known issues and
the next development slice. The README remains the public presentation of the game.

## Current milestone

First Contact is a playable vertical slice:

- start with a capable patrol and recover an abandoned command base;
- explore a full-screen battlefield through persistent fog of war;
- harvest ore, construct a base and produce units;
- read harvester load, extraction and deposit state directly on the battlefield;
- read the remaining capacity of selectable, grounded ore fields;
- run multiple harvesters through shared ore and construction-yard approaches without deadlocking;
- dispatch a fast, fragile scout buggy with extended vision ahead of the main force;
- drive tanks through ore fields and over hostile infantry without vehicle deadlocks;
- identify infantry roles and industrial structures through grounded silhouettes, materials and motion;
- distinguish active engineers through a presentation-only tool-check animation;
- fight through a deterministic, chunk-rendered Mediterranean environment on Iron Pass;
- fight a paced deterministic AI with victory and defeat conditions;
- restart a finished match or return cleanly to the main menu;
- launch missions from a classic 1990s-inspired RTS command menu;
- navigate with mouse, keyboard and tactical radar;
- assign and recall nine local control groups, with army composition and selected counts in the HUD;
- pause with `P`, quit to the main menu with `Q` or open the in-game Setup panel.

The validated source of truth is `main`. At this checkpoint the repository passes:

- 303 automated tests;
- TypeScript project typecheck;
- ESLint and Biome diagnostics;
- production builds for client, server, engine and shared packages.

## Decisions in force

- Simulation state remains deterministic and authoritative inside the engine.
- The Construction Yard is the sole ore drop-off; the refinery was removed to keep the economy loop explicit.
- Render snapshots are the only simulation-to-client presentation boundary.
- The battlefield excludes the command sidebar from its camera viewport.
- Hidden map cells are fully black; explored terrain is remembered but attenuated.
- Explored terrain uses a lighter veil than hidden terrain so recently travelled ground remains legible.
- AI production observes unit build times and difficulty-specific army limits.
- AI production uses the same validated facility queues, costs and tech gates as players.
- Completed units wait for a collision-free facility exit instead of spawning into obstacles.
- Unit separation respects navigation bounds and blocked cells; pathfinding recovers displaced units.
- Fresh movement paths skip the occupied start-cell centre, preventing a one-tick facing reversal
  when vehicles receive another order in their current direction.
- Moving tanks can crush hostile infantry; allies and hostile vehicles retain normal separation.
- Resource nodes remain traversable presentation/economy entities and never stamp navigation obstacles.
- Explicit group attacks preserve one target and assign armed units deterministic, multi-ring
  engagement slots; selected unarmed support units stop instead of entering the kill zone.
- Control groups are local presentation state: `Ctrl+1…9` assigns owned units, `1…9` recalls,
  a quick second recall centers the camera, and destroyed units are pruned automatically.
- Mouse controls keep contextual orders on RMB, camera drag on MMB and cursor-anchored zoom.
- Camera zoom-out uses the current battlefield and viewport dimensions as a dynamic floor, so
  normal navigation never exposes the rectangular exterior around a built-in map.
- The procedural 2.5D art direction uses shared military-industrial materials, compact shadows and restrained faction accents.
- The first Military Diorama pass gives units and structures a shared four-step material ramp,
  consistent upper-left edge lighting, deeper foundations and role-specific industrial details.
- Vehicle silhouettes now expose layered armor, running gear, glass reflections and readable
  working surfaces without changing entity footprints or authoritative state.
- Smoke and dust use distinct expanding shapes while impacts retain sharp ballistic streaks;
  all effects remain bounded, pooled and presentation-only.
- The Battlefield Cohesion pass overlays broad seeded ground variation beneath local terrain
  detail, reducing visible tile repetition without rebuilding geometry during camera movement.
- Rock formations, resource fields and war remains now disturb and shadow the surrounding soil,
  while scattered casings use varied placement instead of reading as aligned overlay props.
- Map environment metadata is presentation-only, backwards-compatible and versioned independently
  from authoritative simulation state.
- Static terrain geometry is built once in chunked Pixi containers; camera movement updates its
  transform instead of rebuilding terrain every frame.
- Iron Pass remains the first Mediterranean visual target, but every built-in battlefield now
  carries authored rock formations and an explicit biome seed. At least one formation must be
  discoverable from the opening play area; realism remains subordinate to RTS readability and
  measurable frame-time budgets.
- Infantry gait and recoil remain presentation-only and derive from immutable render snapshots.
- Engineer tool motion remains presentation-only; the scout is an unarmed player reconnaissance unit.
- Building operation and construction state drive ambient animation without entering the simulation.
- Campaign victories prioritize returning to the campaign route; defeats prioritize retrying the mission.
- Procedural unit silhouettes, ballistic combat cues and distinct weapon audio improve battlefield readability.
- Prettier remains the formatter; ESLint and Biome both provide diagnostics.
- Large changes use dedicated branches and small Conventional Commits.

## Next development slice

### Production art gate

New gameplay scope is frozen while Iron Pass becomes the representative production-art vertical
slice. `docs/ART_DIRECTION.md` and `assets-src/concepts/iron-pass-target.png` define the approved
direction and acceptance gate. The current procedural painters remain temporary fallbacks; they
are replaced family by family through an original sprite/atlas pipeline rather than receiving
further isolated cosmetic detail.

The production asset foundation is implemented:

- `assets-src/manifest.json` declares exact frame grids, states and directions;
- `scripts/build-assets.mjs` validates sources and creates a deterministic lossless WebP atlas,
  Pixi spritesheet metadata and compile-time frame identifiers;
- Vite runs the compiler before development and production builds;
- `ProductionAssetLoader` exposes typed textures while procedural painters remain available;
- a non-runtime technical registration mark exercises the pipeline without appearing in game.

The first production vehicle slice is implemented:

- `assets-src/vehicles/tank/tank.blend` is the editable, original Battle Tank source;
- Blender renders one consistent low-poly model into 16 deterministic gameplay facings;
- the asset compiler packs those frames into the typed production atlas;
- the Pixi renderer selects the closest authored facing without rotating or blurring the hull;
- a short crossfade and angular hysteresis keep steering transitions fluid without changing simulation;
- a missing atlas falls back to the existing procedural painter instead of blocking a match.

The first production infantry slice is implemented:

- `assets-src/units/infantry/rifleman.blend` is the editable Rifleman source;
- 16 authored facings share the accepted vehicle camera and runtime direction contract;
- idle, four-pose articulated movement and two-frame weapon recoil are generated from one model;
- the renderer selects authored Rifleman frames while Engineer and Medic retain their procedural
  fallback.

Production-art refinement proceeds family by family in this order:

1. complete Battle Tank damage, destruction and final gameplay-scale acceptance;
2. extend the Rifleman infantry foundation to Engineer and Medic;
3. replace the representative Iron Pass terrain;
4. replace the representative industrial structures.

The current tank export covers idle, a restrained two-frame suspension cycle while moving and a
two-frame barrel recoil triggered by authoritative weapon timing. The suspension isolates the upper
chassis while tracks and road wheels retain stable ground contact, avoiding apparent lateral drift.
All 80 poses are authored from the same source model and selected only at the presentation boundary.
Damage and destruction remain part of the production-art gate. The first runtime playtest accepted
the model and overall visual direction; normal/minimum zoom and performance review remain required
before the tank slice is accepted as final.

Public 1v1 work resumes after this visual gate and the core game loop are accepted as a coherent
game.

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

### Navigation polish

1. Provide an explicit Back action from the Setup panel and Map Forge so both surfaces return to
   their previous screen without forcing a reload or abandoning the current session implicitly.

### Campaign persistence

Commander persistence is implemented:

1. Each local profile has an exact three-character alphanumeric callsign.
2. Campaign completion and unlocks are isolated per profile in versioned browser `localStorage`.
3. The first profile automatically imports legacy global campaign progress; later profiles start clean.
4. The operations header allows profile switching and creation without mixing progression.

### Commander progression

Commander achievements and Battle Reports are implemented:

1. A versioned, profile-scoped achievement registry awards Cartographer, First Strike,
   Vanguard, Gold Rush, Untouchable and Campaign Veteran from authoritative simulation data.
2. Combat damage, losses, eliminations by archetype, ore delivery, explored-map peak and match
   duration survive save/load and feed the final report.
3. The Battle Report includes a concise tactical analysis of tempo, damage economy,
   reconnaissance and attrition, plus newly earned decorations.
4. Collected decorations remain isolated by commander and are visible on the campaign map.
5. Base Foundations uses its tutorial completion as a reportable victory, so its authoritative
   exploration/economy telemetry and earned decorations appear in the Operation Complete dialog
   even though the mission has no conventional `MatchState`.
6. The Operations Map shows decoration provenance for the selected operation. Global commander
   unlocks remain available to Battle Reports, while unplayed operations no longer mirror medals
   earned elsewhere.

### Support units

The first Medic slice is implemented:

1. The barracks trains a low-health, unarmed Medic with dedicated HUD content.
2. A deterministic healing system automatically prioritizes the most injured nearby allied
   infantry; vehicles, structures, enemies and critically wounded units remain outside the loop.
3. Treatment state survives save/load and drives a specific medical-bag, injector and pulse
   animation.

The current Medic scope closes at automatic treatment. Manual treatment priority,
condition-specific actions and related achievements are intentionally outside the active
backlog: they add control and state complexity without enough tactical value for the current
campaign.

### Battlefield life and cover

The battlefield environment and cover slice is implemented:

1. Authored blocked cells render as irregular, layered rock formations while retaining their
   existing authoritative navigation behavior.
2. High-contrast shell casings, bones and aircraft-like wreck fragments are seeded from
   presentation-only environment metadata, scaled for normal gameplay zoom and restricted to
   impassable cells so traversable terrain remains readable.
3. Every built-in battlefield has an explicit biome seed and authored formations, including the
   shared Operation 01/02 and default skirmish map. At least one formation enters the opening
   vision area, while connectivity regressions verify that both spawns remain joined.
4. No map-format migration or mutable prop entities were introduced.
5. Authored blocked cells form an immutable cover mask, persisted independently from dynamic
   navigation blockers. Riflemen, Engineers and Medics take 25% less hitscan and projectile
   damage only when a rock cell lies directly between them and the threat; vehicles and
   buildings receive no reduction.
6. Hovering a rock formation, shell casings, battlefield remains or aircraft wreckage shows
   its name and gameplay meaning. Cosmetic debris remains outside simulation state.

Presentation-only ambient life is now implemented:

- small groups of animals make short, seeded runs across the battlefield;
- rare military flyovers cross the map as restrained silhouettes and ground shadows;
- both schedules derive from map environment metadata and simulation time, pause with the match,
  render behind units and below fog, and never enter collision, input, save or replay state.

The latest environment readability pass scatters shell casings and bones across traversable ground
at low deterministic density, excluding resource and spawn cells. Large wrecks and obstacle-like
silhouettes remain reserved for blocked terrain so collision stays immediately readable.

### Cosmetic easter eggs

The first commander-profile easter egg is implemented:

1. Each commander records completed matches independently and earns one chicken event every
   seven completed matches.
2. The pending event is consumed when the next battle starts, so restarts and React remounts
   cannot replay the same earned event.
3. The chicken runs erratically near the opening area and ends in an exaggerated explosion.
4. The entire event remains presentation-only: it has no damage, collision, commands, economy
   effects, save-state coupling or replay divergence.

Further easter-egg ideas can extend the same profile-scoped presentation contract.

### Unit radio feedback

Command acknowledgements are implemented as presentation-only feedback:

1. Move, attack, gather and stop orders select concise Italian responses, including
   role-specific lines for infantry, Engineers, Medics, Scouts, Harvesters and Tanks.
2. Command feedback currently uses readable military subtitles only. Browser-generated speech is
   disabled because it sounds excessively mechanical; voice playback will return with original
   recorded performances.
3. A short rate limit prevents multi-unit orders and rapid clicks from becoming noisy.
4. Radio feedback never enters simulation, save or replay state.

Individual morale and condition states are intentionally deferred. Their behavioral, UI and
Medic interactions would add disproportionate complexity to the current tactical loop.

### Test organization

All test files live in local `__tests__` directories beside their owning modules.
Cross-system engine harnesses remain grouped under `application/__tests__`; the move changed
only file locations and relative imports. The current full baseline is 54 test files and
294 passing tests.

### Campaign production

All five operations of the First Contact campaign arc are implemented:

- The browser Worker boundary now forwards every scenario configuration into the authoritative
  simulation. A client-side regression exercises the actual initialization adapter and proves
  that Iron Pass reaches its ambush, Siege Line dispatches its waves and Black Dawn enters its
  last stand. Previously these three optional configurations were sent by the renderer but
  silently omitted by the Worker protocol and initialization path.

- Operation 01 — Base Foundations and Operation 02 — First Contact: playtested, validated.
- Operation 03 — Iron Pass: browser-playtested again on 2026-07-28 and confirmed balanced,
  free of progression or movement blockers and enjoyable through a complete run. A dedicated
  runtime mission (`iron_pass`) uses an authored chokepoint map and a scripted armored ambush
  triggered when the player crosses the pass. A restrained procedural ambient score now supports
  exploration and base-building without requiring licensed assets.
- Operation 04 — Siege Line: browser-playtested and completed again on 2026-07-28 without
  blockers. General playability is good. An early aggressive push previously ended the operation
  before its assault waves; match completion is now gated until the hold phase finishes, without
  making the hostile command invulnerable. This correction still needs browser verification. A dedicated runtime
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
8. Browser-playtest the retuned procedural score: its higher-register minor/major progression,
   six-second phrases and restrained pulse respond to feedback that the first pass felt too
   dark and slow. Independent mute/volume controls remain unchanged; adaptive combat intensity
   is still a later milestone.

## Session close procedure

At the end of each development session:

1. update this document with completed work and changed priorities;
2. run tests, typecheck, ESLint, Biome and production build;
3. integrate the validated branch into `main`;
4. push `main` to the canonical `iron-doctrine` repository;
5. leave the local worktree clean on `main`.
