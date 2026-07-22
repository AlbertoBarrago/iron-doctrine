/**
 * Fixed-point 2D vector helpers. Vectors are plain `{ x, y }` of {@link Fixed}
 * so they serialize trivially and live directly inside component stores.
 */
import * as fp from './fixed.js';
import type { Fixed } from './fixed.js';

export interface Vec2 {
  x: Fixed;
  y: Fixed;
}

export const vec2 = (x: Fixed, y: Fixed): Vec2 => ({ x, y });
export const zero = (): Vec2 => ({ x: fp.FP.ZERO, y: fp.FP.ZERO });
export const clone = (v: Vec2): Vec2 => ({ x: v.x, y: v.y });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: fp.add(a.x, b.x), y: fp.add(a.y, b.y) });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: fp.sub(a.x, b.x), y: fp.sub(a.y, b.y) });
export const scale = (a: Vec2, s: Fixed): Vec2 => ({ x: fp.mul(a.x, s), y: fp.mul(a.y, s) });

export const dot = (a: Vec2, b: Vec2): Fixed => fp.add(fp.mul(a.x, b.x), fp.mul(a.y, b.y));

/** Squared length — cheap, use for range comparisons instead of {@link len}. */
export const lenSq = (a: Vec2): Fixed => dot(a, a);
export const len = (a: Vec2): Fixed => fp.sqrt(lenSq(a));

export const distSq = (a: Vec2, b: Vec2): Fixed => lenSq(sub(a, b));
export const dist = (a: Vec2, b: Vec2): Fixed => fp.sqrt(distSq(a, b));

/** Unit vector; returns zero for a zero-length input (no NaN). */
export const normalize = (a: Vec2): Vec2 => {
  const l = len(a);
  if (l === 0) return zero();
  return { x: fp.div(a.x, l), y: fp.div(a.y, l) };
};

export const equals = (a: Vec2, b: Vec2): boolean => a.x === b.x && a.y === b.y;
