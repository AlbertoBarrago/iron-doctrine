/**
 * Main-thread handle to the simulation worker. Owns the Worker instance, forwards
 * commands, and surfaces the latest two snapshots so the renderer can interpolate.
 */
import type { Command } from '@iron/engine';
import type { PresentationEventEnvelope } from './PresentationEvents.js';
import { SnapshotBuffer, type SnapshotListener } from './SnapshotBuffer.js';
import type { FromWorker, InitConfig, ToWorker } from './protocol.js';

export type { SnapshotListener };

/** Shape shared by every bridge flavor (local wall-clock, networked lockstep). */
export interface SimBridgeLike {
  init(config: InitConfig): void;
  start(): void;
  pause(): void;
  command(cmd: Command): void;
  onSnapshot(listener: SnapshotListener): void;
  readonly latest: SnapshotBuffer['latest'];
  drainPresentationEvents(): PresentationEventEnvelope[];
  dispose(): void;
}

export class SimBridge implements SimBridgeLike {
  private readonly worker: Worker;
  private readonly snapshots = new SnapshotBuffer();

  constructor() {
    this.worker = new Worker(new URL('../../sim.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.onMessage(ev.data);
  }

  private onMessage(msg: FromWorker): void {
    if (msg.t === 'snapshot') this.snapshots.ingest(msg.snapshot, msg.events);
  }

  private send(msg: ToWorker): void {
    this.worker.postMessage(msg);
  }

  init(config: InitConfig): void {
    this.snapshots.reset();
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
