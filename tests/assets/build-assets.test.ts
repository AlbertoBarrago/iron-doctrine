import { describe, expect, it } from 'vitest';
import { describeFrames, packFrames, validateManifest } from '../../scripts/build-assets.mjs';

const asset = {
  id: 'unit.tank',
  source: 'units/tank.png',
  frameWidth: 64,
  frameHeight: 48,
  directions: ['south', 'west'],
  states: { idle: 1, move: 2 },
  runtime: true,
};

describe('production asset compiler', () => {
  it('normalizes and sorts a valid manifest', () => {
    const manifest = validateManifest({
      version: 1,
      atlas: { id: 'iron-pass', maxWidth: 256, padding: 2 },
      assets: [asset],
    });
    expect(manifest.assets[0]).toEqual(asset);
  });

  it('rejects duplicate ids and unsafe source paths', () => {
    expect(() =>
      validateManifest({
        version: 1,
        atlas: { id: 'iron-pass', maxWidth: 256, padding: 2 },
        assets: [asset, asset],
      }),
    ).toThrow('Duplicate asset id');
    expect(() =>
      validateManifest({
        version: 1,
        atlas: { id: 'iron-pass', maxWidth: 256, padding: 2 },
        assets: [{ ...asset, source: '../tank.png' }],
      }),
    ).toThrow('must stay inside assets-src');
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
      atlas: { id: 'iron-pass', maxWidth: 256, padding: 2 },
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
});
