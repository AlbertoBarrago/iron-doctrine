import type { EntityId } from '@iron/shared';
import type { System } from '../ecs/system.js';
import type { World } from '../ecs/world.js';
import { Healing, Health, Owner, Position, UnitType } from '../../domain/components/index.js';
import * as fp from '../../domain/math/fixed.js';

export const HealingSystem: System = {
  name: 'HealingSystem',
  update(world: World): void {
    for (const medic of world.query(Healing, Position, Owner)) {
      const healing = world.get(medic, Healing)!;
      if (healing.cooldownLeft > 0) healing.cooldownLeft--;

      const target = selectPatient(world, medic, healing.range);
      healing.target = target ?? -1;
      if (target === undefined || healing.cooldownLeft > 0) continue;

      const health = world.get(target, Health)!;
      health.hp = Math.min(health.max, health.hp + healing.amount);
      healing.cooldownLeft = healing.cooldownTicks;
    }
  },
};

function selectPatient(world: World, medic: EntityId, range: fp.Fixed): EntityId | undefined {
  const medicPosition = world.get(medic, Position)!;
  const medicOwner = world.get(medic, Owner)!.player;
  const rangeSquared = fp.mul(range, range);
  let best: EntityId | undefined;
  let bestHp = 0;
  let bestMax = 1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of world.query(Health, Owner, Position, UnitType)) {
    if (candidate === medic) continue;
    const owner = world.get(candidate, Owner)!;
    const type = world.get(candidate, UnitType)!.kind;
    const infantry = type === 'rifleman' || type === 'engineer' || type === 'medic';
    if (owner.player !== medicOwner || !infantry) continue;

    const health = world.get(candidate, Health)!;
    if (health.hp <= 0 || health.hp >= health.max) continue;
    const position = world.get(candidate, Position)!;
    const dx = fp.sub(position.x, medicPosition.x);
    const dy = fp.sub(position.y, medicPosition.y);
    const distance = fp.add(fp.mul(dx, dx), fp.mul(dy, dy));
    if (distance > rangeSquared) continue;

    const moreInjured = best === undefined || health.hp * bestMax < bestHp * health.max;
    const sameHealthRatio =
      best !== undefined && health.hp * bestMax === bestHp * health.max;
    if (
      moreInjured ||
      (sameHealthRatio &&
        (distance < bestDistance ||
          (distance === bestDistance && best !== undefined && candidate < best)))
    ) {
      best = candidate;
      bestHp = health.hp;
      bestMax = health.max;
      bestDistance = distance;
    }
  }
  return best;
}
