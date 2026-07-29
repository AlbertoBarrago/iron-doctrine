import { type Sprite, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { buildingFrame, SpriteBuildingPainter } from '../SpriteBuildingPainter.js';

describe('production building sprites', () => {
  it('resolves source frames for every authored structure', () => {
    expect(buildingFrame('construction_yard')).toBe(
      'building.construction-yard.operational.south.0',
    );
    expect(buildingFrame('power_plant', 'idle')).toBe('building.power-plant.idle.south.0');
    expect(buildingFrame('barracks')).toBe('building.barracks.operational.south.0');
    expect(buildingFrame('factory')).toBe('building.factory.operational.south.0');
  });

  it('changes from idle to operational when construction completes', () => {
    const requested: string[] = [];
    const painter = new SpriteBuildingPainter({
      texture: (frameId: string) => {
        requested.push(frameId);
        return Texture.EMPTY;
      },
    } as never);
    const factory = { id: 21, buildingType: 'factory' };

    painter.draw(factory as never, 100, 80, 24, { constructionProgress: 0.5 });
    painter.draw(factory as never, 100, 80, 24, { constructionProgress: 1 });

    expect(requested).toEqual([
      'building.factory.idle.south.0',
      'building.factory.operational.south.0',
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
