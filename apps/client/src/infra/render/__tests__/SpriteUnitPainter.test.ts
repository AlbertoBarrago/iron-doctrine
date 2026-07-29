import { type Sprite, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import {
  SpriteUnitPainter,
  engineerFrame,
  harvesterFrame,
  medicFrame,
  riflemanFrame,
  scoutFrame,
  stableTankDirection,
  tankDirection,
  tankFrame,
} from '../SpriteUnitPainter.js';

describe('tank sprite direction', () => {
  it('quantizes a full turn to the closest of 16 authored facings', () => {
    expect(tankDirection(0)).toBe('e');
    expect(tankDirection(Math.PI / 4)).toBe('se');
    expect(tankDirection(Math.PI / 2)).toBe('s');
    expect(tankDirection(Math.PI)).toBe('w');
    expect(tankDirection(-Math.PI / 2)).toBe('n');
    expect(tankDirection(Math.PI * 2)).toBe('e');
  });

  it('resolves the generated atlas frame id', () => {
    expect(tankFrame(Math.PI / 8)).toBe('unit.tank.idle.ese.0');
    expect(tankFrame(Math.PI / 8, 'move', 1)).toBe('unit.tank.move.ese.1');
    expect(tankFrame(Math.PI / 8, 'recoil', 0)).toBe('unit.tank.recoil.ese.0');
    expect(riflemanFrame(Math.PI / 8)).toBe('unit.rifleman.idle.ese.0');
    expect(riflemanFrame(Math.PI / 8, 'move', 7)).toBe('unit.rifleman.move.ese.7');
    expect(riflemanFrame(Math.PI / 8, 'fire', 1)).toBe('unit.rifleman.fire.ese.1');
    expect(engineerFrame(Math.PI / 8, 'move', 7)).toBe('unit.engineer.move.ese.7');
    expect(medicFrame(Math.PI / 8, 'heal', 3)).toBe('unit.medic.heal.ese.3');
    expect(scoutFrame(Math.PI / 8)).toBe('unit.scout.idle.ese.0');
    expect(scoutFrame(Math.PI / 8, 'move', 3)).toBe('unit.scout.move.ese.3');
    expect(harvesterFrame(Math.PI / 8, 'idle-loaded')).toBe('unit.harvester.idle-loaded.ese.0');
    expect(harvesterFrame(Math.PI / 8, 'deposit', 2)).toBe('unit.harvester.deposit.ese.2');
  });

  it('holds the current facing around a direction boundary', () => {
    expect(stableTankDirection(Math.PI / 16 + 0.04, 'e')).toBe('e');
    expect(stableTankDirection(Math.PI / 16 + 0.1, 'e')).toBe('ese');
  });

  it('briefly blends adjacent authored facings', () => {
    const painter = new SpriteUnitPainter({
      texture: () => Texture.EMPTY,
    } as never);
    const tank = { id: 7, unitType: 'tank', angle: 0 };

    painter.draw(tank as never, 100, 80, 12, 1);
    painter.draw({ ...tank, angle: Math.PI / 8 } as never, 100, 80, 12, 1.01);
    expect(painter.container.children[0]?.children).toHaveLength(2);

    painter.draw({ ...tank, angle: Math.PI / 8 } as never, 100, 80, 12, 1.2);
    expect(painter.container.children[0]?.children).toHaveLength(1);
  });

  it('registers infantry on its feet while tanks retain their centered anchor', () => {
    const painter = new SpriteUnitPainter({
      texture: () => Texture.EMPTY,
    } as never);

    painter.draw({ id: 7, unitType: 'tank', angle: 0 } as never, 100, 80, 12, 1);
    painter.draw({ id: 11, unitType: 'rifleman', angle: 0 } as never, 120, 80, 8, 1);

    const tank = painter.container.children[0]?.children[0] as Sprite;
    const rifleman = painter.container.children[1]?.children[0] as Sprite;
    expect(tank.anchor.y).toBe(0.5);
    expect(rifleman.anchor.y).toBe(0.71);
  });

  it('applies the owner tint without changing authored texture selection', () => {
    const painter = new SpriteUnitPainter({
      texture: () => Texture.EMPTY,
    } as never);

    painter.draw({ id: 11, unitType: 'rifleman', angle: 0 } as never, 100, 80, 8, 1, {
      tint: 0xcd9186,
    });

    const rifleman = painter.container.children[0]?.children[0] as Sprite;
    expect(rifleman.tint).toBe(0xcd9186);
  });

  it('keeps spawn and hit feedback grounded without replacing authored frames', () => {
    const requested: string[] = [];
    const painter = new SpriteUnitPainter({
      texture: (frameId: string) => {
        requested.push(frameId);
        return Texture.EMPTY;
      },
    } as never);
    const rifleman = {
      id: 11,
      unitType: 'rifleman',
      angle: 0,
      hp: 80,
      maxHp: 100,
    };

    painter.draw(rifleman as never, 100, 80, 8, 1, {
      moving: true,
      spawned: true,
      previousHp: 100,
      tint: 0xcd9186,
    });

    const root = painter.container.children[0]!;
    const sprite = root.children[0] as Sprite;
    expect(root.alpha).toBe(0.35);
    expect(root.scale.x).toBe(0.9);
    expect(sprite.tint).toBe(0xffffff);
    expect(requested.some((frame) => frame.startsWith('unit.rifleman.move.e.'))).toBe(true);

    painter.draw(rifleman as never, 100, 80, 8, 1.2, {
      moving: true,
      spawned: false,
      previousHp: 80,
      tint: 0xcd9186,
    });
    expect(root.alpha).toBe(1);
    expect(root.scale.x).toBe(1);
    expect(sprite.tint).toBe(0xcd9186);
  });

  it('selects authored movement and recoil frames from presentation state', () => {
    const requested: string[] = [];
    const painter = new SpriteUnitPainter({
      texture: (frameId: string) => {
        requested.push(frameId);
        return Texture.EMPTY;
      },
    } as never);
    const tank = { id: 7, unitType: 'tank', angle: 0 };

    painter.draw(tank as never, 100, 80, 12, 1, { moving: true });
    painter.draw(tank as never, 100, 80, 12, 1.01, { firing: true });
    painter.draw(tank as never, 100, 80, 12, 1.09, { firing: false });

    expect(requested).toContain('unit.tank.move.e.0');
    expect(requested).toContain('unit.tank.recoil.e.0');
    expect(requested).toContain('unit.tank.recoil.e.1');
  });

  it('selects authored Rifleman movement and holds its fire stance while engaged', () => {
    const requested: string[] = [];
    const painter = new SpriteUnitPainter({
      texture: (frameId: string) => {
        requested.push(frameId);
        return Texture.EMPTY;
      },
    } as never);
    const rifleman = { id: 11, unitType: 'rifleman', angle: 0 };

    painter.draw(rifleman as never, 100, 80, 8, 1, { moving: true });
    painter.draw(rifleman as never, 100, 80, 8, 1.01, { firing: true, engaged: true });
    painter.draw(rifleman as never, 100, 80, 8, 1.08, { firing: false, engaged: true });
    painter.draw(rifleman as never, 100, 80, 8, 1.3, { firing: false, engaged: true });

    expect(requested.some((frame) => frame.startsWith('unit.rifleman.move.e.'))).toBe(true);
    expect(requested).toContain('unit.rifleman.fire.e.0');
    expect(requested).toContain('unit.rifleman.fire.e.1');
    expect(requested.at(-1)).toBe('unit.rifleman.fire.e.1');
  });

  it('plays all eight Rifleman gait poses at the authored cadence', () => {
    const requested: string[] = [];
    const painter = new SpriteUnitPainter({
      texture: (frameId: string) => {
        requested.push(frameId);
        return Texture.EMPTY;
      },
    } as never);
    const rifleman = { id: 11, unitType: 'rifleman', angle: 0 };

    for (const animationTime of [0.02, 0.08, 0.14, 0.2, 0.26, 0.32, 0.38, 0.44]) {
      painter.draw(rifleman as never, 100, 80, 8, animationTime, { moving: true });
    }

    for (let step = 0; step < 8; step++) {
      expect(requested).toContain(`unit.rifleman.move.e.${step}`);
    }
  });

  it('uses authored support infantry states without inventing Engineer work', () => {
    const requested: string[] = [];
    const painter = new SpriteUnitPainter({
      texture: (frameId: string) => {
        requested.push(frameId);
        return Texture.EMPTY;
      },
    } as never);
    const engineer = { id: 21, unitType: 'engineer', angle: 0 };
    const medic = { id: 22, unitType: 'medic', angle: 0, healingTarget: 7 };

    painter.draw(engineer as never, 100, 80, 8, 1);
    painter.draw(engineer as never, 100, 80, 8, 1.08, { moving: true });
    painter.draw(medic as never, 120, 80, 8, 1);
    painter.draw(medic as never, 120, 80, 8, 1.1);

    expect(requested).toContain('unit.engineer.idle.e.0');
    expect(requested.some((frame) => frame.startsWith('unit.engineer.move.e.'))).toBe(true);
    expect(requested.some((frame) => frame.startsWith('unit.medic.heal.e.'))).toBe(true);
    expect(requested.some((frame) => frame.includes('engineer.work'))).toBe(false);
  });

  it('plays all four Scout wheel poses at the authored cadence', () => {
    const requested: string[] = [];
    const painter = new SpriteUnitPainter({
      texture: (frameId: string) => {
        requested.push(frameId);
        return Texture.EMPTY;
      },
    } as never);
    const scout = { id: 13, unitType: 'scout', angle: 0 };

    for (const animationTime of [0.02, 0.1, 0.18, 0.26]) {
      painter.draw(scout as never, 100, 80, 8, animationTime, { moving: true });
    }

    for (let step = 0; step < 4; step++) {
      expect(requested).toContain(`unit.scout.move.e.${step}`);
    }
  });

  it('derives Harvester load and action poses from authoritative cargo', () => {
    const requested: string[] = [];
    const painter = new SpriteUnitPainter({
      texture: (frameId: string) => {
        requested.push(frameId);
        return Texture.EMPTY;
      },
    } as never);
    const harvester = {
      id: 17,
      unitType: 'harvester',
      angle: 0,
      cargo: { amount: 0, capacity: 100, phase: 'idle' },
    };

    painter.draw(harvester as never, 100, 80, 16, 1);
    painter.draw(
      { ...harvester, cargo: { ...harvester.cargo, amount: 50, phase: 'toBase' } } as never,
      100,
      80,
      16,
      1.1,
      { moving: true },
    );
    painter.draw(
      { ...harvester, cargo: { ...harvester.cargo, amount: 75, phase: 'gathering' } } as never,
      100,
      80,
      16,
      1.2,
    );
    painter.draw(
      { ...harvester, cargo: { ...harvester.cargo, amount: 20, phase: 'depositing' } } as never,
      100,
      80,
      16,
      1.3,
    );

    expect(requested).toContain('unit.harvester.idle.e.0');
    expect(requested.some((frame) => frame.startsWith('unit.harvester.move-loaded.e.'))).toBe(true);
    expect(requested).toContain('unit.harvester.gather.e.3');
    expect(requested).toContain('unit.harvester.deposit.e.2');
  });

  it('leaves supported units to the procedural fallback while the atlas is unavailable', () => {
    const painter = new SpriteUnitPainter({
      texture: () => null,
    } as never);
    expect(painter.draw({ id: 7, unitType: 'tank', angle: 0 } as never, 100, 80, 12)).toBe(false);
    expect(painter.draw({ id: 13, unitType: 'scout', angle: 0 } as never, 100, 80, 8)).toBe(false);
    expect(painter.draw({ id: 17, unitType: 'harvester', angle: 0 } as never, 100, 80, 16)).toBe(
      false,
    );
    expect(painter.container.children).toHaveLength(0);
  });
});
