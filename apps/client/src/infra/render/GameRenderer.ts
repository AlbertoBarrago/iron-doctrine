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
import { fp, type Snapshot, type EntitySnapshot } from '@iron/engine';
import { asEntityId, SIM_DT_MS } from '@iron/shared';
import { Camera } from './camera.js';
import { ParticleSystem } from './Particles.js';
import { SimBridge } from '../worker/SimBridge.js';
import { AudioBus } from '../audio/AudioBus.js';
import { useGameStore } from '../../state/gameStore.js';

const OWNER_COLORS = [0x4ade80, 0xf87171, 0x60a5fa, 0xfbbf24];
const PAN_SPEED = 12; // world units per second at zoom 1

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
  /** Entities seen last frame, to detect deaths for explosion FX. */
  private readonly prevIds = new Map<number, { x: number; y: number; kind: string }>();

  private readonly selected = new Set<number>();
  private readonly keys = new Set<string>();
  private dragStart: { x: number; y: number } | null = null;
  private dragNow: { x: number; y: number } | null = null;

  private minimapCtx: CanvasRenderingContext2D | null = null;
  private minimapFrame = 0;

  /** True once Pixi's async init has completed; guards teardown before init. */
  private ready = false;
  /** Set if dispose() is called before init finished (StrictMode mount/unmount). */
  private disposed = false;

  private fpsAccum = 0;
  private fpsFrames = 0;

  constructor(private readonly container: HTMLElement) {
    this.camera = new Camera(container.clientWidth, container.clientHeight);
    this.particles = new ParticleSystem(this.camera);
  }

  async start(seed = 123456789): Promise<void> {
    await this.app.init({
      background: 0x0b0f0d,
      resizeTo: this.container,
      antialias: true,
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

    this.bridge.init({
      seed,
      aiPlayers: [{ player: 1, difficulty: 'normal' }],
      startingCredits: { 0: 3000, 1: 4000 },
      startingTech: { 0: ['armor_doctrine'] },
      matchPlayers: [0, 1],
    });
    this.bridge.start();
    useGameStore.getState().setPlaying(true);
    useGameStore.getState().setMatch(null);

    // Seed the demo scene: a base, ore, a harvester and a squad for the human player.
    this.bridge.command({
      type: 'spawnBuilding',
      building: 'construction_yard',
      player: 0,
      at: { x: fp.fromInt(-8), y: fp.fromInt(-8) },
    });
    this.bridge.command({
      type: 'spawnBuilding',
      building: 'power_plant',
      player: 0,
      at: { x: fp.fromInt(-12), y: fp.fromInt(-8) },
    });
    this.bridge.command({
      type: 'spawnBuilding',
      building: 'barracks',
      player: 0,
      at: { x: fp.fromInt(-12), y: fp.fromInt(-3) },
    });
    this.bridge.command({
      type: 'spawnBuilding',
      building: 'factory',
      player: 0,
      at: { x: fp.fromInt(-7), y: fp.fromInt(-2) },
    });
    this.bridge.command({
      type: 'spawnResource',
      amount: 5000,
      at: { x: fp.fromInt(6), y: fp.fromInt(-6) },
    });
    this.bridge.command({
      type: 'spawnUnit',
      unit: 'harvester',
      player: 0,
      at: { x: fp.fromInt(-6), y: fp.fromInt(-6) },
    });
    for (let i = 0; i < 5; i++) {
      this.bridge.command({
        type: 'spawnUnit',
        unit: i % 3 === 0 ? 'tank' : 'rifleman',
        player: 0,
        at: { x: fp.fromInt(-4 + i * 2), y: fp.fromInt(0) },
      });
    }
    // Enemy AI base and economy on the far side of the map.
    this.bridge.command({
      type: 'spawnBuilding',
      building: 'construction_yard',
      player: 1,
      at: { x: fp.fromInt(20), y: fp.fromInt(18) },
    });
    this.bridge.command({
      type: 'spawnBuilding',
      building: 'power_plant',
      player: 1,
      at: { x: fp.fromInt(24), y: fp.fromInt(18) },
    });
    this.bridge.command({
      type: 'spawnResource',
      amount: 6000,
      at: { x: fp.fromInt(16), y: fp.fromInt(20) },
    });
    this.bridge.command({
      type: 'spawnUnit',
      unit: 'harvester',
      player: 1,
      at: { x: fp.fromInt(18), y: fp.fromInt(18) },
    });
    this.bridge.command({
      type: 'spawnUnit',
      unit: 'tank',
      player: 1,
      at: { x: fp.fromInt(8), y: fp.fromInt(6) },
    });

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
  }

  /** Cancel the last item in the selected building's production queue. */
  cancelProduction(): void {
    const building = this.selectedProductionBuilding();
    if (!building?.production || building.production.queue.length === 0) return;
    this.bridge.command({ type: 'cancelProduction', building: asEntityId(building.id) });
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
      this.detectDeaths(curr);
      this.drawEntities(prev, curr, alpha);
      const store = useGameStore.getState();
      store.setEntityCount(
        curr.entities.filter((e) => e.kind === 'unit' || e.kind === 'building').length,
      );
      const me = curr.players.find((p) => p.player === 0);
      if (me) store.setEconomy(me.credits, me.powerProduced, me.powerConsumed);
      store.setMatch(curr.match ?? null);
      this.syncSelectionState(curr);
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
        this.units.circle(sx, sy, Math.max(2, 0.15 * this.camera.scale)).fill({ color: 0xfde047 });
        continue;
      }

      if (e.kind === 'resource') {
        const rr = Math.max(3, e.radius * this.camera.scale);
        this.units.rect(sx - rr, sy - rr, rr * 2, rr * 2).fill({ color: 0x8b6f2e });
        continue;
      }

      const r = e.radius * this.camera.scale;
      const color = OWNER_COLORS[e.owner % OWNER_COLORS.length]!;

      if (e.kind === 'building') {
        const s = r;
        if (this.selected.has(e.id)) {
          this.units
            .rect(sx - s - 3, sy - s - 3, s * 2 + 6, s * 2 + 6)
            .stroke({ width: 2, color: 0xffffff });
        }
        this.units
          .rect(sx - s, sy - s, s * 2, s * 2)
          .fill({ color })
          .stroke({ width: 2, color: 0x0b0f0d });
        if (e.maxHp > 0 && e.hp < e.maxHp) {
          const ratio = Math.max(0, e.hp / e.maxHp);
          this.units.rect(sx - s, sy - s - 8, s * 2, 3).fill({ color: 0x000000, alpha: 0.5 });
          this.units.rect(sx - s, sy - s - 8, s * 2 * ratio, 3).fill({ color: 0x4ade80 });
        }
        continue;
      }

      // Selection ring.
      if (this.selected.has(e.id)) {
        this.units.circle(sx, sy, r + 4).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
      }
      // Body.
      this.units.circle(sx, sy, r).fill({ color });
      // Facing tick.
      this.units
        .moveTo(sx, sy)
        .lineTo(sx + Math.cos(e.angle) * r, sy + Math.sin(e.angle) * r)
        .stroke({ width: 2, color: 0x0b0f0d, alpha: 0.6 });

      // Health bar.
      if (e.maxHp > 0 && e.hp < e.maxHp) {
        const w = r * 2;
        const ratio = Math.max(0, e.hp / e.maxHp);
        this.units.rect(sx - r, sy - r - 8, w, 3).fill({ color: 0x000000, alpha: 0.5 });
        this.units
          .rect(sx - r, sy - r - 8, w * ratio, 3)
          .fill({ color: ratio > 0.5 ? 0x4ade80 : ratio > 0.25 ? 0xfbbf24 : 0xf87171 });
      }
    }
  }

  private drawGrid(): void {
    this.grid.clear();
    const step = this.camera.scale; // one world unit
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    const origin = this.camera.worldToScreen(0, 0);
    const startX = origin.sx % step;
    const startY = origin.sy % step;
    for (let x = startX; x < w; x += step) {
      this.grid.moveTo(x, 0).lineTo(x, h);
    }
    for (let y = startY; y < h; y += step) {
      this.grid.moveTo(0, y).lineTo(w, y);
    }
    this.grid.stroke({ width: 1, color: 0x1c2b24, alpha: 0.6 });
  }

  /** Draws hidden/explored fog over cells within the viewport (visible cells clear). */
  private drawFog(curr: Snapshot): void {
    this.fogGfx.clear();
    const fog = curr.fog;
    if (!fog) return;

    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
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
          alpha: state === 0 ? 0.85 : 0.45, // hidden darker than explored
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

    ctx.fillStyle = '#0b0f0d';
    ctx.fillRect(0, 0, W, H);

    // Fog: darken hidden/explored using a coarse cell step to stay cheap.
    const step = Math.max(1, Math.floor(fog.width / 64));
    const cw = (W / fog.width) * step + 1;
    const ch = (H / fog.height) * step + 1;
    for (let cy = 0; cy < fog.height; cy += step) {
      for (let cx = 0; cx < fog.width; cx += step) {
        const s = fog.cells[cy * fog.width + cx]!;
        if (s === 2) continue;
        ctx.fillStyle = s === 0 ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.4)';
        ctx.fillRect((cx / fog.width) * W, (cy / fog.height) * H, cw, ch);
      }
    }

    // Blips.
    for (const e of curr.entities) {
      if (e.kind === 'projectile') continue;
      const { mx, my } = toMap(e.x, e.y);
      ctx.fillStyle = e.kind === 'resource' ? '#8b6f2e' : e.owner === 0 ? '#4ade80' : '#f87171';
      const size = e.kind === 'building' ? 4 : 2;
      ctx.fillRect(mx - size / 2, my - size / 2, size, size);
    }

    // Camera viewport rectangle.
    const tl = this.camera.screenToWorld(0, 0);
    const br = this.camera.screenToWorld(this.app.renderer.width, this.app.renderer.height);
    const a = toMap(tl.wx, tl.wy);
    const b = toMap(br.wx, br.wy);
    ctx.strokeStyle = '#dff5ea';
    ctx.lineWidth = 1;
    ctx.strokeRect(a.mx, a.my, b.mx - a.mx, b.my - a.my);
  }

  private drawSelectionBox(): void {
    this.overlay.clear();
    if (this.dragStart && this.dragNow) {
      const x = Math.min(this.dragStart.x, this.dragNow.x);
      const y = Math.min(this.dragStart.y, this.dragNow.y);
      const w = Math.abs(this.dragNow.x - this.dragStart.x);
      const h = Math.abs(this.dragNow.y - this.dragStart.y);
      this.overlay
        .rect(x, y, w, h)
        .fill({ color: 0x4ade80, alpha: 0.1 })
        .stroke({ width: 1, color: 0x4ade80 });
    }
  }

  // ---- input -----------------------------------------------------------------

  private installInput(): void {
    const canvas = this.app.canvas;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camera.zoomBy(e.deltaY < 0 ? 1.1 : 0.9);
    });
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('resize', () =>
      this.camera.resize(this.container.clientWidth, this.container.clientHeight),
    );
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button === 0) {
      this.dragStart = { x: e.offsetX, y: e.offsetY };
      this.dragNow = { x: e.offsetX, y: e.offsetY };
    } else if (e.button === 2) {
      this.issueMove(e.offsetX, e.offsetY);
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.dragStart) this.dragNow = { x: e.offsetX, y: e.offsetY };
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.button !== 0 || !this.dragStart) return;
    const additive = e.ctrlKey || e.shiftKey;
    if (!additive) this.selected.clear();

    const box = { x0: this.dragStart.x, y0: this.dragStart.y, x1: e.offsetX, y1: e.offsetY };
    const isClick = Math.abs(box.x1 - box.x0) < 4 && Math.abs(box.y1 - box.y0) < 4;
    this.selectInBox(box, isClick);

    this.dragStart = null;
    this.dragNow = null;
    if (this.selected.size > 0) this.audio.play('select');
    const curr = this.bridge.latest.curr;
    if (curr) this.syncSelectionState(curr);
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

    const clicked = this.findOwnedUnitAt(e.offsetX, e.offsetY, curr);
    if (!clicked?.unitType) return;
    if (!e.ctrlKey && !e.shiftKey) this.selected.clear();

    const viewportWidth = this.app.renderer.width;
    const viewportHeight = this.app.renderer.height;
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
    if (this.selected.size === 0) return;
    const { wx, wy } = this.camera.screenToWorld(sx, sy);
    const curr = this.bridge.latest.curr;
    const units = curr?.entities.filter((entity) => {
      return entity.kind === 'unit' && this.selected.has(entity.id);
    });
    if (!units || units.length === 0) {
      const building = this.selectedProductionBuilding();
      if (building) {
        this.audio.play('move');
        this.bridge.command({
          type: 'setRally',
          building: asEntityId(building.id),
          point: { x: fp.fromFloat(wx), y: fp.fromFloat(wy) },
        });
      }
      return;
    }
    this.audio.play('move');
    this.bridge.command({
      type: 'move',
      entities: units.map((entity) => asEntityId(entity.id)),
      target: { x: fp.fromFloat(wx), y: fp.fromFloat(wy) },
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
    store.setSelectedCount(this.selected.size);
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

  private updatePan(dtMs: number): void {
    const d = (PAN_SPEED * dtMs) / 1000 / this.camera.zoom;
    if (this.keys.has('w') || this.keys.has('arrowup')) this.camera.pan(0, -d);
    if (this.keys.has('s') || this.keys.has('arrowdown')) this.camera.pan(0, d);
    if (this.keys.has('a') || this.keys.has('arrowleft')) this.camera.pan(-d, 0);
    if (this.keys.has('d') || this.keys.has('arrowright')) this.camera.pan(d, 0);
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
