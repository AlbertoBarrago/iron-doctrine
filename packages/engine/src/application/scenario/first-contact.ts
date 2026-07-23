import type { World } from '../ecs/world.js';
import type { System } from '../ecs/system.js';
import type { NavGrid } from '../pathfinding/nav-grid.js';
import type { PlayerEconomy } from '../../domain/economy/player-economy.js';
import { Owner, Position, UnitType } from '../../domain/components/index.js';
import { spawnBuilding } from '../../domain/archetypes/buildings.js';
import { spawnUnit } from '../../domain/archetypes/units.js';
import * as fp from '../../domain/math/fixed.js';
import type { Vec2 } from '../../domain/math/vec2.js';

export type FirstContactPhase = 'locate' | 'recovering' | 'operational';

export interface FirstContactConfig {
  player: number;
  recoveryAt: Vec2;
  recoveryTicks: number;
  recoveredCredits: number;
}

export interface FirstContactSnapshot {
  phase: FirstContactPhase;
  objective: string;
  progress: number;
}

export class FirstContactState {
  phase: FirstContactPhase = 'locate';
  private elapsedTicks = 0;

  constructor(readonly config: FirstContactConfig) {}

  snapshot(): FirstContactSnapshot {
    if (this.phase === 'locate') {
      return {
        phase: this.phase,
        objective: 'Locate the abandoned command base',
        progress: 0,
      };
    }
    if (this.phase === 'recovering') {
      return {
        phase: this.phase,
        objective: 'Secure the perimeter while engineers restore the base',
        progress: Math.min(1, this.elapsedTicks / this.config.recoveryTicks),
      };
    }
    return {
      phase: this.phase,
      objective: 'Build the base and destroy hostile command',
      progress: 1,
    };
  }

  restore(snapshot: { phase: FirstContactPhase; elapsedTicks: number }): void {
    this.phase = snapshot.phase;
    this.elapsedTicks = snapshot.elapsedTicks;
  }

  serialize(): { phase: FirstContactPhase; elapsedTicks: number } {
    return { phase: this.phase, elapsedTicks: this.elapsedTicks };
  }

  update(world: World, grid: NavGrid, economy: PlayerEconomy): void {
    if (this.phase === 'locate') {
      if (this.playerUnitReachedBase(world)) this.phase = 'recovering';
      return;
    }
    if (this.phase !== 'recovering') return;

    this.elapsedTicks++;
    if (this.elapsedTicks < this.config.recoveryTicks) return;

    const at = this.config.recoveryAt;
    spawnBuilding(world, grid, 'construction_yard', this.config.player, at);
    spawnUnit(world, 'harvester', this.config.player, {
      x: fp.add(at.x, fp.fromInt(3)),
      y: fp.add(at.y, fp.fromInt(2)),
    });
    economy.addCredits(this.config.player, this.config.recoveredCredits);
    this.phase = 'operational';
  }

  private playerUnitReachedBase(world: World): boolean {
    const radius = fp.fromInt(5);
    const radiusSquared = fp.mul(radius, radius);
    for (const entity of world.query(Position, Owner, UnitType)) {
      const owner = world.get(entity, Owner)!;
      if (owner.player !== this.config.player) continue;
      const position = world.get(entity, Position)!;
      const dx = fp.sub(position.x, this.config.recoveryAt.x);
      const dy = fp.sub(position.y, this.config.recoveryAt.y);
      if (fp.add(fp.mul(dx, dx), fp.mul(dy, dy)) <= radiusSquared) return true;
    }
    return false;
  }
}

export function createFirstContactSystem(
  scenario: FirstContactState,
  grid: NavGrid,
  economy: PlayerEconomy,
): System {
  return {
    name: 'FirstContactSystem',
    update(world) {
      scenario.update(world, grid, economy);
    },
  };
}
