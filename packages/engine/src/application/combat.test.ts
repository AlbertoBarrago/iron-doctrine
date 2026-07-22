import { describe, it, expect } from 'vitest';
import { Simulation } from './simulation.js';
import { Position, Health, Attack, Projectile } from '../domain/components/index.js';
import * as fp from '../domain/math/fixed.js';
import type { EntityId } from '@iron/shared';

const at = (x: number, y: number) => ({ x: fp.fromInt(x), y: fp.fromInt(y) });

function spawn(sim: Simulation, unit: string, player: number, x: number, y: number): EntityId {
  const before = new Set<number>(sim.world.query(Position));
  sim.enqueue({ type: 'spawnUnit', unit, player, at: at(x, y) });
  sim.step();
  // The new unit is the freshly-added entity that carries Health (projectiles don't).
  const added = sim.world.query(Position, Health).filter((e) => !before.has(e));
  return added[added.length - 1]!;
}

describe('Combat', () => {
  it('a rifleman auto-acquires and kills an adjacent enemy (hitscan)', () => {
    const sim = new Simulation({ seed: 1 });
    spawn(sim, 'rifleman', 0, 0, 0); // damage 8, range 6, instant
    const enemy = spawn(sim, 'engineer', 1, 3, 0); // 60 hp, unarmed
    expect(sim.world.get(enemy, Health)!.max).toBe(60);

    let killed = false;
    for (let i = 0; i < 200; i++) {
      sim.step();
      if (!sim.world.isAlive(enemy)) {
        killed = true;
        break;
      }
    }
    expect(killed).toBe(true);
  });

  it('does not target friendlies', () => {
    const sim = new Simulation({ seed: 1 });
    spawn(sim, 'rifleman', 0, 0, 0);
    const friend = spawn(sim, 'engineer', 0, 2, 0); // same owner
    for (let i = 0; i < 100; i++) sim.step();
    expect(sim.world.isAlive(friend)).toBe(true);
    expect(sim.world.get(friend, Health)!.hp).toBe(60);
  });

  it('a tank fires travelling projectiles that damage the target', () => {
    const sim = new Simulation({ seed: 1 });
    spawn(sim, 'tank', 0, 0, 0); // projectileSpeed 14, damage 30
    const enemy = spawn(sim, 'tank', 1, 5, 0);
    const startHp = sim.world.get(enemy, Health)!.hp;

    let sawProjectile = false;
    for (let i = 0; i < 60; i++) {
      sim.step();
      if (sim.world.query(Projectile).length > 0) sawProjectile = true;
      if (!sim.world.isAlive(enemy) || sim.world.get(enemy, Health)!.hp < startHp) break;
    }
    expect(sawProjectile).toBe(true);
    // Target eventually takes damage (may already be dead if enough shots landed).
    const alive = sim.world.isAlive(enemy);
    if (alive) expect(sim.world.get(enemy, Health)!.hp).toBeLessThan(startHp);
  });

  it('explicit attack command sets the target', () => {
    const sim = new Simulation({ seed: 1 });
    const shooter = spawn(sim, 'rifleman', 0, 0, 0);
    const enemy = spawn(sim, 'tank', 1, 20, 0); // out of range initially
    sim.enqueue({ type: 'attack', entities: [shooter], target: enemy });
    sim.step();
    expect(sim.world.get(shooter, Attack)!.target).toBe(enemy);
  });

  it('combat remains deterministic across runs', () => {
    const build = () => {
      const s = new Simulation({ seed: 777 });
      s.enqueue({ type: 'spawnUnit', unit: 'tank', player: 0, at: at(0, 0) });
      s.enqueue({ type: 'spawnUnit', unit: 'rifleman', player: 1, at: at(4, 1) });
      s.enqueue({ type: 'spawnUnit', unit: 'rifleman', player: 0, at: at(-2, 2) });
      s.enqueue({ type: 'spawnUnit', unit: 'tank', player: 1, at: at(5, 5) });
      return s;
    };
    const a = build();
    const b = build();
    for (let i = 0; i < 400; i++) {
      a.step();
      b.step();
      expect(a.hash()).toBe(b.hash());
    }
  });
});
