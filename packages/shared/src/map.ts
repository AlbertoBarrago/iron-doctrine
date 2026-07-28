/**
 * Map definition format (JSON). Produced by the map editor and consumed at match
 * start to seed the NavGrid, resource nodes and player spawns. Versioned and
 * validated so a malformed map fails fast rather than corrupting a match.
 */
export const MAP_VERSION = 1;

export const MAP_ENVIRONMENT_VERSION = 1;

export const MAP_BIOMES = ['temperate', 'mediterranean'] as const;

export type MapBiome = (typeof MAP_BIOMES)[number];

export interface MapEnvironment {
  version: typeof MAP_ENVIRONMENT_VERSION;
  biome: MapBiome;
  /** Seed used only for deterministic presentation details. */
  seed: number;
}

export const DEFAULT_MAP_ENVIRONMENT: MapEnvironment = {
  version: MAP_ENVIRONMENT_VERSION,
  biome: 'temperate',
  seed: 1,
};

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
  /**
   * Presentation-only environment metadata. Optional for backwards compatibility
   * with maps authored before environments were introduced.
   */
  environment?: MapEnvironment;
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
    environment: { ...DEFAULT_MAP_ENVIRONMENT },
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
  if (
    !Number.isInteger(map.width) ||
    !Number.isInteger(map.height) ||
    map.width <= 0 ||
    map.height <= 0
  ) {
    errors.push('width/height must be positive integers');
  }
  if (!Number.isFinite(map.cellSize) || map.cellSize <= 0)
    errors.push('cell size must be positive');
  if (map.environment) {
    if (map.environment.version !== MAP_ENVIRONMENT_VERSION) {
      errors.push(`unsupported environment version ${map.environment.version}`);
    }
    if (!MAP_BIOMES.includes(map.environment.biome)) {
      errors.push(`unsupported biome ${String(map.environment.biome)}`);
    }
    if (!Number.isSafeInteger(map.environment.seed)) {
      errors.push('environment seed must be a safe integer');
    }
  }
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < map.width && y < map.height;
  for (const [cx, cy] of map.blocked) {
    if (!inBounds(cx, cy)) errors.push(`blocked cell out of bounds: ${cx},${cy}`);
  }
  for (const resource of map.resources) {
    if (!inBounds(resource.x, resource.y)) {
      errors.push(`resource out of bounds: ${resource.x},${resource.y}`);
    }
    if (!Number.isFinite(resource.amount) || resource.amount <= 0) {
      errors.push(`resource amount must be positive: ${resource.x},${resource.y}`);
    }
  }
  if (map.spawns.length === 0) errors.push('map needs at least one spawn');
  const players = new Set<number>();
  for (const spawn of map.spawns) {
    if (!inBounds(spawn.x, spawn.y)) errors.push(`spawn out of bounds: ${spawn.x},${spawn.y}`);
    if (players.has(spawn.player)) errors.push(`duplicate spawn for player ${spawn.player + 1}`);
    players.add(spawn.player);
  }
  return errors;
}
