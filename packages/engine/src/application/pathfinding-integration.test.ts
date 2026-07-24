import { describe, it, expect } from 'vitest';
import { Simulation } from './simulation.js';
import { NavGrid } from './pathfinding/nav-grid.js';
import { FlowMovement, Position, Path } from '../domain/components/index.js';
import * as fp from '../domain/math/fixed.js';
import type { EntityId } from '@iron/shared';

const at = (x: number, y: number) => ({ x: fp.fromInt(x), y: fp.fromInt(y) });

function makeSim(): Simulation {
  // 32x32 grid centred on origin, one unit per cell.
  const grid = new NavGrid(32, 32, fp.fromInt(1));
  // Vertical wall at world x≈2 (cell 18), leaving a gap near the top.
  for (let cy = 10; cy < 32; cy++) grid.setBlocked(18, cy, true);
  return new Simulation({ seed: 1, grid });
}

function spawn(sim: Simulation, x: number, y: number): EntityId {
  sim.enqueue({ type: 'spawnUnit', unit: 'rifleman', player: 0, at: at(x, y) });
  sim.step();
  const ids = sim.world.query(Position);
  return ids[ids.length - 1]!;
}

describe('Pathfinding integration', () => {
  it('routes a unit around a wall and eventually arrives', () => {
    const sim = makeSim();
    const e = spawn(sim, -6, 8);
    sim.enqueue({ type: 'move', entities: [e], target: at(8, 8) });

    // Path is resolved on the next step (PathfindingSystem runs before Movement).
    sim.step();
    const path = sim.world.get(e, Path);
    expect(path).toBeTruthy();
    expect(path!.waypoints.length).toBeGreaterThan(1);

    // Simulate long enough to traverse the detour.
    for (let i = 0; i < 2000; i++) {
      sim.step();
      if (sim.world.get(e, Path) === undefined) break;
    }

    const pos = sim.world.get(e, Position)!;
    expect(fp.toFloat(pos.x)).toBeCloseTo(8, 1);
    expect(fp.toFloat(pos.y)).toBeCloseTo(8, 1);
  });

  it('recovers a unit whose position is just outside the navigation grid', () => {
    const sim = new Simulation({
      seed: 1,
      grid: new NavGrid(8, 8, fp.fromInt(1)),
    });
    const entity = spawn(sim, -5, 0);
    sim.enqueue({ type: 'move', entities: [entity], target: at(0, 0) });

    for (let i = 0; i < 200; i++) sim.step();

    const position = sim.world.get(entity, Position)!;
    const cell = sim.grid.worldToCell(position.x, position.y);
    expect(sim.grid.inBounds(cell.cx, cell.cy)).toBe(true);
    expect(fp.toFloat(position.x)).toBeCloseTo(0, 1);
    expect(fp.toFloat(position.y)).toBeCloseTo(0, 1);
  });

  it('assigns distinct reachable slots when a group moves at the right edge', () => {
    const sim = new Simulation({
      seed: 1,
      grid: new NavGrid(16, 16, fp.fromInt(1)),
    });
    const first = spawn(sim, 6, 0);
    const second = spawn(sim, 6, 1);
    sim.enqueue({ type: 'move', entities: [first, second], target: at(20, 0) });
    sim.step();

    const slots = [first, second].map((entity) => sim.world.get(entity, FlowMovement)!.finalTarget);
    const cells = slots.map((slot) => sim.grid.worldToCell(slot.x, slot.y));
    expect(new Set(cells.map(({ cx, cy }) => `${cx}:${cy}`)).size).toBe(2);
    expect(cells.every(({ cx, cy }) => sim.grid.inBounds(cx, cy))).toBe(true);

    for (let i = 0; i < 200; i++) sim.step();
    expect(
      [first, second].every((entity) => {
        const position = sim.world.get(entity, Position)!;
        const cell = sim.grid.worldToCell(position.x, position.y);
        return sim.grid.inBounds(cell.cx, cell.cy);
      }),
    ).toBe(true);
  });

  it('stays deterministic with obstacles (identical hashes across runs)', () => {
    const a = makeSim();
    const b = makeSim();
    for (const sim of [a, b]) {
      sim.enqueue({ type: 'spawnUnit', unit: 'tank', player: 0, at: at(-6, 6) });
      sim.step();
      const id = sim.world.query(Position)[0]!;
      sim.enqueue({ type: 'move', entities: [id], target: at(8, 9) });
    }
    for (let i = 0; i < 500; i++) {
      a.step();
      b.step();
      expect(a.hash()).toBe(b.hash());
    }
  });
});
