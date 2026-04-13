import { useCallback, useState, useEffect, useMemo } from 'react';
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
import { generateDemoGrid, type GridCell, type MatchResult } from '../services/patternEngine';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import type { Catch, CatchFormData, GeoPoint, CatchWeather } from '../types';

export function MapPage() {
  const { selectedLake, setPendingPin, activeCatch, setActiveCatch } = useAppStore();
  const { catches, addCatch } = useCatches(selectedLake?.id || null);
  const { getCurrentPosition, position, loading: geoLoading } = useGeolocation();
  const [showForm, setShowForm] = useState(false);
  const [formLocation, setFormLocation] = useState<GeoPoint | null>(null);
  const [formTimestamp, setFormTimestamp] = useState<Date | null>(null);
  const [currentWeather, setCurrentWeather] = useState<CatchWeather | null>(null);
  const [showPattern, setShowPattern] = useState(false);
  const [patternCatch, setPatternCatch] = useState<Catch | null>(null);
  const [patternResults, setPatternResults] = useState<MatchResult[]>([]);
  const [showTripPlan, setShowTripPlan] = useState(false);

  // Generate demo grid for the selected lake
  const demoGrid: GridCell[] = useMemo(() => {
    if (!selectedLake) return [];
    return generateDemoGrid(
      selectedLake.center.longitude,
      selectedLake.center.latitude,
      0.05,
      0.001,
    );
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

  const handleSubmit = async (data: CatchFormData) => {
    await addCatch(data);
    setPendingPin(null);
    setShowForm(false);
    setFormLocation(null);
    setFormTimestamp(null);
    if (selectedLake) {
      enrichCatchWithWeather(selectedLake.id, data.location, data.timestamp);
    }
  };

  const handleCancel = () => {
    setPendingPin(null);
    setShowForm(false);
    setFormLocation(null);
    setFormTimestamp(null);
  };

  const handleCatchClick = (c: Catch) => {
    if (!showPattern) setActiveCatch(c);
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
        onMapClick={handleMapClick}
        onCaughtNow={handleCaughtNow}
        onCatchClick={handleCatchClick}
        caughtNowLoading={geoLoading}
        currentWeather={currentWeather}
        patternResults={showPattern ? patternResults : []}
      />

      {showForm && (
        <LogCatchForm
          initialLocation={formLocation}
          initialTimestamp={formTimestamp}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      )}

      {activeCatch && !showForm && !showPattern && (
        <CatchDetailSheet
          catchData={activeCatch}
          onClose={() => setActiveCatch(null)}
          onFindSimilar={handleFindSimilar}
        />
      )}

      {showPattern && patternCatch && (
        <PatternPanel
          catchData={patternCatch}
          grid={demoGrid}
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
          grid={demoGrid}
          onResultsChange={setPatternResults}
          onSpotClick={handleSpotClick}
          onClose={() => { setShowTripPlan(false); setPatternResults([]); }}
        />
      )}

      {/* Plan Trip button */}
      {selectedLake && !showForm && !activeCatch && !showPattern && !showTripPlan && (
        <button
          onClick={() => setShowTripPlan(true)}
          style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            padding: '10px 16px',
            background: 'rgba(10, 25, 41, 0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
            color: 'var(--color-primary)',
            fontSize: 13,
            fontWeight: 500,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

async function enrichCatchWithWeather(
  lakeId: string,
  location: GeoPoint,
  timestamp: Date,
) {
  try {
    const { collection: col, query: q, orderBy, limit, getDocs } = await import('firebase/firestore');
    const catchesRef = col(db, 'lakes', lakeId, 'catches');
    const snap = await getDocs(q(catchesRef, orderBy('loggedAt', 'desc'), limit(1)));
    if (snap.empty) return;
    const catchId = snap.docs[0].id;

    const weather = await fetchWeatherForCatch(location.latitude, location.longitude, timestamp);
    const moon = getMoonPhase(timestamp);
    const solunar = getSolunarWindows(timestamp, location.latitude);
    const feedingStatus = isInFeedingWindow(timestamp, solunar.windows);

    const catchRef = doc(db, 'lakes', lakeId, 'catches', catchId);
    await updateDoc(catchRef, {
      weather: { ...weather, moon_phase: moon.phase, water_temp_f: null },
      solunar: { period: feedingStatus.period, minutesToWindow: feedingStatus.minutesToWindow },
    });
  } catch (err) {
    console.error('Weather enrichment failed:', err);
  }
}
