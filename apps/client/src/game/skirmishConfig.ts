import type { Difficulty } from '@iron/engine';
import type { MapDef } from '@iron/shared';

export type EnemyStartingForce = 0 | 2 | 4;
export type GracePeriodSeconds = 120 | 180 | 300;
export type MissionId =
  | 'base_foundations'
  | 'first_contact'
  | 'iron_pass'
  | 'siege_line'
  | 'black_dawn'
  | 'silent_extraction'
  | 'skirmish';

export type MissionScenario = 'none' | 'recovery' | 'ambush' | 'siege' | 'finale' | 'infiltration';

export interface MissionRules {
  playerStart: 'base' | 'patrol';
  playerCredits: number;
  enemyEnabled: boolean;
  scenario: MissionScenario;
  matchEnabled: boolean;
}

export const MISSION_RULES: Readonly<Record<MissionId, MissionRules>> = {
  base_foundations: {
    playerStart: 'base',
    playerCredits: 3200,
    enemyEnabled: false,
    scenario: 'none',
    matchEnabled: false,
  },
  first_contact: {
    playerStart: 'patrol',
    playerCredits: 0,
    enemyEnabled: true,
    scenario: 'recovery',
    matchEnabled: true,
  },
  iron_pass: {
    playerStart: 'base',
    playerCredits: 3200,
    enemyEnabled: true,
    scenario: 'ambush',
    matchEnabled: true,
  },
  siege_line: {
    playerStart: 'base',
    playerCredits: 3600,
    enemyEnabled: true,
    scenario: 'siege',
    matchEnabled: true,
  },
  black_dawn: {
    playerStart: 'base',
    playerCredits: 4000,
    enemyEnabled: true,
    scenario: 'finale',
    matchEnabled: true,
  },
  silent_extraction: {
    playerStart: 'patrol',
    playerCredits: 0,
    enemyEnabled: true,
    scenario: 'infiltration',
    matchEnabled: true,
  },
  skirmish: {
    playerStart: 'base',
    playerCredits: 3200,
    enemyEnabled: true,
    scenario: 'none',
    matchEnabled: true,
  },
};

export interface SkirmishConfig {
  mission: MissionId;
  map: MapDef;
  difficulty: Difficulty;
  gracePeriodSeconds: GracePeriodSeconds;
  enemyStartingForce: EnemyStartingForce;
  /** Set when player 1 is a remote human rather than the mission's AI: this client's
   * own server-assigned player id, used to pick the correct spawn/camera side. */
  onlinePlayerId?: number;
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

export interface SiegeLineLayout {
  spawnPoints: Array<{ x: number; y: number }>;
  targetAt: { x: number; y: number };
}

export function siegeLineLayout(map: MapDef): SiegeLineLayout {
  const friendly = map.spawns.find((spawn) => spawn.player === 0);
  const hostile = map.spawns.find((spawn) => spawn.player === 1);
  if (!friendly || !hostile) throw new Error('Siege Line requires two player spawns');

  const dx = hostile.x - friendly.x;
  const dy = hostile.y - friendly.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const perpendicular = { x: -dy / length, y: dx / length };
  const clampX = (x: number): number => Math.min(map.width - 2, Math.max(1, Math.round(x)));
  const clampY = (y: number): number => Math.min(map.height - 2, Math.max(1, Math.round(y)));
  const staging = {
    x: friendly.x + dx * 0.4,
    y: friendly.y + dy * 0.4,
  };

  return {
    spawnPoints: [-5, -1.5, 1.5, 5].map((offset) => ({
      x: clampX(staging.x + perpendicular.x * offset),
      y: clampY(staging.y + perpendicular.y * offset),
    })),
    targetAt: { x: clampX(friendly.x), y: clampY(friendly.y) },
  };
}

export interface SilentExtractionLayout {
  prisonerAt: { x: number; y: number };
  extractionAt: { x: number; y: number };
  /** Destructible wall blocking a shorter alternate route to the prisoner. */
  obstacleAt: { x: number; y: number };
  /** Enemy trap positions along the main infiltration route. */
  trapPositions: { x: number; y: number }[];
  /** Hostile rifleman patrol guarding the route to the holding cage. */
  patrolPositions: { x: number; y: number }[];
  /** Small cosmetic hostile perimeter (wall segments) around the holding cage. */
  basePerimeter: { x: number; y: number }[];
}

/** Lays out the captive's holding position deep in hostile territory and a distinct
 * extraction zone closer to the infiltration line, so escorting her out retraces a
 * shorter, but still exposed, stretch of the route. */
export function silentExtractionLayout(map: MapDef): SilentExtractionLayout {
  const friendly = map.spawns.find((spawn) => spawn.player === 0);
  const hostile = map.spawns.find((spawn) => spawn.player === 1);
  if (!friendly || !hostile) throw new Error('Silent Extraction requires two player spawns');

  const dx = hostile.x - friendly.x;
  const dy = hostile.y - friendly.y;
  const clampX = (x: number): number => Math.min(map.width - 2, Math.max(1, Math.round(x)));
  const clampY = (y: number): number => Math.min(map.height - 2, Math.max(1, Math.round(y)));
  // Perpendicular offset used to place the obstacle on a distinct alternate route,
  // and to spread traps slightly off the direct infiltration line.
  const length = Math.hypot(dx, dy) || 1;
  const perpX = -dy / length;
  const perpY = dx / length;
  return {
    prisonerAt: {
      x: clampX(friendly.x + dx * 0.7),
      y: clampY(friendly.y + dy * 0.7),
    },
    extractionAt: {
      x: clampX(friendly.x + dx * 0.2),
      y: clampY(friendly.y + dy * 0.2),
    },
    obstacleAt: {
      x: clampX(friendly.x + dx * 0.45 + perpX * 6),
      y: clampY(friendly.y + dy * 0.45 + perpY * 6),
    },
    trapPositions: [
      {
        x: clampX(friendly.x + dx * 0.35),
        y: clampY(friendly.y + dy * 0.35),
      },
      {
        x: clampX(friendly.x + dx * 0.55),
        y: clampY(friendly.y + dy * 0.55),
      },
    ],
    // Guard patrol strung out along the direct route between insertion and the cage,
    // so the operative can no longer walk in completely unopposed.
    patrolPositions: [0.4, 0.55, 0.85].map((fraction) => ({
      x: clampX(friendly.x + dx * fraction + perpX * 3),
      y: clampY(friendly.y + dy * fraction + perpY * 3),
    })),
    // Cosmetic wall segments around the cage to read as a small guarded compound.
    basePerimeter: [
      { x: 3, y: 0 },
      { x: -3, y: 0 },
      { x: 0, y: 3 },
      { x: 0, y: -3 },
    ].map((offset) => ({
      x: clampX(friendly.x + dx * 0.7 + offset.x),
      y: clampY(friendly.y + dy * 0.7 + offset.y),
    })),
  };
}
