import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const [framesDir, output] = process.argv.slice(2);
if (!framesDir || !output) {
  throw new Error('Usage: node scripts/blender/compose-scout.mjs <frames-dir> <output>');
}

const stateSteps = {
  idle: 1,
  move: 4,
};
const directionCount = 16;
const expectedFrames =
  directionCount * Object.values(stateSteps).reduce((total, steps) => total + steps, 0);
const frames = (await readdir(framesDir))
  .filter((name) => /^\d{3}-(?:idle|move)-[a-z]+-\d{2}\.png$/.test(name))
  .sort();
if (frames.length !== expectedFrames) {
  throw new Error(`Expected ${expectedFrames} Scout frames, found ${frames.length}`);
}

const frameSize = 192;
const columns = 8;
await sharp({
  create: {
    width: frameSize * columns,
    height: frameSize * Math.ceil(frames.length / columns),
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(
    frames.map((name, index) => ({
      input: path.join(framesDir, name),
      left: (index % columns) * frameSize,
      top: Math.floor(index / columns) * frameSize,
    })),
  )
  .png()
  .toFile(output);
