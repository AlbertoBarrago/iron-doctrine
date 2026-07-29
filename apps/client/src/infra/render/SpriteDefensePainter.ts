import type { EntitySnapshot } from '@iron/engine';
import { Container, Sprite, Texture } from 'pixi.js';
import type { ProductionFrameId } from '../../assets/assets.gen.js';
import type { ProductionAssetLoader } from '../assets/AssetLoader.js';
import type { WallConnections } from './BuildingPainter.js';
import { stableTankDirection, tankDirection } from './SpriteUnitPainter.js';

const COMPLETE_FRAME_SECONDS = 0.1;
const FIRE_FRAME_SECONDS = 0.07;

type TurretDirection = ReturnType<typeof tankDirection>;

export interface DefensePresentation {
  constructionProgress?: number;
  presentationTime?: number;
  firing?: boolean | undefined;
  tint?: number;
  wallConnections?: WallConnections | undefined;
}

interface TurretState {
  root: Container;
  base: Sprite;
  head: Sprite;
  baseFrameId: ProductionFrameId;
  headFrameId: ProductionFrameId | null;
  direction: TurretDirection;
  constructionProgress: number;
  completeStartedAt: number | null;
  fireStartedAt: number | null;
  firing: boolean;
}

interface WallState {
  root: Container;
  sprite: Sprite;
  frameId: ProductionFrameId;
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function constructionStep(progress: number): number {
  return Math.min(3, Math.floor(clampProgress(progress) * 4));
}

export function wallMask(connections: WallConnections | undefined): string {
  const mask =
    (connections?.north ? 1 : 0) |
    (connections?.east ? 2 : 0) |
    (connections?.south ? 4 : 0) |
    (connections?.west ? 8 : 0);
  return `mask-${String(mask).padStart(2, '0')}`;
}

export function turretBaseFrame(
  state: 'construction' | 'complete' | 'idle',
  step = 0,
): ProductionFrameId {
  return `building.turret-base.${state}.south.${step}` as ProductionFrameId;
}

export function turretHeadFrame(
  angle: number,
  state: 'idle' | 'fire' = 'idle',
  step = 0,
): ProductionFrameId {
  return `building.turret-head.${state}.${tankDirection(angle)}.${step}` as ProductionFrameId;
}

export function concreteWallFrame(
  connections: WallConnections | undefined,
  state: 'construction' | 'idle' = 'idle',
  step = 0,
): ProductionFrameId {
  return `building.concrete-wall.${state}.${wallMask(connections)}.${step}` as ProductionFrameId;
}

export class SpriteDefensePainter {
  readonly container: Container;
  private readonly turrets = new Map<number, TurretState>();
  private readonly walls = new Map<number, WallState>();

  constructor(
    private readonly assets: ProductionAssetLoader,
    container = new Container(),
  ) {
    this.container = container;
  }

  draw(
    entity: EntitySnapshot,
    x: number,
    y: number,
    radius: number,
    presentation: DefensePresentation,
  ): boolean {
    if (entity.buildingType === 'turret') {
      return this.drawTurret(entity, x, y, radius, presentation);
    }
    if (entity.buildingType === 'concrete_wall') {
      return this.drawWall(entity, x, y, radius, presentation);
    }
    return false;
  }

  beginFrame(): void {
    for (const state of this.turrets.values()) state.root.visible = false;
    for (const state of this.walls.values()) state.root.visible = false;
  }

  endFrame(): void {
    for (const [id, state] of this.turrets) {
      if (state.root.visible) continue;
      state.root.destroy({ children: true });
      this.turrets.delete(id);
    }
    for (const [id, state] of this.walls) {
      if (state.root.visible) continue;
      state.root.destroy({ children: true });
      this.walls.delete(id);
    }
  }

