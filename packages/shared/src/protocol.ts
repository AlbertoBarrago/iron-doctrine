/**
 * Wire protocol for lockstep multiplayer. Clients exchange COMMANDS (intents),
 * never entity state — determinism reconstructs identical state everywhere.
 * Every message is a versioned envelope so the server can reject incompatible peers.
 */
import type { PlayerId, Tick } from './types.js';

/** Opaque, serialized game command. The engine owns its concrete schema. */
export interface WireCommand {
  readonly type: string;
  readonly [key: string]: unknown;
}

export type ClientMessage =
  | { t: 'join'; v: number; name: string }
  | { t: 'command'; execTick: Tick; cmd: WireCommand }
  | { t: 'stateHash'; tick: Tick; hash: number }
  | { t: 'leave' };

export type ServerMessage =
  | { t: 'welcome'; v: number; playerId: PlayerId; seed: number; mapId: string }
  | { t: 'start'; startTick: Tick }
  | { t: 'tick'; tick: Tick; commands: Array<{ player: PlayerId; cmd: WireCommand }> }
  | { t: 'desync'; tick: Tick }
  | { t: 'playerLeft'; playerId: PlayerId };

export const encode = (msg: ClientMessage | ServerMessage): string => JSON.stringify(msg);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

/**
 * Structural validation of the wire envelope only — `cmd`'s per-type shape is the
 * engine's concern (see {@link WireCommand}), not the transport's. This guards the
 * server's relay boundary against malformed/malicious frames before they're
 * broadcast to every other peer.
 */
export function isClientMessage(v: unknown): v is ClientMessage {
  if (!isRecord(v)) return false;
  switch (v.t) {
    case 'join':
      return typeof v.v === 'number' && typeof v.name === 'string';
    case 'command':
      return (
        typeof v.execTick === 'number' &&
        isRecord(v.cmd) &&
        typeof (v.cmd as Record<string, unknown>).type === 'string'
      );
    case 'stateHash':
      return typeof v.tick === 'number' && typeof v.hash === 'number';
    case 'leave':
      return true;
    default:
      return false;
  }
}

export const decodeClient = (raw: string): ClientMessage => {
  const parsed: unknown = JSON.parse(raw);
  if (!isClientMessage(parsed)) throw new Error('Malformed client message');
  return parsed;
};

export const decodeServer = (raw: string): ServerMessage => JSON.parse(raw) as ServerMessage;
