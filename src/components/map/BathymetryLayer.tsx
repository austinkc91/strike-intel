import { useEffect } from 'react';
import { useMap } from '@vis.gl/react-maplibre';
import mlContour from 'maplibre-contour';

interface BathymetryLayerProps {
  tileUrl: string | null;
  visible?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let demSourceInstance: any = null;

export function BathymetryLayer({ tileUrl, visible = true }: BathymetryLayerProps) {
  const { current: map } = useMap();

  useEffect(() => {
    if (!map || !tileUrl) return;
    const m = map.getMap();

    // Wait for map style to load
    const setup = () => {
      // Create DEM source
      demSourceInstance = new mlContour.DemSource({
        url: tileUrl,
        encoding: 'terrarium',
        maxzoom: 14,
        worker: true,
      });

      // Register the contour protocol source
      demSourceInstance.setupMaplibre(m as any);

      // Add contour source
      if (!m.getSource('contour-source')) {
        m.addSource(
          'contour-source',
          demSourceInstance.contourProtocolSource({
            overzoom: 1,
            thresholds: {
              10: [10, 50],    // every 10ft, bold every 50ft at z10
              11: [5, 20],     // every 5ft, bold every 20ft at z11
              12: [5, 20],     // every 5ft, bold every 20ft at z12
              13: [2, 10],     // every 2ft, bold every 10ft at z13
              14: [1, 5],      // every 1ft, bold every 5ft at z14
            },
          }) as any,
        );
      }

      // Add contour line layer
      if (!m.getLayer('contour-lines')) {
        m.addLayer({
          id: 'contour-lines',
          type: 'line',
          source: 'contour-source',
          paint: {
            'line-color': 'rgba(79, 195, 247, 0.5)',
            'line-width': ['match', ['get', 'level'], 1, 1.5, 0.7],
          },
          layout: {
            visibility: visible ? 'visible' : 'none',
          },
        });
      }

      // Add contour labels
      if (!m.getLayer('contour-labels')) {
        m.addLayer({
          id: 'contour-labels',
          type: 'symbol',
          source: 'contour-source',
          filter: ['==', ['get', 'level'], 1],
          paint: {
            'text-color': 'rgba(79, 195, 247, 0.8)',
            'text-halo-color': 'rgba(10, 25, 41, 0.9)',
            'text-halo-width': 1.5,
          },
          layout: {
            'symbol-placement': 'line',
            'text-field': ['concat', ['number-format', ['get', 'ele'], {}], 'ft'],
            'text-font': ['Open Sans Regular'],
            'text-size': 10,
            visibility: visible ? 'visible' : 'none',
          },
        });
      }
    };

    if (m.isStyleLoaded()) {
      setup();
    } else {
      m.on('load', setup);
    }

    return () => {
      // Cleanup on unmount
      const mp = map.getMap();
      if (mp.getLayer('contour-labels')) mp.removeLayer('contour-labels');
      if (mp.getLayer('contour-lines')) mp.removeLayer('contour-lines');
      if (mp.getSource('contour-source')) mp.removeSource('contour-source');
      demSourceInstance = null;
    };
  }, [map, tileUrl]);

  // Toggle visibility
  useEffect(() => {
    if (!map) return;
    const m = map.getMap();
    const vis = visible ? 'visible' : 'none';
    if (m.getLayer('contour-lines')) {
      m.setLayoutProperty('contour-lines', 'visibility', vis);
    }
    if (m.getLayer('contour-labels')) {
      m.setLayoutProperty('contour-labels', 'visibility', vis);
    }
  }, [map, visible]);

  return null; // This component only manages map layers
}
