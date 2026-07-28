import type { EntityId } from '@iron/shared';

export interface PlayerMatchMetrics {
  damageDealt: number;
  damageTaken: number;
  unitsLost: number;
  structuresLost: number;
  unitsDestroyed: number;
  structuresDestroyed: number;
  oreDelivered: number;
  destroyedByType: Record<string, number>;
}

export interface MatchMetricsSnapshot extends PlayerMatchMetrics {
  durationTicks: number;
  firstStrike: boolean;
  exploredPercent: number;
}

export interface MatchMetricsState {
  firstStrikePlayer: number | null;
  players: Array<[number, PlayerMatchMetrics]>;
  lastAttacker: Array<[number, number]>;
  exploredPercent: Array<[number, number]>;
}

const emptyPlayerMetrics = (): PlayerMatchMetrics => ({
  damageDealt: 0,
  damageTaken: 0,
  unitsLost: 0,
  structuresLost: 0,
  unitsDestroyed: 0,
  structuresDestroyed: 0,
  oreDelivered: 0,
  destroyedByType: {},
});

export class MatchMetrics {
  private firstStrikePlayer: number | null = null;
  private readonly players = new Map<number, PlayerMatchMetrics>();
  private readonly lastAttacker = new Map<number, number>();
  private readonly exploredPercent = new Map<number, number>();

  recordDamage(attacker: number, targetOwner: number, target: EntityId, damage: number): void {
    if (attacker === targetOwner || damage <= 0) return;
    if (this.firstStrikePlayer === null) this.firstStrikePlayer = attacker;
    this.player(attacker).damageDealt += damage;
    this.player(targetOwner).damageTaken += damage;
    this.lastAttacker.set(target, attacker);
  }

  recordOreDelivered(player: number, amount: number): void {
    if (amount > 0) this.player(player).oreDelivered += amount;
  }

  recordExplored(player: number, percent: number): void {
    this.exploredPercent.set(
      player,
      Math.max(this.exploredPercent.get(player) ?? 0, Math.min(100, Math.max(0, percent))),
    );
  }

  recordDestroyed(
    entity: EntityId,
    owner: number,
    kind: 'unit' | 'building',
    type: string,
  ): void {
    const ownerMetrics = this.player(owner);
    if (kind === 'unit') ownerMetrics.unitsLost++;
    else ownerMetrics.structuresLost++;

    const attacker = this.lastAttacker.get(entity);
    this.lastAttacker.delete(entity);
    if (attacker === undefined || attacker === owner) return;
    const attackerMetrics = this.player(attacker);
    if (kind === 'unit') attackerMetrics.unitsDestroyed++;
    else attackerMetrics.structuresDestroyed++;
    attackerMetrics.destroyedByType[type] = (attackerMetrics.destroyedByType[type] ?? 0) + 1;
  }

  snapshot(player: number, durationTicks: number): MatchMetricsSnapshot {
    return {
      ...structuredClone(this.player(player)),
      durationTicks,
      firstStrike: this.firstStrikePlayer === player,
      exploredPercent: this.exploredPercent.get(player) ?? 0,
    };
  }

  serialize(): MatchMetricsState {
    return {
      firstStrikePlayer: this.firstStrikePlayer,
      players: [...this.players].map(([player, metrics]) => [player, structuredClone(metrics)]),
      lastAttacker: [...this.lastAttacker],
      exploredPercent: [...this.exploredPercent],
    };
  }

  restore(state: MatchMetricsState): void {
    this.firstStrikePlayer = state.firstStrikePlayer;
    this.players.clear();
    for (const [player, metrics] of state.players) this.players.set(player, structuredClone(metrics));
    this.lastAttacker.clear();
    for (const [entity, player] of state.lastAttacker) this.lastAttacker.set(entity, player);
    this.exploredPercent.clear();
    for (const [player, percent] of state.exploredPercent ?? []) {
      this.exploredPercent.set(player, percent);
    }
  }

  private player(player: number): PlayerMatchMetrics {
    let metrics = this.players.get(player);
    if (!metrics) {
      metrics = emptyPlayerMetrics();
      this.players.set(player, metrics);
    }
    return metrics;
  }
}
