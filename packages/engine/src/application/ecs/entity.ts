/**
 * Entity handle encoding and lifecycle.
 *
 * An {@link EntityId} packs a slot index (low 20 bits) and a generation counter
 * (high 12 bits). When a slot is recycled its generation increments, so a stale
 * handle pointing at a reused slot is detected as dead instead of silently
 * addressing a different entity — a classic use-after-free guard.
 */
import { asEntityId, type EntityId } from '@iron/shared';

export const INDEX_BITS = 20;
export const INDEX_MASK = (1 << INDEX_BITS) - 1; // 0xFFFFF, max ~1,048,575 live slots
export const GENERATION_MASK = (1 << (32 - INDEX_BITS)) - 1; // 0xFFF, 4096 generations

export const indexOf = (id: EntityId): number => id & INDEX_MASK;
export const generationOf = (id: EntityId): number => (id >>> INDEX_BITS) & GENERATION_MASK;

const makeId = (index: number, generation: number): EntityId =>
  asEntityId(((generation & GENERATION_MASK) << INDEX_BITS) | (index & INDEX_MASK));

/**
 * Allocates and recycles entity ids with generation validation.
 * Iteration order of {@link forEach}/{@link alive} is ascending slot index,
 * which is stable and independent of allocation history — required for determinism.
 */
export class EntityManager {
  /** generations[slot] = current generation of that slot. */
  private readonly generations: number[] = [];
  /** Freed slot indices available for reuse (LIFO). */
  private readonly freeList: number[] = [];
  /** Which slots currently hold a live entity. */
  private readonly liveFlags: boolean[] = [];
  private liveCount = 0;

  create(): EntityId {
    let index: number;
    const reused = this.freeList.pop();
    if (reused !== undefined) {
      index = reused;
    } else {
      index = this.generations.length;
      this.generations.push(0);
      this.liveFlags.push(false);
    }
    this.liveFlags[index] = true;
    this.liveCount++;
    return makeId(index, this.generations[index]!);
  }

  isAlive(id: EntityId): boolean {
    const index = indexOf(id);
    return (
      index < this.generations.length &&
      this.liveFlags[index] === true &&
      this.generations[index] === generationOf(id)
    );
  }

  destroy(id: EntityId): boolean {
    if (!this.isAlive(id)) return false;
    const index = indexOf(id);
    this.liveFlags[index] = false;
    // Bump generation (wrapping) so old handles no longer validate.
    this.generations[index] = (this.generations[index]! + 1) & GENERATION_MASK;
    this.freeList.push(index);
    this.liveCount--;
    return true;
  }

  get count(): number {
    return this.liveCount;
  }

  /** Iterate live entities in ascending slot order (deterministic). */
  forEach(fn: (id: EntityId) => void): void {
    for (let index = 0; index < this.liveFlags.length; index++) {
      if (this.liveFlags[index]) fn(makeId(index, this.generations[index]!));
    }
  }

  alive(): EntityId[] {
    const out: EntityId[] = [];
    this.forEach((id) => out.push(id));
    return out;
  }

  /** Serialize the allocator state for savegames. */
  serialize(): EntityManagerState {
    return {
      generations: [...this.generations],
      freeList: [...this.freeList],
      liveFlags: this.liveFlags.map((b) => (b ? 1 : 0)),
      liveCount: this.liveCount,
    };
  }

  /** Restore a previously serialized allocator state, preserving exact ids/generations. */
  restore(state: EntityManagerState): void {
    this.generations.length = 0;
    this.freeList.length = 0;
    this.liveFlags.length = 0;
    this.generations.push(...state.generations);
    this.freeList.push(...state.freeList);
    for (const f of state.liveFlags) this.liveFlags.push(f === 1);
    this.liveCount = state.liveCount;
  }
}

export interface EntityManagerState {
  generations: number[];
  freeList: number[];
  liveFlags: number[];
  liveCount: number;
}
