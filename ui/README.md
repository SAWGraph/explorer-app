# UI

The React app: the dashboard, the question editor, the map, and the publish
flow. It builds an `AnalysisQuestion`, hands it to the engine (`../engine/`),
and draws what comes back. All query logic lives in the engine, so this folder
can be rewritten without touching it.

`index.html` at the repo root loads `ui/main.tsx`. Vite, `public/` and
`package.json` stay at the root.

## Folder map

| Folder | What lives there |
|---|---|
| `main.tsx`, `App.tsx` | Routes: `/`, `/q/:queryId`, `/p/:publishId`, `/design-guide` |
| `components/` | One folder per screen area: Dashboard, QueryEditor, Map, Pipeline, Publish, Layout, DesignSystem, common |
| `hooks/` | React Query and pipeline hooks |
| `store/queryStore.ts` | Zustand: the question, results, view state |
| `storage/` | localStorage: saved questions, publish edit tokens |
| `api/` | Our own API (result cache, publish), not SPARQL. Reads `VITE_API_BASE_URL` |
| `tours/` | The guided walkthroughs |
| `constants/`, `types/`, `utils/` | UI-only pieces: the blank question, map bounds and thumbnails, saved-question types, export and tag colours |
| `assets/` | Logo and the precomputed aquifer boundaries |

## How the UI calls the engine

| UI | Engine |
|---|---|
| `hooks/useQueryPipeline.ts` | Checks the result cache (`api/resultCacheClient.ts`), then `planPipeline` and `executePipeline` |
| `hooks/useMapLayers.ts` | `transform*ToFeatures` turns the result's rows into layers |
| `hooks/useDiscoveryQueries.ts` | `executeSparql` with the builders in `engine/templates/regions.ts` fills the dropdowns |
| `hooks/useSampleDetails.ts` | `engine/templates/hydrate.ts` for one sample's measurements |
| Question bar, cards, editor | `generateQuestion` for the sentence |

## Tests

```bash
npm run test:ui   # only ui/tests/, in jsdom
```

These render real components with the network mocked: the edit modal flows,
the sample popup size, the water body layer, and the wells state gating.

## Further reading

- `docs/CONVENTIONS.md`: state, styling and component conventions
- `docs/wiki/`: what each dropdown shows and where its options come from
