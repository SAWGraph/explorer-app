import { LayerGroup, Polyline, Popup, Tooltip } from 'react-leaflet';
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
            <Popup maxWidth={500}>
              <MapPopupContent feature={f} />
            </Popup>
            <Tooltip sticky pane="tooltipPane">
              <strong>{f.properties.name || 'Stream'}</strong>
            </Tooltip>
          </Polyline>
        );
      })}
    </LayerGroup>
  );
}
