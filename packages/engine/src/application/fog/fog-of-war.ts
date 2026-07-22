/**
 * Fog of war: a per-team visibility grid over the NavGrid's cell space.
 *
 * Three states per cell: Hidden (never seen) → Explored (seen before, terrain
 * remembered, no live enemy info) → Visible (currently in sight of a team unit).
 * Each tick, cells that were Visible drop to Explored, then vision sources re-stamp
 * their radius as Visible. Teams share one grid (allied vision). Fully deterministic:
 * integer cell math, order-independent stamping.
 */
import { NavGrid } from '../pathfinding/nav-grid.js';
import * as fp from '../../domain/math/fixed.js';
import type { Fixed } from '../../domain/math/fixed.js';

export const HIDDEN = 0;
export const EXPLORED = 1;
export const VISIBLE = 2;

export class FogOfWar {
  private readonly grids = new Map<number, Uint8Array>();
  readonly width: number;
  readonly height: number;

  constructor(private readonly grid: NavGrid) {
    this.width = grid.width;
    this.height = grid.height;
  }

  private gridFor(team: number): Uint8Array {
    let g = this.grids.get(team);
    if (!g) {
      g = new Uint8Array(this.width * this.height);
      this.grids.set(team, g);
    }
    return g;
  }

  state(team: number, cx: number, cy: number): number {
    if (cx < 0 || cy < 0 || cx >= this.width || cy >= this.height) return HIDDEN;
    return this.gridFor(team)[cy * this.width + cx]!;
  }

  /** True if the team can currently see the cell (for targeting / rendering). */
  isVisible(team: number, cx: number, cy: number): boolean {
    return this.state(team, cx, cy) === VISIBLE;
  }

  /** Demote all currently-visible cells to explored, before re-stamping this tick. */
  beginFrame(team: number): void {
    const g = this.gridFor(team);
    for (let i = 0; i < g.length; i++) if (g[i] === VISIBLE) g[i] = EXPLORED;
  }

  /** Reveal a circular area (world-space centre + radius) as visible for the team. */
  reveal(team: number, wx: Fixed, wy: Fixed, radiusUnits: Fixed): void {
    const g = this.gridFor(team);
    const centre = this.grid.worldToCell(wx, wy);
    const rCells = Math.ceil(fp.toFloat(fp.div(radiusUnits, this.grid.cellSize)));
    const r2 = rCells * rCells;
    for (let dy = -rCells; dy <= rCells; dy++) {
      for (let dx = -rCells; dx <= rCells; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const cx = centre.cx + dx;
        const cy = centre.cy + dy;
        if (cx < 0 || cy < 0 || cx >= this.width || cy >= this.height) continue;
        g[cy * this.width + cx] = VISIBLE;
      }
    }
  }

  /** Snapshot copy of a team's grid (for transfer to the renderer). */
  copy(team: number): Uint8Array {
    return this.gridFor(team).slice();
  }

  teams(): number[] {
    return [...this.grids.keys()].sort((a, b) => a - b);
  }
}
