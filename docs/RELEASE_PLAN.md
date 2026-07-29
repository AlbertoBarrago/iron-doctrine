# Iron Doctrine — Christmas 2026 release plan

Target release: **2026-12-18**  
External deadline: **2026-12-25**

The one-week difference is release contingency, not feature capacity. Work is prioritized by
player-visible completeness and production risk.

## Release definition

The Christmas build is releasable when:

- the campaign and skirmish loops can be completed without placeholder gameplay or blocking bugs;
- every gameplay entity is readable at normal and minimum zoom;
- movement, combat, construction, production, economy, pause, save and navigation behave reliably;
- deterministic simulation, save/load and replay gates remain green;
- supported browser smoke tests and complete-match playtests pass;
- no known critical or high-severity defect remains.

## Milestones

### August — production vertical slice

- Finish authored units, structures, defenses, resources, damage and destruction presentation.
- Complete normal/minimum-zoom and mixed-faction acceptance.
- Close Setup and Map Forge back-navigation gaps.
- Freeze new rendering architecture after the production-art gate.

Exit gate: one complete mission and one skirmish match meet the final visual and interaction bar.

### September — gameplay and balance

- Resolve remaining group movement, choke-point and Harvester-flow failures.
- Tune economy, build times, unit roles and AI pressure through full matches.
- Make blocked, invalid and unavailable orders explicit.
- Lock the Christmas gameplay feature set.

Exit gate: all campaign operations are completable at intended difficulty without debug assistance.

### October — content complete beta

- Finalize maps, mission pacing, onboarding, campaign flow and battle reports.
- Complete editor, profile, save/load and menu navigation acceptance.
- Finish accessibility and input coverage required for release.
- Cut any optional feature that is not content complete by October 31.

Exit gate: feature-complete beta with no placeholder content.

### November — hardening

- Run repeated complete-match playtests and regression passes.
- Profile frame time, memory, worker catch-up and atlas loading on supported hardware.
- Verify save compatibility, deterministic replays and recovery from missing asset families.
- Finish browser compatibility, audio mix and UX polish.

Exit gate: release candidate with only low-risk fixes remaining.

### December — freeze and release

- **December 1:** code and content freeze.
- **December 1–10:** release-candidate regression and balance-only changes.
- **December 11–17:** critical fixes, packaging and final acceptance.
- **December 18:** target release.
- **December 19–25:** contingency for release-blocking defects only.

## Scope policy

### Must ship

- Complete campaign and skirmish loops.
- Reliable deterministic simulation, AI, economy, combat, save/load and pause.
- Final readable art for every gameplay entity.
- Complete menu, Setup and editor navigation.
- Production build, automated gates and supported-browser acceptance.

### Ship only if already stable

- Additional maps or cosmetic variants.
- Extra achievements, ambient events and nonessential presentation polish.
- Balance options beyond the validated difficulty set.

### Cut before schedule risk

- New unit or building archetypes.
- New simulation systems.
- Multiplayer expansion beyond the already approved release scope.
- Rendering or UI architecture rewrites.
- Optional animation states without authoritative gameplay signals.

## Weekly control

Review the release board once per week:

1. count open release blockers and high-severity defects;
2. verify the current milestone exit gate;
3. move uncertain work from `should` to `cut`;
4. keep `main` releasable and merge only fully validated slices.

