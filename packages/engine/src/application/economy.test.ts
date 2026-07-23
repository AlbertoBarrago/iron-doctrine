import { describe, it, expect } from 'vitest';
import { Simulation } from './simulation.js';
import { NavGrid } from './pathfinding/nav-grid.js';
import { Harvest, ResourceNode } from '../domain/components/index.js';
import { PlayerEconomy } from '../domain/economy/player-economy.js';
import * as fp from '../domain/math/fixed.js';

const at = (x: number, y: number) => ({ x: fp.fromInt(x), y: fp.fromInt(y) });

describe('PlayerEconomy', () => {
  it('tracks and spends credits', () => {
    const eco = new PlayerEconomy();
    eco.addCredits(0, 100);
    expect(eco.credits(0)).toBe(100);
    expect(eco.spend(0, 40)).toBe(true);
    expect(eco.credits(0)).toBe(60);
    expect(eco.spend(0, 1000)).toBe(false); // insufficient
    expect(eco.credits(0)).toBe(60);
  });
});

describe('Harvester economy loop', () => {
  function makeSim(): Simulation {
    const grid = new NavGrid(64, 64, fp.fromInt(1));
    return new Simulation({ seed: 1, grid });
  }

  it('gathers ore and deposits it as credits at the refinery', () => {
    const sim = makeSim();
    // Base/drop-off, ore field close by, and a harvester.
    sim.enqueue({ type: 'spawnBuilding', building: 'refinery', player: 0, at: at(0, 0) });
    sim.enqueue({ type: 'spawnResource', amount: 500, at: at(5, 0) });
    sim.enqueue({ type: 'spawnUnit', unit: 'harvester', player: 0, at: at(2, 0) });
    sim.step();

    expect(sim.economy.credits(0)).toBe(0);

    // Run long enough for at least one full gather+deposit cycle.
    let deposited = false;
    for (let i = 0; i < 1000; i++) {
      sim.step();
      if (sim.economy.credits(0) > 0) {
        deposited = true;
        break;
      }
    }
    expect(deposited).toBe(true);
    expect(sim.economy.credits(0)).toBeGreaterThanOrEqual(200); // one full carrier
  });

  it('depletes the ore node over time', () => {
    const sim = makeSim();
    sim.enqueue({ type: 'spawnBuilding', building: 'refinery', player: 0, at: at(0, 0) });
    sim.enqueue({ type: 'spawnResource', amount: 40, at: at(4, 0) });
    sim.enqueue({ type: 'spawnUnit', unit: 'harvester', player: 0, at: at(2, 0) });
    sim.step();

    for (let i = 0; i < 2000; i++) {
      sim.step();
      if (sim.economy.credits(0) >= 40) break;
    }
    // Small node fully consumed and turned into credits.
    expect(sim.world.query(ResourceNode).length).toBe(0);
    expect(sim.economy.credits(0)).toBe(40);
  });

  it('keeps a harvester under manual control until gather is ordered again', () => {
    const sim = makeSim();
    sim.enqueue({ type: 'spawnResource', amount: 500, at: at(5, 0) });
    sim.enqueue({ type: 'spawnUnit', unit: 'harvester', player: 0, at: at(2, 0) });
    sim.step();
    const harvester = sim.world.query(Harvest)[0]!;
    expect(sim.world.get(harvester, Harvest)!.phase).toBe('toNode');

    sim.enqueue({ type: 'move', entities: [harvester], target: at(-10, 0) });
    for (let i = 0; i < 20; i++) sim.step();
    expect(sim.world.get(harvester, Harvest)!.phase).toBe('paused');

    sim.enqueue({ type: 'gather', entities: [harvester] });
    sim.step();
    expect(sim.world.get(harvester, Harvest)!.phase).toBe('toNode');
  });

  it('routes a harvester to the explicitly targeted ore field', () => {
    const sim = makeSim();
    sim.enqueue({ type: 'spawnResource', amount: 500, at: at(4, 0) });
    sim.enqueue({ type: 'spawnResource', amount: 500, at: at(12, 0) });
    sim.enqueue({ type: 'spawnUnit', unit: 'harvester', player: 0, at: at(2, 0) });
    sim.step();
    const harvester = sim.world.query(Harvest)[0]!;
    const distantOre = sim.world.query(ResourceNode)[1]!;

    sim.enqueue({ type: 'gather', entities: [harvester], target: distantOre });
    sim.step();

    expect(sim.world.get(harvester, Harvest)).toMatchObject({
      phase: 'toNode',
      node: distantOre,
    });
  });

  it('exposes harvester cargo and phase in snapshots', () => {
    const sim = makeSim();
    sim.enqueue({ type: 'spawnResource', amount: 500, at: at(5, 0) });
    sim.enqueue({ type: 'spawnUnit', unit: 'harvester', player: 0, at: at(2, 0) });
    sim.step();
    const harvester = sim.snapshot().entities.find((entity) => entity.unitType === 'harvester');

    expect(harvester?.cargo).toEqual({
      amount: 0,
      capacity: 200,
      phase: 'toNode',
    });
  });

  it('aggregates power from buildings', () => {
    const sim = makeSim();
    sim.enqueue({ type: 'spawnBuilding', building: 'power_plant', player: 0, at: at(0, 0) }); // +100
    sim.enqueue({ type: 'spawnBuilding', building: 'refinery', player: 0, at: at(6, 0) }); // -30
    sim.step();
    sim.step();
    const power = sim.economy.get(0).power;
    expect(power.produced).toBe(100);
    expect(power.consumed).toBe(30);
  });

  it('economy stays deterministic across runs', () => {
    const build = () => {
      const grid = new NavGrid(64, 64, fp.fromInt(1));
      const s = new Simulation({ seed: 55, grid });
      s.enqueue({ type: 'spawnBuilding', building: 'refinery', player: 0, at: at(0, 0) });
      s.enqueue({ type: 'spawnResource', amount: 500, at: at(5, 1) });
      s.enqueue({ type: 'spawnUnit', unit: 'harvester', player: 0, at: at(2, 0) });
      return s;
    };
    const a = build();
    const b = build();
    for (let i = 0; i < 600; i++) {
      a.step();
      b.step();
      expect(a.hash()).toBe(b.hash());
    }
    expect(a.economy.credits(0)).toBe(b.economy.credits(0));
  });
});
