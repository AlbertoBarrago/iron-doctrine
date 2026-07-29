import { describe, expect, it } from 'vitest';
import {
  engineerToolMotion,
  infantryMotion,
  materialRamp,
  shadeColor,
  spriteFactionTint,
} from '../renderStyle.js';

describe('battlefield render style', () => {
  it('shades every channel and clamps highlights', () => {
    expect(shadeColor(0x204060, 0.5)).toBe(0x102030);
    expect(shadeColor(0xe0f0ff, 2)).toBe(0xffffff);
  });

  it('builds a stable four-step material ramp from a faction color', () => {
    const ramp = materialRamp(0x607050);
    expect(ramp).toEqual({
      shadow: 0x2e3626,
      base: 0x4b573e,
      light: 0x687956,
      edge: 0x81966b,
    });
  });

  it('lightens owner colors into material-preserving sprite tints', () => {
    expect(spriteFactionTint(0xb0a149)).toBe(0xd1c895);
    expect(spriteFactionTint(0xa9412e)).toBe(0xcd9186);
  });

  it('keeps idle infantry stable and applies firing recoil independently', () => {
    expect(infantryMotion(1, false, false)).toEqual({ gait: 0, bob: 0, recoil: 0 });
    expect(infantryMotion(1, false, true)).toEqual({ gait: 0, bob: 0, recoil: 0.16 });
    expect(infantryMotion(0, true, false).bob).toBeGreaterThan(0);
  });

  it('animates an idle engineer tool without affecting movement', () => {
    expect(engineerToolMotion(0.5, false).swing).not.toBe(0);
    expect(engineerToolMotion(0.5, true)).toEqual({ swing: 0, pulse: 0 });
    expect(engineerToolMotion(0.95, false).pulse).toBeGreaterThan(0);
  });
});
