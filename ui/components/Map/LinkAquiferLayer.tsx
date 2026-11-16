import { LayerGroup, Polygon, Popup, Tooltip } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import type { MapFeature } from '../../../engine/types/map';
import { MapPopupContent } from './MapPopup';
import { WATER_COLORS } from './mapColors';

interface LinkAquiferLayerProps {
  features: MapFeature[];
}

// The aquifers that link the two sides of a groundwater-connected result
// (#121). Context, not an answer: drawn under the counties and every data layer,
// and only on that kind of result.
export function LinkAquiferLayer({ features }: LinkAquiferLayerProps) {
  return (
    <LayerGroup>
      {features.map((f) => {
        if (f.geometry.type !== 'Polygon') return null;
        return (
          <Polygon
            key={f.id}
            positions={f.geometry.coordinates as LatLngExpression[][]}
            pane="linkAquiferPane"
            bubblingMouseEvents
            pathOptions={{
              color: WATER_COLORS.flowline,
              fillColor: WATER_COLORS.aquifer,
              fillOpacity: 0.25,
              weight: 2,
            }}
          >
            <Popup maxWidth={400}>
              <MapPopupContent feature={f} />
            </Popup>
            <Tooltip sticky>
              <strong>{f.properties.name || 'Aquifer'}</strong>
            </Tooltip>
          </Polygon>
        );
      })}
    </LayerGroup>
  );
}
