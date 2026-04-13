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
          anchor="center"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            onCatchClick(c);
          }}
        >
          <div
            className="catch-marker"
            onMouseEnter={() => setHoveredCatch(c)}
            onMouseLeave={() => setHoveredCatch(null)}
          />
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
