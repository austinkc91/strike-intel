import { useState, useMemo } from 'react';
import { fetchForecastWeather } from '../../services/weather';
import { getMoonPhase, moonPhaseEmoji } from '../../services/moonPhase';
import { getSolunarWindows } from '../../services/solunar';
import { WeatherBadge } from '../weather/WeatherBadge';
import { SolunarTimeline } from '../weather/SolunarTimeline';
import { SimilarSpotsList } from '../pattern/SimilarSpotsList';
import {
  findSimilarSpots,
  buildSignature,
  computeNormRanges,
  DEFAULT_WEIGHTS,
  type GridCell,
  type MatchResult,
} from '../../services/patternEngine';
import type { Catch, CatchWeather, GeoPoint } from '../../types';

interface TripPlanPanelProps {
  lakeCenter: GeoPoint;
  catches: Catch[];
  grid: GridCell[];
  onResultsChange: (results: MatchResult[]) => void;
  onSpotClick: (result: MatchResult) => void;
  onClose: () => void;
}

export function TripPlanPanel({
  lakeCenter,
  catches,
  grid,
  onResultsChange,
  onSpotClick,
  onClose,
}: TripPlanPanelProps) {
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(7, 0, 0, 0);
    return d;
  });
  const [forecast, setForecast] = useState<CatchWeather | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MatchResult[]>([]);

  const ranges = useMemo(() => computeNormRanges(grid), [grid]);

  const handleGeneratePlan = async () => {
    setLoading(true);
    try {
      const weather = await fetchForecastWeather(
        lakeCenter.latitude,
        lakeCenter.longitude,
        targetDate,
      );
      const moon = getMoonPhase(targetDate);
      const fullWeather: CatchWeather = {
        ...weather,
        moon_phase: moon.phase,
        water_temp_f: null,
      };
      setForecast(fullWeather);

      // Use the best past catch as the reference signature
      // (or average of all catches if multiple exist)
      if (catches.length > 0 && grid.length > 0) {
        const refCatch = catches[0]; // Most recent catch
        const chars = refCatch.characteristics;
        const refSig = buildSignature(
          chars?.depth_ft ?? 10,
          chars?.slope_degrees ?? 5,
          chars?.dropoffProximity ?? 500,
          chars?.channelProximity ?? 1000,
          chars?.pointProximity ?? 800,
          chars?.shorelineDistance ?? 500,
          chars?.windExposure ?? 0.5,
          targetDate,
          moon.illumination,
          ranges,
        );

        const matches = findSimilarSpots(
          refSig,
          grid,
          weather.wind_direction_deg,
          targetDate,
          moon.illumination,
          ranges,
          DEFAULT_WEIGHTS,
          0.65,
        );

        setResults(matches);
        onResultsChange(matches);
      }
    } catch (err) {
      console.error('Trip plan generation failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const moon = getMoonPhase(targetDate);
  const solunar = getSolunarWindows(targetDate, lakeCenter.latitude);

  const formatDateForInput = (d: Date) => {
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  };

  // Find the best window: overlap of top spot + major feeding period
  const bestWindow = useMemo(() => {
    if (!forecast || results.length === 0 || solunar.windows.length === 0) return null;
    const majorWindows = solunar.windows.filter((w) => w.type === 'major');
    if (majorWindows.length === 0) return solunar.windows[0];
    return majorWindows[0];
  }, [forecast, results, solunar.windows]);

  return (
    <div className="bottom-sheet" style={{ maxHeight: '80vh' }}>
      <div className="bottom-sheet-handle" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>Plan a Trip</h3>
        <button
          onClick={onClose}
          style={{ background: 'none', color: 'var(--color-text-secondary)', fontSize: 14 }}
        >
          Close
        </button>
      </div>

      {/* Date picker */}
      <div className="form-group">
        <label>Target Date & Time</label>
        <input
          type="datetime-local"
          value={formatDateForInput(targetDate)}
          onChange={(e) => setTargetDate(new Date(e.target.value))}
        />
      </div>

      {/* Moon phase preview */}
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
          <div>{moon.phase} ({Math.round(moon.illumination * 100)}%)</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
            Solunar rating: {'\u2605'.repeat(solunar.rating)}{'\u2606'.repeat(5 - solunar.rating)}
          </div>
        </div>
      </div>

      {/* Solunar preview */}
      <div style={{ marginBottom: 12 }}>
        <SolunarTimeline windows={solunar.windows} rating={solunar.rating} />
      </div>

      {/* Generate button */}
      <button
        className="btn btn-accent"
        style={{ width: '100%', marginBottom: 16 }}
        onClick={handleGeneratePlan}
        disabled={loading || catches.length === 0}
      >
        {loading ? 'Generating...' : catches.length === 0 ? 'Log catches first to generate plans' : 'Generate Trip Plan'}
      </button>

      {/* Forecast weather */}
      {forecast && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            Forecasted Conditions
          </div>
          <WeatherBadge weather={forecast} />
        </div>
      )}

      {/* Best window recommendation */}
      {bestWindow && forecast && (
        <div style={{
          padding: 12,
          background: 'rgba(102, 187, 106, 0.1)',
          border: '1px solid var(--color-accent)',
          borderRadius: 'var(--radius)',
          marginBottom: 12,
          fontSize: 13,
        }}>
          <div style={{ fontWeight: 600, color: 'var(--color-accent)', marginBottom: 4 }}>
            Best Window
          </div>
          <div>
            {bestWindow.label}: {bestWindow.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            -{bestWindow.end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>
            Based on {forecast.condition} conditions with {forecast.wind_speed_mph}mph winds from the {
              ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][
                Math.round(forecast.wind_direction_deg / 22.5) % 16
              ]
            }
          </div>
        </div>
      )}

      {/* Recommended spots */}
      {results.length > 0 && (
        <SimilarSpotsList results={results} onSpotClick={onSpotClick} />
      )}
    </div>
  );
}
