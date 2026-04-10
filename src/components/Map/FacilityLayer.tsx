import { LayerGroup, Marker, Tooltip } from 'react-leaflet';
import type { MapFeature } from '../../types/map';
import type { LatLngExpression } from 'leaflet';
import { MapPopupContent } from './MapPopup';
import { createSquareIcon } from './layerStyles';
import { INDUSTRY_COLOR_MAP, INDUSTRY_STROKE_MAP, FACILITY_DEFAULT, FACILITY_STROKE_DEFAULT } from './mapColors';

interface FacilityLayerProps {
  features: MapFeature[];
}

function getNaicsPrefix(feature: MapFeature): string {
  const code = String(feature.properties.industryCode || '');
  const lastPart = code.split('/').pop() || '';
  return lastPart.replace(/^NAICS-/, '').slice(0, 4);
}

function getColor(feature: MapFeature): string {
  return INDUSTRY_COLOR_MAP[getNaicsPrefix(feature)] || FACILITY_DEFAULT;
}

function getStroke(feature: MapFeature): string {
  return INDUSTRY_STROKE_MAP[getNaicsPrefix(feature)] || FACILITY_STROKE_DEFAULT;
}

export function FacilityLayer({ features }: FacilityLayerProps) {
  return (
    <LayerGroup>
      {features.map((f) => (
        <Marker
          key={f.id}
          position={f.geometry.coordinates as LatLngExpression}
          icon={createSquareIcon(getColor(f), getStroke(f))}
        >
          <Tooltip>
            <MapPopupContent feature={f} />
          </Tooltip>
        </Marker>
      ))}
    </LayerGroup>
  );
}
