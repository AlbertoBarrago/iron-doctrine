import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const [role = 'rifleman', framesDir, output] =
  process.argv.length === 4 ? ['rifleman', ...process.argv.slice(2)] : process.argv.slice(2);
if (!framesDir || !output || !['rifleman', 'engineer', 'medic'].includes(role)) {
  throw new Error(
    'Usage: node scripts/blender/compose-infantry.mjs [rifleman|engineer|medic] <frames-dir> <output>',
  );
}

const stateStepsByRole = {
  rifleman: { idle: 1, move: 8, fire: 2 },
  engineer: { idle: 1, move: 8 },
  medic: { idle: 1, move: 8, heal: 4 },
};
const stateSteps = stateStepsByRole[role];
const directionCount = 16;
const expectedFrames =
  directionCount * Object.values(stateSteps).reduce((total, steps) => total + steps, 0);
const frames = (await readdir(framesDir))
  .filter((name) => /^\d{3}-(?:idle|move|fire|heal)-[a-z]+-\d{2}\.png$/.test(name))
  .sort();
if (frames.length !== expectedFrames) {
  throw new Error(`Expected ${expectedFrames} ${role} frames, found ${frames.length}`);
}

const frameSize = 128;
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
