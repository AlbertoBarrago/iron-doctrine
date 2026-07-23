/**
 * Path smoothing via line-of-sight string pulling. A grid A* path zig-zags along
 * cell centres; this collapses runs of waypoints wherever a straight line between two
 * cells crosses only passable cells, yielding natural diagonal movement.
 */
import type { NavGrid, Cell } from './nav-grid.js';

/** True if a straight line between two cell centres crosses no blocked cell. */
export function hasLineOfSight(grid: NavGrid, a: Cell, b: Cell): boolean {
  // Integer supercover line walk (Amanatides–Woo style, simplified).
  let x0 = a.cx;
  let y0 = a.cy;
  const x1 = b.cx;
  const y1 = b.cy;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  for (;;) {
    if (grid.isBlocked(x0, y0)) return false;
    if (x0 === x1 && y0 === y1) return true;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Returns a reduced waypoint list preserving start and goal. */
export function smoothPath(grid: NavGrid, path: Cell[]): Cell[] {
  if (path.length <= 2) return path;
  const result: Cell[] = [path[0]!];
  let anchor = 0;
  for (let i = 2; i < path.length; i++) {
    if (!hasLineOfSight(grid, path[anchor]!, path[i]!)) {
      result.push(path[i - 1]!);
      anchor = i - 1;
    }
  }
  result.push(path[path.length - 1]!);
  return result;
}
