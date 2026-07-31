export type FogVisibility = 0 | 1 | 2;

export const FOG_TRANSITION_BANDS = 4;

const HIDDEN_EDGE_ALPHA = [0.62, 0.38, 0.21, 0.09] as const;
const EXPLORED_EDGE_ALPHA = [0.14, 0.09, 0.05, 0.02] as const;

/**
 * Returns a darker neighbouring state only. Out-of-map cells remain fully hidden,
 * so presentation smoothing can never reveal authoritative fog.
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
  return neighbour < current ? (neighbour as Exclude<FogVisibility, 2>) : null;
}

export function fogTransitionAlpha(neighbour: Exclude<FogVisibility, 2>, band: number): number {
  if (band < 0 || band >= FOG_TRANSITION_BANDS) return 0;
  return neighbour === 0 ? HIDDEN_EDGE_ALPHA[band]! : EXPLORED_EDGE_ALPHA[band]!;
}
