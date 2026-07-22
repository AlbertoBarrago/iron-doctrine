import { describe, expect, it } from 'vitest';
import { Simulation } from './simulation.js';
import { NavGrid } from './pathfinding/nav-grid.js';
import { Building, Construction, Energy, Health, Production } from '../domain/components/index.js';
import * as fp from '../domain/math/fixed.js';

const at = (x: number, y: number) => ({ x: fp.fromFloat(x), y: fp.fromFloat(y) });

function makeSim(credits = 5000): Simulation {
  return new Simulation({
    seed: 17,
    grid: new NavGrid(32, 32, fp.fromInt(1)),
    startingCredits: { 0: credits },
  });
}

describe('base construction', () => {
  it('charges the player and creates a non-operational construction site', () => {
    const sim = makeSim();

    sim.enqueue({ type: 'placeBuilding', building: 'barracks', player: 0, at: at(0, 0) });
    sim.step();

    const site = sim.world.query(Building)[0]!;
    expect(sim.economy.credits(0)).toBe(4400);
    expect(sim.world.get(site, Construction)).toMatchObject({
      progressTicks: 1,
      buildTicks: 120,
    });
    expect(sim.world.has(site, Energy)).toBe(false);
    expect(sim.world.has(site, Production)).toBe(false);
  });

  it('rejects blocked, out-of-bounds and unaffordable placements without charging', () => {
    const sim = makeSim(800);

    sim.enqueue({ type: 'placeBuilding', building: 'power_plant', player: 0, at: at(0, 0) });
    sim.step();
    expect(sim.economy.credits(0)).toBe(0);
    expect(sim.world.query(Building)).toHaveLength(1);

    sim.economy.addCredits(0, 2000);
    sim.enqueue({ type: 'placeBuilding', building: 'barracks', player: 0, at: at(0, 0) });
    sim.enqueue({ type: 'placeBuilding', building: 'factory', player: 0, at: at(-16, -16) });
    sim.step();

    expect(sim.world.query(Building)).toHaveLength(1);
    expect(sim.economy.credits(0)).toBe(2000);
  });

  it('activates the building and its power only after the deterministic build time', () => {
    const sim = makeSim();
    sim.enqueue({ type: 'placeBuilding', building: 'power_plant', player: 0, at: at(0, 0) });
    sim.step();
    const site = sim.world.query(Building)[0]!;

    for (let tick = 1; tick < 99; tick++) sim.step();
    expect(sim.world.has(site, Construction)).toBe(true);
    expect(sim.economy.get(0).power.produced).toBe(0);

    sim.step();
    expect(sim.world.has(site, Construction)).toBe(false);
    expect(sim.world.get(site, Health)?.hp).toBe(800);
    expect(sim.world.get(site, Energy)?.produced).toBe(100);

    sim.step();
    expect(sim.economy.get(0).power.produced).toBe(100);
  });

  it('publishes progress and remains deterministic across runs', () => {
    const build = (): Simulation => {
      const sim = makeSim();
      sim.enqueue({ type: 'placeBuilding', building: 'turret', player: 0, at: at(4.5, 4.5) });
      return sim;
    };
    const first = build();
    const second = build();

    for (let tick = 0; tick < 50; tick++) {
      first.step();
      second.step();
      expect(first.hash()).toBe(second.hash());
    }

    expect(first.snapshot().entities[0]?.construction).toEqual({
      progressTicks: 50,
      buildTicks: 140,
    });
  });
});
