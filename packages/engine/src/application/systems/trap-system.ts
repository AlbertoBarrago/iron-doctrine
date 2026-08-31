/**
 * Trap-related systems for the Silent Extraction operative:
 *
 * - TrapSystem: while a `Trap` is armed, any Health-bearing entity that steps inside
 *   `triggerRadius` sets it off — everyone within `radius` (including the trap's own
 *   position) takes `damage`, and the trap disarms itself so it cannot re-trigger.
 * - DisarmingSystem: advances an in-progress `disarmTrap` action (see CommandSystem).
 *   The operative must stay within the trap's trigger radius and hold still; any
 *   movement order cancels the Disarming component (handled in CommandSystem). Once
 *   `ticksLeft` reaches zero the trap is neutralized (`armed = false`).
 */
import type { System } from '../ecs/system.js';
import type { World } from '../ecs/world.js';
import { Disarming, Health, Movement, Position, Trap } from '../../domain/components/index.js';
import * as fp from '../../domain/math/fixed.js';
import * as v2 from '../../domain/math/vec2.js';
import { asEntityId } from '@iron/shared';

export const TrapSystem: System = {
  name: 'TrapSystem',
  update(world: World): void {
    for (const trapEntity of world.query(Trap, Position)) {
      const trap = world.get(trapEntity, Trap)!;
      if (!trap.armed) continue;
      const trapPos = world.get(trapEntity, Position)!;
      const triggerSq = fp.mul(trap.triggerRadius, trap.triggerRadius);

      let triggered = false;
      for (const other of world.query(Position, Health)) {
        if (other === trapEntity) continue;
        const health = world.get(other, Health)!;
        if (health.hp <= 0) continue;
        // An entity actively disarming THIS trap is handling it carefully rather than
        // blundering into the tripwire — it can be within the trigger radius without
        // setting it off, which is what makes disarming possible at all.
        const disarming = world.get(other, Disarming);
        if (disarming && disarming.target === (trapEntity as number)) continue;
        if (v2.distSq(trapPos, world.get(other, Position)!) <= triggerSq) {
          triggered = true;
          break;
        }
      }
      if (!triggered) continue;

      const radiusSq = fp.mul(trap.radius, trap.radius);
      for (const other of world.query(Position, Health)) {
        const health = world.get(other, Health)!;
        if (health.hp <= 0) continue;
        if (v2.distSq(trapPos, world.get(other, Position)!) > radiusSq) continue;
        health.hp -= Math.min(health.hp, trap.damage);
      }
      trap.armed = false; // one-shot: consumed on trigger
    }
  },
};

export const DisarmingSystem: System = {
  name: 'DisarmingSystem',
  update(world: World): void {
    for (const entity of world.query(Disarming, Position)) {
      const disarming = world.get(entity, Disarming)!;
      const targetTrap = asEntityId(disarming.target);
      const trap = world.isAlive(targetTrap) ? world.get(targetTrap, Trap) : undefined;
      if (!trap || !trap.armed) {
        world.remove(entity, Disarming);
        continue;
      }
      // A fresh move order cancels this in the CommandSystem; a stray Movement target
      // set by some other system would still invalidate the "stationary" requirement.
      const move = world.get(entity, Movement);
      if (move?.target) {
        world.remove(entity, Disarming);
        continue;
      }
      const trapPos = world.get(targetTrap, Position);
      const pos = world.get(entity, Position)!;
      if (!trapPos || v2.distSq(pos, trapPos) > fp.mul(trap.triggerRadius, trap.triggerRadius)) {
        world.remove(entity, Disarming);
        continue;
      }
      if (disarming.ticksLeft > 0) {
        disarming.ticksLeft--;
        continue;
      }
      trap.armed = false;
      world.remove(entity, Disarming);
    }
  },
};
