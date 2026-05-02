import { LayerGroup, Polyline, Tooltip } from 'react-leaflet';
import type { MapFeature } from '../../types/map';
import type { LatLngExpression } from 'leaflet';
import { MapPopupContent } from './MapPopup';
import { WATER_COLORS } from './mapColors';

interface StreamLayerProps {
  features: MapFeature[];
}

export function StreamLayer({ features }: StreamLayerProps) {
  return (
    <LayerGroup>
      {features.map((f) => {
        if (f.geometry.type !== 'LineString') return null;
        return (
          <Polyline
            key={f.id}
            positions={f.geometry.coordinates as LatLngExpression[]}
            pathOptions={{ color: WATER_COLORS.flowline, weight: 2, opacity: 0.7 }}
          >
            <Tooltip sticky>
              <MapPopupContent feature={f} />
            </Tooltip>
          </Polyline>
        );
      })}
    </LayerGroup>
  );
}
