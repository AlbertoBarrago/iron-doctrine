/** Zustand store for PRESENTATION state only. Never holds authoritative sim state. */
import { create } from 'zustand';
import {
  UNIT_STATS,
  type BlackDawnSnapshot,
  type EntitySnapshot,
  type FirstContactSnapshot,
  type IronPassSnapshot,
  type MatchStateSnapshot,
  type MatchMetricsSnapshot,
  type SiegeLineSnapshot,
} from '@iron/engine';
export { harvesterStatus } from './entityReadout.js';

type ScenarioSnapshot =
  FirstContactSnapshot | IronPassSnapshot | SiegeLineSnapshot | BlackDawnSnapshot;

export type TutorialMilestone =
  'select' | 'power' | 'gather' | 'barracks' | 'produce' | 'defense';
export type TutorialStep = TutorialMilestone | 'complete';
export type SelectionCommand =
  'move' | 'attack' | 'stop' | 'gather' | 'build' | 'produce' | 'rally' | 'demolish' | 'recycle';

export interface SelectedEntitySummary {
  label: string;
  role?: string;
  description?: string;
  tacticalNote?: string;
  kind: 'unit' | 'building' | 'resource' | 'group';
  buildingType?: string;
  constructionProgress?: number;
  count: number;
  hp?: number;
  maxHp?: number;
  status?: string;
  cargo?: NonNullable<EntitySnapshot['cargo']>;
  resourceAmount?: number;
  commands: SelectionCommand[];
}

export interface SelectedProduction {
  building: number;
  buildingType: string;
  queue: string[];
  progressTicks: number;
  currentBuildTicks: number;
  produces: string[];
}

export interface ForceUnitSummary {
  unitType: string;
  total: number;
  selected: number;
}

export interface ForceSummary {
  total: number;
  selected: number;
  units: ForceUnitSummary[];
}

export interface ControlGroupSummary {
  slot: number;
  count: number;
}

export interface BattleReport {
  metrics: MatchMetricsSnapshot;
  victory: boolean;
  newlyUnlocked: string[];
}

export function summarizeForce(
  entities: readonly EntitySnapshot[],
  selectedIds: ReadonlySet<number>,
): ForceSummary {
  const counts = new Map<string, { total: number; selected: number }>();
  for (const entity of entities) {
    if (entity.kind !== 'unit' || entity.owner !== 0 || !entity.unitType) continue;
    const current = counts.get(entity.unitType) ?? { total: 0, selected: 0 };
    current.total++;
    if (selectedIds.has(entity.id)) current.selected++;
    counts.set(entity.unitType, current);
  }
  const units = [...counts]
    .map(([unitType, count]) => ({ unitType, ...count }))
    .sort((left, right) => left.unitType.localeCompare(right.unitType));
  return {
    total: units.reduce((sum, unit) => sum + unit.total, 0),
    selected: units.reduce((sum, unit) => sum + unit.selected, 0),
    units,
  };
}

export type CommandTab = 'orders' | 'build' | 'production';

export function preferredCommandTab(
  selected: SelectedEntitySummary | null,
  production: SelectedProduction | null,
): CommandTab {
  if (production) return 'production';
  if (selected?.commands.includes('build')) return 'build';
  return 'orders';
}

export function commandSelectionContext(
  selected: SelectedEntitySummary | null,
  production: SelectedProduction | null,
): string {
  const selection = selected
    ? `${selected.kind}:${selected.label}:${selected.count}:${selected.commands.join(',')}`
    : 'none';
  return `${selection}:${production?.building ?? 'none'}`;
}

export function commandTabAvailable(
  tab: CommandTab,
  baseOperational: boolean,
  selected: SelectedEntitySummary | null,
  production: SelectedProduction | null,
): boolean {
  if (tab === 'orders') return true;
  if (!baseOperational) return false;
  if (tab === 'build') return selected?.commands.includes('build') ?? false;
  return production !== null;
}

export type CommandAvailability =
  { available: true; label: 'Ready' } | { available: false; label: string };

export function commandAvailability(credits: number, cost: number): CommandAvailability {
  if (credits >= cost) return { available: true, label: 'Ready' };
  return { available: false, label: `Requires $${cost - credits} more` };
}

