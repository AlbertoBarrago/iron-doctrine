import type { EntitySnapshot, Snapshot } from '@iron/engine';
import { describe, expect, it } from 'vitest';
import {
  derivePresentationEvents,
  PresentationEventBuffer,
  type PresentationEventEnvelope,
} from '../PresentationEvents.js';

function entity(overrides: Partial<EntitySnapshot> = {}): EntitySnapshot {
  return {
    id: 1,
    kind: 'unit',
    x: 2,
    y: 3,
    angle: 0,
    hp: 100,
    maxHp: 100,
    radius: 1,
    owner: 0,
    unitType: 'harvester',
    ...overrides,
  };
}

function snapshot(tick: number, entities: EntitySnapshot[]): Snapshot {
  return { tick, entities, players: [] };
}

describe('presentation events', () => {
  it('preserves damage and destruction across adjacent catch-up ticks', () => {
    const initial = snapshot(10, [entity()]);
    const damaged = snapshot(11, [entity({ hp: 72 })]);
    const destroyed = snapshot(12, []);

    const first = derivePresentationEvents(initial, damaged, 0);
    const second = derivePresentationEvents(damaged, destroyed, first.nextSequence);

    expect([...first.events, ...second.events]).toEqual([
      {
        sequence: 0,
        tick: 11,
        event: {
          kind: 'entityDamaged',
          entityId: 1,
          amount: 28,
          hp: 72,
          x: 2,
          y: 3,
        },
      },
      {
        sequence: 1,
        tick: 12,
        event: {
          kind: 'entityDestroyed',
          entityId: 1,
          entityKind: 'unit',
          owner: 0,
          radius: 1,
          x: 2,
          y: 3,
        },
      },
    ]);
  });

  it('emits the authoritative ore amount when depositing completes', () => {
    const before = entity({
      cargo: { amount: 700, capacity: 700, phase: 'depositing' },
    });
    const after = entity({
      cargo: { amount: 0, capacity: 700, phase: 'idle' },
    });

    const result = derivePresentationEvents(snapshot(20, [before]), snapshot(21, [after]), 8);

    expect(result.events).toEqual([
      {
        sequence: 8,
        tick: 21,
        event: {
          kind: 'oreDeposited',
          entityId: 1,
          owner: 0,
          amount: 700,
          radius: 1,
          x: 2,
          y: 3,
        },
      },
    ]);
  });

  it('preserves weapon fire with the target position from the firing tick', () => {
    const shooterBefore = entity({
      id: 1,
      unitType: 'rifleman',
      weaponCooldownLeft: 0,
      attackTarget: 2,
    });
    const shooterAfter = entity({
      id: 1,
      unitType: 'rifleman',
      weaponCooldownLeft: 12,
      attackTarget: 2,
      angle: Math.PI / 2,
    });
    const target = entity({ id: 2, x: 8, y: 9, unitType: 'tank' });

    const result = derivePresentationEvents(
      snapshot(30, [shooterBefore, target]),
      snapshot(31, [shooterAfter, target]),
      12,
    );

    expect(result.events).toContainEqual({
      sequence: 12,
      tick: 31,
      event: {
        kind: 'weaponFired',
        entityId: 1,
        entityKind: 'unit',
        unitType: 'rifleman',
        radius: 1,
        x: 2,
        y: 3,
        angle: Math.PI / 2,
        targetX: 8,
        targetY: 9,
      },
    });
  });

  it('drains ordered events once and ignores redelivery', () => {
    const event: PresentationEventEnvelope = {
      sequence: 4,
      tick: 10,
      event: {
        kind: 'entityDestroyed',
        entityId: 2,
        entityKind: 'building',
        owner: 1,
        radius: 2,
        x: 4,
        y: 5,
      },
    };
    const buffer = new PresentationEventBuffer();

    buffer.append([event, event]);

    expect(buffer.drain()).toEqual([event]);
    expect(buffer.drain()).toEqual([]);
  });
});
