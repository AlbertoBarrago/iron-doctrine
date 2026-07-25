import type { Difficulty } from '@iron/engine';
import type { MapDef } from '@iron/shared';

export type EnemyStartingForce = 0 | 2 | 4;
export type GracePeriodSeconds = 120 | 180 | 300;
export type MissionId = 'base_foundations' | 'first_contact' | 'iron_pass' | 'skirmish';

export interface MissionRules {
  playerStart: 'base' | 'patrol';
  playerCredits: number;
  enemyEnabled: boolean;
  recoveryScenario: boolean;
  ambushScenario: boolean;
  matchEnabled: boolean;
}

export const MISSION_RULES: Readonly<Record<MissionId, MissionRules>> = {
  base_foundations: {
    playerStart: 'base',
    playerCredits: 3200,
    enemyEnabled: false,
    recoveryScenario: false,
    ambushScenario: false,
    matchEnabled: false,
  },
  first_contact: {
    playerStart: 'patrol',
    playerCredits: 0,
    enemyEnabled: true,
    recoveryScenario: true,
    ambushScenario: false,
    matchEnabled: true,
  },
  iron_pass: {
    playerStart: 'base',
    playerCredits: 3200,
    enemyEnabled: true,
    recoveryScenario: false,
    ambushScenario: true,
    matchEnabled: true,
  },
  skirmish: {
    playerStart: 'base',
    playerCredits: 3200,
    enemyEnabled: true,
    recoveryScenario: false,
    ambushScenario: false,
    matchEnabled: true,
  },
};

export interface SkirmishConfig {
  mission: MissionId;
  map: MapDef;
  difficulty: Difficulty;
  gracePeriodSeconds: GracePeriodSeconds;
  enemyStartingForce: EnemyStartingForce;
}

export const DEFAULT_SKIRMISH_SETTINGS = {
  mission: 'skirmish',
  difficulty: 'easy',
  gracePeriodSeconds: 180,
  enemyStartingForce: 0,
} as const satisfies Omit<SkirmishConfig, 'map'>;

export interface FirstContactLayout {
  recovery: { x: number; y: number };
  resistance: Array<{ x: number; y: number }>;
}

export function firstContactLayout(map: MapDef): FirstContactLayout {
  const friendly = map.spawns.find((spawn) => spawn.player === 0);
  const hostile = map.spawns.find((spawn) => spawn.player === 1);
  if (!friendly || !hostile) throw new Error('First Contact requires two player spawns');

  const dx = hostile.x - friendly.x;
  const dy = hostile.y - friendly.y;
  const distance = Math.hypot(dx, dy);
  const fraction = Math.min(0.25, Math.max(0.15, 14 / Math.max(1, distance)));
  const clampX = (x: number): number => Math.min(map.width - 2, Math.max(1, Math.round(x)));
  const clampY = (y: number): number => Math.min(map.height - 2, Math.max(1, Math.round(y)));
  const recovery = {
    x: clampX(friendly.x + dx * fraction),
    y: clampY(friendly.y + dy * fraction),
  };

  const routeX = friendly.x + (recovery.x - friendly.x) * 0.58;
  const routeY = friendly.y + (recovery.y - friendly.y) * 0.58;
  const length = Math.max(1, Math.hypot(dx, dy));
  const perpendicular = { x: -dy / length, y: dx / length };
  return {
    recovery,
    resistance: [-2, 0, 2].map((offset) => ({
      x: clampX(routeX + perpendicular.x * offset),
      y: clampY(routeY + perpendicular.y * offset),
    })),
  };
}

export interface IronPassLayout {
  trigger: { x: number; y: number };
  ambush: Array<{ x: number; y: number }>;
}

export function ironPassLayout(map: MapDef): IronPassLayout {
  const friendly = map.spawns.find((spawn) => spawn.player === 0);
  const hostile = map.spawns.find((spawn) => spawn.player === 1);
  if (!friendly || !hostile) throw new Error('Iron Pass requires two player spawns');

  const dx = hostile.x - friendly.x;
  const dy = hostile.y - friendly.y;
  const clampX = (x: number): number => Math.min(map.width - 2, Math.max(1, Math.round(x)));
  const clampY = (y: number): number => Math.min(map.height - 2, Math.max(1, Math.round(y)));
  const trigger = {
    x: clampX(friendly.x + dx * 0.45),
    y: clampY(friendly.y + dy * 0.45),
  };

  const flankX = friendly.x + dx * 0.55;
  const flankY = friendly.y + dy * 0.55;
  const length = Math.max(1, Math.hypot(dx, dy));
  const perpendicular = { x: -dy / length, y: dx / length };
  return {
    trigger,
    ambush: [-3, 0, 3].map((offset) => ({
      x: clampX(flankX + perpendicular.x * offset),
      y: clampY(flankY + perpendicular.y * offset),
    })),
  };
}
