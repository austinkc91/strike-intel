import { useState } from 'react';
import { PhotoImport } from './PhotoImport';
import type { CatchFormData, GeoPoint } from '../../types';

const COMMON_SPECIES = [
  'Largemouth Bass',
  'Smallmouth Bass',
  'Striped Bass',
  'Walleye',
  'Crappie',
  'Bluegill',
  'Channel Catfish',
  'Northern Pike',
  'Musky',
  'Trout',
  'Perch',
  'Carp',
  'Other',
];

interface LogCatchFormProps {
  initialLocation: GeoPoint | null;
  initialTimestamp: Date | null;
  onSubmit: (data: CatchFormData) => Promise<void>;
  onCancel: () => void;
}

export function LogCatchForm({
  initialLocation,
  initialTimestamp,
  onSubmit,
  onCancel,
}: LogCatchFormProps) {
  const [location, setLocation] = useState<GeoPoint | null>(initialLocation);
  const [timestamp, setTimestamp] = useState<Date>(initialTimestamp || new Date());
  const [species, setSpecies] = useState('');
  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('');
  const [lure, setLure] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoSource, setPhotoSource] = useState<'camera' | 'import' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePhotoSelected = (data: {
    file: File;
    location: GeoPoint | null;
    timestamp: Date | null;
  }) => {
    setPhoto(data.file);
    setPhotoSource('import');
    if (data.location) setLocation(data.location);
    if (data.timestamp) setTimestamp(data.timestamp);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location) {
      setError('Please set a location by tapping the map or importing a photo with GPS data.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        location,
        timestamp,
        species,
        weight_lbs: weight,
        length_in: length,
        lure,
        notes,
        photo,
        photoSource,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save catch');
      setSubmitting(false);
    }
  };

  const formatDateForInput = (d: Date) => {
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  };

  return (
    <div className="bottom-sheet">
      <div className="bottom-sheet-handle" />
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Log a Catch</h3>
          <button type="button" onClick={onCancel} style={{ background: 'none', color: 'var(--color-text-secondary)', fontSize: 14 }}>
            Cancel
          </button>
        </div>

        {/* Location status */}
        <div style={{ marginBottom: 12, fontSize: 13, color: location ? 'var(--color-accent)' : 'var(--color-warning)' }}>
          {location
            ? `Location: ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
            : 'Tap the map to set location, or import a photo with GPS'}
        </div>

        {/* Photo import */}
        <div className="form-group">
          <PhotoImport onPhotoSelected={handlePhotoSelected} />
          {photo && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-accent)' }}>
              Photo loaded: {photo.name}
            </div>
          )}
        </div>

        {/* Date/Time */}
        <div className="form-group">
          <label>Date & Time</label>
          <input
            type="datetime-local"
            value={formatDateForInput(timestamp)}
            onChange={(e) => setTimestamp(new Date(e.target.value))}
          />
        </div>

        {/* Species */}
        <div className="form-group">
          <label>Species</label>
          <select value={species} onChange={(e) => setSpecies(e.target.value)}>
            <option value="">Select species...</option>
            {COMMON_SPECIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Weight & Length */}
        <div className="form-row">
          <div className="form-group">
            <label>Weight (lbs)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="e.g. 4.5"
            />
          </div>
          <div className="form-group">
            <label>Length (in)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              placeholder="e.g. 18"
            />
          </div>
        </div>

        {/* Lure/Bait */}
        <div className="form-group">
          <label>Lure / Bait</label>
          <input
            type="text"
            value={lure}
            onChange={(e) => setLure(e.target.value)}
            placeholder="e.g. White swimbait, live shad"
          />
        </div>

        {/* Notes */}
        <div className="form-group">
          <label>Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Diving birds nearby, fish on a flat near river channel"
          />
        </div>

        {error && (
          <div style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          className="btn btn-accent"
          disabled={submitting || !location}
          style={{ width: '100%' }}
        >
          {submitting ? 'Saving...' : 'Save Catch'}
        </button>
      </form>
    </div>
  );
}
