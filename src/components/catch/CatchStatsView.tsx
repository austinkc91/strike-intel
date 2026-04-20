import { useMemo } from 'react';
import { computeCatchStats } from '../../services/catchStats';
import { moonPhaseEmoji } from '../../services/moonPhase';
import { conditionLabel, pressureTrendSymbol } from '../../services/weather';
import type { Catch, WeatherCondition, PressureTrend } from '../../types';

interface CatchStatsViewProps {
  catches: Catch[];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HOUR_LABELS = [12, 3, 6, 9, 12, 3, 6, 9].map((h, i) => `${h}${i < 4 ? 'a' : 'p'}`); // 12a, 3a, 6a, 9a, 12p, 3p, 6p, 9p

export function CatchStatsView({ catches }: CatchStatsViewProps) {
  const stats = useMemo(() => computeCatchStats(catches), [catches]);

  if (stats.total === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📊</div>
        <div className="subheading">No stats yet</div>
        <div className="meta">Log a few catches and your patterns will start showing up here.</div>
      </div>
    );
  }

  return (
    <div className="stack stack-gap-3">
      {/* Top-line totals */}
      <div className="card section">
        <div className="eyebrow" style={{ marginBottom: 10 }}>Totals</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <BigStat value={stats.total.toString()} label="Catches" />
          <BigStat value={stats.bySpecies.length.toString()} label="Species" />
          <BigStat
            value={stats.bySpecies[0]?.maxWeight_lbs?.toString() ?? '—'}
            label="Biggest (lbs)"
            sub={stats.bySpecies[0]?.species}
          />
        </div>
      </div>

      {/* Per-species */}
      <div className="section">
        <div className="eyebrow" style={{ marginBottom: 8 }}>By species</div>
        <div className="stack stack-gap-2">
          {stats.bySpecies.map((s) => {
            const conditions = stats.conditionsBySpecies.get(s.species);
            return (
              <div key={s.species} className="card" style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>
                    {s.species}
                  </div>
                  <div style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                    color: 'var(--color-text-muted)',
                  }}>
                    {s.count} {s.count === 1 ? 'catch' : 'catches'}
                  </div>
                </div>
                <div className="meta" style={{ marginTop: 4, fontSize: 12 }}>
                  {s.avgWeight_lbs != null && (<>Avg <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{s.avgWeight_lbs} lbs</span></>)}
                  {s.maxWeight_lbs != null && (<> · Max <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{s.maxWeight_lbs} lbs</span></>)}
                  {s.avgLength_in != null && (<> · Avg <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{s.avgLength_in}"</span></>)}
                </div>

                {conditions && conditions.count >= 2 && (
                  <div style={{
                    marginTop: 8, paddingTop: 8,
                    borderTop: '1px solid var(--color-border)',
                    fontSize: 12, color: 'var(--color-text-muted)',
                  }}>
                    <div className="eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>Best conditions</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
                      {conditions.avgTempF != null && <span>Air <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{Math.round(conditions.avgTempF)}°</span></span>}
                      {conditions.topWindCompass && conditions.avgWindMph != null && (
                        <span>Wind <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{conditions.topWindCompass} {Math.round(conditions.avgWindMph)}mph</span></span>
                      )}
                      {conditions.topPressureTrend && (
                        <span>Pressure <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{conditions.topPressureTrend} {pressureTrendSymbol(conditions.topPressureTrend as PressureTrend)}</span></span>
                      )}
                      {conditions.topCondition && (
                        <span><span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{conditionLabel(conditions.topCondition as WeatherCondition)}</span></span>
                      )}
                      {conditions.topMoonPhase && (
                        <span>{moonPhaseEmoji(conditions.topMoonPhase)} <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{conditions.topMoonPhase}</span></span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Hour heatmap */}
      <div className="card section">
        <div className="eyebrow" style={{ marginBottom: 10 }}>By hour</div>
        <HourHeatmap byHour={stats.byHour} />
      </div>

      {/* Month heatmap */}
      <div className="card section">
        <div className="eyebrow" style={{ marginBottom: 10 }}>By month</div>
        <MonthBars byMonth={stats.byMonth} />
      </div>

      {/* Top lures */}
      {stats.topLures.length > 0 && (
        <div className="card section">
          <div className="eyebrow" style={{ marginBottom: 10 }}>Top lures</div>
          <div className="stack stack-gap-1">
            {stats.topLures.map((l) => (
              <div key={l.lure} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '4px 0' }}>
                <div style={{ fontSize: 13, color: 'var(--color-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.lure}
                  {l.topSpecies && (
                    <span className="meta" style={{ marginLeft: 6, fontSize: 11 }}>
                      · {l.topSpecies}
                    </span>
                  )}
                </div>
                <div className="meta" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>
                  {l.count}
                  {l.avgWeight_lbs != null && <span className="meta" style={{ marginLeft: 4, fontSize: 11 }}>· {l.avgWeight_lbs}lb avg</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent activity (last 90 days) */}
      <div className="card section">
        <div className="eyebrow" style={{ marginBottom: 10 }}>Last 90 days</div>
        <ActivityCalendar activity={stats.recentActivity} />
      </div>
    </div>
  );
}

// ============================================================
// Hour-of-day heatmap — 24 vertical bars, height = catch count
// ============================================================

function HourHeatmap({ byHour }: { byHour: { hour: number; count: number }[] }) {
  const max = Math.max(1, ...byHour.map((h) => h.count));
  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 2,
        height: 80,
        padding: '0 2px',
      }}>
        {byHour.map((h) => {
          const heightPct = h.count === 0 ? 6 : Math.max(10, (h.count / max) * 100);
          return (
            <div
              key={h.hour}
              title={`${formatHour(h.hour)} · ${h.count} catch${h.count === 1 ? '' : 'es'}`}
              style={{
                flex: 1,
                height: `${heightPct}%`,
                background: h.count === 0
                  ? 'rgba(255,255,255,0.04)'
                  : `rgba(94,184,230,${Math.min(0.95, 0.25 + (h.count / max) * 0.7)})`,
                borderRadius: 3,
              }}
            />
          );
        })}
      </div>
      <div style={{
        display: 'flex',
        marginTop: 6,
        fontSize: 9,
        color: 'var(--color-text-subtle)',
        letterSpacing: '0.04em',
        fontWeight: 600,
      }}>
        {HOUR_LABELS.map((label, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center' }}>{label}</div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Month bars — 12 horizontal bars
// ============================================================

function MonthBars({ byMonth }: { byMonth: { month: number; count: number }[] }) {
  const max = Math.max(1, ...byMonth.map((m) => m.count));
  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 4,
        height: 80,
      }}>
        {byMonth.map((m) => {
          const heightPct = m.count === 0 ? 4 : Math.max(10, (m.count / max) * 100);
          return (
            <div
              key={m.month}
              title={`${MONTH_NAMES[m.month]} · ${m.count}`}
              style={{
                flex: 1,
                height: `${heightPct}%`,
                background: m.count === 0
                  ? 'rgba(255,255,255,0.04)'
                  : `rgba(74,222,128,${Math.min(0.9, 0.25 + (m.count / max) * 0.65)})`,
                borderRadius: 3,
              }}
            />
          );
        })}
      </div>
      <div style={{
        display: 'flex',
        gap: 4,
        marginTop: 6,
        fontSize: 9,
        color: 'var(--color-text-subtle)',
        letterSpacing: '0.04em',
        fontWeight: 600,
      }}>
        {MONTH_NAMES.map((m, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center' }}>{m[0]}</div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Activity calendar — 13 weeks × 7 days, GitHub-style
// ============================================================

function ActivityCalendar({ activity }: { activity: { date: Date; count: number }[] }) {
  // Group into weeks of 7. activity is 90 days descending—our last entry
  // is "today." Pad the front so weeks start on Sunday.
  const max = Math.max(1, ...activity.map((d) => d.count));
  const firstDay = activity[0]?.date.getDay() ?? 0;
  const padFront: ({ date: Date; count: number; pad: true } | null)[] = [];
  for (let i = 0; i < firstDay; i++) padFront.push(null);
  const cells: ({ date: Date; count: number; pad?: false } | { pad: true } | null)[] = [
    ...padFront,
    ...activity,
  ];
  const weeks: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
          {Array.from({ length: 7 }, (_, di) => {
            const cell = week[di];
            if (!cell || ('pad' in cell && cell.pad)) {
              return <div key={di} style={{ aspectRatio: '1 / 1', background: 'transparent' }} />;
            }
            const day = cell as { date: Date; count: number };
            const intensity = day.count === 0 ? 0 : 0.2 + (day.count / max) * 0.7;
            return (
              <div
                key={di}
                title={`${day.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${day.count} catch${day.count === 1 ? '' : 'es'}`}
                style={{
                  aspectRatio: '1 / 1',
                  background: day.count === 0
                    ? 'rgba(255,255,255,0.04)'
                    : `rgba(255,167,38,${Math.min(0.95, intensity)})`,
                  borderRadius: 2,
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function formatHour(h: number): string {
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

function BigStat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em',
        color: 'var(--color-text)', lineHeight: 1.1,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'var(--color-text-subtle)', marginTop: 4,
      }}>
        {label}
      </div>
      {sub && <div className="meta" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
