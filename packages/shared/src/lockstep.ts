/**
 * Pure lockstep coordination logic (transport-agnostic, fully unit-testable).
 *
 * In the authoritative-relay model the server is the clock: it emits one confirmed
 * command set per tick. The client executes exactly those ticks, in order. This buffer
 * absorbs out-of-order / batched arrivals and yields contiguous ticks ready to run,
 * so the simulation never skips or reorders a tick (which would break determinism).
 */
import type { Tick, PlayerId } from './types.js';
import type { WireCommand } from './protocol.js';

export interface ConfirmedTick {
  tick: Tick;
  commands: Array<{ player: PlayerId; cmd: WireCommand }>;
}

export class LockstepCoordinator {
  private readonly pending = new Map<number, ConfirmedTick['commands']>();
  private nextTick: number;

  constructor(startTick = 0) {
    this.nextTick = startTick;
  }

  /** Buffer a confirmed tick from the server (idempotent; past ticks ignored). */
  receive(tick: Tick, commands: ConfirmedTick['commands']): void {
    if (tick < this.nextTick) return;
    this.pending.set(tick, commands);
  }

  /** The next tick the simulation is waiting on. */
  get expected(): number {
    return this.nextTick;
  }

  /** Whether the next contiguous tick is available to execute. */
  get ready(): boolean {
    return this.pending.has(this.nextTick);
  }

  /**
   * Pull all contiguous confirmed ticks starting at {@link expected}, advancing the
   * cursor. Returns them in strict ascending order; stops at the first gap.
   */
  drainReady(): ConfirmedTick[] {
    const out: ConfirmedTick[] = [];
    while (this.pending.has(this.nextTick)) {
      const commands = this.pending.get(this.nextTick)!;
      this.pending.delete(this.nextTick);
      out.push({ tick: this.nextTick as Tick, commands });
      this.nextTick++;
    }
    return out;
  }

  /** Number of buffered future ticks (ahead of a gap). */
  get buffered(): number {
    return this.pending.size;
  }
}
