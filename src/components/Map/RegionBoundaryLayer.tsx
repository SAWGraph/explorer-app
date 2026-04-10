import { LayerGroup, Polygon, Tooltip } from 'react-leaflet';
import type { MapFeature } from '../../types/map';
import type { LatLngExpression } from 'leaflet';
import { MapPopupContent } from './MapPopup';
import { REGION } from './mapColors';

interface RegionBoundaryLayerProps {
  features: MapFeature[];
}

export function RegionBoundaryLayer({ features }: RegionBoundaryLayerProps) {
  return (
    <LayerGroup>
      {features.map((f) => {
        if (f.geometry.type !== 'Polygon') return null;
        return (
          <Polygon
            key={f.id}
            positions={f.geometry.coordinates as LatLngExpression[][]}
            pathOptions={{
              color: REGION.border,
              fillColor: REGION.fill,
              fillOpacity: 0.1,
              weight: 2,
              dashArray: '5, 5',
            }}
          >
            <Tooltip sticky>
              <MapPopupContent feature={f} />
            </Tooltip>
          </Polygon>
        );
      })}
    </LayerGroup>
  );
}
