/**
 * Resolves hostile infantry caught beneath a moving crush-capable vehicle.
 * Unit separation deliberately permits these pairs to overlap; destruction remains
 * deferred to HealthSystem so iteration and match accounting stay deterministic.
 */
import type { System } from '../ecs/system.js';
import type { World } from '../ecs/world.js';
import {
  Health,
  Movement,
  Owner,
  Position,
  Selectable,
  UnitType,
} from '../../domain/components/index.js';
import { UNIT_STATS } from '../../domain/archetypes/units.js';
import * as fp from '../../domain/math/fixed.js';
import * as v2 from '../../domain/math/vec2.js';
import type { TeamResolver } from './fog-system.js';

export function createVehicleCrushSystem(teamOf: TeamResolver): System {
  return {
    name: 'VehicleCrushSystem',
    update(world: World): void {
      const units = world.query(Position, Selectable, UnitType, Owner);
      for (const vehicle of units) {
        const vehicleType = world.get(vehicle, UnitType)!.kind;
        const vehicleStats = UNIT_STATS[vehicleType];
        const movement = world.get(vehicle, Movement);
        if (!vehicleStats?.canCrush || movement?.target === null || movement === undefined)
          continue;

        const vehicleOwner = world.get(vehicle, Owner)!.player;
        const vehiclePosition = world.get(vehicle, Position)!;
        const vehicleRadius = world.get(vehicle, Selectable)!.radius;
        for (const target of units) {
          if (target === vehicle || !world.has(target, Health)) continue;
          const targetStats = UNIT_STATS[world.get(target, UnitType)!.kind];
          const targetOwner = world.get(target, Owner)!.player;
          if (
            targetStats?.movementClass !== 'infantry' ||
            teamOf(targetOwner) === teamOf(vehicleOwner)
          ) {
            continue;
          }

          const targetRadius = world.get(target, Selectable)!.radius;
          const contact = fp.add(vehicleRadius, targetRadius);
          if (v2.distSq(vehiclePosition, world.get(target, Position)!) < fp.mul(contact, contact)) {
            world.get(target, Health)!.hp = 0;
          }
        }
      }
    },
  };
}
