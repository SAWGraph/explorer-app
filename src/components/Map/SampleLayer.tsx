import { LayerGroup, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import type { MapFeature } from '../../types/map';
import type { LatLngExpression } from 'leaflet';
import { MapPopupContent } from './MapPopup';
import { SAMPLE_DEFAULT, SAMPLE_STROKE_DEFAULT, getSampleRadius } from './mapColors';

interface SampleLayerProps {
  features: MapFeature[];
}

export function SampleLayer({ features }: SampleLayerProps) {
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
        >
          <Popup maxWidth={500} maxHeight={400}>
            <MapPopupContent feature={f} />
          </Popup>
          <Tooltip pane="tooltipPane">
            <strong>{f.sampleDetails?.samplePointName || 'Sample Point'}</strong>
          </Tooltip>
        </CircleMarker>
      ))}
    </LayerGroup>
  );
}
