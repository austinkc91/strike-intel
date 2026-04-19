import type { PressureHistory } from '../../services/weather';

interface PressureSparklineProps {
  history: PressureHistory;
  width?: number;
  height?: number;
}

/**
 * 24h history + 12h forecast barometric pressure, rendered as a split-color
 * sparkline. Past segment is solid, forecast segment is dashed. Colors shift
 * from green (falling, bite-positive) through neutral to red (rising).
 */
export function PressureSparkline({ history, width = 240, height = 56 }: PressureSparklineProps) {
  const { points, nowIndex, trendRate, minHpa, maxHpa } = history;
  if (points.length < 2) return null;

  // Pad the y-range so the line doesn't touch the edges
  const pad = Math.max(1, (maxHpa - minHpa) * 0.1);
  const yMin = minHpa - pad;
  const yMax = maxHpa + pad;

  const padX = 4;
  const padY = 6;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const xAt = (i: number) => padX + (i / (points.length - 1)) * innerW;
  const yAt = (hpa: number) => padY + innerH - ((hpa - yMin) / (yMax - yMin)) * innerH;

  // Split points into past and forecast
  const pastPoints = points.slice(0, nowIndex + 1);
  const forecastPoints = points.slice(nowIndex);

  const toPath = (pts: typeof points, startIdx: number) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(startIdx + i).toFixed(2)} ${yAt(p.hpa).toFixed(2)}`).join(' ');

  // Trend color: green (falling), neutral (stable), red (rising)
  const trendColor = trendRate <= -1.5 ? '#4ade80'
    : trendRate <= -0.5 ? '#a3d97a'
      : trendRate >= 1.5 ? '#f87171'
        : trendRate >= 0.5 ? '#fbbf24'
          : '#8a9ba8';

  const nowX = xAt(nowIndex);
  const nowY = yAt(points[nowIndex].hpa);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-text-subtle)' }}>
            Pressure 24h + forecast
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text)' }}>
              {Math.round(points[nowIndex].hpa)}
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-muted)', marginLeft: 3 }}>hPa</span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: trendColor }}>
              {trendRate >= 0 ? '+' : ''}{trendRate.toFixed(1)}/3h
            </div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--color-text-subtle)', textAlign: 'right', lineHeight: 1.3 }}>
          <div>{Math.round(maxHpa)}</div>
          <div>{Math.round(minHpa)}</div>
        </div>
      </div>

      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', width: '100%' }}>
        <defs>
          <linearGradient id="pressureAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={trendColor} stopOpacity="0.22" />
            <stop offset="100%" stopColor={trendColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Filled area under past line */}
        {pastPoints.length >= 2 && (
          <path
            d={`${toPath(pastPoints, 0)} L ${xAt(nowIndex).toFixed(2)} ${(padY + innerH).toFixed(2)} L ${xAt(0).toFixed(2)} ${(padY + innerH).toFixed(2)} Z`}
            fill="url(#pressureAreaGrad)"
          />
        )}

        {/* Past line */}
        <path d={toPath(pastPoints, 0)} fill="none" stroke={trendColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Forecast line (dashed) */}
        <path
          d={toPath(forecastPoints, nowIndex)}
          fill="none"
          stroke={trendColor}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeDasharray="3 3"
          opacity="0.7"
        />

        {/* Vertical "now" marker */}
        <line x1={nowX} y1={padY - 2} x2={nowX} y2={padY + innerH + 2} stroke="#fff" strokeWidth="1" opacity="0.4" />

        {/* Now dot */}
        <circle cx={nowX} cy={nowY} r="3.5" fill="#fff" />
        <circle cx={nowX} cy={nowY} r="2" fill={trendColor} />
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-text-subtle)', marginTop: 4, fontWeight: 600, letterSpacing: '0.04em' }}>
        <span>-24h</span>
        <span>now</span>
        <span>+12h</span>
      </div>
    </div>
  );
}
