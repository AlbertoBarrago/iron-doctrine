import {
  DEFAULT_MAP_ENVIRONMENT,
  MAP_BIOMES,
  MAP_ENVIRONMENT_VERSION,
  validateMap,
  type MapDef,
  type MapEnvironment,
} from '@iron/shared';

const STORAGE_KEY = 'iron-doctrine.maps.v1';

export interface MapStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface MapCatalogEntry {
  id: string;
  source: 'built-in' | 'local';
  map: MapDef;
}

export const DEFAULT_MAP: MapDef = {
  format: 'iron-doctrine.map',
  version: 1,
  name: 'Iron Dawn',
  width: 96,
  height: 96,
  cellSize: 1,
  blocked: [],
  resources: [
    { x: 24, y: 20, amount: 8000 },
    { x: 18, y: 28, amount: 8000 },
    { x: 30, y: 16, amount: 8000 },
    { x: 71, y: 75, amount: 8000 },
    { x: 77, y: 67, amount: 8000 },
    { x: 65, y: 79, amount: 8000 },
    { x: 48, y: 48, amount: 12000 },
  ],
  spawns: [
    { player: 0, x: 16, y: 16 },
    { player: 1, x: 79, y: 79 },
  ],
};

function ironPassBlocked(): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let x = 40; x <= 56; x++) {
    for (let y = 20; y < 40; y++) cells.push([x, y]);
    for (let y = 56; y <= 76; y++) cells.push([x, y]);
  }
  return cells;
}

export const IRON_PASS_MAP: MapDef = {
  format: 'iron-doctrine.map',
  version: 1,
  name: 'Iron Pass',
  width: 96,
  height: 96,
  cellSize: 1,
  environment: {
    version: MAP_ENVIRONMENT_VERSION,
    biome: 'mediterranean',
    seed: 1979,
  },
  blocked: ironPassBlocked(),
  resources: [
    { x: 16, y: 30, amount: 8000 },
    { x: 16, y: 66, amount: 8000 },
    { x: 28, y: 48, amount: 10000 },
    { x: 80, y: 30, amount: 8000 },
    { x: 80, y: 66, amount: 8000 },
    { x: 68, y: 48, amount: 10000 },
  ],
  spawns: [
    { player: 0, x: 16, y: 48 },
    { player: 1, x: 80, y: 48 },
  ],
};

function siegeLineBlocked(): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let x = 24; x <= 40; x++) {
    for (let y = 20; y < 40; y++) cells.push([x, y]);
    for (let y = 56; y <= 76; y++) cells.push([x, y]);
  }
  return cells;
}

export const SIEGE_LINE_MAP: MapDef = {
  format: 'iron-doctrine.map',
  version: 1,
  name: 'Siege Line',
  width: 96,
  height: 96,
  cellSize: 1,
  blocked: siegeLineBlocked(),
  resources: [
    { x: 12, y: 30, amount: 8000 },
    { x: 12, y: 66, amount: 8000 },
    { x: 20, y: 48, amount: 10000 },
    { x: 80, y: 30, amount: 8000 },
    { x: 80, y: 66, amount: 8000 },
  ],
  spawns: [
    { player: 0, x: 16, y: 48 },
    { player: 1, x: 80, y: 48 },
  ],
};

function blackDawnBlocked(): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let x = 64; x <= 80; x++) {
    for (let y = 20; y < 40; y++) cells.push([x, y]);
    for (let y = 56; y <= 76; y++) cells.push([x, y]);
  }
  return cells;
}

export const BLACK_DAWN_MAP: MapDef = {
  format: 'iron-doctrine.map',
  version: 1,
  name: 'Black Dawn',
  width: 96,
  height: 96,
  cellSize: 1,
  blocked: blackDawnBlocked(),
  resources: [
    { x: 16, y: 30, amount: 8000 },
    { x: 16, y: 66, amount: 8000 },
    { x: 28, y: 48, amount: 10000 },
    { x: 84, y: 30, amount: 8000 },
    { x: 84, y: 66, amount: 8000 },
  ],
  spawns: [
    { player: 0, x: 16, y: 48 },
    { player: 1, x: 84, y: 48 },
  ],
};

