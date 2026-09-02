/**
 * Authoritative-ready lockstep match relay.
 *
 * The server does not simulate gameplay in v1 — it assigns each incoming command
 * to an execution tick, then broadcasts the confirmed command set for every tick at
 * a fixed cadence. Because clients run a deterministic simulation, relaying intents
 * is sufficient to keep every peer in sync. A headless engine sim can later be added
 * here for validation/anti-cheat without changing this contract.
 */
import { asPlayerId, asTick, type PlayerId, type Tick, type WireCommand } from '@iron/shared';

export interface MatchPlayer {
  readonly id: PlayerId;
  name: string;
  send(msg: string): void;
}

interface PendingCommand {
  player: PlayerId;
  cmd: WireCommand;
}

/** Ticks of state-hash history retained for desync comparison before being pruned. */
const HASH_HISTORY_TICKS = 300;

export class MatchRelay {
  private readonly players = new Map<PlayerId, MatchPlayer>();
  private readonly queued = new Map<number, PendingCommand[]>();
  /** First-seen hash per tick, used as the reference to detect divergence. */
  private readonly hashes = new Map<number, number>();
  // Starts one below the first dispatched tick (0) so advance()'s pre-increment
  // yields 0 on the first call instead of skipping straight to 1.
  private currentTick = -1;
  private running = false;

  constructor(
    readonly seed: number,
    readonly mapId: string,
  ) {}

  /**
   * Assigns the lowest free slot (0, 1, ...), not a monotonically increasing counter —
   * every 1v1 map only authors spawns for players 0 and 1, so a long-lived server
   * process (many connects/disconnects) must reuse freed slots instead of handing out
   * ever-larger ids that no map has a spawn for.
   */
  addPlayer(name: string, send: (msg: string) => void): MatchPlayer {
    let candidate = 0;
    while (this.players.has(asPlayerId(candidate))) candidate++;
    const id = asPlayerId(candidate);
    const player: MatchPlayer = { id, name, send };
    this.players.set(id, player);
    return player;
  }

  removePlayer(id: PlayerId): void {
    this.players.delete(id);
  }

  get playerCount(): number {
    return this.players.size;
  }

  /**
   * Queue a command for a future tick. If a command arrives with an `execTick` that
   * has already been dispatched (a client that was slow to spin up — initial spawn
   * commands, or any input queued during a hitch — schedules against a stale local
   * tick), it is *clamped* to the next undispatched tick instead of being silently
   * dropped. Silently dropping changes which side ends up owning the setup (e.g. a
   * whole base), making the two peers build genuinely different worlds — the
   * "separate games" symptom. The server serializes the corrected tick once and
   * broadcasts it uniformly, so the peers still agree on the exact command stream.
   */
  enqueue(player: PlayerId, execTick: Tick, cmd: WireCommand): void {
    const tick = asTick(execTick <= this.currentTick ? this.currentTick + 1 : execTick);
    const list = this.queued.get(tick) ?? [];
    list.push({ player, cmd });
    this.queued.set(tick, list);
  }

  start(): void {
    this.running = true;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** The next tick that will be dispatched by advance(). */
  get nextTick(): Tick {
    return asTick(this.currentTick + 1);
  }

  /**
   * Record a peer's reported state hash for a tick. The first hash seen for a tick
   * becomes the reference; a later, differing hash for the same tick indicates a
   * desync and its tick is returned (otherwise null). Old ticks are pruned so the
   * history doesn't grow unbounded over a long match.
   */
  reportHash(tick: Tick, hash: number): Tick | null {
    const key = tick as number;
    const known = this.hashes.get(key);
    if (known === undefined) {
      this.hashes.set(key, hash);
      this.pruneHashes();
      return null;
    }
    return known !== hash ? tick : null;
  }

  private pruneHashes(): void {
    const cutoff = this.currentTick - HASH_HISTORY_TICKS;
    for (const oldTick of this.hashes.keys()) {
      if (oldTick < cutoff) this.hashes.delete(oldTick);
    }
  }

  /**
   * Advance one tick: broadcast the confirmed command set. Called by the host loop
   * at SIM_HZ. Returns the tick that was dispatched.
   */
  advance(): Tick {
    this.currentTick++;
    const tick = asTick(this.currentTick);
    const commands = this.queued.get(this.currentTick) ?? [];
    this.queued.delete(this.currentTick);
    const payload = JSON.stringify({ t: 'tick', tick, commands });
    for (const p of this.players.values()) p.send(payload);
    return tick;
  }
}
