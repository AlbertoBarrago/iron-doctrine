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
import type { FirstContactConfig, FirstContactPhase } from '../scenario/first-contact.js';
import type { IronPassConfig, IronPassPhase } from '../scenario/iron-pass.js';
import type { SiegeLineConfig, SiegeLinePhase } from '../scenario/siege-line.js';
import type { BlackDawnConfig, BlackDawnPhase } from '../scenario/black-dawn.js';
import type {
  SilentExtractionConfig,
  SilentExtractionPhase,
} from '../scenario/silent-extraction.js';
import type { MatchMetricsState } from '../match/match-metrics.js';

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
  coverCells?: Array<[number, number]>;
  entityManager: EntityManagerState;
  components: ComponentBlock[];
  economy: Array<[number, PlayerResources]>;
  tech: Array<[number, string[]]>;
  match?: { players: number[]; state: MatchStateSnapshot };
  metrics?: MatchMetricsState;
  firstContact?: {
    config: FirstContactConfig;
    state: {
      phase: FirstContactPhase;
      elapsedTicks: number;
      hasDeployedPatrol: boolean;
      operationalAtTick: number | null;
    };
  };
  ironPass?: {
    config: IronPassConfig;
    state: { phase: IronPassPhase };
  };
  siegeLine?: {
    config: SiegeLineConfig;
    state: { phase: SiegeLinePhase; wavesDispatched: number };
  };
  blackDawn?: {
    config: BlackDawnConfig;
    state: { phase: BlackDawnPhase };
  };
  silentExtraction?: {
    config: SilentExtractionConfig;
    state: { phase: SilentExtractionPhase; prisonerEntity: number };
  };
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
    coverCells: sim.cover.serialize(),
    entityManager: sim.world.entities.serialize(),
    components,
    economy: sim.economy.serialize(),
    tech: sim.tech.serialize(),
    metrics: sim.metrics.serialize(),
    ...(sim.match && {
      match: { players: [...sim.match.players], state: sim.match.snapshot() },
    }),
    ...(sim.firstContact && {
      firstContact: {
        config: sim.firstContact.config,
        state: sim.firstContact.serialize(),
      },
    }),
    ...(sim.ironPass && {
      ironPass: {
        config: sim.ironPass.config,
        state: sim.ironPass.serialize(),
      },
    }),
    ...(sim.siegeLine && {
      siegeLine: {
        config: sim.siegeLine.config,
        state: sim.siegeLine.serialize(),
      },
    }),
    ...(sim.blackDawn && {
      blackDawn: {
        config: sim.blackDawn.config,
        state: sim.blackDawn.serialize(),
      },
    }),
    ...(sim.silentExtraction && {
      silentExtraction: {
        config: sim.silentExtraction.config,
        state: sim.silentExtraction.serialize(),
      },
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
    ...(save.coverCells ? { coverCells: save.coverCells } : {}),
    aiPlayers: save.aiPlayers,
    ...(save.match && { matchPlayers: save.match.players }),
    ...(save.firstContact && { firstContact: save.firstContact.config }),
    ...(save.ironPass && { ironPass: save.ironPass.config }),
    ...(save.siegeLine && { siegeLine: save.siegeLine.config }),
    ...(save.blackDawn && { blackDawn: save.blackDawn.config }),
    ...(save.silentExtraction && { silentExtraction: save.silentExtraction.config }),
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
  if (save.metrics) sim.metrics.restore(save.metrics);
  if (save.firstContact && sim.firstContact) sim.firstContact.restore(save.firstContact.state);
  if (save.ironPass && sim.ironPass) sim.ironPass.restore(save.ironPass.state);
  if (save.siegeLine && sim.siegeLine) sim.siegeLine.restore(save.siegeLine.state);
  if (save.blackDawn && sim.blackDawn) sim.blackDawn.restore(save.blackDawn.state);
  if (save.silentExtraction && sim.silentExtraction) {
    sim.silentExtraction.restore(save.silentExtraction.state);
  }
  return sim;
}

/** Convenience: serialize to a JSON string. */
export const serializeSave = (save: SaveState): string => JSON.stringify(save);
export const deserializeSave = (raw: string): SaveState => JSON.parse(raw) as SaveState;
