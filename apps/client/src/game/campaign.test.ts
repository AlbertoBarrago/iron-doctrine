import { describe, expect, it } from 'vitest';
import { CAMPAIGN_MISSIONS, campaignMission } from './campaign.js';
import {
  campaignMissionStatus,
  completeCampaignMission,
  loadCampaignProgress,
  type CampaignStorage,
} from './campaignProgress.js';

function memoryStorage(): CampaignStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe('campaign', () => {
  it('defines an ordered five-operation route', () => {
    expect(CAMPAIGN_MISSIONS.map((mission) => mission.operation)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
    ]);
    expect(campaignMission('base_foundations').runtimeMission).toBe('base_foundations');
  });

  it('unlocks First Contact only after Base Foundations', () => {
    const firstContact = campaignMission('first_contact');
    expect(campaignMissionStatus(firstContact, { completed: [] })).toBe('classified');
    expect(campaignMissionStatus(firstContact, { completed: ['base_foundations'] })).toBe(
      'available',
    );
  });

  it('unlocks Iron Pass only after First Contact', () => {
    const ironPass = campaignMission('iron_pass');
    expect(ironPass.runtimeMission).toBe('iron_pass');
    expect(campaignMissionStatus(ironPass, { completed: ['base_foundations'] })).toBe('classified');
    expect(
      campaignMissionStatus(ironPass, { completed: ['base_foundations', 'first_contact'] }),
    ).toBe('available');
  });

  it('keeps Siege Line and Black Dawn classified until authored', () => {
    expect(campaignMission('siege_line').runtimeMission).toBeUndefined();
    expect(campaignMission('black_dawn').runtimeMission).toBeUndefined();
  });

  it('persists completion idempotently and survives invalid storage', () => {
    const storage = memoryStorage();
    completeCampaignMission(storage, 'base_foundations');
    completeCampaignMission(storage, 'base_foundations');
    expect(loadCampaignProgress(storage)).toEqual({ completed: ['base_foundations'] });
    storage.setItem('iron-doctrine.campaign.v1', '{broken');
    expect(loadCampaignProgress(storage)).toEqual({ completed: [] });
  });
});
