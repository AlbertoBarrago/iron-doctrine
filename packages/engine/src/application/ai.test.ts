import { describe, it, expect } from 'vitest';
import { Simulation } from './simulation.js';
import { NavGrid } from './pathfinding/nav-grid.js';
import {
  Position,
  Owner,
  Building,
  Weapon,
  Harvest,
  Production,
} from '../domain/components/index.js';
import * as fp from '../domain/math/fixed.js';

const at = (x: number, y: number) => ({ x: fp.fromInt(x), y: fp.fromInt(y) });

function countOwned(sim: Simulation, player: number, pred: (e: number) => boolean): number {
  return sim.world
    .query(Owner, Position)
    .filter((e) => sim.world.get(e, Owner)!.player === player && pred(e)).length;
}

function deployAiBase(sim: Simulation, x = 10, y = 10): void {
  sim.enqueue({ type: 'spawnBuilding', building: 'construction_yard', player: 1, at: at(x, y) });
  sim.enqueue({ type: 'spawnBuilding', building: 'barracks', player: 1, at: at(x - 5, y) });
  sim.enqueue({ type: 'spawnBuilding', building: 'factory', player: 1, at: at(x, y - 5) });
  sim.step();
}

describe('AIDirector', () => {
  function makeSim() {
    const grid = new NavGrid(96, 96, fp.fromInt(1));
    return new Simulation({
      seed: 1,
      grid,
      aiPlayers: [{ player: 1, difficulty: 'hard' }],
      startingCredits: { 1: 5000 },
      startingTech: { 1: ['armor_doctrine'] },
    });
  }

  it('produces a harvester and combat units from starting credits', () => {
    const sim = makeSim();
    deployAiBase(sim);

    for (let i = 0; i < 300; i++) sim.step();

    const harvesters = countOwned(sim, 1, (e) => sim.world.has(e, Harvest));
    const combat = countOwned(
      sim,
      1,
      (e) => sim.world.has(e, Weapon) && !sim.world.has(e, Building),
    );
    expect(harvesters).toBeGreaterThanOrEqual(1);
    expect(combat).toBeGreaterThanOrEqual(1);
  });

  it('spends credits down as it produces', () => {
    const sim = makeSim();
    deployAiBase(sim);
    const start = sim.economy.credits(1);
    for (let i = 0; i < 300; i++) sim.step();
    expect(sim.economy.credits(1)).toBeLessThan(start);
  });

  it('uses a compatible facility queue instead of spawning directly', () => {
    const sim = makeSim();
    deployAiBase(sim);

    sim.step();

    const factory = sim.world
      .query(Production, Owner)
      .find((entity) => sim.world.get(entity, Production)!.produces.includes('harvester'))!;
    expect(sim.world.get(factory, Production)!.queue).toEqual(['harvester']);
    expect(countOwned(sim, 1, (entity) => sim.world.has(entity, Harvest))).toBe(0);
  });

  it('does not produce without a compatible facility', () => {
    const sim = makeSim();
    sim.enqueue({
      type: 'spawnBuilding',
      building: 'construction_yard',
      player: 1,
      at: at(10, 10),
    });
    sim.step();
    const credits = sim.economy.credits(1);

    for (let i = 0; i < 300; i++) sim.step();

    expect(sim.economy.credits(1)).toBe(credits);
    expect(countOwned(sim, 1, (entity) => !sim.world.has(entity, Building))).toBe(0);
  });

  it('respects build time and the difficulty army cap', () => {
    const sim = new Simulation({
      seed: 1,
      aiPlayers: [{ player: 1, difficulty: 'easy' }],
      startingCredits: { 1: 20_000 },
      startingTech: { 1: ['armor_doctrine'] },
    });
    deployAiBase(sim);

    for (let i = 0; i < 139; i++) sim.step();
    expect(countOwned(sim, 1, (entity) => sim.world.has(entity, Weapon))).toBe(0);
    sim.step();
    expect(countOwned(sim, 1, (entity) => sim.world.has(entity, Weapon))).toBe(1);

    for (let i = 0; i < 2_000; i++) sim.step();
    expect(countOwned(sim, 1, (entity) => sim.world.has(entity, Weapon))).toBeLessThanOrEqual(6);
  });

  it('does not activate before the configured tick', () => {
    const sim = new Simulation({
      seed: 1,
      aiPlayers: [{ player: 1, difficulty: 'easy', activationTick: 120 }],
      startingCredits: { 1: 5000 },
      startingTech: { 1: ['armor_doctrine'] },
    });
    deployAiBase(sim);
    for (let i = 1; i < 120; i++) sim.step();

    expect(countOwned(sim, 1, (entity) => !sim.world.has(entity, Building))).toBe(0);
    sim.step();
    expect(
      sim.world
        .query(Production)
        .every((entity) => sim.world.get(entity, Production)!.queue.length === 0),
    ).toBe(true);
    sim.step();
    expect(
      sim.world
        .query(Production)
        .some((entity) => sim.world.get(entity, Production)!.queue.length > 0),
    ).toBe(true);
  });

  it('starts its activation delay only after First Contact recovery', () => {
    const sim = new Simulation({
      seed: 1,
      aiPlayers: [{ player: 1, difficulty: 'hard', activationTick: 20 }],
      startingCredits: { 1: 5000 },
      firstContact: {
        player: 0,
        recoveryAt: at(20, 0),
        recoveryTicks: 1,
        recoveredCredits: 2000,
      },
      startingTech: { 1: ['armor_doctrine'] },
    });
    sim.enqueue({ type: 'spawnUnit', unit: 'tank', player: 0, at: at(0, 0) });
    deployAiBase(sim, 30, 0);
    for (let i = 0; i < 100; i++) sim.step();
    expect(countOwned(sim, 1, (entity) => !sim.world.has(entity, Building))).toBe(0);

    sim.enqueue({ type: 'spawnUnit', unit: 'rifleman', player: 0, at: at(20, 0) });
    sim.step();
    sim.step();
    const creditsAtRecovery = sim.economy.credits(1);
    for (let i = 0; i < 19; i++) sim.step();
    expect(sim.economy.credits(1)).toBe(creditsAtRecovery);

    for (let i = 0; i < 21; i++) sim.step();
    expect(sim.economy.credits(1)).toBeLessThan(creditsAtRecovery);
  });

  it('sends its army to attack the human player', () => {
    const sim = makeSim();
    deployAiBase(sim, 20, 0);
    // Human target near the origin.
    sim.enqueue({ type: 'spawnBuilding', building: 'refinery', player: 0, at: at(-20, 0) });

    // Run until the AI has an army and has issued attacks; the human building should
    // eventually take damage or be destroyed.
    let humanHarmed = false;
    for (let i = 0; i < 4000; i++) {
      sim.step();
      const buildings = sim.world
        .query(Building, Owner)
        .filter((e) => sim.world.get(e, Owner)!.player === 0);
      if (buildings.length === 0) {
        humanHarmed = true;
        break;
      }
    }
    expect(humanHarmed).toBe(true);
  });

  it('is deterministic (identical hashes across runs)', () => {
    const build = () => {
      const grid = new NavGrid(96, 96, fp.fromInt(1));
      const s = new Simulation({
        seed: 42,
        grid,
        aiPlayers: [{ player: 1, difficulty: 'normal' }],
        startingCredits: { 1: 3000 },
        startingTech: { 1: ['armor_doctrine'] },
      });
      deployAiBase(s);
      s.enqueue({ type: 'spawnResource', amount: 5000, at: at(14, 10) });
      return s;
    };
    const a = build();
    const b = build();
    for (let i = 0; i < 800; i++) {
      a.step();
      b.step();
      expect(a.hash()).toBe(b.hash());
    }
  });
});
