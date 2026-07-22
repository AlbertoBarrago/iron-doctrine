import { describe, it, expect } from 'vitest';
import { World } from './world.js';
import { defineComponent } from './component.js';

interface Pos {
  x: number;
  y: number;
}
interface Vel {
  dx: number;
  dy: number;
}

const Position = defineComponent<Pos>('Position', () => ({ x: 0, y: 0 }));
const Velocity = defineComponent<Vel>('Velocity', () => ({ dx: 0, dy: 0 }));

describe('World', () => {
  it('adds, reads and removes components', () => {
    const w = new World();
    const e = w.createEntity();
    w.add(e, Position, { x: 5, y: 7 });
    expect(w.has(e, Position)).toBe(true);
    expect(w.get(e, Position)).toEqual({ x: 5, y: 7 });
    expect(w.remove(e, Position)).toBe(true);
    expect(w.has(e, Position)).toBe(false);
  });

  it('destroying an entity strips its components', () => {
    const w = new World();
    const e = w.createEntity();
    w.add(e, Position, { x: 1, y: 1 });
    w.destroyEntity(e);
    expect(w.isAlive(e)).toBe(false);
    expect(w.get(e, Position)).toBeUndefined();
  });

  it('query returns entities with all component types, ascending order', () => {
    const w = new World();
    const a = w.createEntity();
    const b = w.createEntity();
    const c = w.createEntity();
    w.add(a, Position, { x: 0, y: 0 });
    w.add(a, Velocity, { dx: 1, dy: 0 });
    w.add(b, Position, { x: 0, y: 0 });
    w.add(c, Velocity, { dx: 0, dy: 1 });

    const both = w.query(Position, Velocity);
    expect(both).toEqual([a]);

    const positioned = w.query(Position);
    expect(positioned).toEqual([a, b]);
  });

  it('swap-remove keeps other components intact', () => {
    const w = new World();
    const a = w.createEntity();
    const b = w.createEntity();
    const cc = w.createEntity();
    w.add(a, Position, { x: 1, y: 1 });
    w.add(b, Position, { x: 2, y: 2 });
    w.add(cc, Position, { x: 3, y: 3 });
    w.remove(b, Position);
    expect(w.get(a, Position)).toEqual({ x: 1, y: 1 });
    expect(w.get(cc, Position)).toEqual({ x: 3, y: 3 });
    expect(w.get(b, Position)).toBeUndefined();
  });

  it('empty query returns all live entities', () => {
    const w = new World();
    const a = w.createEntity();
    const b = w.createEntity();
    expect(w.query().sort()).toEqual([a, b].sort());
  });
});
