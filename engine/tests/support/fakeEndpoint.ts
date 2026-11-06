// An in-memory stand-in for the SPARQL endpoints, for running the whole engine
// in a test: planning, every request, splitting and probing, with no network.
//
// The test supplies `answer`, which sees each request and returns rows or
// throws. `refuse` throws exactly what the HTTP client throws when QLever stops
// a query (a 429 whose body says it timed out), through the real classifier,
// so the executor reacts as it would in production.
import type { EndpointKey } from '../../constants/endpoints';
import type { SparqlOptions, SparqlRunner } from '../../sparqlClient';
import { SparqlError, classifySparqlFailure, extractSparqlDetail } from '../../sparqlErrors';
import type { SparqlRow } from '../../types/sparql';

export interface FakeCall {
  endpoint: EndpointKey;
  query: string;
  options: SparqlOptions;
}

export interface FakeEndpoint {
  run: SparqlRunner;
  calls: FakeCall[];
}

export function fakeEndpoint(
  answer: (call: FakeCall) => SparqlRow[] | Promise<SparqlRow[]>,
): FakeEndpoint {
  const calls: FakeCall[] = [];
  const run: SparqlRunner = async (endpoint, query, options = {}) => {
    options.signal?.throwIfAborted();
    const call = { endpoint, query, options };
    calls.push(call);
    return answer(call);
  };
  return { run, calls };
}

// QLever's real bodies for each refusal (docs/QUERY-MATRIX.md Part 4).
const REFUSALS = {
  timeout: { status: 429, body: '{"exception":"Operation timed out"}' },
  'out-of-memory': { status: 500, body: '{"exception":"Tried to allocate 2.6 GB, but only 1 GB were available"}' },
  busy: { status: 500, body: '{"exception":"Waited for a result from another thread"}' },
} as const;

export function refuse(kind: keyof typeof REFUSALS = 'timeout'): never {
  const { status, body } = REFUSALS[kind];
  throw new SparqlError(classifySparqlFailure(status, body), status, extractSparqlDetail(body));
}

// The variable a discovery or probe query returns as ?iri, e.g. "facilityA".
export function projected(query: string): string | undefined {
  return query.match(/SELECT DISTINCT \(\?(\w+) AS \?iri\)/)?.[1];
}

// The IRIs a query pins with `VALUES ?<variable> { ... }`, in order.
export function pinned(query: string, variable: string): string[] {
  const block = query.match(new RegExp(`VALUES \\?${variable} \\{([^}]*)\\}`))?.[1];
  return block ? [...block.matchAll(/<([^>]+)>/g)].map((m) => m[1]) : [];
}

export const iriRows = (iris: string[]): SparqlRow[] => iris.map((iri) => ({ iri }));
