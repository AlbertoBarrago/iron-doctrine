import { DEFAULT_MAP_ENVIRONMENT, type MapDef } from '@iron/shared';
import { Graphics } from 'pixi.js';
import type { Camera } from './camera.js';

interface AmbientAircraft {
  x: number;
  y: number;
  heading: 1 | -1;
}

interface AmbientAnimal {
  x: number;
  y: number;
  heading: 1 | -1;
  phase: number;
}

export interface AmbientLifeFrame {
  aircraft: AmbientAircraft | null;
  animals: AmbientAnimal[];
}

export function ambientLifeFrame(
  seed: number,
  seconds: number,
  width: number,
  height: number,
): AmbientLifeFrame {
  return {
    aircraft: aircraftFrame(seed, seconds, width, height),
    animals: animalFrame(seed, seconds, width, height),
  };
}

export class AmbientLifePainter {
  readonly graphics = new Graphics();
  private map: MapDef | null = null;

  build(map: MapDef): void {
    this.map = map;
    this.graphics.clear();
  }

  draw(camera: Camera, seconds: number): void {
    this.graphics.clear();
    if (!this.map) return;
    const environment = this.map.environment ?? DEFAULT_MAP_ENVIRONMENT;
    const frame = ambientLifeFrame(
      environment.seed,
      seconds,
      this.map.width * this.map.cellSize,
      this.map.height * this.map.cellSize,
    );
    if (frame.aircraft) drawAircraft(this.graphics, camera, frame.aircraft);
    for (const animal of frame.animals) drawAnimal(this.graphics, camera, animal);
  }
}

function aircraftFrame(
  seed: number,
  seconds: number,
  width: number,
  height: number,
): AmbientAircraft | null {
  const firstDelay = 38 + (ambientHash(seed, 11) % 19);
  const period = 82 + (ambientHash(seed, 13) % 24);
  const duration = 8;
  if (seconds < firstDelay) return null;
  const cycle = Math.floor((seconds - firstDelay) / period);
  const phase = seconds - firstDelay - cycle * period;
  if (phase >= duration) return null;

  const progress = phase / duration;
  const heading = (ambientHash(seed, cycle + 29) & 1) === 0 ? 1 : -1;
  const halfWidth = width / 2;
  const cycleHash = ambientHash(seed, cycle + 41);
  const y = -height * 0.32 + ((cycleHash >>> 8) / 0x00ff_ffff) * height * 0.64;
  const travel = -halfWidth - 8 + progress * (width + 16);
  return { x: heading === 1 ? travel : -travel, y, heading };
}

function animalFrame(
  seed: number,
  seconds: number,
  width: number,
  height: number,
): AmbientAnimal[] {
  const firstDelay = 9 + (ambientHash(seed, 53) % 10);
  const period = 29 + (ambientHash(seed, 59) % 16);
  const duration = 5.5;
  if (seconds < firstDelay) return [];
  const cycle = Math.floor((seconds - firstDelay) / period);
  const phaseSeconds = seconds - firstDelay - cycle * period;
  if (phaseSeconds >= duration) return [];

  const progress = phaseSeconds / duration;
  const cycleHash = ambientHash(seed, cycle + 71);
  const heading = (cycleHash & 1) === 0 ? 1 : -1;
  const routeLength = Math.min(14, width * 0.22);
  const margin = routeLength / 2 + 3;
  const usableWidth = Math.max(1, width - margin * 2);
  const startX = -width / 2 + margin + ((cycleHash >>> 8) / 0x00ff_ffff) * usableWidth;
  const y = -height * 0.36 + ((ambientHash(seed, cycle + 83) >>> 8) / 0x00ff_ffff) * height * 0.72;
  const centerX = startX + heading * (progress - 0.5) * routeLength;

  return [-0.7, 0, 0.65].map((offset, index) => ({
    x: centerX - heading * offset,
    y: y + Math.sin(progress * Math.PI * 8 + index * 1.7) * 0.18 + index * 0.24,
    heading,
    phase: progress + index * 0.17,
  }));
}

function drawAircraft(graphics: Graphics, camera: Camera, aircraft: AmbientAircraft): void {
  const { sx, sy } = camera.worldToScreen(aircraft.x, aircraft.y);
  const size = Math.max(20, camera.scale * 1.25);
  const direction = aircraft.heading;
  graphics
    .ellipse(sx + size * 0.18, sy + size * 0.24, size * 0.72, size * 0.25)
    .fill({ color: 0x111510, alpha: 0.18 })
    .moveTo(sx + direction * size * 0.9, sy)
    .lineTo(sx - direction * size * 0.18, sy - size * 0.13)
    .lineTo(sx - direction * size * 0.58, sy - size * 0.62)
    .lineTo(sx - direction * size * 0.78, sy - size * 0.58)
    .lineTo(sx - direction * size * 0.48, sy - size * 0.08)
    .lineTo(sx - direction * size * 0.86, sy + size * 0.24)
    .lineTo(sx - direction * size * 0.62, sy + size * 0.32)
    .lineTo(sx - direction * size * 0.12, sy + size * 0.12)
    .closePath()
    .fill({ color: 0x39413a, alpha: 0.72 })
    .stroke({ width: 1, color: 0x151a16, alpha: 0.82 });
}

function drawAnimal(graphics: Graphics, camera: Camera, animal: AmbientAnimal): void {
  const { sx, sy } = camera.worldToScreen(animal.x, animal.y);
  const size = Math.max(3, camera.scale * 0.13);
  const bob = Math.sin(animal.phase * Math.PI * 10) * size * 0.22;
  const direction = animal.heading;
  graphics
    .ellipse(sx, sy + bob, size * 1.15, size * 0.58)
    .fill({ color: 0x332c20, alpha: 0.88 })
    .circle(sx + direction * size * 0.92, sy - size * 0.2 + bob, size * 0.42)
    .fill({ color: 0x403727, alpha: 0.92 })
    .moveTo(sx - direction * size * 0.82, sy + bob)
    .lineTo(sx - direction * size * 1.45, sy - size * 0.42 + bob)
    .stroke({ width: Math.max(1, size * 0.28), color: 0x29241b, alpha: 0.85 });
}

function ambientHash(seed: number, salt: number): number {
  let value = Math.imul(seed ^ salt, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}
