/**
 * Ordered system scheduler. Systems run in registration order every tick — that
 * order is part of the simulation's deterministic contract and must not depend on
 * insertion timing or hashing.
 */
import type { System, TickContext } from './system.js';
import type { World } from './world.js';

export class Scheduler {
  private readonly systems: System[] = [];

  add(system: System): this {
    this.systems.push(system);
    return this;
  }

  /** Read-only view of the registered systems, in execution order. */
  get order(): readonly System[] {
    return this.systems;
  }

  /** Runs every system once, in order, for the given tick. */
  tick(world: World, ctx: TickContext): void {
    for (const system of this.systems) {
      system.update(world, ctx);
    }
  }
}
