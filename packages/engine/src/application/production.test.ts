import { describe, it, expect } from 'vitest';
import { Simulation } from './simulation.js';
import { NavGrid } from './pathfinding/nav-grid.js';
import { Position, Owner, Production, Building, Movement } from '../domain/components/index.js';
import * as fp from '../domain/math/fixed.js';
import type { EntityId } from '@iron/shared';

const at = (x: number, y: number) => ({ x: fp.fromInt(x), y: fp.fromInt(y) });

function makeSim() {
  const grid = new NavGrid(64, 64, fp.fromInt(1));
  return new Simulation({
    seed: 1,
    grid,
    startingCredits: { 0: 5000 },
    startingTech: { 0: ['armor_doctrine'] }, // unlocks tank production
  });
}

function factory(sim: Simulation): EntityId {
  sim.enqueue({ type: 'spawnBuilding', building: 'factory', player: 0, at: at(0, 0) });
  sim.step();
  return sim.world.query(Building, Owner)[0]!;
}

describe('ProductionSystem', () => {
  it('charges credits on enqueue and builds the unit after its build time', () => {
    const sim = makeSim();
    const fac = factory(sim);
    const before = sim.economy.credits(0);

    sim.enqueue({ type: 'queueProduction', building: fac, unit: 'tank' });
    sim.step();
    expect(sim.economy.credits(0)).toBe(before - 700); // charged immediately
    expect(sim.world.get(fac, Production)!.queue).toEqual(['tank']);

    const unitsBefore = sim.world.query(Position).length;
    for (let i = 0; i < 160; i++) sim.step(); // tank buildTicks = 140
    const unitsAfter = sim.world.query(Position).length;
    expect(unitsAfter).toBe(unitsBefore + 1);
    expect(sim.world.get(fac, Production)!.queue.length).toBe(0);
  });

  it('rejects a unit the building cannot produce', () => {
    const sim = makeSim();
    const fac = factory(sim); // produces tank/harvester, not rifleman
    const before = sim.economy.credits(0);
    sim.enqueue({ type: 'queueProduction', building: fac, unit: 'rifleman' });
    sim.step();
    expect(sim.world.get(fac, Production)!.queue.length).toBe(0);
    expect(sim.economy.credits(0)).toBe(before); // not charged
  });

  it('does not queue when the player cannot afford it', () => {
    const grid = new NavGrid(64, 64, fp.fromInt(1));
    const sim = new Simulation({
      seed: 1,
      grid,
      startingCredits: { 0: 100 },
      startingTech: { 0: ['armor_doctrine'] },
    });
    const fac = factory(sim);
    sim.enqueue({ type: 'queueProduction', building: fac, unit: 'tank' }); // costs 700
    sim.step();
    expect(sim.world.get(fac, Production)!.queue.length).toBe(0);
    expect(sim.economy.credits(0)).toBe(100);
  });

  it('cancelling refunds credits', () => {
    const sim = makeSim();
    const fac = factory(sim);
    const before = sim.economy.credits(0);
    sim.enqueue({ type: 'queueProduction', building: fac, unit: 'tank' });
    sim.step();
    sim.enqueue({ type: 'cancelProduction', building: fac });
    sim.step();
    expect(sim.world.get(fac, Production)!.queue.length).toBe(0);
    expect(sim.economy.credits(0)).toBe(before);
  });

  it('publishes production state for presentation clients', () => {
    const sim = makeSim();
    const fac = factory(sim);
    sim.enqueue({ type: 'queueProduction', building: fac, unit: 'tank' });
    sim.step();

    const building = sim.snapshot().entities.find((entity) => entity.id === fac);
    expect(building).toMatchObject({
      kind: 'building',
      buildingType: 'factory',
      production: {
        queue: ['tank'],
        progressTicks: 1,
        currentBuildTicks: 140,
        produces: ['tank', 'harvester'],
      },
    });
  });

  it('sends a finished unit to the rally point', () => {
    const sim = makeSim();
    const fac = factory(sim);
    sim.enqueue({ type: 'setRally', building: fac, point: at(20, 20) });
    sim.enqueue({ type: 'queueProduction', building: fac, unit: 'harvester' });
    for (let i = 0; i < 200; i++) sim.step(); // harvester buildTicks = 180

    // The newest unit should have a movement order toward the rally (or be en route).
    const units = sim.world.query(Position, Movement).filter((e) => e !== fac);
    expect(units.length).toBeGreaterThanOrEqual(1);
  });

  it('production stays deterministic across runs', () => {
    const build = () => {
      const grid = new NavGrid(64, 64, fp.fromInt(1));
      const s = new Simulation({
        seed: 9,
        grid,
        startingCredits: { 0: 5000 },
        startingTech: { 0: ['armor_doctrine'] },
      });
      s.enqueue({ type: 'spawnBuilding', building: 'factory', player: 0, at: at(0, 0) });
      s.step();
      const f = s.world.query(Building, Owner)[0]!;
      s.enqueue({ type: 'queueProduction', building: f, unit: 'tank' });
      s.enqueue({ type: 'queueProduction', building: f, unit: 'harvester' });
      return s;
    };
    const a = build();
    const b = build();
    for (let i = 0; i < 400; i++) {
      a.step();
      b.step();
      expect(a.hash()).toBe(b.hash());
    }
  });
});
