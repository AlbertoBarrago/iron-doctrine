import { describe, expect, it } from 'vitest';
import { engineerToolMotion, infantryMotion, shadeColor } from './renderStyle.js';

describe('battlefield render style', () => {
  it('shades every channel and clamps highlights', () => {
    expect(shadeColor(0x204060, 0.5)).toBe(0x102030);
    expect(shadeColor(0xe0f0ff, 2)).toBe(0xffffff);
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
