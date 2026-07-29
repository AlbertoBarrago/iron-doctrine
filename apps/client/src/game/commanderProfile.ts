import { migrateLegacyCampaignProgress, type CampaignStorage } from './campaignProgress.js';

const STORAGE_KEY = 'iron-doctrine.commanders.v1';
const CALLSIGN_PATTERN = /^[A-Z0-9]{3}$/;
const CHICKEN_MATCH_INTERVAL = 7;

export interface CommanderProfile {
  callsign: string;
  completedMatches: number;
  chickenEventsSeen: number;
}

export interface CommanderProfiles {
  version: 1;
  activeCallsign: string | null;
  profiles: CommanderProfile[];
}

const EMPTY_PROFILES: CommanderProfiles = {
  version: 1,
  activeCallsign: null,
  profiles: [],
};

export function normalizeCallsign(value: string): string | null {
  const callsign = value.trim().toUpperCase();
  return CALLSIGN_PATTERN.test(callsign) ? callsign : null;
}

export function loadCommanderProfiles(storage: CampaignStorage): CommanderProfiles {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return EMPTY_PROFILES;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return EMPTY_PROFILES;
    const data = value as { version?: unknown; activeCallsign?: unknown; profiles?: unknown };
    if (data.version !== 1 || !Array.isArray(data.profiles)) return EMPTY_PROFILES;
    const profiles: CommanderProfile[] = [];
    for (const rawProfile of data.profiles) {
      if (!rawProfile || typeof rawProfile !== 'object' || !('callsign' in rawProfile)) continue;
      const profile = rawProfile as {
        callsign: unknown;
        completedMatches?: unknown;
        chickenEventsSeen?: unknown;
      };
      const callsign = normalizeCallsign(String(profile.callsign));
      if (!callsign || profiles.some((candidate) => candidate.callsign === callsign)) continue;
      profiles.push({
        callsign,
        completedMatches: nonNegativeInteger(profile.completedMatches),
        chickenEventsSeen: nonNegativeInteger(profile.chickenEventsSeen),
      });
    }
    const callsigns = profiles.map((profile) => profile.callsign);
    const requestedActive =
      typeof data.activeCallsign === 'string' ? normalizeCallsign(data.activeCallsign) : null;
    const activeCallsign =
      requestedActive && callsigns.includes(requestedActive)
        ? requestedActive
        : (callsigns[0] ?? null);
    return {
      version: 1,
      activeCallsign,
      profiles,
    };
  } catch {
    return EMPTY_PROFILES;
  }
}

export function createCommanderProfile(storage: CampaignStorage, value: string): CommanderProfiles {
  const callsign = normalizeCallsign(value);
  const current = loadCommanderProfiles(storage);
  if (!callsign) return current;
  const exists = current.profiles.some((profile) => profile.callsign === callsign);
  const next: CommanderProfiles = {
    version: 1,
    activeCallsign: callsign,
    profiles: exists
      ? current.profiles
      : [...current.profiles, { callsign, completedMatches: 0, chickenEventsSeen: 0 }],
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  if (!exists && current.profiles.length === 0) migrateLegacyCampaignProgress(storage, callsign);
  return next;
}

export function selectCommanderProfile(storage: CampaignStorage, value: string): CommanderProfiles {
  const callsign = normalizeCallsign(value);
  const current = loadCommanderProfiles(storage);
  if (!callsign || !current.profiles.some((profile) => profile.callsign === callsign)) {
    return current;
  }
  const next = { ...current, activeCallsign: callsign };
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function recordCompletedMatch(storage: CampaignStorage, value: string): CommanderProfiles {
  const callsign = normalizeCallsign(value);
  const current = loadCommanderProfiles(storage);
  if (!callsign) return current;
  const profile = current.profiles.find((candidate) => candidate.callsign === callsign);
  if (!profile) return current;
  const next = {
    ...current,
    profiles: current.profiles.map((candidate) =>
      candidate.callsign === callsign
        ? { ...candidate, completedMatches: candidate.completedMatches + 1 }
        : candidate,
    ),
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

/**
 * Reserves one pending cosmetic event for the next deployment. Consuming at deployment
 * prevents React remounts and mission restarts from replaying the same earned event.
 */
export function consumeChickenEasterEgg(storage: CampaignStorage, value: string): boolean {
  const callsign = normalizeCallsign(value);
  const current = loadCommanderProfiles(storage);
  if (!callsign) return false;
  const profile = current.profiles.find((candidate) => candidate.callsign === callsign);
  if (!profile) return false;
  const earnedEvents = Math.floor(profile.completedMatches / CHICKEN_MATCH_INTERVAL);
  if (profile.chickenEventsSeen >= earnedEvents) return false;
  const next = {
    ...current,
    profiles: current.profiles.map((candidate) =>
      candidate.callsign === callsign
        ? { ...candidate, chickenEventsSeen: candidate.chickenEventsSeen + 1 }
        : candidate,
    ),
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return true;
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
