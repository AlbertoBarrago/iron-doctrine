import type { MissionId } from './skirmishConfig.js';

export type MatchResultAction = 'restart' | 'exit';

export interface MatchResultActions {
  primary: MatchResultAction;
  primaryLabel: string;
  secondary: MatchResultAction;
  secondaryLabel: string;
}

export function matchResultActions(mission: MissionId, winner: number | null): MatchResultActions {
  const campaignMission = mission !== 'skirmish';
  if (campaignMission && winner === 0) {
    return {
      primary: 'exit',
      primaryLabel: 'Continue campaign',
      secondary: 'restart',
      secondaryLabel: 'Replay mission',
    };
  }
  return {
    primary: 'restart',
    primaryLabel: campaignMission ? 'Retry mission' : 'Restart skirmish',
    secondary: 'exit',
    secondaryLabel: campaignMission ? 'Return to campaign' : 'Return to main menu',
  };
}
