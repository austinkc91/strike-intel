import { useState, useMemo, useCallback, useEffect } from 'react';
import { WeightSliders } from './WeightSliders';
import { SimilarSpotsList } from './SimilarSpotsList';
import {
  DEFAULT_WEIGHTS,
  findSimilarSpots,
  buildSignature,
  computeNormRanges,
  type PatternWeights,
  type GridCell,
  type MatchResult,
  type NormRanges,
} from '../../services/patternEngine';
import { getMoonPhase } from '../../services/moonPhase';
import type { Catch, CatchWeather } from '../../types';

interface PatternPanelProps {
  catchData: Catch;
  grid: GridCell[];
  currentWeather: CatchWeather | null;
  onResultsChange: (results: MatchResult[]) => void;
  onSpotClick: (result: MatchResult) => void;
  onClose: () => void;
}

export function PatternPanel({
  catchData,
  grid,
  currentWeather,
  onResultsChange,
  onSpotClick,
  onClose,
}: PatternPanelProps) {
  const [weights, setWeights] = useState<PatternWeights>(DEFAULT_WEIGHTS);
  const [threshold, setThreshold] = useState(0.6);
  const [showSliders, setShowSliders] = useState(false);

  const ranges: NormRanges = useMemo(() => computeNormRanges(grid), [grid]);

  const timestamp = catchData.timestamp?.toDate?.() || new Date();
  const moon = getMoonPhase(timestamp);
  const windDeg = currentWeather?.wind_direction_deg ?? catchData.weather?.wind_direction_deg ?? 0;

  const referenceSignature = useMemo(() => {
    const chars = catchData.characteristics;
    return buildSignature(
      chars?.depth_ft ?? 10,
      chars?.slope_degrees ?? 5,
      chars?.dropoffProximity ?? 500,
      chars?.channelProximity ?? 1000,
      chars?.pointProximity ?? 800,
      chars?.shorelineDistance ?? 500,
      chars?.windExposure ?? 0.5,
      timestamp,
      moon.illumination,
      ranges,
    );
  }, [catchData, ranges, timestamp, moon.illumination]);

  const results = useMemo(() => {
    if (grid.length === 0) {
      console.warn('[PatternPanel] Grid is empty - no cells to match against');
      return [];
    }
    console.log(`[PatternPanel] Running pattern match: ${grid.length} cells, threshold=${threshold}`);
    const matches = findSimilarSpots(
      referenceSignature,
      grid,
      windDeg,
      timestamp,
      moon.illumination,
      ranges,
      weights,
      threshold,
    );
    console.log(`[PatternPanel] Found ${matches.length} matches`);
    return matches;
  }, [referenceSignature, grid, windDeg, timestamp, moon.illumination, ranges, weights, threshold]);

  // Propagate results to parent via effect (not inside useMemo)
  useEffect(() => {
    onResultsChange(results);
  }, [results]);

  const handleWeightsChange = useCallback((w: PatternWeights) => {
    setWeights(w);
  }, []);

  return (
    <div className="bottom-sheet" style={{ maxHeight: '75vh' }}>
      <div className="bottom-sheet-handle" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>
          Find Similar Spots
        </h3>
        <button
          onClick={onClose}
          style={{ background: 'none', color: 'var(--color-text-secondary)', fontSize: 14 }}
        >
          Close
        </button>
      </div>

      {/* Grid status */}
      {grid.length === 0 && (
        <div style={{
          padding: 12,
          background: 'rgba(255, 167, 38, 0.1)',
          border: '1px solid var(--color-warning)',
          borderRadius: 'var(--radius)',
          fontSize: 13,
          color: 'var(--color-warning)',
          marginBottom: 12,
        }}>
          No analysis grid loaded for this lake. Pattern matching requires depth data.
          Select a lake from the Home page first.
        </div>
      )}

      {/* Reference catch summary */}
      <div style={{
        padding: '8px 12px',
        background: 'rgba(79, 195, 247, 0.1)',
        border: '1px solid var(--color-primary)',
        borderRadius: 'var(--radius)',
        fontSize: 13,
        marginBottom: 12,
      }}>
        Reference: {catchData.species || 'Catch'} at{' '}
        {catchData.location.latitude.toFixed(4)}, {catchData.location.longitude.toFixed(4)}
        <br />
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
          {timestamp.toLocaleDateString()} {timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          {currentWeather && ` | Wind: ${currentWeather.wind_direction_deg}\u00B0 ${currentWeather.wind_speed_mph}mph`}
        </span>
      </div>

      {/* Threshold slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', width: 70 }}>
          Threshold
        </label>
        <input
          type="range"
          min="0.4"
          max="0.95"
          step="0.05"
          value={threshold}
          onChange={(e) => setThreshold(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--color-primary)' }}
        />
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          {Math.round(threshold * 100)}%
        </span>
      </div>

      {/* Toggle weight sliders */}
      <button
        onClick={() => setShowSliders(!showSliders)}
        style={{
          width: '100%',
          padding: '8px 12px',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          color: 'var(--color-text-secondary)',
          fontSize: 13,
          marginBottom: 12,
          textAlign: 'left',
        }}
      >
        {showSliders ? '\u25B2' : '\u25BC'} Adjust Pattern Weights
      </button>

      {showSliders && (
        <div style={{ marginBottom: 12 }}>
          <WeightSliders weights={weights} onChange={handleWeightsChange} />
        </div>
      )}

      {/* Results count */}
      <div style={{ fontSize: 12, color: 'var(--color-accent)', marginBottom: 8 }}>
        {results.length} spots found matching {Math.round(threshold * 100)}%+ similarity
        {grid.length > 0 && ` (from ${grid.length} grid cells)`}
      </div>

      {/* Results list */}
      <SimilarSpotsList results={results} onSpotClick={onSpotClick} />
    </div>
  );
}
