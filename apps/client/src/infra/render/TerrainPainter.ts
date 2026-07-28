import {
  DEFAULT_MAP_ENVIRONMENT,
  type MapBiome,
  type MapDef,
  type MapEnvironment,
} from '@iron/shared';
import { Container, Graphics } from 'pixi.js';
import { PIXELS_PER_UNIT, type Camera } from './camera.js';

const CHUNK_CELLS = 16;
const GROUND_TILE_CELLS = 2;

interface TerrainPalette {
  base: number;
  ground: readonly [number, number, number, number];
  soil: number;
  stone: number;
  stoneLight: number;
  cliffShadow: number;
  scrub: number;
  scrubDark: number;
}

const PALETTES: Record<MapBiome, TerrainPalette> = {
  temperate: {
    base: 0x2d3827,
    ground: [0x35402c, 0x303a28, 0x293323, 0x3a422e],
    soil: 0x4a3c25,
    stone: 0x41443a,
    stoneLight: 0x626452,
    cliffShadow: 0x171a14,
    scrub: 0x56613b,
    scrubDark: 0x303824,
  },
  mediterranean: {
    base: 0x615c42,
    ground: [0x777050, 0x6b6648, 0x817858, 0x5f6043],
    soil: 0x806443,
    stone: 0x665f50,
    stoneLight: 0x9a9076,
    cliffShadow: 0x38352f,
    scrub: 0x56613a,
    scrubDark: 0x343c2b,
  },
};

export interface TerrainSample {
  groundIndex: 0 | 1 | 2 | 3;
  detail: 'none' | 'soil' | 'stone' | 'scrub';
  rotation: number;
  scale: number;
}

export type WarRemains = 'none' | 'shells' | 'bones' | 'wreckage';

/**
 * Stable cosmetic sampling. It deliberately uses integer hashing so identical map
 * metadata produces the same battlefield without entering authoritative simulation.
 */
export function terrainSample(seed: number, x: number, y: number): TerrainSample {
  const hash = terrainHash(seed, x, y);
  const detailRoll = (hash >>> 8) & 31;
  return {
    groundIndex: (hash & 3) as TerrainSample['groundIndex'],
    detail:
      detailRoll < 2 ? 'stone' : detailRoll < 4 ? 'scrub' : detailRoll === 4 ? 'soil' : 'none',
    rotation: (((hash >>> 13) & 255) / 255) * Math.PI * 2,
    scale: 0.72 + (((hash >>> 21) & 31) / 31) * 0.46,
  };
}

/** Sparse presentation-only remains. Traversable cells always stay visually clear. */
export function warRemainsSample(
  seed: number,
  x: number,
  y: number,
  blocked: boolean,
): WarRemains {
  if (!blocked) return 'none';
  const roll = terrainHash(seed ^ 0x6d2b79f5, x, y) & 127;
  if (roll < 2) return 'shells';
  if (roll === 2) return 'bones';
  if (roll === 3) return 'wreckage';
  return 'none';
}

export function mapEnvironment(map: MapDef): MapEnvironment {
  return map.environment ?? DEFAULT_MAP_ENVIRONMENT;
}

/**
 * Static, chunked terrain layer. Geometry is rebuilt only when a map changes; camera
 * movement updates the container transform instead of clearing Graphics every frame.
 */
export class TerrainPainter {
  readonly container = new Container();

