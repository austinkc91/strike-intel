// USGS Water Services API for water temperature.
// Parameter code 00010 = Water temperature in Celsius.
//
// Two endpoints in play:
//   /nwis/iv/  — instantaneous values (15-minute cadence). Retains roughly
//                the last ~120 days of data. Best for recent catches.
//   /nwis/dv/  — daily values. Goes back years. Used as a fallback when
//                the catch timestamp is older than what `iv` carries.

const USGS_IV = 'https://waterservices.usgs.gov/nwis/iv/';
const USGS_DV = 'https://waterservices.usgs.gov/nwis/dv/';

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoLocal(d: Date): string {
  // USGS startDT/endDT accept ISO-8601 with offset. We pass the moment
  // as UTC (Z) so it's unambiguous.
  return new Date(d.getTime()).toISOString().slice(0, 19) + 'Z';
}

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

    const res = await fetch(`${USGS_IV}?${params}`);
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

/**
 * Pull water temp at a specific past timestamp. Tries instantaneous values
 * (15-minute readings) first; if the timestamp is too old to be in the
 * `iv` window, falls back to the daily mean from the `dv` endpoint.
 *
 * Returns the reading closest in time to `timestamp`, or null if neither
 * endpoint has anything for the date. Temperature is in °F.
 */
export async function fetchHistoricalWaterTemp(
  stationId: string,
  timestamp: Date,
): Promise<{ temp_f: number; timestamp: Date } | null> {
  // 1) Try iv with a ±12hr window — gives us hourly granularity when in range
  try {
    const start = new Date(timestamp.getTime() - 12 * 60 * 60 * 1000);
    const end = new Date(timestamp.getTime() + 12 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      format: 'json',
      sites: stationId,
      parameterCd: '00010',
      startDT: isoLocal(start),
      endDT: isoLocal(end),
    });
    const res = await fetch(`${USGS_IV}?${params}`);
    if (res.ok) {
      const data = await res.json();
      const values: USGSValue[] | undefined = data?.value?.timeSeries?.[0]?.values?.[0]?.value;
      if (values && values.length > 0) {
        const targetMs = timestamp.getTime();
        let best: USGSValue | null = null;
        let bestDiff = Infinity;
        for (const v of values) {
          const diff = Math.abs(new Date(v.dateTime).getTime() - targetMs);
          if (diff < bestDiff) { bestDiff = diff; best = v; }
        }
        if (best) {
          const tempC = parseFloat(best.value);
          if (!isNaN(tempC) && tempC > -50) {
            return {
              temp_f: Math.round((tempC * 9) / 5 + 32),
              timestamp: new Date(best.dateTime),
            };
          }
        }
      }
    }
  } catch {
    /* fall through to dv */
  }

  // 2) Fall back to daily mean (statCd 00003) — covers years of history
  try {
    const dateStr = localDateStr(timestamp);
    const params = new URLSearchParams({
      format: 'json',
      sites: stationId,
      parameterCd: '00010',
      statCd: '00003',
      startDT: dateStr,
      endDT: dateStr,
    });
    const res = await fetch(`${USGS_DV}?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const values: USGSValue[] | undefined = data?.value?.timeSeries?.[0]?.values?.[0]?.value;
    if (!values || values.length === 0) return null;
    const tempC = parseFloat(values[0].value);
    if (isNaN(tempC) || tempC < -50) return null;
    return {
      temp_f: Math.round((tempC * 9) / 5 + 32),
      timestamp: new Date(values[0].dateTime),
    };
  } catch {
    return null;
  }
}

/**
 * Historical-aware companion to `fetchCurrentWaterTempNear`. If the
 * timestamp is recent (within a few hours of now), uses the live endpoint.
 * Otherwise queries the historical endpoints around the given moment.
 */
export async function fetchWaterTempNearAt(
  lat: number,
  lng: number,
  timestamp: Date,
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

  const ageHours = (Date.now() - timestamp.getTime()) / (1000 * 60 * 60);
  const result = ageHours <= 6
    ? await fetchWaterTemp(station.siteId)
    : await fetchHistoricalWaterTemp(station.siteId, timestamp);
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

    const res = await fetch(`${USGS_IV}?${params}`);
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
