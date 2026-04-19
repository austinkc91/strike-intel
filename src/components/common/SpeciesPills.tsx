import { SPECIES_LABELS, type Species } from '../../services/fishScoring';

const SPECIES_LIST: Species[] = ['striper', 'largemouth', 'crappie', 'walleye', 'catfish'];

interface SpeciesPillsProps {
  species: Species;
  onChange: (s: Species) => void;
  accentColor?: string;
}

/**
 * Horizontally scrolling species pill row. The active pill is filled with
 * `accentColor` (defaults to var(--color-accent)) so it can echo whatever
 * is highlighted nearby (e.g. the day's score color on the Home page).
 */
export function SpeciesPills({ species, onChange, accentColor }: SpeciesPillsProps) {
  const accent = accentColor ?? 'var(--color-accent)';
  return (
    <div
      className="hide-scrollbar"
      style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}
    >
      {SPECIES_LIST.map((s) => {
        const active = s === species;
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            style={{
              flexShrink: 0,
              padding: '7px 14px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '-0.005em',
              background: active ? accent : 'rgba(255,255,255,0.05)',
              color: active ? '#041322' : 'var(--color-text-muted)',
              border: `1px solid ${active ? accent : 'var(--color-border-strong)'}`,
              transition: 'all 0.15s',
            }}
          >
            {SPECIES_LABELS[s]}
          </button>
        );
      })}
    </div>
  );
}
