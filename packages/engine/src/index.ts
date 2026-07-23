/** Public engine API surface. Consumers (client worker, server) import from here only. */
export * from './application/ecs/index.js';
export * as math from './domain/math/index.js';
export { fp, v2, Random } from './domain/math/index.js';
export type { Fixed, Vec2 } from './domain/math/index.js';

// Components
export * as components from './domain/components/index.js';

// Archetypes
export { spawnUnit, UNIT_STATS } from './domain/archetypes/units.js';
export type { UnitStats } from './domain/archetypes/units.js';

// Systems
export { MovementSystem } from './application/systems/movement.js';
export { createCommandSystem } from './application/systems/command-system.js';
export { createPathfindingSystem } from './application/systems/pathfinding-system.js';
export { createCombatSystem } from './application/systems/combat.js';
export { ProjectileSystem } from './application/systems/projectile.js';
export { HealthSystem } from './application/systems/health.js';
export { createProductionSystem } from './application/systems/production-system.js';
export { ConstructionSystem } from './application/systems/construction-system.js';
export { createResourceSystem } from './application/systems/resource-system.js';
export { createEnergySystem } from './application/systems/energy-system.js';
export { createFogSystem } from './application/systems/fog-system.js';
export type { TeamResolver } from './application/systems/fog-system.js';
export { createAISystem } from './application/ai/ai-director.js';
export type { AIPlayerConfig, Difficulty } from './application/ai/ai-director.js';

// Fog of war
export { FogOfWar, HIDDEN, EXPLORED, VISIBLE } from './application/fog/fog-of-war.js';

// Persistence: save/load + replay
export {
  saveSimulation,
  loadSimulation,
  serializeSave,
  deserializeSave,
} from './application/persistence/save.js';
export type { SaveState } from './application/persistence/save.js';
export { ReplayRecorder, runReplay } from './application/persistence/replay.js';
export type { Replay, ReplayCommand, ReplayResult } from './application/persistence/replay.js';

// Economy
export { PlayerEconomy } from './domain/economy/player-economy.js';
export type { PlayerResources, PowerBalance } from './domain/economy/player-economy.js';

// Tech tree
export { TechState, TECH_TREE, UNIT_TECH_REQUIREMENT } from './domain/tech/tech-tree.js';
export type { TechDef } from './domain/tech/tech-tree.js';

// Building & resource archetypes
export {
  spawnBuilding,
  activateBuilding,
  canPlaceBuilding,
  BUILDING_STATS,
} from './domain/archetypes/buildings.js';
export type { BuildingStats } from './domain/archetypes/buildings.js';
export { spawnResourceNode } from './domain/archetypes/resources.js';

// Pathfinding
export {
  NavGrid,
  findPath,
  smoothPath,
  hasLineOfSight,
  FlowField,
} from './application/pathfinding/index.js';
export type { Cell } from './application/pathfinding/index.js';

// Formations
export { computeFormationSlots } from './domain/movement/formation.js';

// Commands
export { CommandBus } from './application/commands/command.js';
export type {
  Command,
  MoveCommand,
  StopCommand,
  SpawnUnitCommand,
  PlaceBuildingCommand,
} from './application/commands/command.js';

// Simulation + snapshot
export { Simulation } from './application/simulation.js';
export type { SimulationConfig } from './application/simulation.js';
export { FirstContactState } from './application/scenario/first-contact.js';
export type {
  FirstContactConfig,
  FirstContactPhase,
  FirstContactSnapshot,
} from './application/scenario/first-contact.js';
export { buildSnapshot, hashState } from './application/snapshot.js';
export type {
  Snapshot,
  EntitySnapshot,
  ProductionSnapshot,
  ConstructionSnapshot,
  PlayerSnapshot,
  FogSnapshot,
  EntityKind,
} from './application/snapshot.js';

// Match lifecycle
export { MatchState, createMatchSystem } from './application/match/match-state.js';
export type { MatchStatus, MatchStateSnapshot } from './application/match/match-state.js';
