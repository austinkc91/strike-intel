import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-maplibre';
import { getVectorTileUrl } from '../../services/depthApi';

interface DepthTileLayerProps {
  lakeId: string;
  visible?: boolean;
}

const SOURCE_ID = 'depth-vector-tiles';
const CONTOUR_LINE_LAYER = 'depth-vt-contour-lines';
const CONTOUR_MAJOR_LAYER = 'depth-vt-contour-major';
const CONTOUR_LABEL_LAYER = 'depth-vt-contour-labels';
const CONTOUR_FILL_LAYER = 'depth-vt-contour-fill';

/**
 * Renders GLOBathy-derived depth contour vector tiles on the MapLibre map.
 * Tiles are served from the depth API server (tileserver-gl proxy).
 */
export function DepthTileLayer({ lakeId, visible = true }: DepthTileLayerProps) {
  const { current: map } = useMap();
  const initialized = useRef(false);

  // Initialize vector tile source and layers
  useEffect(() => {
    if (!map) return;
    const m = map.getMap();

    const setup = () => {
      if (initialized.current) return;
      initialized.current = true;

      const tileUrl = getVectorTileUrl();

      // Add vector tile source
      m.addSource(SOURCE_ID, {
        type: 'vector',
        tiles: [tileUrl],
        minzoom: 8,
        maxzoom: 16,
      });

      // Layer 1: Depth fill between contours (subtle color bands)
      m.addLayer({
        id: CONTOUR_FILL_LAYER,
        type: 'fill',
        source: SOURCE_ID,
        'source-layer': 'depth_contours',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'fill-color': [
            'interpolate', ['linear'], ['get', 'depth_ft'],
            0,  'rgba(168, 213, 226, 0.3)',
            5,  'rgba(126, 200, 227, 0.3)',
            10, 'rgba(88, 180, 209, 0.3)',
            15, 'rgba(58, 159, 192, 0.3)',
            20, 'rgba(43, 136, 171, 0.3)',
            25, 'rgba(31, 114, 150, 0.3)',
            30, 'rgba(25, 94, 130, 0.3)',
            40, 'rgba(12, 48, 74, 0.3)',
          ],
          'fill-opacity': 0.6,
        },
        layout: { visibility: visible ? 'visible' : 'none' },
      });

      // Layer 2: Minor contour lines
      m.addLayer({
        id: CONTOUR_LINE_LAYER,
        type: 'line',
        source: SOURCE_ID,
        'source-layer': 'depth_contours',
        filter: ['all',
          ['==', ['geometry-type'], 'LineString'],
          ['==', ['get', 'is_major'], 0],
        ],
        paint: {
          'line-color': 'rgba(180, 215, 240, 0.4)',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            10, 0.3,
            14, 0.8,
            16, 1.2,
          ],
        },
        layout: { visibility: visible ? 'visible' : 'none' },
      });

      // Layer 3: Major contour lines (every 5ft)
      m.addLayer({
        id: CONTOUR_MAJOR_LAYER,
        type: 'line',
        source: SOURCE_ID,
        'source-layer': 'depth_contours',
        filter: ['all',
          ['==', ['geometry-type'], 'LineString'],
          ['==', ['get', 'is_major'], 1],
        ],
        paint: {
          'line-color': 'rgba(220, 240, 255, 0.7)',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            10, 0.8,
            14, 1.8,
            16, 2.5,
          ],
        },
        layout: { visibility: visible ? 'visible' : 'none' },
      });

      // Layer 4: Depth labels on major contour lines
      m.addLayer({
        id: CONTOUR_LABEL_LAYER,
        type: 'symbol',
        source: SOURCE_ID,
        'source-layer': 'depth_contours',
        filter: ['all',
          ['==', ['geometry-type'], 'LineString'],
          ['==', ['get', 'is_major'], 1],
        ],
        paint: {
          'text-color': 'rgba(220, 240, 255, 0.9)',
          'text-halo-color': 'rgba(10, 30, 60, 0.9)',
          'text-halo-width': 1.5,
        },
        layout: {
          'symbol-placement': 'line',
          'text-field': ['concat', ['to-string', ['get', 'depth_ft']], "'"],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            10, 9,
            14, 11,
            16, 13,
          ],
          'text-max-angle': 30,
          'symbol-spacing': 250,
          visibility: visible ? 'visible' : 'none',
        },
        minzoom: 11,
      });
    };

    if (m.isStyleLoaded()) {
      setup();
    } else {
      m.on('load', setup);
    }

    return () => {
      initialized.current = false;
      const mp = map.getMap();
      [CONTOUR_LABEL_LAYER, CONTOUR_MAJOR_LAYER, CONTOUR_LINE_LAYER, CONTOUR_FILL_LAYER].forEach((id) => {
        if (mp.getLayer(id)) mp.removeLayer(id);
      });
      if (mp.getSource(SOURCE_ID)) mp.removeSource(SOURCE_ID);
    };
  }, [map]);

  // Toggle visibility when prop changes
  useEffect(() => {
    if (!map) return;
    const m = map.getMap();
    const vis = visible ? 'visible' : 'none';
    [CONTOUR_FILL_LAYER, CONTOUR_LINE_LAYER, CONTOUR_MAJOR_LAYER, CONTOUR_LABEL_LAYER].forEach((id) => {
      if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', vis);
    });
  }, [map, visible]);

  return null;
}
