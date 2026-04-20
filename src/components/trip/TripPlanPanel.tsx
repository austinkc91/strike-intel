import { useEffect, useMemo, useState } from 'react';
import { computeWeeklyForecast, type ForecastDay } from '../../services/forecast';
import { computeHourlyScores, findBestWindows, type HourScore } from '../../services/hourlyScores';
import { fetchCurrentWaterTempNear } from '../../services/waterTemp';
import { getDayInfo } from '../../services/astronomy';
import { getSolunarWindows } from '../../services/solunar';
import { SPECIES_LABELS } from '../../services/fishScoring';
import { matchConditions, type ConditionsMatch } from '../../services/conditionsMatcher';
import {
  windDirectionToCompass,
  pressureTrendSymbol,
} from '../../services/weather';
import { moonPhaseEmoji } from '../../services/moonPhase';
import {
  buildSignature,
  computeNormRanges,
  defaultSignatureFor,
  findSimilarSpots,
  getSpeciesWeights,
  type GridCell,
  type MatchResult,
} from '../../services/patternEngine';
import { useAppStore } from '../../store';
import { SpeciesPills } from '../common/SpeciesPills';
import { WeekForecast } from '../weather/WeekForecast';
import { SolunarArc } from '../weather/SolunarArc';
import { ConditionsStrip } from '../weather/ConditionsStrip';
import { HourlyScoreChart } from './HourlyScoreChart';
import { TripBestWindows } from './TripBestWindows';
import { SimilarSpotsList } from '../pattern/SimilarSpotsList';
import type { Catch, GeoPoint } from '../../types';

interface TripPlanPanelProps {
  lakeCenter: GeoPoint;
  lakeUsgsStationId?: string | null;
  catches: Catch[];
  grid: GridCell[];
  onResultsChange: (results: MatchResult[]) => void;
  onSpotClick: (result: MatchResult) => void;
  onClose: () => void;
}

