/**
 * Deterministic pseudo-random generator (Mulberry32).
 *
 * The simulation must NEVER call `Math.random()`. All randomness flows through a
 * seeded instance so that identical seed + identical command stream yields identical
 * state on every machine — the basis for lockstep, replays and desync detection.
 *
 * The internal state is a single 32-bit word, making save/restore trivial.
 */
export class Random {
  private state: number;

  constructor(seed: number) {
    // Force to uint32; guard against 0 collapsing sequences.
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** Serialize the generator state (for savegames). */
  getState(): number {
    return this.state;
  }

  /** Restore a previously serialized state. */
  setState(state: number): void {
    this.state = state >>> 0;
  }

  /** Next uint32. */
  nextUint32(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Float in [0, 1). Deterministic given state, but avoid using for sim state. */
  nextFloat(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }

  /** Integer in [min, max] inclusive. */
  nextInt(min: number, max: number): number {
    if (max < min) throw new Error('Random.nextInt: max < min');
    const span = max - min + 1;
    return min + (this.nextUint32() % span);
  }

  /** True with probability `numerator/denominator` (integer odds, fully deterministic). */
  chance(numerator: number, denominator: number): boolean {
    return this.nextUint32() % denominator < numerator;
  }

  fork(salt: number): Random {
    return new Random((this.state ^ Math.imul(salt | 1, 0x85ebca6b)) >>> 0);
  }
}
