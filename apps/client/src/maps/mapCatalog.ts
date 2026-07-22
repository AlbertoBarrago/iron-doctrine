import { validateMap, type MapDef } from '@iron/shared';

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
    { x: 24, y: 20, amount: 6000 },
    { x: 71, y: 75, amount: 6000 },
  ],
  spawns: [
    { player: 0, x: 16, y: 16 },
    { player: 1, x: 79, y: 79 },
  ],
};

export function loadMapCatalog(storage: MapStorage): MapCatalogEntry[] {
  return [
    { id: 'built-in:iron-dawn', source: 'built-in', map: DEFAULT_MAP },
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
