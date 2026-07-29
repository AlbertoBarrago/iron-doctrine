import { describe, expect, it } from 'vitest';
import { groundSelectionCorners } from '../UnitPainter.js';

describe('unit ground selection', () => {
  it('rotates a vehicle footprint with its authored facing', () => {
    const east = groundSelectionCorners(100, 80, 12, 0, true);
    const south = groundSelectionCorners(100, 80, 12, Math.PI / 2, true);

    expect(east[0]?.x).toBeGreaterThan(east[0]?.y ?? Number.POSITIVE_INFINITY);
    expect(east[0]?.x).toBeCloseTo(120);
    expect(south[0]?.y).toBeCloseTo(100);
    expect(south[0]?.x).toBeGreaterThan(100);
  });

  it('keeps the compact infantry marker independent from facing', () => {
    expect(groundSelectionCorners(100, 80, 8, 0, false)).toEqual(
      groundSelectionCorners(100, 80, 8, Math.PI, false),
    );
  });
});
