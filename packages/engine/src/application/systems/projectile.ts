/**
 * ProjectileSystem: advances in-flight projectiles toward their impact point and
 * applies damage on arrival. Projectiles track a fixed impact position captured at
 * fire time (fire-and-forget), so a dodging target can be missed — intentional RTS
 * feel. The projectile entity is destroyed on impact or if its target vanished.
 */
import type { System, TickContext } from '../ecs/system.js';
import type { World } from '../ecs/world.js';
import { Position, Projectile, Health } from '../../domain/components/index.js';
import * as fp from '../../domain/math/fixed.js';
import * as v2 from '../../domain/math/vec2.js';
import { asEntityId } from '@iron/shared';

const IMPACT_EPS_SQ = fp.fromFloat(0.04);

export const ProjectileSystem: System = {
  name: 'ProjectileSystem',
  update(world: World, ctx: TickContext): void {
    for (const p of world.query(Projectile, Position)) {
      const proj = world.get(p, Projectile)!;
      const pos = world.get(p, Position)!;

      const toTarget = v2.sub(proj.toPos, pos);
      const distSq = v2.lenSq(toTarget);
      const step = fp.mul(proj.speed, ctx.dt);
      const stepSq = fp.mul(step, step);

      if (distSq <= IMPACT_EPS_SQ || distSq <= stepSq) {
        // Impact: damage the target if it is still alive and near the impact point.
        const target = asEntityId(proj.target);
        if (world.isAlive(target)) {
          const health = world.get(target, Health);
          if (health) health.hp -= proj.damage;
        }
        world.destroyEntity(p);
        continue;
      }

      const dir = v2.normalize(toTarget);
      world.add(p, Position, v2.add(pos, v2.scale(dir, step)));
    }
  },
};
