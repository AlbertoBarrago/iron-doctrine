export interface WorldPoint {
  x: number;
  y: number;
}

/** Keep contextual orders inside the playable map, inset by half a map cell. */
export function clampMovementTarget(
  point: WorldPoint,
  width: number,
  height: number,
  cellSize: number,
): WorldPoint {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const inset = cellSize / 2;
  return {
    x: Math.min(halfWidth - inset, Math.max(-halfWidth + inset, point.x)),
    y: Math.min(halfHeight - inset, Math.max(-halfHeight + inset, point.y)),
  };
}
