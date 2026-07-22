import { describe, it, expect } from 'vitest';
import { computeFormationSlots } from './formation.js';
import * as fp from '../math/fixed.js';

const center = { x: fp.fromInt(10), y: fp.fromInt(10) };

describe('computeFormationSlots', () => {
  it('returns the centre for a single unit', () => {
    expect(computeFormationSlots(1, center, 2)).toEqual([center]);
  });

  it('produces one slot per unit', () => {
    for (const n of [2, 4, 5, 9, 16]) {
      expect(computeFormationSlots(n, center, 2)).toHaveLength(n);
    }
  });

  it('slots are distinct so units do not overlap', () => {
    const slots = computeFormationSlots(9, center, 2);
    const keys = new Set(slots.map((s) => `${s.x},${s.y}`));
    expect(keys.size).toBe(9);
  });

  it('is centred roughly on the target (mean ≈ centre)', () => {
    const slots = computeFormationSlots(4, center, 2);
    const mean = slots.reduce(
      (acc, s) => ({ x: acc.x + fp.toFloat(s.x), y: acc.y + fp.toFloat(s.y) }),
      { x: 0, y: 0 },
    );
    expect(mean.x / 4).toBeCloseTo(10, 5);
    expect(mean.y / 4).toBeCloseTo(10, 5);
  });

  it('is deterministic', () => {
    expect(computeFormationSlots(7, center, 2)).toEqual(computeFormationSlots(7, center, 2));
  });
});