export function TripPlanPanel({
  lakeCenter,
  lakeUsgsStationId,
  catches,
  grid,
  onResultsChange,
  onSpotClick,
  onClose,
}: TripPlanPanelProps) {
  const { selectedSpecies, setSelectedSpecies } = useAppStore();
  const species = selectedSpecies;

  const [weeklyForecast, setWeeklyForecast] = useState<ForecastDay[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [hourly, setHourly] = useState<HourScore[]>([]);
  const [focusedHour, setFocusedHour] = useState<number | null>(null);
  const [waterTempF, setWaterTempF] = useState<number | null>(null);
  const [hourlyLoading, setHourlyLoading] = useState(false);
  const [results, setResults] = useState<MatchResult[]>([]);
  // null = auto-pick best match. Otherwise locked to a specific catch.
  const [selectedPatternCatchId, setSelectedPatternCatchId] = useState<string | null>(null);
  const [showAllMatches, setShowAllMatches] = useState(false);

  const ranges = useMemo(() => computeNormRanges(grid), [grid]);

  // Step 1 — load the week's forecast + water temp in parallel. Recomputes
  // when species changes (forecast scoring depends on it).
  useEffect(() => {
    let cancelled = false;
    computeWeeklyForecast(lakeCenter.latitude, lakeCenter.longitude, species, waterTempF)
      .then((days) => {
        if (cancelled) return;
        setWeeklyForecast(days);
        // Default selection: the highest-scoring upcoming day. Only set if
        // the user hasn't explicitly picked one yet.
        if (days.length > 0 && !selectedDay) {
          const upcoming = days.filter((d) => d.date.getTime() >= startOfToday().getTime());
          const pool = upcoming.length > 0 ? upcoming : days;
          const best = pool.reduce((b, d) => (d.score > b.score ? d : b), pool[0]);
          setSelectedDay(best.date);
        }
      })
      .catch((err) => console.error('[TripPlan] weekly forecast failed:', err));
    return () => { cancelled = true; };
  }, [species, lakeCenter.latitude, lakeCenter.longitude, waterTempF]);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentWaterTempNear(lakeCenter.latitude, lakeCenter.longitude, lakeUsgsStationId)
      .then((wt) => {
        if (cancelled || !wt) return;
        setWaterTempF(wt.temp_f);
      })
      .catch(() => { /* USGS optional */ });
    return () => { cancelled = true; };
  }, [lakeCenter.latitude, lakeCenter.longitude]);

  // Step 2 — when the selected day changes, fetch hourly scores for it.
  useEffect(() => {
    if (!selectedDay) return;
    let cancelled = false;
    setHourlyLoading(true);
    computeHourlyScores(lakeCenter.latitude, lakeCenter.longitude, species, selectedDay, waterTempF)
      .then((hours) => {
        if (cancelled) return;
        setHourly(hours);
        if (hours.length > 0) {
          const peak = hours.reduce((b, h) => (h.score > b.score ? h : b), hours[0]);
          setFocusedHour(peak.hour);
        }
      })
      .catch((err) => console.error('[TripPlan] hourly scores failed:', err))
      .finally(() => { if (!cancelled) setHourlyLoading(false); });
    return () => { cancelled = true; };
  }, [selectedDay, species, waterTempF, lakeCenter.latitude, lakeCenter.longitude]);

  const bestWindows = useMemo(() => findBestWindows(hourly, 3), [hourly]);

  const focusedHourData = useMemo(() => {
    if (focusedHour == null) return null;
    return hourly.find((h) => h.hour === focusedHour) ?? null;
  }, [hourly, focusedHour]);

  const dayInfo = useMemo(() => {
    if (!selectedDay) return null;
    return getDayInfo(selectedDay, lakeCenter.latitude, lakeCenter.longitude);
  }, [selectedDay, lakeCenter.latitude, lakeCenter.longitude]);

  const solunar = useMemo(() => {
    if (!selectedDay) return null;
    return getSolunarWindows(selectedDay, lakeCenter.latitude, lakeCenter.longitude);
  }, [selectedDay, lakeCenter.latitude, lakeCenter.longitude]);

  // Score every past catch against the focused hour's conditions. Catches
  // logged on days that *felt* like the planned day are the best basis for
  // pattern recommendations — better than just "most recent."
  const matchedCatches = useMemo<Array<{ catch_: Catch; match: ConditionsMatch }>>(() => {
    if (!focusedHourData || !dayInfo || catches.length === 0) return [];
    const scored = catches.map((c) => {
      if (!c.weather) {
        return { catch_: c, match: { score: 0, details: [] } as ConditionsMatch };
      }
      const ts = c.timestamp?.toDate?.() ?? new Date();
      const match = matchConditions(
        focusedHourData.rep,
        dayInfo.moonIllumination,
        focusedHourData.date,
        c.weather,
        ts,
      );
      return { catch_: c, match };
    });
    scored.sort((a, b) => b.match.score - a.match.score);
    return scored;
  }, [catches, focusedHourData, dayInfo]);

  // Catch whose pattern drives the spot recommendations. User can override
  // by tapping one in the picker; otherwise we use the top match.
  const patternCatch = useMemo<Catch | null>(() => {
    if (selectedPatternCatchId) {
      return catches.find((c) => c.id === selectedPatternCatchId) ?? null;
    }
    return matchedCatches[0]?.catch_ ?? null;
  }, [selectedPatternCatchId, catches, matchedCatches]);

  // Reset the pattern lock if the chosen catch is no longer in the list (e.g.
  // it was deleted or filtered out).
  useEffect(() => {
    if (selectedPatternCatchId && !catches.find((c) => c.id === selectedPatternCatchId)) {
      setSelectedPatternCatchId(null);
    }
  }, [catches, selectedPatternCatchId]);

  // Step 3 — recompute spot recommendations whenever the day, focused hour,
  // species, the picked pattern catch, or grid changes.
  useEffect(() => {
    if (!selectedDay || grid.length === 0 || !focusedHourData || !dayInfo) {
      setResults([]);
      onResultsChange([]);
      return;
    }
    const refSig = patternCatch
      ? signatureFromCatch(patternCatch, selectedDay, dayInfo.moonIllumination, ranges)
      : defaultSignatureFor(
          species,
          {
            airTempF: focusedHourData.rep.temp_f,
            waterTempF: focusedHourData.rep.water_temp_f,
            windSpeedMph: focusedHourData.rep.wind_speed_mph,
            cloudCoverPct: focusedHourData.rep.cloud_cover_pct,
          },
          selectedDay,
          dayInfo.moonIllumination,
          ranges,
        );

    const matches = findSimilarSpots(
      refSig,
      grid,
      focusedHourData.rep.wind_direction_deg,
      selectedDay,
      dayInfo.moonIllumination,
      ranges,
      getSpeciesWeights(patternCatch?.species ?? species),
      0.8,
    );
    setResults(matches);
    onResultsChange(matches);
  }, [selectedDay, focusedHourData, species, patternCatch, grid, ranges, dayInfo, onResultsChange]);

  const briefing = focusedHourData?.briefing ?? [];
  const hazard = focusedHourData?.hasHazard ?? false;

  return (
    <div className="bottom-sheet" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
      <div className="bottom-sheet-handle" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>Plan a Trip</h3>
          <div className="meta" style={{ marginTop: 2 }}>
            {selectedDay
              ? selectedDay.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
              : 'Pick a day'}
            {focusedHourData && ` · focused on ${formatHour(focusedHourData.hour)}`}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', color: 'var(--color-text-secondary)', fontSize: 14 }}
        >
          Close
        </button>
      </div>

      {/* Species */}
      <div style={{ marginBottom: 14 }}>
        <SpeciesPills
          species={species}
          onChange={setSelectedSpecies}
          accentColor={focusedHourData?.color}
        />
      </div>

      {/* Multi-day picker */}
      {weeklyForecast.length > 0 ? (
        <div style={{ marginBottom: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            7-day outlook · {SPECIES_LABELS[species]}
          </div>
          <WeekForecast
            days={weeklyForecast}
            selectedDate={selectedDay}
            onDaySelect={(d) => setSelectedDay(d)}
          />
        </div>
      ) : (
        <div className="card" style={{ padding: 12, marginBottom: 14 }}>
          <div className="meta">Loading 7-day outlook…</div>
        </div>
      )}

      {/* Solunar arc for selected day */}
      {selectedDay && dayInfo && solunar && (
        <div className="card section" style={{ marginBottom: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Solunar · {'\u2605'.repeat(solunar.rating)}{'\u2606'.repeat(5 - solunar.rating)}
          </div>
          <SolunarArc
            windows={solunar.windows}
            currentTime={focusedHourData?.date ?? selectedDay}
            sunrise={dayInfo.sunrise}
            sunset={dayInfo.sunset}
          />
        </div>
      )}

      {/* Hourly score chart */}
      {hourlyLoading ? (
        <div className="card section" style={{ marginBottom: 14 }}>
          <div className="meta">Scoring the day…</div>
        </div>
      ) : hourly.length > 0 ? (
        <div className="card section" style={{ marginBottom: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Hourly outlook · tap a bar to focus
          </div>
          <HourlyScoreChart
            hours={hourly}
            bestWindows={bestWindows}
            focusedHour={focusedHour}
            onHourFocus={setFocusedHour}
          />
        </div>
      ) : null}

      {/* Best windows */}
      {bestWindows.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Best windows</div>
          <TripBestWindows
            windows={bestWindows}
            hours={hourly}
            onWindowClick={(peakHour) => setFocusedHour(peakHour)}
          />
        </div>
      )}

      {/* Conditions strip */}
      {focusedHourData && (
        <div className="card section" style={{ marginBottom: 14 }}>
          <ConditionsStrip weather={focusedHourData.rep} />
        </div>
      )}

      {/* Briefing */}
      {briefing.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Briefing</div>
          <div className="stack stack-gap-2">
            {hazard && (
              <div className="card" style={{
                padding: '10px 12px',
                background: 'rgba(248,113,113,0.08)',
                borderColor: 'rgba(248,113,113,0.3)',
                fontSize: 12,
                color: '#fecaca',
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}>
                Hazard active — score capped
              </div>
            )}
            {briefing.map((b, i) => (
              <div key={i} className="card" style={{
                padding: '10px 12px',
                background: b.level === 'warn' ? 'rgba(248,113,113,0.06)' : 'var(--color-surface)',
                borderColor: b.level === 'warn' ? 'rgba(248,113,113,0.22)' : 'var(--color-border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{
                    width: 3, alignSelf: 'stretch',
                    background: b.level === 'warn' ? 'var(--color-danger)' : 'var(--color-accent)',
                    borderRadius: 2, flexShrink: 0,
                  }} />
                  <div style={{
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: b.level === 'warn' ? '#fecaca' : 'var(--color-text)',
                  }}>
                    {b.text}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pattern picker — past catches scored against the planned day */}
      {matchedCatches.length > 0 && focusedHourData && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <div className="eyebrow">Pattern from a similar day</div>
            {matchedCatches.length > 3 && (
              <button
                onClick={() => setShowAllMatches((v) => !v)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
                  textTransform: 'uppercase', color: 'var(--color-accent)',
                }}
              >
                {showAllMatches ? 'Show top 3' : `Show all (${matchedCatches.length})`}
              </button>
            )}
          </div>

          <div className="meta" style={{ fontSize: 11, marginBottom: 8 }}>
            Past catches ranked by how closely their conditions match {formatHour(focusedHourData.hour)} on the picked day. Tap one to drive spot picks below.
          </div>

          <div className="stack stack-gap-2">
            {(showAllMatches ? matchedCatches : matchedCatches.slice(0, 3)).map(({ catch_: c, match }) => (
              <PatternCatchCard
                key={c.id}
                catch_={c}
                match={match}
                isSelected={patternCatch?.id === c.id}
                onTap={() => setSelectedPatternCatchId(c.id === selectedPatternCatchId ? null : c.id)}
              />
            ))}
          </div>

          {selectedPatternCatchId && (
            <button
              onClick={() => setSelectedPatternCatchId(null)}
              style={{
                marginTop: 8,
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                fontSize: 11, color: 'var(--color-text-muted)',
                textDecoration: 'underline',
              }}
            >
              Reset to best auto-match
            </button>
          )}
        </div>
      )}

      {/* Spot recommendations */}
      {results.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            {patternCatch
              ? `Spots like ${patternCatch.species ?? 'this catch'}'s pattern`
              : 'Spots for these conditions'}
          </div>
          <SimilarSpotsList results={results} onSpotClick={onSpotClick} />
          {!patternCatch && (
            <div className="meta" style={{ fontSize: 11, marginTop: 6 }}>
              Default {SPECIES_LABELS[species].toLowerCase()} signature for the focused hour. Log catches to personalize.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PatternCatchCard({
  catch_: c,
  match,
  isSelected,
  onTap,
}: {
  catch_: Catch;
  match: ConditionsMatch;
  isSelected: boolean;
  onTap: () => void;
}) {
  const ts = c.timestamp?.toDate?.();
  const matchPct = Math.round(match.score * 100);
  const w = c.weather;
  const accent = isSelected ? 'var(--color-accent)' : 'var(--color-border)';

  return (
    <button
      onClick={onTap}
      style={{
        textAlign: 'left',
        padding: '10px 12px',
        background: isSelected ? 'rgba(94,184,230,0.10)' : 'var(--color-surface)',
        border: `1px solid ${accent}`,
        borderLeft: `3px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-border-strong)'}`,
        borderRadius: 'var(--radius)',
        color: 'var(--color-text)',
        cursor: 'pointer',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            {c.species ?? 'Unknown'}
            {c.weight_lbs != null && (
              <span style={{ color: 'var(--color-text-muted)', fontWeight: 500, marginLeft: 6 }}>
                · {c.weight_lbs} lbs
              </span>
            )}
          </div>
          <div className="meta" style={{ marginTop: 2, fontSize: 11 }}>
            {ts?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) ?? 'Unknown date'}
            {ts && (
              <>
                <span style={{ color: 'var(--color-text-subtle)' }}> · </span>
                {ts.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </>
            )}
          </div>
        </div>
        <div style={{
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: '-0.01em',
          color: matchPct >= 75 ? 'var(--color-good)' : matchPct >= 55 ? 'var(--color-accent)' : 'var(--color-text-muted)',
        }}>
          {matchPct}% match
        </div>
      </div>

      {w && (
        <div style={{
          marginTop: 6,
          display: 'flex',
          flexWrap: 'wrap',
          gap: '2px 10px',
          fontSize: 11,
          color: 'var(--color-text-muted)',
        }}>
          <span>{Math.round(w.temp_f)}°F</span>
          <span>·</span>
          <span>{windDirectionToCompass(w.wind_direction_deg)} {Math.round(w.wind_speed_mph)}mph</span>
          <span>·</span>
          <span>{Math.round(w.pressure_hpa)}hPa {pressureTrendSymbol(w.pressure_trend)}</span>
          {w.moon_phase && (
            <>
              <span>·</span>
              <span>{moonPhaseEmoji(w.moon_phase)}</span>
            </>
          )}
        </div>
      )}

      {match.details.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {match.details.slice(0, 3).map((d, i) => (
            <span key={i} style={{
              fontSize: 10,
              padding: '2px 7px',
              borderRadius: 999,
              background: 'rgba(94,184,230,0.10)',
              color: 'var(--color-accent)',
              fontWeight: 600,
            }}>
              {d}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatHour(h: number): string {
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

function signatureFromCatch(
  c: Catch,
  selectedDay: Date,
  moonIllumination: number,
  ranges: ReturnType<typeof computeNormRanges>,
) {
  const chars = c.characteristics;
  return buildSignature(
    chars?.depth_ft ?? 10,
    chars?.slope_degrees ?? 5,
    chars?.dropoffProximity ?? 500,
    chars?.channelProximity ?? 1000,
    chars?.pointProximity ?? 800,
    chars?.shorelineDistance ?? 500,
    chars?.windExposure ?? 0.5,
    selectedDay,
    moonIllumination,
    ranges,
  );
}
