import { describe, it, expect } from 'vitest';
import { createEmptyMap, validateMap, MAP_ENVIRONMENT_VERSION, MAP_VERSION } from './map.js';

describe('MapDef', () => {
  it('creates a valid empty map (after adding a spawn)', () => {
    const m = createEmptyMap('test', 32, 32);
    expect(m.version).toBe(MAP_VERSION);
    expect(m.environment).toEqual({
      version: MAP_ENVIRONMENT_VERSION,
      biome: 'temperate',
      seed: 1,
    });
    // Empty map has no spawn → invalid.
    expect(validateMap(m)).toContain('map needs at least one spawn');
    m.spawns.push({ player: 0, x: 4, y: 4 });
    expect(validateMap(m)).toEqual([]);
  });

  it('accepts legacy maps without environment metadata', () => {
    const m = createEmptyMap('legacy', 8, 8);
    delete m.environment;
    m.spawns.push({ player: 0, x: 1, y: 1 });

    expect(validateMap(m)).toEqual([]);
  });

  it('rejects unsupported environment metadata', () => {
    const m = createEmptyMap('bad-environment', 8, 8);
    m.spawns.push({ player: 0, x: 1, y: 1 });
    m.environment = {
      version: 99 as typeof MAP_ENVIRONMENT_VERSION,
      biome: 'desert' as 'temperate',
      seed: 1.5,
    };

    expect(validateMap(m)).toEqual(
      expect.arrayContaining([
        'unsupported environment version 99',
        'unsupported biome desert',
        'environment seed must be a safe integer',
      ]),
    );
  });

  it('flags out-of-bounds blocked cells', () => {
    const m = createEmptyMap('t', 8, 8);
    m.spawns.push({ player: 0, x: 0, y: 0 });
    m.blocked.push([10, 10]);
    expect(validateMap(m).some((e) => e.includes('out of bounds'))).toBe(true);
  });

  it('flags bad dimensions and version', () => {
    const m = createEmptyMap('t', 0, 8);
    expect(validateMap(m).some((e) => e.includes('positive'))).toBe(true);
    m.version = 99;
    expect(validateMap(m).some((e) => e.includes('unsupported version'))).toBe(true);
  });

  it('flags invalid resources and duplicate player spawns', () => {
    const m = createEmptyMap('t', 8, 8);
    m.resources.push({ x: 9, y: 2, amount: 0 });
    m.spawns.push({ player: 0, x: 1, y: 1 }, { player: 0, x: 2, y: 2 });

    expect(validateMap(m)).toEqual(
      expect.arrayContaining([
        'resource out of bounds: 9,2',
        'resource amount must be positive: 9,2',
        'duplicate spawn for player 1',
      ]),
    );
  });
});
