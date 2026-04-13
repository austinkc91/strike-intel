import { useRef } from 'react';
import { extractExifData } from '../../services/exif';
import type { GeoPoint } from '../../types';

interface PhotoImportProps {
  onPhotoSelected: (data: {
    file: File;
    location: GeoPoint | null;
    timestamp: Date | null;
  }) => void;
}

export function PhotoImport({ onPhotoSelected }: PhotoImportProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const exif = await extractExifData(file);
    onPhotoSelected({
      file,
      location: exif.location,
      timestamp: exif.timestamp,
    });

    // Reset input so the same file can be selected again
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <label className="photo-import-btn">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
      Import from Photo
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
      />
    </label>
  );
}
