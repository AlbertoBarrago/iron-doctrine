/**
 * Registry of every serializable component type, used by the save/load system to
 * round-trip world state generically. Any new component that must persist has to be
 * added here — the save round-trip test guards against omissions.
 */
import type { ComponentType } from '../../application/ecs/component.js';
import {
  Position,
  Velocity,
  Facing,
  Health,
  Owner,
  UnitType,
  Movement,
  Path,
  Selectable,
  Weapon,
  Attack,
  Vision,
  Energy,
  DropOff,
  Building,
  Construction,
  Production,
  Projectile,
  ResourceNode,
  ResourceCarrier,
  Harvest,
} from './index.js';

export const ALL_COMPONENTS: ReadonlyArray<ComponentType<unknown>> = [
  Position,
  Velocity,
  Facing,
  Health,
  Owner,
  UnitType,
  Movement,
  Path,
  Selectable,
  Weapon,
  Attack,
  Vision,
  Energy,
  DropOff,
  Building,
  Construction,
  Production,
  Projectile,
  ResourceNode,
  ResourceCarrier,
  Harvest,
] as ReadonlyArray<ComponentType<unknown>>;

export const COMPONENT_BY_NAME: ReadonlyMap<string, ComponentType<unknown>> = new Map(
  ALL_COMPONENTS.map((c) => [c.name, c]),
);
