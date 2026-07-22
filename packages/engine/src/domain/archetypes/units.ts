/**
 * Unit archetypes: factory functions that compose the right components onto a new
 * entity. Base stats are data-driven — v1 uses an inline table; a later milestone
 * swaps this for validated JSON content loaded from the `content/` package.
 */
import type { World } from '../../application/ecs/world.js';
import {
  Position,
  Velocity,
  Facing,
  Health,
  Owner,
  UnitType,
  Movement,
  Selectable,
  Weapon,
  Attack,
  Vision,
  ResourceCarrier,
  Harvest,
} from '../components/index.js';
import * as fp from '../math/fixed.js';
import { zero, type Vec2 } from '../math/vec2.js';
import { asPlayerId, type EntityId } from '@iron/shared';

export interface WeaponStats {
  damage: number;
  range: number;
  /** shots per cooldown expressed in ticks between shots */
  cooldownTicks: number;
  /** 0 = instant hit (melee/hitscan); >0 spawns a projectile at this speed */
  projectileSpeed: number;
}

export interface UnitStats {
  hp: number;
  /** movement speed in units/second */
  speed: number;
  /** selection/collision radius in units */
  radius: number;
  /** credit cost to produce */
  cost: number;
  /** ticks to build in a production structure */
  buildTicks: number;
  /** optional weapon; unarmed units (harvester, engineer) omit it */
  weapon?: WeaponStats;
}

export const UNIT_STATS: Readonly<Record<string, UnitStats>> = {
  rifleman: {
    hp: 100,
    speed: 4,
    radius: 0.5,
    cost: 100,
    buildTicks: 40,
    weapon: { damage: 8, range: 6, cooldownTicks: 12, projectileSpeed: 0 },
  },
  engineer: { hp: 60, speed: 3, radius: 0.5, cost: 500, buildTicks: 100 },
  tank: {
    hp: 400,
    speed: 3,
    radius: 1,
    cost: 700,
    buildTicks: 140,
    weapon: { damage: 30, range: 7, cooldownTicks: 30, projectileSpeed: 14 },
  },
  harvester: { hp: 600, speed: 2, radius: 1.2, cost: 1400, buildTicks: 180 },
};

export function spawnUnit(world: World, unit: string, player: number, at: Vec2): EntityId {
  const stats = UNIT_STATS[unit];
  if (!stats) throw new Error(`spawnUnit: unknown unit '${unit}'`);

  const e = world.createEntity();
  world.add(e, Position, { x: at.x, y: at.y });
  world.add(e, Velocity, zero());
  world.add(e, Facing, { dir: { x: fp.FP.ONE, y: fp.FP.ZERO } });
  world.add(e, Health, { hp: stats.hp, max: stats.hp });
  world.add(e, Owner, { player: asPlayerId(player) });
  world.add(e, UnitType, { kind: unit });
  world.add(e, Movement, { target: null, speed: fp.fromInt(stats.speed) });
  world.add(e, Selectable, { radius: fp.fromFloat(stats.radius) });
  world.add(e, Vision, { radius: fp.fromInt(unit === 'harvester' ? 5 : 7) });

  if (stats.weapon) {
    world.add(e, Weapon, {
      damage: stats.weapon.damage,
      range: fp.fromInt(stats.weapon.range),
      cooldownTicks: stats.weapon.cooldownTicks,
      cooldownLeft: 0,
      projectileSpeed: fp.fromInt(stats.weapon.projectileSpeed),
    });
    world.add(e, Attack, { target: -1, chase: false });
  }

  if (unit === 'harvester') {
    world.add(e, ResourceCarrier, { amount: 0, capacity: 200 });
    world.add(e, Harvest, { phase: 'idle', node: -1, gatherLeft: 0 });
  }
  return e;
}