  build(map: MapDef): void {
    for (const child of this.container.removeChildren()) child.destroy();

    const environment = mapEnvironment(map);
    const palette = PALETTES[environment.biome];
    const cellPixels = map.cellSize * PIXELS_PER_UNIT;
    const left = (-map.width / 2) * cellPixels;
    const top = (-map.height / 2) * cellPixels;

    const base = new Graphics()
      .rect(left, top, map.width * cellPixels, map.height * cellPixels)
      .fill({ color: palette.base });
    this.container.addChild(base);

    const blocked = new Set(map.blocked.map(([x, y]) => `${x}:${y}`));
    for (let chunkY = 0; chunkY < map.height; chunkY += CHUNK_CELLS) {
      for (let chunkX = 0; chunkX < map.width; chunkX += CHUNK_CELLS) {
        const ground = new Graphics();
        const details = new Graphics();
        const cliffs = new Graphics();
        const remains = new Graphics();
        const maxY = Math.min(map.height, chunkY + CHUNK_CELLS);
        const maxX = Math.min(map.width, chunkX + CHUNK_CELLS);

        for (let y = chunkY; y < maxY; y += GROUND_TILE_CELLS) {
          for (let x = chunkX; x < maxX; x += GROUND_TILE_CELLS) {
            const sample = terrainSample(environment.seed, x, y);
            const width = Math.min(GROUND_TILE_CELLS, map.width - x) * cellPixels;
            const height = Math.min(GROUND_TILE_CELLS, map.height - y) * cellPixels;
            ground
              .rect(left + x * cellPixels, top + y * cellPixels, width + 1, height + 1)
              .fill({ color: palette.ground[sample.groundIndex], alpha: 0.7 });
          }
        }

        for (let y = chunkY; y < maxY; y++) {
          for (let x = chunkX; x < maxX; x++) {
            const screenX = left + x * cellPixels;
            const screenY = top + y * cellPixels;
            if (blocked.has(`${x}:${y}`)) {
              const rockSample = terrainSample(environment.seed ^ 0x51f15e, x, y);
              drawCliffCell(
                cliffs,
                screenX,
                screenY,
                cellPixels,
                palette,
                rockSample,
              );
              drawWarRemains(
                remains,
                screenX + cellPixels / 2,
                screenY + cellPixels / 2,
                cellPixels,
                rockSample,
                warRemainsSample(environment.seed, x, y, true),
              );
              continue;
            }
            drawDetail(
              details,
              screenX + cellPixels / 2,
              screenY + cellPixels / 2,
              cellPixels,
              palette,
              terrainSample(environment.seed, x, y),
            );
          }
        }

        this.container.addChild(ground, details, cliffs, remains);
      }
    }
  }

  updateView(camera: Camera, width: number, height: number): void {
    this.container.scale.set(camera.zoom);
    this.container.position.set(
      width / 2 - camera.x * PIXELS_PER_UNIT * camera.zoom,
      height / 2 - camera.y * PIXELS_PER_UNIT * camera.zoom,
    );
  }
}

function drawDetail(
  graphics: Graphics,
  x: number,
  y: number,
  cellPixels: number,
  palette: TerrainPalette,
  sample: TerrainSample,
): void {
  const radius = cellPixels * 0.12 * sample.scale;
  const offsetX = Math.cos(sample.rotation) * cellPixels * 0.22;
  const offsetY = Math.sin(sample.rotation) * cellPixels * 0.22;
  if (sample.detail === 'soil') {
    graphics
      .ellipse(x + offsetX, y + offsetY, radius * 1.8, radius * 0.8)
      .fill({ color: palette.soil, alpha: 0.34 });
  } else if (sample.detail === 'stone') {
    graphics
      .circle(x + offsetX + radius * 0.35, y + offsetY + radius * 0.45, radius)
      .fill({ color: palette.cliffShadow, alpha: 0.28 })
      .circle(x + offsetX, y + offsetY, radius)
      .fill({ color: palette.stone, alpha: 0.9 })
      .circle(x + offsetX - radius * 0.22, y + offsetY - radius * 0.22, radius * 0.48)
      .fill({ color: palette.stoneLight, alpha: 0.55 });
  } else if (sample.detail === 'scrub') {
    const scrubX = x + offsetX;
    const scrubY = y + offsetY;
    graphics
      .circle(scrubX + radius * 0.4, scrubY + radius * 0.45, radius * 1.1)
      .fill({ color: palette.scrubDark, alpha: 0.38 })
      .circle(scrubX - radius * 0.4, scrubY, radius)
      .fill({ color: palette.scrubDark, alpha: 0.9 })
      .circle(scrubX + radius * 0.42, scrubY - radius * 0.18, radius * 0.9)
      .fill({ color: palette.scrub, alpha: 0.92 });
  }
}

