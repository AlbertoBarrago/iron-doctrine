/** Zustand store for PRESENTATION state only. Never holds authoritative sim state. */
import { create } from 'zustand';
import type { MatchStateSnapshot } from '@iron/engine';

export type TutorialStep = 'select' | 'move' | 'build' | 'produce' | 'attack' | 'complete';

export interface SelectedEntitySummary {
  label: string;
  kind: 'unit' | 'building' | 'group';
  count: number;
  hp?: number;
  maxHp?: number;
  status?: string;
}

export interface SelectedProduction {
  building: number;
  buildingType: string;
  queue: string[];
  progressTicks: number;
  currentBuildTicks: number;
  produces: string[];
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
  advanceTutorial: (expected: TutorialStep) => void;
}

const TUTORIAL_STEPS: TutorialStep[] = ['select', 'move', 'build', 'produce', 'attack', 'complete'];

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
    left.status === right.status
  );
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
  advanceTutorial: (expected) =>
    set((state) => {
      const tutorialStep = nextTutorialStep(state.tutorialStep, expected);
      return tutorialStep === state.tutorialStep ? state : { tutorialStep };
    }),
}));
