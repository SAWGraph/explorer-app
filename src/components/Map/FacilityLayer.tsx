import { LayerGroup, Marker, Popup } from 'react-leaflet';
import type { MapFeature } from '../../types/map';
import type { LatLngExpression } from 'leaflet';
import { MapPopupContent } from './MapPopup';
import { createSquareIcon } from './layerStyles';

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
        <Marker
          key={f.id}
          position={f.geometry.coordinates as LatLngExpression}
          icon={createSquareIcon(getColor(f))}
        >
          <Popup>
            <MapPopupContent feature={f} />
          </Popup>
        </Marker>
      ))}
    </LayerGroup>
  );
}
