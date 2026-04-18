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
import { SolunarTimeline } from '../components/weather/SolunarTimeline';
import type { CatchWeather } from '../types';

// ============================================================
// Lake data
// ============================================================

const DEMO_LAKES = [
  { id: 'lake-texoma', name: 'Lake Texoma', state: 'TX/OK', center: { latitude: 33.82, longitude: -96.57 }, area_acres: 89000 },
];

type DemoLake = (typeof DEMO_LAKES)[number];

// ============================================================
// Fishing quality scoring
// ============================================================

interface FishingQualityResult {
  label: string;
  tone: 'good' | 'great' | 'fair' | 'slow' | 'elite';
  color: string;
  warnings: string[];
  tips: string[];
}

function fishingQuality(solunarRating: number, weather?: CatchWeather | null): FishingQualityResult {
  let score = solunarRating;
  const warnings: string[] = [];
  const tips: string[] = [];

  if (weather) {
    const temp = weather.temp_f;
    const wind = weather.wind_speed_mph;
    const gusts = weather.wind_gusts_mph;

    if (weather.pressure_trend === 'falling') {
      score += 0.8;
      tips.push('Pressure falling — active pre-front bite likely.');
    } else if (weather.pressure_trend === 'rising') {
      tips.push('Pressure rising — post-front, fish may be sluggish.');
    }

    if (weather.condition === 'overcast') {
      score += 0.5;
      tips.push('Overcast — fish roam and feed more openly.');
    } else if (weather.condition === 'partly_cloudy') {
      score += 0.3;
    } else if (weather.condition === 'clear') {
      tips.push('Clear skies — fish will hold tight to structure.');
    } else if (weather.condition === 'rain') {
      score += 0.2;
      tips.push('Rain — topwater can fire, try moving baits.');
    } else if (weather.condition === 'storm') {
      score -= 2;
      warnings.push('Thunderstorms — stay off the water.');
    }

    if (temp >= 55 && temp <= 80) score += 0.3;
    else if (temp >= 45 && temp < 55) { score -= 0.2; tips.push('Cool water — slow presentations, fish deeper.'); }
    else if (temp > 80 && temp <= 95) { score -= 0.2; tips.push('Hot — fish early morning or near thermoclines.'); }
    else if (temp > 95) { score -= 0.8; warnings.push('Extreme heat — fish deep and early.'); }
    else if (temp < 45) { score -= 0.8; tips.push('Cold water — finesse tactics needed.'); }

    if (wind >= 5 && wind <= 15) { score += 0.3; tips.push('Moderate wind — breaks up the surface.'); }
    else if (wind > 15 && wind <= 25) { score -= 0.2; warnings.push(`Wind ${Math.round(wind)} mph — choppy, heavier tackle.`); }
    else if (wind > 25) { score -= 1.0; warnings.push(`Wind ${Math.round(wind)} mph — dangerous on open water.`); }

    if (gusts > 35) { score -= 0.5; warnings.push(`Gusts to ${Math.round(gusts)} mph — small boats should stay in.`); }
    if (weather.precipitation_in > 0.5) warnings.push('Heavy rain expected.');

    const month = new Date().getMonth();
    if (month >= 2 && month <= 4) score += 0.3;
    else if (month >= 8 && month <= 10) score += 0.3;
  }

  score = Math.max(0, Math.min(6, score));

  if (score >= 4.5) return { label: 'Elite', tone: 'elite', color: '#4ade80', warnings, tips };
  if (score >= 3.5) return { label: 'Great', tone: 'great', color: '#4ade80', warnings, tips };
  if (score >= 2.5) return { label: 'Good', tone: 'good', color: '#5eb8e6', warnings, tips };
  if (score >= 1.5) return { label: 'Fair', tone: 'fair', color: '#fbbf24', warnings, tips };
  return { label: 'Slow', tone: 'slow', color: '#8a9ba8', warnings, tips };
}

// ============================================================
// Component
// ============================================================

