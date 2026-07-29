import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const [framesRoot, outputRoot] = process.argv.slice(2);
if (!framesRoot || !outputRoot) {
  throw new Error('Usage: node scripts/blender/compose-defenses.mjs <frames-root> <output-root>');
}

const directions = [
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
];
const wallDirections = Array.from({ length: 16 }, (_, mask) => `mask-${String(mask).padStart(2, '0')}`);
const specifications = {
  turret_base: {
    output: 'turret_base.png',
    directions: ['south'],
    states: [
      ['construction', 4],
      ['complete', 4],
      ['idle', 1],
    ],
  },
  turret_head: {
    output: 'turret_head.png',
    directions,
    states: [
      ['idle', 1],
      ['fire', 2],
    ],
  },
  concrete_wall: {
    output: 'concrete_wall.png',
    directions: wallDirections,
    states: [
      ['construction', 4],
      ['idle', 1],
    ],
  },
};
const frameSize = 256;
const columns = 8;

await mkdir(outputRoot, { recursive: true });
for (const [sourceName, specification] of Object.entries(specifications)) {
  const sourceDir = path.join(framesRoot, sourceName);
  const frameNames = [];
  let frameIndex = 0;
  for (const [state, count] of specification.states) {
    for (const direction of specification.directions) {
      for (let step = 0; step < count; step += 1) {
        frameNames.push(
          `${String(frameIndex).padStart(3, '0')}-${state}-${direction}-${String(step).padStart(2, '0')}.png`,
        );
        frameIndex += 1;
      }
    }
  }
  const discovered = (await readdir(sourceDir)).filter((name) => name.endsWith('.png')).sort();
  if (
    discovered.length !== frameNames.length ||
    discovered.some((name, index) => name !== frameNames[index])
  ) {
    throw new Error(
      `${sourceName}: expected ${frameNames.length} ordered frames, found ${discovered.length}`,
    );
  }

  const rows = Math.ceil(frameNames.length / columns);
  await sharp({
    create: {
      width: frameSize * columns,
      height: frameSize * rows,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(
      frameNames.map((name, index) => ({
        input: path.join(sourceDir, name),
        left: (index % columns) * frameSize,
        top: Math.floor(index / columns) * frameSize,
      })),
    )
    .png()
    .toFile(path.join(outputRoot, specification.output));
}
