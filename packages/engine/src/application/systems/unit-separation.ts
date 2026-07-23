/**
 * Deterministic local separation for mobile units.
 *
 * Pathfinding keeps units away from static obstacles and formations spread shared
 * destinations, but neither resolves units that meet while travelling. This pass runs
 * after movement and applies the minimum symmetric correction to overlapping pairs.
 */
import type { System } from '../ecs/system.js';
import type { World } from '../ecs/world.js';
import { Position, Selectable, UnitType } from '../../domain/components/index.js';
import * as fp from '../../domain/math/fixed.js';
import * as v2 from '../../domain/math/vec2.js';
import type { EntityId } from '@iron/shared';

export const UnitSeparationSystem: System = {
  name: 'UnitSeparationSystem',
  update(world: World): void {
    const units = world.query(Position, Selectable, UnitType);

    for (let leftIndex = 0; leftIndex < units.length; leftIndex++) {
      const left = units[leftIndex]!;
      for (let rightIndex = leftIndex + 1; rightIndex < units.length; rightIndex++) {
        const right = units[rightIndex]!;
        separatePair(world, left, right);
      }
    }
  },
};

function separatePair(world: World, left: EntityId, right: EntityId): void {
  const leftPosition = world.get(left, Position)!;
  const rightPosition = world.get(right, Position)!;
  const minimumDistance = fp.add(
    world.get(left, Selectable)!.radius,
    world.get(right, Selectable)!.radius,
  );
  const delta = v2.sub(rightPosition, leftPosition);
  const distanceSquared = v2.lenSq(delta);
  if (distanceSquared >= fp.mul(minimumDistance, minimumDistance)) return;

  const direction =
    distanceSquared === fp.FP.ZERO
      ? { x: left < right ? fp.FP.ONE : fp.neg(fp.FP.ONE), y: fp.FP.ZERO }
      : v2.normalize(delta);
  const distance = distanceSquared === fp.FP.ZERO ? fp.FP.ZERO : v2.len(delta);
  const correction = fp.div(fp.sub(minimumDistance, distance), fp.fromInt(2));
  const offset = v2.scale(direction, correction);

  world.add(left, Position, v2.sub(leftPosition, offset));
  world.add(right, Position, v2.add(rightPosition, offset));
}
