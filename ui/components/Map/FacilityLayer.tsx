import { useMemo } from 'react';
import { LayerGroup, Marker, Popup, Tooltip } from 'react-leaflet';
import type { MapFeature } from '../../../engine/types/map';
import type { LatLngExpression } from 'leaflet';
import { PointPopupContent, StackedTooltipNote } from './StackedPopup';
import { stacksById } from './stackedPoints';
import { createSquareIcon } from './layerStyles';
import { INDUSTRY_COLOR_MAP, INDUSTRY_STROKE_MAP, FACILITY_DEFAULT, FACILITY_STROKE_DEFAULT } from './mapColors';

interface FacilityLayerProps {
  features: MapFeature[];
}

function getNaicsPrefix(feature: MapFeature): string {
  const code = String(feature.properties.industryCode || '');
  const lastPart = code.split('/').pop() || '';
  return lastPart.replace(/^NAICS-/, '').slice(0, 4);
}

function getColor(feature: MapFeature): string {
  return INDUSTRY_COLOR_MAP[getNaicsPrefix(feature)] || FACILITY_DEFAULT;
}

function getStroke(feature: MapFeature): string {
  return INDUSTRY_STROKE_MAP[getNaicsPrefix(feature)] || FACILITY_STROKE_DEFAULT;
}

// Every industry the facility came back with, by name.
function industryNames(feature: MapFeature): string {
  if (feature.industries?.length) return feature.industries.map((i) => i.name).filter(Boolean).join(', ');
  return String(feature.properties.industryName || '');
}

export function FacilityLayer({ features }: FacilityLayerProps) {
  const stacks = useMemo(() => stacksById(features), [features]);

  return (
    <LayerGroup>
      {features.map((f) => {
        const stack = stacks.get(f.id) ?? [f];
        return (
          <Marker
            key={f.id}
            position={f.geometry.coordinates as LatLngExpression}
            icon={createSquareIcon(getColor(f), getStroke(f))}
          >
            <Popup maxWidth={600}>
              <PointPopupContent feature={f} stack={stack} />
            </Popup>
            <Tooltip>
              <strong>{f.properties.name || 'Facility'}</strong>
              {industryNames(f) && <div>{industryNames(f)}</div>}
              <StackedTooltipNote stack={stack} />
            </Tooltip>
          </Marker>
        );
      })}
    </LayerGroup>
  );
}
