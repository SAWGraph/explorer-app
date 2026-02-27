import { LayerGroup, Polygon, Popup } from 'react-leaflet';
import type { MapFeature } from '../../types/map';
import type { LatLngExpression } from 'leaflet';
import { MapPopupContent } from './MapPopup';

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
              color: '#7f8c8d',
              fillColor: '#bdc3c7',
              fillOpacity: 0.1,
              weight: 2,
              dashArray: '5, 5',
            }}
          >
            <Popup>
              <MapPopupContent feature={f} />
            </Popup>
          </Polygon>
        );
      })}
    </LayerGroup>
  );
}
