/**
 * The Simulation orchestrates the deterministic fixed-step tick: it owns the World,
 * the seeded PRNG, the CommandBus and the system Scheduler. Calling {@link step}
 * advances exactly one tick. Given identical seed and command stream, two Simulation
 * instances (client worker, server, replay) produce bit-identical state.
 */
import { World } from './ecs/world.js';
import { Scheduler } from './ecs/scheduler.js';
import type { System, TickContext } from './ecs/system.js';
import { CommandBus, type Command } from './commands/command.js';
import { createCommandSystem } from './systems/command-system.js';
import { createPathfindingSystem } from './systems/pathfinding-system.js';
import { MovementSystem } from './systems/movement.js';
import { createFlowMovementSystem } from './systems/flow-movement.js';
import { createUnitSeparationSystem } from './systems/unit-separation.js';
import { createVehicleCrushSystem } from './systems/vehicle-crush.js';
import { createCombatSystem } from './systems/combat.js';
import { createProjectileSystem } from './systems/projectile.js';
import { createHealthSystem } from './systems/health.js';
import { DemolitionSystem } from './systems/demolition-system.js';
import { TrapSystem, DisarmingSystem } from './systems/trap-system.js';
import { HealingSystem } from './systems/healing-system.js';
import { createResourceSystem } from './systems/resource-system.js';
import { createEnergySystem } from './systems/energy-system.js';
import { createFogSystem, type TeamResolver } from './systems/fog-system.js';
import { createProductionSystem } from './systems/production-system.js';
import { ConstructionSystem } from './systems/construction-system.js';
import { createAISystem, type AIPlayerConfig } from './ai/ai-director.js';
import { PlayerEconomy } from '../domain/economy/player-economy.js';
import { TechState } from '../domain/tech/tech-tree.js';
import { FogOfWar } from './fog/fog-of-war.js';
import { NavGrid } from './pathfinding/nav-grid.js';
import { Random } from '../domain/math/rng.js';
import * as fp from '../domain/math/fixed.js';
import { buildSnapshot, hashState, type Snapshot } from './snapshot.js';
import { SIM_HZ, asPlayerId, asTick } from '@iron/shared';
import { createMatchSystem, MatchState } from './match/match-state.js';
import { MatchMetrics } from './match/match-metrics.js';
import { HIDDEN } from './fog/fog-of-war.js';
import {
  createFirstContactSystem,
  FirstContactState,
  type FirstContactConfig,
} from './scenario/first-contact.js';
import { createIronPassSystem, IronPassState, type IronPassConfig } from './scenario/iron-pass.js';
import {
  createSiegeLineSystem,
  SiegeLineState,
  type SiegeLineConfig,
} from './scenario/siege-line.js';
import {
  createBlackDawnSystem,
  BlackDawnState,
  type BlackDawnConfig,
} from './scenario/black-dawn.js';
import {
  createSilentExtractionSystem,
  SilentExtractionState,
  type SilentExtractionConfig,
} from './scenario/silent-extraction.js';
import { BattlefieldCover } from './combat/battlefield-cover.js';

export interface SimulationConfig {
  seed: number;
  /** Navigation grid for the map. Defaults to a 128×128 open, world-centred grid. */
  grid?: NavGrid;
  /** Authored blocked map cells that provide directional infantry cover. */
  coverCells?: readonly (readonly [number, number])[];
  /** Maps players to vision-sharing teams. Identity (team = player) by default. */
  teamOf?: TeamResolver;
  /** AI-controlled players and their difficulty. */
  aiPlayers?: AIPlayerConfig[];
  /** Credits granted to each player at match start. */
  startingCredits?: Record<number, number>;
  /** Techs unlocked for each player at match start. */
  startingTech?: Record<number, string[]>;
  /** Enables deterministic victory rules for the listed match participants. */
  matchPlayers?: number[];
  /** Optional authored opening that recovers the player's base through exploration. */
  firstContact?: FirstContactConfig;
  /** Optional scripted armored ambush triggered when the player crosses a chokepoint. */
  ironPass?: IronPassConfig;
  /** Optional scripted assault waves the player must hold a position against. */
  siegeLine?: SiegeLineConfig;
  /** Optional scripted last stand triggered once the hostile command is critically damaged. */
  blackDawn?: BlackDawnConfig;
  /** Optional single-operator infiltration/rescue scenario (Silent Extraction). */
  silentExtraction?: SilentExtractionConfig;
}

