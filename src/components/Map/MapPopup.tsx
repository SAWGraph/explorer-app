import type { MapFeature, SamplePointDetail, SampleRecord } from '../../types/map';
import { useSampleDetails } from '../../hooks/useSampleDetails';
import { useQueryStore } from '../../store/queryStore';

interface MapPopupProps {
  feature: MapFeature;
  // True once this feature's popup is open. Sample observation rows are fetched
  // on open rather than for every sample up front — see useSampleDetails.
  isOpen?: boolean;
}

// Wraps the sample popup so the fetch only starts when the popup is open.
function SamplePopup({ feature, isOpen }: { feature: MapFeature; isOpen: boolean }) {
  const question = useQueryStore((s) => s.question);
  const sampleFilters =
    question.blockA.type === 'samples'
      ? question.blockA.sampleFilters
      : question.blockC.sampleFilters;
  const { data, isLoading, isError } = useSampleDetails(feature.id, isOpen, sampleFilters);
  const props = feature.properties;

  if (data) {
    return (
      <SampleDetailPopup
        id={feature.id}
        detail={data}
        resultCount={props.resultCount}
        sampleCount={props.sampleCount}
      />
    );
  }

  return (
    <div className="map-popup">
      <table className="popup-table">
        <tbody>
          {props.sampleCount && (
            <tr>
              <td className="popup-label">Samples</td>
              <td>{props.sampleCount}</td>
            </tr>
          )}
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
      <div className="popup-detail-status">
        {isLoading && 'Loading measurements…'}
        {isError && 'Could not load measurements for this sample point.'}
      </div>
    </div>
  );
}

function SampleDetailPopup({
  id,
  detail,
  resultCount,
  sampleCount,
}: {
  id: string;
  detail: SamplePointDetail;
  resultCount?: string | number;
  sampleCount?: string | number;
}) {
  const reportedCount = detail.samples.reduce(
    (n, s) => n + s.observations.filter((o) => o.result !== null).length,
    0,
  );

  return (
    <div className="map-popup sample-detail-popup">
      <strong className="sample-popup-title">{detail.samplePointName || 'Sample Point'}</strong>

      {id && (
        <div className="sample-section-field">
          <span className="sample-field-label">Sample Point URI</span>:{' '}
          <a href={id} target="_blank" rel="noopener noreferrer">{id}</a>
        </div>
      )}

      {(resultCount || sampleCount) && (
        <div className="sample-section-field">
          {sampleCount && (
            <>
              <span className="sample-field-label">Samples</span>: {sampleCount}
            </>
          )}
          {resultCount && sampleCount && ' · '}
          {resultCount && (
            <>
              {/* The count and the table used to disagree: 271 here above 44
                  rows, because the table dropped everything without a unit.
                  Both numbers are shown now so neither looks wrong. */}
              <span className="sample-field-label">Results</span>: {resultCount}
              {reportedCount > 0 && ` (${reportedCount} with a value)`}
            </>
          )}
        </div>
      )}

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
  const reported = sample.observations.filter((o) => o.result !== null);

  // status -> the substances carrying it, deduped and sorted
  const withoutValue = new Map<string, string[]>();
  for (const o of sample.observations) {
    if (o.result !== null) continue;
    const key = o.status ?? 'no value reported';
    const list = withoutValue.get(key) ?? [];
    if (!list.includes(o.substance)) list.push(o.substance);
    withoutValue.set(key, list);
  }
  for (const list of withoutValue.values()) list.sort();

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
      {reported.length > 0 && (
        <table className="sample-obs-table">
          <thead>
            <tr>
              <th>Substance</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {reported.map((obs, j) => (
              <tr key={j}>
                <td>{obs.substance}</td>
                <td>{obs.result} {obs.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Results with no number, listed by substance rather than one row each.
          A Maine point has 1,171 of them against 479 with values, which as
          individual rows would bury the measurements. They are identical to one
          another, so grouping hides nothing: only the reported values raise the
          question of which fish they came from, and those stay one per row. */}
      {[...withoutValue.entries()].map(([status, substances]) => (
        <div className="sample-section-field" key={status}>
          <span className="sample-field-label">{STATUS_LABELS[status] ?? status}</span>{' '}
          ({substances.length}): {substances.join(', ')}
        </div>
      ))}
    </div>
  );
}

// The graph's two ways of saying "no number", which do not mean the same thing.
const STATUS_LABELS: Record<string, string> = {
  'non-detect': 'Not detected',
  'non-quantified': 'Not quantified',
};

function extractIlWellId(uri: string): string | null {
  const match = uri.match(/ISGS-Well\.(\d{12})/);
  return match ? match[1] : null;
}

export function MapPopupContent({ feature, isOpen = true }: MapPopupProps) {
  const props = feature.properties;

  if (props.type === 'sample') {
    return <SamplePopup feature={feature} isOpen={isOpen} />;
  }

  if (props.type === 'facility') {
    // The facility name links to its EPA FRS record, and nothing else links out.
    //
    // It used to link to the w3id.org/fio IRI with EPA FRS as a second link
    // beside it. Both fio links here, the facility and the NAICS code, redirect
    // to the same raw ontology file (SAWGraph/fio ontology/fio.ttl) rather than
    // to anything about that facility or that code, so they told a reader
    // nothing. Verified against the live URLs, 2026-09-15.
    const registryId = feature.id.split('.').pop() || '';
    const epaUrl = `https://frs-public.epa.gov/ords/frs_public2/fii_query_detail.disp_program_facility?p_registry_id=${registryId}`;
    return (
      <div className="map-popup">
        <table className="popup-table">
          <tbody>
            <tr>
              <td className="popup-label">Facility</td>
              <td>
                {registryId ? (
                  <a href={epaUrl} target="_blank" rel="noopener noreferrer">
                    {props.name || 'Facility'} ({registryId})
                  </a>
                ) : (
                  props.name || 'Facility'
                )}
              </td>
            </tr>
            {props.industryCode && (
              <tr>
                <td className="popup-label">Industry</td>
                <td>
                  {props.industryName || 'Industry'} (NAICS{' '}
                  {String(props.industryCode).split('-').pop()})
                </td>
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
        <table className="popup-table">
          <tbody>
            <tr>
              <td className="popup-label">Name</td>
              <td>{props.name || 'Stream'}</td>
            </tr>
            {props.flowType && (
              <tr>
                <td className="popup-label">Type</td>
                <td>{props.flowType}</td>
              </tr>
            )}
            {props.pathLength && (
              <tr>
                <td className="popup-label">Flow distance</td>
                <td>{Number(props.pathLength).toFixed(1)} km</td>
              </tr>
            )}
            {feature.id && (
              <tr>
                <td className="popup-label">Flowline</td>
                <td><a href={feature.id} target="_blank" rel="noopener noreferrer">{feature.id}</a></td>
              </tr>
            )}
          </tbody>
        </table>
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
