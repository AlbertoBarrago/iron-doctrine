/**
 * 2D camera: converts between world units and screen pixels, with pan and zoom.
 * The renderer applies the camera as a transform on the world container; input code
 * uses it to translate pointer positions back into world space for commands.
 */
export const PIXELS_PER_UNIT = 32;

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
