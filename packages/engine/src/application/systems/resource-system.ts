/**
 * ResourceSystem: drives the harvester economy loop as a small state machine —
 * find ore → travel → gather until full or depleted → travel to the nearest own
 * drop-off → deposit as credits → repeat. Movement is delegated to the existing
 * MovementSystem by setting movement targets, so pathing/obstacles are handled for
 * free. Fully deterministic: nearest selection uses ascending-id tie-breaks.
 */
import type { System } from '../ecs/system.js';
import type { World } from '../ecs/world.js';
import {
  Position,
  Owner,
  Movement,
  Harvest,
  ResourceNode,
  ResourceCarrier,
  DropOff,
} from '../../domain/components/index.js';
import type { PlayerEconomy } from '../../domain/economy/player-economy.js';
import * as fp from '../../domain/math/fixed.js';
import * as v2 from '../../domain/math/vec2.js';
import { indexOf } from '../ecs/entity.js';
import { asEntityId, type EntityId } from '@iron/shared';

/** Ticks spent extracting one batch before the carrier updates. */
const GATHER_TICKS = 8;
/** Units of ore extracted per gather batch. */
const GATHER_RATE = 20;
/**
 * Interaction distance (squared) for node/drop-off proximity. Generous enough that a
 * harvester stopping at a cell adjacent to a multi-cell building footprint still counts
 * as "arrived" for depositing.
 */
const REACH_SQ = fp.fromFloat(12.25); // 3.5 units

export function createResourceSystem(economy: PlayerEconomy): System {
  return {
    name: 'ResourceSystem',
    update(world: World): void {
      for (const e of world.query(Harvest, Position, ResourceCarrier, Owner, Movement)) {
        const h = world.get(e, Harvest)!;
        const carrier = world.get(e, ResourceCarrier)!;
        const pos = world.get(e, Position)!;
        const owner = world.get(e, Owner)!.player;
        const move = world.get(e, Movement)!;

        switch (h.phase) {
          case 'idle': {
            const node = nearestNode(world, pos);
            if (node !== undefined) {
              h.node = node as number;
              move.target = worldOf(world, node);
              h.phase = 'toNode';
            }
            break;
          }
          case 'toNode': {
            const node = h.node === -1 ? undefined : asEntityId(h.node);
            if (node === undefined || !world.isAlive(node)) {
              h.phase = 'idle';
              break;
            }
            if (v2.distSq(pos, world.get(node, Position)!) <= REACH_SQ) {
              h.phase = 'gathering';
              h.gatherLeft = GATHER_TICKS;
              move.target = null;
            }
            break;
          }
          case 'gathering': {
            const node = h.node === -1 ? undefined : asEntityId(h.node);
            if (node === undefined || !world.isAlive(node)) {
              h.phase = carrier.amount > 0 ? 'toBase' : 'idle';
              break;
            }
            if (h.gatherLeft > 0) {
              h.gatherLeft--;
              break;
            }
            const nodeData = world.get(node, ResourceNode)!;
            const room = carrier.capacity - carrier.amount;
            const take = Math.min(GATHER_RATE, room, nodeData.amount);
            carrier.amount += take;
            nodeData.amount -= take;
            if (nodeData.amount <= 0) world.destroyEntity(node);
            if (carrier.amount >= carrier.capacity || take === 0) {
              routeToBase(world, e, owner, pos, move, h);
            } else {
              h.gatherLeft = GATHER_TICKS; // keep extracting
            }
            break;
          }
          case 'toBase': {
            const base = nearestDropOff(world, pos, owner);
            if (base === undefined) break; // no refinery yet: wait
            if (v2.distSq(pos, world.get(base, Position)!) <= REACH_SQ) {
              h.phase = 'depositing';
              move.target = null;
            } else {
              move.target = worldOf(world, base);
            }
            break;
          }
          case 'depositing': {
            economy.addCredits(owner, carrier.amount);
            carrier.amount = 0;
            h.phase = 'idle';
            break;
          }
        }
      }
    },
  };
}

function routeToBase(
  world: World,
  e: EntityId,
  owner: number,
  pos: v2.Vec2,
  move: { target: v2.Vec2 | null },
  h: { phase: string },
): void {
  const base = nearestDropOff(world, pos, owner);
  h.phase = 'toBase';
  if (base !== undefined) move.target = worldOf(world, base);
  void e;
}

function worldOf(world: World, e: EntityId): v2.Vec2 {
  const p = world.get(e, Position)!;
  return { x: p.x, y: p.y };
}

function nearestNode(world: World, from: v2.Vec2): EntityId | undefined {
  return nearest(world.query(ResourceNode, Position), world, from);
}

function nearestDropOff(world: World, from: v2.Vec2, owner: number): EntityId | undefined {
  const candidates = world
    .query(DropOff, Position, Owner)
    .filter((e) => world.get(e, Owner)!.player === owner);
  return nearest(candidates, world, from);
}

function nearest(candidates: EntityId[], world: World, from: v2.Vec2): EntityId | undefined {
  let best: EntityId | undefined;
  let bestD = fp.FP.ZERO;
  for (const c of candidates) {
    const d = v2.distSq(from, world.get(c, Position)!);
    if (best === undefined || d < bestD || (d === bestD && indexOf(c) < indexOf(best))) {
      best = c;
      bestD = d;
    }
  }
  return best;
}
