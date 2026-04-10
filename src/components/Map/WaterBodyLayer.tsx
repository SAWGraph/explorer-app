import { LayerGroup, Polyline, Polygon, Marker, Tooltip } from 'react-leaflet';
import type { MapFeature } from '../../types/map';
import type { LatLngExpression } from 'leaflet';
import { MapPopupContent } from './MapPopup';
import { triangleIcon } from './layerStyles';
import { WATER_COLORS } from './mapColors';

interface WaterBodyLayerProps {
  features: MapFeature[];
}

export function WaterBodyLayer({ features }: WaterBodyLayerProps) {
  return (
    <LayerGroup>
      {features.map((f) => {
        if (f.geometry.type === 'Point') {
          return (
            <Marker
              key={f.id}
              position={f.geometry.coordinates as LatLngExpression}
              icon={triangleIcon}
            >
              <Tooltip>
                <MapPopupContent feature={f} />
              </Tooltip>
            </Marker>
          );
        }
        if (f.geometry.type === 'LineString') {
          return (
            <Polyline
              key={f.id}
              positions={f.geometry.coordinates as LatLngExpression[]}
              pathOptions={{ color: WATER_COLORS.well, weight: 3, opacity: 0.8 }}
            >
              <Tooltip sticky>
                <MapPopupContent feature={f} />
              </Tooltip>
            </Polyline>
          );
        }
        if (f.geometry.type === 'Polygon') {
          return (
            <Polygon
              key={f.id}
              positions={f.geometry.coordinates as LatLngExpression[][]}
              pathOptions={{ color: WATER_COLORS.well, fillColor: WATER_COLORS.watershed, fillOpacity: 0.3, weight: 2 }}
            >
              <Tooltip sticky>
                <MapPopupContent feature={f} />
              </Tooltip>
            </Polygon>
          );
        }
        return null;
      })}
    </LayerGroup>
  );
}