interface Deps {
  bus: CommandBus;
  grid: NavGrid;
  economy: PlayerEconomy;
  tech: TechState;
  fog: FogOfWar;
  teamOf: TeamResolver;
  aiPlayers: AIPlayerConfig[];
  match: MatchState | null;
  firstContact: FirstContactState | null;
  ironPass: IronPassState | null;
  siegeLine: SiegeLineState | null;
  blackDawn: BlackDawnState | null;
  silentExtraction: SilentExtractionState | null;
  metrics: MatchMetrics;
  cover: BattlefieldCover;
}

/** Default ordered pipeline for the current milestone. */
const defaultSystems = (d: Deps): System[] => [
  createCommandSystem(d.bus, d.grid, d.economy, d.tech),
  ConstructionSystem,
  ...(d.firstContact ? [createFirstContactSystem(d.firstContact, d.grid, d.economy)] : []),
  ...(d.ironPass ? [createIronPassSystem(d.ironPass)] : []),
  ...(d.siegeLine ? [createSiegeLineSystem(d.siegeLine)] : []),
  ...(d.blackDawn ? [createBlackDawnSystem(d.blackDawn)] : []),
  ...(d.silentExtraction
    ? [createSilentExtractionSystem(d.silentExtraction, d.grid, d.economy)]
    : []),
  createAISystem(
    d.aiPlayers,
    d.bus,
    d.economy,
    d.tech,
    d.teamOf,
    d.firstContact ? () => d.firstContact!.activationOriginTick : undefined,
  ),
  // Energy is recomputed before combat so power-gated defenses see the current balance.
  createEnergySystem(d.economy),
  createResourceSystem(d.economy, d.metrics),
  createProductionSystem(d.grid),
  createFlowMovementSystem(d.grid),
  createPathfindingSystem(d.grid),
  MovementSystem,
  createUnitSeparationSystem(d.grid, undefined, d.teamOf),
  createVehicleCrushSystem(d.teamOf, d.metrics),
  createCombatSystem(d.economy, d.metrics, d.cover),
  createProjectileSystem(d.metrics, d.cover),
  HealingSystem,
  TrapSystem,
  DisarmingSystem,
  DemolitionSystem,
  createHealthSystem(d.grid, d.metrics),
  ...(d.match
    ? [
        createMatchSystem(
          d.match,
          d.siegeLine ? () => d.siegeLine!.phase === 'counter-attack' : undefined,
        ),
      ]
    : []),
  createFogSystem(d.fog, d.teamOf),
];

export class Simulation {
  readonly world = new World();
  readonly bus = new CommandBus();
  readonly grid: NavGrid;
  readonly economy = new PlayerEconomy();
  readonly tech = new TechState();
  readonly fog: FogOfWar;
  readonly teamOf: TeamResolver;
  readonly rng: Random;
  readonly match: MatchState | null;
  readonly firstContact: FirstContactState | null;
  readonly ironPass: IronPassState | null;
  readonly siegeLine: SiegeLineState | null;
  readonly blackDawn: BlackDawnState | null;
  readonly silentExtraction: SilentExtractionState | null;
  readonly metrics = new MatchMetrics();
  readonly cover: BattlefieldCover;
  private readonly scheduler = new Scheduler();
  private readonly dt = fp.fromFloat(1 / SIM_HZ);
  private currentTick = 0;

  constructor(config: SimulationConfig) {
    this.rng = new Random(config.seed);
    this.grid = config.grid ?? new NavGrid(128, 128, fp.fromInt(1));
    this.cover = new BattlefieldCover(this.grid, config.coverCells);
    this.fog = new FogOfWar(this.grid);
    this.teamOf = config.teamOf ?? ((player) => player);
    this.match = config.matchPlayers?.length
      ? new MatchState(config.matchPlayers.map((player) => asPlayerId(player)))
      : null;
    this.firstContact = config.firstContact ? new FirstContactState(config.firstContact) : null;
    this.ironPass = config.ironPass ? new IronPassState(config.ironPass) : null;
    this.siegeLine = config.siegeLine ? new SiegeLineState(config.siegeLine) : null;
    this.blackDawn = config.blackDawn ? new BlackDawnState(config.blackDawn) : null;
    this.silentExtraction = config.silentExtraction
      ? new SilentExtractionState(config.silentExtraction)
      : null;
    if (config.startingCredits) {
      for (const [player, amount] of Object.entries(config.startingCredits)) {
        this.economy.addCredits(Number(player), amount);
      }
    }
    if (config.startingTech) {
      for (const [player, techs] of Object.entries(config.startingTech)) {
        for (const t of techs) this.tech.unlock(Number(player), t);
      }
    }
    const systems = defaultSystems({
      bus: this.bus,
      grid: this.grid,
      economy: this.economy,
      tech: this.tech,
      fog: this.fog,
      teamOf: this.teamOf,
      aiPlayers: config.aiPlayers ?? [],
      match: this.match,
      firstContact: this.firstContact,
      ironPass: this.ironPass,
      siegeLine: this.siegeLine,
      blackDawn: this.blackDawn,
      silentExtraction: this.silentExtraction,
      metrics: this.metrics,
      cover: this.cover,
    });
    for (const s of systems) this.scheduler.add(s);
  }

