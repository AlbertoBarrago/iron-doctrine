/** Zustand store for PRESENTATION state only. Never holds authoritative sim state. */
import { create } from 'zustand';

interface GameUiState {
  fps: number;
  playing: boolean;
  entityCount: number;
  selectedCount: number;
  credits: number;
  power: { produced: number; consumed: number };
  setFps: (fps: number) => void;
  setPlaying: (playing: boolean) => void;
  setEntityCount: (n: number) => void;
  setSelectedCount: (n: number) => void;
  setEconomy: (credits: number, produced: number, consumed: number) => void;
}

export const useGameStore = create<GameUiState>((set) => ({
  fps: 0,
  playing: false,
  entityCount: 0,
  selectedCount: 0,
  credits: 5000,
  power: { produced: 0, consumed: 0 },
  setFps: (fps) => set({ fps: Math.round(fps) }),
  setPlaying: (playing) => set({ playing }),
  setEntityCount: (entityCount) => set({ entityCount }),
  setSelectedCount: (selectedCount) => set({ selectedCount }),
  setEconomy: (credits, produced, consumed) =>
    set({ credits, power: { produced, consumed } }),
}));
