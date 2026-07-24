/**
 * CommandSystem: drains the CommandBus at the start of a tick and mutates the world
 * accordingly. Runs first in the schedule so orders take effect the same tick they
 * are scheduled for, uniformly across all peers. Needs the NavGrid because building
 * placement stamps an impassable footprint.
 */
import type { System } from '../ecs/system.js';
import type { World } from '../ecs/world.js';
import type { NavGrid } from '../pathfinding/nav-grid.js';
import type { CommandBus } from '../commands/command.js';
import type { PlayerEconomy } from '../../domain/economy/player-economy.js';
import {
  Movement,
  FlowMovement,
  Path,
  Attack,
  Harvest,
  Production,
  Owner,
  Position,
  ResourceNode,
} from '../../domain/components/index.js';
import { spawnUnit, UNIT_STATS } from '../../domain/archetypes/units.js';
import {
  BUILDING_STATS,
  canPlaceBuilding,
  spawnBuilding,
} from '../../domain/archetypes/buildings.js';
import { spawnResourceNode } from '../../domain/archetypes/resources.js';
import { TECH_TREE, type TechState } from '../../domain/tech/tech-tree.js';
import { computeFormationSlots } from '../../domain/movement/formation.js';
import { indexOf } from '../ecs/entity.js';
import type { EntityId } from '@iron/shared';
import type { Vec2 } from '../../domain/math/vec2.js';

export function createCommandSystem(
  bus: CommandBus,
  grid: NavGrid,
  economy: PlayerEconomy,
  tech: TechState,
): System {
  return {
    name: 'CommandSystem',
    update(world: World): void {
      for (const cmd of bus.drain()) {
        switch (cmd.type) {
          case 'move': {
            const movers = [...cmd.entities].sort((a, b) => indexOf(a) - indexOf(b));
            const goalCell = nearestOpenAcrossGrid(grid, cmd.target);
            if (!goalCell) break;
            const goal = grid.cellToWorld(goalCell.cx, goalCell.cy);
            const slots = assignOpenFormationSlots(grid, movers.length, cmd.target);
            movers.forEach((e, i) => {
              pauseHarvest(world, e);
              const move = world.get(e, Movement);
              if (move) {
                const finalTarget = slots[i] ?? goal;
                move.target = { ...finalTarget };
                if (movers.length > 1) {
                  world.add(e, FlowMovement, {
                    goal: { ...goal },
                    finalTarget: { ...finalTarget },
                  });
                } else if (world.has(e, FlowMovement)) {
                  world.remove(e, FlowMovement);
                }
                if (world.has(e, Path)) world.remove(e, Path);
              }
              const atk = world.get(e, Attack);
              if (atk) {
                atk.target = -1; // a move order cancels any attack
                atk.chase = false;
              }
            });
            break;
          }
          case 'stop':
            for (const e of cmd.entities) {
              pauseHarvest(world, e);
              const move = world.get(e, Movement);
              if (move) move.target = null;
              if (world.has(e, FlowMovement)) world.remove(e, FlowMovement);
              if (world.has(e, Path)) world.remove(e, Path);
              const atk = world.get(e, Attack);
              if (atk) atk.target = -1;
            }
            break;
          case 'attack':
            for (const e of cmd.entities) {
              if (world.has(e, FlowMovement)) world.remove(e, FlowMovement);
              if (world.has(e, Path)) world.remove(e, Path);
              const atk = world.get(e, Attack);
              if (atk) {
                atk.target = cmd.target as number;
                atk.chase = true; // explicit order pursues the target
              }
            }
            break;
          case 'gather':
            for (const e of cmd.entities) {
              const h = world.get(e, Harvest);
              if (h) {
                const target = cmd.target;
                const targetPosition =
                  target === undefined ? undefined : world.get(target, Position);
                if (target !== undefined && targetPosition && world.has(target, ResourceNode)) {
                  h.phase = 'toNode';
                  h.node = target as number;
                  const movement = world.get(e, Movement);
                  if (movement) movement.target = { ...targetPosition };
                  if (world.has(e, FlowMovement)) world.remove(e, FlowMovement);
                  if (world.has(e, Path)) world.remove(e, Path);
                } else {
                  h.phase = 'idle'; // re-enter the harvest loop, picking nearest ore
                  h.node = -1;
                }
                h.gatherLeft = 0;
              }
            }
            break;
          case 'spawnUnit':
            spawnUnit(world, cmd.unit, cmd.player, cmd.at);
            break;
          case 'spawnBuilding':
            spawnBuilding(world, grid, cmd.building, cmd.player, cmd.at);
            break;
          case 'placeBuilding': {
            const stats = BUILDING_STATS[cmd.building];
            if (!stats || !canPlaceBuilding(grid, cmd.building, cmd.at)) break;
            if (!economy.spend(cmd.player, stats.cost)) break;
            spawnBuilding(world, grid, cmd.building, cmd.player, cmd.at, {
              underConstruction: true,
            });
            break;
          }
          case 'spawnResource':
            spawnResourceNode(world, cmd.at, cmd.amount);
            break;
          case 'queueProduction': {
            const prod = world.get(cmd.building, Production);
            const owner = world.get(cmd.building, Owner);
            const stats = UNIT_STATS[cmd.unit];
            if (
              prod &&
              owner &&
              stats &&
              prod.produces.includes(cmd.unit) &&
              tech.canProduceUnit(owner.player, cmd.unit)
            ) {
              // Charge on enqueue; only queue if affordable and tech-unlocked.
              if (economy.spend(owner.player, stats.cost)) prod.queue.push(cmd.unit);
            }
            break;
          }
          case 'cancelProduction': {
            const prod = world.get(cmd.building, Production);
            const owner = world.get(cmd.building, Owner);
            if (prod && owner && prod.queue.length > 0) {
              // Refund the last queued unit; reset progress if it was the active one.
              const removed = prod.queue.pop()!;
              const stats = UNIT_STATS[removed];
              if (stats) economy.addCredits(owner.player, stats.cost);
              if (prod.queue.length === 0) prod.progressTicks = 0;
            }
            break;
          }
          case 'setRally': {
            const prod = world.get(cmd.building, Production);
            if (prod) prod.rally = { x: cmd.point.x, y: cmd.point.y };
            break;
          }
          case 'research': {
            const def = TECH_TREE[cmd.tech];
            if (def && tech.canResearch(cmd.player, cmd.tech)) {
              if (economy.spend(cmd.player, def.cost)) tech.unlock(cmd.player, cmd.tech);
            }
            break;
          }
        }
      }
    },
  };
}

