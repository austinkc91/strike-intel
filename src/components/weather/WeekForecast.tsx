import { useState } from 'react';
import type { ForecastDay } from '../../services/forecast';

interface WeekForecastProps {
  days: ForecastDay[];
  /** When provided, the matching day chip gets a selected highlight. */
  selectedDate?: Date | null;
  /** When provided, taps go to the selector instead of toggling inline expansion. */
  onDaySelect?: (day: Date) => void;
}

/**
 * Horizontally scrollable row of 7 forecast days. Each card shows a mini
 * activity ring with the day's score. Tap to expand briefing for that day,
 * or — when `onDaySelect` is provided — to commit it as the selected day.
 */
export function WeekForecast({ days, selectedDate, onDaySelect }: WeekForecastProps) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  if (days.length === 0) return null;

  const topIdx = days.reduce((bestI, d, i) => (d.score > days[bestI].score ? i : bestI), 0);
  const selectedIdx = selectedDate
    ? days.findIndex((d) => isSameDay(d.date, selectedDate))
    : -1;

  return (
    <div>
      <div
        className="hide-scrollbar"
        style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 2px 6px' }}
      >
        {days.map((d, i) => (
          <DayChip
            key={i}
            day={d}
            isTop={i === topIdx}
            isOpen={i === openIdx}
            isSelected={i === selectedIdx}
            onTap={() => {
              if (onDaySelect) onDaySelect(d.date);
              else setOpenIdx(openIdx === i ? null : i);
            }}
          />
        ))}
      </div>

      {openIdx != null && days[openIdx] && (
        <DayBreakdown day={days[openIdx]} />
      )}
    </div>
  );
}

function DayChip({
  day, isTop, isOpen, isSelected, onTap,
}: { day: ForecastDay; isTop: boolean; isOpen: boolean; isSelected: boolean; onTap: () => void }) {
  const size = 48;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (day.score / 100) * circ;
  const isToday = isSameDay(day.date, new Date());

  const bg = isSelected
    ? 'rgba(94,184,230,0.18)'
    : isOpen
      ? 'var(--color-surface-active)'
      : isTop
        ? 'rgba(94,184,230,0.08)'
        : 'var(--color-surface)';
  const borderCol = isSelected
    ? day.color
    : isOpen
      ? 'var(--color-border-strong)'
      : isTop
        ? 'rgba(94,184,230,0.35)'
        : 'var(--color-border)';

  return (
    <button
      onClick={onTap}
      style={{
        flexShrink: 0,
        width: 66,
        padding: '10px 6px 10px',
        borderRadius: 14,
        background: bg,
        border: `${isSelected ? 1.5 : 1}px solid ${borderCol}`,
        boxShadow: isSelected ? `0 0 10px ${day.color}55` : 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        transition: 'background 0.15s, border-color 0.15s',
        cursor: 'pointer',
      }}
    >
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: isToday ? 'var(--color-accent)' : 'var(--color-text-muted)',
      }}>
        {isToday ? 'TODAY' : day.date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}
      </div>

      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
          <circle cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={day.color} strokeWidth={strokeWidth} strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            style={{ filter: isTop ? `drop-shadow(0 0 6px ${day.color}80)` : undefined }} />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em',
          color: day.color,
        }}>
          {day.score}
        </div>
      </div>

      <div style={{ fontSize: 9, color: 'var(--color-text-subtle)', letterSpacing: '0.04em' }}>
        {day.date.getDate()}
      </div>
    </button>
  );
}

function formatHour(h: number): string {
  const suffix = h >= 12 ? 'pm' : 'am';
  const mod = ((h + 11) % 12) + 1;
  return `${mod}${suffix}`;
}

function DayBreakdown({ day }: { day: ForecastDay }) {
  // Show factors sorted by absolute impact so the user sees what's actually
  // moving the score (positive or negative) before the smaller fluff.
  const sortedFactors = [...day.factors].sort(
    (a, b) => Math.abs(b.delta) - Math.abs(a.delta),
  );
  const sumDelta = day.factors.reduce((s, f) => s + f.delta, 0);

  return (
    <div className="card" style={{ marginTop: 10, padding: '12px 14px' }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>
        {day.date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em',
          color: day.color,
        }}>
          {day.score}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: day.color }}>
          {day.label}
        </div>
        <div className="meta" style={{ marginLeft: 'auto' }}>
          Peak ~{formatHour(day.peakHour)}
        </div>
      </div>

      <div className="meta" style={{ marginBottom: 10, fontSize: 11 }}>
        {Math.round(day.rep.temp_f)}°F air
        {day.rep.water_temp_f != null && ` · ${day.rep.water_temp_f}°F water`}
        {' · '}wind {Math.round(day.rep.wind_speed_mph)} mph
        {' · '}{Math.round(day.rep.cloud_cover_pct)}% cover
      </div>

      {/* Score breakdown — what's pushing the day up or down */}
      {sortedFactors.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginBottom: 6, fontSize: 10 }}>
            Why this score
          </div>
          <div className="stack stack-gap-1" style={{ marginBottom: day.briefing.length > 0 ? 12 : 0 }}>
            {sortedFactors.map((f) => (
              <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.label}
                </div>
                <div style={{
                  fontSize: 12,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontWeight: 700,
                  color: f.tone === 'positive' ? 'var(--color-good)' : f.tone === 'negative' ? 'var(--color-danger)' : 'var(--color-text-muted)',
                  flexShrink: 0,
                }}>
                  {f.delta >= 0 ? '+' : ''}{f.delta.toFixed(1)}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 6, borderTop: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Net
              </div>
              <div style={{
                fontSize: 12,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontWeight: 700,
                color: day.color,
              }}>
                50 {sumDelta >= 0 ? '+ ' : '− '}{Math.abs(sumDelta).toFixed(1)} = {day.score}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Briefing tips and warnings */}
      {day.briefing.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginBottom: 6, fontSize: 10 }}>
            Tips
          </div>
          <div className="stack stack-gap-2">
            {day.hasHazard && (
              <div style={{
                padding: '8px 10px',
                background: 'rgba(248,113,113,0.08)',
                border: '1px solid rgba(248,113,113,0.3)',
                borderRadius: 'var(--radius)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: '#fecaca',
              }}>
                Hazard active — score capped
              </div>
            )}
            {day.briefing.map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{
                  width: 3, alignSelf: 'stretch', minHeight: 18,
                  background: b.level === 'warn' ? 'var(--color-danger)' : 'var(--color-accent)',
                  borderRadius: 2, flexShrink: 0,
                }} />
                <div style={{
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: b.level === 'warn' ? '#fecaca' : 'var(--color-text)',
                }}>
                  {b.text}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
