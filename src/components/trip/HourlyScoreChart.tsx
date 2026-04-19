import type { HourScore, BestWindow } from '../../services/hourlyScores';

interface HourlyScoreChartProps {
  hours: HourScore[];
  bestWindows: BestWindow[];
  /** When omitted, bars render as non-interactive divs (no focus state). */
  focusedHour?: number | null;
  onHourFocus?: (hour: number) => void;
}

/**
 * Vertical bars from sunrise-1 to sunset+1, height by score, color by score
 * tier. A dot above each bar marks hours that fall inside a major (filled) or
 * minor (outlined) solunar feeding window, and a top accent strip marks hours
 * that fall inside one of the day's "best windows."
 */
export function HourlyScoreChart({
  hours,
  bestWindows,
  focusedHour,
  onHourFocus,
}: HourlyScoreChartProps) {
  if (hours.length === 0) return null;

  const maxScore = Math.max(60, ...hours.map((h) => h.score));
  const inBestWindow = (h: number) =>
    bestWindows.some((w) => h >= w.startHour && h <= w.endHour);
  const interactive = !!onHourFocus;

  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 3,
        height: 110,
        padding: '8px 4px 0',
        background: 'rgba(255,255,255,0.02)',
        borderRadius: 8,
      }}>
        {hours.map((h) => {
          const heightPct = Math.max(8, (h.score / maxScore) * 100);
          const focused = focusedHour === h.hour;
          const best = inBestWindow(h.hour);
          return (
            <button
              key={h.hour}
              onClick={interactive ? () => onHourFocus!(h.hour) : undefined}
              disabled={!interactive}
              title={`${formatHourShort(h.hour)} · ${h.score} ${h.label}`}
              style={{
                flex: 1,
                minWidth: 0,
                height: '100%',
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: interactive ? 'pointer' : 'default',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: 3,
                position: 'relative',
              }}
            >
              {/* Solunar dot */}
              <div style={{ height: 8, display: 'flex', alignItems: 'center' }}>
                {h.inFeedingWindow === 'major' ? (
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'var(--color-accent)',
                    boxShadow: '0 0 6px var(--color-accent-glow)',
                  }} />
                ) : h.inFeedingWindow === 'minor' ? (
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'transparent',
                    border: '1px solid rgba(94,184,230,0.7)',
                  }} />
                ) : null}
              </div>

              {/* Bar */}
              <div style={{
                width: '100%',
                height: `${heightPct}%`,
                background: h.color,
                opacity: focused ? 1 : 0.85,
                borderRadius: '3px 3px 1px 1px',
                boxShadow: best ? `0 -2px 0 0 ${h.color} inset, 0 0 8px ${h.color}55` : 'none',
                outline: focused ? `1.5px solid #fff` : 'none',
                outlineOffset: focused ? 1 : 0,
                transition: 'opacity 0.15s, outline 0.15s',
              }} />
            </button>
          );
        })}
      </div>

      {/* Hour axis */}
      <div style={{
        display: 'flex',
        gap: 3,
        padding: '4px 4px 0',
        fontSize: 9,
        fontWeight: 600,
        color: 'var(--color-text-subtle)',
        letterSpacing: '0.04em',
      }}>
        {hours.map((h) => (
          <div key={h.hour} style={{ flex: 1, textAlign: 'center' }}>
            {h.hour % 3 === 0 ? formatHourShort(h.hour) : ''}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        gap: 14,
        flexWrap: 'wrap',
        marginTop: 8,
        fontSize: 11,
        color: 'var(--color-text-muted)',
      }}>
        <LegendItem
          dot={<span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--color-accent)',
            display: 'inline-block',
          }} />}
          label="Major window"
        />
        <LegendItem
          dot={<span style={{
            width: 6, height: 6, borderRadius: '50%',
            border: '1px solid rgba(94,184,230,0.7)',
            display: 'inline-block',
          }} />}
          label="Minor window"
        />
        <LegendItem
          dot={<span style={{
            width: 14, height: 4, borderRadius: 2,
            background: 'var(--color-accent)',
            display: 'inline-block',
          }} />}
          label="Best window"
        />
      </div>
    </div>
  );
}

function formatHourShort(h: number): string {
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

function LegendItem({ dot, label }: { dot: React.ReactNode; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {dot}
      {label}
    </div>
  );
}
