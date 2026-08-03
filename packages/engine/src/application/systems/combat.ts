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
  WeaponLoadout,
  Attack,
  Movement,
  Building,
  Facing,
  Projectile,
  Selectable,
  type WeaponData,
  type WeaponProfileData,
} from '../../domain/components/index.js';
import type { PlayerEconomy } from '../../domain/economy/player-economy.js';
import * as fp from '../../domain/math/fixed.js';
import * as v2 from '../../domain/math/vec2.js';
import { indexOf } from '../ecs/entity.js';
import { asEntityId, type EntityId } from '@iron/shared';
import { engagementPosition } from '../../domain/movement/engagement-formation.js';
import type { MatchMetrics } from '../match/match-metrics.js';
import type { BattlefieldCover } from '../combat/battlefield-cover.js';

/**
 * Combat with power-gated defensive structures: a building weapon (turret) cannot fire
 * while its owner is in an energy deficit — the classic "low power disables defenses".
 */
export function createCombatSystem(
  economy: PlayerEconomy,
  metrics?: MatchMetrics,
  cover?: BattlefieldCover,
): System {
  return {
    name: 'CombatSystem',
    update(world: World): void {
      const armed = world.query(Position, Owner, Attack);
      for (const e of armed) {
        const weapon = activeWeapon(world, e);
        if (!weapon) continue;
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
          attack.formationIndex = 0;
        }

        // Auto-acquire nearest enemy IN RANGE when idle.
        if (target === undefined) {
          target = acquire(world, e, owner.player, pos, rangeSq);
          attack.target = target === undefined ? -1 : (target as number);
          attack.chase = false;
          attack.formationIndex = 0;
        }
        if (target === undefined) continue;

        const targetPos = world.get(target, Position)!;
        const inRange = v2.distSq(pos, targetPos) <= rangeSq;

        if (inRange) {
          const aimDirection = v2.sub(targetPos, pos);
          if (world.has(e, Facing) && v2.lenSq(aimDirection) > fp.FP.ZERO) {
            world.add(e, Facing, { dir: v2.normalize(aimDirection) });
          }
          if (attack.chase) {
            const move = world.get(e, Movement); // stop chasing once in range
            if (move) move.target = null;
          }
          if (weapon.cooldownLeft === 0) {
            fire(world, e, target, weapon, pos, metrics, cover);
            weapon.cooldownLeft = weapon.cooldownTicks;
          }
        } else if (attack.chase) {
          const move = world.get(e, Movement); // pursue the target
          if (move) {
            move.target = engagementPosition(
              targetPos,
              attack.formationIndex,
              weapon.range,
              world.get(e, Selectable)?.radius ?? fp.fromFloat(0.5),
              world.get(target, Selectable)?.radius ?? fp.fromFloat(0.5),
            );
          }
        } else {
          attack.target = -1; // auto target left range: break leash
        }
      }
    },
  };
}

/**
 * Resolves the weapon stats an armed entity currently fires with: a `WeaponLoadout`'s
 * active slot takes priority (operative), falling back to the fixed `Weapon`
 * component every other armed unit uses. Returns the live component/array-element
 * reference so `cooldownLeft` mutations persist.
 */
function activeWeapon(world: World, e: EntityId): WeaponData | WeaponProfileData | null {
  const loadout = world.get(e, WeaponLoadout);
  if (loadout) return loadout.weapons[loadout.activeIndex] ?? null;
  return world.get(e, Weapon) ?? null;
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

/**
 * Splash for AoE weapons (currently only the operative's demo_charge): every other
 * Health-bearing entity within `radius` of the impact takes the same base damage,
 * regardless of team — an explosive doesn't discriminate — so it can also destroy
 * neutral/hostile structures like the Silent Extraction obstacle wall.
 */
function splashDamage(
  world: World,
  shooter: EntityId,
  primaryTarget: EntityId,
  center: v2.Vec2,
  damage: number,
  radius: fp.Fixed,
  metrics?: MatchMetrics,
): void {
  const radiusSq = fp.mul(radius, radius);
  for (const other of world.query(Position, Health)) {
    if (other === primaryTarget) continue;
    const health = world.get(other, Health)!;
    if (health.hp <= 0) continue;
    const pos = world.get(other, Position)!;
    if (v2.distSq(center, pos) > radiusSq) continue;
    const applied = Math.min(health.hp, damage);
    const otherOwner = world.get(other, Owner);
    if (otherOwner) {
      metrics?.recordDamage(world.get(shooter, Owner)!.player, otherOwner.player, other, applied);
    }
    health.hp -= applied;
  }
}

function fire(
  world: World,
  shooter: EntityId,
  target: EntityId,
  weapon: { damage: number; projectileSpeed: fp.Fixed; areaRadius?: fp.Fixed },
  from: v2.Vec2,
  metrics?: MatchMetrics,
  cover?: BattlefieldCover,
): void {
  const targetPos = world.get(target, Position)!;
  if (weapon.projectileSpeed <= 0) {
    // Instant hit.
    const health = world.get(target, Health);
    if (health) {
      const appliedDamage =
        cover?.damageAgainst(world, target, from, weapon.damage) ?? weapon.damage;
      const damage = Math.min(health.hp, appliedDamage);
      metrics?.recordDamage(
        world.get(shooter, Owner)!.player,
        world.get(target, Owner)!.player,
        target,
        damage,
      );
      health.hp -= appliedDamage;
      if (weapon.areaRadius && weapon.areaRadius > fp.FP.ZERO) {
        splashDamage(world, shooter, target, targetPos, weapon.damage, weapon.areaRadius, metrics);
      }
    }
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
