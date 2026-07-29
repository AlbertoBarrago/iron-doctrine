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

type TankDirection = (typeof TANK_DIRECTIONS)[number];

const TURN = Math.PI * 2;
const DIRECTION_STEP = TURN / TANK_DIRECTIONS.length;
const DIRECTION_HYSTERESIS = 0.08;
const DIRECTION_BLEND_SECONDS = 0.09;

interface TankSpriteState {
  root: Container;
  current: Sprite;
  outgoing: Sprite | null;
  direction: TankDirection;
  transitionStartedAt: number;
}

export function tankDirection(angle: number): TankDirection {
  const normalized = ((angle % TURN) + TURN) % TURN;
  const index = Math.round(normalized / DIRECTION_STEP) % TANK_DIRECTIONS.length;
  return TANK_DIRECTIONS[index]!;
}

export function stableTankDirection(angle: number, current: TankDirection): TankDirection {
  const currentIndex = TANK_DIRECTIONS.indexOf(current);
  const currentAngle = currentIndex * DIRECTION_STEP;
  const delta = ((((angle - currentAngle + Math.PI) % TURN) + TURN) % TURN) - Math.PI;
  if (Math.abs(delta) <= DIRECTION_STEP / 2 + DIRECTION_HYSTERESIS) return current;
  return tankDirection(angle);
}

export function tankFrame(angle: number): ProductionFrameId {
  return `unit.tank.idle.${tankDirection(angle)}.0`;
}

function tankFrameForDirection(direction: TankDirection): ProductionFrameId {
  return `unit.tank.idle.${direction}.0`;
}

export class SpriteUnitPainter {
  readonly container = new Container();
  private readonly tanks = new Map<number, TankSpriteState>();

  constructor(private readonly assets: ProductionAssetLoader) {}

  draw(
    entity: EntitySnapshot,
    x: number,
    y: number,
    radius: number,
    animationTime = performance.now() / 1000,
  ): boolean {
    if (entity.unitType !== 'tank') return false;
    let state = this.tanks.get(entity.id);
    if (!state) {
      const direction = tankDirection(entity.angle);
      const texture = this.assets.texture(tankFrameForDirection(direction));
      if (!texture) return false;
      const root = new Container();
      const current = this.createSprite(texture);
      root.addChild(current);
      state = {
        root,
        current,
        outgoing: null,
        direction,
        transitionStartedAt: animationTime,
      };
      this.tanks.set(entity.id, state);
      this.container.addChild(root);
    }

    const nextDirection = stableTankDirection(entity.angle, state.direction);
    if (nextDirection !== state.direction) {
      const texture = this.assets.texture(tankFrameForDirection(nextDirection));
      if (texture) {
        state.outgoing?.destroy();
        state.outgoing = state.current;
        state.current = this.createSprite(texture);
        state.current.alpha = 0;
        state.root.addChild(state.current);
        state.direction = nextDirection;
        state.transitionStartedAt = animationTime;
      }
    }

    const progress = Math.min(
      1,
      Math.max(0, (animationTime - state.transitionStartedAt) / DIRECTION_BLEND_SECONDS),
    );
    state.current.alpha = state.outgoing ? progress : 1;
    if (state.outgoing) {
      state.outgoing.alpha = 1 - progress;
      if (progress === 1) {
        state.outgoing.destroy();
        state.outgoing = null;
      }
    }
    state.root.position.set(x, y);
    state.root.visible = true;
    state.current.width = radius * 3.2;
    state.current.height = radius * 3.2;
    if (state.outgoing) {
      state.outgoing.width = radius * 3.2;
      state.outgoing.height = radius * 3.2;
    }
    return true;
  }

  beginFrame(): void {
    for (const state of this.tanks.values()) state.root.visible = false;
  }

  endFrame(): void {
    for (const [id, state] of this.tanks) {
      if (state.root.visible) continue;
      state.root.destroy({ children: true });
      this.tanks.delete(id);
    }
  }

  private createSprite(texture: Sprite['texture']): Sprite {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    return sprite;
  }
}
