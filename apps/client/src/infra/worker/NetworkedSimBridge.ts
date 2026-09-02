/**
 * Networked counterpart to {@link SimBridge}. Ticks are driven by server-confirmed
 * commands (via {@link NetworkClient}) instead of a local wall-clock loop, so every
 * peer applies the same commands on the same tick. Same public shape as SimBridge,
 * so GameRenderer can hold either without knowing which one it got.
 */
import type { Command } from '@iron/engine';
import type { WireCommand } from '@iron/shared';
import type { NetworkClient } from '../net/NetworkClient.js';
import { remapCommandPerspective, remapSnapshotPerspective } from './playerPerspective.js';
import type { SimBridgeLike } from './SimBridge.js';
import { SnapshotBuffer, type SnapshotListener } from './SnapshotBuffer.js';
import type { FromWorker, InitConfig, ToWorker } from './protocol.js';

export class NetworkedSimBridge implements SimBridgeLike {
  private readonly worker: Worker;
  private readonly snapshots = new SnapshotBuffer();
  /**
   * The worker only accepts `networkTick` after it has processed `init` (its `sim`
   * is null before that). The server starts dispatching ticks the moment the match
   * begins, which can race the async Pixi init + asset load in GameRenderer.start().
   * Ticks that reach the coordinator before the worker is ready are buffered here and
   * flushed once the worker posts `ready` — otherwise they'd be sent to a null sim and
   * silently dropped, leaving this peer permanently behind and desynced.
   */
  private workerReady = false;
  private readonly pendingTicks: Command[][] = [];

  /**
   * @param localPlayerId Server-assigned player id for this client. Every hardcoded
   * "owner === 0 is me" assumption elsewhere in the client stays valid because we
   * remap the 0/1 labels right here, at the network boundary. See playerPerspective.ts.
   */
  constructor(
    private readonly client: NetworkClient,
    private readonly localPlayerId: number,
  ) {
    this.worker = new Worker(new URL('../../sim.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.onMessage(ev.data);
    this.client.setOnTick((_tick, commands) => {
      const cmds = commands.map((confirmed) => confirmed.cmd as unknown as Command);
      if (this.workerReady) {
        this.send({ t: 'networkTick', commands: cmds });
      } else {
        this.pendingTicks.push(cmds);
      }
    });
  }

  private onMessage(msg: FromWorker): void {
    if (msg.t === 'ready') {
      this.workerReady = true;
      for (const cmds of this.pendingTicks.splice(0)) {
        this.send({ t: 'networkTick', commands: cmds });
      }
    } else if (msg.t === 'snapshot') {
      this.snapshots.ingest(remapSnapshotPerspective(msg.snapshot, this.localPlayerId), msg.events);
    } else if (msg.t === 'hash') {
      this.client.reportHash(msg.tick, msg.hash);
    }
  }

  private send(msg: ToWorker): void {
    this.worker.postMessage(msg);
  }

  init(config: InitConfig): void {
    this.snapshots.reset();
    this.send({ t: 'init', config: { ...config, viewTeam: this.localPlayerId } });
  }

  /** No-op: the local wall-clock loop never runs, ticks arrive from the network. */
  start(): void {}

  /** No-op: pausing an online match isn't supported yet. */
  pause(): void {}

  command(cmd: Command): void {
    const remapped = remapCommandPerspective(cmd, this.localPlayerId);
    this.client.sendCommand(remapped as unknown as WireCommand);
  }

  onSnapshot(listener: SnapshotListener): void {
    this.snapshots.onSnapshot(listener);
  }

  get latest(): SnapshotBuffer['latest'] {
    return this.snapshots.latest;
  }

  drainPresentationEvents(): ReturnType<SnapshotBuffer['drainPresentationEvents']> {
    return this.snapshots.drainPresentationEvents();
  }

  dispose(): void {
    this.worker.terminate();
  }
}
