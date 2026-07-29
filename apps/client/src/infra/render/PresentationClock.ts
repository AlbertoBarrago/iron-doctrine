const MAX_DELTA_MS = 100;

/**
 * Monotonic clock for presentation-only animation.
 *
 * Wall-clock discontinuities are clamped and paused time is discarded, so visual
 * effects never catch up after a pause or a suspended browser tab.
 */
export class PresentationClock {
  time = 0;
  delta = 0;

  private lastWallTime: number | null = null;
  private paused = false;

  tick(wallTime = performance.now()): void {
    const previousWallTime = this.lastWallTime;
    this.lastWallTime = wallTime;

    if (previousWallTime === null || this.paused) {
      this.delta = 0;
      return;
    }

    this.delta = Math.min(MAX_DELTA_MS, Math.max(0, wallTime - previousWallTime));
    this.time += this.delta;
  }

  setPaused(paused: boolean, wallTime = performance.now()): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.lastWallTime = wallTime;
    this.delta = 0;
  }
}
