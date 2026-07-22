import { describe, it, expect } from 'vitest';
import { LockstepCoordinator } from './lockstep.js';
import { asTick } from './types.js';

const empty = () => [];

describe('LockstepCoordinator', () => {
  it('drains contiguous ticks in order', () => {
    const c = new LockstepCoordinator(0);
    c.receive(asTick(0), empty());
    c.receive(asTick(1), empty());
    c.receive(asTick(2), empty());
    const drained = c.drainReady().map((t) => t.tick);
    expect(drained).toEqual([0, 1, 2]);
    expect(c.expected).toBe(3);
  });

  it('stops at a gap and resumes when filled', () => {
    const c = new LockstepCoordinator(0);
    c.receive(asTick(0), empty());
    c.receive(asTick(2), empty()); // gap at 1
    expect(c.drainReady().map((t) => t.tick)).toEqual([0]);
    expect(c.ready).toBe(false);
    expect(c.buffered).toBe(1); // tick 2 waiting

    c.receive(asTick(1), empty());
    expect(c.drainReady().map((t) => t.tick)).toEqual([1, 2]);
    expect(c.expected).toBe(3);
  });

  it('ignores ticks already executed', () => {
    const c = new LockstepCoordinator(5);
    c.receive(asTick(3), empty()); // stale
    c.receive(asTick(5), empty());
    expect(c.drainReady().map((t) => t.tick)).toEqual([5]);
  });

  it('carries command payloads through', () => {
    const c = new LockstepCoordinator(0);
    c.receive(asTick(0), [{ player: 1 as never, cmd: { type: 'move' } }]);
    const [first] = c.drainReady();
    expect(first!.commands[0]!.cmd.type).toBe('move');
  });
});
