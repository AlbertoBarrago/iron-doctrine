import { describe, expect, it } from 'vitest';
import { Health, Owner } from '../../domain/components/index.js';
import * as fp from '../../domain/math/fixed.js';
import { loadSimulation, saveSimulation } from '../persistence/save.js';
import { Simulation } from '../simulation.js';

const at = (x: number, y: number) => ({ x: fp.fromInt(x), y: fp.fromInt(y) });

function activeMatch(): Simulation {
  const sim = new Simulation({ seed: 7, matchPlayers: [0, 1] });
  sim.enqueue({ type: 'spawnBuilding', building: 'construction_yard', player: 0, at: at(-8, 0) });
  sim.enqueue({ type: 'spawnBuilding', building: 'construction_yard', player: 1, at: at(8, 0) });
  sim.step();
  return sim;
}

function destroyObjectives(sim: Simulation, players: number[]): void {
  for (const entity of sim.world.query(Health, Owner)) {
    const owner = sim.world.get(entity, Owner)!;
    if (players.includes(owner.player)) sim.world.get(entity, Health)!.hp = 0;
  }
}

describe('MatchState', () => {
  it('waits for every player objective before starting', () => {
    const sim = new Simulation({ seed: 7, matchPlayers: [0, 1] });
    sim.enqueue({ type: 'spawnBuilding', building: 'construction_yard', player: 0, at: at(0, 0) });
    sim.step();
    expect(sim.snapshot().match).toEqual({ status: 'setup', winner: null });

    sim.enqueue({ type: 'spawnBuilding', building: 'construction_yard', player: 1, at: at(8, 0) });
    sim.step();
    expect(sim.snapshot().match).toEqual({ status: 'playing', winner: null });
  });

  it('declares the surviving player and freezes the simulation', () => {
    const sim = activeMatch();
    destroyObjectives(sim, [1]);
    sim.step();
    expect(sim.snapshot().match).toEqual({ status: 'finished', winner: 0 });

    const finishedTick = sim.tick;
    sim.enqueue({ type: 'spawnUnit', unit: 'tank', player: 0, at: at(0, 0) });
    sim.step();
    expect(sim.tick).toBe(finishedTick);
  });

  it('declares a draw when all objectives fall on the same tick', () => {
    const sim = activeMatch();
    destroyObjectives(sim, [0, 1]);
    sim.step();
    expect(sim.snapshot().match).toEqual({ status: 'finished', winner: null });
  });

  it('round-trips lifecycle state through save and load', () => {
    const sim = activeMatch();
    destroyObjectives(sim, [1]);
    sim.step();

    const loaded = loadSimulation(saveSimulation(sim, 7));
    expect(loaded.match?.players).toEqual([0, 1]);
    expect(loaded.snapshot().match).toEqual({ status: 'finished', winner: 0 });
  });
});
