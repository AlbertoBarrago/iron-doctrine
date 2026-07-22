/**
 * Navigation grid: a uniform tiling of the map into passable/blocked cells with
 * per-cell traversal cost. Buildings stamp their footprint as blocked; destruction
 * clears it. All coordinates here are integers (cell space) or fixed-point (world
 * space) so pathfinding stays deterministic.
 */
import * as fp from '../../domain/math/fixed.js';
import type { Fixed } from '../../domain/math/fixed.js';

export interface Cell {
  cx: number;
  cy: number;
}

export class NavGrid {
  private readonly blocked: Uint8Array;
  /** Extra movement cost per cell (0 = default). Scaled integer (x256). */
  private readonly cost: Uint16Array;

  readonly originX: Fixed;
  readonly originY: Fixed;

  constructor(
    readonly width: number,
    readonly height: number,
    /** World units per cell, as fixed-point. */
    readonly cellSize: Fixed = fp.fromInt(1),
    /**
     * World coordinate of cell (0,0)'s corner. When omitted the map is centred on
     * the world origin (so negative coordinates are addressable).
     */
    origin?: { x: Fixed; y: Fixed },
  ) {
    this.blocked = new Uint8Array(width * height);
    this.cost = new Uint16Array(width * height);
    this.originX = origin?.x ?? fp.neg(fp.div(fp.mul(fp.fromInt(width), cellSize), fp.fromInt(2)));
    this.originY = origin?.y ?? fp.neg(fp.div(fp.mul(fp.fromInt(height), cellSize), fp.fromInt(2)));
  }

  index(cx: number, cy: number): number {
    return cy * this.width + cx;
  }

  /** Serialize passability + cost as plain arrays (for savegames). */
  serialize(): { blocked: number[]; cost: number[] } {
    return { blocked: Array.from(this.blocked), cost: Array.from(this.cost) };
  }

  restore(state: { blocked: number[]; cost: number[] }): void {
    this.blocked.set(state.blocked);
    this.cost.set(state.cost);
  }

  inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.width && cy < this.height;
  }

  isBlocked(cx: number, cy: number): boolean {
    if (!this.inBounds(cx, cy)) return true;
    return this.blocked[this.index(cx, cy)] === 1;
  }

  setBlocked(cx: number, cy: number, value: boolean): void {
    if (this.inBounds(cx, cy)) this.blocked[this.index(cx, cy)] = value ? 1 : 0;
  }

  /** Stamp a rectangular footprint (e.g. a building) as blocked/clear. */
  stampRect(cx: number, cy: number, w: number, h: number, value: boolean): void {
    for (let y = cy; y < cy + h; y++) {
      for (let x = cx; x < cx + w; x++) this.setBlocked(x, y, value);
    }
  }

  extraCost(cx: number, cy: number): number {
    return this.inBounds(cx, cy) ? this.cost[this.index(cx, cy)]! : 0;
  }

  setCost(cx: number, cy: number, scaledCost: number): void {
    if (this.inBounds(cx, cy)) this.cost[this.index(cx, cy)] = scaledCost & 0xffff;
  }

  /**
   * Nearest passable cell to (cx,cy), searched in expanding rings. Returns the cell
   * itself when already free, or `null` if none is reachable within `maxRadius`.
   * Used to approach blocked goals (e.g. moving next to a building footprint).
   */
  nearestOpen(cx: number, cy: number, maxRadius = 16): Cell | null {
    if (!this.isBlocked(cx, cy)) return { cx, cy };
    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring perimeter only
          const nx = cx + dx;
          const ny = cy + dy;
          if (!this.isBlocked(nx, ny)) return { cx: nx, cy: ny };
        }
      }
    }
    return null;
  }

  /** World position (fixed) → cell coordinates. */
  worldToCell(x: Fixed, y: Fixed): Cell {
    return {
      cx: Math.floor(fp.toFloat(fp.div(fp.sub(x, this.originX), this.cellSize))),
      cy: Math.floor(fp.toFloat(fp.div(fp.sub(y, this.originY), this.cellSize))),
    };
  }

  /** Cell coordinates → world position at the cell CENTRE (fixed). */
  cellToWorld(cx: number, cy: number): { x: Fixed; y: Fixed } {
    const half = fp.div(this.cellSize, fp.fromInt(2));
    return {
      x: fp.add(fp.add(this.originX, fp.mul(fp.fromInt(cx), this.cellSize)), half),
      y: fp.add(fp.add(this.originY, fp.mul(fp.fromInt(cy), this.cellSize)), half),
    };
  }
}
