import { describe, expect, it } from 'vitest';
import { Simulation } from '../simulation.js';
import { loadSimulation, saveSimulation } from '../persistence/save.js';
import * as fp from '../../domain/math/fixed.js';

const at = (x: number, y: number) => ({ x: fp.fromInt(x), y: fp.fromInt(y) });

describe('iron pass scenario', () => {
  it('springs an armored ambush once the player crosses the pass', () => {
    const sim = new Simulation({
      seed: 7,
      ironPass: {
        player: 0,
        ambushPlayer: 1,
        triggerAt: at(8, 0),
        ambushSpawns: [at(10, 2), at(10, -2)],
      },
    });
    sim.enqueue({ type: 'spawnUnit', unit: 'tank', player: 0, at: at(8, 0) });

    sim.step();
    expect(sim.snapshot().scenario).toMatchObject({ phase: 'ambush' });
    const hostiles = sim
      .snapshot()
      .entities.filter((entity) => entity.owner === 1 && entity.unitType === 'tank');
    expect(hostiles).toHaveLength(2);
  });

  it('does not trigger when only an enemy unit reaches the pass', () => {
    const sim = new Simulation({
      seed: 7,
      ironPass: {
        player: 0,
        ambushPlayer: 1,
        triggerAt: at(8, 0),
        ambushSpawns: [at(10, 2)],
      },
    });
    sim.enqueue({ type: 'spawnUnit', unit: 'tank', player: 1, at: at(8, 0) });
    sim.step();
    expect(sim.snapshot().scenario?.phase).toBe('approach');
  });

  it('preserves ambush progress across save and load', () => {
    const sim = new Simulation({
      seed: 7,
      ironPass: {
        player: 0,
        ambushPlayer: 1,
        triggerAt: at(8, 0),
        ambushSpawns: [at(10, 2)],
      },
    });
    sim.enqueue({ type: 'spawnUnit', unit: 'tank', player: 0, at: at(8, 0) });
    sim.step();

    const loaded = loadSimulation(saveSimulation(sim, 7));
    expect(loaded.snapshot().scenario).toMatchObject({ phase: 'ambush' });
  });
});
