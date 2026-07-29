/**
 * PixiJS renderer + input controller for the RTS view.
 *
 * Responsibilities:
 *  - own the Pixi Application and the render loop (requestAnimationFrame via ticker);
 *  - INTERPOLATE entity transforms between the two latest sim snapshots for smooth
 *    motion at display refresh independent of the 20Hz sim;
 *  - translate pointer/keyboard input into engine Commands sent through SimBridge;
 *  - draw selection box, selection rings and health bars.
 *
 * It reads snapshots but never mutates simulation state — the clean sim/render split.
 */
import { Application, Container, Graphics } from 'pixi.js';
import {
  BUILDING_STATS,
  UNIT_STATS,
  fp,
  type Snapshot,
  type EntitySnapshot,
  type MatchMetricsSnapshot,
} from '@iron/engine';
import { asEntityId, SIM_DT_MS, SIM_HZ, type MapDef, type MapSpawn } from '@iron/shared';
import { Camera, edgePanDirection } from './camera.js';
import { minimapTerrainColor } from './minimapFog.js';
import { ParticleSystem } from './Particles.js';
import { TerrainPainter } from './TerrainPainter.js';
import { AmbientLifePainter } from './AmbientLifePainter.js';
import { drawGroundShadow, drawUnit } from './UnitPainter.js';
import { SpriteUnitPainter } from './SpriteUnitPainter.js';
import { ProductionAssetLoader } from '../assets/AssetLoader.js';
import { drawBuilding, type WallConnections } from './BuildingPainter.js';
import { drawResourceField } from './ResourcePainter.js';
import { SimBridge } from '../worker/SimBridge.js';
import { AudioBus } from '../audio/AudioBus.js';
import { radioAcknowledgement, type RadioOrder } from '../audio/radioAcknowledgements.js';
import {
  commandFeedbackFrame,
  type CommandFeedback,
  type CommandFeedbackKind,
} from './commandFeedback.js';
import { clampMovementTarget } from './movementTarget.js';
import {
  harvesterStatus,
  selectionCommands,
  summarizeForce,
  useGameStore,
} from '../../state/gameStore.js';
import { ControlGroups } from './controlGroups.js';
import {
  firstContactLayout,
  ironPassLayout,
  MISSION_RULES,
  siegeLineLayout,
  type SkirmishConfig,
} from '../../game/skirmishConfig.js';
import { profileFor, usesContinuousPlacement } from '../../game/gameContent.js';

const OWNER_COLORS = [0xb0a149, 0xa9412e, 0x537a8a, 0xa46b32];
const PAN_SPEED = 12; // world units per second at zoom 1

function mapPosition(map: MapDef, x: number, y: number): { x: fp.Fixed; y: fp.Fixed } {
  return {
    x: fp.fromFloat((x + 0.5 - map.width / 2) * map.cellSize),
    y: fp.fromFloat((y + 0.5 - map.height / 2) * map.cellSize),
  };
}

function offsetSpawn(map: MapDef, spawn: MapSpawn, dx: number, dy: number) {
  const x = Math.min(map.width - 2, Math.max(1, spawn.x + dx));
  const y = Math.min(map.height - 2, Math.max(1, spawn.y + dy));
  return mapPosition(map, x, y);
}

export class GameRenderer {
  private readonly app = new Application();
  private readonly camera: Camera;
  private readonly world = new Container();
  private readonly terrain = new TerrainPainter();
  private readonly ambientLife = new AmbientLifePainter();
  private readonly unitUnderlay = new Graphics();
  private readonly units = new Graphics();
  private readonly productionAssets = new ProductionAssetLoader();
  private readonly spriteUnits = new SpriteUnitPainter(this.productionAssets);
  private readonly fogGfx = new Graphics();
  private readonly overlay = new Graphics();
  private readonly bridge = new SimBridge();
  private readonly particles: ParticleSystem;
  private readonly audio = new AudioBus();
  private activeMap: MapDef | null = null;
  private mission: SkirmishConfig['mission'] = 'skirmish';
  private aiActivationTick = 0;
  /** Entities seen last frame, to detect deaths for explosion FX. */
  private readonly prevIds = new Map<number, { x: number; y: number; kind: string }>();

  private readonly selected = new Set<number>();
  private readonly controlGroups = new ControlGroups();
  private readonly keys = new Set<string>();
  private dragStart: { x: number; y: number } | null = null;
  private dragNow: { x: number; y: number } | null = null;
  private placingBuilding: string | null = null;
  private placementPointer: { x: number; y: number } | null = null;
  private navigationPointer: { x: number; y: number } | null = null;
  private cameraDrag: {
    x: number;
    y: number;
    pointerId: number;
  } | null = null;
  private commandFeedback: CommandFeedback | null = null;
  private terrainTooltip: HTMLDivElement | null = null;
  private terrainTooltipTitle: HTMLElement | null = null;
  private terrainTooltipCopy: HTMLElement | null = null;
  private radioCaption: HTMLDivElement | null = null;
  private radioCaptionTimer: ReturnType<typeof setTimeout> | null = null;
  private radioSequence = 0;
  private lastRadioAt = Number.NEGATIVE_INFINITY;

  private minimapCtx: CanvasRenderingContext2D | null = null;
  private minimapFrame = 0;

  /** True once Pixi's async init has completed; guards teardown before init. */
  private ready = false;
  /** Set if dispose() is called before init finished (StrictMode mount/unmount). */
  private disposed = false;

  private fpsAccum = 0;
  private fpsFrames = 0;
  private lastUiTick = -1;
  private latestMetrics: MatchMetricsSnapshot | null = null;

  constructor(private readonly container: HTMLElement) {
    this.camera = new Camera(container.clientWidth, container.clientHeight);
    this.particles = new ParticleSystem(this.camera);
  }

