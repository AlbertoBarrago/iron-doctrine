/**
 * Replay system. A replay is not a recording of frames — it is the seed plus the
 * ordered command log. Because the simulation is deterministic, re-running the same
 * commands from the same seed reproduces the match exactly. Periodic checksums verify
 * that a replay still matches (a mismatch flags a replay-breaking engine change).
 *
 * The same machinery powers spectating and desync recovery (resim from a checkpoint).
 */
import { Simulation } from '../simulation.js';
import { NavGrid } from '../pathfinding/nav-grid.js';
import * as fp from '../../domain/math/fixed.js';
import { REPLAY_VERSION } from '@iron/shared';
import type { Command } from '../commands/command.js';
import type { AIPlayerConfig } from '../ai/ai-director.js';

export interface ReplayCommand {
  /** Tick at which this command was enqueued (applied on the following step). */
  tick: number;
  cmd: Command;
}

export interface Replay {
  format: 'iron-doctrine.replay';
  version: number;
  seed: number;
  aiPlayers: AIPlayerConfig[];
  grid: { width: number; height: number; cellSize: number };
  durationTicks: number;
  commands: ReplayCommand[];
  checksums: Array<{ tick: number; hash: number }>;
}

/** Records a match's command stream and periodic checksums into a replay. */
export class ReplayRecorder {
  private readonly commands: ReplayCommand[] = [];
  private readonly checksums: Array<{ tick: number; hash: number }> = [];

  constructor(
    private readonly seed: number,
    private readonly grid: { width: number; height: number; cellSize: number },
    private readonly aiPlayers: AIPlayerConfig[] = [],
    private readonly checksumInterval = 100,
  ) {}

  /** Record a command enqueued at the given tick. */
  record(tick: number, cmd: Command): void {
    this.commands.push({ tick, cmd });
  }

  /** Record a checksum if this tick lands on the interval. */
  maybeCheckpoint(tick: number, hash: number): void {
    if (tick % this.checksumInterval === 0) this.checksums.push({ tick, hash });
  }

  build(durationTicks: number): Replay {
    return {
      format: 'iron-doctrine.replay',
      version: REPLAY_VERSION,
      seed: this.seed,
      aiPlayers: this.aiPlayers,
      grid: this.grid,
      durationTicks,
      commands: [...this.commands],
      checksums: [...this.checksums],
    };
  }
}

export interface ReplayResult {
  sim: Simulation;
  /** First tick where a recorded checksum disagreed, or null if fully consistent. */
  desyncTick: number | null;
}

/**
 * Re-simulate a replay to completion, applying commands on their recorded ticks and
 * verifying checksums along the way.
 */
export function runReplay(replay: Replay): ReplayResult {
  if (replay.format !== 'iron-doctrine.replay') throw new Error('runReplay: bad format');

  const grid = new NavGrid(replay.grid.width, replay.grid.height, fp.fromFloat(replay.grid.cellSize));
  const sim = new Simulation({ seed: replay.seed, grid, aiPlayers: replay.aiPlayers });

  // Bucket commands by the tick they were enqueued at.
  const byTick = new Map<number, Command[]>();
  for (const { tick, cmd } of replay.commands) {
    const list = byTick.get(tick) ?? [];
    list.push(cmd);
    byTick.set(tick, list);
  }
  const checkByTick = new Map<number, number>();
  for (const c of replay.checksums) checkByTick.set(c.tick, c.hash);

  let desyncTick: number | null = null;
  for (let tick = 0; tick <= replay.durationTicks; tick++) {
    const expected = checkByTick.get(tick);
    if (expected !== undefined && desyncTick === null && sim.hash() !== expected) {
      desyncTick = tick;
    }
    for (const cmd of byTick.get(tick) ?? []) sim.enqueue(cmd);
    if (tick < replay.durationTicks) sim.step();
  }
  return { sim, desyncTick };
}
