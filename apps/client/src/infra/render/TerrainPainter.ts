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
const MACRO_PATCH_CELLS = 8;

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

export interface TerrainMacroSample {
  groundIndex: 0 | 1 | 2 | 3;
  rotation: number;
  scale: number;
  soil: boolean;
}

export type WarRemains = 'none' | 'shells' | 'bones' | 'wreckage';

export interface TerrainFeature {
  kind: Exclude<WarRemains, 'none'> | 'rock';
  label: string;
  description: string;
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

export function terrainMacroSample(seed: number, x: number, y: number): TerrainMacroSample {
  const hash = terrainHash(seed ^ 0x2c1b3c6d, x, y);
  return {
    groundIndex: ((hash >>> 3) & 3) as TerrainMacroSample['groundIndex'],
    rotation: (((hash >>> 8) & 255) / 255) * Math.PI,
    scale: 0.82 + (((hash >>> 17) & 63) / 63) * 0.5,
    soil: ((hash >>> 25) & 7) === 0,
  };
}

/**
 * Sparse presentation-only remains. Open ground may receive only small debris;
 * obstacle-like wreckage is reserved for blocked terrain.
 */
export function warRemainsSample(seed: number, x: number, y: number, blocked: boolean): WarRemains {
  const hash = terrainHash(seed ^ 0x6d2b79f5, x, y);
  if (!blocked) {
    const openRoll = hash & 255;
    if (openRoll < 2) return 'shells';
    if (openRoll === 2) return 'bones';
    return 'none';
  }
  const roll = hash & 127;
  if (roll < 4) return 'shells';
  if (roll < 6) return 'bones';
  if (roll < 8) return 'wreckage';
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
  private map: MapDef | null = null;
  private readonly features = new Map<string, TerrainFeature>();

  build(map: MapDef): void {
    for (const child of this.container.removeChildren()) child.destroy();
    this.map = map;
    this.features.clear();

    const environment = mapEnvironment(map);
    const palette = PALETTES[environment.biome];
    const cellPixels = map.cellSize * PIXELS_PER_UNIT;
    const left = (-map.width / 2) * cellPixels;
    const top = (-map.height / 2) * cellPixels;

    const base = new Graphics()
      .rect(left, top, map.width * cellPixels, map.height * cellPixels)
      .fill({ color: palette.base });
    const macroGround = new Graphics();
    for (let y = -MACRO_PATCH_CELLS / 2; y < map.height; y += MACRO_PATCH_CELLS) {
      for (let x = -MACRO_PATCH_CELLS / 2; x < map.width; x += MACRO_PATCH_CELLS) {
        drawMacroPatch(
          macroGround,
          left + (x + MACRO_PATCH_CELLS / 2) * cellPixels,
          top + (y + MACRO_PATCH_CELLS / 2) * cellPixels,
          MACRO_PATCH_CELLS * cellPixels,
          palette,
          terrainMacroSample(environment.seed, x, y),
        );
      }
    }
    this.container.addChild(base, macroGround);

    const blocked = new Set(map.blocked.map(([x, y]) => `${x}:${y}`));
    const reserved = new Set([
      ...map.resources.map((resource) => `${resource.x}:${resource.y}`),
      ...map.spawns.map((spawn) => `${spawn.x}:${spawn.y}`),
    ]);
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
              .fill({ color: palette.ground[sample.groundIndex], alpha: 0.34 });
          }
        }

