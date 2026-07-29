import { describe, expect, it } from 'vitest';
import {
  createCommanderProfile,
  consumeChickenEasterEgg,
  loadCommanderProfiles,
  normalizeCallsign,
  recordCompletedMatch,
  selectCommanderProfile,
} from '../commanderProfile.js';
import { loadCampaignProgress, type CampaignStorage } from '../campaignProgress.js';

function memoryStorage(initial: Record<string, string> = {}): CampaignStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe('commander profiles', () => {
  it('normalizes exact three-character alphanumeric callsigns', () => {
    expect(normalizeCallsign(' fox ')).toBe('FOX');
    expect(normalizeCallsign('a7x')).toBe('A7X');
    expect(normalizeCallsign('AB')).toBeNull();
    expect(normalizeCallsign('A-B')).toBeNull();
  });

  it('creates, deduplicates and selects profiles', () => {
    const storage = memoryStorage();
    createCommanderProfile(storage, 'fox');
    createCommanderProfile(storage, 'owl');
    createCommanderProfile(storage, 'FOX');
    expect(loadCommanderProfiles(storage)).toEqual({
      version: 1,
      activeCallsign: 'FOX',
      profiles: [
        { callsign: 'FOX', completedMatches: 0, chickenEventsSeen: 0 },
        { callsign: 'OWL', completedMatches: 0, chickenEventsSeen: 0 },
      ],
    });
    expect(selectCommanderProfile(storage, 'OWL').activeCallsign).toBe('OWL');
  });

  it('migrates legacy campaign progress only into the first profile', () => {
    const storage = memoryStorage({
      'iron-doctrine.campaign.v1': JSON.stringify({
        completed: ['base_foundations', 'first_contact'],
      }),
    });
    createCommanderProfile(storage, 'FOX');
    createCommanderProfile(storage, 'OWL');
    expect(loadCampaignProgress(storage, 'FOX').completed).toEqual([
      'base_foundations',
      'first_contact',
    ]);
    expect(loadCampaignProgress(storage, 'OWL').completed).toEqual([]);
  });

  it('recovers valid unique profiles from partially corrupt storage', () => {
    const storage = memoryStorage({
      'iron-doctrine.commanders.v1': JSON.stringify({
        version: 1,
        activeCallsign: 'BAD!',
        profiles: [{ callsign: 'fox' }, { callsign: 'FOX' }, { callsign: 'invalid' }],
      }),
    });
    expect(loadCommanderProfiles(storage)).toEqual({
      version: 1,
      activeCallsign: 'FOX',
      profiles: [{ callsign: 'FOX', completedMatches: 0, chickenEventsSeen: 0 }],
    });
  });

  it('persists completed matches per commander', () => {
    const storage = memoryStorage();
    createCommanderProfile(storage, 'FOX');
    createCommanderProfile(storage, 'OWL');

    recordCompletedMatch(storage, 'FOX');
    recordCompletedMatch(storage, 'FOX');

    expect(loadCommanderProfiles(storage).profiles).toEqual([
      { callsign: 'FOX', completedMatches: 2, chickenEventsSeen: 0 },
      { callsign: 'OWL', completedMatches: 0, chickenEventsSeen: 0 },
    ]);
  });

  it('reserves one chicken event after every seven completed matches', () => {
    const storage = memoryStorage();
    createCommanderProfile(storage, 'FOX');
    for (let match = 0; match < 6; match++) recordCompletedMatch(storage, 'FOX');
    expect(consumeChickenEasterEgg(storage, 'FOX')).toBe(false);

    recordCompletedMatch(storage, 'FOX');
    expect(consumeChickenEasterEgg(storage, 'FOX')).toBe(true);
    expect(consumeChickenEasterEgg(storage, 'FOX')).toBe(false);

    for (let match = 0; match < 7; match++) recordCompletedMatch(storage, 'FOX');
    expect(consumeChickenEasterEgg(storage, 'FOX')).toBe(true);
    expect(consumeChickenEasterEgg(storage, 'FOX')).toBe(false);
  });
});