  get tick(): number {
    return this.currentTick;
  }

  /** Schedule a command to be applied at the start of the next {@link step}. */
  enqueue(cmd: Command): void {
    if (this.match?.isFinished) return;
    this.bus.push(cmd);
  }

  /** Advance the simulation by exactly one tick. */
  step(): void {
    if (this.match?.isFinished) return;
    const ctx: TickContext = {
      tick: asTick(this.currentTick),
      dt: this.dt,
      rng: this.rng,
    };
    this.scheduler.tick(this.world, ctx);
    for (const team of this.fog.teams()) {
      const cells = this.fog.copy(team);
      const explored = cells.reduce((count, cell) => count + (cell === HIDDEN ? 0 : 1), 0);
      this.metrics.recordExplored(team, cells.length === 0 ? 0 : (explored / cells.length) * 100);
    }
    if (this.firstContact?.phase === 'failed' && this.match) {
      const winner = this.match.players.find(
        (player) => player !== asPlayerId(this.firstContact!.config.player),
      );
      this.match.finish(winner ?? null);
    }
    if (this.silentExtraction?.phase === 'failed' && this.match) {
      const winner = this.match.players.find(
        (player) => player !== asPlayerId(this.silentExtraction!.config.player),
      );
      this.match.finish(winner ?? null);
    }
    if (this.silentExtraction?.phase === 'extracted' && this.match) {
      this.match.finish(asPlayerId(this.silentExtraction.config.player));
    }
    this.currentTick++;
  }

  /** Build a render snapshot. `viewTeam` selects whose fog of war is included. */
  snapshot(viewTeam = 0): Snapshot {
    const players = this.economy.playerIds().map((player) => {
      const r = this.economy.get(player);
      return {
        player,
        credits: r.credits,
        powerProduced: r.power.produced,
        powerConsumed: r.power.consumed,
      };
    });
    const snap = buildSnapshot(this.world, this.currentTick, players);
    if (this.match) snap.match = this.match.snapshot();
    if (this.firstContact) snap.scenario = this.firstContact.snapshot();
    else if (this.ironPass) snap.scenario = this.ironPass.snapshot();
    else if (this.siegeLine) snap.scenario = this.siegeLine.snapshot();
    else if (this.blackDawn) snap.scenario = this.blackDawn.snapshot();
    else if (this.silentExtraction) snap.scenario = this.silentExtraction.snapshot();
    snap.fog = {
      width: this.fog.width,
      height: this.fog.height,
      cellSize: fp.toFloat(this.grid.cellSize),
      originX: fp.toFloat(this.grid.originX),
      originY: fp.toFloat(this.grid.originY),
      cells: this.fog.copy(viewTeam),
    };
    snap.metrics = this.metrics.snapshot(viewTeam, this.currentTick);
    return snap;
  }

  /** Directly set the current tick (used by the save/load system). */
  setTick(tick: number): void {
    this.currentTick = tick;
  }

  /** Deterministic state hash for desync detection / replay verification. */
  hash(): number {
    let h = hashState(this.world);
    // Fold per-player economy into the hash so credit divergence is caught too.
    for (const p of this.economy.playerIds()) {
      const r = this.economy.get(p);
      h = (Math.imul(h ^ p, 0x01000193) ^ r.credits ^ r.ore) >>> 0;
    }
    // Fold unlocked tech (count per player) so research divergence is caught.
    for (const [p, techs] of this.tech.serialize()) {
      h = (Math.imul(h ^ p, 0x01000193) ^ techs.length) >>> 0;
    }
    return h;
  }
}