export function loadMapCatalog(storage: MapStorage): MapCatalogEntry[] {
  return [
    { id: 'built-in:iron-dawn', source: 'built-in', map: DEFAULT_MAP },
    { id: 'built-in:iron-pass', source: 'built-in', map: IRON_PASS_MAP },
    { id: 'built-in:siege-line', source: 'built-in', map: SIEGE_LINE_MAP },
    { id: 'built-in:black-dawn', source: 'built-in', map: BLACK_DAWN_MAP },
    ...loadLocalMaps(storage).map((map) => ({
      id: `local:${map.name.toLocaleLowerCase()}`,
      source: 'local' as const,
      map,
    })),
  ];
}

export function saveLocalMap(storage: MapStorage, candidate: MapDef): MapDef[] {
  const map = normalizeMap(candidate);
  if (!map.name) throw new Error('Map name is required');
  const errors = playableMapErrors(map);
  if (errors.length > 0) throw new Error(errors.join('\n'));

  const maps = loadLocalMaps(storage).filter(
    (existing) => existing.name.toLocaleLowerCase() !== map.name.toLocaleLowerCase(),
  );
  maps.push(map);
  maps.sort((left, right) => left.name.localeCompare(right.name));
  storage.setItem(STORAGE_KEY, JSON.stringify(maps));
  return maps;
}

export function parseMapJson(raw: string): MapDef {
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON');
  }
  if (!isMapDef(candidate)) throw new Error('Invalid map structure');
  const map = normalizeMap(candidate);
  const errors = playableMapErrors(map);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return map;
}

function loadLocalMaps(storage: MapStorage): MapDef[] {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isMapDef)
      .map(normalizeMap)
      .filter((map) => playableMapErrors(map).length === 0);
  } catch {
    return [];
  }
}

function playableMapErrors(map: MapDef): string[] {
  const errors = validateMap(map);
  if (!map.spawns.some((spawn) => spawn.player === 0)) errors.push('Player 1 spawn is required');
  if (!map.spawns.some((spawn) => spawn.player === 1)) errors.push('Player 2 spawn is required');
  return errors;
}

function normalizeMap(map: MapDef): MapDef {
  return {
    ...map,
    name: map.name.trim(),
    environment: { ...(map.environment ?? DEFAULT_MAP_ENVIRONMENT) },
    blocked: map.blocked.map(([x, y]) => [x, y]),
    resources: map.resources.map((resource) => ({ ...resource })),
    spawns: map.spawns.map((spawn) => ({ ...spawn })),
  };
}

function isMapDef(candidate: unknown): candidate is MapDef {
  if (!candidate || typeof candidate !== 'object') return false;
  const map = candidate as Partial<MapDef>;
  return (
    map.format === 'iron-doctrine.map' &&
    typeof map.version === 'number' &&
    typeof map.name === 'string' &&
    typeof map.width === 'number' &&
    typeof map.height === 'number' &&
    typeof map.cellSize === 'number' &&
    (map.environment === undefined || isMapEnvironment(map.environment)) &&
    Array.isArray(map.blocked) &&
    map.blocked.every(
      (cell) =>
        Array.isArray(cell) &&
        cell.length === 2 &&
        cell.every((coordinate) => typeof coordinate === 'number'),
    ) &&
    Array.isArray(map.resources) &&
    map.resources.every(
      (resource) =>
        resource !== null &&
        typeof resource === 'object' &&
        typeof (resource as { x?: unknown }).x === 'number' &&
        typeof (resource as { y?: unknown }).y === 'number' &&
        typeof (resource as { amount?: unknown }).amount === 'number',
    ) &&
    Array.isArray(map.spawns) &&
    map.spawns.every(
      (spawn) =>
        spawn !== null &&
        typeof spawn === 'object' &&
        typeof (spawn as { player?: unknown }).player === 'number' &&
        typeof (spawn as { x?: unknown }).x === 'number' &&
        typeof (spawn as { y?: unknown }).y === 'number',
    )
  );
}

function isMapEnvironment(candidate: unknown): candidate is MapEnvironment {
  if (!candidate || typeof candidate !== 'object') return false;
  const environment = candidate as Partial<MapEnvironment>;
  return (
    environment.version === MAP_ENVIRONMENT_VERSION &&
    typeof environment.biome === 'string' &&
    MAP_BIOMES.includes(environment.biome as MapEnvironment['biome']) &&
    typeof environment.seed === 'number'
  );
}
