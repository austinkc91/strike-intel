import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { useCatches } from '../hooks/useCatches';
import { moonPhaseEmoji, getMoonPhase } from '../services/moonPhase';
import { fetchWeatherForCatch, windDirectionToCompass, conditionLabel, pressureTrendSymbol } from '../services/weather';
import { matchConditions, type ConditionsMatch } from '../services/conditionsMatcher';
import type { Catch, CatchWeather } from '../types';

type SortMode = 'recent' | 'best-today';

export function CatchesPage() {
  const navigate = useNavigate();
  const { selectedLake, setPendingPatternCatchId } = useAppStore();
  const { catches, loading, removeCatch } = useCatches(selectedLake?.id || null);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [currentWeather, setCurrentWeather] = useState<CatchWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [actionSheetCatch, setActionSheetCatch] = useState<Catch | null>(null);

  const handleFindSimilar = (c: Catch) => {
    setPendingPatternCatchId(c.id);
    setActionSheetCatch(null);
    navigate('/map');
  };

  const handleViewOnMap = (c: Catch) => {
    const { setMapCenter, setMapZoom, setActiveCatch } = useAppStore.getState();
    setMapCenter([c.location.longitude, c.location.latitude]);
    setMapZoom(15);
    setActiveCatch(c);
    setActionSheetCatch(null);
    navigate('/map');
  };

  const handleDelete = async (c: Catch) => {
    await removeCatch(c.id);
    setActionSheetCatch(null);
  };

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
            onTap={() => setActionSheetCatch(c)}
          />
        ))}
      </div>

      {actionSheetCatch && (
        <CatchActionSheet
          catch_={actionSheetCatch}
          onClose={() => setActionSheetCatch(null)}
          onFindSimilar={handleFindSimilar}
          onViewOnMap={handleViewOnMap}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

// ============================================================
// Action sheet — opens when a tile is tapped
// ============================================================

function CatchActionSheet({
  catch_: c,
  onClose,
  onFindSimilar,
  onViewOnMap,
  onDelete,
}: {
  catch_: Catch;
  onClose: () => void;
  onFindSimilar: (c: Catch) => void;
  onViewOnMap: (c: Catch) => void;
  onDelete: (c: Catch) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ts = c.timestamp?.toDate?.();

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 199,
          animation: 'fadeIn 0.2s',
        }}
      />
      <div className="bottom-sheet" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
        <div className="bottom-sheet-handle" />

        <div style={{ marginBottom: 16 }}>
          <div className="eyebrow">{ts?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginTop: 4, letterSpacing: '-0.02em' }}>
            {c.species || 'Catch'}
          </div>
          {(c.weight_lbs || c.length_in) && (
            <div className="meta" style={{ marginTop: 4 }}>
              {c.weight_lbs && <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{c.weight_lbs} lbs</span>}
              {c.weight_lbs && c.length_in && <span> · </span>}
              {c.length_in && <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{c.length_in}"</span>}
              {c.lure && <span> · {c.lure}</span>}
            </div>
          )}
        </div>

        {/* Spot data preview */}
        {c.characteristics && (
          <div className="card" style={{ marginBottom: 16, background: 'var(--color-bg-raised)' }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Spot</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 13 }}>
              {c.characteristics.depth_ft != null && (
                <div><span className="meta">Depth</span> <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{c.characteristics.depth_ft}ft</span></div>
              )}
              {c.characteristics.slope_degrees != null && (
                <div><span className="meta">Slope</span> <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{c.characteristics.slope_degrees}°</span></div>
              )}
              {c.characteristics.nearestStructureType && (
                <div><span className="meta">Structure</span> <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{c.characteristics.nearestStructureType}</span></div>
              )}
              {c.characteristics.channelProximity != null && (
                <div><span className="meta">Channel</span> <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{c.characteristics.channelProximity}ft</span></div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="stack stack-gap-2">
          <button className="btn btn-action btn-block" onClick={() => onFindSimilar(c)}>
            <Icon name="target" /> Find Similar Spots
          </button>
          <button className="btn btn-secondary btn-block" onClick={() => onViewOnMap(c)}>
            <Icon name="map" /> View on Map
          </button>
          {!confirmDelete ? (
            <button
              className="btn btn-secondary btn-block"
              onClick={() => setConfirmDelete(true)}
              style={{ color: 'var(--color-danger)', borderColor: 'rgba(248,113,113,0.25)' }}
            >
              <Icon name="trash" /> Delete Catch
            </button>
          ) : (
            <button
              className="btn btn-danger btn-block"
              onClick={() => onDelete(c)}
            >
              Tap to confirm delete
            </button>
          )}
          <button className="btn btn-ghost btn-block" onClick={onClose} style={{ marginTop: 4 }}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

function Icon({ name }: { name: 'target' | 'map' | 'trash' }) {
  if (name === 'target') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
      </svg>
    );
  }
  if (name === 'map') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

// ============================================================
// Catch card
// ============================================================

function CatchCard({
  catch_: c,
  match,
  sortMode,
  onTap,
}: {
  catch_: Catch;
  match: ConditionsMatch | null;
  sortMode: SortMode;
  onTap: () => void;
}) {
  const ts = c.timestamp?.toDate?.();
  const matchPct = match ? Math.round(match.score * 100) : null;

  const matchTone = matchPct == null
    ? null
    : matchPct >= 80 ? 'good'
      : matchPct >= 60 ? 'accent'
        : 'muted';

  return (
    <button
      className="catch-card"
      onClick={onTap}
      style={{
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'background 0.15s, transform 0.08s',
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.997)')}
      onMouseUp={(e) => (e.currentTarget.style.transform = '')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = '')}
    >
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
    </button>
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
