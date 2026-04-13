import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';

const DEMO_LAKES = [
  // === TEXAS ===
  { id: 'lake-texoma', name: 'Lake Texoma', state: 'TX/OK', center: { latitude: 33.82, longitude: -96.57 }, area_acres: 89000 },
  { id: 'lake-fork', name: 'Lake Fork', state: 'TX', center: { latitude: 32.77, longitude: -95.56 }, area_acres: 27690 },
  { id: 'sam-rayburn', name: 'Sam Rayburn Reservoir', state: 'TX', center: { latitude: 31.10, longitude: -94.20 }, area_acres: 114500 },
  { id: 'toledo-bend', name: 'Toledo Bend', state: 'TX/LA', center: { latitude: 31.30, longitude: -93.72 }, area_acres: 185000 },
  { id: 'falcon-lake', name: 'Falcon Lake', state: 'TX', center: { latitude: 26.60, longitude: -99.20 }, area_acres: 83654 },
  { id: 'lake-amistad', name: 'Lake Amistad', state: 'TX', center: { latitude: 29.47, longitude: -101.05 }, area_acres: 64900 },
  { id: 'lake-ray-roberts', name: 'Lake Ray Roberts', state: 'TX', center: { latitude: 33.35, longitude: -97.05 }, area_acres: 29350 },
  { id: 'lake-conroe', name: 'Lake Conroe', state: 'TX', center: { latitude: 30.40, longitude: -95.57 }, area_acres: 20985 },
  { id: 'lake-livingston', name: 'Lake Livingston', state: 'TX', center: { latitude: 30.80, longitude: -95.00 }, area_acres: 83277 },
  { id: 'lake-travis', name: 'Lake Travis', state: 'TX', center: { latitude: 30.43, longitude: -97.90 }, area_acres: 18930 },
  { id: 'lake-buchanan', name: 'Lake Buchanan', state: 'TX', center: { latitude: 30.80, longitude: -98.42 }, area_acres: 22333 },
  { id: 'lake-lbj', name: 'Lake LBJ', state: 'TX', center: { latitude: 30.58, longitude: -98.35 }, area_acres: 6375 },
  { id: 'possum-kingdom', name: 'Possum Kingdom Lake', state: 'TX', center: { latitude: 32.87, longitude: -98.50 }, area_acres: 17700 },
  { id: 'lake-whitney', name: 'Lake Whitney', state: 'TX', center: { latitude: 31.90, longitude: -97.38 }, area_acres: 23560 },
  { id: 'richland-chambers', name: 'Richland-Chambers Reservoir', state: 'TX', center: { latitude: 31.97, longitude: -96.13 }, area_acres: 44752 },
  { id: 'lake-tawakoni', name: 'Lake Tawakoni', state: 'TX', center: { latitude: 32.85, longitude: -95.95 }, area_acres: 36700 },
  { id: 'lake-oivie', name: 'O.H. Ivie Reservoir', state: 'TX', center: { latitude: 31.57, longitude: -99.70 }, area_acres: 19149 },
  { id: 'cedar-creek', name: 'Cedar Creek Reservoir', state: 'TX', center: { latitude: 32.35, longitude: -96.10 }, area_acres: 33750 },
  { id: 'lake-bob-sandlin', name: 'Lake Bob Sandlin', state: 'TX', center: { latitude: 33.05, longitude: -95.00 }, area_acres: 9460 },
  { id: 'choke-canyon', name: 'Choke Canyon Reservoir', state: 'TX', center: { latitude: 28.48, longitude: -98.30 }, area_acres: 25670 },
  { id: 'lake-palestine', name: 'Lake Palestine', state: 'TX', center: { latitude: 32.10, longitude: -95.55 }, area_acres: 25560 },
  { id: 'lake-belton', name: 'Lake Belton', state: 'TX', center: { latitude: 31.10, longitude: -97.48 }, area_acres: 12385 },
  { id: 'lake-somerville', name: 'Lake Somerville', state: 'TX', center: { latitude: 30.33, longitude: -96.55 }, area_acres: 11460 },
  { id: 'lake-alan-henry', name: 'Lake Alan Henry', state: 'TX', center: { latitude: 33.07, longitude: -101.05 }, area_acres: 2880 },
  { id: 'lake-houston', name: 'Lake Houston', state: 'TX', center: { latitude: 30.05, longitude: -95.15 }, area_acres: 12240 },
  { id: 'eagle-mountain', name: 'Eagle Mountain Lake', state: 'TX', center: { latitude: 32.90, longitude: -97.47 }, area_acres: 8738 },
  { id: 'lake-lewisville', name: 'Lake Lewisville', state: 'TX', center: { latitude: 33.10, longitude: -96.97 }, area_acres: 29592 },
  { id: 'lake-lavon', name: 'Lake Lavon', state: 'TX', center: { latitude: 33.05, longitude: -96.48 }, area_acres: 21400 },
  { id: 'joe-pool', name: 'Joe Pool Lake', state: 'TX', center: { latitude: 32.62, longitude: -97.00 }, area_acres: 7470 },
  { id: 'lake-granbury', name: 'Lake Granbury', state: 'TX', center: { latitude: 32.42, longitude: -97.72 }, area_acres: 8310 },
  { id: 'lake-bridgeport', name: 'Lake Bridgeport', state: 'TX', center: { latitude: 33.22, longitude: -97.78 }, area_acres: 11954 },
  { id: 'lake-benbrook', name: 'Lake Benbrook', state: 'TX', center: { latitude: 32.62, longitude: -97.45 }, area_acres: 3770 },
  // === OTHER STATES ===
  { id: 'table-rock', name: 'Table Rock Lake', state: 'MO', center: { latitude: 36.60, longitude: -93.35 }, area_acres: 43100 },
  { id: 'lake-guntersville', name: 'Lake Guntersville', state: 'AL', center: { latitude: 34.39, longitude: -86.22 }, area_acres: 69100 },
  { id: 'lake-erie', name: 'Lake Erie', state: 'OH/PA/NY', center: { latitude: 42.20, longitude: -81.20 }, area_acres: 6400000 },
  { id: 'lake-okeechobee', name: 'Lake Okeechobee', state: 'FL', center: { latitude: 26.95, longitude: -80.80 }, area_acres: 467200 },
  { id: 'kentucky-lake', name: 'Kentucky Lake', state: 'KY/TN', center: { latitude: 36.60, longitude: -88.10 }, area_acres: 160300 },
  { id: 'lake-st-clair', name: 'Lake St. Clair', state: 'MI', center: { latitude: 42.43, longitude: -82.67 }, area_acres: 275000 },
  { id: 'lake-champlain', name: 'Lake Champlain', state: 'VT/NY', center: { latitude: 44.53, longitude: -73.33 }, area_acres: 271000 },
  { id: 'mille-lacs', name: 'Mille Lacs Lake', state: 'MN', center: { latitude: 46.22, longitude: -93.60 }, area_acres: 132500 },
  { id: 'lake-of-the-ozarks', name: 'Lake of the Ozarks', state: 'MO', center: { latitude: 38.12, longitude: -92.68 }, area_acres: 54000 },
  { id: 'dale-hollow', name: 'Dale Hollow Lake', state: 'TN/KY', center: { latitude: 36.55, longitude: -85.45 }, area_acres: 27700 },
  { id: 'pickwick-lake', name: 'Pickwick Lake', state: 'AL/TN/MS', center: { latitude: 34.85, longitude: -88.05 }, area_acres: 43100 },
];

