import { describe, expect, it } from 'vitest';
import { resourceFieldPresentation } from '../ResourcePainter.js';

describe('resource field presentation', () => {
  it('maps authoritative depletion to stable visual density', () => {
    expect(resourceFieldPresentation(1000, 1000, 7, 10, false)).toMatchObject({
      richness: 1,
      fragmentCount: 7,
      fragmentScale: 1,
      scarAlpha: 0.28,
      harvestPulse: 0,
    });

    const half = resourceFieldPresentation(500, 1000, 7, 10, false);
    const scarce = resourceFieldPresentation(100, 1000, 7, 10, false);
    expect(half.fragmentCount).toBe(4);
    expect(scarce.fragmentCount).toBe(1);
    expect(half.fragmentScale).toBeGreaterThan(scarce.fragmentScale);
    expect(half.scarAlpha).toBeLessThan(scarce.scarAlpha);
  });

  it('clamps invalid amounts without leaking invalid render values', () => {
    expect(resourceFieldPresentation(-20, 0, 1, 0, false)).toMatchObject({
      richness: 0,
      fragmentCount: 0,
    });
    expect(resourceFieldPresentation(1200, 1000, 1, 0, false).richness).toBe(1);
  });

  it('animates only active harvesting and freezes with presentation time', () => {
    const idle = resourceFieldPresentation(800, 1000, 11, 3.2, false);
    const active = resourceFieldPresentation(800, 1000, 11, 3.2, true);
    const frozen = resourceFieldPresentation(800, 1000, 11, 3.2, true);
    const advanced = resourceFieldPresentation(800, 1000, 11, 3.3, true);

    expect(idle.harvestPulse).toBe(0);
    expect(active).toEqual(frozen);
    expect(advanced.harvestPulse).not.toBe(active.harvestPulse);
  });

  it('keeps animation phase deterministic per resource identity', () => {
    expect(resourceFieldPresentation(800, 1000, 11, 4, true)).toEqual(
      resourceFieldPresentation(800, 1000, 11, 4, true),
    );
    expect(resourceFieldPresentation(800, 1000, 11, 4, true).harvestPulse).not.toBe(
      resourceFieldPresentation(800, 1000, 12, 4, true).harvestPulse,
    );
  });
});
