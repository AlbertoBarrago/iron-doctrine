import { describe, expect, it } from 'vitest';
import { ambientLifeFrame } from '../AmbientLifePainter.js';

describe('ambient battlefield life', () => {
  it('produces identical presentation frames for the same seed and time', () => {
    const sequence = (seed: number) =>
      Array.from({ length: 300 }, (_, second) => ambientLifeFrame(seed, second, 96, 96));
    expect(sequence(1979)).toEqual(sequence(1979));
    expect(sequence(1979)).not.toEqual(sequence(1980));
  });

  it('keeps aircraft and animals rare over a five-minute operation', () => {
    const frames = Array.from({ length: 300 }, (_, second) =>
      ambientLifeFrame(1979, second, 96, 96),
    );
    const aircraftSeconds = frames.filter((frame) => frame.aircraft !== null).length;
    const animalSeconds = frames.filter((frame) => frame.animals.length > 0).length;

    expect(aircraftSeconds).toBeGreaterThanOrEqual(16);
    expect(aircraftSeconds).toBeLessThanOrEqual(32);
    expect(animalSeconds).toBeGreaterThanOrEqual(25);
    expect(animalSeconds).toBeLessThanOrEqual(55);
  });

  it('keeps every active trajectory inside safe presentation bounds', () => {
    for (let tick = 0; tick < 6_000; tick++) {
      const frame = ambientLifeFrame(404, tick / 20, 96, 96);
      if (frame.aircraft) {
        expect(Math.abs(frame.aircraft.x)).toBeLessThanOrEqual(56);
        expect(Math.abs(frame.aircraft.y)).toBeLessThanOrEqual(48);
      }
      for (const animal of frame.animals) {
        expect(Math.abs(animal.x)).toBeLessThan(48);
        expect(Math.abs(animal.y)).toBeLessThan(48);
      }
    }
  });

  it('keeps the chicken opt-in, deterministic and bounded to one run and explosion', () => {
    const options = { chickenOrigin: { x: -24, y: 18 } };
    expect(ambientLifeFrame(404, 11.9, 96, 96, options).chicken).toBeNull();
    expect(ambientLifeFrame(404, 12, 96, 96).chicken).toBeNull();

    const run = ambientLifeFrame(404, 17, 96, 96, options).chicken;
    expect(run).toMatchObject({ state: 'running' });
    expect(Math.abs(run!.x)).toBeLessThanOrEqual(46);
    expect(Math.abs(run!.y)).toBeLessThanOrEqual(46);

    expect(ambientLifeFrame(404, 22.5, 96, 96, options).chicken).toMatchObject({
      state: 'exploding',
    });
    expect(ambientLifeFrame(404, 23.25, 96, 96, options).chicken).toBeNull();
  });
});