  private drawTurret(
    entity: EntitySnapshot,
    x: number,
    y: number,
    radius: number,
    presentation: DefensePresentation,
  ): boolean {
    const progress = clampProgress(presentation.constructionProgress ?? 1);
    const time = presentation.presentationTime ?? 0;
    const firing = presentation.firing ?? false;
    const previous = this.turrets.get(entity.id);
    const direction = previous
      ? stableTankDirection(entity.angle, previous.direction)
      : tankDirection(entity.angle);
    const completedNow =
      previous !== undefined && previous.constructionProgress < 1 && progress >= 1;
    const completeStartedAt = completedNow ? time : (previous?.completeStartedAt ?? null);
    const firedNow = firing && !(previous?.firing ?? false) && progress >= 1;
    const fireStartedAt = firedNow ? time : (previous?.fireStartedAt ?? null);

    let baseFrameId: ProductionFrameId;
    if (progress < 1) {
      baseFrameId = turretBaseFrame('construction', constructionStep(progress));
    } else if (
      completeStartedAt !== null &&
      time - completeStartedAt < COMPLETE_FRAME_SECONDS * 4
    ) {
      baseFrameId = turretBaseFrame(
        'complete',
        Math.min(3, Math.floor((time - completeStartedAt) / COMPLETE_FRAME_SECONDS)),
      );
    } else {
      baseFrameId = turretBaseFrame('idle');
    }

    let headFrameId: ProductionFrameId | null = null;
    if (progress >= 1) {
      const fireElapsed = fireStartedAt === null ? Number.POSITIVE_INFINITY : time - fireStartedAt;
      headFrameId =
        fireElapsed < FIRE_FRAME_SECONDS * 2
          ? (`building.turret-head.fire.${direction}.${Math.min(
              1,
              Math.floor(fireElapsed / FIRE_FRAME_SECONDS),
            )}` as ProductionFrameId)
          : (`building.turret-head.idle.${direction}.0` as ProductionFrameId);
    }

    const baseTexture = this.assets.texture(baseFrameId);
    const resolvedHeadTexture = headFrameId ? this.assets.texture(headFrameId) : null;
    if (!baseTexture || (headFrameId !== null && !resolvedHeadTexture)) {
      previous?.root.destroy({ children: true });
      this.turrets.delete(entity.id);
      return false;
    }
    const headTexture = resolvedHeadTexture ?? Texture.EMPTY;

    let state = previous;
    if (!state) {
      const root = new Container();
      const base = new Sprite(baseTexture);
      const head = new Sprite(headTexture);
      base.anchor.set(0.5);
      head.anchor.set(0.5);
      root.addChild(base, head);
      state = {
        root,
        base,
        head,
        baseFrameId,
        headFrameId,
        direction,
        constructionProgress: progress,
        completeStartedAt,
        fireStartedAt,
        firing,
      };
      this.turrets.set(entity.id, state);
      this.container.addChild(root);
    } else {
      if (baseFrameId !== state.baseFrameId) state.base.texture = baseTexture;
      if (headFrameId !== state.headFrameId) state.head.texture = headTexture;
      state.baseFrameId = baseFrameId;
      state.headFrameId = headFrameId;
      state.direction = direction;
      state.constructionProgress = progress;
      state.completeStartedAt = completeStartedAt;
      state.fireStartedAt =
        fireStartedAt !== null && time - fireStartedAt < FIRE_FRAME_SECONDS * 2
          ? fireStartedAt
          : null;
      state.firing = firing;
    }

    const spriteSize = radius * 4.4;
    state.root.position.set(x, y);
    state.root.visible = true;
    state.root.alpha = progress < 1 ? 0.72 : 1;
    state.base.width = spriteSize;
    state.base.height = spriteSize;
    state.head.width = spriteSize;
    state.head.height = spriteSize;
    state.head.visible = headFrameId !== null;
    state.base.tint = presentation.tint ?? 0xffffff;
    state.head.tint = presentation.tint ?? 0xffffff;
    return true;
  }

  private drawWall(
    entity: EntitySnapshot,
    x: number,
    y: number,
    radius: number,
    presentation: DefensePresentation,
  ): boolean {
    const progress = clampProgress(presentation.constructionProgress ?? 1);
    const frameId =
      progress < 1
        ? concreteWallFrame(
            presentation.wallConnections,
            'construction',
            constructionStep(progress),
          )
        : concreteWallFrame(presentation.wallConnections);
    const texture = this.assets.texture(frameId);
    const previous = this.walls.get(entity.id);
    if (!texture) {
      previous?.root.destroy({ children: true });
      this.walls.delete(entity.id);
      return false;
    }

    let state = previous;
    if (!state) {
      const root = new Container();
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      root.addChild(sprite);
      state = { root, sprite, frameId };
      this.walls.set(entity.id, state);
      this.container.addChild(root);
    } else if (frameId !== state.frameId) {
      state.sprite.texture = texture;
      state.frameId = frameId;
    }

    // The authored arms occupy 93.75% of the source frame; compensate so
    // neighbouring one-cell sprites meet exactly at their shared edge.
    const spriteSize = radius * 2.14;
    state.root.position.set(x, y);
    state.root.visible = true;
    state.root.alpha = progress < 1 ? 0.72 : 1;
    state.sprite.width = spriteSize;
    state.sprite.height = spriteSize;
    state.sprite.tint = presentation.tint ?? 0xffffff;
    return true;
  }
}
