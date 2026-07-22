import { describe, it, expect } from 'vitest';
import * as v2 from './vec2.js';
import * as fp from './fixed.js';

const vi = (x: number, y: number) => v2.vec2(fp.fromInt(x), fp.fromInt(y));

describe('vec2 (fixed-point)', () => {
  it('adds and subtracts', () => {
    const r = v2.add(vi(2, 3), vi(4, 5));
    expect(fp.toInt(r.x)).toBe(6);
    expect(fp.toInt(r.y)).toBe(8);
  });

  it('computes squared distance for range checks', () => {
    const d = v2.distSq(vi(0, 0), vi(3, 4));
    expect(fp.toInt(d)).toBe(25);
  });

  it('computes euclidean distance', () => {
    const d = v2.dist(vi(0, 0), vi(3, 4));
    expect(fp.toInt(d)).toBe(5);
  });

  it('normalizes to unit length', () => {
    const n = v2.normalize(vi(3, 4));
    expect(fp.toFloat(v2.len(n))).toBeCloseTo(1, 2);
  });

  it('normalize of zero returns zero (no NaN)', () => {
    const n = v2.normalize(v2.zero());
    expect(n.x).toBe(fp.FP.ZERO);
    expect(n.y).toBe(fp.FP.ZERO);
  });
});
