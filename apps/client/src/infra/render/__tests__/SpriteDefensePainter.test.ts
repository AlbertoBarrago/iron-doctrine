import { Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import {
  concreteWallFrame,
  SpriteDefensePainter,
  turretBaseFrame,
  turretHeadFrame,
  wallMask,
} from '../SpriteDefensePainter.js';

describe('production defense sprites', () => {
  it('encodes all N/E/S/W wall connections into a stable mask', () => {
    expect(wallMask(undefined)).toBe('mask-00');
    expect(
      wallMask({ north: true, east: true, south: true, west: true }),
    ).toBe('mask-15');
    expect(
      wallMask({ north: true, east: false, south: true, west: false }),
    ).toBe('mask-05');
    expect(
      concreteWallFrame(
        { north: false, east: true, south: false, west: true },
        'construction',
        3,
      ),
    ).toBe('building.concrete-wall.construction.mask-10.3');
  });

  it('maps turret base states and authoritative facings independently', () => {
    expect(turretBaseFrame('complete', 2)).toBe('building.turret-base.complete.south.2');
    expect(turretHeadFrame(0)).toBe('building.turret-head.idle.e.0');
    expect(turretHeadFrame(Math.PI / 2, 'fire', 1)).toBe(
      'building.turret-head.fire.s.1',
    );
  });

  it('draws a fixed base with a directional head and authored recoil', () => {
    const requested: string[] = [];
    const painter = new SpriteDefensePainter({
      texture: (frameId: string) => {
        requested.push(frameId);
        return Texture.EMPTY;
      },
    } as never);
    const turret = { id: 40, buildingType: 'turret', angle: 0 };

    expect(
      painter.draw(turret as never, 100, 80, 12, {
        constructionProgress: 1,
        presentationTime: 0,
      }),
    ).toBe(true);
    expect(requested).toEqual([
      'building.turret-base.idle.south.0',
      'building.turret-head.idle.e.0',
    ]);

    requested.length = 0;
    painter.draw({ ...turret, angle: Math.PI / 2 } as never, 100, 80, 12, {
      constructionProgress: 1,
      presentationTime: 1,
      firing: true,
    });
    expect(requested).toEqual([
      'building.turret-base.idle.south.0',
      'building.turret-head.fire.s.0',
    ]);
  });

  it('keeps the directional head hidden until construction completes', () => {
    const requested: string[] = [];
    const painter = new SpriteDefensePainter({
      texture: (frameId: string) => {
        requested.push(frameId);
        return Texture.EMPTY;
      },
    } as never);
    const turret = { id: 41, buildingType: 'turret', angle: 0 };

    painter.draw(turret as never, 100, 80, 12, {
      constructionProgress: 0.74,
      presentationTime: 0,
    });
    painter.draw(turret as never, 100, 80, 12, {
      constructionProgress: 1,
      presentationTime: 1,
    });
    expect(requested).toEqual([
      'building.turret-base.construction.south.2',
      'building.turret-base.complete.south.0',
      'building.turret-head.idle.e.0',
    ]);
  });

  it('falls back to procedural defenses when an authored frame is unavailable', () => {
    const painter = new SpriteDefensePainter({
      texture: () => null,
    } as never);
    expect(
      painter.draw({ id: 42, buildingType: 'turret', angle: 0 } as never, 0, 0, 8, {}),
    ).toBe(false);
    expect(
      painter.draw({ id: 43, buildingType: 'concrete_wall' } as never, 0, 0, 8, {}),
    ).toBe(false);
  });
});
