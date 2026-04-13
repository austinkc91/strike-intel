import { windDirectionToCompass } from '../../services/weather';

interface WindRoseProps {
  direction_deg: number;
  speed_mph: number;
  gusts_mph: number;
}

export function WindRose({ direction_deg, speed_mph, gusts_mph }: WindRoseProps) {
  const compass = windDirectionToCompass(direction_deg);

  return (
    <div style={{
      position: 'absolute',
      top: 12,
      left: 12,
      background: 'rgba(10, 25, 41, 0.85)',
      backdropFilter: 'blur(8px)',
      borderRadius: 'var(--radius)',
      padding: '8px 12px',
      zIndex: 10,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      border: '1px solid var(--color-border)',
    }}>
      {/* Compass with arrow */}
      <div style={{ position: 'relative', width: 40, height: 40 }}>
        <svg width="40" height="40" viewBox="0 0 40 40">
          {/* Compass circle */}
          <circle cx="20" cy="20" r="18" fill="none" stroke="var(--color-border)" strokeWidth="1" />
          {/* Cardinal marks */}
          <text x="20" y="6" textAnchor="middle" fill="var(--color-text-secondary)" fontSize="7">N</text>
          <text x="36" y="22" textAnchor="middle" fill="var(--color-text-secondary)" fontSize="7">E</text>
          <text x="20" y="38" textAnchor="middle" fill="var(--color-text-secondary)" fontSize="7">S</text>
          <text x="4" y="22" textAnchor="middle" fill="var(--color-text-secondary)" fontSize="7">W</text>
          {/* Wind direction arrow (points where wind is coming FROM) */}
          <g transform={`rotate(${direction_deg}, 20, 20)`}>
            <line x1="20" y1="8" x2="20" y2="28" stroke="var(--color-primary)" strokeWidth="2" />
            <polygon points="20,8 16,15 24,15" fill="var(--color-primary)" />
          </g>
        </svg>
      </div>

      {/* Wind info */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
          {compass} {speed_mph} mph
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
          Gusts {gusts_mph} mph
        </div>
      </div>
    </div>
  );
}
