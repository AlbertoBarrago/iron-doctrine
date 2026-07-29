import { Container, Sprite } from 'pixi.js';
import type { EntitySnapshot } from '@iron/engine';
import type { ProductionFrameId } from '../../assets/assets.gen.js';
import type { ProductionAssetLoader } from '../assets/AssetLoader.js';

const TANK_DIRECTIONS = [
  'e',
  'ese',
  'se',
  'sse',
  's',
  'ssw',
  'sw',
  'wsw',
  'w',
  'wnw',
  'nw',
  'nnw',
  'n',
  'nne',
  'ne',
  'ene',
] as const;

export function tankDirection(angle: number): (typeof TANK_DIRECTIONS)[number] {
  const turn = Math.PI * 2;
  const normalized = ((angle % turn) + turn) % turn;
  const index = Math.round(normalized / (turn / TANK_DIRECTIONS.length)) % TANK_DIRECTIONS.length;
  return TANK_DIRECTIONS[index]!;
}

export function tankFrame(angle: number): ProductionFrameId {
  return `unit.tank.idle.${tankDirection(angle)}.0`;
}

export class SpriteUnitPainter {
  readonly container = new Container();
  private readonly sprites = new Map<number, Sprite>();

  constructor(private readonly assets: ProductionAssetLoader) {}

  draw(entity: EntitySnapshot, x: number, y: number, radius: number): boolean {
    if (entity.unitType !== 'tank') return false;
    const texture = this.assets.texture(tankFrame(entity.angle));
    if (!texture) return false;

    let sprite = this.sprites.get(entity.id);
    if (!sprite) {
      sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      this.sprites.set(entity.id, sprite);
      this.container.addChild(sprite);
    } else {
      sprite.texture = texture;
    }
    sprite.position.set(x, y);
    sprite.width = radius * 3.2;
    sprite.height = radius * 3.2;
    sprite.visible = true;
    return true;
  }

  beginFrame(): void {
    for (const sprite of this.sprites.values()) sprite.visible = false;
  }

  endFrame(): void {
    for (const [id, sprite] of this.sprites) {
      if (sprite.visible) continue;
      sprite.destroy();
      this.sprites.delete(id);
    }
  }
}
