import type { World } from '../ecs/world.js';
import type { System } from '../ecs/system.js';
import type { NavGrid } from '../pathfinding/nav-grid.js';
import type { PlayerEconomy } from '../../domain/economy/player-economy.js';
import {
  Health,
  Owner,
  Position,
  UnitType,
  Trap,
  WeaponLoadout,
} from '../../domain/components/index.js';
import { spawnUnit } from '../../domain/archetypes/units.js';
import { spawnBuilding } from '../../domain/archetypes/buildings.js';
import * as fp from '../../domain/math/fixed.js';
import type { Vec2 } from '../../domain/math/vec2.js';
import { asEntityId, asPlayerId, type EntityId } from '@iron/shared';

// TODO: stealth/detection radius left for a follow-up iteration — the operative currently
// behaves like a regular infantry unit to enemy vision/AI, differentiated only by its
// high-damage close-quarters weapon and higher HP pool.

export type SilentExtractionPhase = 'infiltrate' | 'located' | 'escorting' | 'extracted' | 'failed';

export interface SilentExtractionConfig {
  player: number;
  prisonerAt: Vec2;
  extractionAt: Vec2;
  /**
   * Optional destructible obstacle (a `concrete_wall`) blocking an alternate route to
   * the prisoner/extraction point. Owned by a hostile "neutral" player slot so it
   * cannot be attacked from stray friendly fire acquisition, but demo_charge splash or
   * a planted charge (see PlantedCharge/DemolitionSystem) can still destroy it.
   */
  obstacleAt?: Vec2;
  /** Optional enemy trap positions placed along the infiltration route. */
  trapPositions?: readonly Vec2[];
  /**
   * Optional enemy patrol positions guarding the compound between the operative's
   * insertion point and the holding cage — hostile riflemen, engaged by the existing
   * CombatSystem auto-acquire/auto-fire behavior like any other unit (no bespoke AI).
   */
  patrolPositions?: readonly Vec2[];
  /**
   * Optional small hostile perimeter (`concrete_wall` segments) around the cage,
   * purely to sell "this is a guarded compound" — cosmetic, not required to path around.
   */
  basePerimeter?: readonly Vec2[];
}

export interface SilentExtractionSnapshot {
  phase: SilentExtractionPhase;
  objective: string;
  progress: number;
  prisonerAt: { x: number; y: number };
  extractionAt: { x: number; y: number };
  /** Active weapon id on the operative's loadout, for HUD display (undefined if dead/absent). */
  activeWeapon?: string;
  /** Remaining armed traps along the route. */
  trapsArmed: number;
  /** Whether the obstacle wall has been destroyed (bomb detonated or otherwise). */
  obstacleDestroyed: boolean;
  /** Remaining HP of the holding cage (0 once destroyed/absent). */
  cageHp: number;
  /** Whether the holding cage has been destroyed, freeing the prisoner. */
  cageDestroyed: boolean;
}

/** Hostile "neutral" owner for the obstacle/traps — never the operative's player. */
function hostilePlayerOf(player: number): number {
  return player === 1 ? 0 : 1;
}

export class SilentExtractionState {
  phase: SilentExtractionPhase = 'infiltrate';
  private prisonerEntity: EntityId = asEntityId(-1);
  private obstacleEntity: EntityId = asEntityId(-1);
  private cageEntity: EntityId = asEntityId(-1);
  private environmentSpawned = false;

  constructor(readonly config: SilentExtractionConfig) {}

