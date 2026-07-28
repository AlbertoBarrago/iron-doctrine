import { describe, expect, it } from 'vitest';
import { Simulation } from '../../simulation.js';
import { loadSimulation, saveSimulation } from '../../persistence/save.js';
import { Health } from '../../../domain/components/index.js';
import { asEntityId } from '@iron/shared';
import * as fp from '../../../domain/math/fixed.js';

const at = (x: number, y: number) => ({ x: fp.fromInt(x), y: fp.fromInt(y) });

describe('black dawn scenario', () => {
  it('springs a last stand once the hostile command drops below the health threshold', () => {
    const sim = new Simulation({
      seed: 7,
      blackDawn: { hostilePlayer: 1, healthThreshold: 0.3 },
    });
    sim.enqueue({ type: 'spawnBuilding', building: 'construction_yard', player: 1, at: at(20, 0) });
    sim.step();

    expect(sim.snapshot().scenario).toMatchObject({ phase: 'assault' });

    const command = sim
      .snapshot()
      .entities.find(
        (entity) => entity.owner === 1 && entity.buildingType === 'construction_yard',
      )!;
    const health = sim.world.get(asEntityId(command.id), Health)!;
    health.hp = Math.floor(health.max * 0.2);

    sim.step();
    expect(sim.snapshot().scenario).toMatchObject({ phase: 'last-stand' });
    const hostiles = sim
      .snapshot()
      .entities.filter((entity) => entity.owner === 1 && entity.unitType);
    expect(hostiles).toHaveLength(5);
  });

  it('does not trigger while the hostile command is above the threshold', () => {
    const sim = new Simulation({
      seed: 7,
      blackDawn: { hostilePlayer: 1, healthThreshold: 0.3 },
    });
    sim.enqueue({ type: 'spawnBuilding', building: 'construction_yard', player: 1, at: at(20, 0) });
    for (let i = 0; i < 5; i++) sim.step();
    expect(sim.snapshot().scenario?.phase).toBe('assault');
  });

  it('preserves the last-stand trigger across save and load', () => {
    const sim = new Simulation({
      seed: 7,
      blackDawn: { hostilePlayer: 1, healthThreshold: 0.3 },
    });
    sim.enqueue({ type: 'spawnBuilding', building: 'construction_yard', player: 1, at: at(20, 0) });
    sim.step();
    const command = sim
      .snapshot()
      .entities.find(
        (entity) => entity.owner === 1 && entity.buildingType === 'construction_yard',
      )!;
    sim.world.get(asEntityId(command.id), Health)!.hp = 1;
    sim.step();

    const loaded = loadSimulation(saveSimulation(sim, 7));
    expect(loaded.snapshot().scenario).toMatchObject({ phase: 'last-stand' });
  });
});
