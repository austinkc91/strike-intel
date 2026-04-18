import { windDirectionToCompass } from '../../services/weather';

interface WindRoseProps {
  direction_deg: number;
  speed_mph: number;
  gusts_mph: number;
}

export function WindRose({ direction_deg, speed_mph, gusts_mph }: WindRoseProps) {
  const compass = windDirectionToCompass(direction_deg);
  const showGusts = gusts_mph > speed_mph + 4;

  return (
    <div
      className="floating-panel"
      style={{
        position: 'absolute',
        top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        left: 12,
        padding: '10px 12px 10px 10px',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div style={{ position: 'relative', width: 38, height: 38 }}>
        <svg width="38" height="38" viewBox="0 0 38 38">
          <circle cx="19" cy="19" r="17" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          <text x="19" y="6.5" textAnchor="middle" fill="var(--color-text-subtle)" fontSize="6.5" fontWeight="600">N</text>
          <text x="33.5" y="21" textAnchor="middle" fill="var(--color-text-subtle)" fontSize="6.5" fontWeight="600">E</text>
          <text x="19" y="35.5" textAnchor="middle" fill="var(--color-text-subtle)" fontSize="6.5" fontWeight="600">S</text>
          <text x="4.5" y="21" textAnchor="middle" fill="var(--color-text-subtle)" fontSize="6.5" fontWeight="600">W</text>
          <g transform={`rotate(${direction_deg}, 19, 19)`}>
            <line x1="19" y1="8" x2="19" y2="27" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" />
            <polygon points="19,7 15.5,14 22.5,14" fill="var(--color-accent)" />
          </g>
        </svg>
      </div>

      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
          {compass} {Math.round(speed_mph)}
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-muted)', marginLeft: 3 }}>mph</span>
        </div>
        {showGusts && (
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
            Gusts {Math.round(gusts_mph)} mph
          </div>
        )}
      </div>
    </div>
  );
}
