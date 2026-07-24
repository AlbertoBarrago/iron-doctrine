/**
 * Lightweight pooled particle system for transient effects (explosions, muzzle
 * sparks). Particles live in screen space and are re-projected each frame from their
 * world position so they track the camera. Pooling avoids per-frame allocation.
 */
import { Graphics } from 'pixi.js';
import type { Camera } from './camera.js';

interface Particle {
  active: boolean;
  shape: 'dot' | 'streak';
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

  constructor(
    private readonly camera: Camera,
    capacity = 512,
  ) {
    for (let i = 0; i < capacity; i++) {
      this.pool.push({
        active: false,
        shape: 'dot',
        wx: 0,
        wy: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 2,
        color: 0xffffff,
      });
    }
  }

  private spawn(
    wx: number,
    wy: number,
    color: number,
    size: number,
    life: number,
    vx: number,
    vy: number,
    shape: Particle['shape'] = 'dot',
  ): void {
    const p = this.pool.find((q) => !q.active);
    if (!p) return; // pool exhausted: drop (bounded cost)
    p.active = true;
    p.shape = shape;
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

  /** Short presentation-only rifle round; simulation damage remains hitscan. */
  tracer(fromX: number, fromY: number, toX: number, toY: number): void {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const length = Math.hypot(dx, dy) || 1;
    const speed = 38;
    this.spawn(
      fromX,
      fromY,
      0xffdfa0,
      1.4,
      Math.min(0.14, length / speed),
      (dx / length) * speed,
      (dy / length) * speed,
      'streak',
    );
  }

  muzzleFlash(wx: number, wy: number, angle: number, scale = 1): void {
    for (const spread of [-0.16, 0, 0.16]) {
      const direction = angle + spread;
      this.spawn(
        wx,
        wy,
        0xffd36a,
        2.2 * scale,
        0.09,
        Math.cos(direction) * 5,
        Math.sin(direction) * 5,
      );
    }
  }

  impact(wx: number, wy: number, scale = 1): void {
    const count = Math.round(8 * scale);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 1.5 + (i % 3);
      this.spawn(
        wx,
        wy,
        i % 3 === 0 ? 0xd4ba72 : 0x827861,
        1.3 + (i % 2),
        0.2 + (i % 3) * 0.08,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        i % 3 === 0 ? 'streak' : 'dot',
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
      if (p.shape === 'streak') {
        this.gfx
          .moveTo(sx, sy)
          .lineTo(sx - p.vx * 0.035 * this.camera.scale, sy - p.vy * 0.035 * this.camera.scale)
          .stroke({ width: p.size, color: p.color, alpha });
      } else {
        this.gfx.circle(sx, sy, p.size).fill({ color: p.color, alpha });
      }
    }
  }
}