  snapshot(): SilentExtractionSnapshot {
    const prisonerAt = {
      x: fp.toFloat(this.config.prisonerAt.x),
      y: fp.toFloat(this.config.prisonerAt.y),
    };
    const extractionAt = {
      x: fp.toFloat(this.config.extractionAt.x),
      y: fp.toFloat(this.config.extractionAt.y),
    };
    const shared = {
      prisonerAt,
      extractionAt,
      trapsArmed: this.armedTrapCountCache,
      obstacleDestroyed: this.obstacleDestroyedCache,
      cageHp: this.cageHpCache,
      cageDestroyed: this.cageDestroyedCache,
      ...(this.activeWeaponCache !== undefined && { activeWeapon: this.activeWeaponCache }),
    };
    if (this.phase === 'infiltrate') {
      return {
        phase: this.phase,
        objective: 'Reach the compound and destroy the holding cage',
        progress: 0,
        ...shared,
      };
    }
    if (this.phase === 'located') {
      return {
        phase: this.phase,
        objective: 'Destroy the holding cage to free the prisoner',
        progress: 0.4,
        ...shared,
      };
    }
    if (this.phase === 'escorting') {
      return {
        phase: this.phase,
        objective: 'Escort the prisoner to the extraction point',
        progress: 0.7,
        ...shared,
      };
    }
    if (this.phase === 'failed') {
      return {
        phase: this.phase,
        objective: 'Operation compromised',
        progress: 0,
        ...shared,
      };
    }
    return {
      phase: this.phase,
      objective: 'Prisoner extracted',
      progress: 1,
      ...shared,
    };
  }

  /** Cached each `update()` call so `snapshot()` stays a pure read of scenario state. */
  private armedTrapCountCache = 0;
  private obstacleDestroyedCache = false;
  private cageHpCache = 0;
  private cageDestroyedCache = false;
  private activeWeaponCache: string | undefined;

  restore(snapshot: {
    phase: SilentExtractionPhase;
    prisonerEntity?: number;
    obstacleEntity?: number;
    cageEntity?: number;
    environmentSpawned?: boolean;
  }): void {
    this.phase = snapshot.phase;
    this.prisonerEntity = asEntityId(snapshot.prisonerEntity ?? -1);
    this.obstacleEntity = asEntityId(snapshot.obstacleEntity ?? -1);
    this.cageEntity = asEntityId(snapshot.cageEntity ?? -1);
    this.environmentSpawned = snapshot.environmentSpawned ?? false;
  }

  serialize(): {
    phase: SilentExtractionPhase;
    prisonerEntity: number;
    obstacleEntity: number;
    cageEntity: number;
    environmentSpawned: boolean;
  } {
    return {
      phase: this.phase,
      prisonerEntity: this.prisonerEntity,
      obstacleEntity: this.obstacleEntity,
      cageEntity: this.cageEntity,
      environmentSpawned: this.environmentSpawned,
    };
  }

  update(world: World, grid: NavGrid, economy: PlayerEconomy, tick: number): void {
    void economy;
    void tick;
    this.spawnEnvironmentOnce(world, grid);
    this.armedTrapCountCache = this.countArmedTraps(world);
    this.obstacleDestroyedCache = this.isObstacleDestroyed(world);
    this.cageHpCache = this.cageHp(world);
    this.cageDestroyedCache = this.isCageDestroyed(world);
    const operative = this.findOperative(world);
    const loadout = operative !== null ? world.get(operative, WeaponLoadout) : undefined;
    this.activeWeaponCache = loadout?.weapons[loadout.activeIndex]?.id;
    if (this.phase === 'extracted' || this.phase === 'failed') return;

    if (operative === null) {
      this.phase = 'failed';
      return;
    }

    if (this.phase === 'infiltrate') {
      if (this.reached(world, operative, this.config.prisonerAt)) this.phase = 'located';
      return;
    }

    if (this.phase === 'located') {
      if (!this.isCageDestroyed(world)) return;
      this.prisonerEntity = spawnUnit(world, 'prisoner', this.config.player, {
        x: fp.add(this.config.prisonerAt.x, fp.fromInt(1)),
        y: this.config.prisonerAt.y,
      });
      this.phase = 'escorting';
      return;
    }

    // escorting
    const prisoner = this.findPrisoner(world);
    if (prisoner === null) {
      this.phase = 'failed';
      return;
    }
    if (this.reached(world, prisoner, this.config.extractionAt)) this.phase = 'extracted';
  }

