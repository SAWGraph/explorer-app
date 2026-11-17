// The href for a link built from result data, or undefined when the value
// should render as text. A published view replays a result its publisher
// uploaded, so every IRI in it is untrusted (#155).
//
// Two checks. The scheme must be http or https. And the IRI must hold none of
// the characters SPARQL's IRIREF forbids (control and space, < > " { } | ^ `
// and backslash): a sample point id like `https://evil.example/x> <real IRI>`
// passes a scheme check, smuggles the real IRI into the popup's detail query
// (wrapUri does not escape `>`), gets real rows back and opens a full popup.
// Every IRI in the 8 cached dashboard results passes (34,005 values, 2026-11-11).
// eslint-disable-next-line no-control-regex -- refusing control characters is the point
const SAFE_IRI =/^https?:\/\/[^\u0000- <>"{}|\\^`]+$/i;

export function safeHref(iri: string | undefined | null): string | undefined {
  return iri && SAFE_IRI.test(iri) ? iri : undefined;
}