        for (let y = chunkY; y < maxY; y++) {
          for (let x = chunkX; x < maxX; x++) {
            const screenX = left + x * cellPixels;
            const screenY = top + y * cellPixels;
            if (blocked.has(`${x}:${y}`)) {
              const rockSample = terrainSample(environment.seed ^ 0x51f15e, x, y);
              const remainsSample = warRemainsSample(environment.seed, x, y, true);
              drawRockFoot(
                details,
                screenX + cellPixels / 2,
                screenY + cellPixels / 2,
                cellPixels,
                palette,
                rockSample,
              );
              drawCliffCell(cliffs, screenX, screenY, cellPixels, palette, rockSample);
              drawWarRemains(
                remains,
                screenX + cellPixels / 2,
                screenY + cellPixels / 2,
                cellPixels,
                rockSample,
                remainsSample,
              );
              this.features.set(`${x}:${y}`, terrainFeature(remainsSample, true)!);
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
            if (!reserved.has(`${x}:${y}`)) {
              const detailSample = terrainSample(environment.seed ^ 0x51f15e, x, y);
              const remainsSample = warRemainsSample(environment.seed, x, y, false);
              drawWarRemains(
                remains,
                screenX + cellPixels / 2,
                screenY + cellPixels / 2,
                cellPixels * 0.72,
                detailSample,
                remainsSample,
              );
              const feature = terrainFeature(remainsSample, false);
              if (feature) this.features.set(`${x}:${y}`, feature);
            }
          }
        }

        this.container.addChild(ground, details, cliffs, remains);
      }
    }
  }

  featureAt(worldX: number, worldY: number): TerrainFeature | null {
    if (!this.map) return null;
    const x = Math.floor(worldX / this.map.cellSize + this.map.width / 2);
    const y = Math.floor(worldY / this.map.cellSize + this.map.height / 2);
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return null;
    return this.features.get(`${x}:${y}`) ?? null;
  }

  updateView(camera: Camera, width: number, height: number): void {
    this.container.scale.set(camera.zoom);
    this.container.position.set(
      width / 2 - camera.x * PIXELS_PER_UNIT * camera.zoom,
      height / 2 - camera.y * PIXELS_PER_UNIT * camera.zoom,
    );
  }
}

export function terrainFeature(remains: WarRemains, blocked: boolean): TerrainFeature | null {
  if (remains === 'shells') {
    return {
      kind: remains,
      label: 'Spent shell casings',
      description: 'Battlefield debris. Cosmetic only; it does not block movement.',
    };
  }
  if (remains === 'bones') {
    return {
      kind: remains,
      label: 'Battlefield remains',
      description: 'Evidence of an earlier fight. Cosmetic only.',
    };
  }
  if (remains === 'wreckage') {
    return {
      kind: remains,
      label: 'Shattered aircraft',
      description: 'Wreckage embedded in impassable rock terrain that can shield infantry.',
    };
  }
  if (blocked) {
    return {
      kind: 'rock',
      label: 'Rock formation',
      description: 'Impassable terrain. Infantry behind it receives directional cover.',
    };
  }
  return null;
}

function drawMacroPatch(
  graphics: Graphics,
  x: number,
  y: number,
  size: number,
  palette: TerrainPalette,
  sample: TerrainMacroSample,
): void {
  const width = size * sample.scale;
  const height = size * (0.42 + sample.scale * 0.16);
  const cos = Math.cos(sample.rotation);
  const sin = Math.sin(sample.rotation);
  graphics
    .ellipse(x, y, width, height)
    .fill({ color: palette.ground[sample.groundIndex], alpha: 0.38 });
  if (sample.soil) {
    graphics
      .ellipse(x + cos * size * 0.16, y + sin * size * 0.16, width * 0.5, height * 0.42)
      .fill({ color: palette.soil, alpha: 0.19 });
  }
  for (const offset of [-0.18, 0.18]) {
    const startX = x - cos * width * 0.48 - sin * height * offset;
    const startY = y - sin * width * 0.48 + cos * height * offset;
    const endX = x + cos * width * 0.48 - sin * height * offset;
    const endY = y + sin * width * 0.48 + cos * height * offset;
    graphics
      .moveTo(startX, startY)
      .lineTo(endX, endY)
      .stroke({ width: Math.max(1, size * 0.008), color: palette.stoneLight, alpha: 0.08 });
  }
}

