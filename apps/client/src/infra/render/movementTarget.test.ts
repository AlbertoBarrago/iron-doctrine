import { describe, expect, it } from 'vitest';
import { clampMovementTarget } from './movementTarget.js';

describe('movement target', () => {
  it('preserves targets inside the playable map', () => {
    expect(clampMovementTarget({ x: 3, y: -4 }, 20, 20, 1)).toEqual({ x: 3, y: -4 });
  });

  it('clamps targets to the centre of the outermost cells', () => {
    expect(clampMovementTarget({ x: -50, y: 50 }, 20, 12, 1)).toEqual({
      x: -9.5,
      y: 5.5,
    });
  });
});
