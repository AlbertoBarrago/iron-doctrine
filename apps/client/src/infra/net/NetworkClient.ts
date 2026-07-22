/**
 * Networked lockstep client. Bridges a {@link Transport} to the simulation:
 *  - handshakes (join) and learns its playerId + match seed;
 *  - sends local commands tagged with an execution tick (current + input delay);
 *  - feeds server-confirmed ticks through the {@link LockstepCoordinator} so the sim
 *    executes exactly the agreed command stream, in order.
 *
 * This is the multiplayer entry point; single-player runs the sim directly without it.
 * The class is transport-agnostic and therefore testable with a mock Transport.
 */
import {
  LockstepCoordinator,
  DEFAULT_INPUT_DELAY,
  PROTOCOL_VERSION,
  asTick,
  type ServerMessage,
  type WireCommand,
  type Tick,
} from '@iron/shared';
import type { Transport } from './Transport.js';

export interface NetworkClientEvents {
  onWelcome: (playerId: number, seed: number, mapId: string) => void;
  onStart: (startTick: number) => void;
  /** Called for each confirmed tick, in strict order, ready to simulate. */
  onTick: (tick: number, commands: Array<{ player: number; cmd: WireCommand }>) => void;
  onDesync?: (tick: number) => void;
}

export class NetworkClient {
  private readonly coord = new LockstepCoordinator(0);
  private currentTick = 0;
  private playerId = -1;

  constructor(
    private readonly transport: Transport,
    private readonly events: NetworkClientEvents,
    private readonly inputDelay = DEFAULT_INPUT_DELAY,
  ) {
    this.transport.onMessage((msg) => this.handle(msg));
  }

  join(name: string): void {
    this.transport.send({ t: 'join', v: PROTOCOL_VERSION, name });
  }

  get localPlayer(): number {
    return this.playerId;
  }

  /** Queue a local command; it will execute `inputDelay` ticks in the future. */
  sendCommand(cmd: WireCommand): void {
    const execTick = asTick(this.currentTick + this.inputDelay);
    this.transport.send({ t: 'command', execTick, cmd });
  }

  private handle(msg: ServerMessage): void {
    switch (msg.t) {
      case 'welcome':
        this.playerId = msg.playerId;
        this.events.onWelcome(msg.playerId, msg.seed, msg.mapId);
        break;
      case 'start':
        this.currentTick = msg.startTick;
        this.events.onStart(msg.startTick);
        break;
      case 'tick':
        this.coord.receive(msg.tick, msg.commands);
        for (const confirmed of this.coord.drainReady()) {
          this.currentTick = confirmed.tick;
          this.events.onTick(confirmed.tick, confirmed.commands);
        }
        break;
      case 'desync':
        this.events.onDesync?.(msg.tick);
        break;
    }
  }

  /** Report a periodic state hash for server-side desync detection. */
  reportHash(tick: number, hash: number): void {
    this.transport.send({ t: 'stateHash', tick: tick as Tick, hash });
  }
}