function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * 69;
  const dLng = (lng2 - lng1) * 69 * Math.cos((lat1 * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

export function HomePage() {
  const navigate = useNavigate();
  const { setSelectedLake, setMapCenter, setMapZoom } = useAppStore();
  const [search, setSearch] = useState('');
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'done' | 'denied'>('idle');

  // Get user location on mount
  useEffect(() => {
    if (!navigator.geolocation) return;
    setGeoStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLat(pos.coords.latitude);
        setUserLng(pos.coords.longitude);
        setGeoStatus('done');
      },
      () => setGeoStatus('denied'),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 },
    );
  }, []);

  const sorted = useMemo(() => {
    let list = [...DEMO_LAKES];

    // Filter by search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.state.toLowerCase().includes(q),
      );
    }

    // Sort by distance if we have user location
    if (userLat != null && userLng != null) {
      list.sort((a, b) => {
        const distA = distanceMiles(userLat, userLng, a.center.latitude, a.center.longitude);
        const distB = distanceMiles(userLat, userLng, b.center.latitude, b.center.longitude);
        return distA - distB;
      });
    }

    return list;
  }, [search, userLat, userLng]);

  const getDistanceLabel = (lake: (typeof DEMO_LAKES)[0]): string | null => {
    if (userLat == null || userLng == null) return null;
    const d = distanceMiles(userLat, userLng, lake.center.latitude, lake.center.longitude);
    return d < 1 ? '<1 mi' : `${Math.round(d)} mi`;
  };

  const handleLakeSelect = (lake: (typeof DEMO_LAKES)[0]) => {
    setSelectedLake({
      id: lake.id,
      name: lake.name,
      state: lake.state,
      center: lake.center,
      bounds: {
        ne: { latitude: lake.center.latitude + 0.1, longitude: lake.center.longitude + 0.1 },
        sw: { latitude: lake.center.latitude - 0.1, longitude: lake.center.longitude - 0.1 },
      },
      area_acres: lake.area_acres,
      max_depth_ft: null,
      bathymetrySource: null,
      bathymetryTileUrl: null,
      shorelineGeoJSON: null,
      species: [],
      usgsStationId: null,
    });
    setMapCenter([lake.center.longitude, lake.center.latitude]);
    setMapZoom(12);
    navigate('/map');
  };

  return (
    <div className="page">
      <h1 className="page-header">Strike Intel</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24, fontSize: 14 }}>
        Pattern-based freshwater fishing intelligence. Select a lake to get started.
      </p>

      <div className="lake-search">
        <input
          type="text"
          placeholder="Search lakes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <h3 style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
        {search.trim()
          ? `Results (${sorted.length})`
          : geoStatus === 'done'
            ? 'Near You'
            : geoStatus === 'loading'
              ? 'Finding nearby lakes...'
              : 'All Lakes'}
      </h3>

      {sorted.length === 0 && (
        <div style={{ color: 'var(--color-text-secondary)', padding: 20, textAlign: 'center' }}>
          No lakes found matching "{search}"
        </div>
      )}

      {sorted.map((lake) => {
        const dist = getDistanceLabel(lake);
        return (
          <button
            key={lake.id}
            onClick={() => handleLakeSelect(lake)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '14px 16px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)',
              color: 'var(--color-text)',
              marginBottom: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{lake.name}</div>
              {dist && (
                <span style={{ fontSize: 12, color: 'var(--color-primary)', flexShrink: 0 }}>
                  {dist}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              {lake.state} - {lake.area_acres.toLocaleString()} acres
            </div>
          </button>
        );
      })}
    </div>
  );
}
