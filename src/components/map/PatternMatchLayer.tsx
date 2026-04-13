import { useEffect } from 'react';
import { useMap } from '@vis.gl/react-maplibre';
import type { MatchResult } from '../../services/patternEngine';

interface PatternMatchLayerProps {
  results: MatchResult[];
  visible?: boolean;
}

export function PatternMatchLayer({ results, visible = true }: PatternMatchLayerProps) {
  const { current: map } = useMap();

  useEffect(() => {
    if (!map) return;
    const m = map.getMap();

    const setup = () => {
      // Build GeoJSON from results
      const geojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: results.map((r) => ({
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [r.lng, r.lat],
          },
          properties: {
            score: r.score,
            cellId: r.cellId,
          },
        })),
      };

      // Add or update source
      const source = m.getSource('pattern-match') as any;
      if (source) {
        source.setData(geojson);
      } else {
        m.addSource('pattern-match', {
          type: 'geojson',
          data: geojson,
        });
      }

      // Add heatmap layer
      if (!m.getLayer('pattern-heatmap')) {
        m.addLayer({
          id: 'pattern-heatmap',
          type: 'circle',
          source: 'pattern-match',
          paint: {
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              10, 8,
              14, 20,
              16, 35,
            ],
            'circle-color': [
              'interpolate', ['linear'], ['get', 'score'],
              0.7, 'rgba(255, 167, 38, 0.3)',    // orange - somewhat similar
              0.8, 'rgba(205, 220, 57, 0.4)',     // yellow-green - very similar
              0.9, 'rgba(102, 187, 106, 0.5)',    // green - near identical
              1.0, 'rgba(102, 187, 106, 0.7)',
            ],
            'circle-blur': 0.6,
            'circle-stroke-width': [
              'case',
              ['>=', ['get', 'score'], 0.9], 2,
              0,
            ],
            'circle-stroke-color': 'rgba(102, 187, 106, 0.8)',
          },
          layout: {
            visibility: visible ? 'visible' : 'none',
          },
        });
      }

      // Add top-5 labels
      if (!m.getLayer('pattern-top-labels')) {
        // Create a source for just the top 5
        const top5: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: results.slice(0, 5).map((r, i) => ({
            type: 'Feature' as const,
            geometry: {
              type: 'Point' as const,
              coordinates: [r.lng, r.lat],
            },
            properties: {
              rank: i + 1,
              score: Math.round(r.score * 100),
            },
          })),
        };

        const top5Source = m.getSource('pattern-top5') as any;
        if (top5Source) {
          top5Source.setData(top5);
        } else {
          m.addSource('pattern-top5', {
            type: 'geojson',
            data: top5,
          });
        }

        m.addLayer({
          id: 'pattern-top-labels',
          type: 'symbol',
          source: 'pattern-top5',
          layout: {
            'text-field': ['concat', '#', ['get', 'rank'], ' ', ['get', 'score'], '%'],
            'text-font': ['Open Sans Bold'],
            'text-size': 12,
            'text-offset': [0, -1.5],
            visibility: visible ? 'visible' : 'none',
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': 'rgba(10, 25, 41, 0.9)',
            'text-halo-width': 2,
          },
        });
      } else {
        // Update top 5 source
        const top5: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: results.slice(0, 5).map((r, i) => ({
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
            properties: { rank: i + 1, score: Math.round(r.score * 100) },
          })),
        };
        const top5Source = m.getSource('pattern-top5') as any;
        if (top5Source) top5Source.setData(top5);
      }
    };

    if (m.isStyleLoaded()) {
      setup();
    } else {
      m.on('load', setup);
    }

    return () => {
      const mp = map.getMap();
      if (mp.getLayer('pattern-top-labels')) mp.removeLayer('pattern-top-labels');
      if (mp.getLayer('pattern-heatmap')) mp.removeLayer('pattern-heatmap');
      if (mp.getSource('pattern-top5')) mp.removeSource('pattern-top5');
      if (mp.getSource('pattern-match')) mp.removeSource('pattern-match');
    };
  }, [map, results, visible]);

  return null;
}
