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
