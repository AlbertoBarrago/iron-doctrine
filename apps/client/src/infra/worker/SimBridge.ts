/**
 * Main-thread handle to the simulation worker. Owns the Worker instance, forwards
 * commands, and surfaces the latest two snapshots so the renderer can interpolate.
 */
import type { Command, Snapshot } from '@iron/engine';
import type { ToWorker, FromWorker, InitConfig } from './protocol.js';

export type SnapshotListener = (prev: Snapshot, curr: Snapshot, receivedAt: number) => void;

export class SimBridge {
  private readonly worker: Worker;
  private prev: Snapshot | null = null;
  private curr: Snapshot | null = null;
  private lastSnapshotAt = 0;
  private listener: SnapshotListener | null = null;

  constructor() {
    this.worker = new Worker(new URL('../../sim.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.onMessage(ev.data);
  }

  private onMessage(msg: FromWorker): void {
    if (msg.t === 'snapshot') {
      this.prev = this.curr ?? msg.snapshot;
      this.curr = msg.snapshot;
      this.lastSnapshotAt = performance.now();
      if (this.listener && this.prev && this.curr) {
        this.listener(this.prev, this.curr, this.lastSnapshotAt);
      }
    }
  }

  private send(msg: ToWorker): void {
    this.worker.postMessage(msg);
  }

  init(config: InitConfig): void {
    this.send({ t: 'init', config });
  }

  start(): void {
    this.send({ t: 'start' });
  }

  pause(): void {
    this.send({ t: 'pause' });
  }

  command(cmd: Command): void {
    this.send({ t: 'command', cmd });
  }

  onSnapshot(listener: SnapshotListener): void {
    this.listener = listener;
  }

  get latest(): { prev: Snapshot | null; curr: Snapshot | null; at: number } {
    return { prev: this.prev, curr: this.curr, at: this.lastSnapshotAt };
  }

  dispose(): void {
    this.worker.terminate();
  }
}
