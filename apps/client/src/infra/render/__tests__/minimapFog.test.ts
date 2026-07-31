import { describe, expect, it } from 'vitest';
import { minimapTerrainColor } from '../minimapFog.js';

describe('minimap fog presentation', () => {
  it('keeps never-explored terrain hidden', () => {
    expect(minimapTerrainColor(0, false)).toBe('#000000');
    expect(minimapTerrainColor(0, true)).toBe('#000000');
  });

  it('keeps explored terrain readable without exposing current visibility', () => {
    expect(minimapTerrainColor(1, false)).toBe(minimapTerrainColor(2, false));
    expect(minimapTerrainColor(1, true)).toBe(minimapTerrainColor(2, true));
    expect(minimapTerrainColor(1, true)).not.toBe(minimapTerrainColor(1, false));
  });
});
