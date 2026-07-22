/** Advances placed buildings and activates their operational components on completion. */
import type { System } from '../ecs/system.js';
import type { World } from '../ecs/world.js';
import { Building, Construction, Health } from '../../domain/components/index.js';
import { activateBuilding, BUILDING_STATS } from '../../domain/archetypes/buildings.js';

export const ConstructionSystem: System = {
  name: 'ConstructionSystem',
  update(world: World): void {
    for (const entity of world.query(Construction, Building, Health)) {
      const construction = world.get(entity, Construction)!;
      const building = world.get(entity, Building)!;
      const health = world.get(entity, Health)!;
      const stats = BUILDING_STATS[building.kind];
      if (!stats) continue;

      construction.progressTicks++;
      const hpPerTick = Math.max(1, Math.ceil(stats.hp / construction.buildTicks));
      health.hp = Math.min(health.max, health.hp + hpPerTick);
      if (construction.progressTicks < construction.buildTicks) continue;

      health.hp = health.max;
      world.remove(entity, Construction);
      activateBuilding(world, entity, stats);
    }
  },
};
