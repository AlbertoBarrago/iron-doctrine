/**
 * Map definition format (JSON). Produced by the map editor and consumed at match
 * start to seed the NavGrid, resource nodes and player spawns. Versioned and
 * validated so a malformed map fails fast rather than corrupting a match.
 */
export const MAP_VERSION = 1;

export interface MapResource {
  x: number;
  y: number;
  amount: number;
}

export interface MapSpawn {
  player: number;
  x: number;
  y: number;
}

export interface MapDef {
  format: 'iron-doctrine.map';
  version: number;
  name: string;
  width: number;
  height: number;
  cellSize: number;
  /** Blocked cells as [cx, cy] pairs. */
  blocked: Array<[number, number]>;
  resources: MapResource[];
  spawns: MapSpawn[];
}

export function createEmptyMap(name: string, width = 64, height = 64): MapDef {
  return {
    format: 'iron-doctrine.map',
    version: MAP_VERSION,
    name,
    width,
    height,
    cellSize: 1,
    blocked: [],
    resources: [],
    spawns: [],
  };
}

/** Returns an array of human-readable problems; empty means the map is valid. */
export function validateMap(map: MapDef): string[] {
  const errors: string[] = [];
  if (map.format !== 'iron-doctrine.map') errors.push('wrong format tag');
  if (map.version !== MAP_VERSION) errors.push(`unsupported version ${map.version}`);
  if (map.width <= 0 || map.height <= 0) errors.push('width/height must be positive');
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < map.width && y < map.height;
  for (const [cx, cy] of map.blocked) {
    if (!inBounds(cx, cy)) errors.push(`blocked cell out of bounds: ${cx},${cy}`);
  }
  if (map.spawns.length === 0) errors.push('map needs at least one spawn');
  return errors;
}
