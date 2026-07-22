/**
 * Command definitions and bus. Commands are the ONLY write-path into the simulation
 * from the outside world (player input, AI, network, replay). They are serializable
 * and scheduled to a specific tick so every peer applies them at the same instant.
 */
import type { EntityId } from '@iron/shared';
import type { Fixed } from '../../domain/math/fixed.js';

export interface MoveCommand {
  type: 'move';
  entities: EntityId[];
  target: { x: Fixed; y: Fixed };
}

export interface StopCommand {
  type: 'stop';
  entities: EntityId[];
}

export interface AttackCommand {
  type: 'attack';
  entities: EntityId[];
  target: EntityId;
}

export interface SpawnUnitCommand {
  type: 'spawnUnit';
  unit: string;
  player: number;
  at: { x: Fixed; y: Fixed };
}

export interface SpawnBuildingCommand {
  type: 'spawnBuilding';
  building: string;
  player: number;
  at: { x: Fixed; y: Fixed };
}

export interface SpawnResourceCommand {
  type: 'spawnResource';
  amount: number;
  at: { x: Fixed; y: Fixed };
}

export interface GatherCommand {
  type: 'gather';
  entities: EntityId[];
}

export interface QueueProductionCommand {
  type: 'queueProduction';
  building: EntityId;
  unit: string;
}

export interface CancelProductionCommand {
  type: 'cancelProduction';
  building: EntityId;
}

export interface SetRallyCommand {
  type: 'setRally';
  building: EntityId;
  point: { x: Fixed; y: Fixed };
}

export interface ResearchCommand {
  type: 'research';
  player: number;
  tech: string;
}

export type Command =
  | MoveCommand
  | StopCommand
  | AttackCommand
  | SpawnUnitCommand
  | SpawnBuildingCommand
  | SpawnResourceCommand
  | GatherCommand
  | QueueProductionCommand
  | CancelProductionCommand
  | SetRallyCommand
  | ResearchCommand;

/**
 * Buffers commands to be applied on the next tick. The Simulation drains it via the
 * CommandSystem at the start of each tick, guaranteeing a deterministic apply order.
 */
export class CommandBus {
  private pending: Command[] = [];

  push(cmd: Command): void {
    this.pending.push(cmd);
  }

  /** Returns and clears all buffered commands. */
  drain(): Command[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  get size(): number {
    return this.pending.length;
  }
}
