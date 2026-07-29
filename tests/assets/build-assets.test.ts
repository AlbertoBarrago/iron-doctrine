import { describe, expect, it } from 'vitest';
import { describeFrames, packFrames, validateManifest } from '../../scripts/build-assets.mjs';

const asset = {
  id: 'unit.tank',
  atlas: 'vehicles',
  source: 'units/tank.png',
  frameWidth: 64,
  frameHeight: 48,
  directions: ['south', 'west'],
  states: { idle: 1, move: 2 },
  runtime: true,
};

const atlases = {
  vehicles: { id: 'iron-pass-vehicles', maxWidth: 256, maxHeight: 8192, padding: 2 },
};

describe('production asset compiler', () => {
  it('normalizes and sorts a valid manifest', () => {
    const manifest = validateManifest({
      version: 1,
      atlases,
      assets: [asset],
    });
    expect(manifest.assets[0]).toEqual(asset);
    expect(manifest.atlases.vehicles).toEqual(atlases.vehicles);
  });

  it('rejects duplicate asset ids and unsafe source paths', () => {
    expect(() =>
      validateManifest({
        version: 1,
        atlases,
        assets: [asset, asset],
      }),
    ).toThrow('Duplicate asset id');
    expect(() =>
      validateManifest({
        version: 1,
        atlases,
        assets: [{ ...asset, source: '../tank.png' }],
      }),
    ).toThrow('must stay inside assets-src');
  });

  it('validates atlas groups, references and GPU-safe height limits', () => {
    expect(() =>
      validateManifest({
        version: 1,
        atlases: {
          vehicles: atlases.vehicles,
          infantry: { ...atlases.vehicles },
        },
        assets: [asset],
      }),
    ).toThrow('Duplicate atlas id');
    expect(() =>
      validateManifest({
        version: 1,
        atlases,
        assets: [{ ...asset, atlas: 'missing' }],
      }),
    ).toThrow('references unknown atlas');
    expect(() =>
      validateManifest({
        version: 1,
        atlases: {
          vehicles: { ...atlases.vehicles, maxHeight: 8193 },
        },
        assets: [asset],
      }),
    ).toThrow('must not exceed 8192');
    expect(() =>
      validateManifest({
        version: 1,
        atlases: {
          vehicles: { ...atlases.vehicles, maxWidth: 8193 },
        },
        assets: [asset],
      }),
    ).toThrow('must not exceed 8192');
  });

  it('maps state, direction and animation frames deterministically', () => {
    const frames = describeFrames(asset, 192, 96);
    expect(frames).toHaveLength(6);
    expect(frames.map((frame: { id: string }) => frame.id)).toEqual([
      'unit.tank.idle.south.0',
      'unit.tank.idle.west.0',
      'unit.tank.move.south.0',
      'unit.tank.move.south.1',
      'unit.tank.move.west.0',
      'unit.tank.move.west.1',
    ]);
    expect(() => describeFrames(asset, 128, 96)).toThrow('expected 6 source frames, found 4');
  });

  it('preserves declared state order so frame names match source-sheet order', () => {
    const manifest = validateManifest({
      version: 1,
      atlases,
      assets: [{ ...asset, states: { idle: 1, move: 2, fire: 2 } }],
    });

    expect(Object.keys(manifest.assets[0].states)).toEqual(['idle', 'move', 'fire']);
  });

  it('packs frames in stable shelves within the configured width', () => {
    const frames = describeFrames(asset, 192, 96);
    const first = packFrames(frames, 140, 2);
    const second = packFrames(frames, 140, 2);
    expect(first).toEqual(second);
    expect(
      first.frames.every(
        (frame: { x: number; width: number }) => frame.x + frame.width <= first.width,
      ),
    ).toBe(true);
    expect(first.width).toBeLessThanOrEqual(140);
  });

  it('rejects a group whose packed shelves exceed its configured height', () => {
    const frames = describeFrames(asset, 192, 96);
    expect(() => packFrames(frames, 140, 2, 100)).toThrow('exceeds configured max height 100');
  });
});
