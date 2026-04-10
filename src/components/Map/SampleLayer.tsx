import { LayerGroup, CircleMarker, Tooltip } from 'react-leaflet';
import type { MapFeature } from '../../types/map';
import type { LatLngExpression } from 'leaflet';
import { MapPopupContent } from './MapPopup';
import { getSampleColor, getSampleStroke, getSampleRadius } from './mapColors';

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
            color: getSampleStroke(f.properties.maxConcentration),
            fillColor: getSampleColor(f.properties.maxConcentration),
            fillOpacity: 0.8,
            weight: 2,
          }}
        >
          <Tooltip>
            <MapPopupContent feature={f} />
          </Tooltip>
        </CircleMarker>
      ))}
    </LayerGroup>
  );
}
