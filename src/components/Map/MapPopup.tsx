import type { MapFeature, SamplePointDetail, SampleRecord } from '../../types/map';

interface MapPopupProps {
  feature: MapFeature;
}

function SampleDetailPopup({ detail }: { detail: SamplePointDetail }) {
  return (
    <div className="map-popup sample-detail-popup">
      <strong className="sample-popup-title">{detail.samplePointName || 'Sample Point'}</strong>

      {detail.maxResult && (
        <div className="sample-popup-max">
          Max: <span style={{ fontWeight: 600 }}>{detail.maxResult.substance}</span>: {detail.maxResult.value} {detail.maxResult.unit}
          {detail.maxResult.sampleId && (
            <span className="sample-popup-max-source">
              {' '}(from {detail.maxResult.sampleId}{detail.maxResult.date ? ` ${detail.maxResult.date.slice(0, 4)}` : ''})
            </span>
          )}
        </div>
      )}

      <div className="sample-popup-samples">
        {detail.samples.map((sample, i) => (
          <SampleSection key={sample.sampleUri || i} sample={sample} />
        ))}
      </div>
    </div>
  );
}

function SampleSection({ sample }: { sample: SampleRecord }) {
  return (
    <div className="sample-section">
      {sample.sampleUri && (
        <div className="sample-section-field">
          <span className="sample-field-label">Sample URI</span>: <a href={sample.sampleUri} target="_blank" rel="noopener noreferrer">{sample.sampleUri.split('#').pop()}</a>
        </div>
      )}
      {sample.sampleId && (
        <div className="sample-section-field">
          <span className="sample-field-label">Sample ID</span>: {sample.sampleId}
        </div>
      )}
      {sample.date && (
        <div className="sample-section-field">
          <span className="sample-field-label">Date</span>: {sample.date}
        </div>
      )}
      {sample.sampleType && (
        <div className="sample-section-field">
          <span className="sample-field-label">Sample Type</span>: {sample.sampleType}
        </div>
      )}
      {sample.observations.length > 0 && (
        <table className="sample-obs-table">
          <thead>
            <tr>
              <th>Substance</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {sample.observations.map((obs, j) => (
              <tr key={j}>
                <td>{obs.substance}</td>
                <td>{obs.result} {obs.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function MapPopupContent({ feature }: MapPopupProps) {
  const props = feature.properties;

  // Rich sample popup when detail data is available
  if (props.type === 'sample' && feature.sampleDetails) {
    return <SampleDetailPopup detail={feature.sampleDetails} />;
  }

  if (props.type === 'sample') {
    return (
      <div className="map-popup">
        <strong>Sample Point</strong>
        <div>Results: {props.resultCount}</div>
        {props.maxConcentration && <div>Max: {props.maxConcentration}</div>}
        {props.substances && <div>Substances: {String(props.substances).split('; ').slice(0, 3).join(', ')}</div>}
        {props.materials && <div>Materials: {props.materials}</div>}
      </div>
    );
  }

  if (props.type === 'facility') {
    return (
      <div className="map-popup">
        <strong>{props.name || 'Facility'}</strong>
        {props.industryName && <div>Industry: {props.industryName}</div>}
        {props.industryCode && <div>NAICS: {String(props.industryCode).split('/').pop()}</div>}
      </div>
    );
  }

  if (props.type === 'waterBody') {
    return (
      <div className="map-popup">
        <strong>{props.name || 'Surface Water Body'}</strong>
      </div>
    );
  }

  if (props.type === 'well') {
    return (
      <div className="map-popup">
        <strong>{props.name || 'Well'}</strong>
      </div>
    );
  }

  if (props.type === 'regionBoundary') {
    return (
      <div className="map-popup">
        <strong>{props.name || 'Region'}</strong>
      </div>
    );
  }

  return null;
}
