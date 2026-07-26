import { describe, expect, it } from 'vitest';
import type { MapDef } from '@iron/shared';
import {
  firstContactLayout,
  ironPassLayout,
  MISSION_RULES,
  siegeLineLayout,
} from './skirmishConfig.js';

const mapWithSpawns = (
  friendly: { x: number; y: number },
  hostile: { x: number; y: number },
): MapDef => ({
  format: 'iron-doctrine.map',
  version: 1,
  name: 'Test',
  width: 96,
  height: 96,
  cellSize: 1,
  blocked: [],
  resources: [],
  spawns: [
    { player: 0, ...friendly },
    { player: 1, ...hostile },
  ],
});

describe('First Contact layout', () => {
  it('places the recovered base near the patrol and far from hostile command', () => {
    const layout = firstContactLayout(mapWithSpawns({ x: 16, y: 16 }, { x: 79, y: 79 }));
    const friendlyDistance = Math.hypot(layout.recovery.x - 16, layout.recovery.y - 16);
    const hostileDistance = Math.hypot(layout.recovery.x - 79, layout.recovery.y - 79);

    expect(friendlyDistance).toBeGreaterThanOrEqual(12);
    expect(friendlyDistance).toBeLessThanOrEqual(17);
    expect(hostileDistance).toBeGreaterThan(friendlyDistance * 3);
  });

  it('follows the route regardless of map orientation', () => {
    const layout = firstContactLayout(mapWithSpawns({ x: 80, y: 18 }, { x: 12, y: 76 }));
    expect(layout.recovery.x).toBeLessThan(80);
    expect(layout.recovery.y).toBeGreaterThan(18);
    expect(layout.resistance).toHaveLength(3);
    expect(
      layout.resistance.every(({ x, y }) => x > layout.recovery.x && y < layout.recovery.y),
    ).toBe(true);
  });
});

describe('Iron Pass layout', () => {
  it('places the ambush trigger inside the chokepoint and spreads reinforcements across it', () => {
    const layout = ironPassLayout(mapWithSpawns({ x: 16, y: 48 }, { x: 80, y: 48 }));
    expect(layout.trigger.x).toBeGreaterThan(16);
    expect(layout.trigger.x).toBeLessThan(80);
    expect(layout.ambush).toHaveLength(3);
    expect(new Set(layout.ambush.map((spawn) => spawn.y)).size).toBe(3);
  });
});

describe('Siege Line layout', () => {
  it('stages reinforcements toward the friendly position across distinct lanes', () => {
    const layout = siegeLineLayout(mapWithSpawns({ x: 16, y: 48 }, { x: 80, y: 48 }));
    expect(layout.targetAt).toEqual({ x: 16, y: 48 });
    expect(layout.spawnPoints).toHaveLength(4);
    expect(new Set(layout.spawnPoints.map((spawn) => spawn.y)).size).toBe(4);
    expect(layout.spawnPoints.every((spawn) => spawn.x > 16 && spawn.x < 80)).toBe(true);
  });
});

describe('mission profiles', () => {
  it('keeps the construction tutorial separate from the recovery mission', () => {
    expect(MISSION_RULES.base_foundations).toMatchObject({
      playerStart: 'base',
      enemyEnabled: false,
      scenario: 'none',
    });
    expect(MISSION_RULES.first_contact).toMatchObject({
      playerStart: 'patrol',
      enemyEnabled: true,
      scenario: 'recovery',
    });
    expect(MISSION_RULES.iron_pass).toMatchObject({
      playerStart: 'base',
      enemyEnabled: true,
      scenario: 'ambush',
    });
    expect(MISSION_RULES.siege_line).toMatchObject({
      playerStart: 'base',
      enemyEnabled: true,
      scenario: 'siege',
    });
    expect(MISSION_RULES.black_dawn).toMatchObject({
      playerStart: 'base',
      enemyEnabled: true,
      scenario: 'finale',
    });
  });
});
