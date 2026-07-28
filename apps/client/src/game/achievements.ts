import type { MatchMetricsSnapshot } from '@iron/engine';
import type { CampaignMissionId } from './campaign.js';
import type { CampaignStorage } from './campaignProgress.js';

export const ACHIEVEMENTS = [
  {
    id: 'cartographer',
    title: 'Cartographer',
    description: 'Explore the entire battlefield in one operation.',
  },
  {
    id: 'first_strike',
    title: 'First Strike',
    description: 'Inflict the first combat damage of an operation.',
  },
  {
    id: 'vanguard',
    title: 'Vanguard',
    description: 'Win after destroying at least 10 hostile units.',
  },
  {
    id: 'gold_rush',
    title: 'Gold Rush',
    description: 'Deliver at least 3,000 ore in one operation.',
  },
  {
    id: 'untouchable',
    title: 'Untouchable',
    description: 'Win an operation without losing a unit.',
  },
  {
    id: 'campaign_veteran',
    title: 'Campaign Veteran',
    description: 'Clear all five First Contact operations.',
  },
] as const;

export type AchievementId = (typeof ACHIEVEMENTS)[number]['id'];

export interface AchievementProgress {
  version: 1;
  unlocked: AchievementId[];
}

const STORAGE_PREFIX = 'iron-doctrine.achievements.v1';
const VALID_IDS = new Set<string>(ACHIEVEMENTS.map((achievement) => achievement.id));

export function loadAchievementProgress(
  storage: CampaignStorage,
  callsign: string,
): AchievementProgress {
  const raw = storage.getItem(`${STORAGE_PREFIX}.${callsign}`);
  if (!raw) return { version: 1, unlocked: [] };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return { version: 1, unlocked: [] };
    const unlocked = (value as { unlocked?: unknown }).unlocked;
    if (!Array.isArray(unlocked)) return { version: 1, unlocked: [] };
    return {
      version: 1,
      unlocked: [...new Set(unlocked.filter((id): id is AchievementId => VALID_IDS.has(String(id))))],
    };
  } catch {
    return { version: 1, unlocked: [] };
  }
}

export function evaluateAchievements(
  storage: CampaignStorage,
  callsign: string,
  metrics: MatchMetricsSnapshot,
  victory: boolean,
  completedMissions: readonly CampaignMissionId[],
): { progress: AchievementProgress; newlyUnlocked: AchievementId[] } {
  const current = loadAchievementProgress(storage, callsign);
  const earned = new Set<AchievementId>();
  if (metrics.exploredPercent >= 99.5) earned.add('cartographer');
  if (metrics.firstStrike) earned.add('first_strike');
  if (victory && metrics.unitsDestroyed >= 10) earned.add('vanguard');
  if (metrics.oreDelivered >= 3_000) earned.add('gold_rush');
  if (victory && metrics.unitsLost === 0) earned.add('untouchable');
  if (new Set(completedMissions).size >= 5) earned.add('campaign_veteran');

  const newlyUnlocked = [...earned].filter((id) => !current.unlocked.includes(id));
  const progress = {
    version: 1 as const,
    unlocked: [...current.unlocked, ...newlyUnlocked],
  };
  if (newlyUnlocked.length > 0) {
    storage.setItem(`${STORAGE_PREFIX}.${callsign}`, JSON.stringify(progress));
  }
  return { progress, newlyUnlocked };
}
