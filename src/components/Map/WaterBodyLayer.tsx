import { LayerGroup, Polyline, Polygon, Marker, Popup } from 'react-leaflet';
import type { MapFeature } from '../../types/map';
import type { LatLngExpression } from 'leaflet';
import { MapPopupContent } from './MapPopup';
import { triangleIcon } from './layerStyles';

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
              <Popup>
                <MapPopupContent feature={f} />
              </Popup>
            </Marker>
          );
        }
        if (f.geometry.type === 'LineString') {
          return (
            <Polyline
              key={f.id}
              positions={f.geometry.coordinates as LatLngExpression[]}
              pathOptions={{ color: '#3498db', weight: 3, opacity: 0.8 }}
            >
              <Popup>
                <MapPopupContent feature={f} />
              </Popup>
            </Polyline>
          );
        }
        if (f.geometry.type === 'Polygon') {
          return (
            <Polygon
              key={f.id}
              positions={f.geometry.coordinates as LatLngExpression[][]}
              pathOptions={{ color: '#2980b9', fillColor: '#3498db', fillOpacity: 0.3 }}
            >
              <Popup>
                <MapPopupContent feature={f} />
              </Popup>
            </Polygon>
          );
        }
        return null;
      })}
    </LayerGroup>
  );
}
