import type { PlayerId } from '@iron/shared';
import { Building, Owner } from '../../domain/components/index.js';
import type { World } from '../ecs/world.js';
import type { System } from '../ecs/system.js';

export type MatchStatus = 'setup' | 'playing' | 'finished';

export interface MatchStateSnapshot {
  status: MatchStatus;
  winner: PlayerId | null;
}

/**
 * Deterministic elimination rules for a configured set of players. A match becomes
 * active only after every player has owned an objective building, preventing setup
 * commands from causing an immediate defeat.
 */
export class MatchState {
  readonly players: readonly PlayerId[];
  private status: MatchStatus = 'setup';
  private winner: PlayerId | null = null;

  constructor(players: readonly PlayerId[]) {
    const unique = [...new Set(players)].sort((a, b) => a - b);
    if (unique.length < 2) throw new Error('MatchState requires at least two players');
    this.players = unique;
  }

  get isFinished(): boolean {
    return this.status === 'finished';
  }

  snapshot(): MatchStateSnapshot {
    return { status: this.status, winner: this.winner };
  }

  restore(state: MatchStateSnapshot): void {
    this.status = state.status;
    this.winner = state.winner;
  }

  update(world: World): void {
    if (this.isFinished) return;
    const alive = this.players.filter((player) => hasObjective(world, player));

    if (this.status === 'setup') {
      if (alive.length === this.players.length) this.status = 'playing';
      return;
    }

    if (alive.length > 1) return;
    this.status = 'finished';
    this.winner = alive[0] ?? null;
  }
}

export function createMatchSystem(match: MatchState): System {
  return {
    name: 'MatchSystem',
    update(world: World): void {
      match.update(world);
    },
  };
}

function hasObjective(world: World, player: PlayerId): boolean {
  for (const entity of world.query(Building, Owner)) {
    const building = world.get(entity, Building)!;
    const owner = world.get(entity, Owner)!;
    if (owner.player === player && building.kind === 'construction_yard') return true;
  }
  return false;
}
