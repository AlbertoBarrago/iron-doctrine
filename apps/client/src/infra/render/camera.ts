/**
 * 2D camera: converts between world units and screen pixels, with pan and zoom.
 * The renderer applies the camera as a transform on the world container; input code
 * uses it to translate pointer positions back into world space for commands.
 */
export const PIXELS_PER_UNIT = 32;
export const EDGE_PAN_MARGIN = 36;
export const CAMERA_DRAG_THRESHOLD = 6;

export function exceedsDragThreshold(
  start: { x: number; y: number },
  current: { x: number; y: number },
  threshold = CAMERA_DRAG_THRESHOLD,
): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

export function edgePanDirection(
  pointer: { x: number; y: number } | null,
  width: number,
  height: number,
  margin = EDGE_PAN_MARGIN,
): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
  if (!pointer) return { x: 0, y: 0 };
  return {
    x: pointer.x <= margin ? -1 : pointer.x >= width - margin ? 1 : 0,
    y: pointer.y <= margin ? -1 : pointer.y >= height - margin ? 1 : 0,
  };
}

export class Camera {
  /** World-space position of the viewport centre, in units. */
  x = 0;
  y = 0;
  zoom = 1;

  constructor(
    private viewW: number,
    private viewH: number,
  ) {}

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  pan(dxUnits: number, dyUnits: number): void {
    this.x += dxUnits;
    this.y += dyUnits;
  }

  panByScreenDelta(dxPixels: number, dyPixels: number): void {
    this.pan(-dxPixels / this.scale, -dyPixels / this.scale);
  }

  clampToWorld(widthUnits: number, heightUnits: number): void {
    const halfViewW = this.viewW / 2 / this.scale;
    const halfViewH = this.viewH / 2 / this.scale;
    const halfWorldW = widthUnits / 2;
    const halfWorldH = heightUnits / 2;
    const maxX = Math.max(0, halfWorldW - halfViewW);
    const maxY = Math.max(0, halfWorldH - halfViewH);
    this.x = Math.min(maxX, Math.max(-maxX, this.x));
    this.y = Math.min(maxY, Math.max(-maxY, this.y));
  }

  zoomBy(factor: number): void {
    this.zoom = Math.min(3, Math.max(0.3, this.zoom * factor));
  }

  get scale(): number {
    return PIXELS_PER_UNIT * this.zoom;
  }

  /** World units → screen pixels. */
  worldToScreen(wx: number, wy: number): { sx: number; sy: number } {
    return {
      sx: (wx - this.x) * this.scale + this.viewW / 2,
      sy: (wy - this.y) * this.scale + this.viewH / 2,
    };
  }

  /** Screen pixels → world units. */
  screenToWorld(sx: number, sy: number): { wx: number; wy: number } {
    return {
      wx: (sx - this.viewW / 2) / this.scale + this.x,
      wy: (sy - this.viewH / 2) / this.scale + this.y,
    };
  }
}
