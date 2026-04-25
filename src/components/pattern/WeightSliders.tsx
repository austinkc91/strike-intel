import type { PatternWeights } from '../../services/patternEngine';

interface WeightSlidersProps {
  weights: PatternWeights;
  onChange: (weights: PatternWeights) => void;
}

const LABELS: Record<keyof PatternWeights, string> = {
  depth: 'Depth',
  depthChange: 'Structure Transition',
  slope: 'Bottom Slope',
  dropoffProximity: 'Drop-off Proximity',
  channelProximity: 'Channel Proximity',
  pointProximity: 'Point Proximity',
  shorelineDistance: 'Shoreline Distance',
  windExposure: 'Wind Exposure',
  windAdvantage: 'Wind Advantage',
  timeOfDay: 'Time of Day',
  season: 'Season',
  moonPhase: 'Moon Phase',
  waterTemp: 'Water Temp',
};

export function WeightSliders({ weights, onChange }: WeightSlidersProps) {
  const handleChange = (key: keyof PatternWeights, value: number) => {
    onChange({ ...weights, [key]: value });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        Pattern Weights
      </div>
      {(Object.keys(LABELS) as (keyof PatternWeights)[]).map((key) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', width: 110, flexShrink: 0 }}>
            {LABELS[key]}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={weights[key]}
            onChange={(e) => handleChange(key, parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--color-primary)' }}
          />
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', width: 24, textAlign: 'right' }}>
            {weights[key].toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  );
}
