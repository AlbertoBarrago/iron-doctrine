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
import { Position, Selectable, UnitType } from '../../domain/components/index.js';
import * as fp from '../../domain/math/fixed.js';
import * as v2 from '../../domain/math/vec2.js';
import type { EntityId } from '@iron/shared';

export interface UnitSeparationDiagnostics {
  pairChecks: number;
}

export function createUnitSeparationSystem(
  grid: NavGrid,
  diagnostics?: UnitSeparationDiagnostics,
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
              separatePair(world, grid, left, right);
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

function separatePair(world: World, grid: NavGrid, left: EntityId, right: EntityId): void {
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

  if (canOccupy(grid, nextLeft) && canOccupy(grid, nextRight)) {
    world.add(left, Position, nextLeft);
    world.add(right, Position, nextRight);
    return;
  }

  // If one side is blocked, resolve the full overlap through the other unit.
  const fullCorrection = fp.sub(minimumDistance, distance);
  const fullOffset = v2.scale(direction, fullCorrection);
  const leftOnly = v2.sub(leftPosition, fullOffset);
  if (canOccupy(grid, leftOnly)) {
    world.add(left, Position, leftOnly);
    return;
  }
  const rightOnly = v2.add(rightPosition, fullOffset);
  if (canOccupy(grid, rightOnly)) world.add(right, Position, rightOnly);
}

function canOccupy(grid: NavGrid, position: v2.Vec2): boolean {
  const cell = grid.worldToCell(position.x, position.y);
  return grid.inBounds(cell.cx, cell.cy) && !grid.isBlocked(cell.cx, cell.cy);
}
