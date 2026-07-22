/**
 * Deterministic fixed-point arithmetic (Q16.16).
 *
 * All simulation-critical scalars (positions, velocities, health regen, ...) are
 * stored as 32-bit integers representing `realValue * 2^16`. Integer math is bit-exact
 * across CPUs/OSes/JS engines, which is the foundation of our deterministic lockstep,
 * replays and savegames. Never use raw floats for state that must sync over the wire.
 *
 * Note on {@link sqrt}: IEEE-754 mandates a correctly-rounded `Math.sqrt`, so it is
 * deterministic on all mainstream engines. Prefer squared-length comparisons (see
 * {@link Vec2}) in hot paths to avoid the operation entirely.
 */

/** A branded Q16.16 fixed-point value. */
export type Fixed = number & { readonly __fixed: unique symbol };

export const FP_SHIFT = 16;
/** 1.0 in fixed-point. */
export const FP_ONE = 1 << FP_SHIFT; // 65536
export const FP_HALF = FP_ONE >> 1;

const asFixed = (n: number): Fixed => n as Fixed;

/** Integer → fixed. */
export const fromInt = (n: number): Fixed => asFixed((n << FP_SHIFT) | 0);

/** Float → fixed (rounded). Use only at authoring/config boundaries, never per-tick. */
export const fromFloat = (f: number): Fixed => asFixed(Math.round(f * FP_ONE) | 0);

/** Fixed → float (lossy, for rendering/UI only). */
export const toFloat = (x: Fixed): number => x / FP_ONE;

/** Fixed → integer, truncated toward zero. */
export const toInt = (x: Fixed): number => Math.trunc(x / FP_ONE);

export const add = (a: Fixed, b: Fixed): Fixed => asFixed((a + b) | 0);
export const sub = (a: Fixed, b: Fixed): Fixed => asFixed((a - b) | 0);
export const neg = (a: Fixed): Fixed => asFixed(-a | 0);

/** Multiply. Intermediate stays within 2^53, result truncated toward zero. */
export const mul = (a: Fixed, b: Fixed): Fixed => asFixed(Math.trunc((a * b) / FP_ONE) | 0);

/** Divide. Throws on divide-by-zero to avoid silent NaN propagation into state. */
export const div = (a: Fixed, b: Fixed): Fixed => {
  if (b === 0) throw new Error('fixed.div: divide by zero');
  return asFixed(Math.trunc((a * FP_ONE) / b) | 0);
};

export const abs = (a: Fixed): Fixed => asFixed(a < 0 ? (-a | 0) : a);
export const min = (a: Fixed, b: Fixed): Fixed => (a < b ? a : b);
export const max = (a: Fixed, b: Fixed): Fixed => (a > b ? a : b);

export const clamp = (x: Fixed, lo: Fixed, hi: Fixed): Fixed =>
  x < lo ? lo : x > hi ? hi : x;

/** Square root of a fixed value, returned as fixed. */
export const sqrt = (x: Fixed): Fixed => {
  if (x <= 0) return asFixed(0);
  // sqrt(x/ONE)*ONE === sqrt(x*ONE). x*ONE stays within 2^53 for game-scale magnitudes.
  return asFixed(Math.round(Math.sqrt(x * FP_ONE)) | 0);
};

/** Linear interpolation; `t` is fixed in [0,1]. */
export const lerp = (a: Fixed, b: Fixed, t: Fixed): Fixed => add(a, mul(sub(b, a), t));

export const eq = (a: Fixed, b: Fixed): boolean => a === b;

/** Common literals. */
export const FP = {
  ZERO: asFixed(0),
  ONE: asFixed(FP_ONE),
  HALF: asFixed(FP_HALF),
} as const;
