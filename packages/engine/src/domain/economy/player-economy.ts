/**
 * Per-player economic state. Kept outside the ECS (it is per-player, not per-entity)
 * but still part of the deterministic simulation: all mutations happen inside systems
 * during the tick, and the values are serialized in savegames.
 */
export interface PowerBalance {
  produced: number;
  consumed: number;
}

export interface PlayerResources {
  credits: number;
  ore: number;
  rare: number;
  power: PowerBalance;
}

const initial = (): PlayerResources => ({
  credits: 0,
  ore: 0,
  rare: 0,
  power: { produced: 0, consumed: 0 },
});

export class PlayerEconomy {
  private readonly players = new Map<number, PlayerResources>();

  ensure(player: number): PlayerResources {
    let r = this.players.get(player);
    if (!r) {
      r = initial();
      this.players.set(player, r);
    }
    return r;
  }

  get(player: number): PlayerResources {
    return this.ensure(player);
  }

  credits(player: number): number {
    return this.ensure(player).credits;
  }

  addCredits(player: number, amount: number): void {
    this.ensure(player).credits += amount;
  }

  /** Try to spend; returns false (and spends nothing) if insufficient. */
  spend(player: number, amount: number): boolean {
    const r = this.ensure(player);
    if (r.credits < amount) return false;
    r.credits -= amount;
    return true;
  }

  /** Players seen so far, ascending — deterministic iteration. */
  playerIds(): number[] {
    return [...this.players.keys()].sort((a, b) => a - b);
  }

  serialize(): Array<[number, PlayerResources]> {
    return this.playerIds().map((p) => [p, structuredCloneResources(this.ensure(p))]);
  }

  restore(entries: Array<[number, PlayerResources]>): void {
    this.players.clear();
    for (const [p, r] of entries) this.players.set(p, structuredCloneResources(r));
  }
}

function structuredCloneResources(r: PlayerResources): PlayerResources {
  return {
    credits: r.credits,
    ore: r.ore,
    rare: r.rare,
    power: { produced: r.power.produced, consumed: r.power.consumed },
  };
}