  async start(
    config: SkirmishConfig,
    seed = 123456789,
    presentation: { chickenEasterEgg?: boolean } = {},
  ): Promise<void> {
    useGameStore.getState().resetTutorial();
    useGameStore.getState().setControlGroups([]);
    useGameStore.getState().setMatchMetrics(null);
    useGameStore.getState().setBattleReport(null);
    this.latestMetrics = null;
    this.activeMap = config.map;
    this.mission = config.mission;
    const missionRules = MISSION_RULES[config.mission];
    this.aiActivationTick = config.gracePeriodSeconds * SIM_HZ;
    const humanSpawn = config.map.spawns.find((spawn) => spawn.player === 0);
    const enemySpawn = config.map.spawns.find((spawn) => spawn.player === 1);
    if (!humanSpawn || !enemySpawn)
      throw new Error('Skirmish maps require Player 1 and Player 2 spawns');
    const humanBase = mapPosition(config.map, humanSpawn.x, humanSpawn.y);
    const firstContact =
      missionRules.scenario === 'recovery' ? firstContactLayout(config.map) : null;
    const recoveryAt = firstContact
      ? mapPosition(config.map, firstContact.recovery.x, firstContact.recovery.y)
      : null;
    const ironPass = missionRules.scenario === 'ambush' ? ironPassLayout(config.map) : null;
    const triggerAt = ironPass
      ? mapPosition(config.map, ironPass.trigger.x, ironPass.trigger.y)
      : null;
    const ambushSpawns = ironPass
      ? ironPass.ambush.map((spawn) => mapPosition(config.map, spawn.x, spawn.y))
      : null;
    const siegeLine = missionRules.scenario === 'siege' ? siegeLineLayout(config.map) : null;
    const siegeSpawnPoints = siegeLine
      ? siegeLine.spawnPoints.map((spawn) => mapPosition(config.map, spawn.x, spawn.y))
      : null;
    const siegeTargetAt = siegeLine
      ? mapPosition(config.map, siegeLine.targetAt.x, siegeLine.targetAt.y)
      : null;
    const blackDawn = missionRules.scenario === 'finale';
    const enemyBase = mapPosition(config.map, enemySpawn.x, enemySpawn.y);

    await this.app.init({
      background: 0x283224,
      resizeTo: this.container,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(globalThis.devicePixelRatio ?? 1, 2),
    });
    // If we were disposed while init was in flight (React StrictMode), tear down now.
    if (this.disposed) {
      this.app.destroy(true, { children: true });
      return;
    }
    this.ready = true;
    this.container.appendChild(this.app.canvas);
    this.createTerrainTooltip();
    this.createRadioCaption();
    try {
      await this.productionAssets.load();
    } catch (error) {
      console.warn('Production unit atlas unavailable; using procedural fallback.', error);
    }
    if (this.disposed) return;

    this.terrain.build(config.map);
    this.ambientLife.build(config.map, presentation.chickenEasterEgg);
    this.app.stage.addChild(this.terrain.container, this.ambientLife.graphics, this.world);
    this.world.addChild(this.unitUnderlay, this.spriteUnits.container, this.units);
    this.app.stage.addChild(this.particles.gfx, this.fogGfx, this.overlay);

    const aiCredits =
      config.difficulty === 'easy' ? 1800 : config.difficulty === 'normal' ? 2600 : 3400;
    this.bridge.init({
      seed,
      map: config.map,
      aiPlayers: !missionRules.enemyEnabled
        ? []
        : [
            {
              player: 1,
              difficulty: config.difficulty,
              activationTick: this.aiActivationTick,
            },
          ],
      startingCredits: {
        0: missionRules.playerCredits,
        1: aiCredits,
      },
      startingTech: {
        0: ['infantry_doctrine', 'armor_doctrine'],
        1: ['infantry_doctrine', 'armor_doctrine'],
      },
      ...(missionRules.matchEnabled ? { matchPlayers: [0, 1] } : {}),
      ...(recoveryAt
        ? {
            firstContact: {
              player: 0,
              recoveryAt,
              recoveryTicks: SIM_HZ * 4,
              recoveredCredits: 2600,
            },
          }
        : {}),
      ...(triggerAt && ambushSpawns
        ? {
            ironPass: {
              player: 0,
              ambushPlayer: 1,
              triggerAt,
              ambushSpawns,
            },
          }
        : {}),
      ...(siegeSpawnPoints && siegeTargetAt
        ? {
            siegeLine: {
              hostilePlayer: 1,
              waveIntervalTicks: SIM_HZ * 45,
              waveCount: 4,
              spawnPoints: siegeSpawnPoints,
              targetAt: siegeTargetAt,
            },
          }
        : {}),
      ...(blackDawn
        ? {
            blackDawn: {
              hostilePlayer: 1,
              healthThreshold: 0.3,
            },
          }
        : {}),
    });
    this.bridge.start();
    this.audio.requestAmbient();
    useGameStore.getState().setPlaying(true);
    useGameStore.getState().setMatch(null);
    useGameStore.getState().setScenario(null);
    this.camera.x = fp.toFloat(humanBase.x);
    this.camera.y = fp.toFloat(humanBase.y);
    this.clampCamera();

    for (const resource of config.map.resources) {
      this.bridge.command({
        type: 'spawnResource',
        amount: resource.amount,
        at: mapPosition(config.map, resource.x, resource.y),
      });
    }

    if (missionRules.playerStart === 'base') {
      this.bridge.command({
        type: 'spawnBuilding',
        building: 'construction_yard',
        player: 0,
        at: humanBase,
      });
      this.bridge.command({
        type: 'spawnUnit',
        unit: 'harvester',
        player: 0,
        at: offsetSpawn(config.map, humanSpawn, 3, 2),
      });
    }

    if (firstContact) {
      // Level 2 starts as a patrol mission before the economy layer unlocks.
      for (let i = 0; i < 6; i++) {
        this.bridge.command({
          type: 'spawnUnit',
          unit: i < 2 ? 'tank' : 'rifleman',
          player: 0,
          at: offsetSpawn(config.map, humanSpawn, (i % 3) * 2, Math.floor(i / 3) * 2),
        });
      }
      for (const position of firstContact.resistance.slice(0, 2)) {
        this.bridge.command({
          type: 'spawnUnit',
          unit: 'rifleman',
          player: 1,
          at: mapPosition(config.map, position.x, position.y),
        });
      }
    }

    if (missionRules.enemyEnabled) {
      this.bridge.command({
        type: 'spawnBuilding',
        building: 'construction_yard',
        player: 1,
        at: enemyBase,
      });
      for (const [building, dx, dy] of [
        ['power_plant', -5, 0],
        ['barracks', 0, -5],
        ['factory', -6, -6],
      ] as const) {
        this.bridge.command({
          type: 'spawnBuilding',
          building,
          player: 1,
          at: offsetSpawn(config.map, enemySpawn, dx, dy),
        });
      }
      this.bridge.command({
        type: 'spawnUnit',
        unit: 'harvester',
        player: 1,
        at: offsetSpawn(config.map, enemySpawn, -2, -2),
      });
      for (let i = 0; i < config.enemyStartingForce; i++) {
        this.bridge.command({
          type: 'spawnUnit',
          unit: i % 3 === 0 ? 'tank' : 'rifleman',
          player: 1,
          at: offsetSpawn(config.map, enemySpawn, -1 - (i % 3) * 2, -5 - Math.floor(i / 3) * 2),
        });
      }
    }

    this.installInput();
    this.app.ticker.add(() => this.render());
  }

  /** Latest authoritative telemetry, including missions without a MatchState. */
  getMatchMetrics(): MatchMetricsSnapshot | null {
    return this.latestMetrics ? structuredClone(this.latestMetrics) : null;
  }

  /** Wire the minimap canvas; the render loop draws onto it. */
  attachMinimap(canvas: HTMLCanvasElement | null): void {
    this.minimapCtx = canvas ? canvas.getContext('2d') : null;
  }

  /** Recenter the camera from a normalized minimap click (0..1). */
  centerFromMinimap(nx: number, ny: number): void {
    const fog = this.bridge.latest.curr?.fog;
    if (!fog) return;
    this.camera.x = fog.originX + nx * fog.width * fog.cellSize;
    this.camera.y = fog.originY + ny * fog.height * fog.cellSize;
  }

  setPaused(paused: boolean): void {
    if (paused) this.bridge.pause();
    else this.bridge.start();
    this.audio.setPaused(paused);
  }

  setAudioMuted(muted: boolean): void {
    this.audio.setMuted(muted);
  }

  setAudioVolume(volume: number): void {
    this.audio.setVolume(volume);
  }

  setMusicMuted(muted: boolean): void {
    this.audio.setMusicMuted(muted);
  }

  setMusicVolume(volume: number): void {
    this.audio.setMusicVolume(volume);
  }

  recallControlGroup(slot: number): void {
    const snapshot = this.bridge.latest.curr;
    if (!snapshot) return;
    this.recallGroup(slot, snapshot, performance.now());
  }

  /** Queue a unit in the currently selected production building. */
  queueProduction(unit: string): void {
    const building = this.selectedProductionBuilding();
    if (!building?.production?.produces.includes(unit)) return;
    this.audio.play('build');
    this.bridge.command({
      type: 'queueProduction',
      building: asEntityId(building.id),
      unit,
    });
    if (unit === 'rifleman') useGameStore.getState().advanceTutorial('produce');
  }

  /** Cancel the last item in the selected building's production queue. */
  cancelProduction(): void {
    const building = this.selectedProductionBuilding();
    if (!building?.production || building.production.queue.length === 0) return;
    this.bridge.command({ type: 'cancelProduction', building: asEntityId(building.id) });
  }

  /** Enter placement mode for one building archetype. */
  beginBuildingPlacement(building: string): void {
    if (!BUILDING_STATS[building]) return;
    this.placingBuilding = building;
    useGameStore.getState().setPlacingBuilding(building);
  }

  cancelBuildingPlacement(): void {
    this.placingBuilding = null;
    this.placementPointer = null;
    useGameStore.getState().setPlacingBuilding(null);
  }

  removeSelectedBuilding(recycle: boolean): void {
    const snapshot = this.bridge.latest.curr;
    if (!snapshot) return;
    const selected = snapshot.entities.filter((entity) => this.selected.has(entity.id));
    const building = selected.find((entity) => entity.kind === 'building' && entity.owner === 0);
    if (!building) return;
    const engineer = recycle
      ? selected.find((entity) => entity.unitType === 'engineer' && entity.owner === 0)
      : undefined;
    if (recycle && !engineer) return;
    this.bridge.command({
      type: 'removeBuilding',
      building: asEntityId(building.id),
      player: 0,
      ...(engineer ? { engineer: asEntityId(engineer.id) } : {}),
    });
    this.selected.delete(building.id);
  }

