import { describe, expect, it } from 'vitest';
import { CAMPAIGN_MISSIONS, campaignMission } from '../campaign.js';
import {
  campaignMissionStatus,
  completeCampaignMission,
  loadCampaignProgress,
  type CampaignStorage,
} from '../campaignProgress.js';

function memoryStorage(): CampaignStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe('campaign', () => {
  it('defines an ordered six-operation route', () => {
    expect(CAMPAIGN_MISSIONS.map((mission) => mission.operation)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
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

  it('unlocks Siege Line only after Iron Pass', () => {
    const siegeLine = campaignMission('siege_line');
    expect(siegeLine.runtimeMission).toBe('siege_line');
    expect(
      campaignMissionStatus(siegeLine, { completed: ['base_foundations', 'first_contact'] }),
    ).toBe('classified');
    expect(
      campaignMissionStatus(siegeLine, {
        completed: ['base_foundations', 'first_contact', 'iron_pass'],
      }),
    ).toBe('available');
  });

  it('unlocks Black Dawn only after Siege Line', () => {
    const blackDawn = campaignMission('black_dawn');
    expect(blackDawn.runtimeMission).toBe('black_dawn');
    expect(
      campaignMissionStatus(blackDawn, {
        completed: ['base_foundations', 'first_contact', 'iron_pass'],
      }),
    ).toBe('classified');
    expect(
      campaignMissionStatus(blackDawn, {
        completed: ['base_foundations', 'first_contact', 'iron_pass', 'siege_line'],
      }),
    ).toBe('available');
  });

  it('unlocks Silent Extraction only after Black Dawn', () => {
    const silentExtraction = campaignMission('silent_extraction');
    expect(silentExtraction.runtimeMission).toBe('silent_extraction');
    expect(
      campaignMissionStatus(silentExtraction, {
        completed: ['base_foundations', 'first_contact', 'iron_pass', 'siege_line'],
      }),
    ).toBe('classified');
    expect(
      campaignMissionStatus(silentExtraction, {
        completed: ['base_foundations', 'first_contact', 'iron_pass', 'siege_line', 'black_dawn'],
      }),
    ).toBe('available');
  });

  it('persists completion idempotently and survives invalid storage', () => {
    const storage = memoryStorage();
    completeCampaignMission(storage, 'FOX', 'base_foundations');
    completeCampaignMission(storage, 'FOX', 'base_foundations');
    expect(loadCampaignProgress(storage, 'FOX')).toEqual({ completed: ['base_foundations'] });
    storage.setItem('iron-doctrine.campaign.v2.FOX', '{broken');
    expect(loadCampaignProgress(storage, 'FOX')).toEqual({ completed: [] });
  });
});
