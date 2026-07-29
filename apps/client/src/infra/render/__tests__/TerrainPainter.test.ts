import { describe, expect, it } from 'vitest';
import { createEmptyMap } from '@iron/shared';
import {
  mapEnvironment,
  rockEdgeMask,
  terrainFeature,
  terrainMacroSample,
  terrainSample,
  warRemainsSample,
} from '../TerrainPainter.js';

describe('terrain presentation', () => {
  it('produces stable cosmetic details from a seed and coordinates', () => {
    expect(terrainSample(1979, 12, 37)).toEqual(terrainSample(1979, 12, 37));
    expect(terrainSample(1979, 12, 37)).not.toEqual(terrainSample(1980, 12, 37));
  });

  it('builds stable broad terrain patches without leaving supported ranges', () => {
    const samples = Array.from({ length: 64 }, (_, index) =>
      terrainMacroSample(1979, (index % 8) * 8, Math.floor(index / 8) * 8),
    );
    expect(samples).toEqual(
      Array.from({ length: 64 }, (_, index) =>
        terrainMacroSample(1979, (index % 8) * 8, Math.floor(index / 8) * 8),
      ),
    );
    expect(new Set(samples.map((sample) => sample.groundIndex)).size).toBeGreaterThan(2);
    expect(samples.every((sample) => sample.scale >= 0.82 && sample.scale <= 1.32)).toBe(true);
  });

  it('falls back to the backwards-compatible environment', () => {
    const map = createEmptyMap('legacy');
    delete map.environment;

    expect(mapEnvironment(map)).toEqual({
      version: 1,
      biome: 'temperate',
      seed: 1,
    });
  });

  it('keeps war remains deterministic, sparse and collision-readable', () => {
    expect(warRemainsSample(1979, 12, 37, true)).toBe(warRemainsSample(1979, 12, 37, true));

    const blockedRemains = Array.from({ length: 96 * 96 }, (_, index) =>
      warRemainsSample(1979, index % 96, Math.floor(index / 96), true),
    );
    const blockedDecorated = blockedRemains.filter((sample) => sample !== 'none');
    expect(blockedDecorated.length).toBeGreaterThan(400);
    expect(blockedDecorated.length).toBeLessThan(750);
    expect(new Set(blockedDecorated)).toEqual(new Set(['shells', 'bones', 'wreckage']));

    const openRemains = Array.from({ length: 96 * 96 }, (_, index) =>
      warRemainsSample(1979, index % 96, Math.floor(index / 96), false),
    );
    const openDecorated = openRemains.filter((sample) => sample !== 'none');
    expect(openDecorated.length).toBeGreaterThan(70);
    expect(openDecorated.length).toBeLessThan(150);
    expect(new Set(openDecorated)).toEqual(new Set(['shells', 'bones']));
  });

  it('derives exposed rock edges without mutating the authored collision mask', () => {
    const blocked = new Set(['4:4', '5:4', '4:5', '5:5']);
    const snapshot = [...blocked];

    expect(rockEdgeMask(blocked, 4, 4)).toBe(1 | 8);
    expect(rockEdgeMask(blocked, 5, 4)).toBe(1 | 2);
    expect(rockEdgeMask(blocked, 4, 5)).toBe(4 | 8);
    expect(rockEdgeMask(blocked, 5, 5)).toBe(2 | 4);
    expect([...blocked]).toEqual(snapshot);
  });

  it('returns independent cosmetic samples', () => {
    const sample = terrainSample(1979, 12, 37);
    sample.scale = 99;

    expect(terrainSample(1979, 12, 37).scale).toBeLessThanOrEqual(1.18);
  });

  it('describes only inspectable battlefield props and authored cover', () => {
    expect(terrainFeature('none', false)).toBeNull();
    expect(terrainFeature('none', true)).toMatchObject({
      kind: 'rock',
      label: 'Rock formation',
    });
    expect(terrainFeature('shells', false)).toMatchObject({ kind: 'shells' });
    expect(terrainFeature('bones', false)).toMatchObject({ kind: 'bones' });
    expect(terrainFeature('wreckage', true)).toMatchObject({ kind: 'wreckage' });
  });
});
