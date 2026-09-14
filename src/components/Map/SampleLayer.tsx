import { useState } from 'react';
import { LayerGroup, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import type { MapFeature } from '../../types/map';
import type { LatLngExpression } from 'leaflet';
import { MapPopupContent } from './MapPopup';
import { SAMPLE_DEFAULT, SAMPLE_STROKE_DEFAULT, getSampleRadius } from './mapColors';

interface SampleLayerProps {
  features: MapFeature[];
}

export function SampleLayer({ features }: SampleLayerProps) {
  // Only the open popup fetches its observation rows, so track which one it is
  // rather than relying on react-leaflet's render timing.
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <LayerGroup>
      {features.map((f) => (
        <CircleMarker
          key={f.id}
          center={f.geometry.coordinates as LatLngExpression}
          radius={getSampleRadius(f.properties.maxConcentration)}
          pathOptions={{
            color: SAMPLE_STROKE_DEFAULT,
            fillColor: SAMPLE_DEFAULT,
            fillOpacity: 0.8,
            weight: 2,
          }}
          eventHandlers={{
            popupopen: () => setOpenId(f.id),
            popupclose: () => setOpenId((id) => (id === f.id ? null : id)),
          }}
        >
          <Popup maxWidth={500} maxHeight={400}>
            <MapPopupContent feature={f} isOpen={openId === f.id} />
          </Popup>
          <Tooltip pane="tooltipPane">
            <strong>{f.properties.samplePointName || 'Sample Point'}</strong>
          </Tooltip>
        </CircleMarker>
      ))}
    </LayerGroup>
  );
}
