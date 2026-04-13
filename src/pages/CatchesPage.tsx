import { useAppStore } from '../store';
import { useCatches } from '../hooks/useCatches';
import { WeatherBadge } from '../components/weather/WeatherBadge';
import { moonPhaseEmoji } from '../services/moonPhase';

export function CatchesPage() {
  const { selectedLake } = useAppStore();
  const { catches, loading } = useCatches(selectedLake?.id || null);

  if (!selectedLake) {
    return (
      <div className="page">
        <h2 className="page-header">Catches</h2>
        <div className="empty-state">
          <div className="empty-state-icon">&#127907;</div>
          <p>Select a lake from the Home page to see your catches.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h2 className="page-header">Catches - {selectedLake.name}</h2>

      {loading && <p style={{ color: 'var(--color-text-secondary)' }}>Loading...</p>}

      {!loading && catches.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">&#127907;</div>
          <p>No catches logged yet. Go to the Map and start logging!</p>
        </div>
      )}

      {catches.map((c) => {
        const ts = c.timestamp?.toDate?.();
        return (
          <div key={c.id} className="catch-card">
            <div className="catch-card-header">
              <span className="catch-card-species">{c.species || 'Unknown'}</span>
              <span className="catch-card-date">
                {ts?.toLocaleDateString() || ''}
                {ts && ` ${ts.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
              </span>
            </div>
            <div className="catch-card-details">
              {c.weight_lbs && <span>{c.weight_lbs} lbs</span>}
              {c.weight_lbs && c.length_in && <span> &middot; </span>}
              {c.length_in && <span>{c.length_in}"</span>}
              {c.lure && <span> &middot; {c.lure}</span>}
              {c.notes && (
                <p style={{ marginTop: 4, fontStyle: 'italic' }}>{c.notes}</p>
              )}
            </div>

            {/* Weather badge */}
            {c.weather && (
              <div style={{ marginTop: 8 }}>
                <WeatherBadge weather={c.weather} compact />
              </div>
            )}

            {/* Moon + Solunar */}
            {c.weather?.moon_phase && (
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {moonPhaseEmoji(c.weather.moon_phase)} {c.weather.moon_phase}
                {c.solunar && c.solunar.period !== 'none' && (
                  <span style={{ color: c.solunar.period === 'major' ? 'var(--color-accent)' : 'var(--color-primary)', marginLeft: 8 }}>
                    {c.solunar.period === 'major' ? '\u25C6 Major Feed' : '\u25C7 Minor Feed'}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
