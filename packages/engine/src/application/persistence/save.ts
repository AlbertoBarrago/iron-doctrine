/**
 * Savegame serialization. A save is a full deterministic snapshot of authoritative
 * state: allocator, all component data, navigation grid, per-player economy, RNG state
 * and tick. Loading reconstructs an identical Simulation that resumes bit-for-bit.
 *
 * Fog of war is intentionally NOT saved — it is recomputed from vision sources on the
 * first tick after load (explored memory is rebuilt as the player re-sees the map).
 */
import { Simulation } from '../simulation.js';
import { NavGrid } from '../pathfinding/nav-grid.js';
import { ALL_COMPONENTS, COMPONENT_BY_NAME } from '../../domain/components/registry.js';
import * as fp from '../../domain/math/fixed.js';
import { SAVE_VERSION, type EntityId } from '@iron/shared';
import type { EntityManagerState } from '../ecs/entity.js';
import type { PlayerResources } from '../../domain/economy/player-economy.js';
import type { AIPlayerConfig } from '../ai/ai-director.js';
import type { MatchStateSnapshot } from '../match/match-state.js';

interface ComponentBlock {
  name: string;
  entries: Array<[number, unknown]>;
}

export interface SaveState {
  format: 'iron-doctrine.save';
  version: number;
  tick: number;
  rngState: number;
  seed: number;
  aiPlayers: AIPlayerConfig[];
  grid: { width: number; height: number; cellSize: number; blocked: number[]; cost: number[] };
  entityManager: EntityManagerState;
  components: ComponentBlock[];
  economy: Array<[number, PlayerResources]>;
  tech: Array<[number, string[]]>;
  match?: { players: number[]; state: MatchStateSnapshot };
}

/** Serialize a running simulation into a plain, JSON-safe object. */
export function saveSimulation(
  sim: Simulation,
  seed: number,
  aiPlayers: AIPlayerConfig[] = [],
): SaveState {
  const components: ComponentBlock[] = [];
  for (const type of ALL_COMPONENTS) {
    const entries: Array<[number, unknown]> = [];
    for (const e of sim.world.query(type)) entries.push([e, sim.world.get(e, type)]);
    if (entries.length > 0) components.push({ name: type.name, entries });
  }
  return {
    format: 'iron-doctrine.save',
    version: SAVE_VERSION,
    tick: sim.tick,
    rngState: sim.rng.getState(),
    seed,
    aiPlayers,
    grid: {
      width: sim.grid.width,
      height: sim.grid.height,
      cellSize: fp.toFloat(sim.grid.cellSize),
      ...sim.grid.serialize(),
    },
    entityManager: sim.world.entities.serialize(),
    components,
    economy: sim.economy.serialize(),
    tech: sim.tech.serialize(),
    ...(sim.match && {
      match: { players: [...sim.match.players], state: sim.match.snapshot() },
    }),
  };
}

/** Reconstruct a Simulation from a save. The result resumes exactly where it left off. */
export function loadSimulation(save: SaveState): Simulation {
  if (save.format !== 'iron-doctrine.save') throw new Error('loadSimulation: bad format');
  if (save.version !== SAVE_VERSION) {
    throw new Error(`loadSimulation: incompatible save version ${save.version}`);
  }

  const grid = new NavGrid(save.grid.width, save.grid.height, fp.fromFloat(save.grid.cellSize));
  grid.restore({ blocked: save.grid.blocked, cost: save.grid.cost });

  const sim = new Simulation({
    seed: save.seed,
    grid,
    aiPlayers: save.aiPlayers,
    ...(save.match && { matchPlayers: save.match.players }),
  });

  sim.world.entities.restore(save.entityManager);
  for (const block of save.components) {
    const type = COMPONENT_BY_NAME.get(block.name);
    if (!type) throw new Error(`loadSimulation: unknown component '${block.name}'`);
    // Deep-clone so the loaded simulation owns its component data (the save object may
    // still reference the original world's live objects when no JSON step intervened).
    for (const [id, data] of block.entries) {
      sim.world.add(id as EntityId, type, structuredClone(data));
    }
  }
  sim.economy.restore(save.economy);
  if (save.tech) sim.tech.restore(save.tech);
  sim.rng.setState(save.rngState);
  sim.setTick(save.tick);
  if (save.match && sim.match) sim.match.restore(save.match.state);
  return sim;
}

/** Convenience: serialize to a JSON string. */
export const serializeSave = (save: SaveState): string => JSON.stringify(save);
export const deserializeSave = (raw: string): SaveState => JSON.parse(raw) as SaveState;
