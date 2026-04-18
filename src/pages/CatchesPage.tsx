import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { useCatches } from '../hooks/useCatches';
import { moonPhaseEmoji, getMoonPhase } from '../services/moonPhase';
import { fetchWeatherForCatch, windDirectionToCompass, conditionLabel, pressureTrendSymbol } from '../services/weather';
import { matchConditions, type ConditionsMatch } from '../services/conditionsMatcher';
import type { Catch, CatchWeather } from '../types';

type SortMode = 'recent' | 'best-today';

export function CatchesPage() {
  const { selectedLake } = useAppStore();
  const { catches, loading } = useCatches(selectedLake?.id || null);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [currentWeather, setCurrentWeather] = useState<CatchWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  useEffect(() => {
    if (sortMode !== 'best-today' || !selectedLake || currentWeather) return;
    setWeatherLoading(true);
    const { latitude, longitude } = selectedLake.center;
    fetchWeatherForCatch(latitude, longitude, new Date())
      .then(w => {
        const moon = getMoonPhase(new Date());
        setCurrentWeather({ ...w, moon_phase: moon.phase, water_temp_f: null });
      })
      .catch(console.error)
      .finally(() => setWeatherLoading(false));
  }, [sortMode, selectedLake?.id]);

  const currentMoon = useMemo(() => getMoonPhase(new Date()), []);
  const now = useMemo(() => new Date(), []);

  const scoredCatches = useMemo(() => {
    if (!currentWeather || sortMode !== 'best-today') return null;
    const scored: { catch_: Catch; match: ConditionsMatch }[] = [];
    for (const c of catches) {
      if (!c.weather) {
        scored.push({ catch_: c, match: { score: 0, details: [] } });
        continue;
      }
      const ts = c.timestamp?.toDate?.() || new Date();
      const match = matchConditions(currentWeather, currentMoon.illumination, now, c.weather, ts);
      scored.push({ catch_: c, match });
    }
    scored.sort((a, b) => b.match.score - a.match.score);
    return scored;
  }, [catches, currentWeather, sortMode, currentMoon.illumination]);

  if (!selectedLake) {
    return (
      <div className="page page-top">
        <div className="page-header">
          <div>
            <div className="eyebrow">Log</div>
            <h1 className="display" style={{ marginTop: 2 }}>Catches</h1>
          </div>
        </div>
        <div className="empty-state">
          <div className="empty-state-icon">🗺️</div>
          <div className="subheading">No lake selected</div>
          <div className="meta">Pick a lake from the Home tab to see your catches.</div>
        </div>
      </div>
    );
  }

  const displayCatches = sortMode === 'best-today' && scoredCatches
    ? scoredCatches
    : catches.map(c => ({ catch_: c, match: null as ConditionsMatch | null }));

  return (
    <div className="page page-top">
      <div className="page-header">
        <div>
          <div className="eyebrow">{selectedLake.name}</div>
          <h1 className="display" style={{ marginTop: 2 }}>Catches</h1>
          <div className="meta" style={{ marginTop: 4 }}>
            {catches.length} logged
          </div>
        </div>
      </div>

      {catches.length > 0 && (
        <div className="segmented section">
          <button
            className={sortMode === 'recent' ? 'active' : ''}
            onClick={() => setSortMode('recent')}
          >
            All Catches
          </button>
          <button
            className={sortMode === 'best-today' ? 'active' : ''}
            onClick={() => setSortMode('best-today')}
          >
            Best for Today
          </button>
        </div>
      )}

      {sortMode === 'best-today' && currentWeather && (
        <div className="card section" style={{ background: 'var(--color-bg-raised)' }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Current conditions
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            <Stat label="Temp" value={`${Math.round(currentWeather.temp_f)}°`} />
            <Stat
              label="Wind"
              value={`${Math.round(currentWeather.wind_speed_mph)}`}
              sub={windDirectionToCompass(currentWeather.wind_direction_deg)}
            />
            <Stat
              label="Pressure"
              value={`${Math.round(currentWeather.pressure_hpa)}`}
              sub={`${pressureTrendSymbol(currentWeather.pressure_trend)} ${currentWeather.pressure_trend}`}
            />
            <Stat label="Sky" value={conditionLabel(currentWeather.condition).split(' ')[0]} sub={`${moonPhaseEmoji(currentMoon.phase)} ${currentMoon.phase}`} />
          </div>
        </div>
      )}

      {sortMode === 'best-today' && weatherLoading && (
        <div className="meta section">Fetching current conditions…</div>
      )}

      {loading && <div className="meta">Loading…</div>}

      {!loading && catches.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🎣</div>
          <div className="subheading">No catches yet</div>
          <div className="meta">Open the Map tab and tap a spot to log your first catch.</div>
        </div>
      )}

      <div className="stack stack-gap-2">
        {displayCatches.map(({ catch_: c, match }) => (
          <CatchCard
            key={c.id}
            catch_={c}
            match={match}
            sortMode={sortMode}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Catch card
// ============================================================

function CatchCard({
  catch_: c,
  match,
  sortMode,
}: {
  catch_: Catch;
  match: ConditionsMatch | null;
  sortMode: SortMode;
}) {
  const ts = c.timestamp?.toDate?.();
  const matchPct = match ? Math.round(match.score * 100) : null;

  const matchTone = matchPct == null
    ? null
    : matchPct >= 80 ? 'good'
      : matchPct >= 60 ? 'accent'
        : 'muted';

  return (
    <div className="catch-card">
      <div className="catch-card-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="catch-card-species">{c.species || 'Unknown species'}</div>
          <div className="catch-card-date" style={{ marginTop: 2 }}>
            {ts?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) || ''}
            {ts && (
              <>
                <span style={{ margin: '0 6px', color: 'var(--color-text-subtle)' }}>·</span>
                {ts.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </>
            )}
          </div>
        </div>
        {matchPct !== null && matchPct > 0 && (
          <div className={`badge badge-${matchTone}`}>
            {matchPct}% match
          </div>
        )}
      </div>

      {/* Catch details */}
      {(c.weight_lbs || c.length_in || c.lure) && (
        <div className="catch-card-details" style={{ marginTop: 8 }}>
          {c.weight_lbs && <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{c.weight_lbs} lbs</span>}
          {c.weight_lbs && c.length_in && <span style={{ color: 'var(--color-text-subtle)' }}> · </span>}
          {c.length_in && <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{c.length_in}"</span>}
          {(c.weight_lbs || c.length_in) && c.lure && <span style={{ color: 'var(--color-text-subtle)' }}> · </span>}
          {c.lure && <span>{c.lure}</span>}
        </div>
      )}

      {c.notes && (
        <div style={{
          marginTop: 8,
          padding: '8px 10px',
          background: 'var(--color-bg-raised)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 13,
          fontStyle: 'italic',
          color: 'var(--color-text-muted)',
          lineHeight: 1.5,
        }}>
          "{c.notes}"
        </div>
      )}

      {/* Match details */}
      {match && match.details.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {match.details.map((d, i) => (
            <span key={i} className="badge badge-accent">{d}</span>
          ))}
        </div>
      )}

      {/* Conditions footer */}
      {c.weather && (
        <div style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px 14px',
          fontSize: 12,
          color: 'var(--color-text-muted)',
        }}>
          <span>{Math.round(c.weather.temp_f)}°F</span>
          <span>·</span>
          <span>{windDirectionToCompass(c.weather.wind_direction_deg)} {Math.round(c.weather.wind_speed_mph)}mph</span>
          <span>·</span>
          <span>{Math.round(c.weather.pressure_hpa)}hPa {pressureTrendSymbol(c.weather.pressure_trend)}</span>
          {c.weather.moon_phase && (
            <>
              <span>·</span>
              <span>{moonPhaseEmoji(c.weather.moon_phase)} {c.weather.moon_phase}</span>
            </>
          )}
          {c.solunar && c.solunar.period !== 'none' && (
            <>
              <span>·</span>
              <span style={{ color: c.solunar.period === 'major' ? 'var(--color-good)' : 'var(--color-accent)', fontWeight: 600 }}>
                {c.solunar.period === 'major' ? 'Major feed' : 'Minor feed'}
              </span>
            </>
          )}
        </div>
      )}

      {sortMode === 'best-today' && !c.weather && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-text-subtle)', fontStyle: 'italic' }}>
          No weather data — cannot match conditions
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-text-subtle)', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text)' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sub}
        </div>
      )}
    </div>
  );
}
