import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { getMoonPhase, moonPhaseEmoji } from '../services/moonPhase';
import { getSolunarWindows, isInFeedingWindow } from '../services/solunar';
import {
  fetchWeatherForCatch,
  windDirectionToCompass,
  conditionLabel,
  pressureTrendSymbol,
} from '../services/weather';
import { SolunarArc } from '../components/weather/SolunarArc';
import { Logo } from '../components/common/Logo';
import { scoreFishingDay, SPECIES_LABELS, type Species } from '../services/fishScoring';
import type { CatchWeather } from '../types';

const LAKE = {
  id: 'lake-texoma',
  name: 'Lake Texoma',
  state: 'TX/OK',
  center: { latitude: 33.82, longitude: -96.57 },
  area_acres: 89000,
};

const SPECIES_LIST: Species[] = ['striper', 'largemouth', 'crappie', 'walleye', 'catfish'];

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
          out of 100
        </div>
      </div>
    </div>
  );
}

// ============================================================
// HomePage
// ============================================================

export function HomePage() {
  const navigate = useNavigate();
  const { setSelectedLake, setMapCenter, setMapZoom } = useAppStore();
  const [weather, setWeather] = useState<CatchWeather | null>(null);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [species, setSpecies] = useState<Species>('striper');

  const now = useMemo(() => new Date(), []);
  const hour = now.getHours();
  const moon = useMemo(() => getMoonPhase(now), []);
  const solunar = useMemo(() => getSolunarWindows(now, userLat ?? LAKE.center.latitude), [userLat]);
  const feedingStatus = useMemo(() => isInFeedingWindow(now, solunar.windows), [solunar]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLat(pos.coords.latitude),
      () => {},
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 },
    );
  }, []);

  useEffect(() => {
    fetchWeatherForCatch(LAKE.center.latitude, LAKE.center.longitude, now)
      .then((w) => {
        const m = getMoonPhase(now);
        setWeather({ ...w, moon_phase: m.phase, water_temp_f: null } as CatchWeather);
      })
      .catch(() => {});
  }, []);

  const result = useMemo(() => scoreFishingDay({
    species,
    weather,
    solunarRating: solunar.rating,
    inFeedingWindow: feedingStatus.period,
    moonIllumination: moon.illumination,
    now,
  }), [species, weather, solunar.rating, feedingStatus.period, moon.illumination]);

  const handleGoToMap = () => {
    setSelectedLake({
      id: LAKE.id, name: LAKE.name, state: LAKE.state, center: LAKE.center,
      bounds: {
        ne: { latitude: LAKE.center.latitude + 0.1, longitude: LAKE.center.longitude + 0.1 },
        sw: { latitude: LAKE.center.latitude - 0.1, longitude: LAKE.center.longitude - 0.1 },
      },
      area_acres: LAKE.area_acres, max_depth_ft: null, bathymetrySource: null,
      bathymetryTileUrl: null, shorelineGeoJSON: null, species: [], usgsStationId: null,
    });
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
        </div>

        {/* Species toggle */}
        <div style={{
          position: 'relative',
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 4,
        }} className="hide-scrollbar">
          {SPECIES_LIST.map((s) => (
            <button
              key={s}
              onClick={() => setSpecies(s)}
              style={{
                flexShrink: 0,
                padding: '7px 14px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '-0.005em',
                background: s === species ? result.color : 'rgba(255,255,255,0.05)',
                color: s === species ? '#041322' : 'var(--color-text-muted)',
                border: `1px solid ${s === species ? result.color : 'var(--color-border-strong)'}`,
                transition: 'all 0.15s',
              }}
            >
              {SPECIES_LABELS[s]}
            </button>
          ))}
        </div>

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'stretch' }}>
              <Stat label="Temp" value={`${Math.round(weather.temp_f)}°`} sub={conditionLabel(weather.condition)} />
              <StatDivider />
              <Stat
                label="Wind"
                value={`${Math.round(weather.wind_speed_mph)}`}
                sub={`${windDirectionToCompass(weather.wind_direction_deg)}${weather.wind_gusts_mph > weather.wind_speed_mph + 5 ? ` · g${Math.round(weather.wind_gusts_mph)}` : ' · mph'}`}
              />
              <StatDivider />
              <Stat
                label="Pressure"
                value={`${Math.round(weather.pressure_hpa)}`}
                sub={`${weather.pressure_trend} ${pressureTrendSymbol(weather.pressure_trend)}`}
              />
              <StatDivider />
              <Stat label="Cloud" value={`${Math.round(weather.cloud_cover_pct)}%`} sub="cover" />
            </div>
          </div>
        ) : (
          <div className="card section" style={{ marginTop: 16 }}>
            <div className="meta">Loading conditions…</div>
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
            <SolunarArc windows={solunar.windows} currentTime={now} />
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

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: '0 4px' }}>
      <div style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em',
        color: 'var(--color-text-subtle)', marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em',
        color: 'var(--color-text)', lineHeight: 1.1,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function StatDivider() {
  return <div style={{ width: 1, background: 'var(--color-border)', alignSelf: 'stretch' }} />;
}