function nearestOpenAcrossGrid(grid: NavGrid, target: Vec2) {
  const cell = grid.worldToCell(target.x, target.y);
  return grid.nearestOpen(cell.cx, cell.cy, Math.max(grid.width, grid.height));
}

function assignOpenFormationSlots(
  grid: NavGrid,
  count: number,
  target: Vec2,
): Vec2[] {
  if (count === 1) {
    const cell = grid.worldToCell(target.x, target.y);
    if (grid.inBounds(cell.cx, cell.cy) && !grid.isBlocked(cell.cx, cell.cy)) return [target];
  }
  const requested = computeFormationSlots(count, target, 2);
  const reserved = new Set<number>();
  return requested.map((slot) => {
    const desired = grid.worldToCell(slot.x, slot.y);
    const cell = nearestUnreservedOpen(grid, desired.cx, desired.cy, reserved);
    if (!cell) return target;
    reserved.add(grid.index(cell.cx, cell.cy));
    return grid.cellToWorld(cell.cx, cell.cy);
  });
}

function nearestUnreservedOpen(
  grid: NavGrid,
  cx: number,
  cy: number,
  reserved: ReadonlySet<number>,
) {
  const maxRadius = Math.max(grid.width, grid.height);
  for (let radius = 0; radius <= maxRadius; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const candidateX = cx + dx;
        const candidateY = cy + dy;
        if (
          grid.isBlocked(candidateX, candidateY) ||
          reserved.has(grid.index(candidateX, candidateY))
        ) {
          continue;
        }
        return { cx: candidateX, cy: candidateY };
      }
    }
  }
  return null;
}

function pauseHarvest(world: World, entity: EntityId): void {
  const harvest = world.get(entity, Harvest);
  if (!harvest) return;
  harvest.phase = 'paused';
  harvest.node = -1;
  harvest.gatherLeft = 0;
}
