/**
 * Simulation Web Worker entrypoint. Runs the deterministic engine off the main
 * thread on a fixed-step accumulator loop, applying commands and posting one snapshot
 * per tick. The main thread only renders — it never touches simulation state.
 */
/// <reference lib="webworker" />
import type { Simulation } from '@iron/engine';
import { SIM_DT_MS, MAX_CATCHUP_TICKS } from '@iron/shared';
import { createSimulationFromInit } from './infra/worker/createSimulation.js';
import {
  derivePresentationEvents,
  type PresentationEventEnvelope,
} from './infra/worker/PresentationEvents.js';
import type { FromWorker, ToWorker } from './infra/worker/protocol.js';

const HASH_REPORT_INTERVAL_TICKS = 20;

let sim: Simulation | null = null;
let viewTeam = 0;
let running = false;
let last = 0;
let accumulator = 0;
let rafHandle: ReturnType<typeof setTimeout> | null = null;
let lastSnapshot: ReturnType<Simulation['snapshot']> | null = null;
let nextPresentationSequence = 0;

const post = (msg: FromWorker): void => self.postMessage(msg);

/** Advance the simulation by exactly one tick, deriving presentation events from the diff. */
function stepOnce(events: PresentationEventEnvelope[]): void {
  if (!sim) return;
  sim.step();
  const snapshot = sim.snapshot(viewTeam);
  if (lastSnapshot) {
    const derived = derivePresentationEvents(lastSnapshot, snapshot, nextPresentationSequence);
    events.push(...derived.events);
    nextPresentationSequence = derived.nextSequence;
  }
  lastSnapshot = snapshot;
  if (sim.match?.isFinished) running = false;
}

/** Fixed-step loop with catch-up cap to prevent the spiral of death. */
function loop(now: number): void {
  if (!sim) return;
  const delta = last === 0 ? 0 : now - last;
  last = now;
  accumulator += delta;

  let steps = 0;
  const events: PresentationEventEnvelope[] = [];
  while (accumulator >= SIM_DT_MS && steps < MAX_CATCHUP_TICKS) {
    stepOnce(events);
    accumulator -= SIM_DT_MS;
    steps++;
  }
  if (steps > 0 && lastSnapshot) post({ t: 'snapshot', snapshot: lastSnapshot, events });

  if (running) rafHandle = setTimeout(() => loop(performance.now()), SIM_DT_MS / 2);
}

self.onmessage = (ev: MessageEvent<ToWorker>): void => {
  const msg = ev.data;
  switch (msg.t) {
    case 'init': {
      sim = createSimulationFromInit(msg.config);
      viewTeam = msg.config.viewTeam ?? 0;
      lastSnapshot = sim.snapshot(viewTeam);
      nextPresentationSequence = 0;
      post({ t: 'ready' });
      post({ t: 'snapshot', snapshot: lastSnapshot, events: [] });
      break;
    }
    case 'start':
      if (!running && sim) {
        running = true;
        last = 0;
        loop(performance.now());
      }
      break;
    case 'pause':
      running = false;
      if (rafHandle) clearTimeout(rafHandle);
      break;
    case 'command':
      sim?.enqueue(msg.cmd);
      break;
    case 'networkTick': {
      if (!sim) break;
      for (const cmd of msg.commands) sim.enqueue(cmd);
      const events: PresentationEventEnvelope[] = [];
      stepOnce(events);
      if (lastSnapshot) post({ t: 'snapshot', snapshot: lastSnapshot, events });
      // Every ~1s (at 20Hz): lets the server catch the two peers' sims diverging.
      if (sim.tick % HASH_REPORT_INTERVAL_TICKS === 0) {
        post({ t: 'hash', tick: sim.tick, hash: sim.hash() });
      }
      break;
    }
  }
};
