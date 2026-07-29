import { describe, expect, it } from 'vitest';
import { PresentationClock } from '../PresentationClock.js';

describe('PresentationClock', () => {
  it('advances monotonically using the elapsed wall time', () => {
    const clock = new PresentationClock();

    clock.tick(1_000);
    clock.tick(1_016);
    clock.tick(1_049);

    expect(clock.time).toBe(49);
    expect(clock.delta).toBe(33);
  });

  it('clamps long frames after browser suspension', () => {
    const clock = new PresentationClock();

    clock.tick(1_000);
    clock.tick(10_000);

    expect(clock.time).toBe(100);
    expect(clock.delta).toBe(100);
  });

  it('discards paused time without catching up on resume', () => {
    const clock = new PresentationClock();

    clock.tick(1_000);
    clock.tick(1_020);
    clock.setPaused(true, 1_025);
    clock.tick(5_000);
    clock.setPaused(false, 8_000);
    clock.tick(8_016);

    expect(clock.time).toBe(36);
    expect(clock.delta).toBe(16);
  });

  it('ignores backwards wall-clock movement', () => {
    const clock = new PresentationClock();

    clock.tick(1_000);
    clock.tick(900);

    expect(clock.time).toBe(0);
    expect(clock.delta).toBe(0);
  });
});