  stopSelectedUnits(): void {
    const units = this.selectedUnits();
    if (units.length === 0) return;
    this.bridge.command({
      type: 'stop',
      entities: units.map((entity) => asEntityId(entity.id)),
    });
    this.acknowledge('stop', units[0]?.unitType);
  }

  gatherWithSelectedHarvesters(target?: EntitySnapshot): void {
    const harvesters = this.selectedUnits().filter((entity) => entity.unitType === 'harvester');
    if (harvesters.length === 0) return;
    this.bridge.command({
      type: 'gather',
      entities: harvesters.map((entity) => asEntityId(entity.id)),
      ...(target ? { target: asEntityId(target.id) } : {}),
    });
    this.acknowledge('gather', harvesters[0]?.unitType);
    useGameStore.getState().advanceTutorial('gather');
  }

  // ---- rendering -------------------------------------------------------------

  private render(): void {
    const dtMs = this.app.ticker.deltaMS;
    this.updateFps(dtMs);
    this.updatePan(dtMs);

    const { prev, curr, at } = this.bridge.latest;
    this.terrain.updateView(this.camera, this.app.renderer.width, this.app.renderer.height);
    this.unitUnderlay.clear();
    this.units.clear();
    this.spriteUnits.beginFrame();
    this.particles.update(dtMs / 1000);
    if (prev && curr) {
      const alpha = Math.min(1, (performance.now() - at) / SIM_DT_MS);
      this.ambientLife.draw(this.camera, (curr.tick + alpha) / SIM_HZ);
      const isNewTick = curr.tick !== this.lastUiTick;
      if (isNewTick) {
        this.detectCombatEffects(prev, curr);
        this.detectHarvestEffects(prev, curr);
        this.detectAmbientEffects(curr);
      }
      this.drawEntities(prev, curr, alpha);
      this.drawScenarioSite(curr);
      if (isNewTick) {
        this.lastUiTick = curr.tick;
        this.detectDeaths(curr);
        const store = useGameStore.getState();
        store.setEntityCount(
          curr.entities.filter((e) => e.kind === 'unit' || e.kind === 'building').length,
        );
        this.syncForceState(curr);
        const me = curr.players.find((p) => p.player === 0);
        if (me) store.setEconomy(me.credits, me.powerProduced, me.powerConsumed);
        store.setMatch(curr.match ?? null);
        if (curr.metrics) this.latestMetrics = curr.metrics;
        if (curr.match?.status === 'finished' && curr.metrics) {
          store.setMatchMetrics(curr.metrics);
        }
        store.setScenario(curr.scenario ?? null);
        const activationOrigin =
          MISSION_RULES[this.mission].scenario === 'recovery'
            ? curr.scenario && 'operationalAtTick' in curr.scenario
              ? curr.scenario.operationalAtTick
              : null
            : 0;
        store.setAiActivationSeconds(
          activationOrigin === null || activationOrigin === undefined
            ? 0
            : Math.max(
                0,
                Math.ceil((activationOrigin + this.aiActivationTick - curr.tick) / SIM_HZ),
              ),
        );
        this.syncSelectionState(curr);
      }
      this.drawFog(curr);
      if (++this.minimapFrame % 6 === 0) this.drawMinimap(curr);
    }
    this.spriteUnits.endFrame();
    this.particles.draw();
    this.drawSelectionBox();
  }

  private detectCombatEffects(prev: Snapshot, curr: Snapshot): void {
    const previous = new Map(prev.entities.map((entity) => [entity.id, entity]));
    const current = new Map(curr.entities.map((entity) => [entity.id, entity]));
    for (const entity of curr.entities) {
      const before = previous.get(entity.id);
      if (
        entity.weaponCooldownLeft === undefined ||
        entity.weaponCooldownLeft <= (before?.weaponCooldownLeft ?? 0) ||
        entity.attackTarget === undefined
      ) {
        continue;
      }
      const muzzleX = entity.x + Math.cos(entity.angle) * entity.radius;
      const muzzleY = entity.y + Math.sin(entity.angle) * entity.radius;
      this.particles.muzzleFlash(
        muzzleX,
        muzzleY,
        entity.angle,
        entity.unitType === 'rifleman' ? 0.65 : 1,
      );
      if (entity.unitType === 'rifleman') {
        const target = current.get(entity.attackTarget);
        if (target) this.particles.tracer(muzzleX, muzzleY, target.x, target.y);
        this.audio.play('rifle');
      } else {
        this.audio.play('cannon');
      }
    }
  }

  private detectHarvestEffects(prev: Snapshot, curr: Snapshot): void {
    const previous = new Map(prev.entities.map((entity) => [entity.id, entity]));
    for (const entity of curr.entities) {
      if (!entity.cargo) continue;
      if (entity.cargo.phase === 'gathering') {
        const scoopX = entity.x + Math.cos(entity.angle) * entity.radius * 1.35;
        const scoopY = entity.y + Math.sin(entity.angle) * entity.radius * 1.35;
        this.particles.oreDust(scoopX, scoopY, entity.angle, entity.radius);
      }
      if (
        entity.cargo.phase === 'depositing' &&
        previous.get(entity.id)?.cargo?.phase !== 'depositing'
      ) {
        this.particles.oreDeposit(entity.x, entity.y, entity.radius);
      }
    }
  }

  private detectAmbientEffects(curr: Snapshot): void {
    for (const entity of curr.entities) {
      if (
        entity.kind !== 'building' ||
        entity.construction ||
        !['power_plant', 'factory'].includes(entity.buildingType ?? '') ||
        (curr.tick + entity.id * 7) % 12 !== 0
      ) {
        continue;
      }
      this.particles.smoke(
        entity.x + entity.radius * 0.38,
        entity.y - entity.radius * 0.42,
        Math.max(0.65, entity.radius * 0.32),
      );
    }
  }

  /** Emit explosion FX + sound for entities that vanished since the last snapshot. */
  private detectDeaths(curr: Snapshot): void {
    const live = new Set<number>();
    for (const e of curr.entities) live.add(e.id);
    for (const [id, info] of this.prevIds) {
      if (!live.has(id) && (info.kind === 'unit' || info.kind === 'building')) {
        this.particles.explosion(info.x, info.y, info.kind === 'building' ? 2 : 1);
        this.audio.play('explosion');
        this.selected.delete(id);
      } else if (!live.has(id) && info.kind === 'projectile') {
        this.particles.impact(info.x, info.y, 1.2);
        this.audio.play('impact');
      }
    }
    this.prevIds.clear();
    for (const e of curr.entities) this.prevIds.set(e.id, { x: e.x, y: e.y, kind: e.kind });
  }

