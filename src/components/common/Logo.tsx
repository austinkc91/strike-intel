import { useEffect, useRef, useState } from 'react';

interface LogoProps {
  size?: number;
  /** Adds a soft glow under the logo. */
  glow?: boolean;
}

const LOGO_SRC = '/StrikeIntelLogo.png';

// Cache the chroma-keyed result across mounts so we don't reprocess every render.
let cachedTransparentSrc: string | null = null;
let cacheInflight: Promise<string> | null = null;

async function loadTransparentLogo(): Promise<string> {
  if (cachedTransparentSrc) return cachedTransparentSrc;
  if (cacheInflight) return cacheInflight;

  cacheInflight = new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas unavailable'));
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const px = data.data;

      // Soft chroma-key: anything close to white becomes transparent. Use a
      // ramp so anti-aliased edges blend cleanly instead of haloing.
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i], g = px[i + 1], b = px[i + 2];
        const min = Math.min(r, g, b);
        // "Whiteness" = how bright AND how desaturated. Pure white scores 1.
        const lum = (r + g + b) / 3;
        const sat = lum === 0 ? 0 : (lum - min) / lum;
        const whiteness = (lum / 255) * (1 - sat);
        if (whiteness > 0.85) {
          px[i + 3] = 0;
        } else if (whiteness > 0.65) {
          // Smooth ramp: 0.65 → fully opaque, 0.85 → fully transparent
          const t = (whiteness - 0.65) / 0.20;
          px[i + 3] = Math.round(px[i + 3] * (1 - t));
        }
      }
      ctx.putImageData(data, 0, 0);
      cachedTransparentSrc = canvas.toDataURL('image/png');
      resolve(cachedTransparentSrc);
    };
    img.onerror = () => reject(new Error('logo failed to load'));
    img.src = LOGO_SRC;
  });
  return cacheInflight;
}

/**
 * Strike Intel brand mark. Loads the PNG once, chroma-keys the white
 * background to transparent, then renders it. Falls back to the raw image
 * if processing fails for any reason.
 */
export function Logo({ size = 120, glow = true }: LogoProps) {
  const [src, setSrc] = useState<string>(cachedTransparentSrc ?? LOGO_SRC);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (cachedTransparentSrc) {
      setSrc(cachedTransparentSrc);
      return;
    }
    loadTransparentLogo()
      .then((s) => {
        if (mounted.current) setSrc(s);
      })
      .catch(() => {
        // Already showing the raw src as fallback.
      });
    return () => { mounted.current = false; };
  }, []);

  return (
    <div style={{
      position: 'relative',
      width: size,
      height: size,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {glow && (
        <div aria-hidden style={{
          position: 'absolute',
          inset: '-15%',
          background: 'radial-gradient(circle, rgba(255,138,61,0.30) 0%, rgba(94,184,230,0.18) 40%, transparent 70%)',
          filter: 'blur(8px)',
          pointerEvents: 'none',
        }} />
      )}
      <img
        src={src}
        alt="Strike Intel"
        width={size}
        height={size}
        style={{
          position: 'relative',
          objectFit: 'contain',
          width: size,
          height: size,
          filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.55)) drop-shadow(0 0 12px rgba(255,138,61,0.25))',
        }}
      />
    </div>
  );
}
