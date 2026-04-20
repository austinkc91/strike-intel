import { create } from 'zustand';
import type { Lake, Catch, GeoPoint } from '../types';
import type { Species } from '../services/fishScoring';
import { LAKE_TEXOMA } from '../data/lakes';

interface AppState {
  selectedLake: Lake | null;
  setSelectedLake: (lake: Lake | null) => void;

  activeCatch: Catch | null;
  setActiveCatch: (c: Catch | null) => void;

  pendingPin: GeoPoint | null;
  setPendingPin: (pin: GeoPoint | null) => void;

  // Catch ID to auto-open in pattern mode when MapPage mounts. Used by
  // navigation from the Catches list ("Find Similar" on a tile).
  pendingPatternCatchId: string | null;
  setPendingPatternCatchId: (id: string | null) => void;

  // Catch ID to auto-open the edit form for when MapPage mounts. Used by
  // "Edit Catch" on the Catches list.
  pendingEditCatchId: string | null;
  setPendingEditCatchId: (id: string | null) => void;

  isLogging: boolean;
  setIsLogging: (v: boolean) => void;

  mapCenter: [number, number];
  setMapCenter: (center: [number, number]) => void;

  mapZoom: number;
  setMapZoom: (zoom: number) => void;

  // The species the user is targeting. Shared across Home and Trip Planner so
  // switching on one screen carries over to the other.
  selectedSpecies: Species;
  setSelectedSpecies: (s: Species) => void;

  // Single-user gate. Hardcoded creds in the bundle — keeps casual passersby
  // out, not a real security boundary. Persisted in localStorage so the
  // user only has to sign in once per device.
  isAuthenticated: boolean;
  setIsAuthenticated: (v: boolean) => void;
}

const AUTH_STORAGE_KEY = 'si_auth_v1';

function readAuth(): boolean {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeAuth(v: boolean): void {
  try {
    if (v) localStorage.setItem(AUTH_STORAGE_KEY, '1');
    else localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    /* sandboxed storage — non-fatal */
  }
}

export const useAppStore = create<AppState>((set) => ({
  // Single-lake build: default the store to Texoma so Map/Catches render
  // immediately without requiring a pick from Home first.
  selectedLake: LAKE_TEXOMA,
  setSelectedLake: (lake) => set({ selectedLake: lake }),

  activeCatch: null,
  setActiveCatch: (c) => set({ activeCatch: c }),

  pendingPin: null,
  setPendingPin: (pin) => set({ pendingPin: pin }),

  pendingPatternCatchId: null,
  setPendingPatternCatchId: (id) => set({ pendingPatternCatchId: id }),

  pendingEditCatchId: null,
  setPendingEditCatchId: (id) => set({ pendingEditCatchId: id }),

  isLogging: false,
  setIsLogging: (v) => set({ isLogging: v }),

  mapCenter: [LAKE_TEXOMA.center.longitude, LAKE_TEXOMA.center.latitude],
  setMapCenter: (center) => set({ mapCenter: center }),

  mapZoom: 12,
  setMapZoom: (zoom) => set({ mapZoom: zoom }),

  selectedSpecies: 'striper',
  setSelectedSpecies: (s) => set({ selectedSpecies: s }),

  isAuthenticated: readAuth(),
  setIsAuthenticated: (v) => { writeAuth(v); set({ isAuthenticated: v }); },
}));