  private drawEntities(prev: Snapshot, curr: Snapshot, alpha: number): void {
    const prevById = new Map<number, EntitySnapshot>();
    for (const e of prev.entities) prevById.set(e.id, e);
    const animationTime = performance.now() / 1000;
    const wallKeys = new Set(
      curr.entities
        .filter((entity) => entity.buildingType === 'concrete_wall')
        .map((entity) => wallKey(entity.owner, entity.x, entity.y)),
    );
    const wallStep = this.activeMap?.cellSize ?? 1;

    for (const e of curr.entities) {
      const p = prevById.get(e.id) ?? e;
      const wx = p.x + (e.x - p.x) * alpha;
      const wy = p.y + (e.y - p.y) * alpha;
      const { sx, sy } = this.camera.worldToScreen(wx, wy);

      if (e.kind === 'projectile') {
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const length = Math.hypot(dx, dy);
        const ux = length > 0 ? dx / length : Math.cos(e.angle);
        const uy = length > 0 ? dy / length : Math.sin(e.angle);
        const streak = Math.max(5, 0.55 * this.camera.scale);
        this.units
          .moveTo(sx - ux * streak, sy - uy * streak)
          .lineTo(sx + ux * streak * 0.25, sy + uy * streak * 0.25)
          .stroke({
            width: Math.max(2, 0.14 * this.camera.scale),
            color: 0xf2be4c,
            alpha: 0.95,
          });
        continue;
      }

      if (e.kind === 'resource') {
        const rr = Math.max(7, e.radius * this.camera.scale * 2.8);
        drawResourceField(this.units, sx, sy, rr, e.id);
        continue;
      }

      const r = e.radius * this.camera.scale;
      const color = OWNER_COLORS[e.owner % OWNER_COLORS.length]!;

      if (e.kind === 'building') {
        const s = r;
        drawBuilding(
          this.units,
          e,
          sx,
          sy,
          s,
          color,
          e.buildingType === 'concrete_wall' ? wallConnections(e, wallKeys, wallStep) : undefined,
          {
            animationTime,
            constructionProgress: e.construction
              ? Math.min(1, e.construction.progressTicks / e.construction.buildTicks)
              : 1,
          },
        );
        if (this.selected.has(e.id)) {
          this.units
            .rect(sx - s - 3, sy - s - 3, s * 2 + 6, s * 2 + 6)
            .stroke({ width: 2, color: 0xf0c85a });
        }
        if (e.construction) {
          const progress = e.construction.progressTicks / e.construction.buildTicks;
          this.units.rect(sx - s, sy + s + 4, s * 2, 4).fill({ color: 0x14201b });
          this.units.rect(sx - s, sy + s + 4, s * 2 * progress, 4).fill({ color: 0xd1a63a });
        }
        if (e.maxHp > 0) {
          const ratio = Math.max(0, e.hp / e.maxHp);
          this.units.rect(sx - s, sy - s - 8, s * 2, 3).fill({ color: 0x000000, alpha: 0.5 });
          this.units.rect(sx - s, sy - s - 8, s * 2 * ratio, 3).fill({ color: 0xa4a957 });
        }
        continue;
      }

      const moving = Math.hypot(e.x - p.x, e.y - p.y) > 0.001;
      const firing =
        e.weaponCooldownLeft !== undefined && e.weaponCooldownLeft > (p.weaponCooldownLeft ?? 0);
      const spriteRendered = this.spriteUnits.draw(e, sx, sy, r, animationTime, {
        moving,
        firing,
      });
      if (spriteRendered) {
        drawGroundShadow(this.unitUnderlay, sx, sy, r, e.unitType === 'rifleman' ? 0.72 : 1);
      } else {
        drawUnit(this.units, e, sx, sy, r, color, {
          animationTime,
          moving,
          firing,
        });
      }
      if (this.selected.has(e.id)) {
        this.units.circle(sx, sy, r + 4).stroke({ width: 2, color: 0xf0c85a, alpha: 0.95 });
      }

      // Health bar.
      if (e.maxHp > 0) {
        const w = r * 2;
        const ratio = Math.max(0, e.hp / e.maxHp);
        this.units.rect(sx - r, sy - r - 8, w, 3).fill({ color: 0x000000, alpha: 0.5 });
        this.units
          .rect(sx - r, sy - r - 8, w * ratio, 3)
          .fill({ color: ratio > 0.5 ? 0x92994c : ratio > 0.25 ? 0xd1a63a : 0xa9412e });
      }
      if (e.cargo) this.drawCargoBar(e, sx, sy, r);
    }
  }

  private drawScenarioSite(curr: Snapshot): void {
    const scenario = curr.scenario;
    if (!scenario || !('recoveryAt' in scenario) || scenario.phase === 'operational') return;
    const { sx, sy } = this.camera.worldToScreen(scenario.recoveryAt.x, scenario.recoveryAt.y);
    const size = Math.max(16, this.camera.scale * 1.5);
    this.units
      .rect(sx - size, sy - size, size * 2, size * 2)
      .fill({ color: 0x303733 })
      .stroke({ width: 2, color: scenario.phase === 'recovering' ? 0x78d46a : 0x687068 });
    this.units
      .moveTo(sx - size * 0.55, sy - size * 0.55)
      .lineTo(sx + size * 0.55, sy + size * 0.55)
      .moveTo(sx + size * 0.55, sy - size * 0.55)
      .lineTo(sx - size * 0.55, sy + size * 0.55)
      .stroke({ width: 3, color: 0x111713 });
    if (scenario.phase === 'recovering') {
      this.units.rect(sx - size, sy + size + 5, size * 2, 4).fill({ color: 0x101512 });
      this.units
        .rect(sx - size, sy + size + 5, size * 2 * scenario.progress, 4)
        .fill({ color: 0x78d46a });
    }
  }

  /** Draws hidden/explored fog over cells within the viewport (visible cells clear). */
  private drawFog(curr: Snapshot): void {
    this.fogGfx.clear();
    const fog = curr.fog;
    if (!fog) return;

    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    const mapTopLeft = this.camera.worldToScreen(fog.originX, fog.originY);
    const mapBottomRight = this.camera.worldToScreen(
      fog.originX + fog.width * fog.cellSize,
      fog.originY + fog.height * fog.cellSize,
    );
    if (mapTopLeft.sy > 0) {
      this.fogGfx.rect(0, 0, w, mapTopLeft.sy).fill({ color: 0x000000 });
    }
    if (mapBottomRight.sy < h) {
      this.fogGfx.rect(0, mapBottomRight.sy, w, h - mapBottomRight.sy).fill({ color: 0x000000 });
    }
    if (mapTopLeft.sx > 0) {
      this.fogGfx
        .rect(0, Math.max(0, mapTopLeft.sy), mapTopLeft.sx, mapBottomRight.sy - mapTopLeft.sy)
        .fill({ color: 0x000000 });
    }
    if (mapBottomRight.sx < w) {
      this.fogGfx
        .rect(
          mapBottomRight.sx,
          Math.max(0, mapTopLeft.sy),
          w - mapBottomRight.sx,
          mapBottomRight.sy - mapTopLeft.sy,
        )
        .fill({ color: 0x000000 });
    }
    const topLeft = this.camera.screenToWorld(0, 0);
    const botRight = this.camera.screenToWorld(w, h);
    const toCell = (wx: number, wy: number) => ({
      cx: Math.floor((wx - fog.originX) / fog.cellSize),
      cy: Math.floor((wy - fog.originY) / fog.cellSize),
    });
    const min = toCell(topLeft.wx, topLeft.wy);
    const max = toCell(botRight.wx, botRight.wy);
    const size = fog.cellSize * this.camera.scale;

    for (let cy = Math.max(0, min.cy); cy <= Math.min(fog.height - 1, max.cy); cy++) {
      for (let cx = Math.max(0, min.cx); cx <= Math.min(fog.width - 1, max.cx); cx++) {
        const state = fog.cells[cy * fog.width + cx]!;
        if (state === 2) continue; // visible
        const wx = fog.originX + cx * fog.cellSize;
        const wy = fog.originY + cy * fog.cellSize;
        const { sx, sy } = this.camera.worldToScreen(wx, wy);
        this.fogGfx.rect(sx, sy, size + 1, size + 1).fill({
          color: 0x000000,
          alpha: state === 0 ? 1 : 0.18,
        });
      }
    }
  }

  /** Renders blips, fog and the camera viewport onto the minimap canvas. */
  private drawMinimap(curr: Snapshot): void {
    const ctx = this.minimapCtx;
    const fog = curr.fog;
    if (!ctx || !fog) return;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const worldW = fog.width * fog.cellSize;
    const worldH = fog.height * fog.cellSize;
    const toMap = (wx: number, wy: number) => ({
      mx: ((wx - fog.originX) / worldW) * W,
      my: ((wy - fog.originY) / worldH) * H,
    });

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    // Draw every fog cell so narrow explored paths are never lost by coarse sampling.
    const cw = W / fog.width;
    const ch = H / fog.height;
    const blocked = new Set(this.activeMap?.blocked.map(([x, y]) => `${x}:${y}`) ?? []);
    for (let cy = 0; cy < fog.height; cy++) {
      for (let cx = 0; cx < fog.width; cx++) {
        const visibility = fog.cells[cy * fog.width + cx]!;
        ctx.fillStyle = minimapTerrainColor(visibility, blocked.has(`${cx}:${cy}`));
        ctx.fillRect(cx * cw, cy * ch, Math.ceil(cw + 0.25), Math.ceil(ch + 0.25));
      }
    }

    // Blips.
    for (const e of curr.entities) {
      if (e.kind === 'projectile') continue;
      const cx = Math.floor((e.x - fog.originX) / fog.cellSize);
      const cy = Math.floor((e.y - fog.originY) / fog.cellSize);
      const inBounds = cx >= 0 && cy >= 0 && cx < fog.width && cy < fog.height;
      const visibility = inBounds ? fog.cells[cy * fog.width + cx]! : 0;
      if (e.owner !== 0 && visibility !== 2) continue;
      if (e.kind === 'resource' && visibility === 0) continue;
      const { mx, my } = toMap(e.x, e.y);
      ctx.fillStyle = e.kind === 'resource' ? '#a67b29' : e.owner === 0 ? '#d0b94f' : '#b2452f';
      const size = e.kind === 'building' ? 4 : 2;
      ctx.fillRect(mx - size / 2, my - size / 2, size, size);
    }

    // Camera viewport rectangle.
    const tl = this.camera.screenToWorld(0, 0);
    const br = this.camera.screenToWorld(this.app.renderer.width, this.app.renderer.height);
    const a = toMap(tl.wx, tl.wy);
    const b = toMap(br.wx, br.wy);
    ctx.strokeStyle = '#f0cc68';
    ctx.lineWidth = 1;
    ctx.strokeRect(a.mx, a.my, b.mx - a.mx, b.my - a.my);
  }

