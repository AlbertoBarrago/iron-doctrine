/** Zustand store for PRESENTATION state only. Never holds authoritative sim state. */
import { create } from 'zustand';
import {
  UNIT_STATS,
  type EntitySnapshot,
  type FirstContactSnapshot,
  type MatchStateSnapshot,
} from '@iron/engine';

export type TutorialStep =
  'select' | 'move' | 'gather' | 'build' | 'produce' | 'attack' | 'complete';
export type SelectionCommand =
  'move' | 'attack' | 'stop' | 'gather' | 'build' | 'produce' | 'rally';

export interface SelectedEntitySummary {
  label: string;
  kind: 'unit' | 'building' | 'group';
  count: number;
  hp?: number;
  maxHp?: number;
  status?: string;
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

export type CommandTab = 'orders' | 'build' | 'production';

export function preferredCommandTab(
  selected: SelectedEntitySummary | null,
  production: SelectedProduction | null,
): CommandTab {
  if (production) return 'production';
  if (selected?.commands.includes('build')) return 'build';
  return 'orders';
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
  selectedEntity: SelectedEntitySummary | null;
  credits: number;
  power: { produced: number; consumed: number };
  selectedProduction: SelectedProduction | null;
  placingBuilding: string | null;
  match: MatchStateSnapshot | null;
  scenario: FirstContactSnapshot | null;
  aiActivationSeconds: number;
  tutorialStep: TutorialStep;
  setFps: (fps: number) => void;
  setPlaying: (playing: boolean) => void;
  setEntityCount: (n: number) => void;
  setSelectedCount: (n: number) => void;
  setSelectedEntity: (entity: SelectedEntitySummary | null) => void;
  setEconomy: (credits: number, produced: number, consumed: number) => void;
  setSelectedProduction: (production: SelectedProduction | null) => void;
  setPlacingBuilding: (building: string | null) => void;
  setMatch: (match: MatchStateSnapshot | null) => void;
  setScenario: (scenario: FirstContactSnapshot | null) => void;
  setAiActivationSeconds: (seconds: number) => void;
  advanceTutorial: (expected: TutorialStep) => void;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  'select',
  'move',
  'gather',
  'build',
  'produce',
  'attack',
  'complete',
];

export function nextTutorialStep(current: TutorialStep, expected: TutorialStep): TutorialStep {
  if (current !== expected) return current;
  return TUTORIAL_STEPS[TUTORIAL_STEPS.indexOf(current) + 1] ?? 'complete';
}

function sameSelectedEntity(
  left: SelectedEntitySummary | null,
  right: SelectedEntitySummary | null,
): boolean {
  if (!left || !right) return left === right;
  return (
    left.label === right.label &&
    left.kind === right.kind &&
    left.count === right.count &&
    left.hp === right.hp &&
    left.maxHp === right.maxHp &&
    left.status === right.status &&
    left.commands.join() === right.commands.join()
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
  }
  return COMMAND_ORDER.filter((command) => available.has(command));
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
  selectedEntity: null,
  credits: 5000,
  power: { produced: 0, consumed: 0 },
  selectedProduction: null,
  placingBuilding: null,
  match: null,
  scenario: null,
  aiActivationSeconds: 0,
  tutorialStep: 'select',
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
  setScenario: (scenario) =>
    set((state) =>
      state.scenario?.phase === scenario?.phase &&
      state.scenario?.objective === scenario?.objective &&
      state.scenario?.progress === scenario?.progress &&
      state.scenario?.recoveryAt.x === scenario?.recoveryAt.x &&
      state.scenario?.recoveryAt.y === scenario?.recoveryAt.y &&
      state.scenario?.operationalAtTick === scenario?.operationalAtTick
        ? state
        : { scenario },
    ),
  setAiActivationSeconds: (aiActivationSeconds) =>
    set((state) =>
      state.aiActivationSeconds === aiActivationSeconds ? state : { aiActivationSeconds },
    ),
  advanceTutorial: (expected) =>
    set((state) => {
      const tutorialStep = nextTutorialStep(state.tutorialStep, expected);
      return tutorialStep === state.tutorialStep ? state : { tutorialStep };
    }),
}));
