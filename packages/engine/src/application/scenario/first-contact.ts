import type { World } from '../ecs/world.js';
import type { System } from '../ecs/system.js';
import type { NavGrid } from '../pathfinding/nav-grid.js';
import type { PlayerEconomy } from '../../domain/economy/player-economy.js';
import { Owner, Position, UnitType } from '../../domain/components/index.js';
import { spawnBuilding } from '../../domain/archetypes/buildings.js';
import { spawnUnit } from '../../domain/archetypes/units.js';
import * as fp from '../../domain/math/fixed.js';
import type { Vec2 } from '../../domain/math/vec2.js';

export type FirstContactPhase = 'locate' | 'recovering' | 'operational' | 'failed';

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
  recoveryAt: { x: number; y: number };
  operationalAtTick: number | null;
}

export class FirstContactState {
  phase: FirstContactPhase = 'locate';
  private elapsedTicks = 0;
  private hasDeployedPatrol = false;
  private operationalAtTick: number | null = null;

  constructor(readonly config: FirstContactConfig) {}

  snapshot(): FirstContactSnapshot {
    const recoveryAt = {
      x: fp.toFloat(this.config.recoveryAt.x),
      y: fp.toFloat(this.config.recoveryAt.y),
    };
    if (this.phase === 'locate') {
      return {
        phase: this.phase,
        objective: 'Locate the abandoned command base',
        progress: 0,
        recoveryAt,
        operationalAtTick: this.operationalAtTick,
      };
    }
    if (this.phase === 'recovering') {
      return {
        phase: this.phase,
        objective: 'Secure the perimeter while engineers restore the base',
        progress: Math.min(1, this.elapsedTicks / this.config.recoveryTicks),
        recoveryAt,
        operationalAtTick: this.operationalAtTick,
      };
    }
    if (this.phase === 'failed') {
      return {
        phase: this.phase,
        objective: 'Patrol eliminated',
        progress: 0,
        recoveryAt,
        operationalAtTick: this.operationalAtTick,
      };
    }
    return {
      phase: this.phase,
      objective: 'Build the base and destroy hostile command',
      progress: 1,
      recoveryAt,
      operationalAtTick: this.operationalAtTick,
    };
  }

  get activationOriginTick(): number | null {
    return this.operationalAtTick;
  }

  restore(snapshot: {
    phase: FirstContactPhase;
    elapsedTicks: number;
    hasDeployedPatrol?: boolean;
    operationalAtTick?: number | null;
  }): void {
    this.phase = snapshot.phase;
    this.elapsedTicks = snapshot.elapsedTicks;
    this.hasDeployedPatrol = snapshot.hasDeployedPatrol ?? this.phase !== 'locate';
    this.operationalAtTick = snapshot.operationalAtTick ?? null;
  }

  serialize(): {
    phase: FirstContactPhase;
    elapsedTicks: number;
    hasDeployedPatrol: boolean;
    operationalAtTick: number | null;
  } {
    return {
      phase: this.phase,
      elapsedTicks: this.elapsedTicks,
      hasDeployedPatrol: this.hasDeployedPatrol,
      operationalAtTick: this.operationalAtTick,
    };
  }

  update(world: World, grid: NavGrid, economy: PlayerEconomy, tick: number): void {
    const patrolAlive = this.playerHasUnits(world);
    if (patrolAlive) this.hasDeployedPatrol = true;
    if (this.phase !== 'operational' && this.hasDeployedPatrol && !patrolAlive) {
      this.phase = 'failed';
      return;
    }
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
    this.operationalAtTick = tick;
  }

  private playerHasUnits(world: World): boolean {
    for (const entity of world.query(Owner, UnitType)) {
      if (world.get(entity, Owner)!.player === this.config.player) return true;
    }
    return false;
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
    update(world, ctx) {
      scenario.update(world, grid, economy, ctx.tick);
    },
  };
}
