/** Message protocol between the main thread and the simulation Web Worker. */
import type { Command, Snapshot, AIPlayerConfig, FirstContactConfig } from '@iron/engine';
import type { MapDef } from '@iron/shared';

export interface InitConfig {
  seed: number;
  aiPlayers?: AIPlayerConfig[];
  startingCredits?: Record<number, number>;
  startingTech?: Record<number, string[]>;
  matchPlayers?: number[];
  firstContact?: FirstContactConfig;
  map?: MapDef;
}

export type ToWorker =
  | { t: 'init'; config: InitConfig }
  | { t: 'start' }
  | { t: 'pause' }
  | { t: 'command'; cmd: Command };

export type FromWorker = { t: 'ready' } | { t: 'snapshot'; snapshot: Snapshot };
