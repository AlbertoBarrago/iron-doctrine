/**
 * Resource node archetype: a static ore deposit harvesters can gather from. Rendered
 * as a neutral (ownerless) selectable-radius entity carrying a finite amount.
 */
import type { World } from '../../application/ecs/world.js';
import { Position, ResourceNode, Selectable } from '../components/index.js';
import * as fp from '../math/fixed.js';
import type { Vec2 } from '../math/vec2.js';
import type { EntityId } from '@iron/shared';

export function spawnResourceNode(world: World, at: Vec2, amount: number): EntityId {
  const e = world.createEntity();
  world.add(e, Position, { x: at.x, y: at.y });
  world.add(e, ResourceNode, { amount });
  world.add(e, Selectable, { radius: fp.fromFloat(0.8) });
  return e;
}
