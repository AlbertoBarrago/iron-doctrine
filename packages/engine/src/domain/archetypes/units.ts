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
  Healing,
  WeaponLoadout,
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
  movementClass: 'infantry' | 'vehicle';
  /** Whether this moving unit can run over hostile infantry. */
  canCrush?: boolean;
  /** movement speed in units/second */
  speed: number;
  /** selection/collision radius in units */
  radius: number;
  /** fog-of-war reveal radius in world units */
  vision: number;
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
    movementClass: 'infantry',
    speed: 4,
    radius: 0.5,
    vision: 7,
    cost: 100,
    buildTicks: 40,
    weapon: { damage: 8, range: 6, cooldownTicks: 12, projectileSpeed: 0 },
  },
  engineer: {
    hp: 60,
    movementClass: 'infantry',
    speed: 3,
    radius: 0.5,
    vision: 7,
    cost: 500,
    buildTicks: 100,
  },
  medic: {
    hp: 75,
    movementClass: 'infantry',
    speed: 3,
    radius: 0.5,
    vision: 7,
    cost: 300,
    buildTicks: 80,
  },
  scout: {
    hp: 120,
    movementClass: 'vehicle',
    speed: 6,
    radius: 0.75,
    vision: 11,
    cost: 350,
    buildTicks: 80,
  },
  tank: {
    hp: 400,
    movementClass: 'vehicle',
    canCrush: true,
    speed: 3,
    radius: 1,
    vision: 7,
    cost: 700,
    buildTicks: 140,
    weapon: { damage: 30, range: 7, cooldownTicks: 30, projectileSpeed: 14 },
  },
  harvester: {
    hp: 600,
    movementClass: 'vehicle',
    speed: 2,
    radius: 1,
    vision: 5,
    cost: 1400,
    buildTicks: 180,
  },
  // Guest unit for the "Silent Extraction" campaign scenario only — not producible from any
  // structure (cost 0, buildTicks 0). Higher HP and speed reflect a lone special operator.
  // No single `weapon` entry: the operative carries a manually switchable WeaponLoadout
  // (see OPERATIVE_WEAPONS below) instead of a fixed Weapon component.
  operative: {
    hp: 220,
    movementClass: 'infantry',
    speed: 5,
    radius: 0.5,
    vision: 9,
    cost: 0,
    buildTicks: 0,
  },
  // Scenario-only NPC: disarmed, slow, escorted rather than commanded in combat.
  prisoner: {
    hp: 40,
    movementClass: 'infantry',
    speed: 2,
    radius: 0.5,
    vision: 4,
    cost: 0,
    buildTicks: 0,
  },
};

export interface WeaponProfileStats extends WeaponStats {
  id: string;
  /** World-unit splash radius; 0 = single-target hit (the default for every other weapon). */
  areaRadius?: number;
}

/**
 * Silent Extraction only: the operative's manual weapon loadout. Modeled as a
 * standalone table (rather than an entry on `UnitStats.weapon`) because it is a list
 * of switchable profiles instead of one fixed weapon — see `WeaponLoadout` component.
 *
 * - knife: near-instant melee finisher, short cooldown, no reach.
 * - sidearm: the operative's default ranged option, comparable to a rifleman's rifle.
 * - demo_charge: thrown explosive with area damage that also destroys structures;
 *   modeled as an instant-hit AoE (projectileSpeed 0) rather than a travelling
 *   projectile with splash, keeping the existing single-target Projectile system
 *   untouched — consistent with the knife/sidearm instant-hit convention already used
 *   for infantry weapons in this codebase.
 */
export const OPERATIVE_WEAPONS: readonly WeaponProfileStats[] = [
  { id: 'knife', damage: 60, range: 1, cooldownTicks: 8, projectileSpeed: 0 },
  { id: 'sidearm', damage: 15, range: 6, cooldownTicks: 14, projectileSpeed: 0 },
  { id: 'demo_charge', damage: 45, range: 8, cooldownTicks: 90, projectileSpeed: 0, areaRadius: 3 },
];

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
  world.add(e, Vision, { radius: fp.fromInt(stats.vision) });

  if (stats.weapon) {
    world.add(e, Weapon, {
      damage: stats.weapon.damage,
      range: fp.fromInt(stats.weapon.range),
      cooldownTicks: stats.weapon.cooldownTicks,
      cooldownLeft: 0,
      projectileSpeed: fp.fromInt(stats.weapon.projectileSpeed),
    });
    world.add(e, Attack, { target: -1, chase: false, formationIndex: 0 });
  }

  if (unit === 'operative') {
    world.add(e, WeaponLoadout, {
      weapons: OPERATIVE_WEAPONS.map((profile) => ({
        id: profile.id,
        damage: profile.damage,
        range: fp.fromInt(profile.range),
        cooldownTicks: profile.cooldownTicks,
        cooldownLeft: 0,
        projectileSpeed: fp.fromInt(profile.projectileSpeed),
        areaRadius: fp.fromInt(profile.areaRadius ?? 0),
      })),
      activeIndex: 0,
    });
    world.add(e, Attack, { target: -1, chase: false, formationIndex: 0 });
  }

  if (unit === 'harvester') {
    world.add(e, ResourceCarrier, { amount: 0, capacity: 200 });
    world.add(e, Harvest, { phase: 'idle', node: -1, gatherLeft: 0 });
  }
  if (unit === 'medic') {
    world.add(e, Healing, {
      target: -1,
      range: fp.fromInt(3),
      amount: 10,
      cooldownTicks: 20,
      cooldownLeft: 0,
    });
  }
  return e;
}
