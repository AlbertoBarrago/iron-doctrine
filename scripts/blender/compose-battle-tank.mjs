import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const [framesDir, output] = process.argv.slice(2);
if (!framesDir || !output) {
  throw new Error('Usage: node scripts/blender/compose-battle-tank.mjs <frames-dir> <output>');
}

const frames = (await readdir(framesDir)).filter((name) => /^\d{2}-[a-z]+\.png$/.test(name)).sort();
if (frames.length !== 16) throw new Error(`Expected 16 tank frames, found ${frames.length}`);

const frameSize = 192;
await sharp({
  create: {
    width: frameSize * 4,
    height: frameSize * 4,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(
    frames.map((name, index) => ({
      input: path.join(framesDir, name),
      left: (index % 4) * frameSize,
      top: Math.floor(index / 4) * frameSize,
    })),
  )
  .png()
  .toFile(output);
