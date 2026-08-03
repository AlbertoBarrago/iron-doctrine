import type { MissionId } from './skirmishConfig.js';

export type CampaignMissionId =
  | 'base_foundations'
  | 'first_contact'
  | 'iron_pass'
  | 'siege_line'
  | 'black_dawn'
  | 'silent_extraction';

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
    region: 'Siege Line',
    situation:
      'The pass is open. Field Command holds a forward position while the hostile garrison ' +
      'mounts a counter-offensive to retake it.',
    objective: 'Hold the line against the assault, then destroy the hostile command.',
    intelligence:
      'Expect escalating armored assault waves at regular intervals before the hostile force ' +
      'is spent.',
    forces: ['Construction Yard', 'Harvester'],
    authorized: [
      'Power Plant',
      'Barracks',
      'Factory',
      'Rifleman',
      'Engineer',
      'Battle Tank',
      'Concrete Wall',
      'Defense Turret',
    ],
    resources: 'Home ore fields plus a contested deposit near the held line',
    prerequisite: 'iron_pass',
    runtimeMission: 'siege_line',
    mapPosition: { x: 68, y: 37 },
  },
  {
    id: 'black_dawn',
    operation: '05',
    title: 'Black Dawn',
    region: 'Black Dawn',
    situation:
      'The siege is broken. Field Command orders the final assault on the hostile stronghold ' +
      'before it can regroup.',
    objective: 'Breach the stronghold and destroy the hostile command.',
    intelligence:
      'The stronghold is heavily defended. Expect a desperate last stand once its command is ' +
      'critically damaged.',
    forces: ['Construction Yard', 'Harvester'],
    authorized: [
      'Power Plant',
      'Barracks',
      'Factory',
      'Rifleman',
      'Engineer',
      'Battle Tank',
      'Concrete Wall',
      'Defense Turret',
    ],
    resources: 'Home ore fields plus a contested deposit at the stronghold gate',
    prerequisite: 'siege_line',
    runtimeMission: 'black_dawn',
    mapPosition: { x: 86, y: 20 },
  },
  {
    id: 'silent_extraction',
    operation: '06',
    title: 'Silent Extraction',
    region: 'Ashfall Corridor',
    situation:
      'A field asset captured during the stronghold assault is being held at a forward hostile ' +
      'checkpoint. Field Command cannot risk a conventional force before she is moved or executed.',
    objective: 'Infiltrate alone, locate the prisoner, and escort her to the extraction point.',
    intelligence:
      'A single operator stands the best chance of reaching the checkpoint undetected. Expect ' +
      'roaming patrols between the infiltration line and the prisoner. The operator is not ' +
      'expected to survive prolonged direct engagement with more than one patrol at a time.',
    forces: ['1 Operative (special asset, not producible)'],
    authorized: ['Operative'],
    resources: 'No economy authorized for this operation — infiltration only',
    prerequisite: 'black_dawn',
    runtimeMission: 'silent_extraction',
    mapPosition: { x: 92, y: 8 },
  },
];

export function campaignMission(id: CampaignMissionId): CampaignMission {
  const mission = CAMPAIGN_MISSIONS.find((candidate) => candidate.id === id);
  if (!mission) throw new Error(`Unknown campaign mission: ${id}`);
  return mission;
}
