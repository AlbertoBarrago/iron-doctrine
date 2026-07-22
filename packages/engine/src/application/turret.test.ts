import { describe, it, expect } from 'vitest';
import { Simulation } from './simulation.js';
import { NavGrid } from './pathfinding/nav-grid.js';
import { Position, Owner, Building, Health } from '../domain/components/index.js';
import * as fp from '../domain/math/fixed.js';

const at = (x: number, y: number) => ({ x: fp.fromInt(x), y: fp.fromInt(y) });

function enemyUnit(sim: Simulation) {
  return sim.world
    .query(Position, Owner, Health)
    .filter((e) => sim.world.get(e, Owner)!.player === 1 && !sim.world.has(e, Building))[0];
}

describe('Defensive turret', () => {
  it('fires at a nearby enemy WHEN powered', () => {
    const grid = new NavGrid(64, 64, fp.fromInt(1));
    const sim = new Simulation({ seed: 1, grid });
    sim.enqueue({ type: 'spawnBuilding', building: 'power_plant', player: 0, at: at(-6, 0) }); // +100
    sim.enqueue({ type: 'spawnBuilding', building: 'turret', player: 0, at: at(0, 0) }); // -40
    sim.enqueue({ type: 'spawnUnit', unit: 'rifleman', player: 1, at: at(6, 0) });
    sim.step();

    const enemy = enemyUnit(sim)!;
    let harmed = false;
    for (let i = 0; i < 400; i++) {
      sim.step();
      if (!sim.world.isAlive(enemy)) {
        harmed = true;
        break;
      }
    }
    expect(harmed).toBe(true);
  });

  it('is DISABLED when the owner is in power deficit', () => {
    const grid = new NavGrid(64, 64, fp.fromInt(1));
    const sim = new Simulation({ seed: 1, grid });
    // Turret with no power plant → consumed(40) > produced(0) → powered down.
    sim.enqueue({ type: 'spawnBuilding', building: 'turret', player: 0, at: at(0, 0) });
    sim.enqueue({ type: 'spawnUnit', unit: 'rifleman', player: 1, at: at(6, 0) });
    sim.step();

    const enemy = enemyUnit(sim)!;
    const startHp = sim.world.get(enemy, Health)!.hp;
    for (let i = 0; i < 300; i++) sim.step();
    // Enemy rifleman may damage the turret, but the turret must not have fired back.
    expect(sim.world.isAlive(enemy)).toBe(true);
    expect(sim.world.get(enemy, Health)!.hp).toBe(startHp);
  });
});
