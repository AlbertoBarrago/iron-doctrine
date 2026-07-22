import { describe, it, expect } from 'vitest';
import { EntityManager, indexOf, generationOf } from './entity.js';

describe('EntityManager', () => {
  it('creates unique live entities', () => {
    const em = new EntityManager();
    const a = em.create();
    const b = em.create();
    expect(a).not.toBe(b);
    expect(em.isAlive(a)).toBe(true);
    expect(em.isAlive(b)).toBe(true);
    expect(em.count).toBe(2);
  });

  it('recycles slots and bumps generation, invalidating stale handles', () => {
    const em = new EntityManager();
    const a = em.create();
    expect(em.destroy(a)).toBe(true);
    expect(em.isAlive(a)).toBe(false);

    const b = em.create(); // should reuse the same slot
    expect(indexOf(b)).toBe(indexOf(a));
    expect(generationOf(b)).toBe(generationOf(a) + 1);
    expect(em.isAlive(a)).toBe(false); // stale handle stays dead
    expect(em.isAlive(b)).toBe(true);
  });

  it('destroy on a dead entity is a no-op returning false', () => {
    const em = new EntityManager();
    const a = em.create();
    em.destroy(a);
    expect(em.destroy(a)).toBe(false);
    expect(em.count).toBe(0);
  });

  it('iterates live entities in ascending slot order', () => {
    const em = new EntityManager();
    const ids = [em.create(), em.create(), em.create()];
    em.destroy(ids[1]!);
    const seen = em.alive().map(indexOf);
    expect(seen).toEqual([...seen].sort((x, y) => x - y));
    expect(seen).toContain(indexOf(ids[0]!));
    expect(seen).toContain(indexOf(ids[2]!));
    expect(seen).not.toContain(indexOf(ids[1]!));
  });
});
