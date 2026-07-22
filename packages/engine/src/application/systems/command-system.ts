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
import { Movement, Attack, Harvest, Production, Owner } from '../../domain/components/index.js';
import { spawnUnit, UNIT_STATS } from '../../domain/archetypes/units.js';
import { spawnBuilding } from '../../domain/archetypes/buildings.js';
import { spawnResourceNode } from '../../domain/archetypes/resources.js';
import { TECH_TREE, type TechState } from '../../domain/tech/tech-tree.js';
import { computeFormationSlots } from '../../domain/movement/formation.js';
import { indexOf } from '../ecs/entity.js';

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
            // Multiple units spread into a formation so they don't stack on one cell.
            const movers = [...cmd.entities].sort((a, b) => indexOf(a) - indexOf(b));
            const slots = computeFormationSlots(movers.length, cmd.target, 2);
            movers.forEach((e, i) => {
              const move = world.get(e, Movement);
              if (move) {
                const slot = slots[i] ?? cmd.target;
                move.target = { x: slot.x, y: slot.y };
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
              const move = world.get(e, Movement);
              if (move) move.target = null;
              const atk = world.get(e, Attack);
              if (atk) atk.target = -1;
            }
            break;
          case 'attack':
            for (const e of cmd.entities) {
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
                h.phase = 'idle'; // re-enter the harvest loop, picking nearest ore
                h.node = -1;
              }
            }
            break;
          case 'spawnUnit':
            spawnUnit(world, cmd.unit, cmd.player, cmd.at);
            break;
          case 'spawnBuilding':
            spawnBuilding(world, grid, cmd.building, cmd.player, cmd.at);
            break;
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
