import { describe, expect, it } from 'vitest';
import { Camera, edgePanDirection } from './camera.js';

describe('mouse camera navigation', () => {
  it('detects viewport edges without moving in the safe centre', () => {
    expect(edgePanDirection({ x: 1, y: 50 }, 100, 100)).toEqual({ x: -1, y: 0 });
    expect(edgePanDirection({ x: 99, y: 99 }, 100, 100)).toEqual({ x: 1, y: 1 });
    expect(edgePanDirection({ x: 50, y: 50 }, 100, 100)).toEqual({ x: 0, y: 0 });
    expect(edgePanDirection(null, 100, 100)).toEqual({ x: 0, y: 0 });
  });

  it('pans opposite to a middle-button drag', () => {
    const camera = new Camera(800, 600);
    camera.panByScreenDelta(64, -32);
    expect(camera.x).toBe(-2);
    expect(camera.y).toBe(1);
  });

  it('keeps the viewport centre inside world bounds', () => {
    const camera = new Camera(320, 320);
    camera.pan(100, -100);
    camera.clampToWorld(40, 40);
    expect(camera.x).toBe(15);
    expect(camera.y).toBe(-15);
  });
});
