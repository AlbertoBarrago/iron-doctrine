import type { EntitySnapshot } from '@iron/engine';
import { Container, Sprite } from 'pixi.js';
import type { ProductionFrameId } from '../../assets/assets.gen.js';
import type { ProductionAssetLoader } from '../assets/AssetLoader.js';
import {
  type AuthoredBuildingType,
  type BuildingAnimationName,
  BuildingAnimationState,
} from './BuildingAnimationState.js';

const BUILDING_CONFIG = {
  construction_yard: { assetId: 'construction-yard', sizeScale: 3.2 },
  power_plant: { assetId: 'power-plant', sizeScale: 3.8 },
  barracks: { assetId: 'barracks', sizeScale: 3.8 },
  factory: { assetId: 'factory', sizeScale: 3.3 },
} as const;

type SpriteBuildingType = keyof typeof BUILDING_CONFIG;

interface BuildingSpriteState {
  root: Container;
  sprite: Sprite;
  frameId: ProductionFrameId;
}

interface BuildingPresentation {
  constructionProgress?: number;
  presentationTime?: number;
  servicing?: boolean;
  tint?: number;
}

export function buildingFrame(
  buildingType: SpriteBuildingType,
  state: BuildingAnimationName | 'operational' = 'idle',
  step = 0,
): ProductionFrameId {
  return `building.${BUILDING_CONFIG[buildingType].assetId}.${state}.south.${step}` as ProductionFrameId;
}

function isSpriteBuilding(value: string | undefined): value is SpriteBuildingType {
  return value !== undefined && value in BUILDING_CONFIG;
}

export class SpriteBuildingPainter {
  readonly container = new Container();
  private readonly buildings = new Map<number, BuildingSpriteState>();
  private readonly animations = new BuildingAnimationState();

  constructor(private readonly assets: ProductionAssetLoader) {}

  draw(
    entity: EntitySnapshot,
    x: number,
    y: number,
    radius: number,
    presentation: BuildingPresentation = {},
  ): boolean {
    if (!isSpriteBuilding(entity.buildingType)) return false;
    const buildingType = entity.buildingType;
    const constructionProgress = presentation.constructionProgress ?? 1;
    const frame = this.animations.resolve({
      entity,
      presentationTime: presentation.presentationTime ?? 0,
      constructionProgress,
      servicing: presentation.servicing,
    });
    const frameId = buildingFrame(buildingType, frame.state, frame.step);
    const resolvedFrame = this.resolveFrame(buildingType, frameId, constructionProgress < 1);
    let state = this.buildings.get(entity.id);

    if (!resolvedFrame) {
      if (state) {
        state.root.destroy({ children: true });
        this.buildings.delete(entity.id);
      }
      return false;
    }

    if (!state) {
      const root = new Container();
      const sprite = new Sprite(resolvedFrame.texture);
      sprite.anchor.set(0.5);
      root.addChild(sprite);
      state = { root, sprite, frameId: resolvedFrame.frameId };
      this.buildings.set(entity.id, state);
      this.container.addChild(root);
    } else if (resolvedFrame.frameId !== state.frameId) {
      state.sprite.texture = resolvedFrame.texture;
      state.frameId = resolvedFrame.frameId;
    }

    state.root.position.set(x, y);
    state.root.visible = true;
    state.root.alpha = constructionProgress < 1 ? 0.72 : 1;
    state.sprite.tint = presentation.tint ?? 0xffffff;
    const spriteSize = radius * BUILDING_CONFIG[buildingType].sizeScale;
    state.sprite.width = spriteSize;
    state.sprite.height = spriteSize;
    return true;
  }

  beginFrame(): void {
    this.animations.beginFrame();
    for (const state of this.buildings.values()) state.root.visible = false;
  }

  endFrame(): void {
    for (const [id, state] of this.buildings) {
      if (state.root.visible) continue;
      state.root.destroy({ children: true });
      this.buildings.delete(id);
    }
    this.animations.endFrame();
  }

  private resolveFrame(
    buildingType: AuthoredBuildingType,
    requested: ProductionFrameId,
    underConstruction: boolean,
  ): {
    frameId: ProductionFrameId;
    texture: NonNullable<ReturnType<ProductionAssetLoader['texture']>>;
  } | null {
    const operationalFrame =
      buildingType === 'power_plant'
        ? buildingFrame(buildingType, 'generate')
        : buildingFrame(buildingType, 'idle');
    const fallbackFrames = [
      ...(underConstruction ? [buildingFrame(buildingType, 'construction')] : []),
      operationalFrame,
      buildingFrame(buildingType, 'operational'),
    ];
    for (const frameId of [requested, ...fallbackFrames]) {
      const texture = this.assets.texture(frameId);
      if (texture) return { frameId, texture };
    }
    return null;
  }
}
