/**
 * Integration check for the lockstep relay + client-side coordinator.
 * Mirrors the real online flow: two clients join, both send their own initial spawn
 * commands (tagged execTick = startTick + inputDelay), then the host advances. We
 * assert both peers derive an IDENTICAL, contiguous command stream — any asymmetry
 * here is the source of "two separate games" / one-winner-one-stuck.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MatchRelay } from '../match.js';
import {
  LockstepCoordinator,
  DEFAULT_INPUT_DELAY,
  asPlayerId,
  asTick,
  type PlayerId,
  type WireCommand,
} from '@iron/shared';

interface SimClient {
  id: PlayerId;
  coord: LockstepCoordinator;
  log: string[];
}

describe('lockstep coordination end-to-end', () => {
  let relay: MatchRelay;
  let clients: SimClient[];
  let hostTimer: ReturnType<typeof setInterval>;

  beforeAll(() => {
    relay = new MatchRelay(1234, 'canyon_clash');

    // Client 0 joins first (player slot 0), client 1 joins second (slot 1).
    const mk = (): SimClient => ({ id: asPlayerId(-1), coord: new LockstepCoordinator(0), log: [] });
    const c0 = mk();
    const c1 = mk();
    clients = [c0, c1];

    // Simulate the server 'join' -> 'welcome' -> 'start' handshake.
    c0.id = relay.addPlayer('p0', (payload) => {
      const msg = JSON.parse(payload) as { t: string; tick?: number; commands?: unknown[] };
      if (msg.t === 'tick') c0.log.push(msg.tick!.toString());
      c0.coord.receive(asTick(msg.tick!), (msg.commands ?? []) as never[]);
    }).id;
    c1.id = relay.addPlayer('p1', (payload) => {
      const msg = JSON.parse(payload) as { t: string; tick?: number; commands?: unknown[] };
      if (msg.t === 'tick') c1.log.push(msg.tick!.toString());
      c1.coord.receive(asTick(msg.tick!), (msg.commands ?? []) as never[]);
    }).id;

    relay.start();

    // Both clients receive start:startTick == relay.nextTick == 0.
    const startTick = relay.nextTick;

    // Simulate each client sending its OWN initial spawn commands at execTick =
    // its currentTick + input delay, exactly as NetworkClient.sendCommand does.
    const execTick = asTick(startTick + DEFAULT_INPUT_DELAY);
    relay.enqueue(c0.id, execTick, { type: 'spawnResource', amount: 8000, at: { x: 24, y: 20 } });
    relay.enqueue(c0.id, execTick, { type: 'spawnBuilding', building: 'construction_yard', player: 0, at: { x: 16, y: 16 } });
    relay.enqueue(c1.id, execTick, { type: 'spawnResource', amount: 8000, at: { x: 24, y: 20 } });
    relay.enqueue(c1.id, execTick, { type: 'spawnBuilding', building: 'construction_yard', player: 1, at: { x: 79, y: 79 } });

    // Drive the host loop for enough ticks that the commands execute.
    hostTimer = setInterval(() => {
      if (relay.isRunning) relay.advance();
    }, 1);
  });

  afterAll(() => clearInterval(hostTimer));

  it('both peers receive exactly the same contiguous command stream', async () => {
    // Wait (async, so the relay's setInterval can fire) past the spawn tick.
    for (let i = 0; i < 200 && clients[0]!.coord.buffered < DEFAULT_INPUT_DELAY + 8; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }

    // Drain all contiguous ready ticks from both clients.
    const streams = clients.map((c) => {
      const seen: { tick: number; commands: readonly unknown[] }[] = [];
      let drained;
      while ((drained = c.coord.drainReady()).length > 0) {
        for (const t of drained) seen.push({ tick: t.tick, commands: t.commands });
      }
      return seen;
    });

    const max = Math.min(streams[0]!.length, streams[1]!.length);
    for (let i = 0; i < max; i++) {
      expect(streams[0]![i]!.tick).toBe(streams[1]![i]!.tick);
      expect(JSON.stringify(streams[0]![i]!.commands)).toBe(
        JSON.stringify(streams[1]![i]!.commands),
      );
    }

    // And the initial spawn commands must actually appear (not be dropped).
    expect(JSON.stringify(streams[0])).toContain('construction_yard');
  });

  it('clamps a stale execTick to the next tick instead of dropping the setup', () => {
    const relay2 = new MatchRelay(99, 'canyon_clash');
    const broadcasts: string[] = [];
    const p0 = relay2.addPlayer('p0', (payload) => broadcasts.push(payload));
    relay2.start();
    for (let i = 0; i < 30; i++) relay2.advance(); // server is long past startTick

    // A slow client sends its base at execTick = 0 + delay = 4, long dispatched.
    const cmd: WireCommand = {
      type: 'spawnBuilding',
      building: 'construction_yard',
      player: 0,
      at: { x: 16, y: 16 },
    };
    relay2.enqueue(p0.id, asTick(0 + DEFAULT_INPUT_DELAY), cmd);

    const before = broadcasts.length;
    relay2.advance();
    const next = broadcasts.slice(before).join('');
    expect(next).toContain('construction_yard'); // not silently lost anymore
  });

  it('realigns the LockstepCoordinator to a non-zero server startTick', () => {
    const c = new LockstepCoordinator(0);
    // 'start' (late-join, startTick=500) arrives first, then ticks from 500 on.
    c.reset(500); // NetworkClient.handle('start') now does this
    c.receive(asTick(500), []);
    c.receive(asTick(501), []);
    expect(c.drainReady().map((t) => t.tick)).toEqual([500, 501]);

    // Without reset(500), a coordinator at expected 0 would deadlock behind the gap.
    const stale = new LockstepCoordinator(0);
    stale.receive(asTick(500), []);
    expect(stale.drainReady()).toEqual([]);
  });
});
