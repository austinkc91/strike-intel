import type { SolunarWindow } from '../../services/solunar';

interface SolunarTimelineProps {
  windows: SolunarWindow[];
  rating: number;
  currentTime?: Date;
}

export function SolunarTimeline({ windows, rating, currentTime }: SolunarTimelineProps) {
  // Timeline from 5am to 11pm = 18 hours
  const timelineStart = 5; // 5am
  const timelineEnd = 23; // 11pm
  const totalHours = timelineEnd - timelineStart;

  const formatTime = (d: Date) => {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const hourToPercent = (d: Date) => {
    const hours = d.getHours() + d.getMinutes() / 60;
    return ((hours - timelineStart) / totalHours) * 100;
  };

  const ratingStars = '\u2605'.repeat(rating) + '\u2606'.repeat(5 - rating);

  return (
    <div style={{
      background: 'var(--color-bg)',
      borderRadius: 'var(--radius)',
      padding: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Solunar Feeding Windows
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-warning)' }} title={`Fishing rating: ${rating}/5`}>
          {ratingStars}
        </div>
      </div>

      {/* Timeline bar */}
      <div style={{
        position: 'relative',
        height: 28,
        background: 'var(--color-surface)',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 6,
      }}>
        {/* Window blocks */}
        {windows.map((w, i) => {
          const left = Math.max(0, hourToPercent(w.start));
          const right = Math.min(100, hourToPercent(w.end));
          const width = right - left;
          if (width <= 0) return null;

          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${left}%`,
                width: `${width}%`,
                top: 0,
                bottom: 0,
                background: w.type === 'major'
                  ? 'rgba(79, 195, 247, 0.4)'
                  : 'rgba(79, 195, 247, 0.2)',
                borderLeft: `2px solid ${w.type === 'major' ? 'var(--color-primary)' : 'rgba(79, 195, 247, 0.5)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{
                fontSize: 9,
                color: 'var(--color-text)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                padding: '0 2px',
              }}>
                {w.label}
              </span>
            </div>
          );
        })}

        {/* Current time indicator */}
        {currentTime && (
          <div style={{
            position: 'absolute',
            left: `${hourToPercent(currentTime)}%`,
            top: 0,
            bottom: 0,
            width: 2,
            background: 'var(--color-danger)',
            zIndex: 2,
          }} />
        )}
      </div>

      {/* Time labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-text-secondary)' }}>
        <span>5am</span>
        <span>9am</span>
        <span>1pm</span>
        <span>5pm</span>
        <span>9pm</span>
      </div>

      {/* Window details */}
      {windows.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {windows.map((w, i) => (
            <div key={i} style={{
              fontSize: 11,
              padding: '3px 8px',
              borderRadius: 4,
              background: w.type === 'major' ? 'rgba(79, 195, 247, 0.15)' : 'rgba(79, 195, 247, 0.08)',
              border: `1px solid ${w.type === 'major' ? 'var(--color-primary)' : 'var(--color-border)'}`,
              color: 'var(--color-text-secondary)',
            }}>
              {w.type === 'major' ? '\u25C6' : '\u25C7'} {w.label}: {formatTime(w.start)}-{formatTime(w.end)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
