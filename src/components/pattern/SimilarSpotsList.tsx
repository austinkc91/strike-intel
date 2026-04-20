import type { MatchResult } from '../../services/patternEngine';

interface SimilarSpotsListProps {
  results: MatchResult[];
  onSpotClick: (result: MatchResult) => void;
}

function scoreColor(score: number): string {
  if (score >= 0.9) return 'var(--color-accent)';
  if (score >= 0.8) return '#cddc39';
  return 'var(--color-warning)';
}

export function SimilarSpotsList({ results, onSpotClick }: SimilarSpotsListProps) {
  const top = results.slice(0, 10);

  if (top.length === 0) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>
        No similar spots found above threshold. Try adjusting the weights or lowering the threshold.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        Top {top.length} Similar Spots
      </div>
      {top.map((r, i) => (
        <button
          key={r.cellId}
          onClick={() => onSpotClick(r)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            padding: '8px 10px',
            background: r.isOrigin ? 'rgba(255,138,61,0.10)' : 'var(--color-bg)',
            border: `1px solid ${r.isOrigin ? 'rgba(255,138,61,0.45)' : 'var(--color-border)'}`,
            borderRadius: 'var(--radius)',
            color: 'var(--color-text)',
            marginBottom: 4,
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          {/* Rank */}
          <div style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: scoreColor(r.score),
            color: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 12,
            flexShrink: 0,
          }}>
            {i + 1}
          </div>

          {/* Details */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span>{r.lat.toFixed(4)}, {r.lng.toFixed(4)}</span>
              {r.isOrigin && (
                <span style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  borderRadius: 999,
                  background: 'rgba(255,138,61,0.25)',
                  color: '#ffae6b',
                }}>
                  Your spot
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
              Depth: {Math.round(r.signature.depth * 40)}ft &middot;
              Slope: {Math.round(r.signature.slope * 30)}° &middot;
              Wind Exp: {Math.round(r.signature.windExposure * 100)}%
            </div>
          </div>

          {/* Score */}
          <div style={{
            fontSize: 16,
            fontWeight: 700,
            color: scoreColor(r.score),
          }}>
            {Math.round(r.score * 100)}%
          </div>
        </button>
      ))}
    </div>
  );
}
