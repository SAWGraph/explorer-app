# SAWGraph Explorer

A React app for querying the SAWGraph knowledge graph, which holds PFAS contamination data
for the United States. You build a question out of two entity blocks and a spatial
relationship between them, the app turns that into a sequence of SPARQL queries against five
endpoints, and the results land on a map.

This wiki documents the queries. What each one asks for, why it is shaped the way it is, and
what to check when it returns something surprising.

## Filter dropdowns

Where the options in each filter control come from.

* [Dropdowns](Dropdowns), the index, including the ones that are fixed lists
* [Substance](Dropdowns%20Substance)
* [Material](Dropdowns%20Material)
* [Industry](Dropdowns%20Industry)
* [Industry counts](Dropdowns%20Industry%20Counts)
* [County](Dropdowns%20County)

## Elsewhere in the repository

The wiki is not the only documentation. These live in the repo because they change with the
code and are read while working in it:

* [`docs/ARCHITECTURE.md`](https://github.com/SAWGraph/explorer-app/blob/main/docs/ARCHITECTURE.md),
  how the app is put together, starting from what a knowledge graph is
* [`docs/SCHEMA.md`](https://github.com/SAWGraph/explorer-app/blob/main/docs/SCHEMA.md),
  the predicate and class inventory per endpoint, plus data coverage by state
* [`docs/DEBUGGING.md`](https://github.com/SAWGraph/explorer-app/blob/main/docs/DEBUGGING.md),
  a log of bugs and graph quirks with their causes
* [`docs/CONVENTIONS.md`](https://github.com/SAWGraph/explorer-app/blob/main/docs/CONVENTIONS.md),
  coding standards
* [`docs/queries/`](https://github.com/SAWGraph/explorer-app/tree/main/docs/queries),
  five complete example questions walked through end to end

## Editing this wiki

Do not edit pages in the wiki UI. They are overwritten on every push to `main`. The source
lives at
[`docs/wiki/`](https://github.com/SAWGraph/explorer-app/tree/main/docs/wiki),
so changes go through a pull request alongside the code they describe.
