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

export const decodeClient = (raw: string): ClientMessage => JSON.parse(raw) as ClientMessage;
export const decodeServer = (raw: string): ServerMessage => JSON.parse(raw) as ServerMessage;
