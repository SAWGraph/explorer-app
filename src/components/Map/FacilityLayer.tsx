import { LayerGroup, CircleMarker, Popup } from 'react-leaflet';
import type { MapFeature } from '../../types/map';
import type { LatLngExpression } from 'leaflet';
import { MapPopupContent } from './MapPopup';

interface FacilityLayerProps {
  features: MapFeature[];
}

const INDUSTRY_COLORS: Record<string, string> = {
  '5622': '#e74c3c',
  '3253': '#9b59b6',
  '9281': '#2ecc71',
  '3328': '#3498db',
  '3221': '#1abc9c',
};

function getColor(feature: MapFeature): string {
  const code = String(feature.properties.industryCode || '');
  const lastPart = code.split('/').pop() || '';
  const prefix = lastPart.replace(/^NAICS-/, '').slice(0, 4);
  return INDUSTRY_COLORS[prefix] || '#e74c3c';
}

export function FacilityLayer({ features }: FacilityLayerProps) {
  return (
    <LayerGroup>
      {features.map((f) => (
        <CircleMarker
          key={f.id}
          center={f.geometry.coordinates as LatLngExpression}
          radius={7}
          pathOptions={{
            color: getColor(f),
            fillColor: getColor(f),
            fillOpacity: 0.7,
            weight: 2,
          }}
        >
          <Popup>
            <MapPopupContent feature={f} />
          </Popup>
        </CircleMarker>
      ))}
    </LayerGroup>
  );
}
