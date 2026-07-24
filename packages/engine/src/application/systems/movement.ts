/**
 * MovementSystem: advances entities along their {@link Path} (or straight toward the
 * target if no path was resolved) at a bounded per-tick step. Pure fixed-point
 * integration — no floats, no wall-clock — so positions are identical on every peer.
 *
 * Local unit-vs-unit avoidance is layered on top by the CollisionSystem; this system
 * provides the deterministic waypoint-following motion it steers.
 */
import type { System, TickContext } from '../ecs/system.js';
import type { World } from '../ecs/world.js';
import { Position, Movement, Facing, FlowMovement, Path } from '../../domain/components/index.js';
import * as fp from '../../domain/math/fixed.js';
import * as v2 from '../../domain/math/vec2.js';
import type { Vec2 } from '../../domain/math/vec2.js';

/** Arrival threshold (squared) — within this distance a waypoint is considered reached. */
const ARRIVE_EPS_SQ = fp.fromFloat(0.01);

export const MovementSystem: System = {
  name: 'MovementSystem',
  update(world: World, ctx: TickContext): void {
    for (const e of world.query(Position, Movement)) {
      if (world.has(e, FlowMovement)) continue;
      const move = world.get(e, Movement)!;
      if (move.target === null) continue;

      const pos = world.get(e, Position)!;
      const path = world.get(e, Path);
      const waypoint: Vec2 = path ? path.waypoints[path.index]! : move.target;

      const toTarget = v2.sub(waypoint, pos);
      const distSq = v2.lenSq(toTarget);
      const step = fp.mul(move.speed, ctx.dt);
      const stepSq = fp.mul(step, step);

      if (distSq <= ARRIVE_EPS_SQ || distSq <= stepSq) {
        // Reached this waypoint: snap onto it.
        world.add(e, Position, v2.clone(waypoint));
        if (path && path.index < path.waypoints.length - 1) {
          path.index++; // advance to next waypoint next tick
        } else {
          // Final waypoint reached: order complete.
          move.target = null;
          if (world.has(e, Path)) world.remove(e, Path);
        }
        continue;
      }

      const dir = v2.normalize(toTarget);
      world.add(e, Position, v2.add(pos, v2.scale(dir, step)));
      if (world.has(e, Facing)) world.add(e, Facing, { dir });
    }
  },
};
