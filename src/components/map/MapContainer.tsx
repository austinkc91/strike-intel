import { useCallback, useRef, useState } from 'react';
import { Map, NavigationControl, GeolocateControl, Source, Layer } from '@vis.gl/react-maplibre';
import type { MapRef, MapLayerMouseEvent } from '@vis.gl/react-maplibre';
import { useAppStore } from '../../store';
import { CatchPinLayer } from './CatchPinLayer';
import { CaughtNowButton } from '../catch/CaughtNowButton';
import { WindRose } from './WindRose';
import { PatternMatchLayer } from './PatternMatchLayer';
import { DepthTileLayer } from './DepthTileLayer';
import type { Catch, CatchWeather } from '../../types';
import type { MatchResult } from '../../services/patternEngine';

// C-MAP Genesis Social Map - free crowd-sourced depth tiles
const CMAP_DEPTH_TILES = 'https://s3-nox-prd-processing-soc-tli-v2-use1.s3.amazonaws.com/img/b_{quadkey}.png';
// Contour line overlay (may require auth): https://s3-nox-prd-processing-soc-tli-v2-use1.s3.amazonaws.com/img/t_{quadkey}.png

// USGS Topo for land base map
const USGS_TOPO_TILES = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}';
const USGS_IMAGERY_TILES = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}';

// Base style with USGS topo + C-MAP depth contours overlaid
const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'usgs-topo': {
      type: 'raster',
      tiles: [USGS_TOPO_TILES],
      tileSize: 256,
      attribution: 'USGS',
      maxzoom: 16,
    },
    'cmap-depth': {
      type: 'raster',
      tiles: [CMAP_DEPTH_TILES],
      tileSize: 256,
      minzoom: 10,
      maxzoom: 16,
      attribution: 'C-MAP Genesis Social Map',
    },
  },
  layers: [
    {
      id: 'usgs-topo-layer',
      type: 'raster',
      source: 'usgs-topo',
      paint: {},
    },
    {
      id: 'cmap-depth-layer',
      type: 'raster',
      source: 'cmap-depth',
      paint: {
        'raster-opacity': 0.85,
      },
    },
  ],
};

interface MapContainerProps {
  catches: Catch[];
  onMapClick: (lng: number, lat: number) => void;
  onCaughtNow: () => void;
  onCatchClick: (c: Catch) => void;
  caughtNowLoading: boolean;
  currentWeather?: CatchWeather | null;
  patternResults?: MatchResult[];
  showDepthTiles?: boolean;
}

export function MapContainer({
  catches,
  onMapClick,
  onCaughtNow,
  onCatchClick,
  caughtNowLoading,
  currentWeather,
  patternResults = [],
  showDepthTiles = true,
}: MapContainerProps) {
  const mapRef = useRef<MapRef>(null);
  const { mapCenter, mapZoom, selectedLake } = useAppStore();
  const [showSatellite, setShowSatellite] = useState(false);

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
              beforeId="cmap-depth-layer"
              paint={{ 'raster-opacity': 0.6 }}
            />
          </Source>
        )}

        {/* GLOBathy depth contour vector tiles */}
        {selectedLake && (
          <DepthTileLayer
            lakeId={selectedLake.id}
            visible={showDepthTiles}
          />
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
