/**
 * Global simulation constants shared across engine, client and server.
 * These values are part of the determinism contract: changing them
 * invalidates existing replays and savegames.
 */

/** Simulation tick rate in Hz. RTS-standard, network-friendly. */
export const SIM_HZ = 20;

/** Simulation delta time in milliseconds (fixed timestep). */
export const SIM_DT_MS = 1000 / SIM_HZ;

/** Maximum ticks the accumulator may catch up in one frame (anti spiral-of-death). */
export const MAX_CATCHUP_TICKS = 5;

/** Default command input delay in ticks for lockstep multiplayer (~200ms @ 20Hz). */
export const DEFAULT_INPUT_DELAY = 4;

/** Wire/protocol version. Bump on any breaking protocol change. */
export const PROTOCOL_VERSION = 1;

/** Save/replay format version. */
export const SAVE_VERSION = 1;
export const REPLAY_VERSION = 1;
