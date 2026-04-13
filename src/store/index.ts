import { create } from 'zustand';
import type { Lake, Catch, GeoPoint } from '../types';

interface AppState {
  selectedLake: Lake | null;
  setSelectedLake: (lake: Lake | null) => void;

  activeCatch: Catch | null;
  setActiveCatch: (c: Catch | null) => void;

  pendingPin: GeoPoint | null;
  setPendingPin: (pin: GeoPoint | null) => void;

  isLogging: boolean;
  setIsLogging: (v: boolean) => void;

  mapCenter: [number, number];
  setMapCenter: (center: [number, number]) => void;

  mapZoom: number;
  setMapZoom: (zoom: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedLake: null,
  setSelectedLake: (lake) => set({ selectedLake: lake }),

  activeCatch: null,
  setActiveCatch: (c) => set({ activeCatch: c }),

  pendingPin: null,
  setPendingPin: (pin) => set({ pendingPin: pin }),

  isLogging: false,
  setIsLogging: (v) => set({ isLogging: v }),

  mapCenter: [-98.5, 39.8], // center of US
  setMapCenter: (center) => set({ mapCenter: center }),

  mapZoom: 4,
  setMapZoom: (zoom) => set({ mapZoom: zoom }),
}));
