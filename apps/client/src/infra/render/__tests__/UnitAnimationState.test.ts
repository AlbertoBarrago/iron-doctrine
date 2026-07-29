import type { EntitySnapshot } from '@iron/engine';
import { describe, expect, it } from 'vitest';
import { UnitAnimationState, resolveUnitPhase } from '../UnitAnimationState.js';

function unit(overrides: Partial<EntitySnapshot> = {}): EntitySnapshot {
  return {
    id: 7,
    kind: 'unit',
    x: 0,
    y: 0,
    angle: 0,
    hp: 100,
    maxHp: 100,
    radius: 1,
    owner: 0,
    unitType: 'rifleman',
    ...overrides,
  };
}

describe('unit animation state', () => {
  it('selects actions from authoritative snapshot state', () => {
    expect(resolveUnitPhase(unit(), { moving: true })).toBe('move');
    expect(resolveUnitPhase(unit(), { firing: true, moving: true })).toBe('attack');
    expect(resolveUnitPhase(unit({ unitType: 'medic', healingTarget: 12 }), {})).toBe('heal');
    expect(
      resolveUnitPhase(
        unit({
          unitType: 'harvester',
          cargo: { amount: 30, capacity: 100, phase: 'gathering' },
        }),
        { moving: true },
      ),
    ).toBe('gather');
    expect(
      resolveUnitPhase(
        unit({
          unitType: 'harvester',
          cargo: { amount: 30, capacity: 100, phase: 'depositing' },
        }),
        { moving: true },
      ),
    ).toBe('deposit');
  });

  it('does not invent an Engineer work state without a gameplay signal', () => {
    expect(resolveUnitPhase(unit({ unitType: 'engineer' }), {})).toBe('idle');
    expect(resolveUnitPhase(unit({ unitType: 'engineer' }), { moving: true })).toBe('move');
  });

  it('reports persistent damage independently from the selected action', () => {
    const state = new UnitAnimationState();
    const presentation = state.resolve(unit({ hp: 40 }), 1, {
      previousHp: 45,
      moving: true,
    });

    expect(presentation.phase).toBe('move');
    expect(presentation.damaged).toBe(true);
    expect(presentation.hitProgress).toBe(0);
  });

  it('plays spawn and hit once while a snapshot transition remains visible', () => {
    const state = new UnitAnimationState();
    const entity = unit({ hp: 80 });

    expect(state.resolve(entity, 1, { spawned: true, previousHp: 100 }).spawnProgress).toBe(0);
    expect(
      state.resolve(entity, 1.08, { spawned: true, previousHp: 100 }).spawnProgress,
    ).toBeCloseTo(0.5);
    expect(state.resolve(entity, 1.13, { spawned: true, previousHp: 100 }).hitProgress).toBeNull();
  });

  it('does not infer death from an entity disappearing', () => {
    const state = new UnitAnimationState();
    state.resolve(unit(), 1);
    state.delete(7);

    expect(state.resolve(unit(), 2).phase).toBe('idle');
  });
});
