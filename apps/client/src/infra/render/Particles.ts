/**
 * Lightweight pooled particle system for transient effects (explosions, muzzle
 * sparks). Particles live in screen space and are re-projected each frame from their
 * world position so they track the camera. Pooling avoids per-frame allocation.
 */
import { Graphics } from 'pixi.js';
import type { Camera } from './camera.js';

interface Particle {
  active: boolean;
  wx: number;
  wy: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
}

export class ParticleSystem {
  readonly gfx = new Graphics();
  private readonly pool: Particle[] = [];

  constructor(private readonly camera: Camera, capacity = 512) {
    for (let i = 0; i < capacity; i++) {
      this.pool.push({ active: false, wx: 0, wy: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: 0xffffff });
    }
  }

  private spawn(wx: number, wy: number, color: number, size: number, life: number, vx: number, vy: number): void {
    const p = this.pool.find((q) => !q.active);
    if (!p) return; // pool exhausted: drop (bounded cost)
    p.active = true;
    p.wx = wx;
    p.wy = wy;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.color = color;
  }

  /** Burst of debris + fire for a destroyed entity. */
  explosion(wx: number, wy: number, scale = 1): void {
    const count = Math.round(16 * scale);
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const speed = 2 + (i % 3);
      this.spawn(
        wx,
        wy,
        i % 2 === 0 ? 0xffa726 : 0xff7043,
        2 + (i % 3),
        0.5 + (i % 5) * 0.1,
        Math.cos(ang) * speed,
        Math.sin(ang) * speed,
      );
    }
  }

  update(dtSec: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dtSec;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.wx += p.vx * dtSec;
      p.wy += p.vy * dtSec;
    }
  }

  draw(): void {
    this.gfx.clear();
    for (const p of this.pool) {
      if (!p.active) continue;
      const { sx, sy } = this.camera.worldToScreen(p.wx, p.wy);
      const alpha = Math.max(0, p.life / p.maxLife);
      this.gfx.circle(sx, sy, p.size).fill({ color: p.color, alpha });
    }
  }
}
