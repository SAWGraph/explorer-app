import { LayerGroup, Polyline, Polygon, Marker, Popup, Tooltip } from 'react-leaflet';
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
              <Popup maxWidth={500}>
                <MapPopupContent feature={f} />
              </Popup>
              <Tooltip pane="tooltipPane">
                <strong>{f.properties.name || 'Surface Water Body'}</strong>
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
              <Popup maxWidth={500}>
                <MapPopupContent feature={f} />
              </Popup>
              <Tooltip sticky pane="tooltipPane">
                <strong>{f.properties.name || 'Surface Water Body'}</strong>
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
              <Popup maxWidth={500}>
                <MapPopupContent feature={f} />
              </Popup>
              <Tooltip sticky pane="tooltipPane">
                <strong>{f.properties.name || 'Surface Water Body'}</strong>
              </Tooltip>
            </Polygon>
          );
        }
        return null;
      })}
    </LayerGroup>
  );
}
