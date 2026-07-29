import type { EntitySnapshot } from '@iron/engine';
import { Container, Sprite } from 'pixi.js';
import type { ProductionFrameId } from '../../assets/assets.gen.js';
import type { ProductionAssetLoader } from '../assets/AssetLoader.js';

const BUILDING_CONFIG = {
  construction_yard: { assetId: 'construction-yard', sizeScale: 3.2 },
  power_plant: { assetId: 'power-plant', sizeScale: 3.8 },
  barracks: { assetId: 'barracks', sizeScale: 3.8 },
  factory: { assetId: 'factory', sizeScale: 3.3 },
} as const;

type SpriteBuildingType = keyof typeof BUILDING_CONFIG;
type SpriteBuildingState = 'idle' | 'operational';

interface BuildingSpriteState {
  root: Container;
  sprite: Sprite;
  frameId: ProductionFrameId;
}

interface BuildingPresentation {
  constructionProgress?: number;
  tint?: number;
}

export function buildingFrame(
  buildingType: SpriteBuildingType,
  state: SpriteBuildingState = 'operational',
): ProductionFrameId {
  return `building.${BUILDING_CONFIG[buildingType].assetId}.${state}.south.0` as ProductionFrameId;
}

function isSpriteBuilding(value: string | undefined): value is SpriteBuildingType {
  return value !== undefined && value in BUILDING_CONFIG;
}

export class SpriteBuildingPainter {
  readonly container = new Container();
  private readonly buildings = new Map<number, BuildingSpriteState>();

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
    const visualState: SpriteBuildingState =
      (presentation.constructionProgress ?? 1) < 1 ? 'idle' : 'operational';
    const frameId = buildingFrame(buildingType, visualState);
    let state = this.buildings.get(entity.id);

    if (!state) {
      const texture = this.assets.texture(frameId);
      if (!texture) return false;
      const root = new Container();
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      root.addChild(sprite);
      state = { root, sprite, frameId };
      this.buildings.set(entity.id, state);
      this.container.addChild(root);
    } else if (frameId !== state.frameId) {
      const texture = this.assets.texture(frameId);
      if (texture) {
        state.sprite.texture = texture;
        state.frameId = frameId;
      }
    }

    state.root.position.set(x, y);
    state.root.visible = true;
    state.root.alpha = visualState === 'idle' ? 0.72 : 1;
    state.sprite.tint = presentation.tint ?? 0xffffff;
    const spriteSize = radius * BUILDING_CONFIG[buildingType].sizeScale;
    state.sprite.width = spriteSize;
    state.sprite.height = spriteSize;
    return true;
  }

  beginFrame(): void {
    for (const state of this.buildings.values()) state.root.visible = false;
  }

  endFrame(): void {
    for (const [id, state] of this.buildings) {
      if (state.root.visible) continue;
      state.root.destroy({ children: true });
      this.buildings.delete(id);
    }
  }
}
