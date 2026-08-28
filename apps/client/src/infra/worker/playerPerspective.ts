/**
 * Every presentation call site (GameRenderer, gameStore, entityReadout) hardcodes
 * "player 0 is me" — true for local skirmish, false for whichever online player the
 * server assigned id 1. Rather than thread a localPlayerId through all of those, we
 * swap the 0/1 labels once, right here at the network boundary, so "0 is me" stays
 * true everywhere else. Only meaningful for a 1v1: swapping just flips two labels.
 */
import type { Command, Snapshot } from '@iron/engine';
import { asPlayerId } from '@iron/shared';

const swap = (player: number): number => (player === 0 ? 1 : player === 1 ? 0 : player);

/** Remaps every player-id-bearing field in a snapshot for the given local player. */
export function remapSnapshotPerspective(snapshot: Snapshot, localPlayerId: number): Snapshot {
  if (localPlayerId === 0) return snapshot;
  return {
    ...snapshot,
    entities: snapshot.entities.map((entity) => ({ ...entity, owner: swap(entity.owner) })),
    players: snapshot.players.map((player) => ({ ...player, player: swap(player.player) })),
    ...(snapshot.match && {
      match: {
        ...snapshot.match,
        winner:
          snapshot.match.winner === null ? null : asPlayerId(swap(snapshot.match.winner)),
      },
    }),
  };
}

/** Remaps the explicit `player` field some commands carry, before it leaves this client. */
export function remapCommandPerspective(cmd: Command, localPlayerId: number): Command {
  if (localPlayerId === 0 || !('player' in cmd)) return cmd;
  return { ...cmd, player: swap(cmd.player) };
}
