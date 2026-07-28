import { describe, expect, it } from 'vitest';
import { createEmptyMap, validateMap } from '@iron/shared';
import {
  BLACK_DAWN_MAP,
  DEFAULT_MAP,
  IRON_PASS_MAP,
  SIEGE_LINE_MAP,
  loadMapCatalog,
  parseMapJson,
  saveLocalMap,
  type MapStorage,
} from '../mapCatalog.js';

function memoryStorage(): MapStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

function validMap(name: string) {
  const map = createEmptyMap(name, 48, 48);
  map.spawns.push({ player: 0, x: 4, y: 4 }, { player: 1, x: 43, y: 43 });
  return map;
}

function spawnsAreConnected(map: typeof IRON_PASS_MAP): boolean {
  const [start, goal] = map.spawns;
  if (!start || !goal) return false;
  const blocked = new Set(map.blocked.map(([x, y]) => `${x}:${y}`));
  const visited = new Set([`${start.x}:${start.y}`]);
  const queue = [[start.x, start.y] as const];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const [x, y] = queue[cursor]!;
    if (x === goal.x && y === goal.y) return true;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nextX = x + dx;
      const nextY = y + dy;
      const key = `${nextX}:${nextY}`;
      if (
        nextX < 0 ||
        nextY < 0 ||
        nextX >= map.width ||
        nextY >= map.height ||
        blocked.has(key) ||
        visited.has(key)
      ) {
        continue;
      }
      visited.add(key);
      queue.push([nextX, nextY]);
    }
  }
  return false;
}

function nearestFormationDistance(map: typeof IRON_PASS_MAP): number {
  const friendly = map.spawns.find((spawn) => spawn.player === 0)!;
  return Math.min(
    ...map.blocked.map(([x, y]) => Math.hypot(x - friendly.x, y - friendly.y)),
  );
}

describe('local map catalog', () => {
  it('gives both bases a sustainable home economy plus contested central ore', () => {
    expect(validateMap(DEFAULT_MAP)).toEqual([]);
    expect(DEFAULT_MAP.environment).toMatchObject({ biome: 'temperate', seed: 1947 });
    expect(DEFAULT_MAP.blocked.length).toBeGreaterThan(150);
    expect(spawnsAreConnected(DEFAULT_MAP)).toBe(true);
    expect(nearestFormationDistance(DEFAULT_MAP)).toBeLessThanOrEqual(9);
    expect(DEFAULT_MAP.resources).toHaveLength(7);
    expect(DEFAULT_MAP.resources.filter((resource) => resource.amount === 8000)).toHaveLength(6);
    expect(DEFAULT_MAP.resources).toContainEqual({ x: 48, y: 48, amount: 12000 });
    expect(
      DEFAULT_MAP.resources
        .filter((resource) => Math.hypot(resource.x - 16, resource.y - 16) < 16)
        .reduce((total, resource) => total + resource.amount, 0),
    ).toBe(24_000);
    expect(
      DEFAULT_MAP.resources
        .filter((resource) => Math.hypot(resource.x - 79, resource.y - 79) < 16)
        .reduce((total, resource) => total + resource.amount, 0),
    ).toBe(24_000);
    for (const resource of DEFAULT_MAP.resources) {
      expect(DEFAULT_MAP.blocked).not.toContainEqual([resource.x, resource.y]);
    }
  });

  it('gives Iron Pass a valid chokepoint corridor connecting both spawns', () => {
    expect(validateMap(IRON_PASS_MAP)).toEqual([]);
    expect(IRON_PASS_MAP.environment).toMatchObject({
      biome: 'mediterranean',
      seed: 1979,
    });
    const [friendly, hostile] = IRON_PASS_MAP.spawns;
    expect(friendly).toMatchObject({ player: 0 });
    expect(hostile).toMatchObject({ player: 1 });
    const isBlocked = (x: number, y: number) =>
      IRON_PASS_MAP.blocked.some(([bx, by]) => bx === x && by === y);
    expect(isBlocked(friendly!.x, friendly!.y)).toBe(false);
    expect(isBlocked(hostile!.x, hostile!.y)).toBe(false);
    expect(isBlocked(48, 48)).toBe(false);
    expect(spawnsAreConnected(IRON_PASS_MAP)).toBe(true);
    expect(nearestFormationDistance(IRON_PASS_MAP)).toBeLessThanOrEqual(9);
  });

  it('gives Siege Line a defensible corridor near the friendly spawn', () => {
    expect(validateMap(SIEGE_LINE_MAP)).toEqual([]);
    const [friendly, hostile] = SIEGE_LINE_MAP.spawns;
    expect(friendly).toMatchObject({ player: 0 });
    expect(hostile).toMatchObject({ player: 1 });
    const isBlocked = (x: number, y: number) =>
      SIEGE_LINE_MAP.blocked.some(([bx, by]) => bx === x && by === y);
    expect(isBlocked(friendly!.x, friendly!.y)).toBe(false);
    expect(isBlocked(hostile!.x, hostile!.y)).toBe(false);
    expect(isBlocked(32, 48)).toBe(false);
    expect(SIEGE_LINE_MAP.environment).toMatchObject({ biome: 'temperate', seed: 404 });
    expect(spawnsAreConnected(SIEGE_LINE_MAP)).toBe(true);
    expect(nearestFormationDistance(SIEGE_LINE_MAP)).toBeLessThanOrEqual(9);
  });

  it('gives Black Dawn a fortified gate guarding the hostile stronghold', () => {
    expect(validateMap(BLACK_DAWN_MAP)).toEqual([]);
    const [friendly, hostile] = BLACK_DAWN_MAP.spawns;
    expect(friendly).toMatchObject({ player: 0 });
    expect(hostile).toMatchObject({ player: 1 });
    const isBlocked = (x: number, y: number) =>
      BLACK_DAWN_MAP.blocked.some(([bx, by]) => bx === x && by === y);
    expect(isBlocked(friendly!.x, friendly!.y)).toBe(false);
    expect(isBlocked(hostile!.x, hostile!.y)).toBe(false);
    expect(isBlocked(72, 48)).toBe(false);
    expect(BLACK_DAWN_MAP.environment).toMatchObject({ biome: 'mediterranean', seed: 1984 });
    expect(spawnsAreConnected(BLACK_DAWN_MAP)).toBe(true);
    expect(nearestFormationDistance(BLACK_DAWN_MAP)).toBeLessThanOrEqual(9);
  });

  it('saves maps and replaces maps with the same name', () => {
    const storage = memoryStorage();
    saveLocalMap(storage, validMap('Crossfire'));
    const changed = validMap('crossfire');
    changed.resources.push({ x: 12, y: 12, amount: 5000 });
    saveLocalMap(storage, changed);

    const entries = loadMapCatalog(storage);
    expect(entries).toHaveLength(5);
    expect(entries[4]!.map.resources).toHaveLength(1);
  });

  it('rejects malformed imports', () => {
    expect(() => parseMapJson('{nope')).toThrow('Invalid JSON');
    expect(() => parseMapJson(JSON.stringify({ format: 'iron-doctrine.map' }))).toThrow(
      'Invalid map structure',
    );
  });

  it('normalizes legacy maps to the default environment', () => {
    const legacy = validMap('Legacy');
    delete legacy.environment;

    expect(parseMapJson(JSON.stringify(legacy)).environment).toEqual({
      version: 1,
      biome: 'temperate',
      seed: 1,
    });
  });
});
