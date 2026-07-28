/**
 * Deterministic local separation for mobile units.
 *
 * Pathfinding keeps units away from static obstacles and formations spread shared
 * destinations, but neither resolves units that meet while travelling. This pass runs
 * after movement and applies the minimum symmetric correction to overlapping pairs.
 */
import type { System } from '../ecs/system.js';
import type { World } from '../ecs/world.js';
import type { NavGrid } from '../pathfinding/nav-grid.js';
import { Movement, Owner, Position, Selectable, UnitType } from '../../domain/components/index.js';
import * as fp from '../../domain/math/fixed.js';
import * as v2 from '../../domain/math/vec2.js';
import type { EntityId } from '@iron/shared';
import { UNIT_STATS } from '../../domain/archetypes/units.js';
import type { TeamResolver } from './fog-system.js';

export interface UnitSeparationDiagnostics {
  pairChecks: number;
}

export function createUnitSeparationSystem(
  grid: NavGrid,
  diagnostics?: UnitSeparationDiagnostics,
  teamOf: TeamResolver = (player) => player,
): System {
  return {
    name: 'UnitSeparationSystem',
    update(world: World): void {
      const units = world.query(Position, Selectable, UnitType);
      const buckets = new Map<string, EntityId[]>();
      let maximumRadius = fp.FP.ZERO;
      if (diagnostics) diagnostics.pairChecks = 0;

      for (const entity of units) {
        const position = world.get(entity, Position)!;
        const cell = grid.worldToCell(position.x, position.y);
        const key = bucketKey(cell.cx, cell.cy);
        const bucket = buckets.get(key);
        if (bucket) bucket.push(entity);
        else buckets.set(key, [entity]);
        const radius = world.get(entity, Selectable)!.radius;
        if (radius > maximumRadius) maximumRadius = radius;
      }

      const neighborRange = Math.max(
        1,
        Math.ceil(fp.toFloat(fp.div(fp.mul(maximumRadius, fp.fromInt(2)), grid.cellSize))),
      );

      for (const left of units) {
        const position = world.get(left, Position)!;
        const cell = grid.worldToCell(position.x, position.y);
        for (let dy = -neighborRange; dy <= neighborRange; dy++) {
          for (let dx = -neighborRange; dx <= neighborRange; dx++) {
            const nearby = buckets.get(bucketKey(cell.cx + dx, cell.cy + dy));
            if (!nearby) continue;
            for (const right of nearby) {
              if (right <= left) continue;
              if (diagnostics) diagnostics.pairChecks++;
              separatePair(world, grid, left, right, teamOf);
            }
          }
        }
      }
    },
  };
}

function bucketKey(cx: number, cy: number): string {
  return `${cx}:${cy}`;
}

function separatePair(
  world: World,
  grid: NavGrid,
  left: EntityId,
  right: EntityId,
  teamOf: TeamResolver,
): void {
  if (isCrushingPair(world, left, right, teamOf) || isCrushingPair(world, right, left, teamOf)) {
    return;
  }
  const leftPosition = world.get(left, Position)!;
  const rightPosition = world.get(right, Position)!;
  const minimumDistance = fp.add(
    world.get(left, Selectable)!.radius,
    world.get(right, Selectable)!.radius,
  );
  const delta = v2.sub(rightPosition, leftPosition);
  const distanceSquared = v2.lenSq(delta);
  if (distanceSquared >= fp.mul(minimumDistance, minimumDistance)) return;

  const direction =
    distanceSquared === fp.FP.ZERO
      ? { x: left < right ? fp.FP.ONE : fp.neg(fp.FP.ONE), y: fp.FP.ZERO }
      : v2.normalize(delta);
  const distance = distanceSquared === fp.FP.ZERO ? fp.FP.ZERO : v2.len(delta);
  const correction = fp.div(fp.sub(minimumDistance, distance), fp.fromInt(2));
  const offset = v2.scale(direction, correction);
  const nextLeft = v2.sub(leftPosition, offset);
  const nextRight = v2.add(rightPosition, offset);

  const leftRadius = world.get(left, Selectable)!.radius;
  const rightRadius = world.get(right, Selectable)!.radius;
  if (canOccupy(grid, nextLeft, leftRadius) && canOccupy(grid, nextRight, rightRadius)) {
    world.add(left, Position, nextLeft);
    world.add(right, Position, nextRight);
    return;
  }

  // If one side is blocked, resolve the full overlap through the other unit.
  const fullCorrection = fp.sub(minimumDistance, distance);
  const fullOffset = v2.scale(direction, fullCorrection);
  const leftOnly = v2.sub(leftPosition, fullOffset);
  if (canOccupy(grid, leftOnly, leftRadius)) {
    world.add(left, Position, leftOnly);
    return;
  }
  const rightOnly = v2.add(rightPosition, fullOffset);
  if (canOccupy(grid, rightOnly, rightRadius)) world.add(right, Position, rightOnly);
}

function isCrushingPair(
  world: World,
  vehicle: EntityId,
  infantry: EntityId,
  teamOf: TeamResolver,
): boolean {
  const vehicleStats = UNIT_STATS[world.get(vehicle, UnitType)!.kind];
  const infantryStats = UNIT_STATS[world.get(infantry, UnitType)!.kind];
  const movement = world.get(vehicle, Movement);
  const vehicleOwner = world.get(vehicle, Owner);
  const infantryOwner = world.get(infantry, Owner);
  return (
    vehicleStats?.canCrush === true &&
    movement?.target !== null &&
    movement !== undefined &&
    infantryStats?.movementClass === 'infantry' &&
    vehicleOwner !== undefined &&
    infantryOwner !== undefined &&
    teamOf(vehicleOwner.player) !== teamOf(infantryOwner.player)
  );
}

function canOccupy(grid: NavGrid, position: v2.Vec2, radius: fp.Fixed): boolean {
  const cell = grid.worldToCell(position.x, position.y);
  return grid.isTraversable(cell.cx, cell.cy, grid.clearanceForRadius(radius));
}
