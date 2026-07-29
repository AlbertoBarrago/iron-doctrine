import { Container, Sprite } from 'pixi.js';
import type { EntitySnapshot } from '@iron/engine';
import type { ProductionFrameId } from '../../assets/assets.gen.js';
import type { ProductionAssetLoader } from '../assets/AssetLoader.js';

const SPRITE_DIRECTIONS = [
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

type SpriteDirection = (typeof SPRITE_DIRECTIONS)[number];
type SpriteUnitType = 'tank' | 'rifleman';
type SpriteVisualState = 'idle' | 'move' | 'recoil' | 'fire';

const TURN = Math.PI * 2;
const DIRECTION_STEP = TURN / SPRITE_DIRECTIONS.length;
const DIRECTION_HYSTERESIS = 0.08;
const DIRECTION_BLEND_SECONDS = 0.09;
const TANK_MOVEMENT_FRAME_SECONDS = 0.12;
const TANK_ACTION_FRAME_SECONDS = 0.07;
const RIFLEMAN_MOVEMENT_FRAME_SECONDS = 0.16;
const RIFLEMAN_ACTION_FRAME_SECONDS = 0.065;
const ACTION_FRAMES = 2;

interface DirectionalSpriteState {
  root: Container;
  current: Sprite;
  outgoing: Sprite | null;
  direction: SpriteDirection;
  frameId: ProductionFrameId;
  transitionStartedAt: number;
  actionStartedAt: number | null;
  firing: boolean;
}

interface SpritePresentation {
  moving?: boolean;
  firing?: boolean;
}

export function tankDirection(angle: number): SpriteDirection {
  const normalized = ((angle % TURN) + TURN) % TURN;
  const index = Math.round(normalized / DIRECTION_STEP) % SPRITE_DIRECTIONS.length;
  return SPRITE_DIRECTIONS[index]!;
}

export function stableTankDirection(angle: number, current: SpriteDirection): SpriteDirection {
  const currentIndex = SPRITE_DIRECTIONS.indexOf(current);
  const currentAngle = currentIndex * DIRECTION_STEP;
  const delta = ((((angle - currentAngle + Math.PI) % TURN) + TURN) % TURN) - Math.PI;
  if (Math.abs(delta) <= DIRECTION_STEP / 2 + DIRECTION_HYSTERESIS) return current;
  return tankDirection(angle);
}

export function tankFrame(
  angle: number,
  state: 'idle' | 'move' | 'recoil' = 'idle',
  step = 0,
): ProductionFrameId {
  return `unit.tank.${state}.${tankDirection(angle)}.${step}` as ProductionFrameId;
}

export function riflemanFrame(
  angle: number,
  state: 'idle' | 'move' | 'fire' = 'idle',
  step = 0,
): ProductionFrameId {
  return `unit.rifleman.${state}.${tankDirection(angle)}.${step}` as ProductionFrameId;
}

function frameForDirection(
  unitType: SpriteUnitType,
  direction: SpriteDirection,
  state: SpriteVisualState,
  step: number,
): ProductionFrameId {
  return `unit.${unitType}.${state}.${direction}.${step}` as ProductionFrameId;
}

export class SpriteUnitPainter {
  readonly container = new Container();
  private readonly units = new Map<number, DirectionalSpriteState>();

  constructor(private readonly assets: ProductionAssetLoader) {}

  draw(
    entity: EntitySnapshot,
    x: number,
    y: number,
    radius: number,
    animationTime = performance.now() / 1000,
    presentation: SpritePresentation = {},
  ): boolean {
    if (entity.unitType !== 'tank' && entity.unitType !== 'rifleman') return false;
    const unitType = entity.unitType;
    let state = this.units.get(entity.id);
    if (!state) {
      const direction = tankDirection(entity.angle);
      const frameId = frameForDirection(unitType, direction, 'idle', 0);
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
        actionStartedAt: null,
        firing: false,
      };
      this.units.set(entity.id, state);
      this.container.addChild(root);
    }

    if (presentation.firing && !state.firing) state.actionStartedAt = animationTime;
    state.firing = presentation.firing ?? false;

    const actionState = unitType === 'tank' ? 'recoil' : 'fire';
    const actionFrameSeconds =
      unitType === 'tank' ? TANK_ACTION_FRAME_SECONDS : RIFLEMAN_ACTION_FRAME_SECONDS;
    const movementFrameSeconds =
      unitType === 'tank' ? TANK_MOVEMENT_FRAME_SECONDS : RIFLEMAN_MOVEMENT_FRAME_SECONDS;
    let visualState: SpriteVisualState = 'idle';
    let step = 0;
    if (state.actionStartedAt !== null) {
      const elapsed = animationTime - state.actionStartedAt;
      if (elapsed < actionFrameSeconds * ACTION_FRAMES) {
        visualState = actionState;
        step = Math.min(ACTION_FRAMES - 1, Math.floor(elapsed / actionFrameSeconds));
      } else {
        state.actionStartedAt = null;
      }
    }
    if (visualState === 'idle' && presentation.moving) {
      visualState = 'move';
      step = Math.floor((animationTime + entity.id * 0.031) / movementFrameSeconds) % 2;
    }

    const nextDirection = stableTankDirection(entity.angle, state.direction);
    const nextFrameId = frameForDirection(unitType, nextDirection, visualState, step);
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
    const spriteSize = radius * (unitType === 'tank' ? 3.2 : 4.6);
    state.current.width = spriteSize;
    state.current.height = spriteSize;
    if (state.outgoing) {
      state.outgoing.width = spriteSize;
      state.outgoing.height = spriteSize;
    }
    return true;
  }

  beginFrame(): void {
    for (const state of this.units.values()) state.root.visible = false;
  }

  endFrame(): void {
    for (const [id, state] of this.units) {
      if (state.root.visible) continue;
      state.root.destroy({ children: true });
      this.units.delete(id);
    }
  }

  private createSprite(texture: Sprite['texture']): Sprite {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    return sprite;
  }
}
