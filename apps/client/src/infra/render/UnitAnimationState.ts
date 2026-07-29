import type { EntitySnapshot } from '@iron/engine';

export type UnitAnimationPhase =
  'idle' | 'damaged' | 'move' | 'attack' | 'heal' | 'gather' | 'deposit';

export interface UnitAnimationSignals {
  moving?: boolean;
  firing?: boolean;
  engaged?: boolean;
  spawned?: boolean;
  previousHp?: number;
}

export interface UnitAnimationPresentation {
  phase: UnitAnimationPhase;
  spawnProgress: number | null;
  hitProgress: number | null;
  damaged: boolean;
}

interface TrackedUnitState {
  spawnSignal: boolean;
  spawnStartedAt: number | null;
  hitSignal: boolean;
  hitStartedAt: number | null;
}

const SPAWN_SECONDS = 0.16;
const HIT_SECONDS = 0.12;
const DAMAGED_HP_RATIO = 0.5;

export class UnitAnimationState {
  private readonly units = new Map<number, TrackedUnitState>();

  resolve(
    entity: EntitySnapshot,
    animationTime: number,
    signals: UnitAnimationSignals = {},
  ): UnitAnimationPresentation {
    let tracked = this.units.get(entity.id);
    if (!tracked) {
      tracked = {
        spawnSignal: false,
        spawnStartedAt: null,
        hitSignal: false,
        hitStartedAt: null,
      };
      this.units.set(entity.id, tracked);
    }

    const spawnSignal = signals.spawned ?? false;
    if (spawnSignal && !tracked.spawnSignal) tracked.spawnStartedAt = animationTime;
    tracked.spawnSignal = spawnSignal;

    const hitSignal =
      signals.previousHp !== undefined && entity.hp >= 0 && signals.previousHp > entity.hp;
    if (hitSignal && !tracked.hitSignal) tracked.hitStartedAt = animationTime;
    tracked.hitSignal = hitSignal;

    const damaged = entity.maxHp > 0 && entity.hp / entity.maxHp <= DAMAGED_HP_RATIO;
    return {
      phase: resolveUnitPhase(entity, signals, damaged),
      spawnProgress: oneShotProgress(animationTime, tracked.spawnStartedAt, SPAWN_SECONDS),
      hitProgress: oneShotProgress(animationTime, tracked.hitStartedAt, HIT_SECONDS),
      damaged,
    };
  }

  delete(entityId: number): void {
    this.units.delete(entityId);
  }
}

export function resolveUnitPhase(
  entity: EntitySnapshot,
  signals: UnitAnimationSignals,
  damaged = entity.maxHp > 0 && entity.hp / entity.maxHp <= DAMAGED_HP_RATIO,
): UnitAnimationPhase {
  if (entity.cargo?.phase === 'gathering') return 'gather';
  if (entity.cargo?.phase === 'depositing') return 'deposit';
  if (entity.unitType === 'medic' && entity.healingTarget !== undefined) return 'heal';
  if (signals.firing || signals.engaged) return 'attack';
  if (signals.moving) return 'move';
  return damaged ? 'damaged' : 'idle';
}

function oneShotProgress(
  animationTime: number,
  startedAt: number | null,
  duration: number,
): number | null {
  if (startedAt === null) return null;
  const progress = (animationTime - startedAt) / duration;
  if (progress >= 1) return null;
  return Math.max(0, progress);
}
