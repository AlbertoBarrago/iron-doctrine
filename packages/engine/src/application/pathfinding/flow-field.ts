/**
 * Flow field pathfinding for large groups sharing one destination.
 *
 * A single Dijkstra pass from the goal builds an integration field (cost-to-goal per
 * cell); each cell then stores the direction toward its lowest-cost neighbour. Hundreds
 * of units can follow the same field in O(1) per unit, avoiding N independent A*
 * searches. Fully deterministic: integer costs, fixed neighbour order.
 */
import { NavGrid, type Cell } from './nav-grid.js';
import * as fp from '../../domain/math/fixed.js';
import { normalize, type Vec2 } from '../../domain/math/vec2.js';

const ORTHO = 10;
const DIAG = 14;
const UNREACHABLE = 0x7fffffff;

const NEIGHBORS = [
  [1, 0, ORTHO],
  [-1, 0, ORTHO],
  [0, 1, ORTHO],
  [0, -1, ORTHO],
  [1, 1, DIAG],
  [1, -1, DIAG],
  [-1, 1, DIAG],
  [-1, -1, DIAG],
] as const;

export class FlowField {
  readonly cost: Int32Array;
  /** Per-cell unit direction toward the goal (zero for unreachable / goal cell). */
  private readonly dir: Vec2[];

  constructor(
    private readonly grid: NavGrid,
    readonly goal: Cell,
  ) {
    const size = grid.width * grid.height;
    this.cost = new Int32Array(size).fill(UNREACHABLE);
    this.dir = new Array<Vec2>(size);
    this.buildIntegration();
    this.buildDirections();
  }

  /** Dijkstra from the goal over passable cells. */
  private buildIntegration(): void {
    if (this.grid.isBlocked(this.goal.cx, this.goal.cy)) return;
    const start = this.grid.index(this.goal.cx, this.goal.cy);
    this.cost[start] = 0;
    // Small binary-heap-free Dijkstra: repeated bucketed relaxation is overkill here;
    // a simple priority via array of {idx,c} sorted-insert keeps it deterministic and
    // adequate for map-sized grids.
    const open: Array<{ idx: number; c: number }> = [{ idx: start, c: 0 }];
    while (open.length > 0) {
      // Pop the lowest cost (stable: earliest inserted among equals).
      let best = 0;
      for (let i = 1; i < open.length; i++) if (open[i]!.c < open[best]!.c) best = i;
      const { idx, c } = open.splice(best, 1)[0]!;
      if (c > this.cost[idx]!) continue;
      const cx = idx % this.grid.width;
      const cy = (idx - cx) / this.grid.width;
      for (const [dx, dy, base] of NEIGHBORS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (this.grid.isBlocked(nx, ny)) continue;
        if (dx !== 0 && dy !== 0 && (this.grid.isBlocked(cx + dx, cy) || this.grid.isBlocked(cx, cy + dy))) {
          continue; // no diagonal corner cutting
        }
        const nIdx = this.grid.index(nx, ny);
        const nc = c + base + this.grid.extraCost(nx, ny);
        if (nc < this.cost[nIdx]!) {
          this.cost[nIdx] = nc;
          open.push({ idx: nIdx, c: nc });
        }
      }
    }
  }

  /** For each cell, point toward the lowest-cost reachable neighbour. */
  private buildDirections(): void {
    const zero: Vec2 = { x: fp.FP.ZERO, y: fp.FP.ZERO };
    for (let cy = 0; cy < this.grid.height; cy++) {
      for (let cx = 0; cx < this.grid.width; cx++) {
        const idx = this.grid.index(cx, cy);
        if (this.cost[idx] === UNREACHABLE || this.cost[idx] === 0) {
          this.dir[idx] = zero;
          continue;
        }
        let bestCost = this.cost[idx]!;
        let bx = 0;
        let by = 0;
        for (const [dx, dy] of NEIGHBORS) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (this.grid.isBlocked(nx, ny)) continue;
          // Never steer diagonally through a blocked corner.
          if (dx !== 0 && dy !== 0 && (this.grid.isBlocked(cx + dx, cy) || this.grid.isBlocked(cx, cy + dy))) {
            continue;
          }
          const nCost = this.cost[this.grid.index(nx, ny)]!;
          if (nCost < bestCost) {
            bestCost = nCost;
            bx = dx;
            by = dy;
          }
        }
        this.dir[idx] = normalize({ x: fp.fromInt(bx), y: fp.fromInt(by) });
      }
    }
  }

  /** True if the goal is reachable from the given cell. */
  reachable(cx: number, cy: number): boolean {
    if (!this.grid.inBounds(cx, cy)) return false;
    return this.cost[this.grid.index(cx, cy)] !== UNREACHABLE;
  }

  /** Unit direction from a world position toward the goal (zero if none). */
  sampleAt(wx: fp.Fixed, wy: fp.Fixed): Vec2 {
    const cell = this.grid.worldToCell(wx, wy);
    if (!this.grid.inBounds(cell.cx, cell.cy)) return { x: fp.FP.ZERO, y: fp.FP.ZERO };
    return this.dir[this.grid.index(cell.cx, cell.cy)]!;
  }
}
