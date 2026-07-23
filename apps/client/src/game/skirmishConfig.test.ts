import { describe, expect, it } from 'vitest';
import type { MapDef } from '@iron/shared';
import { firstContactLayout } from './skirmishConfig.js';

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
    expect(layout.resistance.every(({ x, y }) => x > layout.recovery.x && y < layout.recovery.y))
      .toBe(true);
  });
});
