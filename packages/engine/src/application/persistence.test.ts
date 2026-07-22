import { describe, it, expect } from 'vitest';
import { Simulation } from './simulation.js';
import { NavGrid } from './pathfinding/nav-grid.js';
import { saveSimulation, loadSimulation, serializeSave, deserializeSave } from './persistence/save.js';
import { ReplayRecorder, runReplay } from './persistence/replay.js';
import type { Command } from './commands/command.js';
import * as fp from '../domain/math/fixed.js';

const at = (x: number, y: number) => ({ x: fp.fromInt(x), y: fp.fromInt(y) });

describe('Save / Load', () => {
  function makeMatch(): Simulation {
    const grid = new NavGrid(64, 64, fp.fromInt(1));
    const sim = new Simulation({ seed: 12345, grid });
    sim.enqueue({ type: 'spawnBuilding', building: 'refinery', player: 0, at: at(0, 0) });
    sim.enqueue({ type: 'spawnResource', amount: 800, at: at(6, 0) });
    sim.enqueue({ type: 'spawnUnit', unit: 'harvester', player: 0, at: at(3, 0) });
    sim.enqueue({ type: 'spawnUnit', unit: 'tank', player: 0, at: at(-3, 2) });
    sim.enqueue({ type: 'spawnUnit', unit: 'tank', player: 1, at: at(4, 4) });
    return sim;
  }

  it('round-trips state: a loaded save resumes bit-for-bit', () => {
    const original = makeMatch();
    for (let i = 0; i < 300; i++) original.step();

    const save = saveSimulation(original, 12345);
    const loaded = loadSimulation(save);

    // Identical immediately after load.
    expect(loaded.tick).toBe(original.tick);
    expect(loaded.hash()).toBe(original.hash());
    expect(loaded.economy.credits(0)).toBe(original.economy.credits(0));

    // And continues to stay in lockstep as both advance.
    for (let i = 0; i < 300; i++) {
      original.step();
      loaded.step();
      expect(loaded.hash()).toBe(original.hash());
    }
  });

  it('survives a JSON string round-trip', () => {
    const sim = makeMatch();
    for (let i = 0; i < 120; i++) sim.step();
    const restored = loadSimulation(deserializeSave(serializeSave(saveSimulation(sim, 12345))));
    expect(restored.hash()).toBe(sim.hash());
  });

  it('preserves navigation-grid footprints (buildings still block)', () => {
    const sim = makeMatch();
    sim.step();
    const save = saveSimulation(sim, 12345);
    const loaded = loadSimulation(save);
    const cell = loaded.grid.worldToCell(at(0, 0).x, at(0, 0).y);
    expect(loaded.grid.isBlocked(cell.cx, cell.cy)).toBe(true);
  });

  it('rejects an incompatible version', () => {
    const sim = makeMatch();
    const save = saveSimulation(sim, 1);
    save.version = 999;
    expect(() => loadSimulation(save)).toThrow(/incompatible/);
  });
});

describe('Replay', () => {
  it('reproduces a match exactly from seed + command log', () => {
    const grid = () => new NavGrid(64, 64, fp.fromInt(1));
    const seed = 777;
    const recorder = new ReplayRecorder(seed, { width: 64, height: 64, cellSize: 1 }, []);

    // Live run, recording every command at the tick it is enqueued.
    const live = new Simulation({ seed, grid: grid() });
    const script: Array<{ tick: number; cmd: Command }> = [
      { tick: 0, cmd: { type: 'spawnUnit', unit: 'tank', player: 0, at: at(0, 0) } },
      { tick: 0, cmd: { type: 'spawnUnit', unit: 'tank', player: 1, at: at(6, 1) } },
      { tick: 5, cmd: { type: 'spawnUnit', unit: 'rifleman', player: 0, at: at(-2, 0) } },
    ];
    let cursor = 0;
    const duration = 300;
    for (let tick = 0; tick <= duration; tick++) {
      recorder.maybeCheckpoint(tick, live.hash());
      while (cursor < script.length && script[cursor]!.tick === tick) {
        const c = script[cursor]!;
        live.enqueue(c.cmd);
        recorder.record(tick, c.cmd);
        cursor++;
      }
      if (tick < duration) live.step();
    }

    const replay = recorder.build(duration);
    const result = runReplay(replay);

    expect(result.desyncTick).toBeNull();
    expect(result.sim.hash()).toBe(live.hash());
    expect(result.sim.tick).toBe(live.tick);
  });

  it('flags a desync when a checksum is corrupted', () => {
    const recorder = new ReplayRecorder(1, { width: 32, height: 32, cellSize: 1 }, []);
    const sim = new Simulation({ seed: 1, grid: new NavGrid(32, 32, fp.fromInt(1)) });
    sim.enqueue({ type: 'spawnUnit', unit: 'tank', player: 0, at: at(0, 0) });
    recorder.record(0, { type: 'spawnUnit', unit: 'tank', player: 0, at: at(0, 0) });
    for (let tick = 0; tick <= 100; tick++) {
      recorder.maybeCheckpoint(tick, sim.hash());
      if (tick < 100) sim.step();
    }
    const replay = recorder.build(100);
    // Corrupt a checksum.
    replay.checksums[1]!.hash ^= 0xdead;
    expect(runReplay(replay).desyncTick).not.toBeNull();
  });
});
