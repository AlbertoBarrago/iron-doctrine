/** Message protocol between the main thread and the simulation Web Worker. */
import type { Command, Snapshot, AIPlayerConfig } from '@iron/engine';

export interface InitConfig {
  seed: number;
  aiPlayers?: AIPlayerConfig[];
  startingCredits?: Record<number, number>;
}

export type ToWorker =
  | { t: 'init'; config: InitConfig }
  | { t: 'start' }
  | { t: 'pause' }
  | { t: 'command'; cmd: Command };

export type FromWorker =
  | { t: 'ready' }
  | { t: 'snapshot'; snapshot: Snapshot };
