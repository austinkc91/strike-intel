import type { CatchWeather } from '../../types';
import { conditionLabel, pressureTrendSymbol, windDirectionToCompass } from '../../services/weather';

interface ConditionsStripProps {
  weather: CatchWeather;
  waterTempF?: number | null;
}

/**
 * 5-up conditions row: air, water, wind, pressure, cloud. Used on Home for
 * "now" and on the Trip Planner for the focused hour.
 */
export function ConditionsStrip({ weather, waterTempF }: ConditionsStripProps) {
  const water = waterTempF ?? weather.water_temp_f;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'stretch' }}>
      <Stat label="Air" value={`${Math.round(weather.temp_f)}°`} sub={conditionLabel(weather.condition)} />
      <Divider />
      <Stat
        label="Water"
        value={water != null ? `${water}°` : '—'}
        sub={water != null ? 'USGS' : 'no station'}
        highlight={water != null}
      />
      <Divider />
      <Stat
        label="Wind"
        value={`${Math.round(weather.wind_speed_mph)}`}
        sub={`${windDirectionToCompass(weather.wind_direction_deg)}${weather.wind_gusts_mph > weather.wind_speed_mph + 5 ? ` · g${Math.round(weather.wind_gusts_mph)}` : ' · mph'}`}
      />
      <Divider />
      <Stat
        label="Press"
        value={`${Math.round(weather.pressure_hpa)}`}
        sub={`${weather.pressure_trend} ${pressureTrendSymbol(weather.pressure_trend)}`}
      />
      <Divider />
      <Stat label="Cloud" value={`${Math.round(weather.cloud_cover_pct)}%`} sub="cover" />
    </div>
  );
}

function Stat({ label, value, sub, highlight = false }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: '0 2px' }}>
      <div style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em',
        color: highlight ? 'var(--color-accent)' : 'var(--color-text-subtle)', marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em',
        color: highlight ? 'var(--color-accent)' : 'var(--color-text)', lineHeight: 1.1,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, background: 'var(--color-border)', alignSelf: 'stretch' }} />;
}
