import { describe, it, expect } from 'vitest';
import { Simulation } from './simulation.js';
import { NavGrid } from './pathfinding/nav-grid.js';
import { FogOfWar, HIDDEN, EXPLORED, VISIBLE } from './fog/fog-of-war.js';
import { Position } from '../domain/components/index.js';
import * as fp from '../domain/math/fixed.js';

const at = (x: number, y: number) => ({ x: fp.fromInt(x), y: fp.fromInt(y) });

describe('FogOfWar grid', () => {
  it('reveals a circle and demotes to explored next frame', () => {
    const grid = new NavGrid(20, 20, fp.fromInt(1));
    const fog = new FogOfWar(grid);
    const centre = grid.worldToCell(fp.fromInt(0), fp.fromInt(0));

    fog.reveal(0, fp.fromInt(0), fp.fromInt(0), fp.fromInt(3));
    expect(fog.state(0, centre.cx, centre.cy)).toBe(VISIBLE);
    // Far corner stays hidden.
    expect(fog.state(0, 0, 0)).toBe(HIDDEN);

    fog.beginFrame(0);
    expect(fog.state(0, centre.cx, centre.cy)).toBe(EXPLORED); // remembered, not visible
  });

  it('keeps separate grids per team', () => {
    const grid = new NavGrid(20, 20, fp.fromInt(1));
    const fog = new FogOfWar(grid);
    fog.reveal(0, fp.fromInt(0), fp.fromInt(0), fp.fromInt(2));
    const c = grid.worldToCell(fp.fromInt(0), fp.fromInt(0));
    expect(fog.isVisible(0, c.cx, c.cy)).toBe(true);
    expect(fog.isVisible(1, c.cx, c.cy)).toBe(false);
  });
});

describe('FogOfWarSystem in the simulation', () => {
  it('reveals area around a unit and remembers it after the unit leaves', () => {
    const grid = new NavGrid(64, 64, fp.fromInt(1));
    const sim = new Simulation({ seed: 1, grid });
    sim.enqueue({ type: 'spawnUnit', unit: 'rifleman', player: 0, at: at(0, 0) });
    sim.step();
    const e = sim.world.query(Position)[0]!;

    const here = grid.worldToCell(fp.fromInt(0), fp.fromInt(0));
    expect(sim.fog.isVisible(0, here.cx, here.cy)).toBe(true);

    // Move far away; the origin should become explored (remembered), not hidden.
    sim.enqueue({ type: 'move', entities: [e], target: at(25, 0) });
    for (let i = 0; i < 400; i++) sim.step();

    expect(sim.fog.state(0, here.cx, here.cy)).toBe(EXPLORED);
    const there = grid.worldToCell(fp.fromInt(25), fp.fromInt(0));
    expect(sim.fog.isVisible(0, there.cx, there.cy)).toBe(true);
  });

  it("does not reveal the enemy team's fog", () => {
    const grid = new NavGrid(64, 64, fp.fromInt(1));
    const sim = new Simulation({ seed: 1, grid });
    sim.enqueue({ type: 'spawnUnit', unit: 'rifleman', player: 0, at: at(0, 0) });
    sim.step();
    const c = grid.worldToCell(fp.fromInt(0), fp.fromInt(0));
    expect(sim.fog.isVisible(0, c.cx, c.cy)).toBe(true);
    expect(sim.fog.isVisible(1, c.cx, c.cy)).toBe(false);
  });

  it('shares vision between allied players on the same team', () => {
    const grid = new NavGrid(64, 64, fp.fromInt(1));
    // Players 0 and 1 both map to team 0.
    const sim = new Simulation({ seed: 1, grid, teamOf: () => 0 });
    sim.enqueue({ type: 'spawnUnit', unit: 'rifleman', player: 1, at: at(0, 0) });
    sim.step();
    const c = grid.worldToCell(fp.fromInt(0), fp.fromInt(0));
    // Team 0 sees it even though the unit belongs to player 1.
    expect(sim.fog.isVisible(0, c.cx, c.cy)).toBe(true);
  });

  it('fog inclusion in snapshot is deterministic', () => {
    const build = () => {
      const grid = new NavGrid(48, 48, fp.fromInt(1));
      const s = new Simulation({ seed: 3, grid });
      s.enqueue({ type: 'spawnUnit', unit: 'tank', player: 0, at: at(-5, -5) });
      s.enqueue({ type: 'spawnUnit', unit: 'rifleman', player: 1, at: at(5, 5) });
      return s;
    };
    const a = build();
    const b = build();
    for (let i = 0; i < 100; i++) {
      a.step();
      b.step();
    }
    expect(Array.from(a.snapshot().fog!.cells)).toEqual(Array.from(b.snapshot().fog!.cells));
  });
});
