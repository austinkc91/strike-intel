import { useAppStore } from '../store';

export function SettingsPage() {
  const { selectedLake } = useAppStore();

  return (
    <div className="page">
      <h2 className="page-header">Settings</h2>

      <div className="catch-card">
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
          Current Lake
        </div>
        <div style={{ fontWeight: 600 }}>
          {selectedLake ? selectedLake.name : 'None selected'}
        </div>
      </div>

      <div className="catch-card" style={{ marginTop: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
          Units
        </div>
        <div style={{ fontWeight: 600 }}>Imperial (lbs, ft, °F, mph)</div>
      </div>

      <div className="catch-card" style={{ marginTop: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
          Account
        </div>
        <div style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          Anonymous
        </div>
        <button
          className="btn btn-primary"
          style={{ marginTop: 8 }}
          disabled
        >
          Sign in with Google (Coming Soon)
        </button>
      </div>

      <div style={{ marginTop: 24, fontSize: 12, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
        Strike Intel v0.1.0 - Phase 1
      </div>
    </div>
  );
}
