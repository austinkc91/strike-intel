import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-maplibre';
import type { GridCell } from '../../services/patternEngine';

interface DepthContourLayerProps {
  grid: GridCell[];
  visible?: boolean;
}

export function DepthContourLayer({ grid, visible = true }: DepthContourLayerProps) {
  const { current: map } = useMap();
  const initialized = useRef(false);

  useEffect(() => {
    if (!map || grid.length === 0) return;
    const m = map.getMap();

    const setup = () => {
      if (initialized.current) return;
      initialized.current = true;

      console.log(`[DepthContourLayer] Rendering ${grid.length} depth cells`);

      // ---- 1. Depth shading (color-coded circles) ----
      const depthPoints: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: grid.map((c) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [c.lng, c.lat] },
          properties: { depth: c.depth_ft },
        })),
      };

      m.addSource('depth-shading', { type: 'geojson', data: depthPoints });

      m.addLayer({
        id: 'depth-shading-layer',
        type: 'circle',
        source: 'depth-shading',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            9, 2,
            11, 5,
            13, 10,
            15, 22,
            17, 45,
          ],
          'circle-color': [
            'interpolate', ['linear'], ['get', 'depth'],
            0,  '#a8d5e2',   // very shallow - pale blue
            3,  '#7ec8e3',
            5,  '#58b4d1',
            8,  '#3a9fc0',
            10, '#2b88ab',
            12, '#1f7296',
            15, '#195e82',
            18, '#154d6e',
            20, '#11405d',
            25, '#0c304a',
            30, '#082438',
            40, '#041828',   // deep - very dark blue
          ],
          'circle-blur': 0.7,
          'circle-opacity': 0.85,
        },
        layout: { visibility: visible ? 'visible' : 'none' },
      });

      // ---- 2. Contour lines at 5ft and 10ft intervals ----
      // Group grid cells into depth bands and create contour-like lines
      const contourDepths = [5, 10, 15, 20, 25, 30, 35, 40];
      const contourFeatures: GeoJSON.Feature[] = [];

      for (const targetDepth of contourDepths) {
        // Find cells near this depth (within 1.5ft)
        const nearbyCells = grid.filter(
          (c) => Math.abs(c.depth_ft - targetDepth) < 1.5,
        );

        if (nearbyCells.length < 3) continue;

        // Sort cells to form a rough line by proximity
        const sorted = orderPointsByProximity(nearbyCells);

        // Create line segments from nearby points
        const segments = createLineSegments(sorted, 0.004);

        for (const segment of segments) {
          if (segment.length < 2) continue;
          contourFeatures.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: segment.map((c) => [c.lng, c.lat]),
            },
            properties: {
              depth: targetDepth,
              label: `${targetDepth}ft`,
              isMajor: targetDepth % 10 === 0,
            },
          });
        }
      }

      if (contourFeatures.length > 0) {
        const contourGeoJSON: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: contourFeatures,
        };

        m.addSource('depth-contours', { type: 'geojson', data: contourGeoJSON });

        // Contour lines
        m.addLayer({
          id: 'depth-contour-lines',
          type: 'line',
          source: 'depth-contours',
          paint: {
            'line-color': [
              'case',
              ['get', 'isMajor'],
              'rgba(220, 240, 255, 0.7)',
              'rgba(180, 215, 240, 0.4)',
            ],
            'line-width': [
              'case',
              ['get', 'isMajor'],
              1.8,
              0.8,
            ],
          },
          layout: { visibility: visible ? 'visible' : 'none' },
        });

        // Depth labels on major contours
        m.addLayer({
          id: 'depth-contour-labels',
          type: 'symbol',
          source: 'depth-contours',
          filter: ['==', ['get', 'isMajor'], true],
          paint: {
            'text-color': 'rgba(220, 240, 255, 0.9)',
            'text-halo-color': 'rgba(10, 30, 60, 0.9)',
            'text-halo-width': 1.5,
          },
          layout: {
            'symbol-placement': 'line',
            'text-field': ['get', 'label'],
            'text-size': 11,
            'text-max-angle': 30,
            'symbol-spacing': 200,
            visibility: visible ? 'visible' : 'none',
          },
        });
      }

      // ---- 3. Depth labels on individual points at high zoom ----
      m.addLayer({
        id: 'depth-point-labels',
        type: 'symbol',
        source: 'depth-shading',
        minzoom: 14,
        paint: {
          'text-color': 'rgba(200, 230, 255, 0.8)',
          'text-halo-color': 'rgba(10, 30, 60, 0.8)',
          'text-halo-width': 1,
        },
        layout: {
          'text-field': ['concat', ['to-string', ['round', ['get', 'depth']]], '\''],
          'text-size': 9,
          'text-allow-overlap': false,
          'text-ignore-placement': false,
          visibility: visible ? 'visible' : 'none',
        },
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
      ['depth-point-labels', 'depth-contour-labels', 'depth-contour-lines', 'depth-shading-layer'].forEach((id) => {
        if (mp.getLayer(id)) mp.removeLayer(id);
      });
      ['depth-contours', 'depth-shading'].forEach((id) => {
        if (mp.getSource(id)) mp.removeSource(id);
      });
    };
  }, [map, grid]);

  // Toggle visibility
  useEffect(() => {
    if (!map) return;
    const m = map.getMap();
    const vis = visible ? 'visible' : 'none';
    ['depth-point-labels', 'depth-contour-labels', 'depth-contour-lines', 'depth-shading-layer'].forEach((id) => {
      if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', vis);
    });
  }, [map, visible]);

  return null;
}

// Order points by nearest-neighbor to form a rough path
function orderPointsByProximity(cells: GridCell[]): GridCell[] {
  if (cells.length <= 1) return cells;

  const remaining = [...cells];
  const ordered: GridCell[] = [remaining.shift()!];

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const d = Math.pow(remaining[i].lng - last.lng, 2) + Math.pow(remaining[i].lat - last.lat, 2);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }

    ordered.push(remaining.splice(nearestIdx, 1)[0]);
  }

  return ordered;
}

// Split ordered points into line segments (break when gap is too large)
function createLineSegments(cells: GridCell[], maxGap: number): GridCell[][] {
  const segments: GridCell[][] = [];
  let current: GridCell[] = [cells[0]];

  for (let i = 1; i < cells.length; i++) {
    const prev = cells[i - 1];
    const dist = Math.sqrt(
      Math.pow(cells[i].lng - prev.lng, 2) + Math.pow(cells[i].lat - prev.lat, 2),
    );

    if (dist > maxGap) {
      if (current.length >= 2) segments.push(current);
      current = [cells[i]];
    } else {
      current.push(cells[i]);
    }
  }

  if (current.length >= 2) segments.push(current);
  return segments;
}
