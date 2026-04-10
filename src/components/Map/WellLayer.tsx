import { CircleMarker, LayerGroup, Tooltip } from 'react-leaflet';
import type { MapFeature } from '../../types/map';
import type { LatLngExpression } from 'leaflet';
import { MapPopupContent } from './MapPopup';
import { WATER_COLORS } from './mapColors';

interface WellLayerProps {
  features: MapFeature[];
}

export function WellLayer({ features }: WellLayerProps) {
  return (
    <LayerGroup>
      {features.map((f) => {
        if (f.geometry.type !== 'Point') return null;
        return (
          <CircleMarker
            key={f.id}
            center={f.geometry.coordinates as LatLngExpression}
            radius={4}
            pathOptions={{ color: WATER_COLORS.well, fillColor: WATER_COLORS.aquifer, fillOpacity: 0.7, weight: 2 }}
          >
            <Tooltip>
              <MapPopupContent feature={f} />
            </Tooltip>
          </CircleMarker>
        );
      })}
    </LayerGroup>
  );
}
