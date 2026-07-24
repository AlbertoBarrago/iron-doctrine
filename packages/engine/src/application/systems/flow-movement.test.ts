import { describe, expect, it } from 'vitest';
import { World } from '../ecs/world.js';
import { Facing, FlowMovement, Movement, Position } from '../../domain/components/index.js';
import { NavGrid } from '../pathfinding/nav-grid.js';
import { createFlowMovementSystem, FlowFieldCache } from './flow-movement.js';
import * as fp from '../../domain/math/fixed.js';
import { Random } from '../../domain/math/rng.js';
import { asTick } from '@iron/shared';

describe('FlowMovementSystem', () => {
  it.each([100, 250, 500])('shares one navigation field across %i units', (unitCount) => {
    const grid = new NavGrid(96, 96);
    const world = new World();
    const cache = new FlowFieldCache(grid);
    const system = createFlowMovementSystem(grid, cache);
    const goal = grid.cellToWorld(80, 80);

    for (let i = 0; i < unitCount; i++) {
      const entity = world.createEntity();
      const position = grid.cellToWorld(5 + (i % 20), 5 + Math.floor(i / 20));
      world.add(entity, Position, position);
      world.add(entity, Movement, { target: goal, speed: fp.fromInt(4) });
      world.add(entity, FlowMovement, { goal, finalTarget: goal });
      world.add(entity, Facing, { dir: { x: fp.FP.ONE, y: fp.FP.ZERO } });
    }

    system.update(world, {
      tick: asTick(0),
      dt: fp.fromFloat(1 / 20),
      rng: new Random(1),
    });

    expect(cache.buildCount).toBe(1);
    expect(
      world
        .query(Position)
        .some((entity) => world.get(entity, Position)!.x > grid.cellToWorld(5, 5).x),
    ).toBe(true);
  });

  it('invalidates cached fields when navigation topology changes', () => {
    const grid = new NavGrid(16, 16);
    const cache = new FlowFieldCache(grid);
    cache.get({ cx: 12, cy: 12 });
    grid.setBlocked(8, 8, true);
    cache.get({ cx: 12, cy: 12 });
    expect(cache.buildCount).toBe(2);
  });
});
