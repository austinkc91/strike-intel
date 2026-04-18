import { useAppStore } from '../store';
import { auth } from '../services/firebase';

export function SettingsPage() {
  const { selectedLake } = useAppStore();
  const user = auth.currentUser;

  return (
    <div className="page page-top">
      <div className="page-header">
        <div>
          <div className="eyebrow">Preferences</div>
          <h1 className="display" style={{ marginTop: 2 }}>Settings</h1>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <div className="eyebrow">Lake</div>
        </div>
        <div className="card">
          <Row label="Currently selected" value={selectedLake?.name ?? 'None selected'} />
          {selectedLake && (
            <>
              <div className="divider" />
              <Row label="Region" value={selectedLake.state} />
              <div className="divider" />
              <Row label="Surface area" value={`${selectedLake.area_acres.toLocaleString()} acres`} />
            </>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <div className="eyebrow">Units</div>
        </div>
        <div className="card">
          <Row label="System" value="Imperial" />
          <div className="divider" />
          <Row label="Weight" value="Pounds (lbs)" />
          <div className="divider" />
          <Row label="Distance" value="Feet / miles" />
          <div className="divider" />
          <Row label="Temperature" value="Fahrenheit (°F)" />
          <div className="divider" />
          <Row label="Wind" value="MPH" />
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <div className="eyebrow">Account</div>
        </div>
        <div className="card">
          <Row label="Status" value="Anonymous" />
          {user?.uid && (
            <>
              <div className="divider" />
              <Row label="Device ID" value={user.uid.slice(0, 12) + '…'} mono />
            </>
          )}
        </div>
        <button className="btn btn-secondary btn-block" style={{ marginTop: 12 }} disabled>
          Sign in with Google
          <span className="badge badge-muted" style={{ marginLeft: 8 }}>Soon</span>
        </button>
      </div>

      <div className="section">
        <div className="section-header">
          <div className="eyebrow">About</div>
        </div>
        <div className="card">
          <Row label="Version" value="0.2.0" />
          <div className="divider" />
          <Row label="Build" value="Phase 2 — Texoma" />
          <div className="divider" />
          <Row label="Bathymetry" value="TWDB" />
          <div className="divider" />
          <Row label="Weather" value="Open-Meteo" />
        </div>
      </div>

      <div className="text-center" style={{ marginTop: 32, marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Strike Intel
        </div>
        <div className="meta" style={{ marginTop: 4 }}>
          Pattern-based fishing intelligence
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{label}</div>
      <div style={{
        fontSize: 14,
        fontWeight: 600,
        color: 'var(--color-text)',
        fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
      }}>
        {value}
      </div>
    </div>
  );
}
