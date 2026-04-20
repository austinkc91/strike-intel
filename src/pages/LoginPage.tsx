import { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { Logo } from '../components/common/Logo';

// Hardcoded creds — single-user gate, not a real security boundary.
// Anyone willing to view the JS bundle can extract these. The point is
// to keep casual passersby out, not a determined attacker.
const VALID_USER = 'Austin';
const VALID_PASS = '022691';

export function LoginPage() {
  const setIsAuthenticated = useAppStore((s) => s.setIsAuthenticated);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shake, setShake] = useState(false);

  // Reset the shake animation flag after it plays
  useEffect(() => {
    if (!shake) return;
    const t = setTimeout(() => setShake(false), 500);
    return () => clearTimeout(t);
  }, [shake]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Tiny artificial delay so the UI doesn't flash — feels intentional.
    setTimeout(() => {
      if (username.trim() === VALID_USER && password === VALID_PASS) {
        setIsAuthenticated(true);
      } else {
        setError('Wrong username or password.');
        setShake(true);
        setSubmitting(false);
      }
    }, 250);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 20px',
      overflow: 'hidden',
      background: `
        radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255,138,61,0.18) 0%, transparent 60%),
        radial-gradient(ellipse 90% 60% at 50% 100%, rgba(94,184,230,0.14) 0%, transparent 65%),
        radial-gradient(ellipse 60% 70% at 100% 50%, rgba(168,85,247,0.10) 0%, transparent 70%),
        linear-gradient(180deg, #0a1828 0%, #050b14 100%)
      `,
    }}>
      {/* Subtle moving shimmer */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, opacity: 0.5, pointerEvents: 'none',
        backgroundImage: `repeating-linear-gradient(
          115deg, transparent 0px, transparent 2px,
          rgba(255,255,255,0.012) 2px, rgba(255,255,255,0.012) 4px
        )`,
      }} />

      {/* Soft starfield */}
      <Stars />

      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 360,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        animation: shake ? 'login-shake 0.45s cubic-bezier(.36,.07,.19,.97)' : undefined,
      }}>
        {/* Logo + brand */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <Logo size={140} />
        </div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: '-0.03em',
          color: 'var(--color-text)',
          marginBottom: 4,
          textAlign: 'center',
        }}>
          Strike Intel
        </div>
        <div className="meta" style={{ marginBottom: 28, textAlign: 'center', letterSpacing: '0.06em' }}>
          Pattern fishing intel for Lake Texoma
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          style={{
            width: '100%',
            padding: '22px 20px 18px',
            background: 'rgba(15, 25, 40, 0.78)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 18,
            boxShadow: '0 20px 60px -10px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,138,61,0.06) inset',
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <Label>Username</Label>
            <input
              type="text"
              autoComplete="username"
              autoCapitalize="off"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={submitting}
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <Label>Password</Label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{
              padding: '8px 12px',
              marginBottom: 12,
              background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.28)',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 600,
              color: '#fecaca',
              letterSpacing: '0.02em',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !username || !password}
            style={{
              width: '100%',
              padding: '13px 16px',
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#041322',
              background: submitting || !username || !password
                ? 'rgba(255,138,61,0.5)'
                : 'linear-gradient(135deg, #ffae6b 0%, #ff8a3d 100%)',
              border: 'none',
              cursor: submitting || !username || !password ? 'not-allowed' : 'pointer',
              boxShadow: submitting ? 'none' : '0 6px 24px -6px rgba(255,138,61,0.65), 0 0 0 1px rgba(255,138,61,0.4) inset',
              transition: 'transform 0.08s, box-shadow 0.15s',
            }}
            onMouseDown={(e) => { if (!submitting) e.currentTarget.style.transform = 'scale(0.985)'; }}
            onMouseUp={(e) => (e.currentTarget.style.transform = '')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = '')}
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div style={{
          marginTop: 24,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--color-text-subtle)',
          textAlign: 'center',
        }}>
          Restricted access
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes login-shake {
          0%, 100% { transform: translateX(0); }
          10%, 50%, 90% { transform: translateX(-6px); }
          30%, 70% { transform: translateX(6px); }
        }
        @keyframes star-twinkle {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.55; }
        }
      `}</style>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 10,
  color: 'var(--color-text)',
  fontSize: 15,
  outline: 'none',
  transition: 'border-color 0.15s, background 0.15s',
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.14em',
      color: 'var(--color-text-subtle)',
      marginBottom: 6,
    }}>
      {children}
    </div>
  );
}

function Stars() {
  // 24 random twinkling stars in the background. Seeded once per mount —
  // plenty for atmosphere, cheap to render.
  const stars = Array.from({ length: 24 }, (_, i) => {
    const seed = (i + 1) * 9301 + 49297;
    const x = (seed % 1000) / 10;
    const y = ((seed * 7) % 1000) / 10;
    const size = 1 + ((seed * 3) % 3);
    const delay = (i % 7) * 0.6;
    return { i, x, y, size, delay };
  });
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {stars.map((s) => (
        <div key={s.i} style={{
          position: 'absolute',
          left: `${s.x}%`,
          top: `${s.y}%`,
          width: s.size,
          height: s.size,
          borderRadius: '50%',
          background: '#fff',
          opacity: 0.3,
          animation: `star-twinkle ${4 + s.i % 3}s ease-in-out ${s.delay}s infinite`,
          boxShadow: '0 0 4px rgba(255,255,255,0.6)',
        }} />
      ))}
    </div>
  );
}
