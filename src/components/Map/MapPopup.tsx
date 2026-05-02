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

function extractIlWellId(uri: string): string | null {
  const match = uri.match(/ISGS-Well\.(\d{12})/);
  return match ? match[1] : null;
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
        <table className="popup-table">
          <tbody>
            <tr>
              <td className="popup-label">Results</td>
              <td>{props.resultCount}</td>
            </tr>
            {props.maxConcentration && (
              <tr>
                <td className="popup-label">Max</td>
                <td>{props.maxConcentration}</td>
              </tr>
            )}
            {props.substances && (
              <tr>
                <td className="popup-label">Substances</td>
                <td>{String(props.substances).split('; ').slice(0, 3).join(', ')}</td>
              </tr>
            )}
            {props.materials && (
              <tr>
                <td className="popup-label">Materials</td>
                <td>{props.materials}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  if (props.type === 'facility') {
    const registryId = feature.id.split('.').pop() || '';
    const epaUrl = `https://frs-public.epa.gov/ords/frs_public2/fii_query_detail.disp_program_facility?p_registry_id=${registryId}`;
    return (
      <div className="map-popup">
        <table className="popup-table">
          <tbody>
            <tr>
              <td className="popup-label">Facility</td>
              <td><a href={epaUrl} target="_blank" rel="noopener noreferrer">{feature.id}</a></td>
            </tr>
            <tr>
              <td className="popup-label">Name</td>
              <td>{props.name || 'Facility'}</td>
            </tr>
            {props.industryCode && (
              <tr>
                <td className="popup-label">Industry code</td>
                <td><a href={String(props.industryCode)} target="_blank" rel="noopener noreferrer">{props.industryCode}</a></td>
              </tr>
            )}
            {props.industryName && (
              <tr>
                <td className="popup-label">Industry name</td>
                <td>{props.industryName}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  if (props.type === 'waterBody') {
    return (
      <div className="map-popup">
        <table className="popup-table">
          <tbody>
            <tr>
              <td className="popup-label">Name</td>
              <td>{props.name || 'Surface Water Body'}</td>
            </tr>
            {props.ftype && (
              <tr>
                <td className="popup-label">Type</td>
                <td>{props.ftype}</td>
              </tr>
            )}
            {props.comid && (
              <tr>
                <td className="popup-label">COMID</td>
                <td>{props.comid}</td>
              </tr>
            )}
            {props.reachcode && (
              <tr>
                <td className="popup-label">Reach code</td>
                <td>{props.reachcode}</td>
              </tr>
            )}
            {props.fcode && (
              <tr>
                <td className="popup-label">FCODE</td>
                <td>{props.fcode}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  if (props.type === 'well') {
    const ilId = extractIlWellId(feature.id);
    return (
      <div className="map-popup">
        <table className="popup-table">
          <tbody>
            <tr>
              <td className="popup-label">Name</td>
              <td>{props.name || 'Well'}</td>
            </tr>
            {props.wellType && (
              <tr>
                <td className="popup-label">Type</td>
                <td>{props.wellType}</td>
              </tr>
            )}
            {props.wellUse && (
              <tr>
                <td className="popup-label">Use</td>
                <td>{props.wellUse}</td>
              </tr>
            )}
            {props.purpose && (
              <tr>
                <td className="popup-label">Purpose</td>
                <td>{props.purpose}</td>
              </tr>
            )}
            {props.owner && (
              <tr>
                <td className="popup-label">Owner</td>
                <td>{props.owner}</td>
              </tr>
            )}
            {props.depth && (
              <tr>
                <td className="popup-label">Depth</td>
                <td>{props.depth} ft</td>
              </tr>
            )}
            {props.overburden && (
              <tr>
                <td className="popup-label">Overburden</td>
                <td>{props.overburden} ft</td>
              </tr>
            )}
            {props.wellYield && (
              <tr>
                <td className="popup-label">Yield</td>
                <td>{props.wellYield}</td>
              </tr>
            )}
            {ilId && (
              <tr>
                <td className="popup-label">Details</td>
                <td>
                  <a href={`https://data.prairie.illinois.edu/GEOPROD/water_summary.aspx?api10=${ilId.slice(0, 10)}&wo=${ilId.slice(10)}`}
                    target="_blank" rel="noopener noreferrer">Data Summary Sheet</a>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  if (props.type === 'stream') {
    return (
      <div className="map-popup">
        <strong>{props.name || 'Stream'}</strong>
        {props.flowType && <div>Type: {props.flowType}</div>}
        {feature.id && (
          <div>
            <a href={feature.id} target="_blank" rel="noopener noreferrer">{feature.id}</a>
          </div>
        )}
      </div>
    );
  }

  if (props.type === 'regionBoundary') {
    return (
      <div className="map-popup">
        <table className="popup-table">
          <tbody>
            <tr>
              <td className="popup-label">Name</td>
              <td>{props.name || 'Region'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}
