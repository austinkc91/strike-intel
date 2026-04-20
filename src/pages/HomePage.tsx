import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { getMoonPhase, moonPhaseEmoji } from '../services/moonPhase';
import { getSolunarWindows, isInFeedingWindow } from '../services/solunar';
import { getDayInfo, hoursOfDay } from '../services/astronomy';
import {
  fetchWeatherForCatch,
  fetchPressureHistory,
  type PressureHistory,
} from '../services/weather';
import { SolunarArc } from '../components/weather/SolunarArc';
import { PressureSparkline } from '../components/weather/PressureSparkline';
import { WeekForecast } from '../components/weather/WeekForecast';
import { ConditionsStrip } from '../components/weather/ConditionsStrip';
import { LakeStateCard } from '../components/weather/LakeStateCard';
import { Logo } from '../components/common/Logo';
import { SpeciesPills } from '../components/common/SpeciesPills';
import { HourlyScoreChart } from '../components/trip/HourlyScoreChart';
import { fetchCurrentWaterTempNear } from '../services/waterTemp';
import { fetchLakeStateTexoma, type LakeStateSnapshot } from '../services/lakeState';
import { computeWeeklyForecast, type ForecastDay } from '../services/forecast';
import { computeHourlyScores, findBestWindows, type HourScore } from '../services/hourlyScores';
import { scoreFishingDay, SPECIES_LABELS } from '../services/fishScoring';
import { LAKE_TEXOMA as LAKE } from '../data/lakes';
import type { CatchWeather } from '../types';

// ============================================================
// Time-of-day sky gradient
// ============================================================

function skyGradient(hour: number, accent: string): string {
  // Anchor colors at dawn / midday / dusk / night, blend smoothly
  if (hour < 5 || hour >= 21) {
    // Deep night
    return `radial-gradient(ellipse 90% 70% at 50% 0%, #142850 0%, transparent 70%),
            radial-gradient(ellipse 100% 60% at 100% 100%, ${accent}10 0%, transparent 60%),
            linear-gradient(180deg, #0a1828 0%, #060d17 100%)`;
  }
  if (hour < 7) {
    // Dawn — coral / amber
    return `radial-gradient(ellipse 90% 60% at 50% -10%, rgba(251,113,133,0.22) 0%, transparent 70%),
            radial-gradient(ellipse 80% 60% at 30% 5%, rgba(251,191,36,0.18) 0%, transparent 70%),
            linear-gradient(180deg, #1a1c2e 0%, #060d17 100%)`;
  }
  if (hour < 17) {
    // Day — clean blue
    return `radial-gradient(ellipse 100% 70% at 50% 0%, ${accent}24 0%, transparent 70%),
            radial-gradient(ellipse 100% 80% at 100% 100%, rgba(94,184,230,0.10) 0%, transparent 60%),
            linear-gradient(180deg, #0a1c30 0%, #060d17 100%)`;
  }
  if (hour < 19) {
    // Dusk — amber / violet
    return `radial-gradient(ellipse 90% 60% at 50% -10%, rgba(251,146,60,0.22) 0%, transparent 70%),
            radial-gradient(ellipse 80% 60% at 70% 5%, rgba(168,85,247,0.16) 0%, transparent 70%),
            linear-gradient(180deg, #1c1830 0%, #060d17 100%)`;
  }
  // Twilight
  return `radial-gradient(ellipse 90% 60% at 50% -10%, rgba(99,102,241,0.20) 0%, transparent 70%),
          linear-gradient(180deg, #0e1530 0%, #060d17 100%)`;
}

// ============================================================
// Activity ring
// ============================================================

function ActivityRing({ score, color }: { score: number; color: string }) {
  const size = 220;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.95" />
            <stop offset="100%" stopColor={color} stopOpacity="0.55" />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 0.9s cubic-bezier(0.32, 0.72, 0, 1)',
            filter: `drop-shadow(0 0 12px ${color}80)`,
          }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 76,
          fontWeight: 700,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          color,
          textShadow: `0 0 32px ${color}50`,
        }}>
          {score}
        </div>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.18em',
          color: 'var(--color-text-muted)',
          marginTop: 4,
          textTransform: 'uppercase',
        }}>
          right now
        </div>
      </div>
    </div>
  );
}

