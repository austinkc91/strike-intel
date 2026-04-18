import { useCallback, useEffect, useRef, useState } from 'react';
import { Map, NavigationControl, GeolocateControl, Source, Layer } from '@vis.gl/react-maplibre';
import type { MapRef, MapLayerMouseEvent } from '@vis.gl/react-maplibre';
import { useAppStore } from '../../store';
import { CatchPinLayer } from './CatchPinLayer';
import { CaughtNowButton } from '../catch/CaughtNowButton';
import { WindRose } from './WindRose';
import { PatternMatchLayer } from './PatternMatchLayer';
import type { Catch, CatchWeather } from '../../types';
import type { MatchResult } from '../../services/patternEngine';
import { TILE_SERVER } from '../../services/tileServer';

// USGS Topo for land base map
const USGS_TOPO_TILES = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}';
const USGS_IMAGERY_TILES = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}';

const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    'usgs-topo': {
      type: 'raster',
      tiles: [USGS_TOPO_TILES],
      tileSize: 256,
      attribution: 'USGS',
      maxzoom: 16,
    },
  },
  layers: [
    {
      id: 'usgs-topo-layer',
      type: 'raster',
      source: 'usgs-topo',
      paint: {},
    },
  ],
};

interface MapContainerProps {
  catches: Catch[];
  lakeId?: string;
  onMapClick: (lng: number, lat: number) => void;
  onCaughtNow: () => void;
  onCatchClick: (c: Catch) => void;
  caughtNowLoading: boolean;
  currentWeather?: CatchWeather | null;
  patternResults?: MatchResult[];
}

