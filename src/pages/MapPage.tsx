import { useCallback, useState, useEffect } from 'react';
import { MapContainer } from '../components/map/MapContainer';
import { LogCatchForm } from '../components/catch/LogCatchForm';
import { CatchDetailSheet } from '../components/catch/CatchDetailSheet';
import { PatternPanel } from '../components/pattern/PatternPanel';
import { TripPlanPanel } from '../components/trip/TripPlanPanel';
import { useAppStore } from '../store';
import { useCatches } from '../hooks/useCatches';
import { useGeolocation } from '../hooks/useGeolocation';
import { fetchWeatherForCatch } from '../services/weather';
import { getMoonPhase } from '../services/moonPhase';
import { getSolunarWindows, isInFeedingWindow } from '../services/solunar';
import { type GridCell, type MatchResult } from '../services/patternEngine';
import { fetchLakeGrid } from '../services/lakeGrid';
import { fetchSpotCharacteristics } from '../services/spotCharacteristics';
import { fetchWaterTempNearAt } from '../services/waterTemp';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import type { Catch, CatchFormData, GeoPoint, CatchWeather } from '../types';

export function MapPage() {
  const { selectedLake, setPendingPin, activeCatch, setActiveCatch, pendingPatternCatchId, setPendingPatternCatchId, pendingEditCatchId, setPendingEditCatchId } = useAppStore();
  const { catches, addCatch, removeCatch } = useCatches(selectedLake?.id || null);
  const { getCurrentPosition, position, loading: geoLoading } = useGeolocation();
  const [showForm, setShowForm] = useState(false);
  const [formLocation, setFormLocation] = useState<GeoPoint | null>(null);
  const [formTimestamp, setFormTimestamp] = useState<Date | null>(null);
  const [currentWeather, setCurrentWeather] = useState<CatchWeather | null>(null);
  const [showPattern, setShowPattern] = useState(false);
  const [patternCatch, setPatternCatch] = useState<Catch | null>(null);
  const [patternResults, setPatternResults] = useState<MatchResult[]>([]);
  const [showTripPlan, setShowTripPlan] = useState(false);
  const [editingCatchId, setEditingCatchId] = useState<string | null>(null);

  // Fetch real depth grid for the selected lake
  const [lakeGrid, setLakeGrid] = useState<GridCell[]>([]);
  const [_gridLoading, setGridLoading] = useState(false);

  useEffect(() => {
    if (!selectedLake) {
      setLakeGrid([]);
      return;
    }
    setGridLoading(true);
    fetchLakeGrid(selectedLake.id)
      .then(grid => {
        setLakeGrid(grid);
        console.log(`[MapPage] Loaded ${grid.length} grid cells for ${selectedLake.id}`);
      })
      .catch(err => {
        console.error('[MapPage] Failed to load lake grid:', err);
        setLakeGrid([]);
      })
      .finally(() => setGridLoading(false));
  }, [selectedLake?.id]);

  // Fetch current weather for the selected lake
  useEffect(() => {
    if (!selectedLake) return;
    const { latitude, longitude } = selectedLake.center;
    fetchWeatherForCatch(latitude, longitude, new Date())
      .then((w) => {
        const moon = getMoonPhase(new Date());
        setCurrentWeather({ ...w, moon_phase: moon.phase, water_temp_f: null });
      })
      .catch(console.error);
  }, [selectedLake?.id]);

  const handleMapClick = useCallback(
    (lng: number, lat: number) => {
      if (activeCatch) { setActiveCatch(null); return; }
      if (showPattern) return; // Don't place pins during pattern view
      const pin: GeoPoint = { latitude: lat, longitude: lng };
      setPendingPin(pin);
      setFormLocation(pin);
      setFormTimestamp(new Date());
      setShowForm(true);
    },
    [setPendingPin, activeCatch, setActiveCatch, showPattern],
  );

  const handleCaughtNow = useCallback(() => {
    getCurrentPosition();
  }, [getCurrentPosition]);

  useEffect(() => {
    if (position && !showForm && !geoLoading) {
      setPendingPin(position);
      setFormLocation(position);
      setFormTimestamp(new Date());
      setShowForm(true);
    }
  }, [position, geoLoading]);

  // Auto-open the pattern panel when navigated here with a pending catch
  // (set by "Find Similar" on the Catches page).
  useEffect(() => {
    if (!pendingPatternCatchId) return;
    const target = catches.find(c => c.id === pendingPatternCatchId);
    if (target) {
      setPatternCatch(target);
      setShowPattern(true);
      setPendingPatternCatchId(null);
    }
  }, [pendingPatternCatchId, catches]);

  // Auto-open the edit form when navigated here from "Edit Catch" on the
  // Catches page. Mirrors the pattern flow above.
  useEffect(() => {
    if (!pendingEditCatchId) return;
    const target = catches.find(c => c.id === pendingEditCatchId);
    if (target) {
      setActiveCatch(null);
      setFormLocation(target.location);
      setFormTimestamp(target.timestamp?.toDate?.() || new Date());
      setEditingCatchId(target.id);
      setShowForm(true);
      setPendingEditCatchId(null);
    }
  }, [pendingEditCatchId, catches]);

  const handleSubmit = async (data: CatchFormData) => {
    if (editingCatchId && selectedLake) {
      // Update existing catch
      const catchRef = doc(db, 'lakes', selectedLake.id, 'catches', editingCatchId);
      await updateDoc(catchRef, {
        species: data.species || null,
        weight_lbs: data.weight_lbs ? parseFloat(data.weight_lbs) : null,
        length_in: data.length_in ? parseFloat(data.length_in) : null,
        lure: data.lure || null,
        notes: data.notes || null,
      });
      // Re-enrich on edit so old catches with stale "now" weather get
      // refreshed against the historical endpoints.
      enrichCatch(selectedLake.id, editingCatchId, data.location, data.timestamp);
    } else {
      const newId = await addCatch(data);
      if (selectedLake && newId) {
        enrichCatch(selectedLake.id, newId, data.location, data.timestamp);
      }
    }
    setPendingPin(null);
    setShowForm(false);
    setFormLocation(null);
    setFormTimestamp(null);
    setEditingCatchId(null);
  };

  const handleCancel = () => {
    setPendingPin(null);
    setShowForm(false);
    setFormLocation(null);
    setFormTimestamp(null);
    setEditingCatchId(null);
  };

  const handleCatchClick = (c: Catch) => {
    if (!showPattern) setActiveCatch(c);
  };

  const handleEditCatch = (c: Catch) => {
    // Open the form pre-filled with this catch's data for editing
    setActiveCatch(null);
    setFormLocation(c.location);
    setFormTimestamp(c.timestamp?.toDate?.() || new Date());
    setEditingCatchId(c.id);
    setShowForm(true);
  };

  const handleDeleteCatch = async (c: Catch) => {
    await removeCatch(c.id);
    setActiveCatch(null);
  };

  const handleFindSimilar = (c: Catch) => {
    setPatternCatch(c);
    setActiveCatch(null);
    setShowPattern(true);
  };

  const handlePatternClose = () => {
    setShowPattern(false);
    setPatternCatch(null);
    setPatternResults([]);
  };

  const handleSpotClick = (result: MatchResult) => {
    const { setMapCenter, setMapZoom } = useAppStore.getState();
    setMapCenter([result.lng, result.lat]);
    setMapZoom(15);
  };

  return (
    <>
      <MapContainer
        catches={catches}
        lakeId={selectedLake?.id}
        onMapClick={handleMapClick}
        onCaughtNow={handleCaughtNow}
        onCatchClick={handleCatchClick}
        caughtNowLoading={geoLoading}
        currentWeather={currentWeather}
        patternResults={showPattern ? patternResults.slice(0, 200) : []}
      />

      {showForm && (
        <LogCatchForm
          initialLocation={formLocation}
          initialTimestamp={formTimestamp}
          editCatch={editingCatchId ? catches.find(c => c.id === editingCatchId) : null}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          onLocationChange={(loc) => setPendingPin(loc)}
        />
      )}

      {activeCatch && !showForm && !showPattern && (
        <CatchDetailSheet
          catchData={activeCatch}
          onClose={() => setActiveCatch(null)}
          onFindSimilar={handleFindSimilar}
          onEdit={handleEditCatch}
          onDelete={handleDeleteCatch}
        />
      )}

      {showPattern && patternCatch && (
        <PatternPanel
          catchData={patternCatch}
          grid={lakeGrid}
          currentWeather={currentWeather}
          onResultsChange={setPatternResults}
          onSpotClick={handleSpotClick}
          onClose={handlePatternClose}
        />
      )}

      {showTripPlan && selectedLake && (
        <TripPlanPanel
          lakeCenter={selectedLake.center}
          catches={catches}
          grid={lakeGrid}
          onResultsChange={setPatternResults}
          onSpotClick={handleSpotClick}
          onClose={() => { setShowTripPlan(false); setPatternResults([]); }}
        />
      )}

      {/* Plan Trip button */}
      {selectedLake && !showForm && !activeCatch && !showPattern && !showTripPlan && (
        <button
          className="floating-panel"
          onClick={() => setShowTripPlan(true)}
          style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            padding: '10px 14px',
            color: 'var(--color-text)',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '-0.005em',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Plan Trip
        </button>
      )}
    </>
  );
}