  private drawSelectionBox(): void {
    this.overlay.clear();
    this.drawObjectiveDirection();
    this.drawCommandFeedback();
    this.drawPlacementPreview();
    if (this.dragStart && this.dragNow) {
      const x = Math.min(this.dragStart.x, this.dragNow.x);
      const y = Math.min(this.dragStart.y, this.dragNow.y);
      const w = Math.abs(this.dragNow.x - this.dragStart.x);
      const h = Math.abs(this.dragNow.y - this.dragStart.y);
      this.overlay
        .rect(x, y, w, h)
        .fill({ color: 0xd5a83c, alpha: 0.14 })
        .stroke({ width: 1, color: 0xf0cc68 });
    }
  }

  private drawCommandFeedback(): void {
    const feedback = this.commandFeedback;
    if (!feedback) return;
    const frame = commandFeedbackFrame(feedback, performance.now());
    if (!frame) {
      this.commandFeedback = null;
      return;
    }

    const { sx, sy } = this.camera.worldToScreen(feedback.worldX, feedback.worldY);
    const colors: Record<CommandFeedbackKind, number> = {
      select: 0xf0cc68,
      move: 0x78d46a,
      attack: 0xe05a42,
      gather: 0xd4a63a,
      build: 0xf0cc68,
      invalid: 0xe05a42,
    };
    const color = colors[feedback.kind];
    const radius = 13 * frame.scale;
    const gap = radius * 0.45;
    const arm = radius * 0.72;
    const alpha = frame.alpha;
    this.overlay
      .circle(sx, sy, radius)
      .stroke({ width: 2, color, alpha })
      .moveTo(sx - gap, sy - gap)
      .lineTo(sx - arm, sy - arm)
      .moveTo(sx + gap, sy - gap)
      .lineTo(sx + arm, sy - arm)
      .moveTo(sx + gap, sy + gap)
      .lineTo(sx + arm, sy + arm)
      .moveTo(sx - gap, sy + gap)
      .lineTo(sx - arm, sy + arm)
      .stroke({ width: feedback.kind === 'invalid' ? 3 : 2, color, alpha });
  }

  private showCommandFeedback(sx: number, sy: number, kind: CommandFeedbackKind): void {
    const world = this.camera.screenToWorld(sx, sy);
    this.commandFeedback = {
      kind,
      worldX: world.wx,
      worldY: world.wy,
      startedAt: performance.now(),
    };
  }

  private drawObjectiveDirection(): void {
    const scenario = this.bridge.latest.curr?.scenario;
    if (
      !scenario ||
      !('recoveryAt' in scenario) ||
      scenario.phase === 'operational' ||
      scenario.phase === 'failed'
    )
      return;

    const target = this.camera.worldToScreen(scenario.recoveryAt.x, scenario.recoveryAt.y);
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const rightLimit = Math.max(80, width - 338);
    const margin = 42;
    const targetOnScreen =
      target.sx >= margin &&
      target.sx <= rightLimit - margin &&
      target.sy >= margin &&
      target.sy <= height - margin;
    if (targetOnScreen) return;

    const centre = { x: rightLimit / 2, y: height / 2 };
    const angle = Math.atan2(target.sy - centre.y, target.sx - centre.x);
    const radiusX = Math.max(10, centre.x - margin);
    const radiusY = Math.max(10, centre.y - margin);
    const scale = Math.min(
      Math.abs(radiusX / Math.max(0.001, Math.cos(angle))),
      Math.abs(radiusY / Math.max(0.001, Math.sin(angle))),
    );
    const x = centre.x + Math.cos(angle) * scale;
    const y = centre.y + Math.sin(angle) * scale;
    const pulse = 1 + Math.sin(performance.now() / 140) * 0.16;
    const size = 13 * pulse;

    this.overlay
      .moveTo(x + Math.cos(angle) * size, y + Math.sin(angle) * size)
      .lineTo(x + Math.cos(angle + 2.45) * size, y + Math.sin(angle + 2.45) * size)
      .lineTo(x + Math.cos(angle - 2.45) * size, y + Math.sin(angle - 2.45) * size)
      .closePath()
      .fill({ color: 0x78d46a, alpha: 0.92 })
      .stroke({ width: 2, color: 0xd5e6cb });
    this.overlay.circle(x, y, size + 7).stroke({
      width: 1,
      color: 0x78d46a,
      alpha: 0.45,
    });
  }

  private drawPlacementPreview(): void {
    const building = this.placingBuilding;
    const pointer = this.placementPointer;
    const snapshot = this.bridge.latest.curr;
    if (!building || !pointer || !snapshot?.fog) return;

    const position = this.snappedPlacement(pointer.x, pointer.y);
    const stats = BUILDING_STATS[building];
    if (!stats) return;
    const fog = snapshot.fog;
    const cell = {
      cx: Math.floor((position.x - fog.originX) / fog.cellSize),
      cy: Math.floor((position.y - fog.originY) / fog.cellSize),
    };
    const half = Math.floor(stats.footprint / 2);
    const startX = fog.originX + (cell.cx - half) * fog.cellSize;
    const startY = fog.originY + (cell.cy - half) * fog.cellSize;
    const topLeft = this.camera.worldToScreen(startX, startY);
    const size = stats.footprint * fog.cellSize * this.camera.scale;
    const valid = this.isPlacementValid(building, position, snapshot);
    this.overlay
      .rect(topLeft.sx, topLeft.sy, size, size)
      .fill({ color: valid ? 0xc5a238 : 0xa93427, alpha: 0.32 })
      .stroke({ width: 2, color: valid ? 0xf0cc68 : 0xe4543d });
  }

  private confirmBuildingPlacement(sx: number, sy: number): void {
    const building = this.placingBuilding;
    const snapshot = this.bridge.latest.curr;
    if (!building || !snapshot) return;
    const position = this.snappedPlacement(sx, sy);
    if (!this.isPlacementValid(building, position, snapshot)) {
      this.showCommandFeedback(sx, sy, 'invalid');
      return;
    }

    this.showCommandFeedback(sx, sy, 'build');
    this.bridge.command({
      type: 'placeBuilding',
      building,
      player: 0,
      at: { x: fp.fromFloat(position.x), y: fp.fromFloat(position.y) },
    });
    this.audio.play('build');
    const milestone = {
      power_plant: 'power',
      barracks: 'barracks',
      concrete_wall: 'defense',
      turret: 'defense',
    }[building] as 'power' | 'barracks' | 'defense' | undefined;
    if (milestone) useGameStore.getState().advanceTutorial(milestone);
    if (!usesContinuousPlacement(building)) this.cancelBuildingPlacement();
  }

  private snappedPlacement(sx: number, sy: number): { x: number; y: number } {
    const { wx, wy } = this.camera.screenToWorld(sx, sy);
    const footprint = BUILDING_STATS[this.placingBuilding ?? '']?.footprint ?? 1;
    const snap = (value: number): number =>
      footprint % 2 === 0 ? Math.round(value) : Math.floor(value) + 0.5;
    return { x: snap(wx), y: snap(wy) };
  }

