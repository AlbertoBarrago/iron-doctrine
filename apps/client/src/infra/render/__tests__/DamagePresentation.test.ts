import { describe, expect, it } from 'vitest';
import {
  persistentDamagePresentation,
  shouldEmitDamageSmoke,
} from '../DamagePresentation.js';

describe('persistent damage presentation', () => {
  it('keeps healthy entities visually clean', () => {
    expect(persistentDamagePresentation(61, 100)).toEqual({
      stage: 'none',
      overlayAlpha: 0,
      smokeScale: 0,
    });
    expect(persistentDamagePresentation(0, 0).stage).toBe('none');
  });

  it('distinguishes damaged and critical health', () => {
    expect(persistentDamagePresentation(60, 100).stage).toBe('damaged');
    expect(persistentDamagePresentation(31, 100).stage).toBe('damaged');
    expect(persistentDamagePresentation(30, 100).stage).toBe('critical');
    expect(persistentDamagePresentation(1, 100)).toMatchObject({
      stage: 'critical',
      overlayAlpha: 0.48,
      smokeScale: 1,
    });
  });

  it('uses a stable, more frequent smoke cadence for critical entities', () => {
    const damagedTicks = Array.from({ length: 55 }, (_, tick) => tick).filter((tick) =>
      shouldEmitDamageSmoke('damaged', 3, tick),
    );
    const criticalTicks = Array.from({ length: 55 }, (_, tick) => tick).filter((tick) =>
      shouldEmitDamageSmoke('critical', 3, tick),
    );

    expect(damagedTicks).toHaveLength(5);
    expect(criticalTicks).toHaveLength(11);
    expect(shouldEmitDamageSmoke('none', 3, criticalTicks[0]!)).toBe(false);
  });
});
