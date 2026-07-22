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

export class MatchRelay {
  private readonly players = new Map<PlayerId, MatchPlayer>();
  private readonly queued = new Map<number, PendingCommand[]>();
  private nextPlayerId = 0;
  private currentTick = 0;
  private running = false;

  constructor(
    readonly seed: number,
    readonly mapId: string,
  ) {}

  addPlayer(name: string, send: (msg: string) => void): MatchPlayer {
    const id = asPlayerId(this.nextPlayerId++);
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

  /** Queue a command for a future tick (ignores ticks already dispatched). */
  enqueue(player: PlayerId, execTick: Tick, cmd: WireCommand): void {
    if (execTick <= this.currentTick) return; // too late, would break determinism
    const list = this.queued.get(execTick) ?? [];
    list.push({ player, cmd });
    this.queued.set(execTick, list);
  }

  start(): void {
    this.running = true;
  }

  get isRunning(): boolean {
    return this.running;
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
