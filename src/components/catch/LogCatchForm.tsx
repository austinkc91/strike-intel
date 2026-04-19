import { useState, useRef, useEffect, useCallback } from 'react';
import { extractExifData } from '../../services/exif';
import type { Catch, CatchFormData, GeoPoint } from '../../types';

const SPECIES_LIST = [
  'Striped Bass', 'Largemouth Bass', 'Crappie', 'Smallmouth Bass',
  'Walleye', 'Channel Catfish', 'Bluegill', 'Northern Pike',
  'Trout', 'Perch', 'Carp', 'Other',
];

const WEIGHT_LIST = [
  '', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5',
  '5.5', '6', '7', '8', '9', '10', '12', '14', '16', '18', '20', '25', '30', '40', '50',
];

const SHORT_NAMES: Record<string, string> = {
  'Striped Bass': 'Striper', 'Largemouth Bass': 'LM Bass',
  'Smallmouth Bass': 'SM Bass', 'Channel Catfish': 'Catfish', 'Northern Pike': 'Pike',
};

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;

// ============================================================
// Scroll Wheel
// ============================================================

function ScrollWheel({ items, selectedIndex, onSelect, renderItem }: {
  items: string[]; selectedIndex: number;
  onSelect: (index: number) => void;
  renderItem: (item: string) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(false);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = selectedIndex * ITEM_HEIGHT;
      requestAnimationFrame(() => {
        if (ref.current) ref.current.scrollTop = selectedIndex * ITEM_HEIGHT;
        setTimeout(() => { mounted.current = true; }, 200);
      });
    }
  }, []);

  useEffect(() => {
    if (!mounted.current || !ref.current) return;
    ref.current.scrollTo({ top: selectedIndex * ITEM_HEIGHT, behavior: 'smooth' });
  }, [selectedIndex]);

  const handleScroll = useCallback(() => {
    if (!mounted.current) return;
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => {
      if (!ref.current) return;
      const idx = Math.max(0, Math.min(items.length - 1, Math.round(ref.current.scrollTop / ITEM_HEIGHT)));
      ref.current.scrollTo({ top: idx * ITEM_HEIGHT, behavior: 'smooth' });
      onSelect(idx);
    }, 120);
  }, [items.length, onSelect]);

  const padTop = Math.floor(VISIBLE_ITEMS / 2) * ITEM_HEIGHT;

  return (
    <div style={{ position: 'relative', height: VISIBLE_ITEMS * ITEM_HEIGHT, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: padTop, left: 0, right: 0, height: ITEM_HEIGHT, background: 'rgba(79,195,247,0.1)', borderTop: '1px solid rgba(79,195,247,0.25)', borderBottom: '1px solid rgba(79,195,247,0.25)', pointerEvents: 'none', zIndex: 1 }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: padTop, background: 'linear-gradient(to bottom, rgba(8,20,34,0.95), transparent)', pointerEvents: 'none', zIndex: 2 }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: padTop, background: 'linear-gradient(to top, rgba(8,20,34,0.95), transparent)', pointerEvents: 'none', zIndex: 2 }} />
      <div ref={ref} onScroll={handleScroll} style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
        <div style={{ height: padTop }} />
        {items.map((item, i) => (
          <div key={i} onClick={() => { onSelect(i); if (ref.current) ref.current.scrollTo({ top: i * ITEM_HEIGHT, behavior: 'smooth' }); }}
            style={{ height: ITEM_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: i === selectedIndex ? 18 : 15, fontWeight: i === selectedIndex ? 700 : 400, color: i === selectedIndex ? '#fff' : 'rgba(255,255,255,0.35)', cursor: 'pointer' }}>
            {renderItem(item)}
          </div>
        ))}
        <div style={{ height: padTop }} />
      </div>
    </div>
  );
}

// ============================================================
// Main Form
// ============================================================

interface LogCatchFormProps {
  initialLocation: GeoPoint | null;
  initialTimestamp: Date | null;
  editCatch?: Catch | null;
  onSubmit: (data: CatchFormData) => Promise<void>;
  onCancel: () => void;
  onLocationChange?: (loc: GeoPoint) => void;
}

