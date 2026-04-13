import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Map, NavigationControl, GeolocateControl, Source, Layer } from '@vis.gl/react-maplibre';
import type { MapRef, MapLayerMouseEvent } from '@vis.gl/react-maplibre';
import { useAppStore } from '../../store';
import { CatchPinLayer } from './CatchPinLayer';
import { CaughtNowButton } from '../catch/CaughtNowButton';
import { WindRose } from './WindRose';
import { PatternMatchLayer } from './PatternMatchLayer';
import type { Catch, CatchWeather } from '../../types';
import type { MatchResult } from '../../services/patternEngine';

// USGS Topo for land base map
const USGS_TOPO_TILES = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}';
const USGS_IMAGERY_TILES = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}';

const TILE_SERVER = import.meta.env.VITE_TILE_SERVER || 'http://localhost:3001';

function buildMapStyle(): maplibregl.StyleSpecification {
  return {
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
}

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
  const { mapCenter, mapZoom } = useAppStore();
  const [showSatellite, setShowSatellite] = useState(false);
  const [boundary, setBoundary] = useState<GeoJSON.FeatureCollection | null>(null);

  const mapStyle = useMemo(() => buildMapStyle(), []);

  // Build an inverted mask: world polygon with lake boundary cut out.
  // Placed above contour layers to clip any lines bleeding past the boundary.
  const invertedMask = useMemo(() => {
    if (!boundary?.features?.[0]) return null;
    const feat = boundary.features[0];
    const coords = feat.geometry.type === 'Polygon'
      ? feat.geometry.coordinates
      : feat.geometry.type === 'MultiPolygon'
        ? feat.geometry.coordinates[0]
        : null;
    if (!coords) return null;

    // World-extent outer ring, lake boundary as hole (wound opposite direction)
    const worldRing: [number, number][] = [
      [-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85],
    ];
    return {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'Polygon' as const,
          coordinates: [worldRing, ...coords],
        },
      }],
    };
  }, [boundary]);

  // Fetch lake boundary when lakeId changes
  useEffect(() => {
    if (!lakeId) {
      setBoundary(null);
      return;
    }
    fetch(`${TILE_SERVER}/boundary?lake=${lakeId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setBoundary(data);
      })
      .catch(() => setBoundary(null));
  }, [lakeId]);

  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      onMapClick(e.lngLat.lng, e.lngLat.lat);
    },
    [onMapClick],
  );

  // Contour tile URL
  const contourTiles = useMemo(
    () => lakeId ? [`${TILE_SERVER}/tiles/${lakeId}/{z}/{x}/{y}.pbf`] : [],
    [lakeId],
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
        mapStyle={mapStyle}
        onClick={handleClick}
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

        {/* TWDB contour tiles — only render when we have a boundary to clip to */}
        {lakeId && boundary && (
          <Source
            id="twdb-contours"
            type="vector"
            tiles={contourTiles}
            minzoom={8}
            maxzoom={16}
          >
            {/* Minor contours (every 2ft) — only show when zoomed in */}
            <Layer
              id="twdb-contour-lines"
              type="line"
              source-layer="contours"
              filter={['==', ['get', 'level'], 0]}
              minzoom={13}
              paint={{
                'line-color': '#0288d1',
                'line-opacity': [
                  'interpolate', ['linear'], ['zoom'],
                  13, 0.25,
                  15, 0.45,
                ],
                'line-width': [
                  'interpolate', ['linear'], ['zoom'],
                  13, 0.4,
                  15, 0.8,
                  16, 1,
                ],
              }}
            />
            {/* Major contours (every 10ft) — always visible */}
            <Layer
              id="twdb-contour-lines-bold"
              type="line"
              source-layer="contours"
              filter={['==', ['get', 'level'], 1]}
              paint={{
                'line-color': '#01579b',
                'line-opacity': [
                  'interpolate', ['linear'], ['zoom'],
                  10, 0.6,
                  13, 0.85,
                ],
                'line-width': [
                  'interpolate', ['linear'], ['zoom'],
                  10, 1,
                  13, 1.8,
                  16, 2.5,
                ],
              }}
            />
            {/* Depth labels on major contours */}
            <Layer
              id="twdb-contour-labels"
              type="symbol"
              source-layer="contours"
              filter={['==', ['get', 'level'], 1]}
              paint={{
                'text-color': '#ffffff',
                'text-halo-color': '#01579b',
                'text-halo-width': 2,
              }}
              layout={{
                'symbol-placement': 'line',
                'text-field': ['concat', ['to-string', ['get', 'depth_ft']], ' ft'],
                'text-size': [
                  'interpolate', ['linear'], ['zoom'],
                  10, 10,
                  13, 13,
                  16, 15,
                ],
                'text-max-angle': 30,
                'symbol-spacing': 200,
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
        onClick={() => setShowSatellite(!showSatellite)}
        style={{
          position: 'absolute',
          top: 12,
          right: 60,
          padding: '6px 10px',
          background: 'rgba(255,255,255,0.9)',
          border: '1px solid #ccc',
          borderRadius: 4,
          fontSize: 11,
          color: '#333',
          zIndex: 10,
          cursor: 'pointer',
        }}
      >
        {showSatellite ? 'Topo Only' : '+ Satellite'}
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