  /** Fast presentation check; the simulation repeats the authoritative grid validation. */
  private isPlacementValid(
    building: string,
    at: { x: number; y: number },
    snapshot: Snapshot,
  ): boolean {
    const stats = BUILDING_STATS[building];
    const fog = snapshot.fog;
    if (!stats || !fog || useGameStore.getState().credits < stats.cost) return false;

    const toRect = (x: number, y: number, footprint: number) => {
      const cx = Math.floor((x - fog.originX) / fog.cellSize);
      const cy = Math.floor((y - fog.originY) / fog.cellSize);
      const half = Math.floor(footprint / 2);
      return { x0: cx - half, y0: cy - half, x1: cx - half + footprint, y1: cy - half + footprint };
    };
    const candidate = toRect(at.x, at.y, stats.footprint);
    if (
      candidate.x0 < 0 ||
      candidate.y0 < 0 ||
      candidate.x1 > fog.width ||
      candidate.y1 > fog.height
    ) {
      return false;
    }

    for (const entity of snapshot.entities) {
      if (entity.kind !== 'building' || !entity.buildingType) continue;
      const footprint = BUILDING_STATS[entity.buildingType]?.footprint;
      if (!footprint) continue;
      const occupied = toRect(entity.x, entity.y, footprint);
      if (
        candidate.x0 < occupied.x1 &&
        candidate.x1 > occupied.x0 &&
        candidate.y0 < occupied.y1 &&
        candidate.y1 > occupied.y0
      ) {
        return false;
      }
    }
    return true;
  }

  // ---- input -----------------------------------------------------------------

