import type { World } from '../ecs/world.js';
import type { System } from '../ecs/system.js';
import { Movement } from '../../domain/components/index.js';
import { spawnUnit } from '../../domain/archetypes/units.js';
import type { Vec2 } from '../../domain/math/vec2.js';

export type SiegeLinePhase = 'holding' | 'counter-attack';

export interface SiegeLineConfig {
  hostilePlayer: number;
  waveIntervalTicks: number;
  waveCount: number;
  spawnPoints: Vec2[];
  /** Point wave units march toward, typically the defender's held position. */
  targetAt: Vec2;
}

export interface SiegeLineSnapshot {
  phase: SiegeLinePhase;
  objective: string;
}

export class SiegeLineState {
  phase: SiegeLinePhase = 'holding';
  private wavesDispatched = 0;

  constructor(readonly config: SiegeLineConfig) {}

  snapshot(): SiegeLineSnapshot {
    if (this.phase === 'holding') {
      const remaining = this.config.waveCount - this.wavesDispatched;
      return {
        phase: this.phase,
        objective: `Hold the line — ${remaining} assault wave${remaining === 1 ? '' : 's'} incoming`,
      };
    }
    return { phase: this.phase, objective: 'Push out and destroy the hostile command' };
  }

  restore(snapshot: { phase: SiegeLinePhase; wavesDispatched: number }): void {
    this.phase = snapshot.phase;
    this.wavesDispatched = snapshot.wavesDispatched;
  }

  serialize(): { phase: SiegeLinePhase; wavesDispatched: number } {
    return { phase: this.phase, wavesDispatched: this.wavesDispatched };
  }

  update(world: World, tick: number): void {
    if (this.phase !== 'holding') return;
    if (this.wavesDispatched >= this.config.waveCount) {
      this.phase = 'counter-attack';
      return;
    }
    const dueTick = (this.wavesDispatched + 1) * this.config.waveIntervalTicks;
    if (tick < dueTick) return;
    this.dispatchWave(world);
  }

  private dispatchWave(world: World): void {
    const waveIndex = this.wavesDispatched;
    const unitCount = 2 + waveIndex;
    for (let i = 0; i < unitCount; i++) {
      const at = this.config.spawnPoints[i % this.config.spawnPoints.length]!;
      const unit = spawnUnit(
        world,
        i % 2 === 0 ? 'tank' : 'rifleman',
        this.config.hostilePlayer,
        at,
      );
      const movement = world.get(unit, Movement);
      if (movement) movement.target = this.config.targetAt;
    }
    this.wavesDispatched++;
    if (this.wavesDispatched >= this.config.waveCount) this.phase = 'counter-attack';
  }
}

export function createSiegeLineSystem(scenario: SiegeLineState): System {
  return {
    name: 'SiegeLineSystem',
    update(world, ctx) {
      scenario.update(world, ctx.tick);
    },
  };
}
