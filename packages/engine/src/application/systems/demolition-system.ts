/**
 * DemolitionSystem: counts down planted explosive charges (see `PlantedCharge`,
 * currently used by the Silent Extraction operative's C4 plant action). On fuse
 * expiry it zeroes the carrying entity's HP so the existing HealthSystem reaps it
 * and clears its NavGrid footprint through the normal destruction path — reusing
 * that pipeline instead of duplicating footprint-clearing logic here.
 */
import type { System } from '../ecs/system.js';
import type { World } from '../ecs/world.js';
import { Health, PlantedCharge } from '../../domain/components/index.js';

export const DemolitionSystem: System = {
  name: 'DemolitionSystem',
  update(world: World): void {
    for (const entity of world.query(PlantedCharge)) {
      const charge = world.get(entity, PlantedCharge)!;
      if (charge.fuseTicksLeft > 0) {
        charge.fuseTicksLeft--;
        continue;
      }
      const health = world.get(entity, Health);
      if (health) health.hp = 0;
    }
  },
};
