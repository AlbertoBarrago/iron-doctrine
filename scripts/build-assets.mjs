import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { format, resolveConfig } from 'prettier';
import sharp from 'sharp';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..');

export function validateManifest(value) {
  if (!value || typeof value !== 'object') throw new Error('Asset manifest must be an object');
  if (value.version !== 1) throw new Error(`Unsupported asset manifest version: ${value.version}`);
  if (!value.atlases || typeof value.atlases !== 'object' || Array.isArray(value.atlases)) {
    throw new Error('Asset manifest requires an atlases object');
  }
  const atlasEntries = Object.entries(value.atlases);
  if (atlasEntries.length === 0) throw new Error('Asset manifest requires at least one atlas');
  const atlasIds = new Set();
  const atlases = Object.fromEntries(
    atlasEntries
      .map(([key, candidate]) => {
        const field = `atlases.${key}`;
        const atlasKey = validId(key, 'atlas key');
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
          throw new Error(`${field} must be an object`);
        }
        const id = validId(candidate.id, `${field}.id`);
        if (atlasIds.has(id)) throw new Error(`Duplicate atlas id: ${id}`);
        atlasIds.add(id);
        const maxWidth = positiveInteger(candidate.maxWidth, `${field}.maxWidth`);
        const maxHeight = positiveInteger(candidate.maxHeight, `${field}.maxHeight`);
        if (maxWidth > 8192) throw new Error(`${field}.maxWidth must not exceed 8192`);
        if (maxHeight > 8192) throw new Error(`${field}.maxHeight must not exceed 8192`);
        return [
          atlasKey,
          {
            id,
            maxWidth,
            maxHeight,
            padding: nonNegativeInteger(candidate.padding, `${field}.padding`),
          },
        ];
      })
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  if (!Array.isArray(value.assets) || value.assets.length === 0) {
    throw new Error('Asset manifest requires at least one asset');
  }

  const ids = new Set();
  const assets = value.assets.map((candidate, index) => {
    const field = `assets[${index}]`;
    if (!candidate || typeof candidate !== 'object') throw new Error(`${field} must be an object`);
    const id = validId(candidate.id, `${field}.id`);
    if (ids.has(id)) throw new Error(`Duplicate asset id: ${id}`);
    ids.add(id);
    const atlas = validId(candidate.atlas, `${field}.atlas`);
    if (!Object.hasOwn(atlases, atlas)) {
      throw new Error(`${field}.atlas references unknown atlas: ${atlas}`);
    }
    const directions = stringList(candidate.directions, `${field}.directions`);
    const states = validateStates(candidate.states, `${field}.states`);
    return {
      id,
      atlas,
      source: safeSource(candidate.source, `${field}.source`),
      frameWidth: positiveInteger(candidate.frameWidth, `${field}.frameWidth`),
      frameHeight: positiveInteger(candidate.frameHeight, `${field}.frameHeight`),
      ...(candidate.sourceColumns !== undefined && {
        sourceColumns: positiveInteger(candidate.sourceColumns, `${field}.sourceColumns`),
      }),
      directions,
      states,
      runtime: candidate.runtime !== false,
    };
  });

  return {
    version: 1,
    atlases,
    assets: assets.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function describeFrames(asset, imageWidth, imageHeight) {
  if (imageWidth % asset.frameWidth !== 0 || imageHeight % asset.frameHeight !== 0) {
    throw new Error(
      `${asset.id}: source ${imageWidth}x${imageHeight} is not divisible by frame ${asset.frameWidth}x${asset.frameHeight}`,
    );
  }
  const columns = imageWidth / asset.frameWidth;
  if (asset.sourceColumns !== undefined && columns !== asset.sourceColumns) {
    throw new Error(
      `${asset.id}: expected ${asset.sourceColumns} source columns, found ${columns}`,
    );
  }
  const available = columns * (imageHeight / asset.frameHeight);
  const required =
    asset.directions.length *
    Object.values(asset.states).reduce((total, frameCount) => total + frameCount, 0);
  const trailingPadding = available - required;
  const validPaddedGrid =
    asset.sourceColumns !== undefined && trailingPadding >= 0 && trailingPadding < columns;
  if (available !== required && !validPaddedGrid) {
    throw new Error(`${asset.id}: expected ${required} source frames, found ${available}`);
  }

  const frames = [];
  let sourceIndex = 0;
  for (const [state, count] of Object.entries(asset.states)) {
    for (const direction of asset.directions) {
      for (let step = 0; step < count; step++) {
        frames.push({
          id: `${asset.id}.${state}.${direction}.${step}`,
          assetId: asset.id,
          state,
          direction,
          step,
          sourceIndex,
          sourceX: (sourceIndex % columns) * asset.frameWidth,
          sourceY: Math.floor(sourceIndex / columns) * asset.frameHeight,
          width: asset.frameWidth,
          height: asset.frameHeight,
        });
        sourceIndex++;
      }
    }
  }
  return frames;
}

export function packFrames(frames, maxWidth, padding, maxHeight = 8192) {
  if (frames.length === 0) throw new Error('Cannot pack an empty atlas');
  const widest = Math.max(...frames.map((frame) => frame.width));
  if (widest + padding * 2 > maxWidth) {
    throw new Error(`Frame width ${widest} exceeds atlas max width ${maxWidth}`);
  }
  let x = padding;
  let y = padding;
  let rowHeight = 0;
  let usedWidth = 0;
  const packed = [];

  for (const frame of frames) {
    if (x + frame.width + padding > maxWidth && x > padding) {
      x = padding;
      y += rowHeight + padding;
      rowHeight = 0;
    }
    packed.push({ ...frame, x, y });
    x += frame.width + padding;
    rowHeight = Math.max(rowHeight, frame.height);
    usedWidth = Math.max(usedWidth, x);
  }

  const height = Math.max(1, y + rowHeight + padding);
  if (height > maxHeight) {
    throw new Error(`Packed atlas height ${height} exceeds configured max height ${maxHeight}`);
  }
  return {
    frames: packed,
    width: Math.max(1, Math.min(maxWidth, usedWidth)),
    height,
  };
}

export async function buildAssets({ rootDir = DEFAULT_ROOT } = {}) {
  const sourceDir = path.join(rootDir, 'assets-src');
  const publicDir = path.join(rootDir, 'apps/client/public/assets/generated');
  const generatedModule = path.join(rootDir, 'apps/client/src/assets/assets.gen.ts');
  const manifestPath = path.join(sourceDir, 'manifest.json');
  const manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')));

  const sourceImages = new Map();
  const describedFrames = new Map(Object.keys(manifest.atlases).map((key) => [key, []]));
  for (const asset of manifest.assets) {
    const sourcePath = path.join(sourceDir, asset.source);
    const source = sharp(sourcePath).ensureAlpha();
    const metadata = await source.metadata();
    if (!metadata.width || !metadata.height) throw new Error(`${asset.id}: unreadable dimensions`);
    sourceImages.set(asset.id, sourcePath);
    describedFrames
      .get(asset.atlas)
      .push(...describeFrames(asset, metadata.width, metadata.height));
  }

  await rm(publicDir, { recursive: true, force: true });
  await mkdir(publicDir, { recursive: true });
  await mkdir(path.dirname(generatedModule), { recursive: true });

  const prettierConfig = (await resolveConfig(path.join(rootDir, 'package.json'))) ?? {};
  const builds = [];
  for (const [atlasKey, atlas] of Object.entries(manifest.atlases)) {
    const atlasAssets = manifest.assets.filter((asset) => asset.atlas === atlasKey);
    const packed = packFrames(
      describedFrames.get(atlasKey),
      atlas.maxWidth,
      atlas.padding,
      atlas.maxHeight,
    );
    const composites = await Promise.all(
      packed.frames.map(async (frame) => ({
        input: await sharp(sourceImages.get(frame.assetId))
          .ensureAlpha()
          .extract({
            left: frame.sourceX,
            top: frame.sourceY,
            width: frame.width,
            height: frame.height,
          })
          .png()
          .toBuffer(),
        left: frame.x,
        top: frame.y,
      })),
    );
    const imageName = `${atlas.id}.webp`;
    const jsonName = `${atlas.id}.json`;
    await sharp({
      create: {
        width: packed.width,
        height: packed.height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(composites)
      .webp({ lossless: true, effort: 6 })
      .toFile(path.join(publicDir, imageName));
    await writeFile(
      path.join(publicDir, jsonName),
      await format(JSON.stringify(pixiSpritesheet(atlasAssets, packed, imageName)), {
        ...prettierConfig,
        parser: 'json',
      }),
    );
    builds.push({
      atlasKey,
      atlasId: atlas.id,
      jsonName,
      frameCount: packed.frames.length,
      width: packed.width,
      height: packed.height,
      packed,
    });
  }

  await writeFile(
    generatedModule,
    await format(generatedTypescript(manifest, builds), {
      ...prettierConfig,
      parser: 'typescript',
    }),
  );

  return {
    atlases: builds.map(({ atlasId, frameCount, width, height }) => ({
      atlasId,
      frameCount,
      width,
      height,
    })),
    frameCount: builds.reduce((total, build) => total + build.frameCount, 0),
  };
}

function pixiSpritesheet(assets, packed, imageName) {
  return {
    frames: Object.fromEntries(
      packed.frames.map((frame) => [
        frame.id,
        {
          frame: { x: frame.x, y: frame.y, w: frame.width, h: frame.height },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: frame.width, h: frame.height },
          sourceSize: { w: frame.width, h: frame.height },
        },
      ]),
    ),
    animations: Object.fromEntries(
      assets.flatMap((asset) =>
        Object.keys(asset.states).flatMap((state) =>
          asset.directions.map((direction) => [
            `${asset.id}.${state}.${direction}`,
            packed.frames
              .filter(
                (frame) =>
                  frame.assetId === asset.id &&
                  frame.state === state &&
                  frame.direction === direction,
              )
              .map((frame) => frame.id),
          ]),
        ),
      ),
    ),
    meta: {
      app: 'iron-doctrine',
      version: '1',
      image: imageName,
      format: 'RGBA8888',
      size: { w: packed.width, h: packed.height },
      scale: '1',
    },
  };
}

function generatedTypescript(manifest, builds) {
  const runtimeIds = manifest.assets.filter((asset) => asset.runtime).map((asset) => asset.id);
  const atlasUrls = builds.map((build) => `/assets/generated/${build.jsonName}`);
  const frameIds = builds.flatMap((build) => build.packed.frames.map((frame) => frame.id));
  return `/* This file is generated by scripts/build-assets.mjs. Do not edit. */
export const PRODUCTION_ATLAS_URLS = ${JSON.stringify(atlasUrls, null, 2)} as const;
export const PRODUCTION_ASSET_IDS = ${JSON.stringify(runtimeIds, null, 2)} as const;
export type ProductionAssetId = (typeof PRODUCTION_ASSET_IDS)[number];
export const PRODUCTION_FRAME_IDS = ${JSON.stringify(frameIds, null, 2)} as const;
export type ProductionFrameId = (typeof PRODUCTION_FRAME_IDS)[number];
`;
}

function validateStates(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  const entries = Object.entries(value);
  if (entries.length === 0) throw new Error(`${field} requires at least one state`);
  return Object.fromEntries(
    entries.map(([id, count]) => [
      validId(id, `${field}.${id}`),
      positiveInteger(count, `${field}.${id}`),
    ]),
  );
}

function stringList(value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${field} requires at least one value`);
  }
  const values = value.map((entry, index) => validId(entry, `${field}[${index}]`));
  if (new Set(values).size !== values.length) throw new Error(`${field} contains duplicates`);
  return values;
}

function validId(value, field) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9.-]*$/.test(value)) {
    throw new Error(`${field} must match ^[a-z][a-z0-9.-]*$`);
  }
  return value;
}

function safeSource(value, field) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    path.isAbsolute(value) ||
    value.split(/[\\/]/).includes('..')
  ) {
    throw new Error(`${field} must stay inside assets-src`);
  }
  return value;
}

function positiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${field} must be positive`);
  return value;
}

function nonNegativeInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be non-negative`);
  }
  return value;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const result = await buildAssets();
  for (const atlas of result.atlases) {
    process.stdout.write(
      `[assets] ${atlas.atlasId}: ${atlas.frameCount} frames, ${atlas.width}x${atlas.height}\n`,
    );
  }
}
