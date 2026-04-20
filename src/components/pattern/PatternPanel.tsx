import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { WeightSliders } from './WeightSliders';
import { SimilarSpotsList } from './SimilarSpotsList';
import {
  findSimilarSpots,
  buildSignature,
  buildCellSignature,
  computeNormRanges,
  computeDepthChangeLookup,
  findNearestCell,
  getSpeciesWeights,
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
  const speciesWeights = useMemo(() => getSpeciesWeights(catchData.species), [catchData.species]);
  const [weights, setWeights] = useState<PatternWeights>(speciesWeights);
  const [threshold, setThreshold] = useState(0.9);
  const [expanded, setExpanded] = useState(false);
  const [showSliders, setShowSliders] = useState(false);

  const ranges: NormRanges = useMemo(() => computeNormRanges(grid), [grid]);

  const timestamp = catchData.timestamp?.toDate?.() || new Date();
  const moon = getMoonPhase(timestamp);
  const windDeg = currentWeather?.wind_direction_deg ?? catchData.weather?.wind_direction_deg ?? 0;

  // Anchor the reference signature to the grid cell nearest the catch location.
  // This guarantees the reference goes through the same transforms (computed
  // wind advantage, depth-change from neighbors) as every candidate cell —
  // without this, self-comparison scores < 1.0 and the 85% threshold throws
  // out real matches. Falls back to characteristics-based signature only if
  // no grid cell is available.
  const originCell = useMemo(() => {
    if (grid.length > 0 && catchData.location) {
      return findNearestCell(grid, catchData.location.latitude, catchData.location.longitude);
    }
    return null;
  }, [grid, catchData.location]);

  const referenceSignature = useMemo(() => {
    if (originCell) {
      const depthChangeLookup = computeDepthChangeLookup(grid);
      return buildCellSignature(originCell, windDeg, timestamp, moon.illumination, ranges, depthChangeLookup);
    }
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
  }, [originCell, catchData, grid, windDeg, ranges, timestamp, moon.illumination]);

  const results = useMemo(() => {
    if (grid.length === 0) return [];
    return findSimilarSpots(
      referenceSignature,
      grid,
      windDeg,
      timestamp,
      moon.illumination,
      ranges,
      weights,
      threshold,
      {
        originCellId: originCell?.id ?? null,
        referenceTimestamp: timestamp,
      },
    );
  }, [referenceSignature, originCell, grid, windDeg, timestamp, moon.illumination, ranges, weights, threshold]);

  // Propagate results to parent — use ref to avoid infinite loops
  const prevResultsKey = useRef('');
  useEffect(() => {
    const key = `${results.length}_${results[0]?.score ?? 0}_${threshold}`;
    if (key !== prevResultsKey.current) {
      prevResultsKey.current = key;
      onResultsChange(results);
    }
  }, [results, threshold]);

  const handleWeightsChange = useCallback((w: PatternWeights) => {
    setWeights(w);
  }, []);

  const topScore = results[0]?.score ?? 0;

  // Compact bar (default) — shows summary, map stays visible
  if (!expanded) {
    return (
      <div style={{
        position: 'absolute',
        bottom: 70,
        left: 8,
        right: 8,
        background: 'rgba(10, 25, 41, 0.92)',
        backdropFilter: 'blur(12px)',
        borderRadius: 12,
        padding: '10px 14px',
        zIndex: 50,
        border: '1px solid var(--color-border)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ flex: 1 }} onClick={() => setExpanded(true)}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
              {results.length} Similar Spots Found
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
              {catchData.species || 'Catch'} pattern
              {topScore > 0 && ` · Top match: ${Math.round(topScore * 100)}%`}
              {' · Tap to expand'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Quick threshold adjustment */}
            <select
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                color: 'var(--color-text)',
                fontSize: 11,
                padding: '4px 6px',
              }}
            >
              <option value="0.95">95%+</option>
              <option value="0.9">90%+</option>
              <option value="0.85">85%+</option>
              <option value="0.8">80%+</option>
              <option value="0.75">75%+</option>
              <option value="0.7">70%+</option>
            </select>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                color: 'var(--color-text-secondary)',
                fontSize: 18,
                padding: '0 4px',
                lineHeight: 1,
              }}
            >
              &times;
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Expanded view — scrollable panel over bottom portion of map
  return (
    <div style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      maxHeight: '55vh',
      background: 'rgba(10, 25, 41, 0.95)',
      backdropFilter: 'blur(12px)',
      borderRadius: '16px 16px 0 0',
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column',
      border: '1px solid var(--color-border)',
      borderBottom: 'none',
    }}>
      {/* Handle + header */}
      <div style={{ padding: '8px 14px 0' }}>
        <div
          onClick={() => setExpanded(false)}
          style={{
            width: 36, height: 4, borderRadius: 2,
            background: 'var(--color-border)', margin: '0 auto 10px',
            cursor: 'pointer',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>
            Similar Spots — {catchData.species || 'Catch'}
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', color: 'var(--color-text-secondary)', fontSize: 13 }}
          >
            Close
          </button>
        </div>

        {/* Threshold */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', width: 60 }}>Threshold</label>
          <input
            type="range" min="0.5" max="0.95" step="0.05"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--color-primary)' }}
          />
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', width: 30 }}>
            {Math.round(threshold * 100)}%
          </span>
        </div>

        {/* Weight sliders toggle */}
        <button
          onClick={() => setShowSliders(!showSliders)}
          style={{
            width: '100%', padding: '6px 10px',
            background: 'var(--color-bg)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)', color: 'var(--color-text-secondary)',
            fontSize: 12, marginBottom: 8, textAlign: 'left',
          }}
        >
          {showSliders ? '\u25B2' : '\u25BC'} Pattern Weights
        </button>

        {showSliders && (
          <div style={{ marginBottom: 8 }}>
            <WeightSliders weights={weights} onChange={handleWeightsChange} />
          </div>
        )}

        <div style={{ fontSize: 11, color: 'var(--color-accent)', marginBottom: 6 }}>
          {results.length} spots at {Math.round(threshold * 100)}%+ match
        </div>
      </div>

      {/* Scrollable results */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 80px' }}>
        <SimilarSpotsList results={results} onSpotClick={onSpotClick} />
      </div>
    </div>
  );
}
