import type { World } from '../ecs/world.js';
import type { System } from '../ecs/system.js';
import { Building, Health, Owner, Position } from '../../domain/components/index.js';
import { spawnUnit } from '../../domain/archetypes/units.js';
import * as fp from '../../domain/math/fixed.js';
import type { Vec2 } from '../../domain/math/vec2.js';

export type BlackDawnPhase = 'assault' | 'last-stand';

export interface BlackDawnConfig {
  hostilePlayer: number;
  /** Fraction of max HP the hostile command must drop to before the last stand fires. */
  healthThreshold: number;
}

export interface BlackDawnSnapshot {
  phase: BlackDawnPhase;
  objective: string;
}

const REINFORCEMENT_OFFSETS: Vec2[] = [
  { x: fp.fromInt(4), y: fp.fromInt(0) },
  { x: fp.fromInt(-4), y: fp.fromInt(0) },
  { x: fp.fromInt(0), y: fp.fromInt(4) },
  { x: fp.fromInt(0), y: fp.fromInt(-4) },
  { x: fp.fromInt(3), y: fp.fromInt(-3) },
];

export class BlackDawnState {
  phase: BlackDawnPhase = 'assault';

  constructor(readonly config: BlackDawnConfig) {}

  snapshot(): BlackDawnSnapshot {
    if (this.phase === 'assault') {
      return {
        phase: this.phase,
        objective: 'Breach the stronghold and destroy the hostile command',
      };
    }
    return {
      phase: this.phase,
      objective: 'Hold through the last stand and finish the hostile command',
    };
  }

  restore(snapshot: { phase: BlackDawnPhase }): void {
    this.phase = snapshot.phase;
  }

  serialize(): { phase: BlackDawnPhase } {
    return { phase: this.phase };
  }

  update(world: World): void {
    if (this.phase !== 'assault') return;
    const command = this.findCommand(world);
    if (!command) return;
    if (command.health.hp > command.health.max * this.config.healthThreshold) return;
    this.phase = 'last-stand';
    for (let i = 0; i < REINFORCEMENT_OFFSETS.length; i++) {
      const offset = REINFORCEMENT_OFFSETS[i]!;
      spawnUnit(world, i % 2 === 0 ? 'tank' : 'rifleman', this.config.hostilePlayer, {
        x: fp.add(command.position.x, offset.x),
        y: fp.add(command.position.y, offset.y),
      });
    }
  }

  private findCommand(
    world: World,
  ): { position: Vec2; health: { hp: number; max: number } } | undefined {
    for (const entity of world.query(Position, Owner, Building, Health)) {
      const owner = world.get(entity, Owner)!;
      const building = world.get(entity, Building)!;
      if (owner.player !== this.config.hostilePlayer || building.kind !== 'construction_yard') {
        continue;
      }
      return { position: world.get(entity, Position)!, health: world.get(entity, Health)! };
    }
    return undefined;
  }
}

export function createBlackDawnSystem(scenario: BlackDawnState): System {
  return {
    name: 'BlackDawnSystem',
    update(world) {
      scenario.update(world);
    },
  };
}
