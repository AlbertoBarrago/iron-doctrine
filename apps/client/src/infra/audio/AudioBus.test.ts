import { describe, expect, it } from 'vitest';
import { normalizeVolume } from './AudioBus.js';

describe('audio volume', () => {
  it('clamps values to the supported range', () => {
    expect(normalizeVolume(-0.5)).toBe(0);
    expect(normalizeVolume(0.65)).toBe(0.65);
    expect(normalizeVolume(1.5)).toBe(1);
  });
});
