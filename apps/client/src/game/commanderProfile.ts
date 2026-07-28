import {
  migrateLegacyCampaignProgress,
  type CampaignStorage,
} from './campaignProgress.js';

const STORAGE_KEY = 'iron-doctrine.commanders.v1';
const CALLSIGN_PATTERN = /^[A-Z0-9]{3}$/;

export interface CommanderProfile {
  callsign: string;
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
    const callsigns = [
      ...new Set(
        data.profiles
          .map((profile) =>
            profile && typeof profile === 'object' && 'callsign' in profile
              ? normalizeCallsign(String(profile.callsign))
              : null,
          )
          .filter((callsign): callsign is string => callsign !== null),
      ),
    ];
    const requestedActive =
      typeof data.activeCallsign === 'string' ? normalizeCallsign(data.activeCallsign) : null;
    const activeCallsign =
      requestedActive && callsigns.includes(requestedActive)
        ? requestedActive
        : (callsigns[0] ?? null);
    return {
      version: 1,
      activeCallsign,
      profiles: callsigns.map((callsign) => ({ callsign })),
    };
  } catch {
    return EMPTY_PROFILES;
  }
}

export function createCommanderProfile(
  storage: CampaignStorage,
  value: string,
): CommanderProfiles {
  const callsign = normalizeCallsign(value);
  const current = loadCommanderProfiles(storage);
  if (!callsign) return current;
  const exists = current.profiles.some((profile) => profile.callsign === callsign);
  const next: CommanderProfiles = {
    version: 1,
    activeCallsign: callsign,
    profiles: exists ? current.profiles : [...current.profiles, { callsign }],
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  if (!exists && current.profiles.length === 0) migrateLegacyCampaignProgress(storage, callsign);
  return next;
}

export function selectCommanderProfile(
  storage: CampaignStorage,
  value: string,
): CommanderProfiles {
  const callsign = normalizeCallsign(value);
  const current = loadCommanderProfiles(storage);
  if (!callsign || !current.profiles.some((profile) => profile.callsign === callsign)) {
    return current;
  }
  const next = { ...current, activeCallsign: callsign };
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
