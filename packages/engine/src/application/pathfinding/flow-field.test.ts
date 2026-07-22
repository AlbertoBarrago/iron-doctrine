import { describe, it, expect } from 'vitest';
import { NavGrid } from './nav-grid.js';
import { FlowField } from './flow-field.js';
import * as fp from '../../domain/math/fixed.js';
import * as v2 from '../../domain/math/vec2.js';

describe('FlowField', () => {
  it('assigns zero cost at the goal and rising cost outward', () => {
    const grid = new NavGrid(10, 10, fp.fromInt(1));
    const ff = new FlowField(grid, { cx: 5, cy: 5 });
    expect(ff.cost[grid.index(5, 5)]).toBe(0);
    expect(ff.cost[grid.index(6, 5)]).toBeGreaterThan(0);
    expect(ff.cost[grid.index(0, 0)]).toBeGreaterThan(ff.cost[grid.index(4, 4)]!);
  });

  it('following the field from any open cell reaches the goal', () => {
    const grid = new NavGrid(16, 16, fp.fromInt(1));
    // A wall with a gap.
    for (let y = 0; y < 12; y++) grid.setBlocked(8, y, true);
    const goal = { cx: 14, cy: 2 };
    const ff = new FlowField(grid, goal);

    // Walk from a far cell following the direction field.
    let pos = grid.cellToWorld(1, 1);
    let reached = false;
    for (let step = 0; step < 500; step++) {
      const cell = grid.worldToCell(pos.x, pos.y);
      if (cell.cx === goal.cx && cell.cy === goal.cy) {
        reached = true;
        break;
      }
      const dir = ff.sampleAt(pos.x, pos.y);
      if (dir.x === fp.FP.ZERO && dir.y === fp.FP.ZERO) break;
      pos = v2.add(pos, v2.scale(dir, fp.fromFloat(0.5)));
    }
    expect(reached).toBe(true);
  });

  it('reports unreachable cells behind a full wall', () => {
    const grid = new NavGrid(10, 10, fp.fromInt(1));
    for (let y = 0; y < 10; y++) grid.setBlocked(5, y, true); // full divide
    const ff = new FlowField(grid, { cx: 8, cy: 5 });
    expect(ff.reachable(8, 5)).toBe(true);
    expect(ff.reachable(1, 5)).toBe(false);
  });

  it('is deterministic', () => {
    const build = () => {
      const g = new NavGrid(12, 12, fp.fromInt(1));
      g.stampRect(4, 3, 1, 6, true);
      return new FlowField(g, { cx: 10, cy: 10 });
    };
    expect(Array.from(build().cost)).toEqual(Array.from(build().cost));
  });
});
