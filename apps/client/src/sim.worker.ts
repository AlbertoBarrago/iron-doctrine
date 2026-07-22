/**
 * Simulation Web Worker entrypoint. Runs the deterministic engine off the main
 * thread on a fixed-step accumulator loop, applying commands and posting one snapshot
 * per tick. The main thread only renders — it never touches simulation state.
 */
/// <reference lib="webworker" />
import { Simulation } from '@iron/engine';
import { SIM_DT_MS, MAX_CATCHUP_TICKS } from '@iron/shared';
import type { ToWorker, FromWorker } from './infra/worker/protocol.js';

let sim: Simulation | null = null;
let running = false;
let last = 0;
let accumulator = 0;
let rafHandle: ReturnType<typeof setTimeout> | null = null;

const post = (msg: FromWorker): void => self.postMessage(msg);

/** Fixed-step loop with catch-up cap to prevent the spiral of death. */
function loop(now: number): void {
  if (!sim) return;
  const delta = last === 0 ? 0 : now - last;
  last = now;
  accumulator += delta;

  let steps = 0;
  while (accumulator >= SIM_DT_MS && steps < MAX_CATCHUP_TICKS) {
    sim.step();
    accumulator -= SIM_DT_MS;
    steps++;
  }
  if (steps > 0) post({ t: 'snapshot', snapshot: sim.snapshot() });

  if (running) rafHandle = setTimeout(() => loop(performance.now()), SIM_DT_MS / 2);
}

self.onmessage = (ev: MessageEvent<ToWorker>): void => {
  const msg = ev.data;
  switch (msg.t) {
    case 'init': {
      const c = msg.config;
      sim = new Simulation({
        seed: c.seed,
        ...(c.aiPlayers ? { aiPlayers: c.aiPlayers } : {}),
        ...(c.startingCredits ? { startingCredits: c.startingCredits } : {}),
      });
      post({ t: 'ready' });
      post({ t: 'snapshot', snapshot: sim.snapshot() });
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
  }
};
