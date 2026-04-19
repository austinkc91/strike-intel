// USGS Water Services API for real-time water temperature
// Parameter code 00010 = Water temperature in Celsius

const USGS_BASE = 'https://waterservices.usgs.gov/nwis/iv/';

interface USGSValue {
  value: string;
  dateTime: string;
}

export async function fetchWaterTemp(
  stationId: string,
): Promise<{ temp_f: number; timestamp: Date } | null> {
  try {
    const params = new URLSearchParams({
      format: 'json',
      sites: stationId,
      parameterCd: '00010',
      siteStatus: 'active',
    });

    const res = await fetch(`${USGS_BASE}?${params}`);
    if (!res.ok) return null;

    const data = await res.json();
    const timeSeries = data?.value?.timeSeries;
    if (!timeSeries || timeSeries.length === 0) return null;

    const values: USGSValue[] = timeSeries[0]?.values?.[0]?.value;
    if (!values || values.length === 0) return null;

    // Get most recent reading
    const latest = values[values.length - 1];
    const tempC = parseFloat(latest.value);
    if (isNaN(tempC) || tempC < -50) return null;

    const temp_f = Math.round((tempC * 9) / 5 + 32);
    return { temp_f, timestamp: new Date(latest.dateTime) };
  } catch {
    return null;
  }
}

interface CachedStation {
  siteId: string;
  siteName: string;
}

// Cache nearest-station lookup per rounded lat/lng so we don't re-discover
// every page load. null = confirmed no station available.
const nearestStationCache = new Map<string, CachedStation | null>();

/**
 * Convenience: find the nearest USGS water-temp station for a lat/lng
 * (cached after first call) and return the current water temperature.
 */
export async function fetchCurrentWaterTempNear(
  lat: number,
  lng: number,
): Promise<{ temp_f: number; timestamp: Date; stationName: string } | null> {
  const key = `${lat.toFixed(2)}_${lng.toFixed(2)}`;
  let station = nearestStationCache.get(key);
  if (station === undefined) {
    const stations = await findNearbyWaterTempStations(lat, lng, 30);
    station = stations.length > 0
      ? { siteId: stations[0].siteId, siteName: stations[0].siteName }
      : null;
    nearestStationCache.set(key, station);
  }
  if (!station) return null;
  const result = await fetchWaterTemp(station.siteId);
  if (!result) return null;
  return { ...result, stationName: station.siteName };
}

// Search for USGS stations near a lat/lng
export async function findNearbyWaterTempStations(
  lat: number,
  lng: number,
  radiusMiles: number = 25,
): Promise<Array<{ siteId: string; siteName: string; distance: number }>> {
  try {
    const params = new URLSearchParams({
      format: 'json',
      parameterCd: '00010',
      siteStatus: 'active',
      bBox: `${lng - radiusMiles * 0.015},${lat - radiusMiles * 0.015},${lng + radiusMiles * 0.015},${lat + radiusMiles * 0.015}`,
    });

    const res = await fetch(`${USGS_BASE}?${params}`);
    if (!res.ok) return [];

    const data = await res.json();
    const timeSeries = data?.value?.timeSeries;
    if (!timeSeries) return [];

    return timeSeries.map((ts: any) => {
      const info = ts.sourceInfo;
      const siteLat = info?.geoLocation?.geogLocation?.latitude || 0;
      const siteLng = info?.geoLocation?.geogLocation?.longitude || 0;
      const distance = Math.sqrt(
        Math.pow((siteLat - lat) * 69, 2) +
        Math.pow((siteLng - lng) * 69 * Math.cos((lat * Math.PI) / 180), 2),
      );
      return {
        siteId: info?.siteCode?.[0]?.value || '',
        siteName: info?.siteName || '',
        distance: Math.round(distance * 10) / 10,
      };
    }).sort((a: any, b: any) => a.distance - b.distance);
  } catch {
    return [];
  }
}