  private installInput(): void {
    const canvas = this.app.canvas;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    canvas.addEventListener('pointercancel', () => this.cancelPointerGesture());
    canvas.addEventListener('pointerleave', () => {
      if (!this.cameraDrag) this.navigationPointer = null;
      this.hideTerrainTooltip();
    });
    canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const point = this.canvasPoint(e);
      this.camera.zoomAtScreenPoint(e.deltaY < 0 ? 1.1 : 0.9, point.x, point.y);
      this.clampCamera();
    });
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      if (e.key === 'Escape') this.cancelBuildingPlacement();
      this.handleControlGroupKey(e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('resize', () => {
      this.camera.resize(this.container.clientWidth, this.container.clientHeight);
      this.clampCamera();
    });
  }

  private onPointerDown(e: PointerEvent): void {
    const point = this.canvasPoint(e);
    if (this.placingBuilding) {
      if (e.button === 0) this.confirmBuildingPlacement(point.x, point.y);
      else if (e.button === 2) this.cancelBuildingPlacement();
      return;
    }
    if (e.button === 2) {
      e.preventDefault();
      this.issueMove(point.x, point.y);
      return;
    }
    if (e.button === 1) {
      e.preventDefault();
      this.cameraDrag = {
        x: point.x,
        y: point.y,
        pointerId: e.pointerId,
      };
      if (e.currentTarget instanceof Element) e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button === 0) {
      this.dragStart = point;
      this.dragNow = point;
    }
  }

  private onPointerMove(e: PointerEvent): void {
    const point = this.canvasPoint(e);
    this.placementPointer = point;
    this.navigationPointer = point;
    if (this.cameraDrag) {
      this.hideTerrainTooltip();
      const dx = point.x - this.cameraDrag.x;
      const dy = point.y - this.cameraDrag.y;
      this.camera.panByScreenDelta(dx, dy);
      this.clampCamera();
      this.cameraDrag = { ...this.cameraDrag, x: point.x, y: point.y };
      return;
    }
    this.updatePointerCursor(point.x, point.y);
    this.updateTerrainTooltip(point.x, point.y);
    if (this.dragStart) this.dragNow = point;
  }

  private onPointerUp(e: PointerEvent): void {
    const point = this.canvasPoint(e);
    if (e.button === 1 && this.cameraDrag) {
      if (e.currentTarget instanceof Element && e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      this.cameraDrag = null;
      return;
    }
    if (e.button !== 0 || !this.dragStart) return;
    const additive = e.ctrlKey || e.shiftKey;
    if (!additive) this.selected.clear();

    const box = { x0: this.dragStart.x, y0: this.dragStart.y, x1: point.x, y1: point.y };
    const isClick = Math.abs(box.x1 - box.x0) < 4 && Math.abs(box.y1 - box.y0) < 4;
    this.selectInBox(box, isClick);
    if (isClick) this.showCommandFeedback(point.x, point.y, 'select');

    this.dragStart = null;
    this.dragNow = null;
    if (this.selected.size > 0) this.audio.play('select');
    const curr = this.bridge.latest.curr;
    if (curr) this.syncSelectionState(curr);
    if (
      curr?.entities.some(
        (entity) => this.selected.has(entity.id) && entity.buildingType === 'construction_yard',
      )
    ) {
      useGameStore.getState().advanceTutorial('select');
    }
  }

  private cancelPointerGesture(): void {
    this.cameraDrag = null;
    this.dragStart = null;
    this.dragNow = null;
  }

  private selectInBox(
    box: { x0: number; y0: number; x1: number; y1: number },
    isClick: boolean,
  ): void {
    const curr = this.bridge.latest.curr;
    if (!curr) return;
    const minX = Math.min(box.x0, box.x1);
    const maxX = Math.max(box.x0, box.x1);
    const minY = Math.min(box.y0, box.y1);
    const maxY = Math.max(box.y0, box.y1);

    let best: { id: number; d: number; priority: number } | null = null;
    for (const ent of curr.entities) {
      const isOwnedSelection = (ent.kind === 'unit' || ent.kind === 'building') && ent.owner === 0;
      const isResourceSelection = isClick && ent.kind === 'resource';
      if (!isOwnedSelection && !isResourceSelection) continue;
      const { sx, sy } = this.camera.worldToScreen(ent.x, ent.y);
      if (isClick) {
        const d = (sx - box.x0) ** 2 + (sy - box.y0) ** 2;
        const visualRadius =
          ent.kind === 'resource'
            ? ent.radius * this.camera.scale * 2.8
            : ent.radius * this.camera.scale;
        const rr = (visualRadius + 6) ** 2;
        const priority = ent.kind === 'resource' ? 1 : 0;
        if (
          d <= rr &&
          (!best || priority < best.priority || (priority === best.priority && d < best.d))
        ) {
          best = { id: ent.id, d, priority };
        }
      } else if (ent.kind === 'unit') {
        const radius = ent.radius * this.camera.scale;
        if (
          sx + radius >= minX &&
          sx - radius <= maxX &&
          sy + radius >= minY &&
          sy - radius <= maxY
        ) {
          this.selected.add(ent.id);
        }
      }
    }
    if (isClick && best) this.selected.add(best.id);
  }

  private onDoubleClick(e: MouseEvent): void {
    const curr = this.bridge.latest.curr;
    if (!curr) return;
    const point = this.canvasPoint(e);

    const clicked = this.findOwnedUnitAt(point.x, point.y, curr);
    if (!clicked?.unitType) {
      this.showCommandFeedback(point.x, point.y, 'select');
      return;
    }
    if (!e.ctrlKey && !e.shiftKey) this.selected.clear();

    const viewportWidth = this.app.canvas.clientWidth;
    const viewportHeight = this.app.canvas.clientHeight;
    for (const entity of curr.entities) {
      if (entity.kind !== 'unit' || entity.owner !== 0 || entity.unitType !== clicked.unitType) {
        continue;
      }
      const { sx, sy } = this.camera.worldToScreen(entity.x, entity.y);
      if (sx >= 0 && sx <= viewportWidth && sy >= 0 && sy <= viewportHeight) {
        this.selected.add(entity.id);
      }
    }

    this.audio.play('select');
    this.syncSelectionState(curr);
  }

  private handleControlGroupKey(event: KeyboardEvent): void {
    if (
      event.repeat ||
      event.altKey ||
      event.shiftKey ||
      (event.target instanceof HTMLElement &&
        (event.target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)))
    ) {
      return;
    }
    const match = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
    if (!match) return;
    const slot = Number(match[1]);
    const snapshot = this.bridge.latest.curr;
    if (!snapshot) return;
    event.preventDefault();

    if (event.ctrlKey) {
      const ownedUnits = this.selectedUnits(snapshot).map((entity) => entity.id);
      if (this.controlGroups.assign(slot, ownedUnits)) {
        this.syncControlGroups(snapshot);
        this.audio.play('select');
      }
      return;
    }
    if (event.metaKey) return;
    this.recallGroup(slot, snapshot, performance.now());
  }

  private recallGroup(slot: number, snapshot: Snapshot, now: number): void {
    const validIds = this.ownedUnitIds(snapshot);
    const recall = this.controlGroups.recall(slot, validIds, now);
    if (!recall) {
      this.syncControlGroups(snapshot);
      return;
    }
    this.selected.clear();
    for (const id of recall.ids) this.selected.add(id);
    this.syncSelectionState(snapshot);
    this.syncControlGroups(snapshot);
    this.audio.play('select');
    if (recall.focus) this.focusSelection(snapshot);
  }

  private focusSelection(snapshot: Snapshot): void {
    const units = this.selectedUnits(snapshot);
    if (units.length === 0) return;
    this.camera.x = units.reduce((sum, unit) => sum + unit.x, 0) / units.length;
    this.camera.y = units.reduce((sum, unit) => sum + unit.y, 0) / units.length;
    this.clampCamera();
  }

  private ownedUnitIds(snapshot: Snapshot): Set<number> {
    return new Set(
      snapshot.entities
        .filter((entity) => entity.kind === 'unit' && entity.owner === 0)
        .map((entity) => entity.id),
    );
  }

  private canvasPoint(event: MouseEvent): { x: number; y: number } {
    const bounds = this.app.canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  private findOwnedUnitAt(sx: number, sy: number, snapshot: Snapshot): EntitySnapshot | null {
    let best: { entity: EntitySnapshot; distance: number } | null = null;
    for (const entity of snapshot.entities) {
      if (entity.kind !== 'unit' || entity.owner !== 0) continue;
      const screen = this.camera.worldToScreen(entity.x, entity.y);
      const distance = (screen.sx - sx) ** 2 + (screen.sy - sy) ** 2;
      const hitRadius = (entity.radius * this.camera.scale + 6) ** 2;
      if (distance <= hitRadius && (!best || distance < best.distance)) {
        best = { entity, distance };
      }
    }
    return best?.entity ?? null;
  }

  private issueMove(sx: number, sy: number): void {
    if (this.selected.size === 0) {
      this.showCommandFeedback(sx, sy, 'invalid');
      return;
    }
    const rawTarget = this.camera.screenToWorld(sx, sy);
    const target = this.activeMap
      ? clampMovementTarget(
          { x: rawTarget.wx, y: rawTarget.wy },
          this.activeMap.width * this.activeMap.cellSize,
          this.activeMap.height * this.activeMap.cellSize,
          this.activeMap.cellSize,
        )
      : { x: rawTarget.wx, y: rawTarget.wy };
    const curr = this.bridge.latest.curr;
    const units = curr?.entities.filter((entity) => {
      return entity.kind === 'unit' && this.selected.has(entity.id);
    });
    if (!units || units.length === 0) {
      const building = this.selectedProductionBuilding();
      if (building) {
        this.showCommandFeedback(sx, sy, 'move');
        this.audio.play('move');
        this.bridge.command({
          type: 'setRally',
          building: asEntityId(building.id),
          point: { x: fp.fromFloat(target.x), y: fp.fromFloat(target.y) },
        });
      }
      return;
    }

    const resource = curr ? this.findResourceAt(sx, sy, curr) : null;
    if (resource && units.some((entity) => entity.unitType === 'harvester')) {
      this.showCommandFeedback(sx, sy, 'gather');
      this.audio.play('move');
      this.gatherWithSelectedHarvesters(resource);
      return;
    }

    const enemy = curr ? this.findEnemyAt(sx, sy, curr) : null;
    if (enemy) {
      const attackers = units.filter(
        (entity) => entity.unitType && UNIT_STATS[entity.unitType]?.weapon,
      );
      const support = units.filter((entity) => !attackers.includes(entity));
      this.showCommandFeedback(sx, sy, 'attack');
      this.audio.play('move');
      if (support.length > 0) {
        this.bridge.command({
          type: 'stop',
          entities: support.map((entity) => asEntityId(entity.id)),
        });
      }
      if (attackers.length > 0) {
        this.bridge.command({
          type: 'attack',
          entities: attackers.map((entity) => asEntityId(entity.id)),
          target: asEntityId(enemy.id),
        });
        this.acknowledge('attack', attackers[0]?.unitType);
      }
      return;
    }
    this.showCommandFeedback(sx, sy, 'move');
    this.audio.play('move');
    this.bridge.command({
      type: 'move',
      entities: units.map((entity) => asEntityId(entity.id)),
      target: { x: fp.fromFloat(target.x), y: fp.fromFloat(target.y) },
    });
    this.acknowledge('move', units[0]?.unitType);
  }

  private selectedUnits(snapshot = this.bridge.latest.curr): EntitySnapshot[] {
    return (
      snapshot?.entities.filter(
        (entity) => entity.kind === 'unit' && this.selected.has(entity.id),
      ) ?? []
    );
  }

  private findResourceAt(sx: number, sy: number, snapshot: Snapshot): EntitySnapshot | null {
    let best: { entity: EntitySnapshot; distance: number } | null = null;
    for (const entity of snapshot.entities) {
      if (entity.kind !== 'resource') continue;
      const screen = this.camera.worldToScreen(entity.x, entity.y);
      const distance = (screen.sx - sx) ** 2 + (screen.sy - sy) ** 2;
      const hitRadius = (entity.radius * this.camera.scale + 10) ** 2;
      if (distance <= hitRadius && (!best || distance < best.distance)) {
        best = { entity, distance };
      }
    }
    return best?.entity ?? null;
  }

  private findEnemyAt(sx: number, sy: number, snapshot: Snapshot): EntitySnapshot | null {
    let best: { entity: EntitySnapshot; distance: number } | null = null;
    for (const entity of snapshot.entities) {
      if ((entity.kind !== 'unit' && entity.kind !== 'building') || entity.owner === 0) continue;
      const screen = this.camera.worldToScreen(entity.x, entity.y);
      const distance = (screen.sx - sx) ** 2 + (screen.sy - sy) ** 2;
      const hitRadius = (entity.radius * this.camera.scale + 8) ** 2;
      if (distance <= hitRadius && (!best || distance < best.distance)) {
        best = { entity, distance };
      }
    }
    return best?.entity ?? null;
  }

  private updatePointerCursor(sx: number, sy: number): void {
    if (this.placingBuilding) {
      const snapshot = this.bridge.latest.curr;
      const position = this.snappedPlacement(sx, sy);
      this.app.canvas.style.cursor =
        snapshot && this.isPlacementValid(this.placingBuilding, position, snapshot)
          ? 'crosshair'
          : 'not-allowed';
      return;
    }
    const snapshot = this.bridge.latest.curr;
    const hasSelectedUnits = snapshot?.entities.some(
      (entity) => entity.kind === 'unit' && this.selected.has(entity.id),
    );
    const hasSelectedHarvester = snapshot?.entities.some(
      (entity) => entity.unitType === 'harvester' && this.selected.has(entity.id),
    );
    this.app.canvas.style.cursor =
      hasSelectedHarvester && snapshot && this.findResourceAt(sx, sy, snapshot)
        ? 'cell'
        : hasSelectedUnits && snapshot && this.findEnemyAt(sx, sy, snapshot)
          ? 'crosshair'
          : hasSelectedUnits
            ? 'move'
            : 'pointer';
  }

  private createTerrainTooltip(): void {
    const tooltip = document.createElement('div');
    tooltip.className = 'terrain-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    const title = document.createElement('strong');
    const copy = document.createElement('span');
    tooltip.append(title, copy);
    this.container.appendChild(tooltip);
    this.terrainTooltip = tooltip;
    this.terrainTooltipTitle = title;
    this.terrainTooltipCopy = copy;
  }

  private createRadioCaption(): void {
    const caption = document.createElement('div');
    caption.className = 'radio-caption';
    caption.setAttribute('role', 'status');
    caption.setAttribute('aria-live', 'polite');
    caption.hidden = true;
    this.container.appendChild(caption);
    this.radioCaption = caption;
  }

  private acknowledge(order: RadioOrder, unitType: string | undefined): void {
    const now = performance.now();
    if (now - this.lastRadioAt < 650) return;
    this.lastRadioAt = now;
    const line = radioAcknowledgement(order, unitType, this.radioSequence++);
    if (!this.radioCaption) return;
    const speaker = profileFor(unitType)?.label ?? 'Unit';
    this.radioCaption.textContent = `${speaker.toUpperCase()} · ${line}`;
    this.radioCaption.hidden = false;
    if (this.radioCaptionTimer) clearTimeout(this.radioCaptionTimer);
    this.radioCaptionTimer = setTimeout(() => {
      if (this.radioCaption) this.radioCaption.hidden = true;
      this.radioCaptionTimer = null;
    }, 1_800);
  }

  private updateTerrainTooltip(sx: number, sy: number): void {
    const tooltip = this.terrainTooltip;
    if (!tooltip || this.placingBuilding || this.dragStart || this.entityAt(sx, sy)) {
      this.hideTerrainTooltip();
      return;
    }
    const { wx, wy } = this.camera.screenToWorld(sx, sy);
    const feature = this.terrain.featureAt(wx, wy);
    if (!feature) {
      this.hideTerrainTooltip();
      return;
    }
    this.terrainTooltipTitle!.textContent = feature.label;
    this.terrainTooltipCopy!.textContent = feature.description;
    tooltip.style.left = `${Math.max(8, Math.min(sx + 16, this.container.clientWidth - 256))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(sy + 18, this.container.clientHeight - 78))}px`;
    tooltip.hidden = false;
  }

  private hideTerrainTooltip(): void {
    if (this.terrainTooltip) this.terrainTooltip.hidden = true;
  }

  private entityAt(sx: number, sy: number): boolean {
    const snapshot = this.bridge.latest.curr;
    if (!snapshot) return false;
    return snapshot.entities.some((entity) => {
      const screen = this.camera.worldToScreen(entity.x, entity.y);
      const radius = entity.radius * this.camera.scale * (entity.kind === 'resource' ? 2.8 : 1) + 6;
      return (screen.sx - sx) ** 2 + (screen.sy - sy) ** 2 <= radius ** 2;
    });
  }

  private selectedProductionBuilding(snapshot = this.bridge.latest.curr): EntitySnapshot | null {
    if (this.selected.size !== 1) return null;
    const selectedId = this.selected.values().next().value as number | undefined;
    if (selectedId === undefined) return null;
    const entity = snapshot?.entities.find((candidate) => candidate.id === selectedId);
    return entity?.kind === 'building' && entity.owner === 0 && entity.production ? entity : null;
  }

  private syncSelectionState(snapshot: Snapshot): void {
    const store = useGameStore.getState();
    const existingIds = new Set(snapshot.entities.map((entity) => entity.id));
    for (const id of this.selected) {
      if (!existingIds.has(id)) this.selected.delete(id);
    }
    store.setSelectedCount(this.selected.size);
    const selected = snapshot.entities.filter((entity) => this.selected.has(entity.id));
    if (selected.length === 0) {
      store.setSelectedEntity(null);
    } else if (selected.length > 1) {
      store.setSelectedEntity({
        label: `${selected.length} units selected`,
        kind: 'group',
        count: selected.length,
        commands: selectionCommands(selected),
      });
    } else {
      const entity = selected[0]!;
      const construction = entity.construction;
      const profile = profileFor(entity.unitType, entity.buildingType);
      store.setSelectedEntity({
        label:
          profile?.label ??
          (entity.resource ? 'Ore field' : undefined) ??
          (entity.unitType ?? entity.buildingType ?? entity.kind).replaceAll('_', ' '),
        ...(profile && {
          role: profile.role,
          description: profile.description,
          tacticalNote: profile.tacticalNote,
        }),
        kind:
          entity.kind === 'building'
            ? 'building'
            : entity.kind === 'resource'
              ? 'resource'
              : 'unit',
        ...(entity.buildingType && { buildingType: entity.buildingType }),
        ...(construction && {
          constructionProgress: construction.progressTicks / construction.buildTicks,
        }),
        count: 1,
        commands: selectionCommands(selected),
        hp: entity.hp,
        maxHp: entity.maxHp,
        ...(entity.cargo && {
          cargo: {
            amount: entity.cargo.amount,
            capacity: entity.cargo.capacity,
            phase: entity.cargo.phase,
          },
        }),
        ...(entity.resource && { resourceAmount: entity.resource.amount }),
        status: construction
          ? `Under construction · ${Math.round((construction.progressTicks / construction.buildTicks) * 100)}%`
          : entity.production?.queue.length
            ? `Producing ${entity.production.queue[0]!.replaceAll('_', ' ')}`
            : entity.cargo
              ? harvesterStatus(entity.cargo.phase)
              : entity.resource
                ? 'Resource field'
                : 'Ready',
      });
    }
    const building = this.selectedProductionBuilding(snapshot);
    store.setSelectedProduction(
      building?.production
        ? {
            building: building.id,
            buildingType: building.buildingType ?? 'production building',
            queue: building.production.queue,
            progressTicks: building.production.progressTicks,
            currentBuildTicks: building.production.currentBuildTicks,
            produces: building.production.produces,
          }
        : null,
    );
    this.syncForceState(snapshot);
  }

  private syncForceState(snapshot: Snapshot): void {
    useGameStore.getState().setForceSummary(summarizeForce(snapshot.entities, this.selected));
    this.syncControlGroups(snapshot);
  }

  private syncControlGroups(snapshot: Snapshot): void {
    useGameStore
      .getState()
      .setControlGroups(this.controlGroups.summaries(this.ownedUnitIds(snapshot)));
  }

  private drawCargoBar(entity: EntitySnapshot, sx: number, sy: number, radius: number): void {
    if (!entity.cargo) return;
    const segments = 10;
    const width = radius * 2;
    const gap = 1;
    const segmentWidth = (width - gap * (segments - 1)) / segments;
    const filled = Math.ceil((entity.cargo.amount / entity.cargo.capacity) * segments);
    const y = sy - radius - 13;

    for (let index = 0; index < segments; index++) {
      this.units
        .rect(sx - radius + index * (segmentWidth + gap), y, segmentWidth, 3)
        .fill({ color: index < filled ? 0xd1a63a : 0x20251d, alpha: index < filled ? 1 : 0.8 });
    }
  }

  private updatePan(dtMs: number): void {
    const d = (PAN_SPEED * dtMs) / 1000 / this.camera.zoom;
    const edge = this.cameraDrag
      ? { x: 0, y: 0 }
      : edgePanDirection(
          this.navigationPointer,
          this.app.canvas.clientWidth,
          this.app.canvas.clientHeight,
        );
    const horizontal =
      (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) -
      (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0) +
      edge.x;
    const vertical =
      (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) -
      (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) +
      edge.y;
    if (horizontal || vertical) {
      const length = Math.hypot(horizontal, vertical);
      this.camera.pan((horizontal / length) * d, (vertical / length) * d);
      this.clampCamera();
    }
  }

  private clampCamera(): void {
    if (!this.activeMap) return;
    this.camera.clampToWorld(
      this.activeMap.width * this.activeMap.cellSize,
      this.activeMap.height * this.activeMap.cellSize,
    );
  }

  private updateFps(dtMs: number): void {
    this.fpsAccum += dtMs;
    this.fpsFrames++;
    if (this.fpsAccum >= 500) {
      useGameStore.getState().setFps((this.fpsFrames * 1000) / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.bridge.dispose();
    this.audio.dispose();
    if (this.radioCaptionTimer) clearTimeout(this.radioCaptionTimer);
    this.radioCaptionTimer = null;
    this.radioCaption?.remove();
    this.radioCaption = null;
    this.terrainTooltip?.remove();
    this.terrainTooltip = null;
    // Only destroy Pixi if init finished; otherwise start() will tear it down itself.
    if (this.ready) this.app.destroy(true, { children: true });
  }
}

function wallKey(owner: number, x: number, y: number): string {
  return `${owner}:${Math.round(x * 1000)}:${Math.round(y * 1000)}`;
}

function wallConnections(
  entity: EntitySnapshot,
  walls: ReadonlySet<string>,
  step: number,
): WallConnections {
  return {
    north: walls.has(wallKey(entity.owner, entity.x, entity.y - step)),
    east: walls.has(wallKey(entity.owner, entity.x + step, entity.y)),
    south: walls.has(wallKey(entity.owner, entity.x, entity.y + step)),
    west: walls.has(wallKey(entity.owner, entity.x - step, entity.y)),
  };
}