export function MapContainer({
  catches,
  lakeId,
  onMapClick,
  onCaughtNow,
  onCatchClick,
  caughtNowLoading,
  currentWeather,
  patternResults = [],
}: MapContainerProps) {
  const mapRef = useRef<MapRef>(null);
  const { mapCenter, mapZoom, pendingPin } = useAppStore();
  const [showSatellite, setShowSatellite] = useState(false);
  const [boundary, setBoundary] = useState<GeoJSON.FeatureCollection | null>(null);

  const [mapLoaded, setMapLoaded] = useState(false);

  const handleMapLoad = useCallback(() => {
    setMapLoaded(true);
    const m = mapRef.current?.getMap();
    if (m) {
      m.on('error', (e: { error?: Error; sourceId?: string; tile?: { tileID?: { canonical?: { z: number; x: number; y: number } } } }) => {
        const t = e.tile?.tileID?.canonical;
        const tileStr = t ? `z${t.z}/${t.x}/${t.y}` : '';
        console.warn('[maplibre]', e.sourceId || '', tileStr, e.error?.message || e.error || e);
      });
    }
  }, []);

  // Fly to pendingPin when it changes (covers map-click + EXIF-extracted location)
  useEffect(() => {
    if (!mapLoaded || !pendingPin) return;
    const m = mapRef.current?.getMap();
    if (!m) return;
    const center = m.getCenter();
    const dx = Math.abs(center.lng - pendingPin.longitude);
    const dy = Math.abs(center.lat - pendingPin.latitude);
    // Only pan if the pin is appreciably away from current center (avoid jitter on click-placed pins)
    if (dx < 0.001 && dy < 0.001) return;
    m.flyTo({
      center: [pendingPin.longitude, pendingPin.latitude],
      zoom: Math.max(m.getZoom(), 15),
      duration: 800,
      essential: true,
    });
  }, [pendingPin?.latitude, pendingPin?.longitude, mapLoaded]);

  // Add/update contour tile source imperatively when lakeId changes and map is loaded
  useEffect(() => {
    if (!mapLoaded || !lakeId) return;
    const m = mapRef.current?.getMap();
    if (!m) return;

    // Remove old source/layers if they exist
    for (const layerId of ['twdb-contour-labels', 'twdb-contour-lines-bold', 'twdb-contour-lines']) {
      if (m.getLayer(layerId)) m.removeLayer(layerId);
    }
    if (m.getSource('twdb-contours')) m.removeSource('twdb-contours');

    // Add vector tile source
    m.addSource('twdb-contours', {
      type: 'vector',
      tiles: [`${TILE_SERVER}/tiles/${lakeId}/{z}/{x}/{y}.pbf`],
      minzoom: 8,
      maxzoom: 16,
    });

    // Insert contours above the water fill but below the boundary outline
    const beforeLayer = m.getLayer('lake-boundary-line') ? 'lake-boundary-line' : undefined;

    m.addLayer({
      id: 'twdb-contour-lines',
      type: 'line',
      source: 'twdb-contours',
      'source-layer': 'contours',
      filter: ['==', ['get', 'level'], 0],
      minzoom: 13,
      paint: {
        'line-color': '#0288d1',
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.25, 15, 0.45],
        'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.4, 15, 0.8, 16, 1],
      },
    }, beforeLayer);

    m.addLayer({
      id: 'twdb-contour-lines-bold',
      type: 'line',
      source: 'twdb-contours',
      'source-layer': 'contours',
      filter: ['==', ['get', 'level'], 1],
      paint: {
        'line-color': '#01579b',
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 13, 0.85],
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 13, 1.8, 16, 2.5],
      },
    }, beforeLayer);

    m.addLayer({
      id: 'twdb-contour-labels',
      type: 'symbol',
      source: 'twdb-contours',
      'source-layer': 'contours',
      filter: ['==', ['get', 'level'], 1],
      paint: { 'text-color': '#ffffff', 'text-halo-color': '#01579b', 'text-halo-width': 2 },
      layout: {
        'symbol-placement': 'line',
        'text-field': ['concat', ['to-string', ['get', 'depth_ft']], ' ft'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 13, 13, 16, 15],
        'text-max-angle': 30,
        'symbol-spacing': 200,
      },
    }, beforeLayer);

    console.log(`[MapContainer] Added contour layers for ${lakeId}`);

    return () => {
      const mp = mapRef.current?.getMap();
      if (!mp) return;
      for (const layerId of ['twdb-contour-labels', 'twdb-contour-lines-bold', 'twdb-contour-lines']) {
        if (mp.getLayer(layerId)) mp.removeLayer(layerId);
      }
      if (mp.getSource('twdb-contours')) mp.removeSource('twdb-contours');
    };
  }, [lakeId, mapLoaded]);


  // Fetch lake boundary when lakeId changes
  useEffect(() => {
    if (!lakeId) {
      setBoundary(null);
      return;
    }
    console.log(`[MapContainer] Fetching boundary from: ${TILE_SERVER}/boundary?lake=${lakeId}`);
    fetch(`${TILE_SERVER}/boundary?lake=${lakeId}`)
      .then(r => {
        console.log(`[MapContainer] Boundary response: ${r.status}`);
        return r.ok ? r.json() : null;
      })
      .then(data => {
        if (data) {
          console.log(`[MapContainer] Boundary loaded: ${data.features?.length} features`);
          setBoundary(data);
        }
      })
      .catch((err) => {
        console.error(`[MapContainer] Boundary fetch failed:`, err);
        setBoundary(null);
      });
  }, [lakeId]);

  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      onMapClick(e.lngLat.lng, e.lngLat.lat);
    },
    [onMapClick],
  );


  return (
    <div className="map-container">
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: mapCenter[0],
          latitude: mapCenter[1],
          zoom: mapZoom,
        }}
        mapStyle={MAP_STYLE}
        onClick={handleClick}
        onLoad={handleMapLoad}
        attributionControl={false}
      >
        <NavigationControl position="top-right" />
        <GeolocateControl
          position="top-right"
          trackUserLocation
          showAccuracyCircle={false}
        />

        {/* Optional satellite imagery underlay */}
        {showSatellite && (
          <Source
            id="satellite"
            type="raster"
            tiles={[USGS_IMAGERY_TILES]}
            tileSize={256}
            maxzoom={16}
          >
            <Layer
              id="satellite-layer"
              type="raster"
              paint={{ 'raster-opacity': 0.6 }}
            />
          </Source>
        )}

        {/* Lake boundary: water fill covers USGS topo's built-in contours */}
        {boundary && (
          <Source id="lake-boundary" type="geojson" data={boundary}>
            <Layer
              id="lake-water-fill"
              type="fill"
              paint={{
                'fill-color': '#d4eaf7',
                'fill-opacity': 1,
              }}
            />
          </Source>
        )}



        {/* Lake boundary outline */}
        {boundary && (
          <Source id="lake-boundary-outline" type="geojson" data={boundary}>
            <Layer
              id="lake-boundary-line"
              type="line"
              paint={{
                'line-color': '#0d47a1',
                'line-width': 1.5,
                'line-opacity': 0.6,
              }}
            />
          </Source>
        )}

        <CatchPinLayer catches={catches} onCatchClick={onCatchClick} />

        {patternResults.length > 0 && (
          <PatternMatchLayer results={patternResults} />
        )}
      </Map>

      {/* Map type toggle */}
      <button
        className="floating-panel"
        onClick={() => setShowSatellite(!showSatellite)}
        style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          right: 60,
          padding: '8px 12px',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.02em',
          color: 'var(--color-text)',
          zIndex: 10,
          cursor: 'pointer',
        }}
      >
        {showSatellite ? 'Topo' : 'Satellite'}
      </button>

      {currentWeather && (
        <WindRose
          direction_deg={currentWeather.wind_direction_deg}
          speed_mph={currentWeather.wind_speed_mph}
          gusts_mph={currentWeather.wind_gusts_mph}
        />
      )}

      <CaughtNowButton onClick={onCaughtNow} loading={caughtNowLoading} />
    </div>
  );
}