export function LogCatchForm({ initialLocation, initialTimestamp, editCatch, onSubmit, onCancel, onLocationChange }: LogCatchFormProps) {
  const [location, setLocation] = useState<GeoPoint | null>(editCatch?.location ?? initialLocation);
  const [timestamp, setTimestamp] = useState<Date>(editCatch?.timestamp?.toDate?.() ?? initialTimestamp ?? new Date());
  const [speciesIdx, setSpeciesIdx] = useState(() => {
    if (editCatch?.species) { const i = SPECIES_LIST.indexOf(editCatch.species); return i >= 0 ? i : 0; }
    return 0;
  });
  const [weightIdx, setWeightIdx] = useState(() => {
    if (editCatch?.weight_lbs) { const i = WEIGHT_LIST.indexOf(editCatch.weight_lbs.toString()); return i >= 0 ? i : 7; }
    return 7;
  });
  const [lure, setLure] = useState(editCatch?.lure ?? '');
  const [notes, setNotes] = useState(editCatch?.notes ?? '');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoSource] = useState<'camera' | 'import' | null>(null);
  const [showMore, setShowMore] = useState(!!editCatch?.lure || !!editCatch?.notes);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoFile = async (file: File) => {
    try {
      setPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
      setPhotoStatus('Reading photo data...');

      const exif = await extractExifData(file);

      const parts: string[] = [];
      if (exif.location) {
        const lat = Number(exif.location.latitude);
        const lng = Number(exif.location.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const loc = { latitude: lat, longitude: lng };
          setLocation(loc);
          onLocationChange?.(loc);
          parts.push(`Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        } else {
          parts.push(`Bad GPS values: lat=${String(exif.location.latitude)} lng=${String(exif.location.longitude)}`);
        }
      }
      if (exif.timestamp instanceof Date && !isNaN(exif.timestamp.getTime())) {
        setTimestamp(exif.timestamp);
        parts.push(`Time: ${exif.timestamp.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`);
      }

      if (parts.length > 0) {
        setPhotoStatus(`${parts.join(' \u00B7 ')}\n[debug] ${exif.debug}`);
      } else {
        setPhotoStatus(`No GPS or date found in photo\n[debug] ${exif.debug}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      console.error('[LogCatchForm] handlePhotoFile crashed:', err);
      setPhotoStatus(`ERROR processing photo:\n${msg}`);
    }
  };

  const handleSubmit = async () => {
    if (!location) { setError('Tap the map or upload a photo with GPS.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        location, timestamp, species: SPECIES_LIST[speciesIdx],
        weight_lbs: WEIGHT_LIST[weightIdx] || '', length_in: '',
        lure, notes, photo, photoSource,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10, color: '#fff', fontSize: 14,
  };

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      background: 'rgba(8, 20, 34, 0.97)', backdropFilter: 'blur(20px)',
      borderRadius: '20px 20px 0 0', padding: '12px 16px 24px', zIndex: 60,
      maxHeight: '85vh', overflowY: 'auto',
    }}>
      <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '0 auto 10px' }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>
          {editCatch ? 'Edit Catch' : 'Log Catch'}
        </span>
        <button onClick={onCancel} style={{ background: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: '4px 8px' }}>
          Cancel
        </button>
      </div>

      {/* Photo upload — PRIMARY action */}
      <div style={{ marginBottom: 12 }}>
        {!photo ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: '100%', padding: '14px',
              background: 'linear-gradient(135deg, rgba(79,195,247,0.12), rgba(79,195,247,0.06))',
              border: '1.5px dashed rgba(79,195,247,0.35)',
              borderRadius: 12, color: 'rgba(79,195,247,0.9)',
              fontSize: 14, fontWeight: 500,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              cursor: 'pointer',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            Upload Photo — auto-fills location & time
          </button>
        ) : (
          <div style={{
            display: 'flex', gap: 10, alignItems: 'center',
            padding: '8px 10px',
            background: 'rgba(76,175,80,0.08)',
            border: '1px solid rgba(76,175,80,0.2)',
            borderRadius: 10,
          }}>
            {photoPreview && (
              <img src={photoPreview} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: '#4caf50', fontWeight: 500 }}>Photo added</div>
              {photoStatus && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2, whiteSpace: 'pre-line' }}>{photoStatus}</div>
              )}
            </div>
            <button
              onClick={() => { setPhoto(null); setPhotoPreview(null); setPhotoStatus(null); }}
              style={{ background: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 16, padding: '0 4px' }}
            >
              &times;
            </button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoFile(f); e.target.value = ''; }}
        />
      </div>

      {/* Date & Time — render the local-calendar date, not toISOString()
          (which serialises to UTC and rolled the day forward for evening
          timestamps, making the picker show the wrong day). */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input type="date"
          value={`${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')}`}
          onChange={(e) => { const [y, m, d] = e.target.value.split('-').map(Number); const n = new Date(timestamp); n.setFullYear(y, m - 1, d); setTimestamp(n); }}
          style={{ ...inputStyle, flex: 1, colorScheme: 'dark' }} />
        <input type="time" value={`${String(timestamp.getHours()).padStart(2, '0')}:${String(timestamp.getMinutes()).padStart(2, '0')}`}
          onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); const n = new Date(timestamp); n.setHours(h, m); setTimestamp(n); }}
          style={{ ...inputStyle, flex: 1, colorScheme: 'dark' }} />
      </div>

      {/* Species + Weight wheels */}
      <div style={{
        display: 'flex', gap: 1, marginBottom: 12,
        background: 'rgba(255,255,255,0.03)', borderRadius: 14, overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ flex: 2 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '8px 0 2px' }}>Species</div>
          <ScrollWheel items={SPECIES_LIST} selectedIndex={speciesIdx} onSelect={setSpeciesIdx}
            renderItem={(item) => SHORT_NAMES[item] ?? item} />
        </div>
        <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '8px 0 2px' }}>Weight</div>
          <ScrollWheel items={WEIGHT_LIST} selectedIndex={weightIdx} onSelect={setWeightIdx}
            renderItem={(item) => item ? `${item} lbs` : '\u2014'} />
        </div>
      </div>

      {/* Lure & Notes — always visible, compact */}
      {!showMore ? (
        <button onClick={() => setShowMore(true)}
          style={{ width: '100%', padding: '8px', marginBottom: 12, background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
          + Add lure or notes
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <input type="text" value={lure} onChange={(e) => setLure(e.target.value)} placeholder="Lure or bait" style={inputStyle} />
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" style={{ ...inputStyle, resize: 'none' }} />
        </div>
      )}

      {error && <div style={{ color: '#f44336', fontSize: 12, marginBottom: 8 }}>{error}</div>}

      {/* Save */}
      <button onClick={handleSubmit} disabled={submitting || !location}
        style={{
          width: '100%', padding: '16px', borderRadius: 14,
          fontSize: 16, fontWeight: 700,
          background: submitting ? 'rgba(102,187,106,0.3)' : 'linear-gradient(135deg, #66bb6a, #43a047)',
          color: '#fff', border: 'none', cursor: submitting ? 'wait' : 'pointer',
          boxShadow: '0 4px 12px rgba(102,187,106,0.3)',
        }}>
        {submitting ? 'Saving...' : `Save ${SPECIES_LIST[speciesIdx]}`}
      </button>
    </div>
  );
}
