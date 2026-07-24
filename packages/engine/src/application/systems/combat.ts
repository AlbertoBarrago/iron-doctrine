/**
 * CombatSystem: target acquisition and weapon firing.
 *
 * For every armed entity it ticks the weapon cooldown, validates or auto-acquires an
 * enemy target within range/vision, and — when ready — either applies instant damage
 * (melee/hitscan) or spawns a travelling projectile. Enemy = different owner (team
 * alliances are layered in later). Deterministic: entities are scanned in ascending
 * id order and the nearest valid target wins with a stable tie-break.
 */
import type { System } from '../ecs/system.js';
import type { World } from '../ecs/world.js';
import {
  Position,
  Owner,
  Health,
  Weapon,
  Attack,
  Movement,
  Building,
  Projectile,
} from '../../domain/components/index.js';
import type { PlayerEconomy } from '../../domain/economy/player-economy.js';
import * as fp from '../../domain/math/fixed.js';
import * as v2 from '../../domain/math/vec2.js';
import { indexOf } from '../ecs/entity.js';
import { asEntityId, type EntityId } from '@iron/shared';

/**
 * Combat with power-gated defensive structures: a building weapon (turret) cannot fire
 * while its owner is in an energy deficit — the classic "low power disables defenses".
 */
export function createCombatSystem(economy: PlayerEconomy): System {
  return {
    name: 'CombatSystem',
    update(world: World): void {
    const armed = world.query(Weapon, Position, Owner, Attack);
    for (const e of armed) {
      const weapon = world.get(e, Weapon)!;
      if (weapon.cooldownLeft > 0) weapon.cooldownLeft--;

      const pos = world.get(e, Position)!;
      const owner = world.get(e, Owner)!;

      // Powered-down defenses can neither acquire nor fire.
      if (world.has(e, Building)) {
        const power = economy.get(owner.player).power;
        if (power.consumed > power.produced) continue;
      }
      const attack = world.get(e, Attack)!;
      const rangeSq = fp.mul(weapon.range, weapon.range);

      // Validate existing target: must be a living enemy. Range is NOT part of
      // validity — an explicit order pursues out-of-range targets (see below).
      let target = attack.target === -1 ? undefined : asEntityId(attack.target);
      if (target !== undefined && !isLivingEnemy(world, target, owner.player)) {
        target = undefined;
        attack.target = -1;
        attack.chase = false;
      }

      // Auto-acquire nearest enemy IN RANGE when idle.
      if (target === undefined) {
        target = acquire(world, e, owner.player, pos, rangeSq);
        attack.target = target === undefined ? -1 : (target as number);
        attack.chase = false;
      }
      if (target === undefined) continue;

      const targetPos = world.get(target, Position)!;
      const inRange = v2.distSq(pos, targetPos) <= rangeSq;

      if (inRange) {
        if (attack.chase) {
          const move = world.get(e, Movement); // stop chasing once in range
          if (move) move.target = null;
        }
        if (weapon.cooldownLeft === 0) {
          fire(world, e, target, weapon, pos);
          weapon.cooldownLeft = weapon.cooldownTicks;
        }
      } else if (attack.chase) {
        const move = world.get(e, Movement); // pursue the target
        if (move) move.target = engagementPosition(e, targetPos, weapon.range);
      } else {
        attack.target = -1; // auto target left range: break leash
      }
    }
    },
  };
}

const DIAGONAL = v2.normalize({ x: fp.FP.ONE, y: fp.FP.ONE });
const ENGAGEMENT_DIRECTIONS: readonly v2.Vec2[] = [
  { x: fp.FP.ONE, y: fp.FP.ZERO },
  DIAGONAL,
  { x: fp.FP.ZERO, y: fp.FP.ONE },
  { x: fp.neg(DIAGONAL.x), y: DIAGONAL.y },
  { x: fp.neg(fp.FP.ONE), y: fp.FP.ZERO },
  { x: fp.neg(DIAGONAL.x), y: fp.neg(DIAGONAL.y) },
  { x: fp.FP.ZERO, y: fp.neg(fp.FP.ONE) },
  { x: DIAGONAL.x, y: fp.neg(DIAGONAL.y) },
];

function engagementPosition(entity: EntityId, target: v2.Vec2, range: fp.Fixed): v2.Vec2 {
  const direction = ENGAGEMENT_DIRECTIONS[indexOf(entity) % ENGAGEMENT_DIRECTIONS.length]!;
  const standOff = fp.mul(range, fp.fromFloat(0.75));
  return v2.add(target, v2.scale(direction, standOff));
}

function isLivingEnemy(world: World, target: EntityId, myPlayer: number): boolean {
  if (!world.isAlive(target)) return false;
  const owner = world.get(target, Owner);
  const pos = world.get(target, Position);
  const health = world.get(target, Health);
  if (!owner || !pos || !health || health.hp <= 0) return false;
  return owner.player !== myPlayer;
}

function acquire(
  world: World,
  self: EntityId,
  myPlayer: number,
  from: v2.Vec2,
  rangeSq: fp.Fixed,
): EntityId | undefined {
  let best: EntityId | undefined;
  let bestD = fp.FP.ZERO;
  for (const other of world.query(Position, Owner, Health)) {
    if (other === self) continue;
    const owner = world.get(other, Owner)!;
    if (owner.player === myPlayer) continue;
    const health = world.get(other, Health)!;
    if (health.hp <= 0) continue;
    const d = v2.distSq(from, world.get(other, Position)!);
    if (d > rangeSq) continue;
    // Nearest wins; ties broken by lower id (ascending scan already gives this).
    if (best === undefined || d < bestD || (d === bestD && indexOf(other) < indexOf(best))) {
      best = other;
      bestD = d;
    }
  }
  return best;
}

function fire(
  world: World,
  shooter: EntityId,
  target: EntityId,
  weapon: { damage: number; projectileSpeed: fp.Fixed },
  from: v2.Vec2,
): void {
  const targetPos = world.get(target, Position)!;
  if (weapon.projectileSpeed <= 0) {
    // Instant hit.
    const health = world.get(target, Health);
    if (health) health.hp -= weapon.damage;
    return;
  }
  // Spawn a projectile entity travelling toward the target's current position.
  const p = world.createEntity();
  world.add(p, Position, { x: from.x, y: from.y });
  world.add(p, Projectile, {
    target: target as number,
    toPos: { x: targetPos.x, y: targetPos.y },
    speed: weapon.projectileSpeed,
    damage: weapon.damage,
    owner: world.get(shooter, Owner)!.player,
  });
}
