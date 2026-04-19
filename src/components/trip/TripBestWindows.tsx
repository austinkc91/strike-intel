import type { BestWindow, HourScore } from '../../services/hourlyScores';

interface TripBestWindowsProps {
  windows: BestWindow[];
  hours: HourScore[];
  onWindowClick?: (peakHour: number) => void;
}

/**
 * 1–3 cards summarising the day's best fishing windows: time range, avg
 * score chip in the score color, top briefing line. Tap a card to focus
 * the chart on that window's peak hour.
 */
export function TripBestWindows({ windows, hours, onWindowClick }: TripBestWindowsProps) {
  if (windows.length === 0) {
    return (
      <div style={{
        padding: '14px 12px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        fontSize: 13,
        color: 'var(--color-text-muted)',
      }}>
        No standout windows today — conditions are flat. Pick a different day or
        look for the chart's peak hour.
      </div>
    );
  }

  // Pull a color from the bar that matches each window's peak hour
  const colorAt = (hour: number) =>
    hours.find((h) => h.hour === hour)?.color ?? 'var(--color-accent)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {windows.map((w, i) => {
        const c = colorAt(w.peakHour);
        return (
          <button
            key={i}
            onClick={() => onWindowClick?.(w.peakHour)}
            style={{
              textAlign: 'left',
              padding: '10px 12px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderLeft: `3px solid ${c}`,
              borderRadius: 'var(--radius)',
              color: 'var(--color-text)',
              cursor: onWindowClick ? 'pointer' : 'default',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {formatRange(w.startHour, w.endHour)}
              </div>
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: c,
              }}>
                {w.avgScore} avg
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: w.topBriefing ? 4 : 0 }}>
              Peak ~{formatHour(w.peakHour)}
            </div>
            {w.topBriefing && (
              <div style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--color-text)' }}>
                {w.topBriefing}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function formatHour(h: number): string {
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

function formatRange(start: number, end: number): string {
  return `${formatHour(start)} – ${formatHour(end + 1)}`;
}
