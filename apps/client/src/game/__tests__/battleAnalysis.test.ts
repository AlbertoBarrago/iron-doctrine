import { describe, expect, it } from 'vitest';
import type { MatchMetricsSnapshot } from '@iron/engine';
import { SIM_HZ } from '@iron/shared';
import { analyzeBattle } from '../battleAnalysis.js';

const metrics = (overrides: Partial<MatchMetricsSnapshot> = {}): MatchMetricsSnapshot => ({
  durationTicks: SIM_HZ * 60 * 10,
  firstStrike: false,
  exploredPercent: 70,
  damageDealt: 100,
  damageTaken: 100,
  unitsLost: 2,
  structuresLost: 0,
  unitsDestroyed: 3,
  structuresDestroyed: 0,
  oreDelivered: 0,
  destroyedByType: {},
  ...overrides,
});

describe('analyzeBattle', () => {
  it('highlights a fast, efficient and lossless victory', () => {
    expect(
      analyzeBattle(
        metrics({
          durationTicks: SIM_HZ * 60 * 7,
          damageDealt: 400,
          damageTaken: 100,
          unitsLost: 0,
        }),
        true,
      ),
    ).toEqual([
      'Decisive tempo: hostile command collapsed before minute eight.',
      'Excellent damage economy: at least 2 damage dealt for every 1 received.',
      'Zero personnel losses recorded.',
    ]);
  });

  it('caps the report at three observations', () => {
    expect(
      analyzeBattle(
        metrics({
          durationTicks: SIM_HZ * 60 * 20,
          damageDealt: 50,
          damageTaken: 100,
          exploredPercent: 20,
          unitsDestroyed: 10,
          unitsLost: 2,
        }),
        false,
      ),
    ).toHaveLength(3);
  });
});
