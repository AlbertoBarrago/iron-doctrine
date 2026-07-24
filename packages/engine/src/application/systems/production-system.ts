/**
 * ProductionSystem: advances each production building's queue. Units are charged on
 * enqueue (see CommandSystem) and built one at a time; when the front unit's build
 * time elapses it spawns at a free cell beside the building and moves to the rally
 * point if one is set. Deterministic: integer tick progress, ascending entity order.
 */
import type { System } from '../ecs/system.js';
import type { World } from '../ecs/world.js';
import type { NavGrid } from '../pathfinding/nav-grid.js';
import {
  Position,
  Owner,
  Production,
  Movement,
  Building,
  Selectable,
  type ProductionData,
} from '../../domain/components/index.js';
import { spawnUnit, UNIT_STATS } from '../../domain/archetypes/units.js';
import * as fp from '../../domain/math/fixed.js';
import type { Vec2 } from '../../domain/math/vec2.js';
import type { EntityId } from '@iron/shared';

export function createProductionSystem(grid: NavGrid): System {
  return {
    name: 'ProductionSystem',
    update(world: World): void {
      for (const b of world.query(Production, Position, Owner)) {
        const prod = world.get(b, Production)!;
        if (prod.queue.length === 0) continue;

        const unit = prod.queue[0]!;
        const stats = UNIT_STATS[unit];
        if (!stats) {
          prod.queue.shift(); // unknown unit: drop it defensively
          prod.progressTicks = 0;
          continue;
        }

        prod.progressTicks = Math.min(prod.progressTicks + 1, stats.buildTicks);
        if (prod.progressTicks < stats.buildTicks) continue;

        // Complete: spawn beside the building and clear progress for the next item.
        if (!finishUnit(world, grid, b, unit, world.get(b, Owner)!.player, prod)) continue;
        prod.queue.shift();
        prod.progressTicks = 0;
      }
    },
  };
}

function finishUnit(
  world: World,
  grid: NavGrid,
  building: EntityId,
  unit: string,
  player: number,
  prod: ProductionData,
): boolean {
  const pos = world.get(building, Position)!;
  const cell = grid.worldToCell(pos.x, pos.y);
  const footprint = world.get(building, Building)?.footprint ?? 1;
  const radius = UNIT_STATS[unit]?.radius;
  if (radius === undefined) return false;
  const at = findSpawnPoint(world, grid, cell.cx, cell.cy, footprint, fp.fromFloat(radius));
  if (!at) return false;
  const e = spawnUnit(world, unit, player, at);

  if (prod.rally) {
    const move = world.get(e, Movement);
    if (move) move.target = { x: prod.rally.x, y: prod.rally.y };
  }
  return true;
}

function findSpawnPoint(
  world: World,
  grid: NavGrid,
  centerX: number,
  centerY: number,
  footprint: number,
  unitRadius: fp.Fixed,
): Vec2 | null {
  const firstRing = Math.floor(footprint / 2) + 1;
  for (let ring = firstRing; ring <= 16; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const cx = centerX + dx;
        const cy = centerY + dy;
        if (grid.isBlocked(cx, cy) || !hasOpenNeighbour(grid, cx, cy)) continue;
        const candidate = grid.cellToWorld(cx, cy);
        if (isOccupied(world, candidate, unitRadius)) continue;
        return candidate;
      }
    }
  }
  return null;
}

function hasOpenNeighbour(grid: NavGrid, cx: number, cy: number): boolean {
  return (
    !grid.isBlocked(cx - 1, cy) ||
    !grid.isBlocked(cx + 1, cy) ||
    !grid.isBlocked(cx, cy - 1) ||
    !grid.isBlocked(cx, cy + 1)
  );
}

function isOccupied(world: World, candidate: Vec2, unitRadius: fp.Fixed): boolean {
  for (const entity of world.query(Position, Selectable)) {
    const position = world.get(entity, Position)!;
    const selectable = world.get(entity, Selectable)!;
    const dx = fp.sub(candidate.x, position.x);
    const dy = fp.sub(candidate.y, position.y);
    const clearance = fp.add(unitRadius, selectable.radius);
    if (fp.add(fp.mul(dx, dx), fp.mul(dy, dy)) < fp.mul(clearance, clearance)) return true;
  }
  return false;
}
