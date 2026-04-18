import exifr from 'exifr';
import type { GeoPoint } from '../types';

interface ExifResult {
  location: GeoPoint | null;
  timestamp: Date | null;
  debug: string;
}

export async function extractExifData(file: File): Promise<ExifResult> {
  const debugParts: string[] = [`${file.type || 'unknown'} ${(file.size / 1024).toFixed(0)}kb`];
  try {
    const buffer = await file.arrayBuffer();

    const data = await exifr.parse(buffer, { gps: true, tiff: true, exif: true });

    let latitude: number | null = null;
    let longitude: number | null = null;

    if (data?.latitude != null && data?.longitude != null) {
      latitude = data.latitude;
      longitude = data.longitude;
    } else {
      const gps = await exifr.gps(buffer).catch(() => null);
      if (gps?.latitude != null && gps?.longitude != null) {
        latitude = gps.latitude;
        longitude = gps.longitude;
      }
    }

    const location: GeoPoint | null =
      latitude != null && longitude != null ? { latitude, longitude } : null;

    const timestamp: Date | null =
      data?.DateTimeOriginal instanceof Date
        ? data.DateTimeOriginal
        : data?.CreateDate instanceof Date
          ? data.CreateDate
          : null;

    if (data) {
      const keys = Object.keys(data);
      debugParts.push(`${keys.length} tags`);
      const gpsKeys = keys.filter(k => k.toLowerCase().includes('gps') || k === 'latitude' || k === 'longitude');
      if (gpsKeys.length) debugParts.push(`GPS keys: ${gpsKeys.join(',')}`);
      else debugParts.push('no GPS tags');
    } else {
      debugParts.push('no EXIF data');
    }

    console.log('[exif]', {
      file: file.name, type: file.type, size: file.size,
      hasData: !!data, lat: latitude, lng: longitude, ts: timestamp,
      rawKeys: data ? Object.keys(data) : [], rawData: data,
    });

    return { location, timestamp, debug: debugParts.join(' · ') };
  } catch (err) {
    console.warn('EXIF extraction failed:', err);
    debugParts.push(`error: ${err instanceof Error ? err.message : String(err)}`);
    return { location: null, timestamp: null, debug: debugParts.join(' · ') };
  }
}
