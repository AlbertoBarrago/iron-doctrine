/** Message protocol between the main thread and the simulation Web Worker. */
import type {
  AIPlayerConfig,
  BlackDawnConfig,
  Command,
  FirstContactConfig,
  IronPassConfig,
  SiegeLineConfig,
  SilentExtractionConfig,
  Snapshot,
} from '@iron/engine';
import type { MapDef } from '@iron/shared';
import type { PresentationEventEnvelope } from './PresentationEvents.js';

export interface InitConfig {
  seed: number;
  /** Fog-of-war perspective for snapshots (defaults to 0, the local-skirmish human). */
  viewTeam?: number;
  aiPlayers?: AIPlayerConfig[];
  startingCredits?: Record<number, number>;
  startingTech?: Record<number, string[]>;
  matchPlayers?: number[];
  firstContact?: FirstContactConfig;
  ironPass?: IronPassConfig;
  siegeLine?: SiegeLineConfig;
  blackDawn?: BlackDawnConfig;
  silentExtraction?: SilentExtractionConfig;
  map?: MapDef;
}

export type ToWorker =
  | { t: 'init'; config: InitConfig }
  | { t: 'start' }
  | { t: 'pause' }
  | { t: 'command'; cmd: Command }
  /** Online mode: apply this tick's server-confirmed commands, then advance exactly one tick. */
  | { t: 'networkTick'; commands: Command[] };

export type FromWorker =
  | { t: 'ready' }
  | {
      t: 'snapshot';
      snapshot: Snapshot;
      events: PresentationEventEnvelope[];
    }
  /** Online only: periodic state hash so the server can catch the two sims diverging. */
  | { t: 'hash'; tick: number; hash: number };
