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
 * Production submits the same validated facility-queue commands as a human player.
 * Difficulty scales decision cadence, attack size and the standing-army limit.
 */
import type { System, TickContext } from '../ecs/system.js';
import type { World } from '../ecs/world.js';
import type { PlayerEconomy } from '../../domain/economy/player-economy.js';
import type { TechState } from '../../domain/tech/tech-tree.js';
import type { TeamResolver } from '../systems/fog-system.js';
import type { CommandBus } from '../commands/command.js';
import {
  Position,
  Owner,
  Health,
  Weapon,
  Attack,
  Building,
  Harvest,
  Production,
} from '../../domain/components/index.js';
import { UNIT_STATS } from '../../domain/archetypes/units.js';
import * as fp from '../../domain/math/fixed.js';
import * as v2 from '../../domain/math/vec2.js';
import type { Vec2 } from '../../domain/math/vec2.js';
import type { EntityId } from '@iron/shared';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface AIPlayerConfig {
  player: number;
  difficulty: Difficulty;
  /** Tick before this AI starts producing units or issuing orders. */
  activationTick?: number;
}

interface Tuning {
  decisionInterval: number; // ticks between economy/production decisions
  attackInterval: number; // ticks between aggression re-evaluation
  armyThreshold: number; // combat units before attacking
  maxCombatUnits: number; // hard ceiling to prevent runaway unit floods
}

const TUNING: Record<Difficulty, Tuning> = {
  easy: {
    decisionInterval: 100,
    attackInterval: 240,
    armyThreshold: 4,
    maxCombatUnits: 6,
  },
  normal: {
    decisionInterval: 80,
    attackInterval: 180,
    armyThreshold: 5,
    maxCombatUnits: 10,
  },
  hard: {
    decisionInterval: 60,
    attackInterval: 140,
    armyThreshold: 6,
    maxCombatUnits: 14,
  },
};

export function createAISystem(
  ais: AIPlayerConfig[],
  bus: CommandBus,
  economy: PlayerEconomy,
  tech: TechState,
  teamOf: TeamResolver,
  activationOrigin?: () => number | null,
): System {
  return {
    name: 'AIDirector',
    update(world: World, ctx: TickContext): void {
      for (const ai of ais) {
        const origin = activationOrigin ? activationOrigin() : 0;
        if (origin === null) continue;
        const activationTick = origin + (ai.activationTick ?? 0);
        if (ctx.tick < activationTick) continue;
        const tuning = TUNING[ai.difficulty];
        const activeTick = ctx.tick - activationTick;
        if (activeTick % tuning.decisionInterval === 0) {
          manageEconomyAndProduction(world, ai, bus, economy, tech, tuning);
        }
        if (activeTick % tuning.attackInterval === 0) manageAggression(world, ai, teamOf, tuning);
      }
    },
  };
}

function ownUnits(world: World, player: number): EntityId[] {
  return world
    .query(Owner, Position, Health)
    .filter((e) => world.get(e, Owner)!.player === player && !world.has(e, Building));
}

function manageEconomyAndProduction(
  world: World,
  ai: AIPlayerConfig,
  bus: CommandBus,
  economy: PlayerEconomy,
  tech: TechState,
  tuning: Tuning,
): void {
  const player = ai.player;
  const units = ownUnits(world, player);
  const harvesters = units.filter((e) => world.has(e, Harvest)).length;
  const queuedUnits = ownQueuedUnits(world, player);

  // Economy: always keep one harvester.
  if (harvesters === 0 && !queuedUnits.includes('harvester')) {
    if (queueUnit(world, bus, economy, tech, player, 'harvester')) return;
  }

  const queuedCombatUnits = queuedUnits.filter((unit) => UNIT_STATS[unit]?.weapon).length;
  const combatUnits =
    units.filter((entity) => world.has(entity, Weapon)).length + queuedCombatUnits;
  if (combatUnits >= tuning.maxCombatUnits) return;

  // Production: buy the best affordable combat unit, keeping a small reserve.
  const tank = UNIT_STATS.tank!;
  const rifle = UNIT_STATS.rifleman!;
  if (economy.credits(player) >= tank.cost + 200) {
    if (queueUnit(world, bus, economy, tech, player, 'tank')) return;
  }
  if (economy.credits(player) >= rifle.cost + 100) {
    queueUnit(world, bus, economy, tech, player, 'rifleman');
  }
}

function ownQueuedUnits(world: World, player: number): string[] {
  const queued: string[] = [];
  for (const building of world.query(Production, Owner)) {
    if (world.get(building, Owner)!.player === player) {
      queued.push(...world.get(building, Production)!.queue);
    }
  }
  return queued;
}

function queueUnit(
  world: World,
  bus: CommandBus,
  economy: PlayerEconomy,
  tech: TechState,
  player: number,
  unit: string,
): boolean {
  const stats = UNIT_STATS[unit];
  if (!stats || economy.credits(player) < stats.cost || !tech.canProduceUnit(player, unit)) {
    return false;
  }
  const facility = world.query(Production, Owner).find((building) => {
    if (world.get(building, Owner)!.player !== player) return false;
    const production = world.get(building, Production)!;
    return production.queue.length === 0 && production.produces.includes(unit);
  });
  if (facility === undefined) return false;
  bus.push({ type: 'queueProduction', building: facility, unit });
  return true;
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
      best === undefined || (isUnit && !bestIsUnit) || (isUnit === bestIsUnit && d < bestD);
    if (better) {
      best = e;
      bestD = d;
      bestIsUnit = isUnit;
    }
  }
  return best;
}
