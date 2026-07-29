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

// Stable runtime-source contract: two non-directional 320px frames, idle then operational.
const structures = ['construction_yard', 'power_plant', 'barracks', 'factory'];
const frameNames = ['00-idle.png', '01-operational.png'];
const frameSize = 320;

await mkdir(outputRoot, { recursive: true });
for (const structure of structures) {
  const sourceDir = path.join(framesRoot, structure);
  const discovered = (await readdir(sourceDir)).filter((name) => name.endsWith('.png')).sort();
  if (
    discovered.length !== frameNames.length ||
    discovered.some((name, index) => name !== frameNames[index])
  ) {
    throw new Error(
      `${structure}: expected ${frameNames.join(', ')}, found ${discovered.join(', ')}`,
    );
  }

  await sharp({
    create: {
      width: frameSize * frameNames.length,
      height: frameSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(
      frameNames.map((name, index) => ({
        input: path.join(sourceDir, name),
        left: index * frameSize,
        top: 0,
      })),
    )
    .png()
    .toFile(path.join(outputRoot, `${structure}.png`));
}
