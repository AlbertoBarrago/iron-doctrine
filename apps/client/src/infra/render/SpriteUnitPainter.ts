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
type TankVisualState = 'idle' | 'move' | 'recoil';

const TURN = Math.PI * 2;
const DIRECTION_STEP = TURN / TANK_DIRECTIONS.length;
const DIRECTION_HYSTERESIS = 0.08;
const DIRECTION_BLEND_SECONDS = 0.09;
const MOVEMENT_FRAME_SECONDS = 0.12;
const RECOIL_FRAME_SECONDS = 0.07;
const RECOIL_FRAMES = 2;

interface TankSpriteState {
  root: Container;
  current: Sprite;
  outgoing: Sprite | null;
  direction: TankDirection;
  frameId: ProductionFrameId;
  transitionStartedAt: number;
  recoilStartedAt: number | null;
  firing: boolean;
}

interface TankPresentation {
  moving?: boolean;
  firing?: boolean;
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

export function tankFrame(
  angle: number,
  state: TankVisualState = 'idle',
  step = 0,
): ProductionFrameId {
  return `unit.tank.${state}.${tankDirection(angle)}.${step}` as ProductionFrameId;
}

function tankFrameForDirection(
  direction: TankDirection,
  state: TankVisualState,
  step: number,
): ProductionFrameId {
  return `unit.tank.${state}.${direction}.${step}` as ProductionFrameId;
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
    presentation: TankPresentation = {},
  ): boolean {
    if (entity.unitType !== 'tank') return false;
    let state = this.tanks.get(entity.id);
    if (!state) {
      const direction = tankDirection(entity.angle);
      const frameId = tankFrameForDirection(direction, 'idle', 0);
      const texture = this.assets.texture(frameId);
      if (!texture) return false;
      const root = new Container();
      const current = this.createSprite(texture);
      root.addChild(current);
      state = {
        root,
        current,
        outgoing: null,
        direction,
        frameId,
        transitionStartedAt: animationTime,
        recoilStartedAt: null,
        firing: false,
      };
      this.tanks.set(entity.id, state);
      this.container.addChild(root);
    }

    if (presentation.firing && !state.firing) state.recoilStartedAt = animationTime;
    state.firing = presentation.firing ?? false;

    let visualState: TankVisualState = 'idle';
    let step = 0;
    if (state.recoilStartedAt !== null) {
      const elapsed = animationTime - state.recoilStartedAt;
      if (elapsed < RECOIL_FRAME_SECONDS * RECOIL_FRAMES) {
        visualState = 'recoil';
        step = Math.min(RECOIL_FRAMES - 1, Math.floor(elapsed / RECOIL_FRAME_SECONDS));
      } else {
        state.recoilStartedAt = null;
      }
    }
    if (visualState === 'idle' && presentation.moving) {
      visualState = 'move';
      step = Math.floor((animationTime + entity.id * 0.031) / MOVEMENT_FRAME_SECONDS) % 2;
    }

    const nextDirection = stableTankDirection(entity.angle, state.direction);
    const nextFrameId = tankFrameForDirection(nextDirection, visualState, step);
    if (nextDirection !== state.direction) {
      const texture = this.assets.texture(nextFrameId);
      if (texture) {
        state.outgoing?.destroy();
        state.outgoing = state.current;
        state.current = this.createSprite(texture);
        state.current.alpha = 0;
        state.root.addChild(state.current);
        state.direction = nextDirection;
        state.frameId = nextFrameId;
        state.transitionStartedAt = animationTime;
      }
    } else if (nextFrameId !== state.frameId) {
      const texture = this.assets.texture(nextFrameId);
      if (texture) {
        state.current.texture = texture;
        state.frameId = nextFrameId;
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
