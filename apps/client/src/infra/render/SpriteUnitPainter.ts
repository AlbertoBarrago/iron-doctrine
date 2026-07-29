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
type SpriteUnitType = 'tank' | 'rifleman' | 'scout';
type SpriteVisualState = 'idle' | 'move' | 'recoil' | 'fire';

const TURN = Math.PI * 2;
const DIRECTION_STEP = TURN / SPRITE_DIRECTIONS.length;
const DIRECTION_HYSTERESIS = 0.08;
const DIRECTION_BLEND_SECONDS = 0.09;
interface SpriteUnitConfig {
  anchorY: number;
  movementFrameSeconds: number;
  movementFrames: number;
  sizeScale: number;
  action?: {
    frameSeconds: number;
    frames: number;
    state: 'recoil' | 'fire';
  };
  engagedFrame?: {
    state: 'fire';
    step: number;
  };
}

const UNIT_CONFIG: Record<SpriteUnitType, SpriteUnitConfig> = {
  tank: {
    anchorY: 0.5,
    movementFrameSeconds: 0.12,
    movementFrames: 2,
    sizeScale: 3.2,
    action: { frameSeconds: 0.07, frames: 2, state: 'recoil' },
  },
  rifleman: {
    anchorY: 0.71,
    movementFrameSeconds: 0.06,
    movementFrames: 8,
    sizeScale: 4.6,
    action: { frameSeconds: 0.065, frames: 2, state: 'fire' },
    engagedFrame: { state: 'fire', step: 1 },
  },
  scout: {
    anchorY: 0.5,
    movementFrameSeconds: 0.08,
    movementFrames: 4,
    sizeScale: 3.7,
  },
};

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
  engaged?: boolean;
  tint?: number;
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

export function scoutFrame(
  angle: number,
  state: 'idle' | 'move' = 'idle',
  step = 0,
): ProductionFrameId {
  return `unit.scout.${state}.${tankDirection(angle)}.${step}` as ProductionFrameId;
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
    if (
      entity.unitType !== 'tank' &&
      entity.unitType !== 'rifleman' &&
      entity.unitType !== 'scout'
    ) {
      return false;
    }
    const unitType = entity.unitType;
    const config = UNIT_CONFIG[unitType];
    let state = this.units.get(entity.id);
    if (!state) {
      const direction = tankDirection(entity.angle);
      const frameId = frameForDirection(unitType, direction, 'idle', 0);
      const texture = this.assets.texture(frameId);
      if (!texture) return false;
      const root = new Container();
      const current = this.createSprite(texture, unitType);
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

    if (config.action && presentation.firing && !state.firing) {
      state.actionStartedAt = animationTime;
    }
    state.firing = presentation.firing ?? false;

    let visualState: SpriteVisualState = 'idle';
    let step = 0;
    if (config.action && state.actionStartedAt !== null) {
      const elapsed = animationTime - state.actionStartedAt;
      if (elapsed < config.action.frameSeconds * config.action.frames) {
        visualState = config.action.state;
        step = Math.min(config.action.frames - 1, Math.floor(elapsed / config.action.frameSeconds));
      } else {
        state.actionStartedAt = null;
      }
    }
    if (visualState === 'idle') {
      if (config.engagedFrame && presentation.engaged) {
        visualState = config.engagedFrame.state;
        step = config.engagedFrame.step;
      } else if (presentation.moving) {
        visualState = 'move';
        step =
          Math.floor((animationTime + entity.id * 0.031) / config.movementFrameSeconds) %
          config.movementFrames;
      }
    }

    const nextDirection = stableTankDirection(entity.angle, state.direction);
    const nextFrameId = frameForDirection(unitType, nextDirection, visualState, step);
    if (nextDirection !== state.direction) {
      const texture = this.assets.texture(nextFrameId);
      if (texture) {
        state.outgoing?.destroy();
        state.outgoing = state.current;
        state.current = this.createSprite(texture, unitType);
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
    const tint = presentation.tint ?? 0xffffff;
    state.current.tint = tint;
    if (state.outgoing) state.outgoing.tint = tint;
    const spriteSize = radius * config.sizeScale;
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

  private createSprite(texture: Sprite['texture'], unitType: SpriteUnitType): Sprite {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, UNIT_CONFIG[unitType].anchorY);
    return sprite;
  }
}
