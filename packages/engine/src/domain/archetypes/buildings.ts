/**
 * Building archetypes. Buildings are static entities with health and a footprint that
 * is stamped onto the NavGrid as impassable, so pathfinding routes around them.
 * Data-driven stats are inline for now (JSON content pipeline lands in a later milestone).
 */
import type { World } from '../../application/ecs/world.js';
import type { NavGrid } from '../../application/pathfinding/nav-grid.js';
import {
  Position,
  Owner,
  Health,
  Selectable,
  Building,
  DropOff,
  Energy,
  Vision,
  Production,
  Weapon,
  Attack,
  Construction,
} from '../components/index.js';
import type { WeaponStats } from './units.js';
import * as fp from '../math/fixed.js';
import type { Vec2 } from '../math/vec2.js';
import { asPlayerId, type EntityId } from '@iron/shared';

export interface BuildingStats {
  hp: number;
  footprint: number;
  cost: number;
  buildTicks: number;
  /** power produced (>0) or consumed (<0) */
  power: number;
  /** whether harvesters can deposit here */
  dropOff?: boolean;
  /** unit categories this structure can produce */
  produces?: string[];
  /** defensive weapon (turrets); powered down when the owner is in energy deficit */
  weapon?: WeaponStats;
}

export const BUILDING_STATS: Readonly<Record<string, BuildingStats>> = {
  construction_yard: {
    hp: 1500,
    footprint: 3,
    cost: 2500,
    buildTicks: 300,
    power: -10,
    dropOff: true,
  },
  power_plant: { hp: 800, footprint: 2, cost: 800, buildTicks: 100, power: 100 },
  refinery: { hp: 1000, footprint: 3, cost: 1500, buildTicks: 180, power: -30, dropOff: true },
  barracks: {
    hp: 800,
    footprint: 2,
    cost: 600,
    buildTicks: 120,
    power: -20,
    produces: ['rifleman', 'engineer'],
  },
  factory: {
    hp: 1000,
    footprint: 3,
    cost: 1800,
    buildTicks: 220,
    power: -30,
    produces: ['tank', 'harvester'],
  },
  turret: {
    hp: 600,
    footprint: 1,
    cost: 900,
    buildTicks: 140,
    power: -40,
    weapon: { damage: 25, range: 9, cooldownTicks: 18, projectileSpeed: 16 },
  },
};

export function spawnBuilding(
  world: World,
  grid: NavGrid,
  kind: string,
  player: number,
  at: Vec2,
  options: { underConstruction?: boolean } = {},
): EntityId {
  const stats = BUILDING_STATS[kind];
  if (!stats) throw new Error(`spawnBuilding: unknown building '${kind}'`);

  const e = world.createEntity();
  world.add(e, Position, { x: at.x, y: at.y });
  world.add(e, Owner, { player: asPlayerId(player) });
  world.add(e, Health, { hp: options.underConstruction ? 1 : stats.hp, max: stats.hp });
  world.add(e, Selectable, {
    radius: fp.div(fp.fromInt(stats.footprint), fp.fromInt(2)),
  });
  world.add(e, Building, { kind, footprint: stats.footprint });

  if (options.underConstruction) {
    world.add(e, Construction, { progressTicks: 0, buildTicks: stats.buildTicks });
  } else {
    activateBuilding(world, e, stats);
  }

  stampFootprint(grid, stats, at);
  return e;
}

/** Add operational components once construction completes. */
export function activateBuilding(world: World, entity: EntityId, stats: BuildingStats): void {
  world.add(entity, Energy, {
    produced: Math.max(0, stats.power),
    consumed: Math.max(0, -stats.power),
  });
  world.add(entity, Vision, { radius: fp.fromInt(stats.footprint + 6) });
  if (stats.dropOff) world.add(entity, DropOff, { _: 0 });
  if (stats.produces && stats.produces.length > 0) {
    world.add(entity, Production, {
      queue: [],
      progressTicks: 0,
      rally: null,
      produces: [...stats.produces],
    });
  }
  if (stats.weapon) {
    world.add(entity, Weapon, {
      damage: stats.weapon.damage,
      range: fp.fromInt(stats.weapon.range),
      cooldownTicks: stats.weapon.cooldownTicks,
      cooldownLeft: 0,
      projectileSpeed: fp.fromInt(stats.weapon.projectileSpeed),
    });
    world.add(entity, Attack, { target: -1, chase: false });
  }
}

export function canPlaceBuilding(grid: NavGrid, kind: string, at: Vec2): boolean {
  const stats = BUILDING_STATS[kind];
  if (!stats) return false;
  const cell = grid.worldToCell(at.x, at.y);
  const half = Math.floor(stats.footprint / 2);
  const startX = cell.cx - half;
  const startY = cell.cy - half;
  for (let y = startY; y < startY + stats.footprint; y++) {
    for (let x = startX; x < startX + stats.footprint; x++) {
      if (!grid.inBounds(x, y) || grid.isBlocked(x, y)) return false;
    }
  }
  return true;
}

function stampFootprint(grid: NavGrid, stats: BuildingStats, at: Vec2): void {
  const cell = grid.worldToCell(at.x, at.y);
  const half = Math.floor(stats.footprint / 2);
  grid.stampRect(cell.cx - half, cell.cy - half, stats.footprint, stats.footprint, true);
}
