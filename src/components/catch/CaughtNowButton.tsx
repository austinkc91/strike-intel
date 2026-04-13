interface CaughtNowButtonProps {
  onClick: () => void;
  loading: boolean;
}

export function CaughtNowButton({ onClick, loading }: CaughtNowButtonProps) {
  return (
    <button
      className={`caught-now-fab ${loading ? 'loading' : ''}`}
      onClick={onClick}
      disabled={loading}
      title="Log catch at current location"
    >
      {loading ? (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20">
            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
          </circle>
        </svg>
      ) : (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        </svg>
      )}
    </button>
  );
}