interface GameUiState {
  fps: number;
  playing: boolean;
  entityCount: number;
  selectedCount: number;
  forceSummary: ForceSummary;
  controlGroups: ControlGroupSummary[];
  selectedEntity: SelectedEntitySummary | null;
  credits: number;
  power: { produced: number; consumed: number };
  selectedProduction: SelectedProduction | null;
  placingBuilding: string | null;
  match: MatchStateSnapshot | null;
  matchMetrics: MatchMetricsSnapshot | null;
  battleReport: BattleReport | null;
  scenario: ScenarioSnapshot | null;
  aiActivationSeconds: number;
  tutorialStep: TutorialStep;
  completedTutorial: TutorialMilestone[];
  setFps: (fps: number) => void;
  setPlaying: (playing: boolean) => void;
  setEntityCount: (n: number) => void;
  setSelectedCount: (n: number) => void;
  setForceSummary: (summary: ForceSummary) => void;
  setControlGroups: (groups: ControlGroupSummary[]) => void;
  setSelectedEntity: (entity: SelectedEntitySummary | null) => void;
  setEconomy: (credits: number, produced: number, consumed: number) => void;
  setSelectedProduction: (production: SelectedProduction | null) => void;
  setPlacingBuilding: (building: string | null) => void;
  setMatch: (match: MatchStateSnapshot | null) => void;
  setMatchMetrics: (metrics: MatchMetricsSnapshot | null) => void;
  setBattleReport: (report: BattleReport | null) => void;
  setScenario: (scenario: ScenarioSnapshot | null) => void;
  setAiActivationSeconds: (seconds: number) => void;
  advanceTutorial: (milestone: TutorialMilestone) => void;
  resetTutorial: () => void;
}

const TUTORIAL_STEPS: TutorialMilestone[] = [
  'select',
  'power',
  'gather',
  'barracks',
  'produce',
  'defense',
];

export function tutorialProgress(
  completed: readonly TutorialMilestone[],
  milestone: TutorialMilestone,
): { completed: TutorialMilestone[]; step: TutorialStep } {
  const nextCompleted = completed.includes(milestone) ? [...completed] : [...completed, milestone];
  const step = TUTORIAL_STEPS.find((candidate) => !nextCompleted.includes(candidate)) ?? 'complete';
  return { completed: nextCompleted, step };
}

function sameSelectedEntity(
  left: SelectedEntitySummary | null,
  right: SelectedEntitySummary | null,
): boolean {
  if (!left || !right) return left === right;
  return (
    left.label === right.label &&
    left.role === right.role &&
    left.description === right.description &&
    left.tacticalNote === right.tacticalNote &&
    left.kind === right.kind &&
    left.buildingType === right.buildingType &&
    left.constructionProgress === right.constructionProgress &&
    left.count === right.count &&
    left.hp === right.hp &&
    left.maxHp === right.maxHp &&
    left.status === right.status &&
    left.cargo?.amount === right.cargo?.amount &&
    left.cargo?.capacity === right.cargo?.capacity &&
    left.cargo?.phase === right.cargo?.phase &&
    left.resourceAmount === right.resourceAmount &&
    left.commands.join() === right.commands.join()
  );
}

function sameForceSummary(left: ForceSummary, right: ForceSummary): boolean {
  return (
    left.total === right.total &&
    left.selected === right.selected &&
    left.units.length === right.units.length &&
    left.units.every(
      (unit, index) =>
        unit.unitType === right.units[index]?.unitType &&
        unit.total === right.units[index]?.total &&
        unit.selected === right.units[index]?.selected,
    )
  );
}

function sameControlGroups(
  left: readonly ControlGroupSummary[],
  right: readonly ControlGroupSummary[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (group, index) =>
        group.slot === right[index]?.slot && group.count === right[index]?.count,
    )
  );
}

const COMMAND_ORDER: SelectionCommand[] = [
  'gather',
  'move',
  'attack',
  'stop',
  'build',
  'produce',
  'rally',
  'recycle',
  'demolish',
];

export function selectionCommands(entities: readonly EntitySnapshot[]): SelectionCommand[] {
  const available = new Set<SelectionCommand>();
  const units = entities.filter((entity) => entity.kind === 'unit');
  if (units.length > 0) {
    available.add('move');
    available.add('stop');
    if (units.some((entity) => entity.unitType === 'harvester')) available.add('gather');
    if (units.some((entity) => entity.unitType && UNIT_STATS[entity.unitType]?.weapon)) {
      available.add('attack');
    }
  }
  if (entities.length === 1) {
    const entity = entities[0]!;
    if (entity.buildingType === 'construction_yard') available.add('build');
    if (entity.production) {
      available.add('produce');
      available.add('rally');
    }
    if (entity.kind === 'building' && entity.owner === 0) available.add('demolish');
  } else {
    const ownBuildings = entities.filter(
      (entity) => entity.kind === 'building' && entity.owner === 0,
    );
    const hasOwnEngineer = entities.some(
      (entity) => entity.unitType === 'engineer' && entity.owner === 0,
    );
    if (ownBuildings.length === 1 && hasOwnEngineer) available.add('recycle');
  }
  return COMMAND_ORDER.filter((command) => available.has(command));
}

