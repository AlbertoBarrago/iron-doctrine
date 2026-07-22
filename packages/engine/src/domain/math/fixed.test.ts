import { describe, it, expect } from 'vitest';
import * as fp from './fixed.js';

describe('fixed-point Q16.16', () => {
  it('round-trips integers exactly', () => {
    for (const n of [0, 1, -1, 42, -1000, 32767]) {
      expect(fp.toInt(fp.fromInt(n))).toBe(n);
    }
  });

  it('round-trips floats within resolution', () => {
    const x = fp.fromFloat(3.5);
    expect(fp.toFloat(x)).toBeCloseTo(3.5, 4);
  });

  it('adds and subtracts exactly', () => {
    const a = fp.fromInt(10);
    const b = fp.fromInt(3);
    expect(fp.toInt(fp.add(a, b))).toBe(13);
    expect(fp.toInt(fp.sub(a, b))).toBe(7);
  });

  it('multiplies fractional values', () => {
    const half = fp.FP.HALF;
    const four = fp.fromInt(4);
    expect(fp.toInt(fp.mul(half, four))).toBe(2);
  });

  it('divides and truncates toward zero', () => {
    const seven = fp.fromInt(7);
    const two = fp.fromInt(2);
    expect(fp.toFloat(fp.div(seven, two))).toBeCloseTo(3.5, 4);
  });

  it('throws on divide by zero', () => {
    expect(() => fp.div(fp.fromInt(1), fp.FP.ZERO)).toThrow(/divide by zero/);
  });

  it('computes sqrt', () => {
    expect(fp.toFloat(fp.sqrt(fp.fromInt(9)))).toBeCloseTo(3, 3);
    expect(fp.toFloat(fp.sqrt(fp.fromInt(2)))).toBeCloseTo(Math.SQRT2, 3);
    expect(fp.sqrt(fp.fromInt(-5))).toBe(fp.FP.ZERO);
  });

  it('clamps', () => {
    const lo = fp.fromInt(0);
    const hi = fp.fromInt(10);
    expect(fp.clamp(fp.fromInt(-3), lo, hi)).toBe(lo);
    expect(fp.clamp(fp.fromInt(15), lo, hi)).toBe(hi);
    expect(fp.toInt(fp.clamp(fp.fromInt(5), lo, hi))).toBe(5);
  });

  it('is bit-exact and integer-valued for a fixed operation sequence (determinism)', () => {
    const run = () => {
      let acc = fp.fromInt(1);
      for (let i = 1; i <= 50; i++) {
        acc = fp.add(fp.mul(acc, fp.fromFloat(1.1)), fp.fromInt(i));
      }
      return acc;
    };
    const a = run();
    const b = run();
    // Result must be a 32-bit integer (never a float) and reproducible.
    expect(Number.isInteger(a)).toBe(true);
    expect(a | 0).toBe(a);
    expect(a).toBe(b);
  });
});
