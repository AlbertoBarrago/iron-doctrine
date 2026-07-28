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
              drawCliffCell(
                cliffs,
                screenX,
                screenY,
                cellPixels,
                palette,
                terrainSample(environment.seed ^ 0x51f15e, x, y),
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

        this.container.addChild(ground, details, cliffs);
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
  const inset = size * (0.06 + (sample.scale - 0.72) * 0.04);
  graphics
    .rect(x + size * 0.12, y + size * 0.16, size * 0.92, size * 0.92)
    .fill({ color: palette.cliffShadow, alpha: 0.72 })
    .rect(x + inset, y + inset, size - inset * 2, size - inset * 2)
    .fill({ color: palette.stone })
    .moveTo(x + inset, y + inset)
    .lineTo(x + size - inset, y + inset)
    .lineTo(x + size * 0.72, y + size * 0.38)
    .lineTo(x + size * 0.18, y + size * 0.46)
    .closePath()
    .fill({ color: palette.stoneLight, alpha: 0.52 });
}

function terrainHash(seed: number, x: number, y: number): number {
  let hash = seed | 0;
  hash ^= Math.imul(x, 0x1f123bb5);
  hash ^= Math.imul(y, 0x5f356495);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return (hash ^ (hash >>> 16)) >>> 0;
}
