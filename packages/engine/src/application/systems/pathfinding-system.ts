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
import {
  FlowMovement,
  Position,
  Movement,
  Path,
  Selectable,
} from '../../domain/components/index.js';
import type { NavGrid } from '../pathfinding/nav-grid.js';
import { findPath } from '../pathfinding/a-star.js';
import { smoothPath } from '../pathfinding/path-smoother.js';
import * as v2 from '../../domain/math/vec2.js';
import type { Vec2 } from '../../domain/math/vec2.js';
import * as fp from '../../domain/math/fixed.js';

export function createPathfindingSystem(grid: NavGrid): System {
  return {
    name: 'PathfindingSystem',
    update(world: World): void {
      for (const e of world.query(Position, Movement)) {
        if (world.has(e, FlowMovement)) continue;
        const move = world.get(e, Movement)!;
        if (move.target === null) {
          if (world.has(e, Path)) world.remove(e, Path);
          continue;
        }

        const existing = world.get(e, Path);
        if (existing && v2.equals(existing.goal, move.target)) continue; // already routed

        const pos = world.get(e, Position)!;
        const clearance = grid.clearanceForRadius(
          world.get(e, Selectable)?.radius ?? fp.div(grid.cellSize, fp.fromInt(2)),
        );
        const rawStart = grid.worldToCell(pos.x, pos.y);
        const start = grid.nearestOpen(rawStart.cx, rawStart.cy, 16, clearance);
        if (!start) {
          move.target = null;
          if (world.has(e, Path)) world.remove(e, Path);
          continue;
        }
        // If the goal cell is blocked (e.g. a building footprint), approach the
        // nearest passable cell instead of failing outright.
        const rawGoal = grid.worldToCell(move.target.x, move.target.y);
        const goalCell = grid.nearestOpen(rawGoal.cx, rawGoal.cy, 16, clearance);
        if (!goalCell) {
          move.target = null;
          if (world.has(e, Path)) world.remove(e, Path);
          continue;
        }
        const remapped = goalCell.cx !== rawGoal.cx || goalCell.cy !== rawGoal.cy;
        const cells = findPath(grid, start, goalCell, clearance);

        if (!cells || cells.length === 0) {
          // Unreachable: drop the order rather than spin forever.
          move.target = null;
          if (world.has(e, Path)) world.remove(e, Path);
          continue;
        }

        const smoothed = smoothPath(grid, cells, clearance);
        // A* includes the occupied start cell. Routing back through its centre can briefly
        // reverse a unit that already passed that point before receiving a fresh order.
        const routedCells = smoothed.length > 1 ? smoothed.slice(1) : smoothed;
        const waypoints: Vec2[] = routedCells.map((c) => grid.cellToWorld(c.cx, c.cy));
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