function formatPeakHour(h: number): string {
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

// ============================================================
// HomePage
// ============================================================

export function HomePage() {
  const navigate = useNavigate();
  const { setSelectedLake, setMapCenter, setMapZoom, selectedSpecies, setSelectedSpecies } = useAppStore();
  const species = selectedSpecies;
  const setSpecies = setSelectedSpecies;
  const [weather, setWeather] = useState<CatchWeather | null>(null);
  const [waterTempF, setWaterTempF] = useState<number | null>(null);
  const [pressureHistory, setPressureHistory] = useState<PressureHistory | null>(null);
  const [weekForecast, setWeekForecast] = useState<ForecastDay[]>([]);
  const [todayHourly, setTodayHourly] = useState<HourScore[]>([]);
  const [lakeState, setLakeState] = useState<LakeStateSnapshot | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const now = useMemo(() => new Date(), []);
  const hour = now.getHours();
  const moon = useMemo(() => getMoonPhase(now), []);
  const solunar = useMemo(
    () => getSolunarWindows(now, LAKE.center.latitude, LAKE.center.longitude),
    [],
  );
  const dayInfo = useMemo(
    () => getDayInfo(now, LAKE.center.latitude, LAKE.center.longitude),
    [],
  );
  const feedingStatus = useMemo(() => isInFeedingWindow(now, solunar.windows), [solunar]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const w = await fetchWeatherForCatch(LAKE.center.latitude, LAKE.center.longitude, now);
        const m = getMoonPhase(now);
        if (cancelled) return;
        setWeather({ ...w, moon_phase: m.phase, water_temp_f: null } as CatchWeather);
      } catch {
        /* ignore */
      }
    })();

    (async () => {
      try {
        const wt = await fetchCurrentWaterTempNear(LAKE.center.latitude, LAKE.center.longitude, LAKE.usgsStationId);
        if (cancelled || !wt) return;
        setWaterTempF(wt.temp_f);
      } catch {
        /* ignore */
      }
    })();

    fetchPressureHistory(LAKE.center.latitude, LAKE.center.longitude)
      .then((h) => { if (!cancelled) setPressureHistory(h); })
      .catch(() => {});

    fetchLakeStateTexoma()
      .then((s) => { if (!cancelled && s) setLakeState(s); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []);

  // 7-day forecast recomputes when species changes or water temp arrives,
  // since both feed into the per-day score.
  useEffect(() => {
    let cancelled = false;
    computeWeeklyForecast(LAKE.center.latitude, LAKE.center.longitude, species, waterTempF)
      .then((days) => { if (!cancelled) setWeekForecast(days); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [species, waterTempF]);

  // Today's hourly score curve so the user can see when the day peaks without
  // having to open the trip planner. Reuses the cached Open-Meteo hourly fetch
  // shared with the weekly forecast — no extra network.
  useEffect(() => {
    let cancelled = false;
    computeHourlyScores(LAKE.center.latitude, LAKE.center.longitude, species, now, waterTempF)
      .then((hours) => { if (!cancelled) setTodayHourly(hours); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [species, waterTempF, now]);

  // Merge live water temp into the weather payload the scoring engine reads.
  const weatherWithWater = useMemo<CatchWeather | null>(
    () => weather ? { ...weather, water_temp_f: waterTempF } : null,
    [weather, waterTempF],
  );

  // Today's peak from the 7-day outlook — used to reconcile the "right now"
  // hero score with the day's best window so users don't see a 35 next to a 99
  // and assume the app is broken.
  const todayPeak = useMemo(() => {
    if (weekForecast.length === 0) return null;
    const today = weekForecast.find((d) => isSameDay(d.date, now));
    return today ?? weekForecast[0];
  }, [weekForecast, now]);

  const result = useMemo(() => scoreFishingDay({
    species,
    weather: weatherWithWater,
    pressureTrendRate: pressureHistory?.trendRate,
    solunarRating: solunar.rating,
    inFeedingWindow: feedingStatus.period,
    moonIllumination: moon.illumination,
    now,
    sunriseHour: hoursOfDay(dayInfo.sunrise),
    sunsetHour: hoursOfDay(dayInfo.sunset),
  }), [species, weatherWithWater, pressureHistory, solunar.rating, feedingStatus.period, moon.illumination, dayInfo]);

  const handleGoToMap = () => {
    // Lake is already pre-selected in the store on app load; just recentre
    // the map (in case the user moved it) and navigate.
    setSelectedLake(LAKE);
    setMapCenter([LAKE.center.longitude, LAKE.center.latitude]);
    setMapZoom(12);
    navigate('/map');
  };

  return (
    <div className="page page-top hide-scrollbar" style={{ padding: 0 }}>
      {/* ===== HERO ===== */}
      <div style={{
        position: 'relative',
        padding: '20px 16px 28px',
        overflow: 'hidden',
        background: skyGradient(hour, result.color),
      }}>
        {/* Subtle shimmer */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0, opacity: 0.5, pointerEvents: 'none',
          backgroundImage: `repeating-linear-gradient(
            115deg, transparent 0px, transparent 2px,
            rgba(255,255,255,0.012) 2px, rgba(255,255,255,0.012) 4px
          )`,
        }} />

        {/* Logo hero */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginBottom: 4, marginTop: 4 }}>
          <Logo size={150} />
          <div style={{ position: 'absolute', top: 0, right: 0, textAlign: 'right' }}>
            <div style={{ fontSize: 26, lineHeight: 1 }}>{moonPhaseEmoji(moon.phase)}</div>
            <div className="meta" style={{ marginTop: 2 }}>{moon.phase}</div>
          </div>
        </div>

        {/* Lake context line */}
        <div style={{ position: 'relative', marginTop: 8, marginBottom: 18, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {LAKE.name}
          </div>
          <div className="meta" style={{ marginTop: 2 }}>
            {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>

        {/* Activity ring centerpiece */}
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0 18px' }}>
          <ActivityRing score={result.score} color={result.color} />
          <div style={{
            marginTop: 14,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: result.color,
            textShadow: `0 0 16px ${result.color}55`,
          }}>
            {result.label} for {SPECIES_LABELS[species].toLowerCase()}
          </div>
          {todayPeak && todayPeak.score > result.score + 8 && (
            <div className="meta" style={{ marginTop: 6, fontSize: 12 }}>
              Peaks at <span style={{ color: todayPeak.color, fontWeight: 700 }}>{todayPeak.score}</span> around{' '}
              <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{formatPeakHour(todayPeak.peakHour)}</span>
            </div>
          )}
        </div>

        {/* Species toggle */}
        <div style={{ position: 'relative' }}>
          <SpeciesPills species={species} onChange={setSpecies} accentColor={result.color} />
        </div>

        {/* Today's hourly outlook — at-a-glance "when is the bite on today" */}
        {todayHourly.length > 0 && (
          <div style={{ position: 'relative', marginTop: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 6, color: 'var(--color-text-subtle)' }}>
              Today by the hour
            </div>
            <HourlyScoreChart
              hours={todayHourly}
              bestWindows={findBestWindows(todayHourly, 3)}
            />
          </div>
        )}

        {/* Feeding window pill / breakdown toggle */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <div>
            {feedingStatus.period !== 'none' ? (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 11px', borderRadius: 999,
                background: 'rgba(74,222,128,0.12)',
                border: '1px solid rgba(74,222,128,0.3)',
                fontSize: 11, fontWeight: 700, color: 'var(--color-good)',
                letterSpacing: '0.06em',
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--color-good)',
                  boxShadow: '0 0 0 3px rgba(74,222,128,0.25)',
                }} />
                {feedingStatus.period.toUpperCase()} WINDOW NOW
              </div>
            ) : feedingStatus.minutesToWindow < 180 ? (
              <div className="meta">
                Next window in <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>{feedingStatus.minutesToWindow}m</span>
              </div>
            ) : (
              <div className="meta">No major window for several hours</div>
            )}
          </div>
          <button
            onClick={() => setBreakdownOpen(!breakdownOpen)}
            style={{
              padding: '5px 11px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--color-text-muted)',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--color-border-strong)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            Why
            <span style={{ fontSize: 9, transition: 'transform 0.2s', display: 'inline-block', transform: breakdownOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
          </button>
        </div>
      </div>

      {/* ===== CONTENT ===== */}
      <div style={{ padding: '0 16px 96px' }}>

        {/* Score breakdown */}
        {breakdownOpen && (
          <div className="card section" style={{ marginTop: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Score breakdown</div>
            <div className="meta" style={{ marginBottom: 12 }}>
              Centered at 50 = neutral day. Each factor shifts the score in points.
            </div>
            <div className="stack stack-gap-2">
              {result.factors.map((f) => (
                <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--color-text)' }}>{f.label}</div>
                  <div style={{
                    fontSize: 13,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontWeight: 700,
                    color: f.tone === 'positive' ? 'var(--color-good)' : f.tone === 'negative' ? 'var(--color-danger)' : 'var(--color-text-muted)',
                  }}>
                    {f.delta >= 0 ? '+' : ''}{f.delta.toFixed(1)}
                  </div>
                </div>
              ))}
              <div className="divider" />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Final score</div>
                <div style={{
                  fontSize: 14,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontWeight: 700,
                  color: result.color,
                }}>
                  50 {result.factors.reduce((s, f) => s + f.delta, 0) >= 0 ? '+ ' : '− '}
                  {Math.abs(result.factors.reduce((s, f) => s + f.delta, 0)).toFixed(1)} = {result.score}
                </div>
              </div>
              {result.hasHazard && (
                <div className="meta" style={{ fontSize: 11, marginTop: 4, color: 'var(--color-warn)' }}>
                  Capped at 55 due to active hazard.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Conditions strip */}
        {weather ? (
          <div className="card section" style={{ marginTop: 16 }}>
            <ConditionsStrip weather={weather} waterTempF={waterTempF} />
          </div>
        ) : (
          <div className="card section" style={{ marginTop: 16 }}>
            <div className="meta">Loading conditions…</div>
          </div>
        )}

        {/* Pressure sparkline */}
        {pressureHistory && (
          <div className="card section">
            <PressureSparkline history={pressureHistory} />
          </div>
        )}

        {/* Lake state — USACE elevation + dam release */}
        <LakeStateCard state={lakeState} loading={lakeState === null} />

        {/* 7-day forecast */}
        {weekForecast.length > 0 && (
          <div className="section">
            <div className="section-header">
              <div className="eyebrow">7-day outlook · {SPECIES_LABELS[species]}</div>
            </div>
            <WeekForecast days={weekForecast} />
          </div>
        )}

        {/* Solunar arc */}
        <div className="section">
          <div className="section-header">
            <div className="eyebrow">Today's Solunar</div>
            <div className="meta">
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} style={{ color: i < solunar.rating ? '#fbbf24' : 'rgba(255,255,255,0.18)' }}>★</span>
              ))}
            </div>
          </div>
          <div className="card">
            <SolunarArc
              windows={solunar.windows}
              currentTime={now}
              sunrise={dayInfo.sunrise}
              sunset={dayInfo.sunset}
            />
          </div>
        </div>

        {/* Briefing */}
        {result.briefing.length > 0 && (
          <div className="section">
            <div className="section-header">
              <div className="eyebrow">Briefing</div>
            </div>
            <div className="stack stack-gap-2">
              {result.briefing.map((b, i) => (
                <div key={i} className="card" style={{
                  padding: '12px 14px',
                  background: b.level === 'warn' ? 'rgba(248,113,113,0.06)' : 'var(--color-surface)',
                  borderColor: b.level === 'warn' ? 'rgba(248,113,113,0.22)' : 'var(--color-border)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{
                      width: 4, alignSelf: 'stretch',
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

        {/* Primary CTA */}
        <button className="btn btn-primary btn-lg btn-block" onClick={handleGoToMap} style={{ marginTop: 8 }}>
          Open {LAKE.name}
          <span style={{ marginLeft: 4 }}>→</span>
        </button>

        <div className="text-center" style={{ marginTop: 12 }}>
          <div className="meta">{LAKE.state} · {LAKE.area_acres.toLocaleString()} acres</div>
        </div>
      </div>
    </div>
  );
}

