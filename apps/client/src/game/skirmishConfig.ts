import type { Difficulty } from '@iron/engine';
import type { MapDef } from '@iron/shared';

export type EnemyStartingForce = 0 | 2 | 4;
export type GracePeriodSeconds = 120 | 180 | 300;

export interface SkirmishConfig {
  map: MapDef;
  difficulty: Difficulty;
  gracePeriodSeconds: GracePeriodSeconds;
  enemyStartingForce: EnemyStartingForce;
}

export const DEFAULT_SKIRMISH_SETTINGS = {
  difficulty: 'easy',
  gracePeriodSeconds: 180,
  enemyStartingForce: 0,
} as const satisfies Omit<SkirmishConfig, 'map'>;
