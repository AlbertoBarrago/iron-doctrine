import { describe, expect, it } from 'vitest';
import type { EntitySnapshot, FogSnapshot } from '@iron/engine';
import { entityIsInspectable, entityReadout } from '../entityReadout.js';

const entity = (overrides: Partial<EntitySnapshot> = {}): EntitySnapshot => ({
  id: 1,
  kind: 'unit',
  x: 1.5,
  y: 0.5,
  angle: 0,
  hp: 80,
  maxHp: 100,
  radius: 0.5,
  owner: 0,
  unitType: 'tank',
  ...overrides,
});

const fog: FogSnapshot = {
  width: 3,
  height: 1,
  cellSize: 1,
  originX: 0,
  originY: 0,
  cells: new Uint8Array([0, 1, 2]),
};

describe('entity readout', () => {
  it('describes health and content profile', () => {
    expect(entityReadout(entity())).toMatchObject({
      label: 'Battle tank',
      role: 'Armored assault',
      hp: 80,
      maxHp: 100,
      status: 'Ready',
    });
  });

  it('reports construction and cargo state', () => {
    const building = entity({
      kind: 'building',
      buildingType: 'barracks',
      construction: { progressTicks: 25, buildTicks: 100 },
    });
    delete building.unitType;
    expect(
      entityReadout(building),
    ).toMatchObject({ constructionProgress: 0.25, status: 'Under construction · 25%' });
    expect(
      entityReadout(
        entity({
          unitType: 'harvester',
          cargo: { amount: 30, capacity: 100, phase: 'toBase' },
        }),
      ),
    ).toMatchObject({
      cargo: { amount: 30, capacity: 100, phase: 'toBase' },
      status: 'Returning to construction yard',
    });
  });

  it('never exposes unknown resources or enemies outside current vision', () => {
    expect(entityIsInspectable(entity({ kind: 'resource', x: 0.5 }), fog)).toBe(false);
    expect(entityIsInspectable(entity({ kind: 'resource', x: 1.5 }), fog)).toBe(true);
    expect(entityIsInspectable(entity({ owner: 1, x: 1.5 }), fog)).toBe(false);
    expect(entityIsInspectable(entity({ owner: 1, x: 2.5 }), fog)).toBe(true);
    expect(entityIsInspectable(entity({ owner: 0, x: 0.5 }), fog)).toBe(true);
  });
});
