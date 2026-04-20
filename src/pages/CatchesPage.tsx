import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { useCatches } from '../hooks/useCatches';
import { moonPhaseEmoji, getMoonPhase } from '../services/moonPhase';
import { fetchWeatherForCatch, windDirectionToCompass, conditionLabel, pressureTrendSymbol } from '../services/weather';
import { matchConditions, type ConditionsMatch } from '../services/conditionsMatcher';
import { CatchStatsView } from '../components/catch/CatchStatsView';
import type { Catch, CatchWeather } from '../types';

type SortMode = 'recent' | 'best-today' | 'stats';

interface CatchFilters {
  species: string[];           // empty = all species
  fromDate: Date | null;       // inclusive lower bound
  toDate: Date | null;         // inclusive upper bound (date only — extended to end of day)
  minWeightLbs: number | null; // inclusive
  maxWeightLbs: number | null; // inclusive
}

const EMPTY_FILTERS: CatchFilters = {
  species: [],
  fromDate: null,
  toDate: null,
  minWeightLbs: null,
  maxWeightLbs: null,
};

function activeFilterCount(f: CatchFilters): number {
  let n = 0;
  if (f.species.length > 0) n++;
  if (f.fromDate || f.toDate) n++;
  if (f.minWeightLbs != null || f.maxWeightLbs != null) n++;
  return n;
}

function passesFilters(c: Catch, f: CatchFilters): boolean {
  if (f.species.length > 0 && (!c.species || !f.species.includes(c.species))) return false;

  const ts = c.timestamp?.toDate?.();
  if (f.fromDate) {
    if (!ts || ts.getTime() < f.fromDate.getTime()) return false;
  }
  if (f.toDate) {
    // Treat the upper bound as end-of-day (inclusive).
    const eod = new Date(f.toDate);
    eod.setHours(23, 59, 59, 999);
    if (!ts || ts.getTime() > eod.getTime()) return false;
  }

  const w = c.weight_lbs;
  if (f.minWeightLbs != null) {
    if (w == null || w < f.minWeightLbs) return false;
  }
  if (f.maxWeightLbs != null) {
    if (w == null || w > f.maxWeightLbs) return false;
  }
  return true;
}

