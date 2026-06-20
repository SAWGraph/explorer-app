import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { BASEMAPS, type BasemapOption } from './basemaps';

interface BasemapSelectorProps {
  current: string;
  onChange: (key: string) => void;
}

export function BasemapSelector({ current, onChange }: BasemapSelectorProps) {
  const map = useMap();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const Control = L.Control.extend({
      onAdd() {
        const div = L.DomUtil.create('div', 'basemap-selector');
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);
        containerRef.current = div;
        setReady(true);
        return div;
      },
      onRemove() {
        containerRef.current = null;
        setReady(false);
      },
    });

    const control = new Control({ position: 'bottomright' });
    control.addTo(map);

    return () => {
      control.remove();
    };
  }, [map]);

  if (!ready || !containerRef.current) return null;

  return createPortal(
    <>
      <div className="basemap-selector__toggle">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 12h18" />
          <path d="M12 3v18" />
        </svg>
      </div>
      <div className="basemap-selector__body">
        <div className="basemap-selector__grid">
          {BASEMAPS.map((bm: BasemapOption) => (
            <button
              key={bm.key}
              type="button"
              className={`basemap-selector__tile${current === bm.key ? ' is-active' : ''}`}
              onClick={() => onChange(bm.key)}
              aria-pressed={current === bm.key}
            >
              <img src={bm.thumbnail} alt="" className="basemap-selector__thumb" />
              <span className="basemap-selector__label">{bm.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>,
    containerRef.current,
  );
}
