import { describe, it, expect } from 'vitest';
import { Simulation } from './simulation.js';
import { NavGrid } from './pathfinding/nav-grid.js';
import { Position, Owner, Building, Weapon, Harvest } from '../domain/components/index.js';
import * as fp from '../domain/math/fixed.js';

const at = (x: number, y: number) => ({ x: fp.fromInt(x), y: fp.fromInt(y) });

function countOwned(sim: Simulation, player: number, pred: (e: number) => boolean): number {
  return sim.world
    .query(Owner, Position)
    .filter((e) => sim.world.get(e, Owner)!.player === player && pred(e)).length;
}

describe('AIDirector', () => {
  function makeSim() {
    const grid = new NavGrid(96, 96, fp.fromInt(1));
    return new Simulation({
      seed: 1,
      grid,
      aiPlayers: [{ player: 1, difficulty: 'hard' }],
      startingCredits: { 1: 5000 },
    });
  }

  it('produces a harvester and combat units from starting credits', () => {
    const sim = makeSim();
    // Give the AI a base to anchor production.
    sim.enqueue({
      type: 'spawnBuilding',
      building: 'construction_yard',
      player: 1,
      at: at(10, 10),
    });
    sim.step();

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
    sim.enqueue({
      type: 'spawnBuilding',
      building: 'construction_yard',
      player: 1,
      at: at(10, 10),
    });
    sim.step();
    const start = sim.economy.credits(1);
    for (let i = 0; i < 300; i++) sim.step();
    expect(sim.economy.credits(1)).toBeLessThan(start);
  });

  it('does not activate before the configured tick', () => {
    const sim = new Simulation({
      seed: 1,
      aiPlayers: [{ player: 1, difficulty: 'easy', activationTick: 120 }],
      startingCredits: { 1: 5000 },
    });
    sim.enqueue({
      type: 'spawnBuilding',
      building: 'construction_yard',
      player: 1,
      at: at(10, 10),
    });
    for (let i = 0; i < 120; i++) sim.step();

    expect(countOwned(sim, 1, (entity) => !sim.world.has(entity, Building))).toBe(0);
    sim.step();
    expect(countOwned(sim, 1, (entity) => !sim.world.has(entity, Building))).toBe(1);
  });

  it('sends its army to attack the human player', () => {
    const sim = makeSim();
    sim.enqueue({ type: 'spawnBuilding', building: 'construction_yard', player: 1, at: at(20, 0) });
    // Human target near the origin.
    sim.enqueue({ type: 'spawnBuilding', building: 'refinery', player: 0, at: at(-20, 0) });
    sim.step();

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
      });
      s.enqueue({
        type: 'spawnBuilding',
        building: 'construction_yard',
        player: 1,
        at: at(10, 10),
      });
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