async function enrichCatch(
  lakeId: string,
  catchId: string,
  location: GeoPoint,
  timestamp: Date,
) {
  try {
    const catchRef = doc(db, 'lakes', lakeId, 'catches', catchId);

    // Fetch weather, spot characteristics, and water temp in parallel.
    // All three honor the catch's timestamp so a backdated log gets the
    // historical conditions, not "now."
    const [weather, characteristics, waterTemp] = await Promise.all([
      fetchWeatherForCatch(location.latitude, location.longitude, timestamp).catch((e) => {
        console.warn('[enrichCatch] weather fetch failed:', e);
        return null;
      }),
      fetchSpotCharacteristics(lakeId, location).catch((e) => {
        console.warn('[enrichCatch] spot characteristics fetch failed:', e);
        return null;
      }),
      fetchWaterTempNearAt(location.latitude, location.longitude, timestamp).catch((e) => {
        console.warn('[enrichCatch] water temp fetch failed:', e);
        return null;
      }),
    ]);

    const moon = getMoonPhase(timestamp);
    const solunar = getSolunarWindows(timestamp, location.latitude, location.longitude);
    const feedingStatus = isInFeedingWindow(timestamp, solunar.windows);

    const updates: Record<string, unknown> = {
      solunar: { period: feedingStatus.period, minutesToWindow: feedingStatus.minutesToWindow },
    };

    if (weather) {
      updates.weather = {
        ...weather,
        moon_phase: moon.phase,
        water_temp_f: waterTemp?.temp_f ?? null,
      };
    }
    if (characteristics) {
      updates.characteristics = characteristics;
    }

    console.log('[enrichCatch]', catchId, {
      hasWeather: !!weather,
      hasCharacteristics: !!characteristics,
      waterTempF: waterTemp?.temp_f ?? null,
      depth: characteristics?.depth_ft,
      structure: characteristics?.nearestStructureType,
    });

    await updateDoc(catchRef, updates);
  } catch (err) {
    console.error('[enrichCatch] failed:', err);
  }
}