export function CatchesPage() {
  const navigate = useNavigate();
  const { selectedLake, setPendingPatternCatchId, setPendingEditCatchId } = useAppStore();
  const { catches, loading, removeCatch } = useCatches(selectedLake?.id || null);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [currentWeather, setCurrentWeather] = useState<CatchWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [actionSheetCatch, setActionSheetCatch] = useState<Catch | null>(null);
  const [filters, setFilters] = useState<CatchFilters>(EMPTY_FILTERS);
  const [showFilterSheet, setShowFilterSheet] = useState(false);

  const filteredCatches = useMemo(
    () => catches.filter((c) => passesFilters(c, filters)),
    [catches, filters],
  );

  // Species options derived from the user's catches — only show what exists.
  const availableSpecies = useMemo(() => {
    const set = new Set<string>();
    for (const c of catches) if (c.species) set.add(c.species);
    return Array.from(set).sort();
  }, [catches]);

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

  const handleEdit = (c: Catch) => {
    const { setMapCenter, setMapZoom } = useAppStore.getState();
    setMapCenter([c.location.longitude, c.location.latitude]);
    setMapZoom(15);
    setPendingEditCatchId(c.id);
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
    for (const c of filteredCatches) {
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
  }, [filteredCatches, currentWeather, sortMode, currentMoon.illumination]);

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
    : filteredCatches.map(c => ({ catch_: c, match: null as ConditionsMatch | null }));

  const filterCount = activeFilterCount(filters);

  return (
    <div className="page page-top">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div className="eyebrow">{selectedLake.name}</div>
          <h1 className="display" style={{ marginTop: 2 }}>Catches</h1>
          <div className="meta" style={{ marginTop: 4 }}>
            {filterCount > 0
              ? `${filteredCatches.length} of ${catches.length} shown`
              : `${catches.length} logged`}
          </div>
        </div>

        {catches.length > 0 && (
          <button
            onClick={() => setShowFilterSheet(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: filterCount > 0 ? '#041322' : 'var(--color-text)',
              background: filterCount > 0 ? 'var(--color-accent)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${filterCount > 0 ? 'var(--color-accent)' : 'var(--color-border-strong)'}`,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            Filter
            {filterCount > 0 && (
              <span style={{
                minWidth: 16, height: 16, borderRadius: 8,
                padding: '0 5px',
                background: 'rgba(4,19,34,0.25)',
                color: '#041322',
                fontSize: 10,
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>{filterCount}</span>
            )}
          </button>
        )}
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
          <button
            className={sortMode === 'stats' ? 'active' : ''}
            onClick={() => setSortMode('stats')}
          >
            Stats
          </button>
        </div>
      )}

      {/* Stats mode renders the analytics view in place of the catch list.
          Stats use the full catches set (filters apply to list/best-today
          modes only) so totals don't change as the user toggles filters. */}
      {sortMode === 'stats' && <CatchStatsView catches={catches} />}

      {filterCount > 0 && sortMode !== 'stats' && (
        <ActiveFilterChips
          filters={filters}
          onRemove={(patch) => setFilters((f) => ({ ...f, ...patch }))}
          onClearAll={() => setFilters(EMPTY_FILTERS)}
        />
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

      {!loading && catches.length > 0 && filteredCatches.length === 0 && sortMode !== 'stats' && (
        <div className="empty-state">
          <div className="empty-state-icon">🔎</div>
          <div className="subheading">No catches match these filters</div>
          <div className="meta" style={{ marginBottom: 12 }}>
            Loosen them up or clear all and try again.
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => setFilters(EMPTY_FILTERS)}
          >
            Clear filters
          </button>
        </div>
      )}

      {sortMode !== 'stats' && (
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
      )}

      {actionSheetCatch && (
        <CatchActionSheet
          catch_={actionSheetCatch}
          onClose={() => setActionSheetCatch(null)}
          onFindSimilar={handleFindSimilar}
          onViewOnMap={handleViewOnMap}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      {showFilterSheet && (
        <CatchFiltersSheet
          filters={filters}
          availableSpecies={availableSpecies}
          onChange={setFilters}
          onClose={() => setShowFilterSheet(false)}
          onClearAll={() => setFilters(EMPTY_FILTERS)}
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
  onEdit,
  onDelete,
}: {
  catch_: Catch;
  onClose: () => void;
  onFindSimilar: (c: Catch) => void;
  onViewOnMap: (c: Catch) => void;
  onEdit: (c: Catch) => void;
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
          <button className="btn btn-secondary btn-block" onClick={() => onEdit(c)}>
            <Icon name="edit" /> Edit Catch
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

function Icon({ name }: { name: 'target' | 'map' | 'edit' | 'trash' }) {
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
  if (name === 'edit') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
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

// ============================================================
// Active filter chips — displayed under the segmented control when any
// filter is active. Tap the X on a chip to remove just that facet, or
// "Clear all" to reset.
// ============================================================

function ActiveFilterChips({
  filters,
  onRemove,
  onClearAll,
}: {
  filters: CatchFilters;
  onRemove: (patch: Partial<CatchFilters>) => void;
  onClearAll: () => void;
}) {
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];

  if (filters.species.length > 0) {
    chips.push({
      key: 'species',
      label: filters.species.length === 1
        ? filters.species[0]
        : `${filters.species.length} species`,
      clear: () => onRemove({ species: [] }),
    });
  }
  if (filters.fromDate || filters.toDate) {
    const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    let label: string;
    if (filters.fromDate && filters.toDate) label = `${fmt(filters.fromDate)} – ${fmt(filters.toDate)}`;
    else if (filters.fromDate) label = `Since ${fmt(filters.fromDate)}`;
    else label = `Until ${fmt(filters.toDate!)}`;
    chips.push({ key: 'date', label, clear: () => onRemove({ fromDate: null, toDate: null }) });
  }
  if (filters.minWeightLbs != null || filters.maxWeightLbs != null) {
    let label: string;
    if (filters.minWeightLbs != null && filters.maxWeightLbs != null) {
      label = `${filters.minWeightLbs}–${filters.maxWeightLbs} lbs`;
    } else if (filters.minWeightLbs != null) {
      label = `${filters.minWeightLbs}+ lbs`;
    } else {
      label = `≤ ${filters.maxWeightLbs} lbs`;
    }
    chips.push({ key: 'weight', label, clear: () => onRemove({ minWeightLbs: null, maxWeightLbs: null }) });
  }

  return (
    <div className="section" style={{
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap',
      alignItems: 'center',
    }}>
      {chips.map((chip) => (
        <span key={chip.key} style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '5px 6px 5px 10px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          background: 'rgba(94,184,230,0.12)',
          border: '1px solid rgba(94,184,230,0.35)',
          color: 'var(--color-accent)',
        }}>
          {chip.label}
          <button
            onClick={chip.clear}
            aria-label={`Remove ${chip.label}`}
            style={{
              width: 18, height: 18, borderRadius: 999,
              background: 'transparent', border: 'none',
              color: 'var(--color-accent)',
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              padding: 0,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </span>
      ))}
      <button
        onClick={onClearAll}
        style={{
          padding: '5px 10px',
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--color-text-muted)',
          background: 'transparent',
          border: '1px solid var(--color-border-strong)',
          cursor: 'pointer',
        }}
      >
        Clear all
      </button>
    </div>
  );
}

// ============================================================
// Filter sheet — bottom sheet for editing all filters at once. Edits
// apply live (no Apply button) since the list is right behind it.
// ============================================================

function CatchFiltersSheet({
  filters,
  availableSpecies,
  onChange,
  onClose,
  onClearAll,
}: {
  filters: CatchFilters;
  availableSpecies: string[];
  onChange: (f: CatchFilters) => void;
  onClose: () => void;
  onClearAll: () => void;
}) {
  const toggleSpecies = (s: string) => {
    const next = filters.species.includes(s)
      ? filters.species.filter((x) => x !== s)
      : [...filters.species, s];
    onChange({ ...filters, species: next });
  };

  const setDateRange = (from: Date | null, to: Date | null) => {
    onChange({ ...filters, fromDate: from, toDate: to });
  };

  const dateInputValue = (d: Date | null): string => {
    if (!d) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const parseDateInput = (s: string): Date | null => {
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  };

  const setMinWeight = (v: string) => {
    const n = v === '' ? null : parseFloat(v);
    onChange({ ...filters, minWeightLbs: Number.isFinite(n as number) ? (n as number) : null });
  };
  const setMaxWeight = (v: string) => {
    const n = v === '' ? null : parseFloat(v);
    onChange({ ...filters, maxWeightLbs: Number.isFinite(n as number) ? (n as number) : null });
  };

  // Date presets — start of day for "since X" semantics
  const startOfDayMinusDays = (n: number): Date => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const startOfYear = (): Date => {
    const d = new Date();
    d.setMonth(0, 1);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 199,
          animation: 'fadeIn 0.2s',
        }}
      />
      <div className="bottom-sheet" style={{
        maxHeight: '85vh',
        overflowY: 'auto',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
      }}>
        <div className="bottom-sheet-handle" />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div className="eyebrow">Filter</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, marginTop: 2, letterSpacing: '-0.02em' }}>
              Refine catches
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', color: 'var(--color-text-secondary)', fontSize: 14 }}
          >
            Done
          </button>
        </div>

        {/* Species */}
        <div className="section">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Species</div>
          {availableSpecies.length === 0 ? (
            <div className="meta">No species yet — log a catch first.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {availableSpecies.map((s) => {
                const active = filters.species.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleSpecies(s)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      background: active ? 'var(--color-accent)' : 'rgba(255,255,255,0.05)',
                      color: active ? '#041322' : 'var(--color-text-muted)',
                      border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border-strong)'}`,
                      cursor: 'pointer',
                    }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Date range */}
        <div className="section">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Date range</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            <PresetButton
              label="Last 7 days"
              active={
                filters.fromDate?.getTime() === startOfDayMinusDays(7).getTime() &&
                !filters.toDate
              }
              onClick={() => setDateRange(startOfDayMinusDays(7), null)}
            />
            <PresetButton
              label="Last 30 days"
              active={
                filters.fromDate?.getTime() === startOfDayMinusDays(30).getTime() &&
                !filters.toDate
              }
              onClick={() => setDateRange(startOfDayMinusDays(30), null)}
            />
            <PresetButton
              label="This year"
              active={
                filters.fromDate?.getTime() === startOfYear().getTime() &&
                !filters.toDate
              }
              onClick={() => setDateRange(startOfYear(), null)}
            />
            <PresetButton
              label="All time"
              active={!filters.fromDate && !filters.toDate}
              onClick={() => setDateRange(null, null)}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <Label>From</Label>
              <input
                type="date"
                value={dateInputValue(filters.fromDate)}
                onChange={(e) => setDateRange(parseDateInput(e.target.value), filters.toDate)}
                style={dateInputStyle}
              />
            </div>
            <div>
              <Label>To</Label>
              <input
                type="date"
                value={dateInputValue(filters.toDate)}
                onChange={(e) => setDateRange(filters.fromDate, parseDateInput(e.target.value))}
                style={dateInputStyle}
              />
            </div>
          </div>
        </div>

        {/* Weight */}
        <div className="section">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Weight (lbs)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <Label>Min</Label>
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                min="0"
                placeholder="any"
                value={filters.minWeightLbs ?? ''}
                onChange={(e) => setMinWeight(e.target.value)}
                style={dateInputStyle}
              />
            </div>
            <div>
              <Label>Max</Label>
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                min="0"
                placeholder="any"
                value={filters.maxWeightLbs ?? ''}
                onChange={(e) => setMaxWeight(e.target.value)}
                style={dateInputStyle}
              />
            </div>
          </div>
          <div className="meta" style={{ fontSize: 11, marginTop: 6 }}>
            Catches without a recorded weight are excluded when this filter is set.
          </div>
        </div>

        <div className="stack stack-gap-2" style={{ marginTop: 8 }}>
          <button className="btn btn-secondary btn-block" onClick={onClearAll}>
            Clear all filters
          </button>
          <button className="btn btn-action btn-block" onClick={onClose}>
            Show {/* count handled implicitly via the underlying list */} results
          </button>
        </div>
      </div>
    </>
  );
}

function PresetButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 11px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.02em',
        background: active ? 'var(--color-accent)' : 'rgba(255,255,255,0.05)',
        color: active ? '#041322' : 'var(--color-text-muted)',
        border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border-strong)'}`,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.1em', color: 'var(--color-text-subtle)', marginBottom: 4,
    }}>
      {children}
    </div>
  );
}

const dateInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 10,
  color: 'var(--color-text)',
  fontSize: 14,
  outline: 'none',
  colorScheme: 'dark',
};
