import { describe, expect, it } from 'vitest';
import { brushCells, clampZoom, pointToCell } from './mapEditorModel.js';

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
});
