import { useEffect, useState } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import { Popup as LeafletPopup } from 'leaflet';
import type { MapFeature } from '../../../engine/types/map';
import { MapPopupContent } from './MapPopup';

// Markers on one point open one popup that lists them all (#153). Each layer
// still draws every marker, so sizes and stacking order are unchanged; only
// the popup knows about the others.

const NOUNS: Record<string, [string, string]> = {
  sample: ['sample', 'samples'],
  facility: ['facility', 'facilities'],
  well: ['well', 'wells'],
};

function noun(feature: MapFeature, count: number): string {
  const [one, many] = NOUNS[String(feature.properties.type)] ?? ['marker', 'markers'];
  return count === 1 ? one : many;
}

function label(feature: MapFeature): string {
  const p = feature.properties;
  return String(p.samplePointName || p.name || (p.type === 'sample' ? 'Sample Point' : p.type === 'facility' ? 'Facility' : 'Well'));
}

// The second line of a list entry: what tells two entries apart at a glance.
function detail(feature: MapFeature): string {
  const p = feature.properties;
  if (p.type === 'sample') return p.maxConcentration != null && p.maxConcentration !== '' ? `Max ${p.maxConcentration}` : '';
  if (p.type === 'facility') return feature.industries?.map((i) => i.name).filter(Boolean).join(', ') || String(p.industryName || '');
  return String(p.wellType || '');
}

interface StackedPopupContentProps {
  // Every feature on the point, in draw order (groupByPoint).
  stack: MapFeature[];
  isOpen: boolean;
}

function StackedPopupContent({ stack, isOpen }: StackedPopupContentProps) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const map = useMap();

  // Reopening the point starts from the list again.
  useMapEvents({ popupclose: () => setPickedId(null) });

  // Leaflet measures a popup once, when it opens; the list and a picked
  // popup differ in size, so re-measure on every switch.
  useEffect(() => {
    map.eachLayer((layer) => {
      if (layer instanceof LeafletPopup && layer.isOpen()) layer.update();
    });
  }, [pickedId, map]);

  const picked = stack.find((f) => f.id === pickedId);
  if (picked) {
    return (
      <div className="stacked-popup">
        <MapPopupContent feature={picked} isOpen={isOpen} />
        <button type="button" className="stacked-popup-back" onClick={() => setPickedId(null)}>
          ← All {stack.length} at this point
        </button>
      </div>
    );
  }

  return (
    <div className="map-popup stacked-popup">
      <strong className="stacked-popup-title">
        {stack.length} {noun(stack[0], stack.length)} at this point
      </strong>
      <ul className="stacked-popup-list">
        {/* The last one drawn is the one on top, so it leads the list. */}
        {[...stack].reverse().map((f) => (
          <li key={f.id}>
            <button type="button" onClick={() => setPickedId(f.id)}>
              <span className="stacked-popup-name">{label(f)}</span>
              {detail(f) && <span className="stacked-popup-detail">{detail(f)}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface PointPopupContentProps {
  feature: MapFeature;
  // The features sharing this feature's point, itself included.
  stack: MapFeature[];
  isOpen?: boolean;
}

// What a marker's popup shows: its own content, or the list when it shares
// its point with others.
export function PointPopupContent({ feature, stack, isOpen = true }: PointPopupContentProps) {
  if (stack.length < 2) return <MapPopupContent feature={feature} isOpen={isOpen} />;
  return <StackedPopupContent stack={stack} isOpen={isOpen} />;
}

// The tooltip line that says a marker is not alone on its point.
export function StackedTooltipNote({ stack }: { stack: MapFeature[] }) {
  if (stack.length < 2) return null;
  return <div className="stacked-tooltip-note">+{stack.length - 1} more at this point</div>;
}
