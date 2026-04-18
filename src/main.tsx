import { StrictMode, Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './App';
import { initAuth } from './services/firebase';

class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', err, info);
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 16, color: '#fff', background: '#081422', minHeight: '100vh', fontFamily: 'monospace', fontSize: 13 }}>
          <div style={{ color: '#ff6b6b', fontWeight: 700, marginBottom: 8 }}>App crashed</div>
          <div style={{ marginBottom: 8 }}>{this.state.err.name}: {this.state.err.message}</div>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{this.state.err.stack}</pre>
          <button onClick={() => location.reload()} style={{ marginTop: 12, padding: '8px 16px', background: '#4fc3f7', border: 'none', borderRadius: 8, color: '#000', fontWeight: 600 }}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Initialize Firebase auth before rendering
initAuth()
  .then(() => {
    console.log('Firebase auth initialized');
  })
  .catch((err) => {
    console.error('Firebase auth failed:', err);
  });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
