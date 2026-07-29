import { Assets, type Spritesheet, type Texture } from 'pixi.js';
import { PRODUCTION_ATLAS_URL, type ProductionFrameId } from '../../assets/assets.gen.js';

export class ProductionAssetLoader {
  private sheet: Spritesheet | null = null;
  private loading: Promise<void> | null = null;

  load(): Promise<void> {
    if (this.sheet) return Promise.resolve();
    if (!this.loading) {
      this.loading = Assets.load<Spritesheet>(PRODUCTION_ATLAS_URL)
        .then((sheet) => {
          this.sheet = sheet;
        })
        .finally(() => {
          this.loading = null;
        });
    }
    return this.loading;
  }

  texture(frame: ProductionFrameId): Texture | null {
    return this.sheet?.textures[frame] ?? null;
  }

  get ready(): boolean {
    return this.sheet !== null;
  }
}
