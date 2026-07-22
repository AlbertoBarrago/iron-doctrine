import { describe, it, expect } from 'vitest';
import { Simulation } from './simulation.js';
import { Position, Movement } from '../domain/components/index.js';
import * as fp from '../domain/math/fixed.js';
import type { EntityId } from '@iron/shared';

const at = (x: number, y: number) => ({ x: fp.fromInt(x), y: fp.fromInt(y) });

function spawnAndReturnId(sim: Simulation, unit: string, x: number, y: number): EntityId {
  sim.enqueue({ type: 'spawnUnit', unit, player: 0, at: at(x, y) });
  sim.step();
  // The just-spawned entity is the only one with Position on first spawn.
  const ids = sim.world.query(Position);
  return ids[ids.length - 1]!;
}

describe('Simulation', () => {
  it('spawns a unit via command', () => {
    const sim = new Simulation({ seed: 1 });
    const e = spawnAndReturnId(sim, 'rifleman', 0, 0);
    expect(sim.world.isAlive(e)).toBe(true);
    expect(sim.world.get(e, Movement)).toBeTruthy();
  });

  it('moves a unit toward its target and arrives', () => {
    const sim = new Simulation({ seed: 1 });
    const e = spawnAndReturnId(sim, 'tank', 0, 0); // speed 3 u/s
    sim.enqueue({ type: 'move', entities: [e], target: at(10, 0) });

    // 3 u/s at 20Hz => 0.15 u/tick; ~67 ticks to cover 10 units.
    for (let i = 0; i < 80; i++) sim.step();

    const pos = sim.world.get(e, Position)!;
    expect(fp.toFloat(pos.x)).toBeCloseTo(10, 2);
    expect(sim.world.get(e, Movement)!.target).toBeNull(); // order cleared on arrival
  });

  it('stop command clears the movement target', () => {
    const sim = new Simulation({ seed: 1 });
    const e = spawnAndReturnId(sim, 'rifleman', 0, 0);
    sim.enqueue({ type: 'move', entities: [e], target: at(50, 50) });
    sim.step();
    expect(sim.world.get(e, Movement)!.target).not.toBeNull();
    sim.enqueue({ type: 'stop', entities: [e] });
    sim.step();
    expect(sim.world.get(e, Movement)!.target).toBeNull();
  });
});

describe('Determinism (core CI gate)', () => {
  const scenario = (sim: Simulation): void => {
    sim.enqueue({ type: 'spawnUnit', unit: 'rifleman', player: 0, at: at(0, 0) });
    sim.enqueue({ type: 'spawnUnit', unit: 'tank', player: 1, at: at(5, 5) });
    sim.step();
    const ids = sim.world.query(Position);
    sim.enqueue({ type: 'move', entities: [ids[0]!], target: at(20, 7) });
    sim.enqueue({ type: 'move', entities: [ids[1]!], target: at(-3, 12) });
  };

  it('two independent runs with same seed + commands produce identical hashes every tick', () => {
    const a = new Simulation({ seed: 987654321 });
    const b = new Simulation({ seed: 987654321 });
    scenario(a);
    scenario(b);

    for (let i = 0; i < 200; i++) {
      a.step();
      b.step();
      expect(a.hash()).toBe(b.hash());
    }
    expect(a.tick).toBe(b.tick);
  });

  it('different seeds do not affect deterministic movement outcome (no RNG in movement)', () => {
    const a = new Simulation({ seed: 1 });
    const b = new Simulation({ seed: 2 });
    scenario(a);
    scenario(b);
    for (let i = 0; i < 200; i++) {
      a.step();
      b.step();
    }
    // Movement is RNG-free, so final positions must match regardless of seed.
    expect(a.hash()).toBe(b.hash());
  });
});