function drawCliffCell(
  graphics: Graphics,
  x: number,
  y: number,
  size: number,
  palette: TerrainPalette,
  sample: TerrainSample,
): void {
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const inset = size * (0.05 + (sample.scale - 0.72) * 0.04);
  const variation = (sample.scale - 0.95) * size * 0.14;
  graphics
    .ellipse(centerX + size * 0.09, centerY + size * 0.12, size * 0.54, size * 0.48)
    .fill({ color: palette.cliffShadow, alpha: 0.72 })
    .moveTo(x + inset, y + size * (0.28 + variation / size))
    .lineTo(x + size * 0.25, y + inset)
    .lineTo(x + size * 0.72, y + inset * 0.8)
    .lineTo(x + size - inset, y + size * 0.32)
    .lineTo(x + size * 0.9, y + size * 0.8)
    .lineTo(x + size * 0.42, y + size - inset)
    .lineTo(x + inset * 0.8, y + size * 0.68)
    .closePath()
    .fill({ color: palette.stone })
    .moveTo(x + size * 0.18, y + size * 0.3)
    .lineTo(x + size * 0.7, y + size * 0.12)
    .lineTo(x + size * 0.82, y + size * 0.36)
    .lineTo(x + size * 0.38, y + size * 0.5)
    .closePath()
    .fill({ color: palette.stoneLight, alpha: 0.48 })
    .circle(
      centerX + Math.cos(sample.rotation) * size * 0.2,
      centerY + Math.sin(sample.rotation) * size * 0.2,
      size * (0.13 + sample.scale * 0.04),
    )
    .fill({ color: palette.stoneLight, alpha: 0.32 });
}

function drawWarRemains(
  graphics: Graphics,
  x: number,
  y: number,
  size: number,
  sample: TerrainSample,
  remains: WarRemains,
): void {
  if (remains === 'none') return;
  const cos = Math.cos(sample.rotation);
  const sin = Math.sin(sample.rotation);
  if (remains === 'shells') {
    for (let index = -1; index <= 1; index++) {
      graphics
        .rect(x + cos * index * size * 0.13 - size * 0.035, y + sin * index * size * 0.13, size * 0.07, size * 0.2)
        .fill({ color: 0x8f7745 })
        .stroke({ width: 1, color: 0x332d20 });
    }
    return;
  }
  if (remains === 'bones') {
    graphics
      .moveTo(x - size * 0.25, y - size * 0.18)
      .lineTo(x + size * 0.24, y + size * 0.2)
      .moveTo(x - size * 0.22, y + size * 0.2)
      .lineTo(x + size * 0.24, y - size * 0.18)
      .stroke({ width: Math.max(1.5, size * 0.08), color: 0xc6bb91 })
      .circle(x, y, size * 0.14)
      .fill({ color: 0xb7aa80 })
      .circle(x - size * 0.05, y - size * 0.02, size * 0.025)
      .circle(x + size * 0.05, y - size * 0.02, size * 0.025)
      .fill({ color: 0x29271f });
    return;
  }
  graphics
    .moveTo(x - size * 0.34, y + size * 0.18)
    .lineTo(x - size * 0.12, y - size * 0.25)
    .lineTo(x + size * 0.33, y - size * 0.14)
    .lineTo(x + size * 0.18, y + size * 0.28)
    .closePath()
    .fill({ color: 0x323832 })
    .stroke({ width: 1.5, color: 0x141814 })
    .moveTo(x - size * 0.1, y - size * 0.2)
    .lineTo(x + cos * size * 0.5, y + sin * size * 0.5)
    .stroke({ width: Math.max(1, size * 0.055), color: 0x77745e });
}

function terrainHash(seed: number, x: number, y: number): number {
  let hash = seed | 0;
  hash ^= Math.imul(x, 0x1f123bb5);
  hash ^= Math.imul(y, 0x5f356495);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return (hash ^ (hash >>> 16)) >>> 0;
}
