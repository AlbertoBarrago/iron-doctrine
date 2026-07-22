/** Zustand store for PRESENTATION state only. Never holds authoritative sim state. */
import { create } from 'zustand';
import type { MatchStateSnapshot } from '@iron/engine';

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
  credits: number;
  power: { produced: number; consumed: number };
  selectedProduction: SelectedProduction | null;
  placingBuilding: string | null;
  match: MatchStateSnapshot | null;
  setFps: (fps: number) => void;
  setPlaying: (playing: boolean) => void;
  setEntityCount: (n: number) => void;
  setSelectedCount: (n: number) => void;
  setEconomy: (credits: number, produced: number, consumed: number) => void;
  setSelectedProduction: (production: SelectedProduction | null) => void;
  setPlacingBuilding: (building: string | null) => void;
  setMatch: (match: MatchStateSnapshot | null) => void;
}

export const useGameStore = create<GameUiState>((set) => ({
  fps: 0,
  playing: false,
  entityCount: 0,
  selectedCount: 0,
  credits: 5000,
  power: { produced: 0, consumed: 0 },
  selectedProduction: null,
  placingBuilding: null,
  match: null,
  setFps: (fps) => set({ fps: Math.round(fps) }),
  setPlaying: (playing) => set({ playing }),
  setEntityCount: (entityCount) => set({ entityCount }),
  setSelectedCount: (selectedCount) => set({ selectedCount }),
  setEconomy: (credits, produced, consumed) => set({ credits, power: { produced, consumed } }),
  setSelectedProduction: (selectedProduction) => set({ selectedProduction }),
  setPlacingBuilding: (placingBuilding) => set({ placingBuilding }),
  setMatch: (match) => set({ match }),
}));
