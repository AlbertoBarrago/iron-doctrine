/**
 * Branded primitive types shared across layers. Branding prevents accidentally
 * mixing conceptually-different numeric ids at compile time with zero runtime cost.
 */

declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

/** Encoded entity handle: index (low 20 bits) + generation (high 12 bits). */
export type EntityId = Brand<number, 'EntityId'>;

/** Player slot identifier within a match (0-based). */
export type PlayerId = Brand<number, 'PlayerId'>;

/** Team identifier for shared vision / alliances. */
export type TeamId = Brand<number, 'TeamId'>;

/** Monotonic simulation tick counter. */
export type Tick = Brand<number, 'Tick'>;

export const asEntityId = (n: number): EntityId => n as EntityId;
export const asPlayerId = (n: number): PlayerId => n as PlayerId;
export const asTeamId = (n: number): TeamId => n as TeamId;
export const asTick = (n: number): Tick => n as Tick;
