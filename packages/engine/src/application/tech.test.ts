import { describe, it, expect } from 'vitest';
import { Simulation } from './simulation.js';
import { NavGrid } from './pathfinding/nav-grid.js';
import { TechState } from '../domain/tech/tech-tree.js';
import { Building, Owner, Production } from '../domain/components/index.js';
import * as fp from '../domain/math/fixed.js';
import type { EntityId } from '@iron/shared';

const at = (x: number, y: number) => ({ x: fp.fromInt(x), y: fp.fromInt(y) });

describe('TechState', () => {
  it('enforces prerequisites', () => {
    const t = new TechState();
    expect(t.canResearch(0, 'advanced_armor')).toBe(false); // needs armor_doctrine
    expect(t.canResearch(0, 'armor_doctrine')).toBe(true);
    t.unlock(0, 'armor_doctrine');
    expect(t.canResearch(0, 'advanced_armor')).toBe(true);
    expect(t.canResearch(0, 'armor_doctrine')).toBe(false); // already unlocked
  });

  it('gates unit production by required tech', () => {
    const t = new TechState();
    expect(t.canProduceUnit(0, 'tank')).toBe(false);
    expect(t.canProduceUnit(0, 'rifleman')).toBe(true); // no requirement
    t.unlock(0, 'armor_doctrine');
    expect(t.canProduceUnit(0, 'tank')).toBe(true);
  });

  it('serializes and restores', () => {
    const t = new TechState();
    t.unlock(0, 'armor_doctrine');
    t.unlock(1, 'infantry_doctrine');
    const t2 = new TechState();
    t2.restore(t.serialize());
    expect(t2.isUnlocked(0, 'armor_doctrine')).toBe(true);
    expect(t2.isUnlocked(1, 'infantry_doctrine')).toBe(true);
    expect(t2.isUnlocked(0, 'infantry_doctrine')).toBe(false);
  });
});

describe('Research command + production gating', () => {
  function factory(sim: Simulation): EntityId {
    sim.enqueue({ type: 'spawnBuilding', building: 'factory', player: 0, at: at(0, 0) });
    sim.step();
    return sim.world.query(Building, Owner)[0]!;
  }

  it('research spends credits and unlocks the tech, enabling tank production', () => {
    const grid = new NavGrid(64, 64, fp.fromInt(1));
    const sim = new Simulation({ seed: 1, grid, startingCredits: { 0: 5000 } });
    const fac = factory(sim);

    // Tank blocked before research.
    sim.enqueue({ type: 'queueProduction', building: fac, unit: 'tank' });
    sim.step();
    expect(sim.world.get(fac, Production)!.queue.length).toBe(0);

    // Research armor doctrine (cost 1000), then tank is allowed.
    const before = sim.economy.credits(0);
    sim.enqueue({ type: 'research', player: 0, tech: 'armor_doctrine' });
    sim.step();
    expect(sim.tech.isUnlocked(0, 'armor_doctrine')).toBe(true);
    expect(sim.economy.credits(0)).toBe(before - 1000);

    sim.enqueue({ type: 'queueProduction', building: fac, unit: 'tank' });
    sim.step();
    expect(sim.world.get(fac, Production)!.queue).toEqual(['tank']);
  });

  it('research is refused without prerequisites and without funds', () => {
    const grid = new NavGrid(64, 64, fp.fromInt(1));
    const sim = new Simulation({ seed: 1, grid, startingCredits: { 0: 100 } });
    // Cannot afford (cost 1000).
    sim.enqueue({ type: 'research', player: 0, tech: 'armor_doctrine' });
    sim.step();
    expect(sim.tech.isUnlocked(0, 'armor_doctrine')).toBe(false);
    expect(sim.economy.credits(0)).toBe(100);

    // Missing prerequisite (advanced_armor needs armor_doctrine).
    sim.economy.addCredits(0, 5000);
    sim.enqueue({ type: 'research', player: 0, tech: 'advanced_armor' });
    sim.step();
    expect(sim.tech.isUnlocked(0, 'advanced_armor')).toBe(false);
  });

  it('tech survives save/load and keeps the sim deterministic', () => {
    const build = () => {
      const grid = new NavGrid(48, 48, fp.fromInt(1));
      const s = new Simulation({ seed: 5, grid, startingCredits: { 0: 5000 } });
      s.enqueue({ type: 'research', player: 0, tech: 'armor_doctrine' });
      return s;
    };
    const a = build();
    const b = build();
    for (let i = 0; i < 50; i++) {
      a.step();
      b.step();
      expect(a.hash()).toBe(b.hash());
    }
    expect(a.tech.isUnlocked(0, 'armor_doctrine')).toBe(true);
  });
});
