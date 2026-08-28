import { describe, expect, it } from 'vitest';
import { asPlayerId } from '@iron/shared';
import type { Command, Snapshot } from '@iron/engine';
import { remapCommandPerspective, remapSnapshotPerspective } from '../playerPerspective.js';

const baseSnapshot: Snapshot = {
  tick: 1,
  entities: [
    { id: 1, kind: 'unit', x: 0, y: 0, angle: 0, hp: 10, maxHp: 10, radius: 0.5, owner: 0 },
    { id: 2, kind: 'unit', x: 1, y: 1, angle: 0, hp: 10, maxHp: 10, radius: 0.5, owner: 1 },
  ],
  players: [
    { player: 0, credits: 100, powerProduced: 1, powerConsumed: 1 },
    { player: 1, credits: 200, powerProduced: 2, powerConsumed: 2 },
  ],
  match: { status: 'playing', winner: asPlayerId(1) },
};

describe('remapSnapshotPerspective', () => {
  it('leaves the snapshot untouched for player 0', () => {
    expect(remapSnapshotPerspective(baseSnapshot, 0)).toBe(baseSnapshot);
  });

  it('swaps owner, player and winner labels for player 1', () => {
    const remapped = remapSnapshotPerspective(baseSnapshot, 1);
    expect(remapped.entities.map((e) => e.owner)).toEqual([1, 0]);
    expect(remapped.players.map((p) => p.player)).toEqual([1, 0]);
    expect(remapped.match?.winner).toBe(0);
  });

  it('keeps a null winner null', () => {
    const remapped = remapSnapshotPerspective(
      { ...baseSnapshot, match: { status: 'playing', winner: null } },
      1,
    );
    expect(remapped.match?.winner).toBeNull();
  });
});

describe('remapCommandPerspective', () => {
  it('leaves commands untouched for player 0', () => {
    const cmd: Command = { type: 'research', player: 0, tech: 'radar' };
    expect(remapCommandPerspective(cmd, 0)).toBe(cmd);
  });

  it('swaps the player field for player 1', () => {
    const cmd: Command = { type: 'research', player: 0, tech: 'radar' };
    expect(remapCommandPerspective(cmd, 1)).toEqual({ type: 'research', player: 1, tech: 'radar' });
  });

  it('leaves commands without a player field untouched', () => {
    const cmd: Command = { type: 'stop', entities: [1, 2] as never };
    expect(remapCommandPerspective(cmd, 1)).toBe(cmd);
  });
});
