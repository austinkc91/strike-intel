import { useEffect, useMemo, useState } from 'react';
import { computeWeeklyForecast, type ForecastDay } from '../../services/forecast';
import { computeHourlyScores, findBestWindows, type HourScore } from '../../services/hourlyScores';
import { fetchCurrentWaterTempNear } from '../../services/waterTemp';
import { getDayInfo } from '../../services/astronomy';
import { getSolunarWindows } from '../../services/solunar';
import { SPECIES_LABELS } from '../../services/fishScoring';
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

  // Step 3 — recompute spot recommendations whenever the day, focused hour,
  // species, catches, or grid changes.
  useEffect(() => {
    if (!selectedDay || grid.length === 0 || !focusedHourData || !dayInfo) {
      setResults([]);
      onResultsChange([]);
      return;
    }
    const useCatchSig = catches.length > 0;
    const refSig = useCatchSig
      ? signatureFromCatch(catches[0], selectedDay, dayInfo.moonIllumination, ranges)
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

    console.log('[TripPlan] signature path:', useCatchSig ? 'catch-based' : 'default', { species });

    const matches = findSimilarSpots(
      refSig,
      grid,
      focusedHourData.rep.wind_direction_deg,
      selectedDay,
      dayInfo.moonIllumination,
      ranges,
      getSpeciesWeights(useCatchSig ? catches[0].species : species),
      0.8,
    );
    setResults(matches);
    onResultsChange(matches);
  }, [selectedDay, focusedHourData, species, catches, grid, ranges, dayInfo, onResultsChange]);

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

      {/* Spot recommendations */}
      {results.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            {catches.length > 0 ? 'Spots like your patterns' : 'Spots for these conditions'}
          </div>
          <SimilarSpotsList results={results} onSpotClick={onSpotClick} />
          {catches.length === 0 && (
            <div className="meta" style={{ fontSize: 11, marginTop: 6 }}>
              Default {SPECIES_LABELS[species].toLowerCase()} signature for the focused hour. Log catches to personalize.
            </div>
          )}
        </div>
      )}
    </div>
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
