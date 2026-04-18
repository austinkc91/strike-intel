import { Marker, Popup } from '@vis.gl/react-maplibre';
import { useState } from 'react';
import { useAppStore } from '../../store';
import type { Catch } from '../../types';

interface CatchPinLayerProps {
  catches: Catch[];
  onCatchClick: (c: Catch) => void;
}

export function CatchPinLayer({ catches, onCatchClick }: CatchPinLayerProps) {
  const { pendingPin } = useAppStore();
  const [hoveredCatch, setHoveredCatch] = useState<Catch | null>(null);

  return (
    <>
      {/* Pending pin (pulsing blue) */}
      {pendingPin && (
        <Marker
          longitude={pendingPin.longitude}
          latitude={pendingPin.latitude}
          anchor="center"
        >
          <div className="pending-marker" />
        </Marker>
      )}

      {/* Catch pins */}
      {catches.map((c) => (
        <Marker
          key={c.id}
          longitude={c.location.longitude}
          latitude={c.location.latitude}
          anchor="bottom"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            onCatchClick(c);
          }}
        >
          <div
            className="catch-pin"
            onMouseEnter={() => setHoveredCatch(c)}
            onMouseLeave={() => setHoveredCatch(null)}
          >
            <svg width="28" height="36" viewBox="0 0 28 36" fill="none">
              <path
                d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z"
                fill="#e65100"
              />
              <circle cx="14" cy="13" r="6" fill="#fff" opacity="0.9" />
              <path
                d="M11 13c0-1 1-2.5 3-2.5s3 1.5 3 2.5-1 2.5-3 2.5-3-1.5-3-2.5z"
                fill="#e65100"
              />
            </svg>
          </div>
        </Marker>
      ))}

      {/* Hover popup */}
      {hoveredCatch && (
        <Popup
          longitude={hoveredCatch.location.longitude}
          latitude={hoveredCatch.location.latitude}
          offset={20}
          closeButton={false}
          closeOnClick={false}
        >
          <div style={{ color: '#000', fontSize: 13, padding: 4 }}>
            <strong>{hoveredCatch.species || 'Unknown species'}</strong>
            {hoveredCatch.weight_lbs && (
              <span> - {hoveredCatch.weight_lbs} lbs</span>
            )}
            <br />
            <span style={{ fontSize: 11, color: '#666' }}>
              {hoveredCatch.timestamp?.toDate?.()?.toLocaleDateString() || ''}
            </span>
          </div>
        </Popup>
      )}
    </>
  );
}
