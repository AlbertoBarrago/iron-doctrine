import { describe, expect, it } from 'vitest';
import { createEmptyMap } from '@iron/shared';
import {
  DEFAULT_MAP,
  loadMapCatalog,
  parseMapJson,
  saveLocalMap,
  type MapStorage,
} from './mapCatalog.js';

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

describe('local map catalog', () => {
  it('gives both bases a sustainable home economy plus contested central ore', () => {
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
  });

  it('saves maps and replaces maps with the same name', () => {
    const storage = memoryStorage();
    saveLocalMap(storage, validMap('Crossfire'));
    const changed = validMap('crossfire');
    changed.resources.push({ x: 12, y: 12, amount: 5000 });
    saveLocalMap(storage, changed);

    const entries = loadMapCatalog(storage);
    expect(entries).toHaveLength(2);
    expect(entries[1]!.map.resources).toHaveLength(1);
  });

  it('rejects malformed imports', () => {
    expect(() => parseMapJson('{nope')).toThrow('Invalid JSON');
    expect(() => parseMapJson(JSON.stringify({ format: 'iron-doctrine.map' }))).toThrow(
      'Invalid map structure',
    );
  });
});
