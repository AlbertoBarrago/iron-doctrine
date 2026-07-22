/**
 * Deterministic A* over a {@link NavGrid}. Integer costs only (orthogonal = 10,
 * diagonal = 14 ≈ 10√2). The open-set heap breaks f-score ties by insertion order so
 * the returned path is identical on every machine — required for lockstep.
 *
 * For large groups sharing a goal, prefer a flow field (see `flow-field.ts`) to avoid
 * N independent A* searches; A* remains ideal for single-unit / sparse requests.
 */
import { NavGrid, type Cell } from './nav-grid.js';

const ORTHO = 10;
const DIAG = 14;

interface HeapNode {
  idx: number; // cell index
  f: number;
  seq: number; // insertion order, deterministic tie-break
}

/** Minimal binary min-heap ordered by (f, seq). */
class MinHeap {
  private readonly data: HeapNode[] = [];

  get size(): number {
    return this.data.length;
  }

  push(node: HeapNode): void {
    const d = this.data;
    d.push(node);
    let i = d.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.less(d[i]!, d[parent]!)) {
        [d[i], d[parent]] = [d[parent]!, d[i]!];
        i = parent;
      } else break;
    }
  }

  pop(): HeapNode {
    const d = this.data;
    const top = d[0]!;
    const last = d.pop()!;
    if (d.length > 0) {
      d[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let smallest = i;
        if (l < d.length && this.less(d[l]!, d[smallest]!)) smallest = l;
        if (r < d.length && this.less(d[r]!, d[smallest]!)) smallest = r;
        if (smallest === i) break;
        [d[i], d[smallest]] = [d[smallest]!, d[i]!];
        i = smallest;
      }
    }
    return top;
  }

  private less(a: HeapNode, b: HeapNode): boolean {
    return a.f < b.f || (a.f === b.f && a.seq < b.seq);
  }
}

/** Octile heuristic (admissible for 8-directional movement). */
function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return ORTHO * (dx + dy) + (DIAG - 2 * ORTHO) * Math.min(dx, dy);
}

/**
 * Finds a path of cell centres from `start` to `goal`. Returns the list of cells
 * (inclusive of start and goal) or `null` if unreachable.
 */
export function findPath(grid: NavGrid, start: Cell, goal: Cell): Cell[] | null {
  if (grid.isBlocked(goal.cx, goal.cy) || grid.isBlocked(start.cx, start.cy)) return null;
  if (start.cx === goal.cx && start.cy === goal.cy) return [start];

  const size = grid.width * grid.height;
  const gScore = new Int32Array(size).fill(0x7fffffff);
  const cameFrom = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);

  const startIdx = grid.index(start.cx, start.cy);
  const goalIdx = grid.index(goal.cx, goal.cy);
  gScore[startIdx] = 0;

  const open = new MinHeap();
  let seq = 0;
  open.push({ idx: startIdx, f: heuristic(start.cx, start.cy, goal.cx, goal.cy), seq: seq++ });

  const dirs = [
    [1, 0, ORTHO],
    [-1, 0, ORTHO],
    [0, 1, ORTHO],
    [0, -1, ORTHO],
    [1, 1, DIAG],
    [1, -1, DIAG],
    [-1, 1, DIAG],
    [-1, -1, DIAG],
  ] as const;

  while (open.size > 0) {
    const current = open.pop();
    if (closed[current.idx]) continue;
    if (current.idx === goalIdx) return reconstruct(grid, cameFrom, goalIdx);
    closed[current.idx] = 1;

    const cx = current.idx % grid.width;
    const cy = (current.idx - cx) / grid.width;

    for (const [dx, dy, base] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (grid.isBlocked(nx, ny)) continue;
      // Disallow diagonal corner-cutting through blocked orthogonal neighbours.
      if (dx !== 0 && dy !== 0 && (grid.isBlocked(cx + dx, cy) || grid.isBlocked(cx, cy + dy))) {
        continue;
      }
      const nIdx = grid.index(nx, ny);
      if (closed[nIdx]) continue;
      const tentative = gScore[current.idx]! + base + grid.extraCost(nx, ny);
      if (tentative < gScore[nIdx]!) {
        gScore[nIdx] = tentative;
        cameFrom[nIdx] = current.idx;
        open.push({ idx: nIdx, f: tentative + heuristic(nx, ny, goal.cx, goal.cy), seq: seq++ });
      }
    }
  }
  return null;
}

function reconstruct(grid: NavGrid, cameFrom: Int32Array, goalIdx: number): Cell[] {
  const path: Cell[] = [];
  let idx = goalIdx;
  while (idx !== -1) {
    const cx = idx % grid.width;
    const cy = (idx - cx) / grid.width;
    path.push({ cx, cy });
    idx = cameFrom[idx]!;
  }
  path.reverse();
  return path;
}
