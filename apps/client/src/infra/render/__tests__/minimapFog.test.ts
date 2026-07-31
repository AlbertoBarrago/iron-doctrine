import { describe, expect, it } from 'vitest';
import { minimapTerrainColor } from '../minimapFog.js';

describe('minimap fog presentation', () => {
  it('keeps terrain readable independently of battlefield visibility', () => {
    expect(minimapTerrainColor(0, false)).toBe(minimapTerrainColor(2, false));
    expect(minimapTerrainColor(0, true)).toBe(minimapTerrainColor(2, true));
    expect(minimapTerrainColor(0, true)).not.toBe(minimapTerrainColor(0, false));
  });
});
