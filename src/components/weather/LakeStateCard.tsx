import type { LakeStateSnapshot } from '../../services/lakeState';

interface LakeStateCardProps {
  state: LakeStateSnapshot | null;
  loading?: boolean;
}

/**
 * Lake state card for Texoma — pool elevation + dam release rate from
 * USACE. The release-rate side is the actionable bit for striper anglers:
 * when generation kicks on, the bite turns on below the dam.
 */
export function LakeStateCard({ state, loading }: LakeStateCardProps) {
  if (!state) {
    return (
      <div className="card section">
        <div className="eyebrow" style={{ marginBottom: 6 }}>Lake state · USACE</div>
        <div className="meta">{loading ? 'Loading…' : 'USACE feed unavailable.'}</div>
      </div>
    );
  }

  const elev = state.elevation_ft.toFixed(1);
  const d24 = state.elevation24hDelta_ft;
  const d7 = state.elevation7dDelta_ft;

  const generatingColor = state.generating ? 'var(--color-good)' : 'var(--color-text-muted)';
  const trendArrow =
    state.releaseTrend === 'climbing' ? '↑' :
    state.releaseTrend === 'falling' ? '↓' : '→';

  return (
    <div className="card section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div className="eyebrow">Lake state · USACE</div>
        <div className="meta" style={{ fontSize: 10 }}>
          {state.asOf.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Elevation */}
        <div>
          <div className="meta" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Elevation
          </div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--color-text)',
            lineHeight: 1.1,
            marginTop: 2,
          }}>
            {elev}<span style={{ fontSize: 14, color: 'var(--color-text-muted)', marginLeft: 4 }}>ft</span>
          </div>
          <div className="meta" style={{ fontSize: 11, marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <DeltaPill label="24h" value={d24} />
            <DeltaPill label="7d" value={d7} />
          </div>
        </div>

        {/* Release */}
        <div>
          <div className="meta" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Release
          </div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: state.generating ? 'var(--color-good)' : 'var(--color-text)',
            lineHeight: 1.1,
            marginTop: 2,
          }}>
            {state.releaseFlow_cfs.toLocaleString()}<span style={{ fontSize: 14, color: 'var(--color-text-muted)', marginLeft: 4 }}>cfs</span>
          </div>
          <div className="meta" style={{ fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              display: 'inline-block',
              width: 6, height: 6, borderRadius: '50%',
              background: generatingColor,
              boxShadow: state.generating ? '0 0 6px var(--color-good)' : 'none',
            }} />
            <span style={{ color: generatingColor, fontWeight: 600 }}>
              {state.generating ? 'Generating' : 'Idle'}
            </span>
            <span>· {trendArrow} {state.releaseTrend}</span>
          </div>
        </div>
      </div>

      {/* Striper-specific tip when generation is active */}
      {state.generating && (
        <div style={{
          marginTop: 10,
          padding: '8px 10px',
          borderRadius: 8,
          background: 'rgba(74,222,128,0.08)',
          border: '1px solid rgba(74,222,128,0.25)',
          fontSize: 12,
          lineHeight: 1.4,
          color: 'var(--color-text)',
        }}>
          Generation active — striper feeding likely below the dam and through the lower lake.
        </div>
      )}
    </div>
  );
}

function DeltaPill({ label, value }: { label: string; value: number }) {
  const sign = value > 0 ? '↑' : value < 0 ? '↓' : '·';
  const color =
    Math.abs(value) < 0.05 ? 'var(--color-text-muted)' :
    value > 0 ? 'var(--color-good)' : 'var(--color-warn)';
  return (
    <span style={{ color, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span style={{ color: 'var(--color-text-subtle)' }}>{label}</span>
      {sign} {Math.abs(value).toFixed(2)}ft
    </span>
  );
}
