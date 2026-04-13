import { useMemo } from 'react';
import { Source, Layer } from '@vis.gl/react-maplibre';
import { clusterHotspots, type MatchResult } from '../../services/patternEngine';

interface PatternMatchLayerProps {
  results: MatchResult[];
}

export function PatternMatchLayer({ results }: PatternMatchLayerProps) {
  // Cluster results into zones
  const zones = useMemo(() => clusterHotspots(results, 0.006), [results]);

  const zonesGeoJson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: zones.map((z) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [z.centerLng, z.centerLat] },
      properties: {
        id: z.id,
        avgScore: z.avgScore,
        topScore: z.topScore,
        count: z.count,
        radius: z.radius_deg,
      },
    })),
  }), [zones]);

  const top10 = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: zones.slice(0, 10).map((z, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [z.centerLng, z.centerLat] },
      properties: {
        rank: i + 1,
        score: Math.round(z.topScore * 100),
        count: z.count,
      },
    })),
  }), [zones]);

  if (results.length === 0) return null;

  return (
    <>
      <Source id="pattern-zones" type="geojson" data={zonesGeoJson}>
        {/* Large glow per zone — size based on cluster count */}
        <Layer
          id="pattern-zone-glow"
          type="circle"
          paint={{
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              10, ['interpolate', ['linear'], ['get', 'count'], 1, 12, 5, 20, 15, 35],
              13, ['interpolate', ['linear'], ['get', 'count'], 1, 20, 5, 40, 15, 65],
              16, ['interpolate', ['linear'], ['get', 'count'], 1, 35, 5, 60, 15, 100],
            ],
            'circle-color': [
              'interpolate', ['linear'], ['get', 'topScore'],
              0.7, 'rgba(255, 167, 38, 0.12)',
              0.8, 'rgba(139, 195, 74, 0.18)',
              0.85, 'rgba(76, 175, 80, 0.22)',
              0.9, 'rgba(76, 175, 80, 0.3)',
              0.95, 'rgba(46, 125, 50, 0.35)',
            ],
            'circle-blur': 0.6,
          }}
        />
        {/* Solid center marker */}
        <Layer
          id="pattern-zone-dot"
          type="circle"
          paint={{
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              10, ['interpolate', ['linear'], ['get', 'count'], 1, 4, 5, 7, 15, 10],
              13, ['interpolate', ['linear'], ['get', 'count'], 1, 6, 5, 10, 15, 15],
              16, ['interpolate', ['linear'], ['get', 'count'], 1, 10, 5, 16, 15, 22],
            ],
            'circle-color': [
              'interpolate', ['linear'], ['get', 'topScore'],
              0.7, '#ff9800',
              0.8, '#8bc34a',
              0.85, '#66bb6a',
              0.9, '#4caf50',
              0.95, '#2e7d32',
            ],
            'circle-opacity': 0.9,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-opacity': 0.8,
          }}
        />
      </Source>

      <Source id="pattern-top10" type="geojson" data={top10}>
        {/* Rank labels */}
        <Layer
          id="pattern-top-labels"
          type="symbol"
          layout={{
            'text-field': [
              'concat',
              '#', ['get', 'rank'],
              ' ', ['get', 'score'], '%',
            ],
            'text-font': ['Open Sans Semibold'],
            'text-size': [
              'interpolate', ['linear'], ['zoom'],
              10, 10,
              14, 13,
            ],
            'text-offset': [0, -1.6],
            'text-allow-overlap': true,
          }}
          paint={{
            'text-color': '#ffffff',
            'text-halo-color': 'rgba(10, 25, 41, 0.9)',
            'text-halo-width': 2,
          }}
        />
      </Source>
    </>
  );
}
