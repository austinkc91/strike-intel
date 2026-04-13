import exifr from 'exifr';
import type { GeoPoint } from '../types';

interface ExifResult {
  location: GeoPoint | null;
  timestamp: Date | null;
}

export async function extractExifData(file: File): Promise<ExifResult> {
  try {
    const data = await exifr.parse(file, {
      gps: true,
      pick: ['DateTimeOriginal', 'CreateDate', 'GPSLatitude', 'GPSLongitude'],
    });

    if (!data) return { location: null, timestamp: null };

    const location: GeoPoint | null =
      data.latitude != null && data.longitude != null
        ? { latitude: data.latitude, longitude: data.longitude }
        : null;

    const timestamp: Date | null =
      data.DateTimeOriginal instanceof Date
        ? data.DateTimeOriginal
        : data.CreateDate instanceof Date
          ? data.CreateDate
          : null;

    return { location, timestamp };
  } catch {
    return { location: null, timestamp: null };
  }
}
