import { describe, expect, it } from 'vitest';
import { asEntityId } from '@iron/shared';
import { MatchMetrics } from '../match-metrics.js';

describe('match metrics', () => {
  it('attributes first strike, damage and destruction by type', () => {
    const metrics = new MatchMetrics();
    metrics.recordDamage(0, 1, asEntityId(8), 35);
    metrics.recordDestroyed(asEntityId(8), 1, 'unit', 'rifleman');

    metrics.recordExplored(0, 42);
    expect(metrics.snapshot(0, 120)).toMatchObject({
      firstStrike: true,
      damageDealt: 35,
      unitsDestroyed: 1,
      destroyedByType: { rifleman: 1 },
      durationTicks: 120,
      exploredPercent: 42,
    });
    expect(metrics.snapshot(1, 120)).toMatchObject({
      firstStrike: false,
      damageTaken: 35,
      unitsLost: 1,
    });
  });

  it('tracks delivered ore without counting invalid deposits', () => {
    const metrics = new MatchMetrics();
    metrics.recordOreDelivered(0, 700);
    metrics.recordOreDelivered(0, 0);
    expect(metrics.snapshot(0, 0).oreDelivered).toBe(700);
  });

  it('does not credit unattributed destruction as a kill', () => {
    const metrics = new MatchMetrics();
    metrics.recordDestroyed(asEntityId(3), 0, 'building', 'factory');
    expect(metrics.snapshot(0, 0)).toMatchObject({
      structuresLost: 1,
      structuresDestroyed: 0,
    });
  });

  it('round-trips attribution state', () => {
    const metrics = new MatchMetrics();
    metrics.recordDamage(0, 1, asEntityId(9), 20);
    const loaded = new MatchMetrics();
    loaded.restore(metrics.serialize());
    loaded.recordDestroyed(asEntityId(9), 1, 'building', 'barracks');
    expect(loaded.snapshot(0, 10)).toMatchObject({
      structuresDestroyed: 1,
      destroyedByType: { barracks: 1 },
    });
  });
});
