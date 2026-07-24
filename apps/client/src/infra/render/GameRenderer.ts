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
import { BUILDING_STATS, fp, type Snapshot, type EntitySnapshot } from '@iron/engine';
import { asEntityId, SIM_DT_MS, SIM_HZ, type MapDef, type MapSpawn } from '@iron/shared';
import { Camera, edgePanDirection, exceedsDragThreshold } from './camera.js';
import { minimapTerrainColor } from './minimapFog.js';
import { ParticleSystem } from './Particles.js';
import { SimBridge } from '../worker/SimBridge.js';
import { AudioBus } from '../audio/AudioBus.js';
import {
  commandFeedbackFrame,
  type CommandFeedback,
  type CommandFeedbackKind,
} from './commandFeedback.js';
import { selectionCommands, useGameStore } from '../../state/gameStore.js';
import { firstContactLayout, type SkirmishConfig } from '../../game/skirmishConfig.js';

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
  private readonly grid = new Graphics();
  private readonly units = new Graphics();
  private readonly fogGfx = new Graphics();
  private readonly overlay = new Graphics();
  private readonly bridge = new SimBridge();
  private readonly particles: ParticleSystem;
  private readonly audio = new AudioBus();
  private activeMap: MapDef | null = null;
  private aiActivationTick = 0;
  /** Entities seen last frame, to detect deaths for explosion FX. */
  private readonly prevIds = new Map<number, { x: number; y: number; kind: string }>();

  private readonly selected = new Set<number>();
  private readonly keys = new Set<string>();
  private dragStart: { x: number; y: number } | null = null;
  private dragNow: { x: number; y: number } | null = null;
  private placingBuilding: string | null = null;
  private placementPointer: { x: number; y: number } | null = null;
  private navigationPointer: { x: number; y: number } | null = null;
  private cameraDrag: {
    startX: number;
    startY: number;
    x: number;
    y: number;
    pointerId: number;
    button: 1 | 2;
    moved: boolean;
  } | null = null;
  private commandFeedback: CommandFeedback | null = null;

  private minimapCtx: CanvasRenderingContext2D | null = null;
  private minimapFrame = 0;

  /** True once Pixi's async init has completed; guards teardown before init. */
  private ready = false;
  /** Set if dispose() is called before init finished (StrictMode mount/unmount). */
  private disposed = false;

  private fpsAccum = 0;
  private fpsFrames = 0;
  private lastUiTick = -1;

  constructor(private readonly container: HTMLElement) {
    this.camera = new Camera(container.clientWidth, container.clientHeight);
    this.particles = new ParticleSystem(this.camera);
  }

  async start(config: SkirmishConfig, seed = 123456789): Promise<void> {
    this.activeMap = config.map;
    this.aiActivationTick = config.gracePeriodSeconds * SIM_HZ;
    const humanSpawn = config.map.spawns.find((spawn) => spawn.player === 0);
    const enemySpawn = config.map.spawns.find((spawn) => spawn.player === 1);
    if (!humanSpawn || !enemySpawn)
      throw new Error('Skirmish maps require Player 1 and Player 2 spawns');
    const humanBase = mapPosition(config.map, humanSpawn.x, humanSpawn.y);
    const firstContact = firstContactLayout(config.map);
    const recoveryAt = mapPosition(config.map, firstContact.recovery.x, firstContact.recovery.y);
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

    this.app.stage.addChild(this.grid, this.world);
    this.world.addChild(this.units);
    this.app.stage.addChild(this.particles.gfx, this.fogGfx, this.overlay);

    const aiCredits =
      config.difficulty === 'easy' ? 1800 : config.difficulty === 'normal' ? 2600 : 3400;
    this.bridge.init({
      seed,
      map: config.map,
      aiPlayers: [
        {
          player: 1,
          difficulty: config.difficulty,
          activationTick: this.aiActivationTick,
        },
      ],
      startingCredits: { 0: 0, 1: aiCredits },
      startingTech: {
        0: ['infantry_doctrine', 'armor_doctrine'],
        1: ['infantry_doctrine', 'armor_doctrine'],
      },
      matchPlayers: [0, 1],
      firstContact: {
        player: 0,
        recoveryAt,
        recoveryTicks: SIM_HZ * 4,
        recoveredCredits: 2600,
      },
    });
    this.bridge.start();
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

    // A strong patrol teaches control before the economy and construction layers unlock.
    for (let i = 0; i < 6; i++) {
      this.bridge.command({
        type: 'spawnUnit',
        unit: i < 2 ? 'tank' : 'rifleman',
        player: 0,
        at: offsetSpawn(config.map, humanSpawn, (i % 3) * 2, Math.floor(i / 3) * 2),
      });
    }
    // Light resistance on the route: dangerous enough to teach focus fire, not attrition.
    for (const position of firstContact.resistance.slice(0, 2)) {
      this.bridge.command({
        type: 'spawnUnit',
        unit: 'rifleman',
        player: 1,
        at: mapPosition(config.map, position.x, position.y),
      });
    }

    // Enemy base starts dormant until the configured activation tick.
    this.bridge.command({
      type: 'spawnBuilding',
      building: 'construction_yard',
      player: 1,
      at: enemyBase,
    });
    this.bridge.command({
      type: 'spawnBuilding',
      building: 'power_plant',
      player: 1,
      at: offsetSpawn(config.map, enemySpawn, -5, 0),
    });
    this.bridge.command({
      type: 'spawnBuilding',
      building: 'barracks',
      player: 1,
      at: offsetSpawn(config.map, enemySpawn, 0, -5),
    });
    this.bridge.command({
      type: 'spawnBuilding',
      building: 'factory',
      player: 1,
      at: offsetSpawn(config.map, enemySpawn, -6, -6),
    });
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

    this.installInput();
    this.app.ticker.add(() => this.render());
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
  }

  setAudioMuted(muted: boolean): void {
    this.audio.setMuted(muted);
  }

  setAudioVolume(volume: number): void {
    this.audio.setVolume(volume);
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
    useGameStore.getState().advanceTutorial('produce');
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

  stopSelectedUnits(): void {
    const units = this.selectedUnits();
    if (units.length === 0) return;
    this.bridge.command({
      type: 'stop',
      entities: units.map((entity) => asEntityId(entity.id)),
    });
  }

  gatherWithSelectedHarvesters(target?: EntitySnapshot): void {
    const harvesters = this.selectedUnits().filter((entity) => entity.unitType === 'harvester');
    if (harvesters.length === 0) return;
    this.bridge.command({
      type: 'gather',
      entities: harvesters.map((entity) => asEntityId(entity.id)),
      ...(target ? { target: asEntityId(target.id) } : {}),
    });
    useGameStore.getState().advanceTutorial('gather');
  }

  // ---- rendering -------------------------------------------------------------

  private render(): void {
    const dtMs = this.app.ticker.deltaMS;
    this.updateFps(dtMs);
    this.updatePan(dtMs);

    const { prev, curr, at } = this.bridge.latest;
    this.drawGrid();
    this.units.clear();
    this.particles.update(dtMs / 1000);
    this.particles.draw();
    if (prev && curr) {
      const alpha = Math.min(1, (performance.now() - at) / SIM_DT_MS);
      this.drawEntities(prev, curr, alpha);
      this.drawScenarioSite(curr);
      if (curr.tick !== this.lastUiTick) {
        this.lastUiTick = curr.tick;
        this.detectDeaths(curr);
        const store = useGameStore.getState();
        store.setEntityCount(
          curr.entities.filter((e) => e.kind === 'unit' || e.kind === 'building').length,
        );
        const me = curr.players.find((p) => p.player === 0);
        if (me) store.setEconomy(me.credits, me.powerProduced, me.powerConsumed);
        store.setMatch(curr.match ?? null);
        store.setScenario(curr.scenario ?? null);
        const activationOrigin = curr.scenario?.operationalAtTick;
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
    this.drawSelectionBox();
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
      }
    }
    this.prevIds.clear();
    for (const e of curr.entities) this.prevIds.set(e.id, { x: e.x, y: e.y, kind: e.kind });
  }

  private drawEntities(prev: Snapshot, curr: Snapshot, alpha: number): void {
    const prevById = new Map<number, EntitySnapshot>();
    for (const e of prev.entities) prevById.set(e.id, e);

    for (const e of curr.entities) {
      const p = prevById.get(e.id) ?? e;
      const wx = p.x + (e.x - p.x) * alpha;
      const wy = p.y + (e.y - p.y) * alpha;
      const { sx, sy } = this.camera.worldToScreen(wx, wy);

      if (e.kind === 'projectile') {
        this.units.circle(sx, sy, Math.max(2, 0.15 * this.camera.scale)).fill({ color: 0xf2be4c });
        continue;
      }

      if (e.kind === 'resource') {
        const rr = Math.max(3, e.radius * this.camera.scale);
        this.units
          .moveTo(sx, sy - rr)
          .lineTo(sx + rr, sy)
          .lineTo(sx, sy + rr)
          .lineTo(sx - rr, sy)
          .closePath()
          .fill({ color: 0x9b742a })
          .stroke({ width: 2, color: 0x4a3514 });
        continue;
      }

      const r = e.radius * this.camera.scale;
      const color = OWNER_COLORS[e.owner % OWNER_COLORS.length]!;

      if (
        e.unitType === 'rifleman' &&
        e.attackTarget !== undefined &&
        e.weaponCooldownLeft !== undefined &&
        e.weaponCooldownLeft > (p.weaponCooldownLeft ?? 0)
      ) {
        const target = curr.entities.find((candidate) => candidate.id === e.attackTarget);
        if (target) {
          const targetScreen = this.camera.worldToScreen(target.x, target.y);
          this.units
            .moveTo(sx, sy)
            .lineTo(targetScreen.sx, targetScreen.sy)
            .stroke({ width: 1.5, color: 0xf4d77a, alpha: 0.85 })
            .circle(sx + Math.cos(e.angle) * r, sy + Math.sin(e.angle) * r, 3)
            .fill({ color: 0xffe29a, alpha: 0.95 });
        }
      }

      if (e.kind === 'building') {
        const s = r;
        if (this.selected.has(e.id)) {
          this.units
            .rect(sx - s - 3, sy - s - 3, s * 2 + 6, s * 2 + 6)
            .stroke({ width: 2, color: 0xf0c85a });
        }
        this.units
          .rect(sx - s, sy - s, s * 2, s * 2)
          .fill({ color, alpha: e.construction ? 0.45 : 1 })
          .stroke({ width: 2, color: 0x0b0f0d });
        this.drawBuildingMark(e, sx, sy, s);
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

      // Selection ring.
      if (this.selected.has(e.id)) {
        this.units.circle(sx, sy, r + 4).stroke({ width: 2, color: 0xf0c85a, alpha: 0.95 });
      }
      this.drawUnitBody(e, sx, sy, r, color);
      // Facing tick.
      this.units
        .moveTo(sx, sy)
        .lineTo(sx + Math.cos(e.angle) * r, sy + Math.sin(e.angle) * r)
        .stroke({ width: 2, color: 0x0b0f0d, alpha: 0.6 });

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
    if (!scenario || scenario.phase === 'operational') return;
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

  private drawBuildingMark(entity: EntitySnapshot, sx: number, sy: number, size: number): void {
    const ink = 0x0b1711;
    const mark = entity.buildingType;
    if (mark === 'construction_yard') {
      this.units
        .moveTo(sx - size * 0.55, sy - size * 0.55)
        .lineTo(sx + size * 0.55, sy + size * 0.55)
        .moveTo(sx + size * 0.55, sy - size * 0.55)
        .lineTo(sx - size * 0.55, sy + size * 0.55)
        .stroke({ width: 3, color: ink });
    } else if (mark === 'power_plant') {
      this.units.circle(sx, sy, size * 0.45).stroke({ width: 3, color: ink });
    } else if (mark === 'refinery') {
      this.units
        .rect(sx - size * 0.5, sy - size * 0.28, size, size * 0.56)
        .stroke({ width: 3, color: ink });
    } else if (mark === 'barracks') {
      for (const offset of [-0.45, 0, 0.45]) {
        this.units
          .moveTo(sx + size * offset, sy - size * 0.6)
          .lineTo(sx + size * offset, sy + size * 0.6);
      }
      this.units.stroke({ width: 2, color: ink });
    } else if (mark === 'factory') {
      this.units
        .rect(sx - size * 0.7, sy - size * 0.35, size * 0.55, size * 0.7)
        .rect(sx + size * 0.15, sy - size * 0.35, size * 0.55, size * 0.7)
        .fill({ color: ink });
    } else if (mark === 'turret') {
      this.units
        .circle(sx, sy, size * 0.45)
        .fill({ color: ink })
        .moveTo(sx, sy)
        .lineTo(sx + size * 0.9, sy)
        .stroke({ width: 3, color: ink });
    }
  }

  private drawUnitBody(
    entity: EntitySnapshot,
    sx: number,
    sy: number,
    radius: number,
    color: number,
  ): void {
    if (entity.unitType === 'tank') {
      this.units
        .roundRect(sx - radius, sy - radius * 0.72, radius * 2, radius * 1.44, 2)
        .fill({ color })
        .rect(sx - radius * 0.4, sy - radius * 0.28, radius * 0.8, radius * 0.56)
        .fill({ color: 0x17231d });
      return;
    }
    if (entity.unitType === 'harvester') {
      this.units
        .rect(sx - radius, sy - radius * 0.75, radius * 2, radius * 1.5)
        .fill({ color })
        .rect(sx - radius * 0.7, sy - radius * 0.16, radius * 1.4, radius * 0.32)
        .fill({ color: 0xc59b3c });
      return;
    }
    if (entity.unitType === 'engineer') {
      this.units
        .moveTo(sx, sy - radius)
        .lineTo(sx + radius, sy)
        .lineTo(sx, sy + radius)
        .lineTo(sx - radius, sy)
        .closePath()
        .fill({ color });
      return;
    }
    this.units.circle(sx, sy, radius).fill({ color });
  }

  private drawGrid(): void {
    this.grid.clear();
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    this.grid.rect(0, 0, w, h).fill({ color: 0x2d3827 });

    // Deterministic cosmetic terrain. This never enters authoritative sim state.
    const tileWorld = 8;
    const topLeft = this.camera.screenToWorld(0, 0);
    const bottomRight = this.camera.screenToWorld(w, h);
    const minX = Math.floor(topLeft.wx / tileWorld) - 1;
    const maxX = Math.ceil(bottomRight.wx / tileWorld) + 1;
    const minY = Math.floor(topLeft.wy / tileWorld) - 1;
    const maxY = Math.ceil(bottomRight.wy / tileWorld) + 1;
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        const hash = Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663);
        if ((hash & 3) === 0) continue;
        const screen = this.camera.worldToScreen(tx * tileWorld, ty * tileWorld);
        const size = tileWorld * this.camera.scale;
        const color = (hash & 1) === 0 ? 0x35402c : 0x293323;
        this.grid.rect(screen.sx, screen.sy, size + 1, size + 1).fill({ color, alpha: 0.38 });
        if ((hash & 7) === 3) {
          this.grid
            .circle(screen.sx + size * 0.55, screen.sy + size * 0.45, size * 0.22)
            .fill({ color: 0x4a3c25, alpha: 0.26 });
        }
      }
    }

    if (this.activeMap) {
      const size = this.activeMap.cellSize * this.camera.scale;
      for (const [x, y] of this.activeMap.blocked) {
        const worldX = (x - this.activeMap.width / 2) * this.activeMap.cellSize;
        const worldY = (y - this.activeMap.height / 2) * this.activeMap.cellSize;
        const screen = this.camera.worldToScreen(worldX, worldY);
        this.grid
          .rect(screen.sx, screen.sy, size + 1, size + 1)
          .fill({ color: 0x171a14, alpha: 0.92 });
      }
    }

    const step = this.camera.scale * 4;
    const origin = this.camera.worldToScreen(0, 0);
    const startX = origin.sx % step;
    const startY = origin.sy % step;
    for (let x = startX; x < w; x += step) {
      this.grid.moveTo(x, 0).lineTo(x, h);
    }
    for (let y = startY; y < h; y += step) {
      this.grid.moveTo(0, y).lineTo(w, y);
    }
    this.grid.stroke({ width: 1, color: 0x78805a, alpha: 0.09 });
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
          alpha: state === 0 ? 1 : 0.28,
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
    if (!scenario || scenario.phase === 'operational' || scenario.phase === 'failed') return;

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
    useGameStore.getState().advanceTutorial('build');
    this.cancelBuildingPlacement();
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
    canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    canvas.addEventListener('pointerleave', () => {
      if (!this.cameraDrag) this.navigationPointer = null;
    });
    canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camera.zoomBy(e.deltaY < 0 ? 1.1 : 0.9);
    });
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      if (e.key === 'Escape') this.cancelBuildingPlacement();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('resize', () =>
      this.camera.resize(this.container.clientWidth, this.container.clientHeight),
    );
  }

  private onPointerDown(e: PointerEvent): void {
    const point = this.canvasPoint(e);
    if (this.placingBuilding) {
      if (e.button === 0) this.confirmBuildingPlacement(point.x, point.y);
      else if (e.button === 2) this.cancelBuildingPlacement();
      return;
    }
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      this.cameraDrag = {
        startX: point.x,
        startY: point.y,
        x: point.x,
        y: point.y,
        pointerId: e.pointerId,
        button: e.button,
        moved: e.button === 1,
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
      const dx = point.x - this.cameraDrag.x;
      const dy = point.y - this.cameraDrag.y;
      const moved =
        this.cameraDrag.moved ||
        exceedsDragThreshold({ x: this.cameraDrag.startX, y: this.cameraDrag.startY }, point);
      if (moved) {
        this.camera.panByScreenDelta(dx, dy);
        this.clampCamera();
      }
      this.cameraDrag = { ...this.cameraDrag, x: point.x, y: point.y, moved };
      return;
    }
    this.updatePointerCursor(point.x, point.y);
    if (this.dragStart) this.dragNow = point;
  }

  private onPointerUp(e: PointerEvent): void {
    const point = this.canvasPoint(e);
    if ((e.button === 1 || e.button === 2) && this.cameraDrag) {
      const drag = this.cameraDrag;
      if (e.currentTarget instanceof Element && e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      this.cameraDrag = null;
      if (drag.button === 2 && !drag.moved) this.issueMove(point.x, point.y);
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
    if (this.selected.size > 0) useGameStore.getState().advanceTutorial('select');
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

    let best: { id: number; d: number } | null = null;
    for (const ent of curr.entities) {
      if ((ent.kind !== 'unit' && ent.kind !== 'building') || ent.owner !== 0) continue;
      const { sx, sy } = this.camera.worldToScreen(ent.x, ent.y);
      if (isClick) {
        const d = (sx - box.x0) ** 2 + (sy - box.y0) ** 2;
        const rr = (ent.radius * this.camera.scale + 6) ** 2;
        if (d <= rr && (!best || d < best.d)) best = { id: ent.id, d };
      } else if (ent.kind === 'unit' && sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
        this.selected.add(ent.id);
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
      const target = this.camera.screenToWorld(point.x, point.y);
      this.camera.x = target.wx;
      this.camera.y = target.wy;
      this.clampCamera();
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
    const { wx, wy } = this.camera.screenToWorld(sx, sy);
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
          point: { x: fp.fromFloat(wx), y: fp.fromFloat(wy) },
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
      this.showCommandFeedback(sx, sy, 'attack');
      this.audio.play('move');
      this.bridge.command({
        type: 'attack',
        entities: units.map((entity) => asEntityId(entity.id)),
        target: asEntityId(enemy.id),
      });
      useGameStore.getState().advanceTutorial('attack');
      return;
    }
    this.showCommandFeedback(sx, sy, 'move');
    this.audio.play('move');
    this.bridge.command({
      type: 'move',
      entities: units.map((entity) => asEntityId(entity.id)),
      target: { x: fp.fromFloat(wx), y: fp.fromFloat(wy) },
    });
    useGameStore.getState().advanceTutorial('move');
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

  private selectedProductionBuilding(snapshot = this.bridge.latest.curr): EntitySnapshot | null {
    if (this.selected.size !== 1) return null;
    const selectedId = this.selected.values().next().value as number | undefined;
    if (selectedId === undefined) return null;
    const entity = snapshot?.entities.find((candidate) => candidate.id === selectedId);
    return entity?.kind === 'building' && entity.owner === 0 && entity.production ? entity : null;
  }

  private syncSelectionState(snapshot: Snapshot): void {
    const store = useGameStore.getState();
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
      store.setSelectedEntity({
        label: (entity.unitType ?? entity.buildingType ?? entity.kind).replaceAll('_', ' '),
        kind: entity.kind === 'building' ? 'building' : 'unit',
        count: 1,
        commands: selectionCommands(selected),
        hp: entity.hp,
        maxHp: entity.maxHp,
        ...(entity.cargo && {
          cargo: { amount: entity.cargo.amount, capacity: entity.cargo.capacity },
        }),
        status: construction
          ? `Under construction · ${Math.round((construction.progressTicks / construction.buildTicks) * 100)}%`
          : entity.production?.queue.length
            ? `Producing ${entity.production.queue[0]!.replaceAll('_', ' ')}`
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
    // Only destroy Pixi if init finished; otherwise start() will tear it down itself.
    if (this.ready) this.app.destroy(true, { children: true });
  }
}
