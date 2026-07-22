/**
 * The ECS World: owns entities and all component stores, and is the single
 * mutation surface for simulation state. Systems receive the World each tick.
 *
 * Query results are returned in ascending entity-slot order so that any system
 * iterating them processes entities in a stable, allocation-independent sequence —
 * a hard requirement for deterministic simulation.
 */
import { EntityManager, indexOf } from './entity.js';
import { ComponentStore, type ComponentType } from './component.js';
import type { EntityId } from '@iron/shared';

export class World {
  readonly entities = new EntityManager();
  private readonly stores = new Map<number, ComponentStore<unknown>>();

  private storeFor<T>(type: ComponentType<T>): ComponentStore<T> {
    let store = this.stores.get(type.id) as ComponentStore<T> | undefined;
    if (!store) {
      store = new ComponentStore<T>(type);
      this.stores.set(type.id, store as ComponentStore<unknown>);
    }
    return store;
  }

  createEntity(): EntityId {
    return this.entities.create();
  }

  /** Destroys an entity and strips all its components. */
  destroyEntity(entity: EntityId): void {
    if (!this.entities.isAlive(entity)) return;
    for (const store of this.stores.values()) store.remove(entity);
    this.entities.destroy(entity);
  }

  isAlive(entity: EntityId): boolean {
    return this.entities.isAlive(entity);
  }

  add<T>(entity: EntityId, type: ComponentType<T>, value: T): T {
    return this.storeFor(type).set(entity, value);
  }

  get<T>(entity: EntityId, type: ComponentType<T>): T | undefined {
    return this.storeFor(type).get(entity);
  }

  has<T>(entity: EntityId, type: ComponentType<T>): boolean {
    return this.storeFor(type).has(entity);
  }

  remove<T>(entity: EntityId, type: ComponentType<T>): boolean {
    return this.storeFor(type).remove(entity);
  }

  /**
   * Returns entities possessing all given component types, in ascending slot order.
   * Iterates the smallest participating store, then sorts — avoids scanning every
   * entity while preserving deterministic ordering.
   */
  query(...types: ComponentType<unknown>[]): EntityId[] {
    if (types.length === 0) return this.entities.alive();

    const stores = types.map((t) => this.storeFor(t));
    // Pick the smallest store to drive iteration.
    let smallest = stores[0]!;
    for (const s of stores) if (s.size < smallest.size) smallest = s;

    const result: EntityId[] = [];
    for (const entity of smallest.entities()) {
      let ok = true;
      for (const s of stores) {
        if (s === smallest) continue;
        if (!s.has(entity)) {
          ok = false;
          break;
        }
      }
      if (ok) result.push(entity);
    }
    result.sort((a, b) => indexOf(a) - indexOf(b));
    return result;
  }

  /** Number of live entities. */
  get entityCount(): number {
    return this.entities.count;
  }
}
