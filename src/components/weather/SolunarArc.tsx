import type { SolunarWindow } from '../../services/solunar';

interface SolunarArcProps {
  windows: SolunarWindow[];
  currentTime: Date;
  sunrise?: Date;
  sunset?: Date;
}

/**
 * Compact horizontal solunar timeline. Clean, readable, ~80px tall.
 * Shows the day from 4am to 12am with the sunrise→sunset band, solunar
 * window blocks, and a "now" marker.
 */
export function SolunarArc({ windows, currentTime, sunrise, sunset }: SolunarArcProps) {
  const dayStart = sunrise ?? new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate(), 6, 30);
  const dayEnd = sunset ?? new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate(), 19, 30);

  // Visible range: 4am - midnight
  const tlStart = 4;
  const tlEnd = 24;
  const total = tlEnd - tlStart;

  const hourFrac = (d: Date) => {
    const h = d.getHours() + d.getMinutes() / 60;
    return Math.max(0, Math.min(1, (h - tlStart) / total));
  };

  const fmt = (d: Date) =>
    d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '');

  const nowF = hourFrac(currentTime);
  const sunriseF = hourFrac(dayStart);
  const sunsetF = hourFrac(dayEnd);

  return (
    <div>
      {/* Bar */}
      <div style={{
        position: 'relative',
        height: 36,
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        {/* Daylight band — subtle amber tint between sunrise and sunset */}
        <div style={{
          position: 'absolute',
          left: `${sunriseF * 100}%`,
          width: `${(sunsetF - sunriseF) * 100}%`,
          top: 0, bottom: 0,
          background: 'linear-gradient(180deg, rgba(251,191,36,0.10) 0%, rgba(251,146,60,0.06) 100%)',
        }} />

        {/* Hour gridlines */}
        {[8, 12, 16, 20].map(h => (
          <div key={h} style={{
            position: 'absolute',
            left: `${((h - tlStart) / total) * 100}%`,
            top: 0, bottom: 0,
            width: 1,
            background: 'rgba(255,255,255,0.05)',
          }} />
        ))}

        {/* Window blocks */}
        {windows.map((w, i) => {
          const startF = hourFrac(w.start);
          const endF = hourFrac(w.end);
          const width = (endF - startF) * 100;
          if (width <= 0) return null;
          const isMajor = w.type === 'major';
          return (
            <div
              key={i}
              title={`${w.label}: ${fmt(w.start)}–${fmt(w.end)}`}
              style={{
                position: 'absolute',
                left: `${startF * 100}%`,
                width: `${width}%`,
                top: isMajor ? 4 : 12,
                bottom: isMajor ? 4 : 12,
                background: isMajor
                  ? 'linear-gradient(180deg, var(--color-accent) 0%, var(--color-accent-strong) 100%)'
                  : 'rgba(94,184,230,0.45)',
                borderRadius: 4,
                boxShadow: isMajor ? '0 0 10px var(--color-accent-glow)' : 'none',
              }}
            />
          );
        })}

        {/* Sunrise / sunset notches */}
        <Notch fracX={sunriseF} />
        <Notch fracX={sunsetF} />

        {/* Now indicator */}
        <div style={{
          position: 'absolute',
          left: `${nowF * 100}%`,
          top: -3, bottom: -3,
          width: 2,
          background: '#fff',
          boxShadow: '0 0 8px rgba(255,255,255,0.7)',
          transform: 'translateX(-50%)',
          zIndex: 3,
        }} />
      </div>

      {/* Hour labels */}
      <div style={{
        position: 'relative',
        marginTop: 6,
        height: 14,
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--color-text-subtle)',
        letterSpacing: '0.04em',
      }}>
        <HourLabel hour={4} tlStart={tlStart} total={total} label="4a" />
        <HourLabel hour={8} tlStart={tlStart} total={total} label="8a" />
        <HourLabel hour={12} tlStart={tlStart} total={total} label="12p" />
        <HourLabel hour={16} tlStart={tlStart} total={total} label="4p" />
        <HourLabel hour={20} tlStart={tlStart} total={total} label="8p" />
        <HourLabel hour={24} tlStart={tlStart} total={total} label="12a" />
      </div>

      {/* Status row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 11, color: 'var(--color-text-muted)' }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <Legend dot={<span style={{ width: 14, height: 4, borderRadius: 2, background: 'linear-gradient(180deg, var(--color-accent) 0%, var(--color-accent-strong) 100%)', display: 'inline-block' }} />} label="Major" />
          <Legend dot={<span style={{ width: 14, height: 3, borderRadius: 2, background: 'rgba(94,184,230,0.55)', display: 'inline-block' }} />} label="Minor" />
        </div>
        <div style={{ color: 'var(--color-text)' }}>
          <span style={{ color: 'var(--color-text-subtle)' }}>now</span>{' '}
          <span style={{ fontWeight: 700 }}>{fmt(currentTime)}</span>
        </div>
      </div>

      {/* Sunrise / sunset chips */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--color-text-muted)' }}>
        <div>↑ {fmt(dayStart)}</div>
        <div>↓ {fmt(dayEnd)}</div>
      </div>
    </div>
  );
}

function Notch({ fracX }: { fracX: number }) {
  return (
    <div style={{
      position: 'absolute',
      left: `${fracX * 100}%`,
      top: 0, bottom: 0,
      width: 1,
      background: 'rgba(251,191,36,0.6)',
      transform: 'translateX(-50%)',
    }} />
  );
}

function HourLabel({ hour, tlStart, total, label }: { hour: number; tlStart: number; total: number; label: string }) {
  const left = ((hour - tlStart) / total) * 100;
  const isEdge = hour === tlStart || hour === tlStart + total;
  return (
    <span style={{
      position: 'absolute',
      left: `${left}%`,
      transform: isEdge && hour === tlStart ? 'none' : isEdge ? 'translateX(-100%)' : 'translateX(-50%)',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function Legend({ dot, label }: { dot: React.ReactNode; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {dot}
      {label}
    </div>
  );
}
