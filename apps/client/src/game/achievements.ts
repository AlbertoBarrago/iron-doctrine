import type { MatchMetricsSnapshot } from '@iron/engine';
import { CAMPAIGN_MISSIONS, type CampaignMissionId } from './campaign.js';
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
export type AchievementDefinition = (typeof ACHIEVEMENTS)[number];

export function achievementTooltip(
  achievement: AchievementDefinition,
  unlocked: boolean,
  scope: 'commander' | 'operation' = 'commander',
): string {
  if (scope === 'operation') {
    return `${unlocked ? 'Earned in this operation' : 'Not earned in this operation'} — ${achievement.title}: ${achievement.description}`;
  }
  return `${unlocked ? 'Earned' : 'Locked'} — ${achievement.title}: ${achievement.description}`;
}

export interface AchievementProgress {
  version: 2;
  unlocked: AchievementId[];
  byMission: Partial<Record<CampaignMissionId, AchievementId[]>>;
}

const STORAGE_PREFIX = 'iron-doctrine.achievements.v2';
const LEGACY_STORAGE_PREFIX = 'iron-doctrine.achievements.v1';
const VALID_IDS = new Set<string>(ACHIEVEMENTS.map((achievement) => achievement.id));
const VALID_MISSIONS = new Set<string>(CAMPAIGN_MISSIONS.map((mission) => mission.id));
const EMPTY_PROGRESS: AchievementProgress = { version: 2, unlocked: [], byMission: {} };

export function loadAchievementProgress(
  storage: CampaignStorage,
  callsign: string,
): AchievementProgress {
  const current = parseProgress(storage.getItem(`${STORAGE_PREFIX}.${callsign}`));
  if (current) return current;
  const legacy = parseLegacyProgress(storage.getItem(`${LEGACY_STORAGE_PREFIX}.${callsign}`));
  return legacy ?? { ...EMPTY_PROGRESS, byMission: {} };
}

export function achievementsForMission(
  progress: AchievementProgress,
  mission: CampaignMissionId,
): readonly AchievementId[] {
  return progress.byMission[mission] ?? [];
}

function parseProgress(raw: string | null): AchievementProgress | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const unlocked = (value as { unlocked?: unknown }).unlocked;
    const byMission = (value as { byMission?: unknown }).byMission;
    if (!Array.isArray(unlocked) || !byMission || typeof byMission !== 'object') return null;
    return {
      version: 2,
      unlocked: validAchievementIds(unlocked),
      byMission: Object.fromEntries(
        Object.entries(byMission).flatMap(([mission, ids]) =>
          VALID_MISSIONS.has(mission) && Array.isArray(ids)
            ? [[mission, validAchievementIds(ids)]]
            : [],
        ),
      ) as AchievementProgress['byMission'],
    };
  } catch {
    return null;
  }
}

function parseLegacyProgress(raw: string | null): AchievementProgress | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const unlocked = (value as { unlocked?: unknown }).unlocked;
    if (!Array.isArray(unlocked)) return null;
    return { version: 2, unlocked: validAchievementIds(unlocked), byMission: {} };
  } catch {
    return null;
  }
}

function validAchievementIds(values: readonly unknown[]): AchievementId[] {
  return [...new Set(values.filter((id): id is AchievementId => VALID_IDS.has(String(id))))];
}

export function evaluateAchievements(
  storage: CampaignStorage,
  callsign: string,
  metrics: MatchMetricsSnapshot,
  victory: boolean,
  completedMissions: readonly CampaignMissionId[],
  mission: CampaignMissionId | null = null,
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
  const missionUnlocks = mission
    ? [...new Set([...(current.byMission[mission] ?? []), ...earned])]
    : [];
  const progress = {
    version: 2 as const,
    unlocked: [...current.unlocked, ...newlyUnlocked],
    byMission: mission
      ? {
          ...current.byMission,
          [mission]: missionUnlocks,
        }
      : current.byMission,
  };
  if (
    newlyUnlocked.length > 0 ||
    (mission !== null && missionUnlocks.length !== (current.byMission[mission]?.length ?? 0))
  ) {
    storage.setItem(`${STORAGE_PREFIX}.${callsign}`, JSON.stringify(progress));
  }
  return { progress, newlyUnlocked };
}
