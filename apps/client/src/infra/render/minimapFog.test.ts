import { describe, expect, it } from 'vitest';
import { minimapTerrainColor } from './minimapFog.js';

describe('minimap fog presentation', () => {
  it('keeps undiscovered terrain fully black', () => {
    expect(minimapTerrainColor(0, false)).toBe('#000000');
    expect(minimapTerrainColor(0, true)).toBe('#000000');
  });

  it('distinguishes remembered terrain from current visibility', () => {
    expect(minimapTerrainColor(1, false)).not.toBe(minimapTerrainColor(2, false));
    expect(minimapTerrainColor(1, true)).not.toBe(minimapTerrainColor(1, false));
  });
});
