import { describe, expect, it } from 'vitest';
import { createEmptyMap } from '@iron/shared';
import { mapEnvironment, terrainSample, warRemainsSample } from '../TerrainPainter.js';

describe('terrain presentation', () => {
  it('produces stable cosmetic details from a seed and coordinates', () => {
    expect(terrainSample(1979, 12, 37)).toEqual(terrainSample(1979, 12, 37));
    expect(terrainSample(1979, 12, 37)).not.toEqual(terrainSample(1980, 12, 37));
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

  it('keeps war remains deterministic, sparse and off traversable cells', () => {
    expect(warRemainsSample(1979, 12, 37, false)).toBe('none');
    expect(warRemainsSample(1979, 12, 37, true)).toBe(
      warRemainsSample(1979, 12, 37, true),
    );

    const remains = Array.from({ length: 96 * 96 }, (_, index) =>
      warRemainsSample(1979, index % 96, Math.floor(index / 96), true),
    );
    const decorated = remains.filter((sample) => sample !== 'none');
    expect(decorated.length).toBeGreaterThan(400);
    expect(decorated.length).toBeLessThan(750);
    expect(new Set(decorated)).toEqual(new Set(['shells', 'bones', 'wreckage']));
  });
});
