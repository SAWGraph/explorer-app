# Popup links: only link well-formed http and https IRIs

**Status**: done
**Created**: 2026-11-11
**Completed**: 2026-11-11
**Issue**: #155

## Problem

A published view replays the result the publisher uploaded.
`PUT /api/publish/:id/result` (`server/src/routes/publish.ts:135`) checks only
size, and the client checks only the result's outer shape (`isWireResult`). Every
IRI in a published result is therefore untrusted, and two popup links use one
as their `href` unchecked:

| Site | `href` | Reached from a stored result? |
| --- | --- | --- |
| `MapPopup.tsx:400` stream "Flowline" | `feature.id` (stored `flowline` column) | Yes, directly |
| `MapPopup.tsx:109` sample "Sample Point URI" | `feature.id` (stored `sp` column) | Yes, once the live detail query returns rows |
| `MapPopup.tsx:154` sample "Sample URI" | `?sample` from the live endpoint | No |
| `MapPopup.tsx:244` FRS, `:365` ISGS | built from `\d+` / `\d{12}` regex matches | No, safe |

Measured 2026-11-11:

- Stream popup with `flowline = data:text/html,...` renders `<a href="data:...">`.
  `javascript:` is already neutralised by React.
- Sample popup: `wrapUri` does not escape `>`, so the id
  `https://evil.example/x> <http://w3id.org/...samplePoint.133650` becomes two
  IRIs in `VALUES ?sp`. The live `federation` endpoint returns 25 rows (HTTP
  200, 11.3s), the popup opens, and its link points at `https://evil.example/...`.
- 34,005 IRI values across all 8 cached prebuilt results (development API) all
  match `^https?://` with no IRIREF-forbidden characters. The rule below
  demotes no real link. Graph-wide, the same pattern refuses none of the
  20,345 sample points, 108,612 samples (federation) or 434,501 flowlines
  (hydrologykg).

Ruled out: the aquifer popup's HTML string (`AquiferBoundaryLayer.tsx:97`)
reads a bundled asset, and `legendSvg` is a constant.

## Approach

One helper, one component, used by every popup link built from result data.

- `ui/utils/safeHref.ts`: `safeHref(iri: string): string | undefined` returns
  `iri` when it matches `^https?://[^\s<>"{}|\\^`]+$` (scheme check plus the
  characters SPARQL's IRIREF forbids), otherwise `undefined`. The character
  check is what stops the crafted sample id above. A scheme check alone lets
  it through.
- `IriLink` in `MapPopup.tsx`: renders `<a href target="_blank" rel="noopener noreferrer">`
  when `safeHref` passes, else a `<span>` with the same text. Lines 109, 154
  and 400 switch to it. Line 154 is not reachable today but goes through the
  helper anyway, so the rule is "every link from result data", with no
  exceptions to remember.
- Link text is unchanged (out of scope per the issue).

## Tasks

- [x] Branch `bug/popup-link-schemes` from `development`
- [x] `ui/tests/popupLinks.test.tsx` is the regression test: 62 cases, 16 fail without the fix
- [x] Add `safeHref` with unit cases: http, https, `data:`, `ftp:`, `file:`, relative, `>` and space inside an https IRI
- [x] Add `IriLink`, switch lines 109, 154, 400
- [x] Rule test: every `MapPopupContent` feature type, rendered with an unsafe id, has no `href` built from that id; assert the loop count
- [x] `docs/DEBUGGING.md` entry: root cause and fix
- [x] `npm run build`, `npm test`, `npm run lint`

## Notes

- Follow-up issue, not this PR: `wrapUri` (`engine/templates/samples.ts:3`) puts
  any `http` string in `<...>` without checking for `>`, and passes anything else
  through raw. A published result can rewrite the popup's detail query. The
  endpoint is public and read-only, so it gains nothing a direct query could
  not, but it breaks the rule in `.claude/rules/sparql/queries.md`. The fix
  touches query generation and needs its own snapshot check.
- Server-side validation at publish time stays out of scope, as the issue says.
- All 8 prebuilt questions miss the production cache for this branch's keys
  (404). Unrelated to this issue, worth a look.
