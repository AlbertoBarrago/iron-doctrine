import type { MissionId } from './skirmishConfig.js';

export type CampaignMissionId =
  'base_foundations' | 'first_contact' | 'iron_pass' | 'siege_line' | 'black_dawn';

export interface CampaignMission {
  id: CampaignMissionId;
  operation: string;
  title: string;
  region: string;
  situation: string;
  objective: string;
  intelligence: string;
  forces: string[];
  authorized: string[];
  resources: string;
  prerequisite?: CampaignMissionId;
  runtimeMission?: MissionId;
  mapPosition: { x: number; y: number };
}

export const CAMPAIGN_MISSIONS: readonly CampaignMission[] = [
  {
    id: 'base_foundations',
    operation: '01',
    title: 'Base Foundations',
    region: 'Iron Dawn Basin',
    situation: 'Field Command requires a permanent foothold before operations can move inland.',
    objective: 'Establish power, income, infantry production and a defensible perimeter.',
    intelligence: 'The training sector is secure. No hostile attack is expected.',
    forces: ['Construction Yard', 'Harvester'],
    authorized: [
      'Power Plant',
      'Refinery',
      'Barracks',
      'Rifleman',
      'Concrete Wall',
      'Defense Turret',
    ],
    resources: 'Three home ore fields · 24,000 credits available',
    runtimeMission: 'base_foundations',
    mapPosition: { x: 16, y: 72 },
  },
  {
    id: 'first_contact',
    operation: '02',
    title: 'First Contact',
    region: 'Grey March',
    situation: 'A dormant command installation has transmitted an encrypted emergency beacon.',
    objective: 'Cross hostile territory, secure the abandoned base and restore command systems.',
    intelligence: 'Light infantry resistance is expected along the recovery route.',
    forces: ['2 Battle Tanks', '4 Riflemen'],
    authorized: ['Recovered Construction Yard', 'Harvester', 'Infantry', 'Armor'],
    resources: 'Local ore deposits become available after base recovery',
    prerequisite: 'base_foundations',
    runtimeMission: 'first_contact',
    mapPosition: { x: 34, y: 52 },
  },
  {
    id: 'iron_pass',
    operation: '03',
    title: 'Iron Pass',
    region: 'Iron Pass',
    situation:
      'The recovered base is secure. Field Command orders the supply route opened through the ' +
      'mountain chokepoint held by a hostile garrison.',
    objective: 'Advance through Iron Pass and destroy the hostile command.',
    intelligence:
      'The pass is lightly held on approach, but expect an armored counter-attack once the ' +
      'chokepoint is crossed.',
    forces: ['Construction Yard', 'Harvester'],
    authorized: [
      'Power Plant',
      'Refinery',
      'Barracks',
      'Factory',
      'Rifleman',
      'Engineer',
      'Battle Tank',
      'Concrete Wall',
      'Defense Turret',
    ],
    resources: 'Home ore fields plus a contested deposit at the mouth of the pass',
    prerequisite: 'first_contact',
    runtimeMission: 'iron_pass',
    mapPosition: { x: 55, y: 61 },
  },
  {
    id: 'siege_line',
    operation: '04',
    title: 'Siege Line',
    region: 'Classified',
    situation: 'Operational details remain sealed by Field Command.',
    objective: 'CLASSIFIED',
    intelligence: 'CLASSIFIED',
    forces: ['CLASSIFIED'],
    authorized: ['CLASSIFIED'],
    resources: 'CLASSIFIED',
    prerequisite: 'iron_pass',
    mapPosition: { x: 68, y: 37 },
  },
  {
    id: 'black_dawn',
    operation: '05',
    title: 'Black Dawn',
    region: 'Classified',
    situation: 'Operational details remain sealed by Field Command.',
    objective: 'CLASSIFIED',
    intelligence: 'CLASSIFIED',
    forces: ['CLASSIFIED'],
    authorized: ['CLASSIFIED'],
    resources: 'CLASSIFIED',
    prerequisite: 'siege_line',
    mapPosition: { x: 86, y: 20 },
  },
];

export function campaignMission(id: CampaignMissionId): CampaignMission {
  const mission = CAMPAIGN_MISSIONS.find((candidate) => candidate.id === id);
  if (!mission) throw new Error(`Unknown campaign mission: ${id}`);
  return mission;
}
