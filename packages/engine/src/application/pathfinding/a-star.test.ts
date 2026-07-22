import { describe, it, expect } from 'vitest';
import { NavGrid } from './nav-grid.js';
import { findPath } from './a-star.js';
import { smoothPath, hasLineOfSight } from './path-smoother.js';

describe('NavGrid', () => {
  it('maps world<->cell coordinates around cell centres', () => {
    const g = new NavGrid(10, 10);
    const w = g.cellToWorld(3, 4);
    const c = g.worldToCell(w.x, w.y);
    expect(c).toEqual({ cx: 3, cy: 4 });
  });

  it('treats out-of-bounds as blocked', () => {
    const g = new NavGrid(4, 4);
    expect(g.isBlocked(-1, 0)).toBe(true);
    expect(g.isBlocked(4, 0)).toBe(true);
  });

  it('stamps rectangular footprints', () => {
    const g = new NavGrid(8, 8);
    g.stampRect(2, 2, 3, 2, true);
    expect(g.isBlocked(2, 2)).toBe(true);
    expect(g.isBlocked(4, 3)).toBe(true);
    expect(g.isBlocked(5, 3)).toBe(false);
  });
});

describe('A* pathfinding', () => {
  it('finds a straight path on an open grid', () => {
    const g = new NavGrid(10, 10);
    const path = findPath(g, { cx: 0, cy: 0 }, { cx: 5, cy: 0 });
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ cx: 0, cy: 0 });
    expect(path![path!.length - 1]).toEqual({ cx: 5, cy: 0 });
  });

  it('routes around a wall', () => {
    const g = new NavGrid(10, 10);
    // Vertical wall at x=3 from y=0..8, leaving a gap at y=9.
    for (let y = 0; y < 9; y++) g.setBlocked(3, y, true);
    const path = findPath(g, { cx: 0, cy: 0 }, { cx: 6, cy: 0 });
    expect(path).not.toBeNull();
    // Must pass through the gap row.
    expect(path!.some((c) => c.cy === 9)).toBe(true);
    // Never steps on a blocked cell.
    expect(path!.every((c) => !g.isBlocked(c.cx, c.cy))).toBe(true);
  });

  it('returns null when the goal is unreachable', () => {
    const g = new NavGrid(6, 6);
    for (let y = 0; y < 6; y++) g.setBlocked(3, y, true); // full wall
    const path = findPath(g, { cx: 0, cy: 0 }, { cx: 5, cy: 0 });
    expect(path).toBeNull();
  });

  it('is deterministic across repeated runs', () => {
    const build = () => {
      const g = new NavGrid(12, 12);
      g.stampRect(4, 2, 1, 8, true);
      g.stampRect(7, 0, 1, 8, true);
      return g;
    };
    const a = findPath(build(), { cx: 0, cy: 0 }, { cx: 11, cy: 11 });
    const b = findPath(build(), { cx: 0, cy: 0 }, { cx: 11, cy: 11 });
    expect(a).toEqual(b);
  });

  it('does not cut corners diagonally through blocked cells', () => {
    const g = new NavGrid(5, 5);
    g.setBlocked(1, 0, true);
    g.setBlocked(0, 1, true);
    // Moving from (0,0) to (1,1) diagonally is illegal (both neighbours blocked).
    const path = findPath(g, { cx: 0, cy: 0 }, { cx: 1, cy: 1 });
    expect(path).toBeNull();
  });
});

describe('path smoothing', () => {
  it('detects line of sight', () => {
    const g = new NavGrid(10, 10);
    expect(hasLineOfSight(g, { cx: 0, cy: 0 }, { cx: 9, cy: 9 })).toBe(true);
    g.setBlocked(5, 5, true);
    expect(hasLineOfSight(g, { cx: 0, cy: 0 }, { cx: 9, cy: 9 })).toBe(false);
  });

  it('collapses a straight corridor to endpoints', () => {
    const g = new NavGrid(10, 1);
    const path = Array.from({ length: 10 }, (_, i) => ({ cx: i, cy: 0 }));
    const smoothed = smoothPath(g, path);
    expect(smoothed).toEqual([
      { cx: 0, cy: 0 },
      { cx: 9, cy: 0 },
    ]);
  });
});
