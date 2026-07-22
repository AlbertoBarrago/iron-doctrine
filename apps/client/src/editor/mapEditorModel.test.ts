import { describe, expect, it } from 'vitest';
import {
  brushCells,
  canvasBackingSize,
  clampZoom,
  movePlayerSpawn,
  pointToCell,
} from './mapEditorModel.js';

describe('map editor model', () => {
  it('maps display coordinates to map cells independently of canvas resolution', () => {
    expect(pointToCell(320, 160, 640, 640, 48, 48)).toEqual({ cx: 24, cy: 12 });
    expect(pointToCell(900, 450, 1200, 600, 64, 32)).toEqual({ cx: 48, cy: 24 });
  });

  it('builds clipped square brushes at map edges', () => {
    expect(brushCells({ cx: 0, cy: 0 }, 3, 48, 48)).toEqual([
      { cx: 0, cy: 0 },
      { cx: 1, cy: 0 },
      { cx: 0, cy: 1 },
      { cx: 1, cy: 1 },
    ]);
    expect(brushCells({ cx: 12, cy: 12 }, 1, 48, 48)).toEqual([{ cx: 12, cy: 12 }]);
  });

  it('quantizes and bounds zoom', () => {
    expect(clampZoom(0.1)).toBe(0.5);
    expect(clampZoom(1.18)).toBe(1.25);
    expect(clampZoom(3)).toBe(2.5);
  });

  it('allocates a DPR-aware backing buffer with safe bounds', () => {
    expect(canvasBackingSize(640, 1)).toBe(1024);
    expect(canvasBackingSize(900, 2)).toBe(1800);
    expect(canvasBackingSize(2000, 3)).toBe(3072);
  });

  it('moves one player spawn instead of creating duplicates', () => {
    const spawns = [
      { player: 0, x: 4, y: 4 },
      { player: 1, x: 43, y: 43 },
    ];
    expect(movePlayerSpawn(spawns, 0, { cx: 10, cy: 12 })).toEqual([
      { player: 1, x: 43, y: 43 },
      { player: 0, x: 10, y: 12 },
    ]);
  });
});
