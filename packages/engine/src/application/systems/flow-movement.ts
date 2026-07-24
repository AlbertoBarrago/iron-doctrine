import type { System, TickContext } from '../ecs/system.js';
import type { World } from '../ecs/world.js';
import { Facing, FlowMovement, Movement, Path, Position } from '../../domain/components/index.js';
import { FlowField } from '../pathfinding/flow-field.js';
import type { Cell, NavGrid } from '../pathfinding/nav-grid.js';
import * as fp from '../../domain/math/fixed.js';
import * as v2 from '../../domain/math/vec2.js';

const FINAL_APPROACH_DISTANCE_SQ = fp.fromInt(25);

/** Builds at most one field per destination and grid revision. */
export class FlowFieldCache {
  private readonly fields = new Map<string, FlowField>();
  private cachedRevision = -1;
  buildCount = 0;

  constructor(private readonly grid: NavGrid) {}

  get(goal: Cell): FlowField {
    if (this.cachedRevision !== this.grid.revision) {
      this.fields.clear();
      this.cachedRevision = this.grid.revision;
    }
    const key = `${goal.cx}:${goal.cy}`;
    let field = this.fields.get(key);
    if (!field) {
      field = new FlowField(this.grid, goal);
      this.fields.set(key, field);
      this.buildCount++;
    }
    return field;
  }
}

export function createFlowMovementSystem(grid: NavGrid, cache = new FlowFieldCache(grid)): System {
  return {
    name: 'FlowMovementSystem',
    update(world: World, ctx: TickContext): void {
      for (const entity of world.query(Position, Movement, FlowMovement)) {
        const position = world.get(entity, Position)!;
        const movement = world.get(entity, Movement)!;
        const flowMovement = world.get(entity, FlowMovement)!;

        if (
          movement.target === null ||
          v2.distSq(position, flowMovement.goal) <= FINAL_APPROACH_DISTANCE_SQ
        ) {
          beginFinalApproach(world, entity);
          continue;
        }

        const rawGoal = grid.worldToCell(flowMovement.goal.x, flowMovement.goal.y);
        const goal = grid.nearestOpen(rawGoal.cx, rawGoal.cy, Math.max(grid.width, grid.height));
        if (!goal) {
          movement.target = null;
          world.remove(entity, FlowMovement);
          continue;
        }
        const direction = cache.get(goal).sampleAt(position.x, position.y);
        if (direction.x === fp.FP.ZERO && direction.y === fp.FP.ZERO) {
          beginFinalApproach(world, entity);
          continue;
        }

        const step = fp.mul(movement.speed, ctx.dt);
        world.add(entity, Position, v2.add(position, v2.scale(direction, step)));
        if (world.has(entity, Facing)) world.add(entity, Facing, { dir: direction });
      }
    },
  };
}

function beginFinalApproach(world: World, entity: Parameters<World['remove']>[0]): void {
  const flowMovement = world.get(entity, FlowMovement);
  const movement = world.get(entity, Movement);
  if (!flowMovement || !movement) return;
  movement.target = { ...flowMovement.finalTarget };
  world.remove(entity, FlowMovement);
  if (world.has(entity, Path)) world.remove(entity, Path);
}
