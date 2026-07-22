/**
 * HealthSystem: reaps entities whose HP has dropped to zero. Runs last in the tick so
 * all damage for the tick has been applied. Destruction is deferred to a collected
 * list to avoid mutating the query set mid-iteration.
 */
import type { System } from '../ecs/system.js';
import type { World } from '../ecs/world.js';
import { Health } from '../../domain/components/index.js';
import type { EntityId } from '@iron/shared';

export const HealthSystem: System = {
  name: 'HealthSystem',
  update(world: World): void {
    const dead: EntityId[] = [];
    for (const e of world.query(Health)) {
      if (world.get(e, Health)!.hp <= 0) dead.push(e);
    }
    for (const e of dead) world.destroyEntity(e);
  },
};
