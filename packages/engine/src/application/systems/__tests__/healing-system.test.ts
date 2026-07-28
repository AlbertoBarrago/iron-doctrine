import { describe, expect, it } from 'vitest';
import type { EntityId } from '@iron/shared';
import { Simulation } from '../../simulation.js';
import { loadSimulation, saveSimulation } from '../../persistence/save.js';
import { Healing, Health, Position } from '../../../domain/components/index.js';
import * as fp from '../../../domain/math/fixed.js';

const at = (x: number, y: number) => ({ x: fp.fromInt(x), y: fp.fromInt(y) });

function spawn(
  sim: Simulation,
  unit: string,
  player: number,
  x: number,
  y: number,
): EntityId {
  const previous = new Set(sim.world.query(Position, Health));
  sim.enqueue({ type: 'spawnUnit', unit, player, at: at(x, y) });
  sim.step();
  return sim.world.query(Position, Health).find((entity) => !previous.has(entity))!;
}

describe('HealingSystem', () => {
  it('automatically treats the most injured nearby allied infantry', () => {
    const sim = new Simulation({ seed: 1 });
    const medic = spawn(sim, 'medic', 0, 0, 0);
    const rifleman = spawn(sim, 'rifleman', 0, 2, 0);
    const engineer = spawn(sim, 'engineer', 0, 1, 0);
    sim.world.get(rifleman, Health)!.hp = 40;
    sim.world.get(engineer, Health)!.hp = 40;

    sim.step();

    expect(sim.world.get(rifleman, Health)!.hp).toBe(50);
    expect(sim.world.get(engineer, Health)!.hp).toBe(40);
    expect(sim.world.get(medic, Healing)!.target).toBe(rifleman);
    expect(sim.snapshot().entities.find((entity) => entity.id === medic)?.healingTarget).toBe(
      rifleman,
    );
  });

  it('respects its treatment cooldown and never exceeds maximum health', () => {
    const sim = new Simulation({ seed: 1 });
    spawn(sim, 'medic', 0, 0, 0);
    const rifleman = spawn(sim, 'rifleman', 0, 2, 0);
    sim.world.get(rifleman, Health)!.hp = 95;

    sim.step();
    expect(sim.world.get(rifleman, Health)!.hp).toBe(100);
    for (let tick = 0; tick < 19; tick++) sim.step();
    expect(sim.world.get(rifleman, Health)!.hp).toBe(100);
  });

  it('ignores vehicles, enemies, distant infantry and critically wounded units', () => {
    const sim = new Simulation({ seed: 1 });
    const medic = spawn(sim, 'medic', 0, 0, 0);
    const tank = spawn(sim, 'tank', 0, 1, 0);
    const enemy = spawn(sim, 'rifleman', 1, 1, 1);
    const distant = spawn(sim, 'engineer', 0, 8, 0);
    const critical = spawn(sim, 'rifleman', 0, 2, 0);
    for (const entity of [tank, enemy, distant]) sim.world.get(entity, Health)!.hp = 1;
    sim.world.get(critical, Health)!.hp = 0;

    sim.step();

    expect(sim.world.get(tank, Health)!.hp).toBe(1);
    expect(sim.world.get(enemy, Health)!.hp).toBe(1);
    expect(sim.world.get(distant, Health)!.hp).toBe(1);
    expect(sim.world.isAlive(critical)).toBe(false);
    expect(sim.world.get(medic, Healing)!.target).toBe(-1);
  });

  it('preserves treatment state across save and load', () => {
    const sim = new Simulation({ seed: 1 });
    const medic = spawn(sim, 'medic', 0, 0, 0);
    const rifleman = spawn(sim, 'rifleman', 0, 2, 0);
    sim.world.get(rifleman, Health)!.hp = 40;
    sim.step();

    const loaded = loadSimulation(saveSimulation(sim, 1));

    expect(loaded.world.get(medic, Healing)).toEqual(sim.world.get(medic, Healing));
    expect(loaded.snapshot().entities.find((entity) => entity.id === medic)?.healingTarget).toBe(
      rifleman,
    );
  });
});
