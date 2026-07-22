/**
 * AIDirector: a lightweight, fully deterministic skirmish AI.
 *
 * For each AI-controlled player it runs on a decision cadence (derived from the tick
 * counter, never wall-clock) and pursues three behaviours:
 *   - Economy: keep a harvester alive so credits keep flowing.
 *   - Production: spend accumulated credits on combat units at its base.
 *   - Aggression: once its army reaches a threshold, order every combat unit to
 *     attack the nearest enemy — units, then buildings.
 *
 * Production is modelled as an instant spend-and-spawn (build queues land in a later
 * milestone). All randomness flows through the seeded per-tick RNG so two peers make
 * identical decisions. Difficulty scales income cadence and army thresholds.
 */
import type { System, TickContext } from '../ecs/system.js';
import type { World } from '../ecs/world.js';
import type { NavGrid } from '../pathfinding/nav-grid.js';
import type { PlayerEconomy } from '../../domain/economy/player-economy.js';
import type { TeamResolver } from '../systems/fog-system.js';
import {
  Position,
  Owner,
  Health,
  Weapon,
  Attack,
  Building,
  Harvest,
} from '../../domain/components/index.js';
import { spawnUnit, UNIT_STATS } from '../../domain/archetypes/units.js';
import * as fp from '../../domain/math/fixed.js';
import * as v2 from '../../domain/math/vec2.js';
import type { Vec2 } from '../../domain/math/vec2.js';
import type { EntityId } from '@iron/shared';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface AIPlayerConfig {
  player: number;
  difficulty: Difficulty;
}

interface Tuning {
  decisionInterval: number; // ticks between economy/production decisions
  attackInterval: number; // ticks between aggression re-evaluation
  armyThreshold: number; // combat units before attacking
}

const TUNING: Record<Difficulty, Tuning> = {
  easy: { decisionInterval: 60, attackInterval: 200, armyThreshold: 6 },
  normal: { decisionInterval: 40, attackInterval: 140, armyThreshold: 4 },
  hard: { decisionInterval: 20, attackInterval: 100, armyThreshold: 3 },
};

export function createAISystem(
  ais: AIPlayerConfig[],
  economy: PlayerEconomy,
  teamOf: TeamResolver,
  grid: NavGrid,
): System {
  return {
    name: 'AIDirector',
    update(world: World, ctx: TickContext): void {
      for (const ai of ais) {
        const tuning = TUNING[ai.difficulty];
        if (ctx.tick % tuning.decisionInterval === 0) manageEconomyAndProduction(world, ctx, ai, economy, grid);
        if (ctx.tick % tuning.attackInterval === 0) manageAggression(world, ai, teamOf, tuning);
      }
    },
  };
}

function basePoint(world: World, player: number): Vec2 {
  for (const e of world.query(Building, Owner, Position)) {
    if (world.get(e, Owner)!.player === player) return { ...world.get(e, Position)! };
  }
  for (const e of world.query(Owner, Position)) {
    if (world.get(e, Owner)!.player === player) return { ...world.get(e, Position)! };
  }
  return v2.zero();
}

function ownUnits(world: World, player: number): EntityId[] {
  return world
    .query(Owner, Position, Health)
    .filter((e) => world.get(e, Owner)!.player === player && !world.has(e, Building));
}

function manageEconomyAndProduction(
  world: World,
  ctx: TickContext,
  ai: AIPlayerConfig,
  economy: PlayerEconomy,
  grid: NavGrid,
): void {
  const player = ai.player;
  const base = basePoint(world, player);
  const units = ownUnits(world, player);
  const harvesters = units.filter((e) => world.has(e, Harvest)).length;

  // Economy: always keep one harvester.
  if (harvesters === 0 && economy.spend(player, UNIT_STATS.harvester!.cost)) {
    spawnNear(world, ctx, grid, 'harvester', player, base);
    return; // one action per decision keeps spending paced
  }

  // Production: buy the best affordable combat unit, keeping a small reserve.
  const tank = UNIT_STATS.tank!;
  const rifle = UNIT_STATS.rifleman!;
  if (economy.credits(player) >= tank.cost + 200 && economy.spend(player, tank.cost)) {
    spawnNear(world, ctx, grid, 'tank', player, base);
  } else if (economy.credits(player) >= rifle.cost + 100 && economy.spend(player, rifle.cost)) {
    spawnNear(world, ctx, grid, 'rifleman', player, base);
  }
}

function spawnNear(
  world: World,
  ctx: TickContext,
  grid: NavGrid,
  unit: string,
  player: number,
  base: Vec2,
): void {
  // Deterministic jitter around the base, snapped to a free cell.
  const ox = fp.fromInt(ctx.rng.nextInt(-3, 3));
  const oy = fp.fromInt(ctx.rng.nextInt(-3, 3));
  const want = { x: fp.add(base.x, ox), y: fp.add(base.y, oy) };
  const cell = grid.worldToCell(want.x, want.y);
  const open = grid.nearestOpen(cell.cx, cell.cy);
  const at = open ? grid.cellToWorld(open.cx, open.cy) : want;
  spawnUnit(world, unit, player, at);
}

function manageAggression(
  world: World,
  ai: AIPlayerConfig,
  teamOf: TeamResolver,
  tuning: Tuning,
): void {
  const player = ai.player;
  const myTeam = teamOf(player);
  const army = ownUnits(world, player).filter((e) => world.has(e, Weapon));
  if (army.length < tuning.armyThreshold) return;

  // Pick a rally target: nearest enemy to the army centroid, units before buildings.
  const centroid = centroidOf(world, army);
  const target = nearestEnemy(world, centroid, myTeam, teamOf);
  if (target === undefined) return;

  for (const e of army) {
    const atk = world.get(e, Attack);
    if (atk) {
      atk.target = target as number;
      atk.chase = true;
    }
  }
}

function centroidOf(world: World, units: EntityId[]): Vec2 {
  if (units.length === 0) return v2.zero();
  let sx = fp.FP.ZERO;
  let sy = fp.FP.ZERO;
  for (const e of units) {
    const p = world.get(e, Position)!;
    sx = fp.add(sx, p.x);
    sy = fp.add(sy, p.y);
  }
  const n = fp.fromInt(units.length);
  return { x: fp.div(sx, n), y: fp.div(sy, n) };
}

function nearestEnemy(
  world: World,
  from: Vec2,
  myTeam: number,
  teamOf: TeamResolver,
): EntityId | undefined {
  let best: EntityId | undefined;
  let bestD = fp.FP.ZERO;
  let bestIsUnit = false;
  for (const e of world.query(Owner, Position, Health)) {
    if (teamOf(world.get(e, Owner)!.player) === myTeam) continue;
    const isUnit = !world.has(e, Building);
    const d = v2.distSq(from, world.get(e, Position)!);
    // Prefer units over buildings; among same class, nearest wins.
    const better =
      best === undefined ||
      (isUnit && !bestIsUnit) ||
      (isUnit === bestIsUnit && d < bestD);
    if (better) {
      best = e;
      bestD = d;
      bestIsUnit = isUnit;
    }
  }
  return best;
}
