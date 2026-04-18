import type { SolunarWindow } from '../../services/solunar';

interface SolunarTimelineProps {
  windows: SolunarWindow[];
  rating: number;
  currentTime?: Date;
}

export function SolunarTimeline({ windows, currentTime }: SolunarTimelineProps) {
  // 4am to midnight = 20 hours
  const timelineStart = 4;
  const timelineEnd = 24;
  const totalHours = timelineEnd - timelineStart;

  const hourToPercent = (d: Date) => {
    const hours = d.getHours() + d.getMinutes() / 60;
    return ((hours - timelineStart) / totalHours) * 100;
  };

  const fmt = (d: Date) =>
    d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '');

  const majorCount = windows.filter(w => w.type === 'major').length;
  const minorCount = windows.filter(w => w.type === 'minor').length;

  return (
    <div>
      {/* Bar */}
      <div style={{
        position: 'relative',
        height: 36,
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 8,
      }}>
        {/* Hour grid lines */}
        {[8, 12, 16, 20].map(h => (
          <div key={h} style={{
            position: 'absolute',
            left: `${((h - timelineStart) / totalHours) * 100}%`,
            top: 0, bottom: 0,
            width: 1,
            background: 'rgba(255,255,255,0.04)',
          }} />
        ))}

        {/* Window blocks */}
        {windows.map((w, i) => {
          const left = Math.max(0, hourToPercent(w.start));
          const right = Math.min(100, hourToPercent(w.end));
          const width = right - left;
          if (width <= 0) return null;
          const isMajor = w.type === 'major';

          return (
            <div
              key={i}
              title={`${w.label}: ${fmt(w.start)}–${fmt(w.end)}`}
              style={{
                position: 'absolute',
                left: `${left}%`,
                width: `${width}%`,
                top: isMajor ? 4 : 14,
                bottom: isMajor ? 4 : 14,
                background: isMajor
                  ? 'linear-gradient(180deg, var(--color-accent) 0%, var(--color-accent-strong) 100%)'
                  : 'rgba(94,184,230,0.45)',
                borderRadius: 4,
                boxShadow: isMajor ? '0 0 12px var(--color-accent-glow)' : 'none',
              }}
            />
          );
        })}

        {/* Now indicator */}
        {currentTime && (
          <div style={{
            position: 'absolute',
            left: `${hourToPercent(currentTime)}%`,
            top: -2, bottom: -2,
            width: 2,
            background: '#fff',
            boxShadow: '0 0 8px rgba(255,255,255,0.7)',
            zIndex: 2,
          }} />
        )}
      </div>

      {/* Hour labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-text-subtle)', fontWeight: 600, letterSpacing: '0.04em' }}>
        <span>4a</span>
        <span>8a</span>
        <span>12p</span>
        <span>4p</span>
        <span>8p</span>
        <span>12a</span>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, fontSize: 11, color: 'var(--color-text-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 6, borderRadius: 3, background: 'linear-gradient(180deg, var(--color-accent) 0%, var(--color-accent-strong) 100%)' }} />
          {majorCount} major
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 4, borderRadius: 2, background: 'rgba(94,184,230,0.45)' }} />
          {minorCount} minor
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <span style={{ width: 2, height: 12, background: '#fff' }} />
          now
        </div>
      </div>
    </div>
  );
}
