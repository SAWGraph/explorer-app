import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

const POLYLINE_STYLE: L.PolylineOptions = {
  color: '#4f46e5',
  weight: 3,
  opacity: 0.95,
  dashArray: '6 6',
};

const PREVIEW_STYLE: L.PolylineOptions = {
  color: '#4f46e5',
  weight: 2,
  opacity: 0.55,
  dashArray: '3 6',
};

const VERTEX_STYLE: L.CircleMarkerOptions = {
  radius: 4,
  color: '#ffffff',
  weight: 2,
  fillColor: '#4f46e5',
  fillOpacity: 1,
};

function fmtMetric(m: number): string {
  if (m < 1000) return `${m.toFixed(0)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

function fmtImperial(m: number): string {
  const ft = m * 3.28084;
  if (ft < 5280) return `${ft.toFixed(0)} ft`;
  return `${(ft / 5280).toFixed(2)} mi`;
}

function totalDistance(points: L.LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += points[i - 1].distanceTo(points[i]);
  }
  return total;
}

export function MeasureControl() {
  const map = useMap();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(false);
  const [done, setDone] = useState(false);
  const [vertices, setVertices] = useState<L.LatLng[]>([]);
  const [previewDist, setPreviewDist] = useState<number | null>(null);

  const polylineRef = useRef<L.Polyline | null>(null);
  const previewRef = useRef<L.Polyline | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const pendingClickRef = useRef<number | null>(null);

  useEffect(() => {
    const Control = L.Control.extend({
      onAdd() {
        const div = L.DomUtil.create('div', 'measure-control leaflet-bar');
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);
        containerRef.current = div;
        setReady(true);
        return div;
      },
      onRemove() {
        containerRef.current = null;
        setReady(false);
      },
    });

    const control = new Control({ position: 'topleft' });
    control.addTo(map);

    return () => {
      control.remove();
    };
  }, [map]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'r' && e.key !== 'R') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      setActive((v) => !v);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!active) {
      polylineRef.current?.remove();
      previewRef.current?.remove();
      markersRef.current?.remove();
      polylineRef.current = null;
      previewRef.current = null;
      markersRef.current = null;
      if (pendingClickRef.current != null) {
        window.clearTimeout(pendingClickRef.current);
        pendingClickRef.current = null;
      }
      setVertices([]);
      setPreviewDist(null);
      setDone(false);
      map.getContainer().classList.remove('measure-active');
      return;
    }

    map.getContainer().classList.add('measure-active');
    if (!markersRef.current) {
      markersRef.current = L.layerGroup().addTo(map);
    }

    if (done) {
      previewRef.current?.remove();
      previewRef.current = null;
      setPreviewDist(null);
      return;
    }

    const onClick = (e: L.LeafletMouseEvent) => {
      if (pendingClickRef.current != null) {
        window.clearTimeout(pendingClickRef.current);
      }
      const latlng = e.latlng;
      pendingClickRef.current = window.setTimeout(() => {
        pendingClickRef.current = null;
        setVertices((prev) => [...prev, latlng]);
      }, 250);
    };
    const onDblClick = () => {
      if (pendingClickRef.current != null) {
        window.clearTimeout(pendingClickRef.current);
        pendingClickRef.current = null;
      }
      setDone(true);
    };
    const onMouseMove = (e: L.LeafletMouseEvent) => {
      setVertices((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        if (previewRef.current) {
          previewRef.current.setLatLngs([last, e.latlng]);
        } else {
          previewRef.current = L.polyline([last, e.latlng], PREVIEW_STYLE).addTo(map);
        }
        setPreviewDist(last.distanceTo(e.latlng));
        return prev;
      });
    };
    const onMouseOut = () => {
      previewRef.current?.remove();
      previewRef.current = null;
      setPreviewDist(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingClickRef.current != null) {
          window.clearTimeout(pendingClickRef.current);
          pendingClickRef.current = null;
        }
        polylineRef.current?.setLatLngs([]);
        markersRef.current?.clearLayers();
        previewRef.current?.remove();
        previewRef.current = null;
        setVertices([]);
        setPreviewDist(null);
      }
    };

    map.on('click', onClick);
    map.on('dblclick', onDblClick);
    map.on('mousemove', onMouseMove);
    map.on('mouseout', onMouseOut);
    map.doubleClickZoom.disable();
    window.addEventListener('keydown', onKeyDown);

    return () => {
      map.off('click', onClick);
      map.off('dblclick', onDblClick);
      map.off('mousemove', onMouseMove);
      map.off('mouseout', onMouseOut);
      map.doubleClickZoom.enable();
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [active, done, map]);

  useEffect(() => {
    if (!active) return;
    if (!markersRef.current) return;

    if (vertices.length >= 2) {
      if (polylineRef.current) {
        polylineRef.current.setLatLngs(vertices);
      } else {
        polylineRef.current = L.polyline(vertices, POLYLINE_STYLE).addTo(map);
      }
    } else if (polylineRef.current) {
      polylineRef.current.setLatLngs(vertices);
    }

    markersRef.current.clearLayers();
    for (const v of vertices) {
      L.circleMarker(v, VERTEX_STYLE).addTo(markersRef.current);
    }
  }, [vertices, active, map]);

  const total = totalDistance(vertices);
  const runningTotal = previewDist != null ? total + previewDist : total;

  if (!ready || !containerRef.current) return null;

  return createPortal(
    <>
      <button
        type='button'
        className={`measure-control__toggle${active ? ' measure-control__toggle--active' : ''}`}
        onClick={() => setActive((v) => !v)}
        aria-pressed={active}
        aria-label={active ? 'Stop measuring (R)' : 'Measure distance on map (R)'}
        title={active ? 'Stop measuring (R)' : 'Measure distance (R)'}
      >
        <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
          <path d='M3 16 16 3l5 5L8 21z' />
          <path d='m7 12 2 2' />
          <path d='m10 9 2 2' />
          <path d='m13 6 2 2' />
        </svg>
      </button>
      {active && (
        <div className='measure-control__readout'>
          <div className='measure-control__readout-row'>
            <span className='measure-control__readout-value'>{fmtMetric(runningTotal)}</span>
            <span className='measure-control__readout-sep'>·</span>
            <span className='measure-control__readout-value'>{fmtImperial(runningTotal)}</span>
          </div>
          <div className='measure-control__readout-hint'>
            {done
              ? 'Done · click the ruler to clear and remeasure'
              : vertices.length === 0
                ? 'Click to add a starting point'
                : 'Click to add · double-click to finish · esc to clear'}
          </div>
        </div>
      )}
    </>,
    containerRef.current,
  );
}
