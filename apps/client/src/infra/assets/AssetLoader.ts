import { Assets, type Spritesheet, type Texture } from 'pixi.js';
import { PRODUCTION_ATLAS_URLS, type ProductionFrameId } from '../../assets/assets.gen.js';

export class ProductionAssetLoader {
  private textures: ReadonlyMap<ProductionFrameId, Texture> | null = null;
  private loading: Promise<void> | null = null;

  load(): Promise<void> {
    if (this.textures) return Promise.resolve();
    if (!this.loading) {
      this.loading = Promise.allSettled(
        PRODUCTION_ATLAS_URLS.map((url) => Assets.load<Spritesheet>(url)),
      )
        .then((results) => {
          const sheets = results.flatMap((result) =>
            result.status === 'fulfilled' ? [result.value] : [],
          );
          if (sheets.length === 0) {
            throw new AggregateError(
              results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : [])),
              'No production atlas could be loaded',
            );
          }
          this.textures = mergeProductionTextures(sheets);
          const failedCount = results.length - sheets.length;
          if (failedCount > 0) {
            console.warn(`${failedCount} production atlas file(s) unavailable; using fallbacks`);
          }
        })
        .finally(() => {
          this.loading = null;
        });
    }
    return this.loading;
  }

  texture(frame: ProductionFrameId): Texture | null {
    return this.textures?.get(frame) ?? null;
  }

  get ready(): boolean {
    return this.textures !== null;
  }
}

export function mergeProductionTextures(
  sheets: readonly Pick<Spritesheet, 'textures'>[],
): ReadonlyMap<ProductionFrameId, Texture> {
  const textures = new Map<ProductionFrameId, Texture>();
  for (const sheet of sheets) {
    for (const [frameId, texture] of Object.entries(sheet.textures)) {
      if (textures.has(frameId as ProductionFrameId)) {
        throw new Error(`Duplicate production frame: ${frameId}`);
      }
      textures.set(frameId as ProductionFrameId, texture);
    }
  }
  return textures;
}
