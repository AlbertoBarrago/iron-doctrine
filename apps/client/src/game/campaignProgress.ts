import type { CampaignMission, CampaignMissionId } from './campaign.js';

const LEGACY_STORAGE_KEY = 'iron-doctrine.campaign.v1';
const PROFILE_STORAGE_PREFIX = 'iron-doctrine.campaign.v2';

export interface CampaignProgress {
  completed: CampaignMissionId[];
}

export interface CampaignStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const EMPTY_PROGRESS: CampaignProgress = { completed: [] };

export function loadCampaignProgress(
  storage: CampaignStorage,
  callsign: string,
): CampaignProgress {
  return parseProgress(storage.getItem(profileStorageKey(callsign)));
}

function loadLegacyCampaignProgress(storage: CampaignStorage): CampaignProgress {
  return parseProgress(storage.getItem(LEGACY_STORAGE_KEY));
}

function parseProgress(raw: string | null): CampaignProgress {
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
  callsign: string,
  mission: CampaignMissionId,
): CampaignProgress {
  const current = loadCampaignProgress(storage, callsign);
  if (current.completed.includes(mission)) return current;
  const next = { completed: [...current.completed, mission] };
  storage.setItem(profileStorageKey(callsign), JSON.stringify(next));
  return next;
}

export function migrateLegacyCampaignProgress(
  storage: CampaignStorage,
  callsign: string,
): CampaignProgress {
  const key = profileStorageKey(callsign);
  const existing = storage.getItem(key);
  if (existing !== null) return parseProgress(existing);
  const legacy = loadLegacyCampaignProgress(storage);
  storage.setItem(key, JSON.stringify(legacy));
  return legacy;
}

function profileStorageKey(callsign: string): string {
  return `${PROFILE_STORAGE_PREFIX}.${callsign}`;
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
