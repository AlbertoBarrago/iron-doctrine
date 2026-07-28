import { describe, expect, it } from 'vitest';
import { Simulation } from './simulation.js';
import { NavGrid } from './pathfinding/nav-grid.js';
import {
  Attack,
  Health,
  Position,
  ResourceNode,
  UnitType,
  Weapon,
} from '../domain/components/index.js';
import * as fp from '../domain/math/fixed.js';
import type { EntityId } from '@iron/shared';

const at = (x: number) => ({ x: fp.fromFloat(x), y: fp.FP.ZERO });

function simulation(): Simulation {
  return new Simulation({ seed: 7, grid: new NavGrid(32, 32, fp.fromInt(1)) });
}

function spawn(sim: Simulation, unit: string, player: number, x: number): EntityId {
  sim.enqueue({ type: 'spawnUnit', unit, player, at: at(x) });
  sim.step();
  return sim.world.query(UnitType).at(-1)!;
}

function disarm(sim: Simulation, entity: EntityId): void {
  sim.world.remove(entity, Weapon);
  sim.world.remove(entity, Attack);
}

describe('vehicle crushing', () => {
  it('lets a moving tank crush hostile infantry', () => {
    const sim = simulation();
    const tank = spawn(sim, 'tank', 0, -4);
    disarm(sim, tank);
    const rifleman = spawn(sim, 'rifleman', 1, 0);
    sim.enqueue({ type: 'move', entities: [tank], target: at(4) });

    for (let tick = 0; tick < 200 && sim.world.isAlive(rifleman); tick++) sim.step();

    expect(sim.world.isAlive(rifleman)).toBe(false);
  });

  it('does not crush allied infantry', () => {
    const sim = simulation();
    const tank = spawn(sim, 'tank', 0, -3);
    disarm(sim, tank);
    const rifleman = spawn(sim, 'rifleman', 0, 0);
    sim.enqueue({ type: 'move', entities: [tank], target: at(3) });

    for (let tick = 0; tick < 150; tick++) sim.step();

    expect(sim.world.isAlive(rifleman)).toBe(true);
  });

  it('does not let a stationary tank crush overlapping infantry', () => {
    const sim = simulation();
    const tank = spawn(sim, 'tank', 0, 0);
    disarm(sim, tank);
    const rifleman = spawn(sim, 'rifleman', 1, 0);

    for (let tick = 0; tick < 10; tick++) sim.step();

    expect(sim.world.get(rifleman, Health)?.hp).toBe(100);
  });

  it('does not crush hostile vehicles', () => {
    const sim = simulation();
    const tank = spawn(sim, 'tank', 0, -4);
    disarm(sim, tank);
    const scout = spawn(sim, 'scout', 1, 0);
    sim.enqueue({ type: 'move', entities: [tank], target: at(4) });

    for (let tick = 0; tick < 200; tick++) sim.step();

    expect(sim.world.isAlive(scout)).toBe(true);
  });

  it('lets a tank cross the centre of an ore field without consuming or blocking it', () => {
    const sim = simulation();
    sim.enqueue({ type: 'spawnResource', amount: 1000, at: at(0) });
    sim.step();
    const resource = sim.world.query(ResourceNode)[0]!;
    const tank = spawn(sim, 'tank', 0, -4);
    disarm(sim, tank);
    sim.enqueue({ type: 'move', entities: [tank], target: at(4) });

    for (let tick = 0; tick < 200; tick++) sim.step();

    expect(fp.toFloat(sim.world.get(tank, Position)!.x)).toBeCloseTo(4, 1);
    expect(sim.world.get(resource, ResourceNode)?.amount).toBe(1000);
  });
});
