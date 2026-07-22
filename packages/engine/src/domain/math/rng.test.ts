import { describe, it, expect } from 'vitest';
import { Random } from './rng.js';

describe('Random (Mulberry32)', () => {
  it('is deterministic for a given seed', () => {
    const a = new Random(12345);
    const b = new Random(12345);
    const seqA = Array.from({ length: 20 }, () => a.nextUint32());
    const seqB = Array.from({ length: 20 }, () => b.nextUint32());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new Random(1);
    const b = new Random(2);
    expect(a.nextUint32()).not.toBe(b.nextUint32());
  });

  it('save/restore state resumes the identical sequence', () => {
    const r = new Random(999);
    r.nextUint32();
    r.nextUint32();
    const saved = r.getState();
    const expected = [r.nextUint32(), r.nextUint32(), r.nextUint32()];

    const restored = new Random(0);
    restored.setState(saved);
    expect([restored.nextUint32(), restored.nextUint32(), restored.nextUint32()]).toEqual(expected);
  });

  it('nextInt stays within inclusive bounds', () => {
    const r = new Random(7);
    for (let i = 0; i < 1000; i++) {
      const n = r.nextInt(3, 9);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(9);
    }
  });

  it('chance is deterministic and roughly matches odds', () => {
    const r = new Random(42);
    let hits = 0;
    const trials = 10000;
    for (let i = 0; i < trials; i++) if (r.chance(1, 4)) hits++;
    expect(hits / trials).toBeGreaterThan(0.2);
    expect(hits / trials).toBeLessThan(0.3);
  });
});
