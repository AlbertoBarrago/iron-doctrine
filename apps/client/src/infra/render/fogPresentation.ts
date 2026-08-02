export type FogVisibility = 0 | 1 | 2;
export type FogCorner = 'north-west' | 'north-east' | 'south-east' | 'south-west';
export type FogTextureMark = 'none' | 'forward-slash' | 'back-slash';

export interface FogTextureSample {
  color: number;
  mark: FogTextureMark;
  offset: number;
}

export const FOG_TRANSITION_BANDS = 4;

const HIDDEN_EDGE_ALPHA = [0.62, 0.38, 0.21, 0.09] as const;
const HIDDEN_TEXTURE_COLORS = [0x020403, 0x030605, 0x040706, 0x050805] as const;

/**
 * Stable presentation-only variation for unexplored cells. Full-opacity colors keep
 * terrain concealed while sparse marks prevent the fog from reading as empty canvas.
 */
export function fogTextureSample(seed: number, x: number, y: number): FogTextureSample {
  let hash = seed | 0;
  hash ^= Math.imul(x, 0x1f123bb5);
  hash ^= Math.imul(y, 0x5f356495);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = (hash ^ (hash >>> 16)) >>> 0;
  const markRoll = (hash >>> 5) & 15;

  return {
    color: HIDDEN_TEXTURE_COLORS[hash & 3]!,
    mark: markRoll === 0 ? 'forward-slash' : markRoll === 1 ? 'back-slash' : 'none',
    offset: ((hash >>> 12) & 255) / 255,
  };
}

/**
 * Returns hidden neighbours only. Explored and currently visible cells are both
 * known terrain, while out-of-map cells remain fully hidden.
 */
export function fogTransitionState(
  cells: Uint8Array,
  width: number,
  height: number,
  current: FogVisibility,
  neighbourX: number,
  neighbourY: number,
): Exclude<FogVisibility, 2> | null {
  if (current === 0) return null;
  const neighbour =
    neighbourX < 0 || neighbourY < 0 || neighbourX >= width || neighbourY >= height
      ? 0
      : cells[neighbourY * width + neighbourX]!;
  return neighbour === 0 ? 0 : null;
}

/**
 * Identifies corners where a straight cardinal transition ends, two darker edges
 * meet, or only a darker diagonal touches the current cell.
 */
export function fogCornerTransitionState(
  cells: Uint8Array,
  width: number,
  height: number,
  current: FogVisibility,
  cellX: number,
  cellY: number,
  corner: FogCorner,
): Exclude<FogVisibility, 2> | null {
  if (current === 0) return null;
  const horizontalX = corner.endsWith('west') ? cellX - 1 : cellX + 1;
  const verticalY = corner.startsWith('north') ? cellY - 1 : cellY + 1;
  const horizontal = fogTransitionState(cells, width, height, current, horizontalX, cellY);
  const vertical = fogTransitionState(cells, width, height, current, cellX, verticalY);
  const diagonal = fogTransitionState(cells, width, height, current, horizontalX, verticalY);

  if (horizontal === null && vertical === null) return diagonal;
  if (horizontal !== null && vertical !== null) {
    return Math.min(horizontal, vertical, diagonal ?? current) as Exclude<FogVisibility, 2>;
  }
  if (diagonal !== null) return null;
  return horizontal ?? vertical;
}

export function fogTransitionAlpha(neighbour: Exclude<FogVisibility, 2>, band: number): number {
  if (band < 0 || band >= FOG_TRANSITION_BANDS) return 0;
  return neighbour === 0 ? HIDDEN_EDGE_ALPHA[band]! : 0;
}
