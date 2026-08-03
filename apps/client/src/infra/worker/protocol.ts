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
  | { t: 'command'; cmd: Command };

export type FromWorker =
  | { t: 'ready' }
  | {
      t: 'snapshot';
      snapshot: Snapshot;
      events: PresentationEventEnvelope[];
    };
