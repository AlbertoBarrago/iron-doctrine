import { describe, expect, it } from 'vitest';
import { Simulation } from '../../simulation.js';
import { loadSimulation, saveSimulation } from '../../persistence/save.js';
import { Health, Owner } from '../../../domain/components/index.js';
import * as fp from '../../../domain/math/fixed.js';

const at = (x: number, y: number) => ({ x: fp.fromInt(x), y: fp.fromInt(y) });

function activeSiege(): Simulation {
  const sim = new Simulation({
    seed: 7,
    matchPlayers: [0, 1],
    siegeLine: {
      hostilePlayer: 1,
      waveIntervalTicks: 4,
      waveCount: 1,
      spawnPoints: [at(20, 0)],
      targetAt: at(0, 0),
    },
  });
  sim.enqueue({ type: 'spawnBuilding', building: 'construction_yard', player: 0, at: at(-8, 0) });
  sim.enqueue({ type: 'spawnBuilding', building: 'construction_yard', player: 1, at: at(8, 0) });
  sim.step();
  return sim;
}

function destroyHostileCommand(sim: Simulation): void {
  for (const entity of sim.world.query(Health, Owner)) {
    if (sim.world.get(entity, Owner)!.player === 1) sim.world.get(entity, Health)!.hp = 0;
  }
}

describe('siege line scenario', () => {
  it('dispatches an escalating wave every interval and orders it toward the held position', () => {
    const sim = new Simulation({
      seed: 7,
      siegeLine: {
        hostilePlayer: 1,
        waveIntervalTicks: 3,
        waveCount: 2,
        spawnPoints: [at(20, 0)],
        targetAt: at(0, 0),
      },
    });

    // Wave 0 is due once tick reaches 3 (the 4th step).
    for (let i = 0; i < 4; i++) sim.step();
    expect(sim.snapshot().scenario).toMatchObject({ phase: 'holding' });
    let hostiles = sim
      .snapshot()
      .entities.filter((entity) => entity.owner === 1 && entity.unitType);
    expect(hostiles).toHaveLength(2);

    // Wave 1 is due once tick reaches 6 (three more steps).
    for (let i = 0; i < 3; i++) sim.step();
    expect(sim.snapshot().scenario).toMatchObject({ phase: 'counter-attack' });
    hostiles = sim.snapshot().entities.filter((entity) => entity.owner === 1 && entity.unitType);
    expect(hostiles).toHaveLength(5);
  });

  it('stops dispatching once every wave has been sent', () => {
    const sim = new Simulation({
      seed: 7,
      siegeLine: {
        hostilePlayer: 1,
        waveIntervalTicks: 2,
        waveCount: 1,
        spawnPoints: [at(20, 0)],
        targetAt: at(0, 0),
      },
    });
    for (let i = 0; i < 10; i++) sim.step();
    const hostiles = sim
      .snapshot()
      .entities.filter((entity) => entity.owner === 1 && entity.unitType);
    expect(hostiles).toHaveLength(2);
    expect(sim.snapshot().scenario?.phase).toBe('counter-attack');
  });

  it('preserves wave progress across save and load', () => {
    const sim = new Simulation({
      seed: 7,
      siegeLine: {
        hostilePlayer: 1,
        waveIntervalTicks: 3,
        waveCount: 3,
        spawnPoints: [at(20, 0)],
        targetAt: at(0, 0),
      },
    });
    for (let i = 0; i < 4; i++) sim.step();

    const loaded = loadSimulation(saveSimulation(sim, 7));
    expect(loaded.snapshot().scenario).toMatchObject({
      phase: 'holding',
      objective: expect.stringContaining('2 assault waves'),
    });
  });

  it('does not award an early victory when the hostile command is rushed', () => {
    const sim = activeSiege();
    destroyHostileCommand(sim);
    sim.step();

    expect(sim.snapshot().scenario).toMatchObject({
      phase: 'holding',
      objective: expect.stringContaining('before counter-attacking'),
    });
    expect(sim.snapshot().match).toEqual({ status: 'playing', winner: null });

    while (sim.snapshot().scenario?.phase === 'holding') sim.step();
    expect(sim.snapshot().match).toEqual({ status: 'finished', winner: 0 });
  });

  it('preserves the early-victory gate across save and load', () => {
    const sim = activeSiege();
    destroyHostileCommand(sim);
    sim.step();

    const loaded = loadSimulation(saveSimulation(sim, 7));
    expect(loaded.snapshot().match).toEqual({ status: 'playing', winner: null });
    loaded.step();
    expect(loaded.snapshot().match).toEqual({ status: 'playing', winner: null });
  });
});