  private findOperative(world: World): EntityId | null {
    for (const entity of world.query(Owner, UnitType, Health)) {
      const owner = world.get(entity, Owner)!;
      if (owner.player !== this.config.player) continue;
      const unitType = world.get(entity, UnitType)!;
      if (unitType.kind !== 'operative') continue;
      const health = world.get(entity, Health)!;
      if (health.hp <= 0) continue;
      return entity;
    }
    return null;
  }

  private findPrisoner(world: World): EntityId | null {
    if (this.prisonerEntity < 0) return null;
    if (!world.has(this.prisonerEntity, Health)) return null;
    const health = world.get(this.prisonerEntity, Health)!;
    if (health.hp <= 0) return null;
    return this.prisonerEntity;
  }

  private reached(world: World, entity: EntityId, target: Vec2): boolean {
    const radius = fp.fromInt(5);
    const radiusSquared = fp.mul(radius, radius);
    const position = world.get(entity, Position)!;
    const dx = fp.sub(position.x, target.x);
    const dy = fp.sub(position.y, target.y);
    return fp.add(fp.mul(dx, dx), fp.mul(dy, dy)) <= radiusSquared;
  }

  /**
   * Spawns the optional obstacle wall + traps exactly once, at the first tick this
   * scenario runs (or right after a save load, guarded by `environmentSpawned`).
   * Placed here — rather than as bare map content — because both are tied to this
   * mission's story beats (an alt-route wall, patrol traps) and their lifecycle
   * (fuse timers, disarm state) is scenario-scoped.
   */
  private spawnEnvironmentOnce(world: World, grid: NavGrid): void {
    if (this.environmentSpawned) return;
    this.environmentSpawned = true;
    const hostilePlayer = hostilePlayerOf(this.config.player);
    if (this.config.obstacleAt) {
      this.obstacleEntity = spawnBuilding(world, grid, 'concrete_wall', hostilePlayer, {
        x: this.config.obstacleAt.x,
        y: this.config.obstacleAt.y,
      });
    }
    for (const at of this.config.trapPositions ?? []) {
      const trap = world.createEntity();
      world.add(trap, Position, { x: at.x, y: at.y });
      world.add(trap, Owner, { player: asPlayerId(hostilePlayer) });
      world.add(trap, Trap, {
        armed: true,
        damage: 60,
        radius: fp.fromInt(3),
        triggerRadius: fp.fromInt(2),
      });
    }
    // The prisoner is locked in a destructible cage rather than simply "found" —
    // reaching it flips 'infiltrate' -> 'located', but freeing her requires reducing
    // the cage's Health to 0 via the normal combat/demolition pipeline.
    this.cageEntity = spawnBuilding(world, grid, 'cage', hostilePlayer, {
      x: this.config.prisonerAt.x,
      y: this.config.prisonerAt.y,
    });
    for (const at of this.config.patrolPositions ?? []) {
      spawnUnit(world, 'rifleman', hostilePlayer, { x: at.x, y: at.y });
    }
    for (const at of this.config.basePerimeter ?? []) {
      spawnBuilding(world, grid, 'concrete_wall', hostilePlayer, { x: at.x, y: at.y });
    }
  }

  private countArmedTraps(world: World): number {
    let count = 0;
    for (const entity of world.query(Trap)) {
      if (world.get(entity, Trap)!.armed) count++;
    }
    return count;
  }

  private isObstacleDestroyed(world: World): boolean {
    if (!this.config.obstacleAt) return false;
    if (this.obstacleEntity < 0) return false;
    return !world.isAlive(this.obstacleEntity);
  }

  private cageHp(world: World): number {
    if (this.cageEntity < 0) return 0;
    const health = world.get(this.cageEntity, Health);
    return health ? Math.max(0, health.hp) : 0;
  }

  private isCageDestroyed(world: World): boolean {
    if (this.cageEntity < 0) return false;
    return !world.isAlive(this.cageEntity);
  }
}

export function createSilentExtractionSystem(
  scenario: SilentExtractionState,
  grid: NavGrid,
  economy: PlayerEconomy,
): System {
  return {
    name: 'SilentExtractionSystem',
    update(world, ctx) {
      scenario.update(world, grid, economy, ctx.tick);
    },
  };
}
