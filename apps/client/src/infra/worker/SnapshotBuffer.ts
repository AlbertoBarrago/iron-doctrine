/**
 * Buffers the last two worker snapshots plus derived presentation events. Shared by
 * every bridge flavor (local wall-clock, networked lockstep) so they only differ in
 * how they drive the worker, not in how they consume its output.
 */
import type { Snapshot } from '@iron/engine';
import { PresentationEventBuffer, type PresentationEventEnvelope } from './PresentationEvents.js';

export type SnapshotListener = (prev: Snapshot, curr: Snapshot, receivedAt: number) => void;

export class SnapshotBuffer {
  private prev: Snapshot | null = null;
  private curr: Snapshot | null = null;
  private lastSnapshotAt = 0;
  private listener: SnapshotListener | null = null;
  private readonly presentationEvents = new PresentationEventBuffer();

  reset(): void {
    this.presentationEvents.reset();
    this.prev = null;
    this.curr = null;
    this.lastSnapshotAt = 0;
  }

  onSnapshot(listener: SnapshotListener): void {
    this.listener = listener;
  }

  ingest(snapshot: Snapshot, events: PresentationEventEnvelope[]): void {
    this.presentationEvents.append(events);
    this.prev = this.curr ?? snapshot;
    this.curr = snapshot;
    this.lastSnapshotAt = performance.now();
    if (this.listener && this.prev && this.curr) {
      this.listener(this.prev, this.curr, this.lastSnapshotAt);
    }
  }

  get latest(): { prev: Snapshot | null; curr: Snapshot | null; at: number } {
    return { prev: this.prev, curr: this.curr, at: this.lastSnapshotAt };
  }

  drainPresentationEvents(): PresentationEventEnvelope[] {
    return this.presentationEvents.drain();
  }
}
