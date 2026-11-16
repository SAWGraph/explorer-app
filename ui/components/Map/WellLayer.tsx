import { useMemo } from 'react';
import { CircleMarker, LayerGroup, Popup, Tooltip } from 'react-leaflet';
import type { MapFeature } from '../../../engine/types/map';
import type { LatLngExpression } from 'leaflet';
import { PointPopupContent, StackedTooltipNote } from './StackedPopup';
import { stacksById } from './stackedPoints';
import { WATER_COLORS } from './mapColors';

interface WellLayerProps {
  features: MapFeature[];
}

export function WellLayer({ features }: WellLayerProps) {
  const stacks = useMemo(() => stacksById(features), [features]);

  return (
    <LayerGroup>
      {features.map((f) => {
        if (f.geometry.type !== 'Point') return null;
        const stack = stacks.get(f.id) ?? [f];
        return (
          <CircleMarker
            key={f.id}
            center={f.geometry.coordinates as LatLngExpression}
            radius={4}
            pane="wellsPane"
            pathOptions={{ color: WATER_COLORS.well, fillColor: WATER_COLORS.aquifer, fillOpacity: 0.7, weight: 2 }}
          >
            <Popup maxWidth={500}>
              <PointPopupContent feature={f} stack={stack} />
            </Popup>
            <Tooltip>
              <strong>{f.properties.name || 'Well'}</strong>
              <StackedTooltipNote stack={stack} />
            </Tooltip>
          </CircleMarker>
        );
      })}
    </LayerGroup>
  );
}
