import { useMemo, useState } from 'react';
import { LayerGroup, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import type { MapFeature } from '../../../engine/types/map';
import type { LatLngExpression } from 'leaflet';
import { PointPopupContent, StackedTooltipNote } from './StackedPopup';
import { stacksById } from './stackedPoints';
import { SAMPLE_DEFAULT, SAMPLE_STROKE_DEFAULT, getSampleRadius } from './mapColors';

interface SampleLayerProps {
  features: MapFeature[];
}

export function SampleLayer({ features }: SampleLayerProps) {
  // Only the open popup fetches its observation rows, so track which one it is
  // rather than relying on react-leaflet's render timing.
  const [openId, setOpenId] = useState<string | null>(null);
  const stacks = useMemo(() => stacksById(features), [features]);

  return (
    <LayerGroup>
      {features.map((f) => {
        const stack = stacks.get(f.id) ?? [f];
        return (
          <CircleMarker
            key={f.id}
            center={f.geometry.coordinates as LatLngExpression}
            radius={getSampleRadius(f.properties.maxConcentration)}
            pane="samplesPane"
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
            {/* No maxHeight: the sample table scrolls on its own, and ResultsMap
                caps every popup to the map (#88). */}
            <Popup maxWidth={500}>
              <PointPopupContent feature={f} stack={stack} isOpen={openId === f.id} />
            </Popup>
            <Tooltip>
              <strong>{f.properties.samplePointName || 'Sample Point'}</strong>
              <StackedTooltipNote stack={stack} />
            </Tooltip>
          </CircleMarker>
        );
      })}
    </LayerGroup>
  );
}
