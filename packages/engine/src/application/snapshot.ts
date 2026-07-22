/**
 * Immutable render snapshot produced each tick. The renderer consumes snapshots and
 * interpolates between the two most recent ones; it never reads live world state.
 * Fixed-point values are converted to floats HERE (the render boundary) — never
 * inside the simulation.
 */
import type { World } from './ecs/world.js';
import {
  Position,
  Facing,
  Health,
  Owner,
  UnitType,
  Selectable,
  Projectile,
  Building,
  ResourceNode,
  Production,
} from '../domain/components/index.js';
import { UNIT_STATS } from '../domain/archetypes/units.js';
import * as fp from '../domain/math/fixed.js';
import type { MatchStateSnapshot } from './match/match-state.js';

export type EntityKind = 'unit' | 'projectile' | 'building' | 'resource';

export interface EntitySnapshot {
  id: number;
  kind: EntityKind;
  x: number;
  y: number;
  /** facing angle in radians, derived from the deterministic direction vector */
  angle: number;
  hp: number;
  maxHp: number;
  radius: number;
  owner: number;
  /** Stable archetype identifier for type-based UI interactions. */
  unitType?: string;
  /** Stable building identifier for selection and production UI. */
  buildingType?: string;
  /** Present only for buildings that can produce units. */
  production?: ProductionSnapshot;
}

export interface ProductionSnapshot {
  queue: string[];
  progressTicks: number;
  currentBuildTicks: number;
  produces: string[];
}

export interface PlayerSnapshot {
  player: number;
  credits: number;
  powerProduced: number;
  powerConsumed: number;
}

export interface FogSnapshot {
  width: number;
  height: number;
  /** Cell size and origin in world units, for mapping cells to screen. */
  cellSize: number;
  originX: number;
  originY: number;
  /** Per-cell state: 0 hidden, 1 explored, 2 visible. */
  cells: Uint8Array;
}

export interface Snapshot {
  tick: number;
  entities: EntitySnapshot[];
  players: PlayerSnapshot[];
  fog?: FogSnapshot;
  match?: MatchStateSnapshot;
}

export function buildSnapshot(
  world: World,
  tick: number,
  players: PlayerSnapshot[] = [],
): Snapshot {
  const entities: EntitySnapshot[] = [];
  for (const e of world.query(Position)) {
    const pos = world.get(e, Position)!;
    const facing = world.get(e, Facing);
    const health = world.get(e, Health);
    const sel = world.get(e, Selectable);
    const owner = world.get(e, Owner);
    const unitType = world.get(e, UnitType);
    const building = world.get(e, Building);
    const production = world.get(e, Production);
    const kind: EntityKind = world.has(e, Projectile)
      ? 'projectile'
      : building
        ? 'building'
        : world.has(e, ResourceNode)
          ? 'resource'
          : 'unit';
    entities.push({
      id: e,
      kind,
      x: fp.toFloat(pos.x),
      y: fp.toFloat(pos.y),
      angle: facing ? Math.atan2(fp.toFloat(facing.dir.y), fp.toFloat(facing.dir.x)) : 0,
      hp: health?.hp ?? 0,
      maxHp: health?.max ?? 0,
      radius: sel ? fp.toFloat(sel.radius) : 0.5,
      owner: owner?.player ?? 0,
      ...(unitType && { unitType: unitType.kind }),
      ...(building && { buildingType: building.kind }),
      ...(production && {
        production: {
          queue: [...production.queue],
          progressTicks: production.progressTicks,
          currentBuildTicks: UNIT_STATS[production.queue[0] ?? '']?.buildTicks ?? 0,
          produces: [...production.produces],
        },
      }),
    });
  }
  return { tick, entities, players };
}

/**
 * Deterministic state hash for desync detection. Hashes only sim-authoritative
 * integer fields (position fixed-point, health, ownership) — cosmetic values such as
 * facing are excluded because they may derive from non-synced display math.
 */
export function hashState(world: World): number {
  let h = 0x811c9dc5; // FNV-1a offset basis
  const mix = (n: number): void => {
    h ^= n | 0;
    h = Math.imul(h, 0x01000193);
  };
  for (const e of world.query(Position)) {
    mix(e);
    const pos = world.get(e, Position)!;
    mix(pos.x);
    mix(pos.y);
    const health = world.get(e, Health);
    if (health) {
      mix(health.hp);
      mix(health.max);
    }
    const owner = world.get(e, Owner);
    if (owner) mix(owner.player);
  }
  return h >>> 0;
}
