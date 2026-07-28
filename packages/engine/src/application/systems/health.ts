/**
 * HealthSystem: reaps entities whose HP has dropped to zero. Runs last in the tick so
 * all damage for the tick has been applied. Destruction is deferred to a collected
 * list to avoid mutating the query set mid-iteration.
 */
import type { System } from '../ecs/system.js';
import type { World } from '../ecs/world.js';
import {
  Building,
  Health,
  Owner,
  Position,
  UnitType,
} from '../../domain/components/index.js';
import type { NavGrid } from '../pathfinding/nav-grid.js';
import { clearBuildingFootprint } from '../../domain/archetypes/buildings.js';
import type { EntityId } from '@iron/shared';
import type { MatchMetrics } from '../match/match-metrics.js';

export function createHealthSystem(grid: NavGrid, metrics?: MatchMetrics): System {
  return {
    name: 'HealthSystem',
    update(world: World): void {
      const dead: EntityId[] = [];
      for (const entity of world.query(Health)) {
        if (world.get(entity, Health)!.hp <= 0) dead.push(entity);
      }
      for (const entity of dead) {
        const building = world.get(entity, Building);
        const unit = world.get(entity, UnitType);
        const owner = world.get(entity, Owner);
        const position = world.get(entity, Position);
        if (owner && (unit || building)) {
          metrics?.recordDestroyed(
            entity,
            owner.player,
            unit ? 'unit' : 'building',
            unit?.kind ?? building?.kind ?? 'unknown',
          );
        }
        if (building && position) {
          clearBuildingFootprint(grid, building.footprint, position);
        }
        world.destroyEntity(entity);
      }
    },
  };
}
