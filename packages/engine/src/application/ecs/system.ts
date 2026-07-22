/**
 * System contract and the per-tick context passed to every system.
 *
 * The context is the ONLY channel through which time and randomness enter the
 * simulation — systems must never read wall-clock time or `Math.random()`. This
 * keeps the tick a pure function of (World, TickContext, commands).
 */
import type { World } from './world.js';
import type { Random } from '../../domain/math/rng.js';
import type { Fixed } from '../../domain/math/fixed.js';
import type { Tick } from '@iron/shared';

export interface TickContext {
  /** Current simulation tick (monotonic). */
  readonly tick: Tick;
  /** Fixed timestep in seconds, as fixed-point. */
  readonly dt: Fixed;
  /** Seeded PRNG for this simulation. */
  readonly rng: Random;
}

export interface System {
  readonly name: string;
  update(world: World, ctx: TickContext): void;
}
