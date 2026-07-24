import type { CampaignMission, CampaignMissionId } from './campaign.js';

const STORAGE_KEY = 'iron-doctrine.campaign.v1';

export interface CampaignProgress {
  completed: CampaignMissionId[];
}

export interface CampaignStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const EMPTY_PROGRESS: CampaignProgress = { completed: [] };

export function loadCampaignProgress(storage: CampaignStorage): CampaignProgress {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return EMPTY_PROGRESS;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return EMPTY_PROGRESS;
    const completed = (value as { completed?: unknown }).completed;
    if (!Array.isArray(completed) || !completed.every((entry) => typeof entry === 'string')) {
      return EMPTY_PROGRESS;
    }
    return { completed: [...new Set(completed)] as CampaignMissionId[] };
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function completeCampaignMission(
  storage: CampaignStorage,
  mission: CampaignMissionId,
): CampaignProgress {
  const current = loadCampaignProgress(storage);
  if (current.completed.includes(mission)) return current;
  const next = { completed: [...current.completed, mission] };
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export type CampaignMissionStatus = 'completed' | 'available' | 'classified';

export function campaignMissionStatus(
  mission: CampaignMission,
  progress: CampaignProgress,
): CampaignMissionStatus {
  if (progress.completed.includes(mission.id)) return 'completed';
  if (!mission.runtimeMission) return 'classified';
  if (!mission.prerequisite || progress.completed.includes(mission.prerequisite)) {
    return 'available';
  }
  return 'classified';
}
