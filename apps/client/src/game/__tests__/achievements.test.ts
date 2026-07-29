import { describe, expect, it } from 'vitest';
import type { MatchMetricsSnapshot } from '@iron/engine';
import {
  ACHIEVEMENTS,
  achievementTooltip,
  evaluateAchievements,
  loadAchievementProgress,
} from '../achievements.js';
import type { CampaignStorage } from '../campaignProgress.js';

const metrics = (overrides: Partial<MatchMetricsSnapshot> = {}): MatchMetricsSnapshot => ({
  durationTicks: 1_200,
  firstStrike: false,
  exploredPercent: 50,
  damageDealt: 0,
  damageTaken: 0,
  unitsLost: 1,
  structuresLost: 0,
  unitsDestroyed: 0,
  structuresDestroyed: 0,
  oreDelivered: 0,
  destroyedByType: {},
  ...overrides,
});

const memoryStorage = (): CampaignStorage => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};

describe('commander achievements', () => {
  it('describes locked and earned decorations for hover and keyboard focus', () => {
    const cartographer = ACHIEVEMENTS[0];
    expect(achievementTooltip(cartographer, false)).toContain('Locked — Cartographer');
    expect(achievementTooltip(cartographer, true)).toContain('Earned — Cartographer');
  });

  it('unlocks metric-based decorations idempotently', () => {
    const storage = memoryStorage();
    const report = metrics({
      firstStrike: true,
      exploredPercent: 100,
      unitsDestroyed: 12,
      unitsLost: 0,
      oreDelivered: 3_400,
    });
    const first = evaluateAchievements(storage, 'FOX', report, true, []);
    expect(first.newlyUnlocked).toEqual([
      'cartographer',
      'first_strike',
      'vanguard',
      'gold_rush',
      'untouchable',
    ]);
    expect(evaluateAchievements(storage, 'FOX', report, true, []).newlyUnlocked).toEqual([]);
  });

  it('unlocks Campaign Veteran from profile-scoped completion', () => {
    const storage = memoryStorage();
    const completed = [
      'base_foundations',
      'first_contact',
      'iron_pass',
      'siege_line',
      'black_dawn',
    ] as const;
    expect(
      evaluateAchievements(storage, 'FOX', metrics(), true, completed).newlyUnlocked,
    ).toContain('campaign_veteran');
    expect(loadAchievementProgress(storage, 'OWL').unlocked).toEqual([]);
  });

  it('does not grant victory trophies on defeat', () => {
    const storage = memoryStorage();
    const result = evaluateAchievements(
      storage,
      'FOX',
      metrics({ unitsDestroyed: 20, unitsLost: 0 }),
      false,
      [],
    );
    expect(result.newlyUnlocked).not.toContain('vanguard');
    expect(result.newlyUnlocked).not.toContain('untouchable');
  });
});