export function HomePage() {
  const navigate = useNavigate();
  const { setSelectedLake, setMapCenter, setMapZoom } = useAppStore();
  const [weather, setWeather] = useState<CatchWeather | null>(null);
  const [userLat, setUserLat] = useState<number | null>(null);

  const now = useMemo(() => new Date(), []);
  const moon = useMemo(() => getMoonPhase(now), []);
  const solunar = useMemo(() => getSolunarWindows(now, userLat ?? 32.8), [userLat]);
  const feedingStatus = useMemo(() => isInFeedingWindow(now, solunar.windows), [solunar]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLat(pos.coords.latitude),
      () => {},
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 },
    );
  }, []);

  const lake = DEMO_LAKES[0];

  useEffect(() => {
    fetchWeatherForCatch(lake.center.latitude, lake.center.longitude, now)
      .then((w) => {
        const m = getMoonPhase(now);
        setWeather({ ...w, moon_phase: m.phase, water_temp_f: null } as CatchWeather);
      })
      .catch(() => {});
  }, []);

  const quality = fishingQuality(solunar.rating, weather);

  const handleGoToMap = (l: DemoLake) => {
    setSelectedLake({
      id: l.id,
      name: l.name,
      state: l.state,
      center: l.center,
      bounds: {
        ne: { latitude: l.center.latitude + 0.1, longitude: l.center.longitude + 0.1 },
        sw: { latitude: l.center.latitude - 0.1, longitude: l.center.longitude - 0.1 },
      },
      area_acres: l.area_acres,
      max_depth_ft: null,
      bathymetrySource: null,
      bathymetryTileUrl: null,
      shorelineGeoJSON: null,
      species: [],
      usgsStationId: null,
    });
    setMapCenter([l.center.longitude, l.center.latitude]);
    setMapZoom(12);
    navigate('/map');
  };

  return (
    <div className="page page-top">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="eyebrow">Strike Intel</div>
          <h1 className="display" style={{ marginTop: 2 }}>{lake.name}</h1>
          <div className="meta" style={{ marginTop: 4 }}>
            {lake.state} · {lake.area_acres.toLocaleString()} acres
          </div>
        </div>
      </div>

      {/* Hero conditions card */}
      <div className="card-raised section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div className="eyebrow">Today</div>
            <div style={{ marginTop: 4, fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em', color: quality.color, lineHeight: 1.1 }}>
              {quality.label}
            </div>
            <div className="meta" style={{ marginTop: 2 }}>
              {now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 34, lineHeight: 1 }}>{moonPhaseEmoji(moon.phase)}</div>
            <div className="meta" style={{ marginTop: 4 }}>
              {moon.phase}
            </div>
          </div>
        </div>

        {/* Solunar rating */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div style={{ fontSize: 16, letterSpacing: 3 }}>
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} style={{ color: i < solunar.rating ? '#fbbf24' : 'rgba(255,255,255,0.12)' }}>
                {i < solunar.rating ? '★' : '☆'}
              </span>
            ))}
          </div>
          <div className="meta">Solunar</div>
        </div>

        {/* Feeding window */}
        {feedingStatus.period !== 'none' ? (
          <div className="badge badge-good" style={{ marginBottom: 14 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-good)', boxShadow: '0 0 0 3px rgba(74,222,128,0.25)' }} />
            In a {feedingStatus.period} feeding window
          </div>
        ) : feedingStatus.minutesToWindow < 120 ? (
          <div className="badge badge-accent" style={{ marginBottom: 14 }}>
            Next window in {feedingStatus.minutesToWindow} min
          </div>
        ) : null}

        {/* Weather stats */}
        {weather ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
            <Stat label="Temp" value={`${Math.round(weather.temp_f)}°`} sub={conditionLabel(weather.condition)} />
            <Stat
              label="Wind"
              value={`${Math.round(weather.wind_speed_mph)}`}
              sub={`${windDirectionToCompass(weather.wind_direction_deg)} · ${weather.wind_gusts_mph > weather.wind_speed_mph + 5 ? `g${Math.round(weather.wind_gusts_mph)}` : 'mph'}`}
            />
            <Stat
              label="Pressure"
              value={`${Math.round(weather.pressure_hpa)}`}
              sub={`${weather.pressure_trend} ${pressureTrendSymbol(weather.pressure_trend)}`}
            />
            <Stat label="Cloud" value={`${Math.round(weather.cloud_cover_pct)}%`} sub={weather.condition === 'clear' ? 'clear' : 'cover'} />
          </div>
        ) : (
          <div className="meta" style={{ paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>Loading conditions...</div>
        )}
      </div>

      {/* Warnings */}
      {quality.warnings.length > 0 && (
        <div className="section stack stack-gap-2">
          {quality.warnings.map((w, i) => (
            <div key={i} className="card" style={{ borderColor: 'rgba(248,113,113,0.25)', background: 'rgba(248,113,113,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 4, height: 28, background: 'var(--color-danger)', borderRadius: 2, flexShrink: 0 }} />
                <div style={{ fontSize: 13, color: '#fecaca', fontWeight: 500 }}>{w}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tips */}
      {quality.tips.length > 0 && (
        <div className="section">
          <div className="section-header">
            <div className="eyebrow">Today's Playbook</div>
          </div>
          <div className="stack stack-gap-2">
            {quality.tips.slice(0, 3).map((t, i) => (
              <div key={i} className="card" style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 4, height: 18, background: 'var(--color-accent)', borderRadius: 2, marginTop: 2, flexShrink: 0 }} />
                  <div style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.5 }}>{t}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Solunar timeline */}
      <div className="section">
        <div className="section-header">
          <div className="eyebrow">Solunar Windows</div>
        </div>
        <div className="card">
          <SolunarTimeline windows={solunar.windows} rating={solunar.rating} currentTime={now} />
        </div>
      </div>

      {/* Primary CTA */}
      <button className="btn btn-primary btn-lg btn-block" onClick={() => handleGoToMap(lake)}>
        Open {lake.name}
        <span style={{ marginLeft: 4 }}>→</span>
      </button>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-text-subtle)', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text)' }}>
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
