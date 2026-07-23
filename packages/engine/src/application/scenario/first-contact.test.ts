import { describe, expect, it } from 'vitest';
import { Simulation } from '../simulation.js';
import { loadSimulation, saveSimulation } from '../persistence/save.js';
import { Health } from '../../domain/components/index.js';
import { asEntityId } from '@iron/shared';
import * as fp from '../../domain/math/fixed.js';

const at = (x: number, y: number) => ({ x: fp.fromInt(x), y: fp.fromInt(y) });

describe('first contact scenario', () => {
  it('recovers a command base after the player reaches the objective', () => {
    const sim = new Simulation({
      seed: 7,
      startingCredits: { 0: 0 },
      firstContact: {
        player: 0,
        recoveryAt: at(8, 0),
        recoveryTicks: 2,
        recoveredCredits: 2200,
      },
    });
    sim.enqueue({ type: 'spawnUnit', unit: 'tank', player: 0, at: at(8, 0) });

    sim.step();
    expect(sim.snapshot().scenario).toMatchObject({ phase: 'recovering', progress: 0 });

    sim.step();
    sim.step();

    expect(sim.snapshot().scenario).toMatchObject({ phase: 'operational', progress: 1 });
    expect(sim.economy.credits(0)).toBe(2200);
    expect(
      sim
        .snapshot()
        .entities.some(
          (entity) => entity.owner === 0 && entity.buildingType === 'construction_yard',
        ),
    ).toBe(true);
    expect(
      sim
        .snapshot()
        .entities.some((entity) => entity.owner === 0 && entity.unitType === 'harvester'),
    ).toBe(true);
  });

  it('does not advance when only an enemy reaches the objective', () => {
    const sim = new Simulation({
      seed: 7,
      firstContact: {
        player: 0,
        recoveryAt: at(8, 0),
        recoveryTicks: 2,
        recoveredCredits: 2200,
      },
    });
    sim.enqueue({ type: 'spawnUnit', unit: 'rifleman', player: 1, at: at(8, 0) });
    sim.step();
    expect(sim.snapshot().scenario?.phase).toBe('locate');
  });

  it('preserves recovery progress across save and load', () => {
    const sim = new Simulation({
      seed: 7,
      firstContact: {
        player: 0,
        recoveryAt: at(8, 0),
        recoveryTicks: 3,
        recoveredCredits: 2200,
      },
    });
    sim.enqueue({ type: 'spawnUnit', unit: 'tank', player: 0, at: at(8, 0) });
    sim.step();
    sim.step();

    const loaded = loadSimulation(saveSimulation(sim, 7));
    expect(loaded.snapshot().scenario).toMatchObject({
      phase: 'recovering',
      progress: 1 / 3,
    });

    loaded.step();
    loaded.step();
    expect(loaded.snapshot().scenario?.phase).toBe('operational');
  });

  it('ends the match when the deployed patrol is eliminated', () => {
    const sim = new Simulation({
      seed: 7,
      matchPlayers: [0, 1],
      firstContact: {
        player: 0,
        recoveryAt: at(8, 0),
        recoveryTicks: 3,
        recoveredCredits: 2200,
      },
    });
    sim.enqueue({ type: 'spawnUnit', unit: 'rifleman', player: 0, at: at(0, 0) });
    sim.step();
    const patrol = sim.snapshot().entities.find((entity) => entity.owner === 0)!;
    const health = sim.world.get(asEntityId(patrol.id), Health)!;
    health.hp = 0;

    sim.step();
    sim.step();
    expect(sim.snapshot().scenario?.phase).toBe('failed');
    expect(sim.snapshot().match).toEqual({ status: 'finished', winner: 1 });
  });
});
