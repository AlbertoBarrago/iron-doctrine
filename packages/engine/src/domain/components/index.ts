/**
 * Core simulation components. Components are plain data; behavior lives in systems.
 * All spatial/quantitative fields use fixed-point to preserve determinism.
 */
import { defineComponent } from '../../application/ecs/component.js';
import * as fp from '../math/fixed.js';
import { zero, type Vec2 } from '../math/vec2.js';
import { asPlayerId, type PlayerId } from '@iron/shared';

/** World-space position (fixed-point units). */
export const Position = defineComponent<Vec2>('Position', zero);

/** Velocity in units/second (fixed-point). */
export const Velocity = defineComponent<Vec2>('Velocity', zero);

/**
 * Facing as a unit direction vector (fixed-point). Stored as a vector rather than an
 * angle so it stays fully deterministic (no transcendental functions in sim state);
 * the renderer derives a display angle via atan2.
 */
export interface FacingData {
  dir: Vec2;
}
export const Facing = defineComponent<FacingData>('Facing', () => ({
  dir: { x: fp.FP.ONE, y: fp.FP.ZERO },
}));

/** Hit points. */
export interface HealthData {
  hp: number;
  max: number;
}
export const Health = defineComponent<HealthData>('Health', () => ({ hp: 100, max: 100 }));

/** Ownership by a player slot. */
export interface OwnerData {
  player: PlayerId;
}
export const Owner = defineComponent<OwnerData>('Owner', () => ({ player: asPlayerId(0) }));

/** Stable content identifier for a mobile unit archetype. */
export interface UnitTypeData {
  kind: string;
}
export const UnitType = defineComponent<UnitTypeData>('UnitType', () => ({ kind: 'unit' }));

/** Movement intent: target destination and max speed (units/sec). */
export interface MovementData {
  target: Vec2 | null;
  speed: fp.Fixed;
}
export const Movement = defineComponent<MovementData>('Movement', () => ({
  target: null,
  speed: fp.fromInt(4),
}));

/**
 * A resolved path the unit is following. `goal` records the target the path was
 * computed for, so the PathfindingSystem can detect when a new order invalidates it.
 */
export interface PathData {
  waypoints: Vec2[];
  index: number;
  goal: Vec2;
}
export const Path = defineComponent<PathData>('Path', () => ({
  waypoints: [],
  index: 0,
  goal: zero(),
}));

/** Selection flag (client-driven, but part of sim so it can be commanded/queried). */
export interface SelectableData {
  radius: fp.Fixed;
}
export const Selectable = defineComponent<SelectableData>('Selectable', () => ({
  radius: fp.fromInt(1),
}));

/**
 * Weapon stats. `projectileSpeed` of 0 means an instant (melee/hitscan) hit; a
 * positive value spawns a travelling projectile. `cooldownTicks` gates fire rate;
 * `cooldownLeft` counts down each tick.
 */
export interface WeaponData {
  damage: number;
  range: fp.Fixed;
  cooldownTicks: number;
  cooldownLeft: number;
  projectileSpeed: fp.Fixed;
}
export const Weapon = defineComponent<WeaponData>('Weapon', () => ({
  damage: 10,
  range: fp.fromInt(5),
  cooldownTicks: 20,
  cooldownLeft: 0,
  projectileSpeed: fp.fromInt(0),
}));

/**
 * Current attack target (entity id, or -1 when none). `chase` distinguishes an
 * explicit player order (pursue the target out of range) from an auto-acquired one
 * (engage only within range, no pursuit — a leash).
 */
export interface AttackData {
  target: number;
  chase: boolean;
}
export const Attack = defineComponent<AttackData>('Attack', () => ({ target: -1, chase: false }));

/** A harvestable resource deposit (ore field) with a finite amount remaining. */
export interface ResourceNodeData {
  amount: number;
}
export const ResourceNode = defineComponent<ResourceNodeData>('ResourceNode', () => ({
  amount: 1000,
}));

/** Cargo hold for a harvester. */
export interface ResourceCarrierData {
  amount: number;
  capacity: number;
}
export const ResourceCarrier = defineComponent<ResourceCarrierData>('ResourceCarrier', () => ({
  amount: 0,
  capacity: 200,
}));

/** Harvester gathering state machine. `node`/`base` are entity ids or -1. */
export type HarvestPhase = 'idle' | 'toNode' | 'gathering' | 'toBase' | 'depositing' | 'paused';
export interface HarvestData {
  phase: HarvestPhase;
  node: number;
  gatherLeft: number;
}
export const Harvest = defineComponent<HarvestData>('Harvest', () => ({
  phase: 'idle',
  node: -1,
  gatherLeft: 0,
}));

/** Sight radius (world units). Vision sources reveal fog of war for their team. */
export interface VisionData {
  radius: fp.Fixed;
}
export const Vision = defineComponent<VisionData>('Vision', () => ({ radius: fp.fromInt(6) }));

/** Power produced/consumed by a building. Aggregated per player by the EnergySystem. */
export interface EnergyData {
  produced: number;
  consumed: number;
}
export const Energy = defineComponent<EnergyData>('Energy', () => ({ produced: 0, consumed: 0 }));

/** Marks a building that harvesters can deposit resources at (refinery / base). */
export interface DropOffData {
  _: 0;
}
export const DropOff = defineComponent<DropOffData>('DropOff', () => ({ _: 0 }));

/**
 * Production queue on a building (barracks/factory). Units are charged on enqueue and
 * built one at a time; `progressTicks` counts up to the front unit's build time.
 * Finished units spawn at the building edge and move to `rally` if set.
 */
export interface ProductionData {
  queue: string[];
  progressTicks: number;
  rally: Vec2 | null;
  /** Which unit categories this building can produce. */
  produces: string[];
}
export const Production = defineComponent<ProductionData>('Production', () => ({
  queue: [],
  progressTicks: 0,
  rally: null,
  produces: [],
}));

/** Marks a building entity (as opposed to a mobile unit) for rendering/queries. */
export interface BuildingData {
  kind: string;
  footprint: number;
}
export const Building = defineComponent<BuildingData>('Building', () => ({
  kind: 'structure',
  footprint: 2,
}));

/** Progress for a placed building that is not operational yet. */
export interface ConstructionData {
  progressTicks: number;
  buildTicks: number;
}
export const Construction = defineComponent<ConstructionData>('Construction', () => ({
  progressTicks: 0,
  buildTicks: 1,
}));

/** In-flight projectile heading toward a target position, carrying damage + owner. */
export interface ProjectileData {
  target: number;
  toPos: Vec2;
  speed: fp.Fixed;
  damage: number;
  owner: PlayerId;
}
export const Projectile = defineComponent<ProjectileData>('Projectile', () => ({
  target: -1,
  toPos: zero(),
  speed: fp.fromInt(12),
  damage: 10,
  owner: asPlayerId(0),
}));