function drawRockFoot(
  graphics: Graphics,
  x: number,
  y: number,
  size: number,
  palette: TerrainPalette,
  sample: TerrainSample,
): void {
  const cos = Math.cos(sample.rotation);
  const sin = Math.sin(sample.rotation);
  graphics
    .ellipse(x + size * 0.04, y + size * 0.11, size * 0.62, size * 0.52)
    .fill({ color: palette.soil, alpha: 0.34 })
    .ellipse(x + size * 0.09, y + size * 0.16, size * 0.56, size * 0.43)
    .fill({ color: palette.cliffShadow, alpha: 0.24 });
  for (const offset of [-0.34, 0.31]) {
    graphics
      .circle(
        x + cos * size * offset - sin * size * 0.38,
        y + sin * size * offset + cos * size * 0.38,
        size * 0.08,
      )
      .fill({ color: palette.stone, alpha: 0.62 });
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
  const propX = x + cos * size * 0.34;
  const propY = y + sin * size * 0.34;
  if (remains === 'shells') {
    for (let index = -2; index <= 2; index++) {
      const spread = index * size * 0.11;
      const shellX = propX + cos * spread - sin * Math.sin(index * 2.1) * size * 0.12;
      const shellY = propY + sin * spread + cos * Math.sin(index * 2.1) * size * 0.12;
      graphics
        .ellipse(shellX + size * 0.03, shellY + size * 0.04, size * 0.07, size * 0.16)
        .fill({ color: 0x1d1c17, alpha: 0.38 })
        .moveTo(shellX - cos * size * 0.13, shellY - sin * size * 0.13)
        .lineTo(shellX + cos * size * 0.13, shellY + sin * size * 0.13)
        .stroke({ width: Math.max(1.2, size * 0.07), color: 0xc09a4b })
        .circle(shellX - cos * size * 0.13, shellY - sin * size * 0.13, size * 0.045)
        .fill({ color: 0x6d562e });
    }
    return;
  }
  if (remains === 'bones') {
    graphics
      .ellipse(propX + size * 0.06, propY + size * 0.08, size * 0.58, size * 0.4)
      .fill({ color: 0x28261f, alpha: 0.18 })
      .moveTo(propX - size * 0.38, propY - size * 0.28)
      .lineTo(propX + size * 0.36, propY + size * 0.3)
      .moveTo(propX - size * 0.34, propY + size * 0.3)
      .lineTo(propX + size * 0.36, propY - size * 0.28)
      .stroke({ width: Math.max(2, size * 0.1), color: 0xe0d5ad })
      .circle(propX, propY, size * 0.22)
      .fill({ color: 0xd4c69a })
      .circle(propX - size * 0.075, propY - size * 0.03, size * 0.04)
      .circle(propX + size * 0.075, propY - size * 0.03, size * 0.04)
      .fill({ color: 0x29271f });
    return;
  }
  graphics
    .ellipse(propX + size * 0.08, propY + size * 0.12, size * 0.95, size * 0.62)
    .fill({ color: 0x171914, alpha: 0.32 })
    .ellipse(propX - size * 0.08, propY, size * 0.7, size * 0.48)
    .stroke({ width: Math.max(2, size * 0.12), color: 0x39301f, alpha: 0.46 })
    .moveTo(propX - size * 0.78, propY + size * 0.18)
    .lineTo(propX - size * 0.28, propY - size * 0.32)
    .lineTo(propX + size * 0.72, propY - size * 0.18)
    .lineTo(propX + size * 0.46, propY + size * 0.38)
    .closePath()
    .fill({ color: 0x495149 })
    .stroke({ width: 2, color: 0x141814 })
    .moveTo(propX - cos * size * 0.65, propY - sin * size * 0.65)
    .lineTo(propX + cos * size * 0.88, propY + sin * size * 0.88)
    .stroke({ width: Math.max(2, size * 0.1), color: 0x99947b })
    .circle(propX + cos * size * 0.18, propY + sin * size * 0.18, size * 0.14)
    .fill({ color: 0x252b27 })
    .stroke({ width: 1, color: 0xc0b57e });
}

function terrainHash(seed: number, x: number, y: number): number {
  let hash = seed | 0;
  hash ^= Math.imul(x, 0x1f123bb5);
  hash ^= Math.imul(y, 0x5f356495);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return (hash ^ (hash >>> 16)) >>> 0;
}
