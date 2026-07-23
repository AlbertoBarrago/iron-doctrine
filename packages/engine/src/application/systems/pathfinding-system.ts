/**
 * PathfindingSystem: converts movement orders into concrete paths. When an entity has
 * a movement target that its current Path does not already serve, it runs A* on the
 * shared NavGrid, smooths the result, and stores world-space waypoints. Running before
 * MovementSystem means a fresh order is followed the same tick it is issued.
 *
 * A* is deterministic (integer costs, stable tie-breaks) so every peer computes the
 * identical path — no path data needs to cross the wire.
 */
import type { System } from '../ecs/system.js';
import type { World } from '../ecs/world.js';
import { Position, Movement, Path } from '../../domain/components/index.js';
import type { NavGrid } from '../pathfinding/nav-grid.js';
import { findPath } from '../pathfinding/a-star.js';
import { smoothPath } from '../pathfinding/path-smoother.js';
import * as v2 from '../../domain/math/vec2.js';
import type { Vec2 } from '../../domain/math/vec2.js';

export function createPathfindingSystem(grid: NavGrid): System {
  return {
    name: 'PathfindingSystem',
    update(world: World): void {
      for (const e of world.query(Position, Movement)) {
        const move = world.get(e, Movement)!;
        if (move.target === null) {
          if (world.has(e, Path)) world.remove(e, Path);
          continue;
        }

        const existing = world.get(e, Path);
        if (existing && v2.equals(existing.goal, move.target)) continue; // already routed

        const pos = world.get(e, Position)!;
        const start = grid.worldToCell(pos.x, pos.y);
        // If the goal cell is blocked (e.g. a building footprint), approach the
        // nearest passable cell instead of failing outright.
        const rawGoal = grid.worldToCell(move.target.x, move.target.y);
        const goalCell = grid.nearestOpen(rawGoal.cx, rawGoal.cy);
        if (!goalCell) {
          move.target = null;
          if (world.has(e, Path)) world.remove(e, Path);
          continue;
        }
        const remapped = goalCell.cx !== rawGoal.cx || goalCell.cy !== rawGoal.cy;
        const cells = findPath(grid, start, goalCell);

        if (!cells || cells.length === 0) {
          // Unreachable: drop the order rather than spin forever.
          move.target = null;
          if (world.has(e, Path)) world.remove(e, Path);
          continue;
        }

        const smoothed = smoothPath(grid, cells);
        const waypoints: Vec2[] = smoothed.map((c) => grid.cellToWorld(c.cx, c.cy));
        // Final waypoint is the exact requested target unless the goal was remapped to
        // approach a blocked cell (then we stop at the approach cell's centre).
        if (!remapped) {
          waypoints[waypoints.length - 1] = { x: move.target.x, y: move.target.y };
        }

        world.add(e, Path, { waypoints, index: 0, goal: { x: move.target.x, y: move.target.y } });
      }
    },
  };
}
