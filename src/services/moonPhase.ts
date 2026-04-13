// Algorithmic moon phase calculation - no API needed
// Based on Conway's method with refinements

export interface MoonInfo {
  phase: string;        // 'New Moon', 'Waxing Crescent', etc.
  illumination: number; // 0-1
  age: number;          // days into lunar cycle (0-29.53)
}

const LUNAR_CYCLE = 29.53058770576;

export function getMoonPhase(date: Date): MoonInfo {
  // Calculate days since known new moon (Jan 6, 2000 18:14 UTC)
  const knownNew = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
  const diffMs = date.getTime() - knownNew.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  // Age in current cycle
  let age = diffDays % LUNAR_CYCLE;
  if (age < 0) age += LUNAR_CYCLE;

  // Illumination (approximate cosine curve)
  const illumination =
    (1 - Math.cos((age / LUNAR_CYCLE) * 2 * Math.PI)) / 2;

  // Phase name
  const phase = getPhaseLabel(age);

  return { phase, illumination: Math.round(illumination * 100) / 100, age };
}

function getPhaseLabel(age: number): string {
  if (age < 1.85) return 'New Moon';
  if (age < 5.53) return 'Waxing Crescent';
  if (age < 9.22) return 'First Quarter';
  if (age < 12.91) return 'Waxing Gibbous';
  if (age < 16.61) return 'Full Moon';
  if (age < 20.30) return 'Waning Gibbous';
  if (age < 23.99) return 'Last Quarter';
  if (age < 27.68) return 'Waning Crescent';
  return 'New Moon';
}

export function moonPhaseEmoji(phase: string): string {
  switch (phase) {
    case 'New Moon': return '\uD83C\uDF11';
    case 'Waxing Crescent': return '\uD83C\uDF12';
    case 'First Quarter': return '\uD83C\uDF13';
    case 'Waxing Gibbous': return '\uD83C\uDF14';
    case 'Full Moon': return '\uD83C\uDF15';
    case 'Waning Gibbous': return '\uD83C\uDF16';
    case 'Last Quarter': return '\uD83C\uDF17';
    case 'Waning Crescent': return '\uD83C\uDF18';
    default: return '\uD83C\uDF11';
  }
}
