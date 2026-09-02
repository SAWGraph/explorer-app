# County dropdown

Narrows a query to specific counties inside the chosen state. Multi select. Leaving it empty
means the whole state.

![County dropdown](images/dropdown_county.png)

## What it does

It lives in the Region selector, directly under the State dropdown, and only renders once a
state has been picked. Before that there is nothing sensible to show, so it is not there at
all.

The list is fetched fresh for each state, sorted alphabetically by name. Labels arrive from
the graph fully qualified, as `Androscoggin County, Maine` rather than `Androscoggin`, and
are shown as is.

While the fetch is in flight the select shows its loading state, wired straight from the
hook's `isLoading`. This is the only discovery dropdown that surfaces loading at all, and
the reason is the next paragraph.

There is **no fallback list**. Every other query backed dropdown has hardcoded defaults to
fall back on. This one does not, because a wrong county list is worse than no county list:
you would be offering filters that silently match nothing. If the endpoint fails you get an
empty dropdown.

The county code the app actually uses is not returned by the query. It is derived on the
client by taking the county URI and splitting on dots, so
`kwgr:administrativeRegion.USA.23005` becomes `23005`. That five digit FIPS code is what
downstream pipeline queries put into their `VALUES` clauses.

## The SPARQL query

Endpoint is `spatialkg`. No region variant, since the state code is the whole point.

```sparql
SELECT DISTINCT ?county ?countyName WHERE {
  ?county kwg-ont:administrativePartOf kwgr:administrativeRegion.USA.23 ;
          rdfs:label ?countyName .
  FILTER(STRSTARTS(STR(?county), STR(kwgr:)))
} ORDER BY ?countyName
```

Line by line:

* `?county kwg-ont:administrativePartOf kwgr:administrativeRegion.USA.23` finds everything
  that is administratively part of Maine. The `23` is substituted with whichever state FIPS
  code was selected.
* Note there is no `+` on that predicate, unlike the sample point region pattern used by the
  Substance and Material queries. A single hop from the state lands exactly on counties,
  which is what makes this query short. Adding `+` would pull in sub county divisions too.
* `rdfs:label ?countyName` is the display name.
* The `FILTER` keeps only URIs in the KnowledgeWeb Graph resource namespace. Other graphs
  describe the same counties under their own URIs, and without this the dropdown would list
  each county several times.
* `ORDER BY ?countyName` gives the alphabetical ordering. `DISTINCT` guards against a county
  carrying more than one matching label.

Verified against the live endpoint. Maine returns its counties in order, starting
Androscoggin, Aroostook, Cumberland.

## How it is wired up

* The control is a shared `FlatSelect`, rendered at
  [`RegionSelector.tsx:47`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/RegionSelector.tsx#L47),
  inside a block that only renders when a state is set.
* Its options come from
  [`useCounties(stateCode)`](https://github.com/SAWGraph/explorer-app/blob/main/src/hooks/useDiscoveryQueries.ts#L142),
  called at
  [`RegionSelector.tsx:12`](https://github.com/SAWGraph/explorer-app/blob/main/src/components/QueryEditor/RegionSelector.tsx#L12).
* The query text is built by
  [`buildDiscoverCountiesQuery()`](https://github.com/SAWGraph/explorer-app/blob/main/src/engine/templates/regions.ts#L3).
* It runs through
  [`executeSparql()`](https://github.com/SAWGraph/explorer-app/blob/main/src/engine/sparqlClient.ts#L4)
  against the `spatialkg` URL in
  [`endpoints.ts`](https://github.com/SAWGraph/explorer-app/blob/main/src/constants/endpoints.ts).
* The state list feeding it is static, `ALL_US_STATES` and `AVAILABLE_STATE_FIPS` in
  [`regions.ts`](https://github.com/SAWGraph/explorer-app/blob/main/src/constants/regions.ts).

Cached under `['counties', <stateCode>]` with `staleTime: Infinity` and gated by
`enabled: !!stateCode`, so nothing fires until a state exists. No `placeholderData` and no
`retry` override, which is what makes the loading state visible here and invisible elsewhere.

The code derivation happens at
[`useDiscoveryQueries.ts:151`](https://github.com/SAWGraph/explorer-app/blob/main/src/hooks/useDiscoveryQueries.ts#L151).

## If it looks wrong

**No County dropdown at all.** No state is selected. It is conditionally rendered, not
disabled.

**Empty after picking a state.** Either the `spatialkg` endpoint is down, or that state has
no administrative regions loaded. There is no fallback to mask it, so an empty list here is
always worth investigating. Check the browser network tab for the request.

**Stuck showing the loading state.** The request has not resolved. Unlike the other
dropdowns there is no placeholder data underneath it, so a slow endpoint is visible rather
than hidden.

**Duplicate counties.** The namespace `FILTER` is not doing its job, which would mean the
same county is described more than once inside the KWG resource namespace itself.

**A county selection matches nothing downstream.** Check the derived code. The client
takes everything after the last dot in the URI, so a URI shaped differently than
`administrativeRegion.USA.23005` would yield garbage.

## See also

* [Dropdowns](Dropdowns), the index of all filter controls
* [Dropdowns Substance](Dropdowns%20Substance) and [Dropdowns Material](Dropdowns%20Material),
  both of which consume the selected county codes
