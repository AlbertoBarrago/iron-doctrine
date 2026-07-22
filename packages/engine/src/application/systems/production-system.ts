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
  type ProductionData,
} from '../../domain/components/index.js';
import { spawnUnit, UNIT_STATS } from '../../domain/archetypes/units.js';
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

        prod.progressTicks++;
        if (prod.progressTicks < stats.buildTicks) continue;

        // Complete: spawn beside the building and clear progress for the next item.
        finishUnit(world, grid, b, unit, world.get(b, Owner)!.player, prod);
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
): void {
  const pos = world.get(building, Position)!;
  const cell = grid.worldToCell(pos.x, pos.y);
  // Spawn on a free cell just outside the footprint.
  const open = grid.nearestOpen(cell.cx + 2, cell.cy + 2) ?? { cx: cell.cx + 2, cy: cell.cy + 2 };
  const at = grid.cellToWorld(open.cx, open.cy);
  const e = spawnUnit(world, unit, player, at);

  if (prod.rally) {
    const move = world.get(e, Movement);
    if (move) move.target = { x: prod.rally.x, y: prod.rally.y };
  }
}
