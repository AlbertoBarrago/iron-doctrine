import { describe, expect, it } from 'vitest';
import { components, fp } from '@iron/engine';
import { createSimulationFromInit } from '../createSimulation.js';

const at = (x: number, y: number) => ({ x: fp.fromInt(x), y: fp.fromInt(y) });

describe('Worker simulation boundary', () => {
  it('forwards the Iron Pass ambush configuration', () => {
    const sim = createSimulationFromInit({
      seed: 1,
      ironPass: {
        player: 0,
        ambushPlayer: 1,
        triggerAt: at(0, 0),
        ambushSpawns: [at(8, 0)],
      },
    });
    sim.enqueue({ type: 'spawnUnit', unit: 'rifleman', player: 0, at: at(0, 0) });
    sim.step();

    expect(sim.snapshot().scenario).toMatchObject({ phase: 'ambush' });
  });

  it('forwards the Siege Line wave configuration', () => {
    const sim = createSimulationFromInit({
      seed: 1,
      siegeLine: {
        hostilePlayer: 1,
        waveIntervalTicks: 1,
        waveCount: 1,
        spawnPoints: [at(8, 0)],
        targetAt: at(0, 0),
      },
    });
    sim.step();
    sim.step();

    expect(sim.snapshot().scenario).toMatchObject({ phase: 'counter-attack' });
  });

  it('forwards the Black Dawn last-stand configuration', () => {
    const sim = createSimulationFromInit({
      seed: 1,
      blackDawn: {
        hostilePlayer: 1,
        healthThreshold: 0.3,
      },
    });
    sim.enqueue({
      type: 'spawnBuilding',
      building: 'construction_yard',
      player: 1,
      at: at(0, 0),
    });
    sim.step();
    const command = sim.world.query(components.Health)[0]!;
    sim.world.get(command, components.Health)!.hp = 400;
    sim.step();

    expect(sim.snapshot().scenario).toMatchObject({ phase: 'last-stand' });
  });
});
