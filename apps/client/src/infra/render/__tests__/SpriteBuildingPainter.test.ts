import { type Sprite, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { buildingFrame, SpriteBuildingPainter } from '../SpriteBuildingPainter.js';

describe('production building sprites', () => {
  it('resolves source frames for every authored structure', () => {
    expect(buildingFrame('construction_yard')).toBe('building.construction-yard.idle.south.0');
    expect(buildingFrame('power_plant', 'generate', 5)).toBe(
      'building.power-plant.generate.south.5',
    );
    expect(buildingFrame('barracks', 'produce', 3)).toBe('building.barracks.produce.south.3');
    expect(buildingFrame('factory', 'exit', 5)).toBe('building.factory.exit.south.5');
  });

  it('changes from construction to the one-shot completion state', () => {
    const requested: string[] = [];
    const painter = new SpriteBuildingPainter({
      texture: (frameId: string) => {
        requested.push(frameId);
        return Texture.EMPTY;
      },
    } as never);
    const factory = { id: 21, buildingType: 'factory' };

    painter.draw(factory as never, 100, 80, 24, {
      constructionProgress: 0.5,
      presentationTime: 0,
    });
    painter.draw(factory as never, 100, 80, 24, {
      constructionProgress: 1,
      presentationTime: 1,
    });

    expect(requested).toEqual([
      'building.factory.construction.south.2',
      'building.factory.complete.south.0',
    ]);
  });

  it('falls back to idle instead of preserving an unavailable action frame', () => {
    const requested: string[] = [];
    const painter = new SpriteBuildingPainter({
      texture: (frameId: string) => {
        requested.push(frameId);
        return frameId === 'building.barracks.idle.south.0' ? Texture.EMPTY : null;
      },
    } as never);
    const barracks = { id: 22, buildingType: 'barracks', production: { queue: ['rifleman'] } };

    expect(
      painter.draw(barracks as never, 100, 80, 24, {
        constructionProgress: 1,
        presentationTime: 0,
      }),
    ).toBe(true);
    expect(requested).toEqual([
      'building.barracks.produce.south.0',
      'building.barracks.idle.south.0',
    ]);
  });

  it('uses the first generate frame as the power plant operational fallback', () => {
    const requested: string[] = [];
    const painter = new SpriteBuildingPainter({
      texture: (frameId: string) => {
        requested.push(frameId);
        return frameId === 'building.power-plant.generate.south.0' ? Texture.EMPTY : null;
      },
    } as never);
    const powerPlant = { id: 23, buildingType: 'power_plant' };

    painter.draw(powerPlant as never, 100, 80, 24, {
      constructionProgress: 1,
      presentationTime: 0,
    });
    requested.length = 0;
    expect(
      painter.draw(powerPlant as never, 100, 80, 24, {
        constructionProgress: 1,
        presentationTime: 0.25,
      }),
    ).toBe(true);
    expect(requested).toEqual([
      'building.power-plant.generate.south.2',
      'building.power-plant.generate.south.0',
    ]);
  });

  it('applies owner tint and preserves procedural fallback', () => {
    const painter = new SpriteBuildingPainter({
      texture: () => Texture.EMPTY,
    } as never);

    expect(
      painter.draw({ id: 9, buildingType: 'barracks' } as never, 100, 80, 16, {
        tint: 0xcd9186,
      }),
    ).toBe(true);
    const sprite = painter.container.children[0]?.children[0] as Sprite;
    expect(sprite.tint).toBe(0xcd9186);

    const fallback = new SpriteBuildingPainter({
      texture: () => null,
    } as never);
    expect(fallback.draw({ id: 10, buildingType: 'power_plant' } as never, 100, 80, 16)).toBe(
      false,
    );
    expect(fallback.draw({ id: 11, buildingType: 'turret' } as never, 100, 80, 8)).toBe(false);
  });
});
