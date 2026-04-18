// Resolves the tile-server base URL for the current environment.
// Always returns an ABSOLUTE URL (with scheme + host). MapLibre loads vector
// tiles in a Web Worker, and workers cannot resolve root-relative URLs like
// `/api/...` — they throw "Failed to parse URL".
// - VITE_TILE_SERVER env var always wins.
// - Dev hosts (localhost, LAN IP): `http://<host>:3001/api` (direct to Express).
// - Deployed hosts: `<origin>/api` (Firebase Hosting rewrites to Cloud Run).
export const TILE_SERVER: string = import.meta.env.VITE_TILE_SERVER || (() => {
  const h = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const isDev =
    h === 'localhost' ||
    h === '127.0.0.1' ||
    /^192\.168\./.test(h) ||
    /^10\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  if (isDev) {
    const base = h && h !== 'localhost' && h !== '127.0.0.1' ? h : 'localhost';
    return `http://${base}:3001/api`;
  }
  return `${window.location.origin}/api`;
})();
