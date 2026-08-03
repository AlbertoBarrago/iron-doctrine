import { describe, expect, it } from 'vitest';
import { Simulation } from '../../simulation.js';
import { loadSimulation, saveSimulation } from '../../persistence/save.js';
import {
  Health,
  Position,
  WeaponLoadout,
  Trap,
} from '../../../domain/components/index.js';
import { asEntityId } from '@iron/shared';
import * as fp from '../../../domain/math/fixed.js';

const at = (x: number, y: number) => ({ x: fp.fromInt(x), y: fp.fromInt(y) });

/** Reduces the cage's Health to 0 so HealthSystem reaps it on the next step, mirroring
 * how the obstacle-wall tests below drive destruction directly rather than simulating
 * a full combat exchange. */
function destroyCage(sim: Simulation): void {
  const cage = sim.snapshot().entities.find((entity) => entity.buildingType === 'cage')!;
  const health = sim.world.get(asEntityId(cage.id), Health)!;
  health.hp = 0;
}

describe('silent extraction scenario', () => {
  it('reaches the cage, then requires destroying it before the prisoner is freed', () => {
    const sim = new Simulation({
      seed: 7,
      silentExtraction: {
        player: 0,
        prisonerAt: at(8, 0),
        extractionAt: at(0, 0),
      },
    });
    sim.enqueue({ type: 'spawnUnit', unit: 'operative', player: 0, at: at(8, 0) });

    sim.step();
    sim.step();
    expect(sim.snapshot().scenario?.phase).toBe('located');
    expect(
      sim.snapshot().entities.some((entity) => entity.buildingType === 'cage'),
    ).toBe(true);
    expect(
      sim.snapshot().entities.some((entity) => entity.owner === 0 && entity.unitType === 'prisoner'),
    ).toBe(false);

    destroyCage(sim);
    sim.step();
    sim.step();

    expect(sim.snapshot().scenario?.phase).toBe('escorting');
    expect(sim.snapshot().scenario?.cageDestroyed).toBe(true);
    expect(
      sim.snapshot().entities.some((entity) => entity.owner === 0 && entity.unitType === 'prisoner'),
    ).toBe(true);
  });

  it('extracts once the prisoner reaches the extraction point', () => {
    const sim = new Simulation({
      seed: 7,
      matchPlayers: [0, 1],
      silentExtraction: {
        player: 0,
        prisonerAt: at(8, 0),
        extractionAt: at(0, 0),
      },
    });
    sim.enqueue({ type: 'spawnUnit', unit: 'operative', player: 0, at: at(8, 0) });
    sim.step();
    sim.step();
    expect(sim.snapshot().scenario?.phase).toBe('located');
    destroyCage(sim);
    sim.step();
    sim.step();
    expect(sim.snapshot().scenario?.phase).toBe('escorting');

    const prisoner = sim.snapshot().entities.find((entity) => entity.unitType === 'prisoner')!;
    // Teleport the prisoner onto the extraction point to trigger the win condition
    // without simulating the full escort walk.
    const position = sim.world.get(asEntityId(prisoner.id), Position)!;
    position.x = at(0, 0).x;
    position.y = at(0, 0).y;

    sim.step();
    expect(sim.snapshot().scenario?.phase).toBe('extracted');
    expect(sim.snapshot().match).toEqual({ status: 'finished', winner: 0 });
  });

  it('fails the operation when the operative is killed before extraction', () => {
    const sim = new Simulation({
      seed: 7,
      matchPlayers: [0, 1],
      silentExtraction: {
        player: 0,
        prisonerAt: at(8, 0),
        extractionAt: at(0, 0),
      },
    });
    sim.enqueue({ type: 'spawnUnit', unit: 'operative', player: 0, at: at(0, 0) });
    sim.step();
    const operative = sim.snapshot().entities.find((entity) => entity.owner === 0)!;
    const health = sim.world.get(asEntityId(operative.id), Health)!;
    health.hp = 0;

    sim.step();
    sim.step();
    expect(sim.snapshot().scenario?.phase).toBe('failed');
    expect(sim.snapshot().match).toEqual({ status: 'finished', winner: 1 });
  });

  it('preserves scenario progress across save and load', () => {
    const sim = new Simulation({
      seed: 7,
      silentExtraction: {
        player: 0,
        prisonerAt: at(8, 0),
        extractionAt: at(0, 0),
      },
    });
    sim.enqueue({ type: 'spawnUnit', unit: 'operative', player: 0, at: at(8, 0) });
    sim.step();
    sim.step();
    expect(sim.snapshot().scenario?.phase).toBe('located');
    destroyCage(sim);
    sim.step();
    sim.step();
    expect(sim.snapshot().scenario?.phase).toBe('escorting');

    const loaded = loadSimulation(saveSimulation(sim, 7));
    expect(loaded.snapshot().scenario?.phase).toBe('escorting');
    expect(
      loaded
        .snapshot()
        .entities.some((entity) => entity.owner === 0 && entity.unitType === 'prisoner'),
    ).toBe(true);
  });

  it('switches the operative active weapon, changing the range/damage/cooldown combat reads', () => {
    const sim = new Simulation({
      seed: 7,
      silentExtraction: {
        player: 0,
        prisonerAt: at(8, 0),
        extractionAt: at(0, 0),
      },
    });
    sim.enqueue({ type: 'spawnUnit', unit: 'operative', player: 0, at: at(0, 0) });
    sim.step();

    const operative = sim.snapshot().entities.find((entity) => entity.unitType === 'operative')!;
    const entity = asEntityId(operative.id);
    const loadout = sim.world.get(entity, WeaponLoadout)!;
    expect(loadout.activeIndex).toBe(0);
    expect(loadout.weapons[0]!.id).toBe('knife');

    sim.enqueue({ type: 'switchWeapon', entity, index: 2 });
    sim.step();

    expect(loadout.activeIndex).toBe(2);
    const active = loadout.weapons[loadout.activeIndex]!;
    expect(active.id).toBe('demo_charge');
    expect(fp.toFloat(active.range)).toBe(8);
    expect(active.cooldownTicks).toBe(90);
    expect(active.damage).toBe(45);
  });

  it('plants a bomb on the obstacle wall and detonates it after the fuse, destroying it', () => {
    const sim = new Simulation({
      seed: 7,
      silentExtraction: {
        player: 0,
        prisonerAt: at(8, 0),
        extractionAt: at(0, 0),
        obstacleAt: at(2, 0),
      },
    });
    sim.enqueue({ type: 'spawnUnit', unit: 'operative', player: 0, at: at(0, 0) });
    sim.step();

    const wall = sim.snapshot().entities.find((entity) => entity.buildingType === 'concrete_wall');
    expect(wall).toBeDefined();

    const operative = sim.snapshot().entities.find((entity) => entity.unitType === 'operative')!;
    sim.enqueue({
      type: 'plantBomb',
      entity: asEntityId(operative.id),
      target: asEntityId(wall!.id),
      fuseTicks: 3,
    });
    sim.step();
    expect(sim.snapshot().scenario?.obstacleDestroyed).toBe(false);

    for (let i = 0; i < 6; i++) sim.step();

    expect(
      sim.snapshot().entities.some((entity) => entity.buildingType === 'concrete_wall'),
    ).toBe(false);
  });

  it('lets the operative disarm a trap before it detonates', () => {
    const sim = new Simulation({
      seed: 7,
      silentExtraction: {
        player: 0,
        prisonerAt: at(8, 0),
        extractionAt: at(0, 0),
        trapPositions: [at(20, 20)],
      },
    });
    // Spawn well clear of the trap's trigger radius, then teleport into range —
    // mirrors how the existing extraction test teleports the prisoner directly,
    // avoiding a multi-tick walk to reach the trap.
    sim.enqueue({ type: 'spawnUnit', unit: 'operative', player: 0, at: at(0, 0) });
    sim.step();

    const trap = sim.snapshot().entities.find((entity) => entity.kind === 'trap')!;
    expect(trap.trapArmed).toBe(true);

    const operative = sim.snapshot().entities.find((entity) => entity.unitType === 'operative')!;
    const operativeEntity = asEntityId(operative.id);
    const operativePosition = sim.world.get(operativeEntity, Position)!;
    operativePosition.x = at(20, 20).x;
    operativePosition.y = at(20, 20).y;

    sim.enqueue({
      type: 'disarmTrap',
      entity: operativeEntity,
      target: asEntityId(trap.id),
    });
    for (let i = 0; i < 65; i++) sim.step();

    const trapEntity = asEntityId(trap.id);
    expect(sim.world.get(trapEntity, Trap)!.armed).toBe(false);
    // The operative survived the disarm and the mission is not stuck failed.
    expect(sim.snapshot().scenario?.phase).not.toBe('failed');
    expect(sim.world.get(operativeEntity, Health)!.hp).toBeGreaterThan(0);
  });

  it('fails the operation when an armed trap detonates on the escorted prisoner', () => {
    const sim = new Simulation({
      seed: 7,
      matchPlayers: [0, 1],
      silentExtraction: {
        player: 0,
        prisonerAt: at(8, 0),
        extractionAt: at(0, 0),
        trapPositions: [at(20, 20)],
      },
    });
    sim.enqueue({ type: 'spawnUnit', unit: 'operative', player: 0, at: at(8, 0) });
    sim.step();
    sim.step();
    expect(sim.snapshot().scenario?.phase).toBe('located');
    destroyCage(sim);
    sim.step();
    sim.step();
    expect(sim.snapshot().scenario?.phase).toBe('escorting');

    const prisoner = sim.snapshot().entities.find((entity) => entity.unitType === 'prisoner')!;
    const prisonerPosition = sim.world.get(asEntityId(prisoner.id), Position)!;
    const trap = sim.snapshot().entities.find((entity) => entity.kind === 'trap')!;
    // Walk the trap onto the prisoner's exact position — the prisoner's 40 HP does
    // not survive the trap's 60 damage, so the escort dies and the scenario fails.
    const trapPosition = sim.world.get(asEntityId(trap.id), Position)!;
    trapPosition.x = prisonerPosition.x;
    trapPosition.y = prisonerPosition.y;

    // One tick for TrapSystem to detonate (it runs after the scenario system in the
    // pipeline), one more for the scenario to observe the prisoner is gone.
    sim.step();
    sim.step();
    expect(sim.snapshot().scenario?.phase).toBe('failed');
    expect(sim.snapshot().match).toEqual({ status: 'finished', winner: 1 });
  });
});
