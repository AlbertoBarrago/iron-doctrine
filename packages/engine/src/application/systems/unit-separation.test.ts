import { describe, expect, it } from 'vitest';
import { World } from '../ecs/world.js';
import { Position, Selectable, UnitType } from '../../domain/components/index.js';
import * as fp from '../../domain/math/fixed.js';
import { UnitSeparationSystem } from './unit-separation.js';
import { Random } from '../../domain/math/rng.js';
import { asTick } from '@iron/shared';

function unit(world: World, x: number): void {
  const entity = world.createEntity();
  world.add(entity, Position, { x: fp.fromFloat(x), y: fp.FP.ZERO });
  world.add(entity, Selectable, { radius: fp.fromFloat(0.5) });
  world.add(entity, UnitType, { kind: 'rifleman' });
}

describe('UnitSeparationSystem', () => {
  it('separates overlapping units symmetrically', () => {
    const world = new World();
    unit(world, 0);
    unit(world, 0.2);

    UnitSeparationSystem.update(world, {
      tick: asTick(0),
      dt: fp.fromFloat(1 / 20),
      rng: new Random(1),
    });

    const [left, right] = world.query(Position);
    const leftPosition = world.get(left!, Position)!;
    const rightPosition = world.get(right!, Position)!;
    expect(fp.toFloat(fp.sub(rightPosition.x, leftPosition.x))).toBeCloseTo(1, 3);
    expect(fp.add(leftPosition.x, rightPosition.x)).toBe(fp.fromFloat(0.2));
  });

  it('uses entity order to resolve exact overlaps deterministically', () => {
    const world = new World();
    unit(world, 0);
    unit(world, 0);

    UnitSeparationSystem.update(world, {
      tick: asTick(0),
      dt: fp.fromFloat(1 / 20),
      rng: new Random(99),
    });

    const positions = world.query(Position).map((entity) => world.get(entity, Position)!.x);
    expect(positions).toEqual([fp.fromFloat(-0.5), fp.fromFloat(0.5)]);
  });
});
