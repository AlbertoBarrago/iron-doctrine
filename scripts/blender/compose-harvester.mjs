import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const [framesDir, output] = process.argv.slice(2);
if (!framesDir || !output) {
  throw new Error('Usage: node scripts/blender/compose-harvester.mjs <frames-dir> <output>');
}

const stateSteps = {
  idle: 1,
  idle_loaded: 1,
  move: 4,
  move_loaded: 4,
  gather: 4,
  deposit: 3,
};
const directionCount = 16;
const expectedFrames =
  directionCount * Object.values(stateSteps).reduce((total, steps) => total + steps, 0);
const frames = (await readdir(framesDir))
  .filter((name) =>
    /^\d{3}-(?:idle|idle_loaded|move|move_loaded|gather|deposit)-[a-z]+-\d{2}\.png$/.test(
      name,
    ),
  )
  .sort();
if (frames.length !== expectedFrames) {
  throw new Error(`Expected ${expectedFrames} Harvester frames, found ${frames.length}`);
}

const sourceFrameSize = 192;
const outputFrameSize = 128;
const columns = 8;
const rows = Math.ceil(frames.length / columns);
const tiles = await Promise.all(
  frames.map(async (name, index) => {
    const input = path.join(framesDir, name);
    const metadata = await sharp(input).metadata();
    if (metadata.width !== sourceFrameSize || metadata.height !== sourceFrameSize) {
      throw new Error(
        `Expected ${name} to be ${sourceFrameSize}x${sourceFrameSize}, found ${metadata.width}x${metadata.height}`,
      );
    }

    return {
      input: await sharp(input)
        .resize(outputFrameSize, outputFrameSize, { kernel: sharp.kernel.mitchell })
        .png()
        .toBuffer(),
      left: (index % columns) * outputFrameSize,
      top: Math.floor(index / columns) * outputFrameSize,
    };
  }),
);

// Blender masters stay at 192 px; 128 px runtime tiles keep the atlas below GPU texture limits.
await sharp({
  create: {
    width: outputFrameSize * columns,
    height: outputFrameSize * rows,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(tiles)
  .png()
  .toFile(output);