function sameScenario(left: ScenarioSnapshot | null, right: ScenarioSnapshot | null): boolean {
  if (!left || !right) return left === right;
  if (left.phase !== right.phase || left.objective !== right.objective) return false;
  if ('recoveryAt' in left && 'recoveryAt' in right) {
    return (
      left.progress === right.progress &&
      left.recoveryAt.x === right.recoveryAt.x &&
      left.recoveryAt.y === right.recoveryAt.y &&
      left.operationalAtTick === right.operationalAtTick
    );
  }
  return 'recoveryAt' in left === 'recoveryAt' in right;
}

function sameProduction(
  left: SelectedProduction | null,
  right: SelectedProduction | null,
): boolean {
  if (!left || !right) return left === right;
  return (
    left.building === right.building &&
    left.buildingType === right.buildingType &&
    left.progressTicks === right.progressTicks &&
    left.currentBuildTicks === right.currentBuildTicks &&
    left.queue.join() === right.queue.join() &&
    left.produces.join() === right.produces.join()
  );
}

export const useGameStore = create<GameUiState>((set) => ({
  fps: 0,
  playing: false,
  entityCount: 0,
  selectedCount: 0,
  forceSummary: { total: 0, selected: 0, units: [] },
  controlGroups: [],
  selectedEntity: null,
  credits: 5000,
  power: { produced: 0, consumed: 0 },
  selectedProduction: null,
  placingBuilding: null,
  match: null,
  matchMetrics: null,
  battleReport: null,
  scenario: null,
  aiActivationSeconds: 0,
  tutorialStep: 'select',
  completedTutorial: [],
  setFps: (fps) =>
    set((state) => {
      const rounded = Math.round(fps);
      return state.fps === rounded ? state : { fps: rounded };
    }),
  setPlaying: (playing) => set({ playing }),
  setEntityCount: (entityCount) =>
    set((state) => (state.entityCount === entityCount ? state : { entityCount })),
  setSelectedCount: (selectedCount) =>
    set((state) => (state.selectedCount === selectedCount ? state : { selectedCount })),
  setForceSummary: (forceSummary) =>
    set((state) => (sameForceSummary(state.forceSummary, forceSummary) ? state : { forceSummary })),
  setControlGroups: (controlGroups) =>
    set((state) =>
      sameControlGroups(state.controlGroups, controlGroups) ? state : { controlGroups },
    ),
  setEconomy: (credits, produced, consumed) =>
    set((state) =>
      state.credits === credits &&
      state.power.produced === produced &&
      state.power.consumed === consumed
        ? state
        : { credits, power: { produced, consumed } },
    ),
  setSelectedProduction: (selectedProduction) =>
    set((state) =>
      sameProduction(state.selectedProduction, selectedProduction) ? state : { selectedProduction },
    ),
  setPlacingBuilding: (placingBuilding) =>
    set((state) => (state.placingBuilding === placingBuilding ? state : { placingBuilding })),
  setSelectedEntity: (selectedEntity) =>
    set((state) =>
      sameSelectedEntity(state.selectedEntity, selectedEntity) ? state : { selectedEntity },
    ),
  setMatch: (match) =>
    set((state) =>
      state.match?.status === match?.status && state.match?.winner === match?.winner
        ? state
        : { match },
    ),
  setMatchMetrics: (matchMetrics) => set({ matchMetrics }),
  setBattleReport: (battleReport) => set({ battleReport }),
  setScenario: (scenario) =>
    set((state) => (sameScenario(state.scenario, scenario) ? state : { scenario })),
  setAiActivationSeconds: (aiActivationSeconds) =>
    set((state) =>
      state.aiActivationSeconds === aiActivationSeconds ? state : { aiActivationSeconds },
    ),
  advanceTutorial: (milestone) =>
    set((state) => {
      const progress = tutorialProgress(state.completedTutorial, milestone);
      return {
        tutorialStep: progress.step,
        completedTutorial: progress.completed,
      };
    }),
  resetTutorial: () => set({ tutorialStep: 'select', completedTutorial: [] }),
}));
