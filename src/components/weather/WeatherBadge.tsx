import type { CatchWeather } from '../../types';
import {
  windDirectionToCompass,
  conditionLabel,
  pressureTrendSymbol,
} from '../../services/weather';

interface WeatherBadgeProps {
  weather: CatchWeather;
  compact?: boolean;
}

const conditionIcons: Record<string, string> = {
  clear: '\u2600\uFE0F',
  partly_cloudy: '\u26C5',
  overcast: '\u2601\uFE0F',
  rain: '\uD83C\uDF27\uFE0F',
  storm: '\u26C8\uFE0F',
};

export function WeatherBadge({ weather, compact = false }: WeatherBadgeProps) {
  const icon = conditionIcons[weather.condition] || '\u2600\uFE0F';
  const windDir = windDirectionToCompass(weather.wind_direction_deg);
  const pressureArrow = pressureTrendSymbol(weather.pressure_trend);

  if (compact) {
    return (
      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
        {icon} {weather.temp_f}°F | {windDir} {weather.wind_speed_mph}mph | {weather.pressure_hpa}{pressureArrow}
      </span>
    );
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 8,
      padding: 12,
      background: 'var(--color-bg)',
      borderRadius: 'var(--radius)',
      fontSize: 13,
    }}>
      <div>
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 11, marginBottom: 2 }}>CONDITION</div>
        <div>{icon} {conditionLabel(weather.condition)}</div>
      </div>
      <div>
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 11, marginBottom: 2 }}>TEMP</div>
        <div>{weather.temp_f}°F</div>
      </div>
      <div>
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 11, marginBottom: 2 }}>WIND</div>
        <div>{windDir} {weather.wind_speed_mph}mph (gusts {weather.wind_gusts_mph})</div>
      </div>
      <div>
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 11, marginBottom: 2 }}>PRESSURE</div>
        <div style={{ color: weather.pressure_trend === 'falling' ? 'var(--color-warning)' : 'inherit' }}>
          {weather.pressure_hpa} hPa {pressureArrow}
          {weather.pressure_trend === 'falling' && (
            <span style={{ fontSize: 10, marginLeft: 4, color: 'var(--color-warning)' }}>Front!</span>
          )}
        </div>
      </div>
      {weather.water_temp_f != null && (
        <div>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 11, marginBottom: 2 }}>WATER TEMP</div>
          <div>{weather.water_temp_f}°F</div>
        </div>
      )}
      <div>
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 11, marginBottom: 2 }}>CLOUD COVER</div>
        <div>{weather.cloud_cover_pct}%</div>
      </div>
    </div>
  );
}
