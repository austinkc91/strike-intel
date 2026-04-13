import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-maplibre';

interface NavionicsLayerProps {
  navKey: string;
  chartType?: 'JNC.NAVIONICS_CHARTS.SONARCHART' | 'JNC.NAVIONICS_CHARTS.NAUTICAL';
  visible?: boolean;
}

// Navionics tile URL - uses their tile server with a navtoken
// The navtoken is fetched from their API using the navKey
async function getNavToken(navKey: string, referer: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://tile1.navionics.com/tile/get_key/${navKey}/${encodeURIComponent(referer)}`,
      { headers: { Referer: referer } },
    );
    if (!res.ok) return null;
    const token = await res.text();
    return token || null;
  } catch {
    return null;
  }
}

export function NavionicsLayer({ navKey, visible = true }: NavionicsLayerProps) {
  const { current: map } = useMap();
  const initialized = useRef(false);

  useEffect(() => {
    if (!map || !navKey || initialized.current) return;

    const m = map.getMap();

    const setup = async () => {
      // Get navtoken
      const referer = window.location.origin;
      const token = await getNavToken(navKey, referer);
      if (!token) {
        console.warn('[NavionicsLayer] Failed to get navtoken - check your navKey');
        return;
      }

      initialized.current = true;

      // SonarChart tiles (HD bathymetry with 1ft contours)
      const tileUrl =
        `https://tile1.navionics.com/tile/{z}/{x}/{y}` +
        `?LAYERS=config_1_20.00_0` +
        `&TRANSPARENT=TRUE` +
        `&UGC=TRUE` +
        `&navtoken=${token}`;

      if (!m.getSource('navionics')) {
        m.addSource('navionics', {
          type: 'raster',
          tiles: [tileUrl],
          tileSize: 256,
          maxzoom: 18,
          attribution: 'Navionics Charts (garmin.com)',
        });
      }

      if (!m.getLayer('navionics-layer')) {
        m.addLayer({
          id: 'navionics-layer',
          type: 'raster',
          source: 'navionics',
          paint: {
            'raster-opacity': visible ? 1 : 0,
          },
          layout: {
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
      initialized.current = false;
      const mp = map.getMap();
      if (mp.getLayer('navionics-layer')) mp.removeLayer('navionics-layer');
      if (mp.getSource('navionics')) mp.removeSource('navionics');
    };
  }, [map, navKey]);

  useEffect(() => {
    if (!map) return;
    const m = map.getMap();
    if (m.getLayer('navionics-layer')) {
      m.setLayoutProperty('navionics-layer', 'visibility', visible ? 'visible' : 'none');
    }
  }, [map, visible]);

  return null;
}
