import type { World } from '../ecs/world.js';
import type { System } from '../ecs/system.js';
import { Owner, Position, UnitType } from '../../domain/components/index.js';
import { spawnUnit } from '../../domain/archetypes/units.js';
import * as fp from '../../domain/math/fixed.js';
import type { Vec2 } from '../../domain/math/vec2.js';

export type IronPassPhase = 'approach' | 'ambush';

export interface IronPassConfig {
  player: number;
  ambushPlayer: number;
  triggerAt: Vec2;
  ambushSpawns: Vec2[];
}

export interface IronPassSnapshot {
  phase: IronPassPhase;
  objective: string;
}

const TRIGGER_RADIUS = fp.fromInt(6);

export class IronPassState {
  phase: IronPassPhase = 'approach';

  constructor(readonly config: IronPassConfig) {}

  snapshot(): IronPassSnapshot {
    if (this.phase === 'approach') {
      return { phase: this.phase, objective: 'Advance through Iron Pass' };
    }
    return {
      phase: this.phase,
      objective: 'Hold against the counter-attack and destroy the hostile command',
    };
  }

  restore(snapshot: { phase: IronPassPhase }): void {
    this.phase = snapshot.phase;
  }

  serialize(): { phase: IronPassPhase } {
    return { phase: this.phase };
  }

  update(world: World): void {
    if (this.phase !== 'approach') return;
    if (!this.playerReachedTrigger(world)) return;
    this.phase = 'ambush';
    for (const at of this.config.ambushSpawns) {
      spawnUnit(world, 'tank', this.config.ambushPlayer, at);
    }
  }

  private playerReachedTrigger(world: World): boolean {
    const radiusSquared = fp.mul(TRIGGER_RADIUS, TRIGGER_RADIUS);
    for (const entity of world.query(Position, Owner, UnitType)) {
      const owner = world.get(entity, Owner)!;
      if (owner.player !== this.config.player) continue;
      const position = world.get(entity, Position)!;
      const dx = fp.sub(position.x, this.config.triggerAt.x);
      const dy = fp.sub(position.y, this.config.triggerAt.y);
      if (fp.add(fp.mul(dx, dx), fp.mul(dy, dy)) <= radiusSquared) return true;
    }
    return false;
  }
}

export function createIronPassSystem(scenario: IronPassState): System {
  return {
    name: 'IronPassSystem',
    update(world) {
      scenario.update(world);
    },
  };
}
