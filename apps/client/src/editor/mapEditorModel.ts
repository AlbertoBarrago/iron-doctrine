import type { MapSpawn } from '@iron/shared';

export interface GridCell {
  cx: number;
  cy: number;
}

export function pointToCell(
  x: number,
  y: number,
  surfaceWidth: number,
  surfaceHeight: number,
  mapWidth: number,
  mapHeight: number,
): GridCell {
  return {
    cx: Math.floor((x / surfaceWidth) * mapWidth),
    cy: Math.floor((y / surfaceHeight) * mapHeight),
  };
}

export function brushCells(
  center: GridCell,
  size: number,
  mapWidth: number,
  mapHeight: number,
): GridCell[] {
  const radius = Math.floor(size / 2);
  const cells: GridCell[] = [];
  for (let cy = center.cy - radius; cy <= center.cy + radius; cy++) {
    for (let cx = center.cx - radius; cx <= center.cx + radius; cx++) {
      if (cx >= 0 && cy >= 0 && cx < mapWidth && cy < mapHeight) cells.push({ cx, cy });
    }
  }
  return cells;
}

export function clampZoom(zoom: number): number {
  return Math.min(2.5, Math.max(0.5, Math.round(zoom * 4) / 4));
}

export function canvasBackingSize(displaySize: number, devicePixelRatio: number): number {
  const resolution = Math.min(2, Math.max(1, devicePixelRatio));
  return Math.min(3072, Math.max(1024, Math.ceil(displaySize * resolution)));
}

export function movePlayerSpawn(
  spawns: readonly MapSpawn[],
  player: number,
  destination: GridCell,
): MapSpawn[] {
  return [
    ...spawns.filter(
      (spawn) =>
        spawn.player !== player && (spawn.x !== destination.cx || spawn.y !== destination.cy),
    ),
    { player, x: destination.cx, y: destination.cy },
  ];
}
