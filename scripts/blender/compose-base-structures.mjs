import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const [framesRoot, outputRoot] = process.argv.slice(2);
if (!framesRoot || !outputRoot) {
  throw new Error(
    'Usage: node scripts/blender/compose-base-structures.mjs <frames-root> <output-root>',
  );
}

// Stable runtime-source contract. State order must match the Blender renderer and manifest.
const structures = {
  construction_yard: [
    ['construction', 4],
    ['complete', 4],
    ['idle', 1],
    ['service', 4],
  ],
  power_plant: [
    ['construction', 4],
    ['complete', 4],
    ['generate', 6],
  ],
  barracks: [
    ['construction', 4],
    ['complete', 4],
    ['idle', 1],
    ['produce', 6],
    ['exit', 4],
  ],
  factory: [
    ['construction', 4],
    ['complete', 4],
    ['idle', 1],
    ['produce', 8],
    ['exit', 6],
  ],
};
const frameSize = 320;
const columns = 8;

await mkdir(outputRoot, { recursive: true });
for (const [structure, states] of Object.entries(structures)) {
  const sourceDir = path.join(framesRoot, structure);
  const frameNames = [];
  let frameIndex = 0;
  for (const [state, count] of states) {
    for (let step = 0; step < count; step += 1) {
      frameNames.push(`${String(frameIndex).padStart(2, '0')}-${state}-${step}.png`);
      frameIndex += 1;
    }
  }
  const discovered = (await readdir(sourceDir)).filter((name) => name.endsWith('.png')).sort();
  if (
    discovered.length !== frameNames.length ||
    discovered.some((name, index) => name !== frameNames[index])
  ) {
    throw new Error(
      `${structure}: expected ${frameNames.join(', ')}, found ${discovered.join(', ')}`,
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
    .toFile(path.join(outputRoot, `${structure}.png`));
}
