import { describe, it, expect } from 'vitest';
import { Scheduler } from './scheduler.js';
import { World } from './world.js';
import type { System, TickContext } from './system.js';
import { Random } from '../../domain/math/rng.js';
import * as fp from '../../domain/math/fixed.js';
import { asTick } from '@iron/shared';

const ctx = (): TickContext => ({ tick: asTick(0), dt: fp.FP.HALF, rng: new Random(1) });

describe('Scheduler', () => {
  it('runs systems in registration order', () => {
    const calls: string[] = [];
    const make = (name: string): System => ({ name, update: () => calls.push(name) });
    const s = new Scheduler();
    s.add(make('a')).add(make('b')).add(make('c'));
    s.tick(new World(), ctx());
    expect(calls).toEqual(['a', 'b', 'c']);
    expect(s.order.map((x) => x.name)).toEqual(['a', 'b', 'c']);
  });

  it('passes the same world and context to each system', () => {
    const w = new World();
    const c = ctx();
    let seenWorld: World | undefined;
    let seenTick = -1;
    const sys: System = {
      name: 'probe',
      update: (world, context) => {
        seenWorld = world;
        seenTick = context.tick;
      },
    };
    new Scheduler().add(sys).tick(w, c);
    expect(seenWorld).toBe(w);
    expect(seenTick).toBe(c.tick);
  });
});
