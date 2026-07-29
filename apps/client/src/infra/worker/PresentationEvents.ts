import type { EntitySnapshot, Snapshot } from '@iron/engine';

export type PresentationEvent =
  | {
      kind: 'weaponFired';
      entityId: number;
      entityKind: EntitySnapshot['kind'];
      unitType?: string;
      radius: number;
      x: number;
      y: number;
      angle: number;
      targetX?: number;
      targetY?: number;
    }
  | {
      kind: 'entityDamaged';
      entityId: number;
      amount: number;
      hp: number;
      x: number;
      y: number;
    }
  | {
      kind: 'entityDestroyed';
      entityId: number;
      entityKind: EntitySnapshot['kind'];
      owner: number;
      radius: number;
      x: number;
      y: number;
    }
  | {
      kind: 'oreDeposited';
      entityId: number;
      owner: number;
      amount: number;
      radius: number;
      x: number;
      y: number;
    };

export interface PresentationEventEnvelope {
  sequence: number;
  tick: number;
  event: PresentationEvent;
}

export interface DerivedPresentationEvents {
  events: PresentationEventEnvelope[];
  nextSequence: number;
}

/**
 * Derives presentation events from two adjacent authoritative snapshots.
 * Callers must not skip ticks: the worker invokes this after every simulation step.
 */
export function derivePresentationEvents(
  previous: Snapshot,
  current: Snapshot,
  firstSequence: number,
): DerivedPresentationEvents {
  const currentById = new Map(current.entities.map((entity) => [entity.id, entity]));
  const previousById = new Map(previous.entities.map((entity) => [entity.id, entity]));
  const events: PresentationEventEnvelope[] = [];
  let sequence = firstSequence;
  const emit = (event: PresentationEvent): void => {
    events.push({ sequence: sequence++, tick: current.tick, event });
  };

  for (const before of [...previous.entities].sort((left, right) => left.id - right.id)) {
    const after = currentById.get(before.id);
    if (!after) {
      if (before.kind !== 'resource') {
        emit({
          kind: 'entityDestroyed',
          entityId: before.id,
          entityKind: before.kind,
          owner: before.owner,
          radius: before.radius,
          x: before.x,
          y: before.y,
        });
      }
      continue;
    }

    if (before.maxHp > 0 && after.hp < before.hp) {
      emit({
        kind: 'entityDamaged',
        entityId: after.id,
        amount: before.hp - after.hp,
        hp: after.hp,
        x: after.x,
        y: after.y,
      });
    }

    if (
      after.weaponCooldownLeft !== undefined &&
      after.weaponCooldownLeft > (before.weaponCooldownLeft ?? 0) &&
      after.attackTarget !== undefined
    ) {
      const target = currentById.get(after.attackTarget) ?? previousById.get(after.attackTarget);
      emit({
        kind: 'weaponFired',
        entityId: after.id,
        entityKind: after.kind,
        ...(after.unitType && { unitType: after.unitType }),
        radius: after.radius,
        x: after.x,
        y: after.y,
        angle: after.angle,
        ...(target && { targetX: target.x, targetY: target.y }),
      });
    }

    if (
      before.cargo &&
      after.cargo &&
      before.cargo.phase === 'depositing' &&
      after.cargo.phase !== 'depositing' &&
      before.cargo.amount > 0 &&
      after.cargo.amount === 0
    ) {
      emit({
        kind: 'oreDeposited',
        entityId: after.id,
        owner: after.owner,
        amount: before.cargo.amount,
        radius: after.radius,
        x: after.x,
        y: after.y,
      });
    }
  }

  return { events, nextSequence: sequence };
}

/** Ordered, duplicate-safe main-thread buffer for worker presentation events. */
export class PresentationEventBuffer {
  private readonly pending: PresentationEventEnvelope[] = [];
  private lastSequence = -1;

  append(events: readonly PresentationEventEnvelope[]): void {
    for (const envelope of events) {
      if (envelope.sequence <= this.lastSequence) continue;
      this.pending.push(envelope);
      this.lastSequence = envelope.sequence;
    }
  }

  drain(): PresentationEventEnvelope[] {
    return this.pending.splice(0);
  }

  reset(): void {
    this.pending.length = 0;
    this.lastSequence = -1;
  }
}
