import type { Catch } from '../../types';
import { WeatherBadge } from '../weather/WeatherBadge';
import { SolunarTimeline } from '../weather/SolunarTimeline';
import { getSolunarWindows } from '../../services/solunar';
import { getMoonPhase, moonPhaseEmoji } from '../../services/moonPhase';

interface CatchDetailSheetProps {
  catchData: Catch;
  onClose: () => void;
  onFindSimilar: (c: Catch) => void;
}

export function CatchDetailSheet({ catchData, onClose, onFindSimilar }: CatchDetailSheetProps) {
  const timestamp = catchData.timestamp?.toDate?.() || new Date();
  const moon = getMoonPhase(timestamp);
  const solunar = getSolunarWindows(timestamp, catchData.location.latitude);

  return (
    <div className="bottom-sheet">
      <div className="bottom-sheet-handle" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 18, fontWeight: 600 }}>
          {catchData.species || 'Catch Details'}
        </h3>
        <button
          onClick={onClose}
          style={{ background: 'none', color: 'var(--color-text-secondary)', fontSize: 14 }}
        >
          Close
        </button>
      </div>

      {/* Catch info */}
      <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--color-text-secondary)' }}>
        <div>{timestamp.toLocaleDateString()} at {timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
        <div style={{ marginTop: 4 }}>
          {catchData.weight_lbs && <span>{catchData.weight_lbs} lbs</span>}
          {catchData.weight_lbs && catchData.length_in && <span> &middot; </span>}
          {catchData.length_in && <span>{catchData.length_in}"</span>}
          {catchData.lure && <span> &middot; {catchData.lure}</span>}
        </div>
        {catchData.notes && (
          <div style={{ marginTop: 4, fontStyle: 'italic' }}>{catchData.notes}</div>
        )}
      </div>

      {/* Moon phase */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
        padding: '8px 12px',
        background: 'var(--color-bg)',
        borderRadius: 'var(--radius)',
        fontSize: 13,
      }}>
        <span style={{ fontSize: 20 }}>{moonPhaseEmoji(moon.phase)}</span>
        <div>
          <div>{moon.phase}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
            {Math.round(moon.illumination * 100)}% illumination
          </div>
        </div>
      </div>

      {/* Weather */}
      {catchData.weather ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            Weather at Catch Time
          </div>
          <WeatherBadge weather={catchData.weather} />
        </div>
      ) : (
        <div style={{
          marginBottom: 12,
          padding: 12,
          background: 'var(--color-bg)',
          borderRadius: 'var(--radius)',
          fontSize: 13,
          color: 'var(--color-text-secondary)',
          textAlign: 'center',
        }}>
          Weather data loading...
        </div>
      )}

      {/* Solunar */}
      <div style={{ marginBottom: 12 }}>
        <SolunarTimeline
          windows={solunar.windows}
          rating={solunar.rating}
          currentTime={timestamp}
        />
      </div>

      {/* Solunar status */}
      {catchData.solunar && (
        <div style={{
          padding: '8px 12px',
          background: catchData.solunar.period !== 'none'
            ? 'rgba(102, 187, 106, 0.1)'
            : 'var(--color-bg)',
          border: catchData.solunar.period !== 'none'
            ? '1px solid var(--color-accent)'
            : '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          fontSize: 13,
          marginBottom: 12,
        }}>
          {catchData.solunar.period === 'major' && (
            <span style={{ color: 'var(--color-accent)' }}>Caught during a MAJOR feeding window!</span>
          )}
          {catchData.solunar.period === 'minor' && (
            <span style={{ color: 'var(--color-primary)' }}>Caught during a minor feeding window</span>
          )}
          {catchData.solunar.period === 'none' && (
            <span style={{ color: 'var(--color-text-secondary)' }}>
              {catchData.solunar.minutesToWindow} min from nearest feeding window
            </span>
          )}
        </div>
      )}

      {/* Find Similar Spots button */}
      <button
        className="btn btn-accent"
        style={{ width: '100%' }}
        onClick={() => onFindSimilar(catchData)}
      >
        Find Similar Spots
      </button>
    </div>
  );
}
