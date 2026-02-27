import { LayerGroup, CircleMarker, Popup } from 'react-leaflet';
import type { MapFeature } from '../../types/map';
import type { LatLngExpression } from 'leaflet';
import { MapPopupContent } from './MapPopup';

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
          radius={6}
          pathOptions={{ color: '#e67e22', fillColor: '#f39c12', fillOpacity: 0.8, weight: 2 }}
        >
          <Popup>
            <MapPopupContent feature={f} />
          </Popup>
        </CircleMarker>
      ))}
    </LayerGroup>
  );
}
