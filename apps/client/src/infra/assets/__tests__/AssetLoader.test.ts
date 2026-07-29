import { Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { mergeProductionTextures } from '../AssetLoader.js';

describe('production atlas textures', () => {
  it('merges independently loaded atlas pages for constant-time lookup', () => {
    const textures = mergeProductionTextures([
      { textures: { 'unit.tank.idle.e.0': Texture.EMPTY } },
      { textures: { 'building.factory.idle.south.0': Texture.WHITE } },
    ] as never);

    expect(textures.get('unit.tank.idle.e.0' as never)).toBe(Texture.EMPTY);
    expect(textures.get('building.factory.idle.south.0' as never)).toBe(Texture.WHITE);
  });

  it('rejects duplicate frame ids across atlas pages', () => {
    expect(() =>
      mergeProductionTextures([
        { textures: { 'unit.tank.idle.e.0': Texture.EMPTY } },
        { textures: { 'unit.tank.idle.e.0': Texture.WHITE } },
      ] as never),
    ).toThrow('Duplicate production frame');
  });
});
