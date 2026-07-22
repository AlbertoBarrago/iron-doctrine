/**
 * Component type registry and sparse-set storage.
 *
 * Components are plain data objects. Each component TYPE is declared once via
 * {@link defineComponent}, producing a typed token carrying a stable numeric id.
 * Storage is a sparse set: O(1) add/remove/has/get and cache-friendly dense
 * iteration, with stable (ascending-entity) ordering for determinism.
 */
import { indexOf } from './entity.js';
import type { EntityId } from '@iron/shared';

let nextComponentId = 0;

/** Opaque, typed handle identifying a component type. */
export interface ComponentType<T> {
  readonly id: number;
  readonly name: string;
  /** Factory producing a fresh default instance (used by deserialization/pooling). */
  readonly create: () => T;
  /** Phantom marker to bind the data type `T` to this token. */
  readonly __t?: T;
}

export function defineComponent<T>(name: string, create: () => T): ComponentType<T> {
  return { id: nextComponentId++, name, create };
}

/**
 * Sparse-set store for a single component type.
 * - `dense` holds packed component data; `denseEntities` the matching entity ids.
 * - `sparse[entitySlot]` indexes into `dense`.
 */
export class ComponentStore<T> {
  private readonly dense: T[] = [];
  private readonly denseEntities: EntityId[] = [];
  private readonly sparse: number[] = []; // entity slot -> dense index (+1; 0 = absent)

  constructor(readonly type: ComponentType<T>) {}

  has(entity: EntityId): boolean {
    const s = this.sparse[indexOf(entity)];
    return s !== undefined && s !== 0;
  }

  get(entity: EntityId): T | undefined {
    const s = this.sparse[indexOf(entity)];
    return s === undefined || s === 0 ? undefined : this.dense[s - 1];
  }

  /** Adds or overwrites the component for `entity`, returning the stored value. */
  set(entity: EntityId, value: T): T {
    const slot = indexOf(entity);
    const existing = this.sparse[slot];
    if (existing !== undefined && existing !== 0) {
      this.dense[existing - 1] = value;
      return value;
    }
    this.dense.push(value);
    this.denseEntities.push(entity);
    this.sparse[slot] = this.dense.length; // store index+1
    return value;
  }

  /** Removes the component via swap-remove; returns true if it existed. */
  remove(entity: EntityId): boolean {
    const slot = indexOf(entity);
    const packed = this.sparse[slot];
    if (packed === undefined || packed === 0) return false;
    const denseIdx = packed - 1;
    const lastIdx = this.dense.length - 1;

    if (denseIdx !== lastIdx) {
      const movedEntity = this.denseEntities[lastIdx]!;
      this.dense[denseIdx] = this.dense[lastIdx]!;
      this.denseEntities[denseIdx] = movedEntity;
      this.sparse[indexOf(movedEntity)] = denseIdx + 1;
    }
    this.dense.pop();
    this.denseEntities.pop();
    this.sparse[slot] = 0;
    return true;
  }

  get size(): number {
    return this.dense.length;
  }

  /** Dense entity list. NOTE: order is add-order, not entity order. */
  entities(): readonly EntityId[] {
    return this.denseEntities;
  }
}
