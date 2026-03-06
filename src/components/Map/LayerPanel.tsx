import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { LAYER_REGISTRY } from './layerStyles';
import type { MapLayerData } from '../../hooks/useMapLayers';

interface LayerPanelProps {
  visibility: Record<string, boolean>;
  onToggle: (key: string) => void;
  layers: MapLayerData;
}

export function LayerPanel({ visibility, onToggle, layers }: LayerPanelProps) {
  const map = useMap();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const Control = L.Control.extend({
      onAdd() {
        const div = L.DomUtil.create('div', 'custom-layer-panel');
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

    const control = new Control({ position: 'topright' });
    control.addTo(map);

    return () => {
      control.remove();
    };
  }, [map]);

  const visibleEntries = LAYER_REGISTRY.filter(
    (entry) => (layers[entry.key as keyof MapLayerData] || []).length > 0,
  );

  if (!ready || !containerRef.current || visibleEntries.length === 0) return null;

  return createPortal(
    <>
      <div className="custom-layer-panel__toggle">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>
      <div className="custom-layer-panel__body">
        {visibleEntries.map((entry) => {
          const count = (layers[entry.key as keyof MapLayerData] || []).length;
          return (
            <label key={entry.key} className="custom-layer-panel__row">
              <input
                type="checkbox"
                checked={!!visibility[entry.key]}
                onChange={() => onToggle(entry.key)}
              />
              <span
                className="custom-layer-panel__swatch"
                dangerouslySetInnerHTML={{ __html: entry.legendSvg }}
              />
              <span className="custom-layer-panel__label">
                {entry.label} ({count})
              </span>
            </label>
          );
        })}
      </div>
    </>,
    containerRef.current,
  );
}
