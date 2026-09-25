# Working checklist — Material dropdown + upstream breaking changes

Consolidates the scratch notes of 2026-08-28 and the 2026-09-01 / 2026-09-08
emails from Katrina Schweikert and David Kedrowski. Status verified against the
repo and live endpoints on 2026-09-11.

---

## A. Material dropdown

- [x] **A1 — Hierarchical, like the Industry dropdown.** Shipped in `6bf13d8`.
      Group headings are tickable and collapsible, counts roll up from the
      leaves. `HierarchicalSelect` now takes a generic `items: TreeItem[]` with
      an optional explicit `parent`, so it serves both NAICS (prefix-derived
      tree) and Material (explicit parents).
      *Files:* `HierarchicalSelect/`, `SampleFilters.tsx`, `types/query.ts`,
      `questionGenerator.ts`

- [x] **A2 — Labels from the CosoExtension.** Done, but not the way the note
      assumed. The four direct `coso:MaterialSample` subclasses
      (`contaminoso_materialSample_ext.ttl`) are used as the **group headings**,
      not as replacements for the option labels. Bucketing is
      `MIN(?bucketPrio)` over Biota 1 / Solid 2 / Water 3 / Air 4, with
      unmatched types falling to "Other".

- [x] **A3 — Katrina: stop using the long names, narrow to a few categories.**
      Closed by A2. The long source-vocabulary names are still there, but they
      are now one fold-down below five short headings. Swapping the labels
      outright was tried and reverted — it dropped real detail (fish species
      collapsed into a single "Biota" row) for no gain.

- [x] **A4 — Fix the dead material-type namespace.** `ef0c40b`. All six
      `FALLBACK_MATERIAL_TYPES` IRIs and the one prebuilt-card filter moved from
      `v1/me-egad-data#` to the live root `v1/me-egad#`; sludge code `.SO` → `.SU`.

- [ ] **A5 — `FALLBACK_MATERIAL_TYPES` entries carry no `group`.** All six land
      under "Other" if discovery ever fails over. Deliberate for now and
      documented on the wiki as a tell that discovery failed. Add `group` if the
      fallback ever becomes user-visible in practice.

- [ ] **A6 — `useQuestionTotals.ts:17` calls `useMaterialTypes()` with no
      region** while the dropdown calls it with one. "All material types" never
      collapses to "any", so the question text stays verbose at region scope.

---

## B. Production bug — Samples downstream of waste treatment, Indiana

- [ ] **B1 — HTTP 500 from `federation`:**
      `Tried to allocate 409.6 MB, but only 351 MB were available`.
      Reproducible on an idle endpoint, so it is not load.
      **Root cause identified:** the `FIND_TARGET_IRIS` step projects only
      `?spC` but still binds `?observationC ?substanceC ?sampleC ?matTypeC
      ?matTypeLabelC ?resultC ?unitC`. With no sample filters set, statewide
      Indiana is large enough that the unused join blows the memory budget.
      **Fix:** drop unbound-and-unprojected variables from that step. Trimming
      two of them on the PFHpA card already took it from hard timeout to 24.7s.

- [ ] **B2 — Same class of failure on the PFHpA Cumberland card.** Sample side
      works now (65 points / 171 observations, 2.3s); the downstream hydrology
      join still times out. Same fix likely applies. Note QLever reports a query
      timeout as **HTTP 429**, which reads like rate limiting and is not — check
      the response body.

---

## C. Upstream breaking changes (Katrina, 2026-09-01)

- [x] **C1 — Controlled vocabulary in the root namespaces** (`me_egad`,
      `us_wqp`). This is what A4 fixed. Audited `src/` on 2026-09-11: no
      `-data#` IRI is hardcoded anywhere. The only sawgraph prefix we ship is
      `me_egad: <http://w3id.org/sawgraph/v1/me-egad#>`, which is correct.

- [x] **C2 — Instance data moved to `v2/me-egad-data#` and
      `v2/us-wqp-data#`.** Verified live 2026-09-11 on both `sawgraph` and
      `federation`: the split is complete and nothing is dual-published.
      Instance data is 100% v2 (63,744 Maine + 44,868 WQP samples; 833,201 +
      208,219 observations), vocabulary is 100% root v1 (86 `me-egad` + 85
      `us-wqp` material types = the 171 in the dropdown). No v1 instance IRI and
      no `-data#` vocabulary IRI survives anywhere.

      No query change needed — we never pin an instance IRI, and the only URI
      parsing in the app takes the fragment after `#`, which is
      namespace-agnostic. The 2026-09-09 audit already ran all 8 pipelines
      against this v2 data, so the pipelines are verified too.

      **One real gap found and fixed:** questions outlive the graph. Saved
      questions (`localStorage`) and published workflows (server DB) store a
      full `AnalysisQuestion`, vocabulary IRIs included. Anything saved before
      the reload still pins the dead `v1/<source>-data#` form and silently
      returns an empty map — the same failure mode as A4, but persisted where a
      code fix could not reach it. Added `src/utils/migrateQuestion.ts`,
      applied in `queryStore.loadQuestion`, which every load path funnels
      through. Rewrites on read, so no DB migration.

      *Files:* `src/utils/migrateQuestion.ts`, `src/store/queryStore.ts`

- [ ] **C2a — Noticed while auditing, unrelated to the reload.** 10,014 WQP
      sample points use geoconnex slash URIs (`https://geoconnex.us/iow/wqp/…`)
      with no `#` at all. `MapPopup.tsx:70` shortens a URI with
      `.split('#').pop()`, which returns the whole URL when there is no hash, so
      those popups print a full link instead of a short ID. Cosmetic.

- [ ] **C3 — Non-detect handling.** Open question, and the one with real
      consequences: ~90,881 results hang on it.
      We currently use `coso:NonDetectQuantityValue`
      (`src/engine/templates/samples.ts:24`). Katrina's example filters on
      `coso:NonQuantifiedQuantityValue`. Live counts: 723,410 vs 814,291.
      **Action: ask Katrina which one "non-detect" means in the new model, and
      whether the two are meant to nest.**
      We already avoid `coso:measurementValue` for exactly the reason her note
      flags — it is multi-valued for non-detects and returns both strings — so
      that part needs no change.

- [ ] **C4 — Re-run the full audit after the composite graph rebuild.** The
      changes are live on the individual FRINK endpoints but not yet composited.
      All 8 prebuilt pipelines and all 15 discovery queries.

---

## D. David Kedrowski's note (2026-09-08) — no action

- [x] **D1.** The PFAS2-on-GraphDB issue (moving
      `?ar3 rdf:type kwg-ont:AdministrativeRegion_3` from the PFAS service to
      the Spatial service) is GraphDB-specific. He says explicitly it is not an
      issue against FRINK's federated endpoint, which is what we hit. Recorded
      for context only.

---

## E. Docs and publishing

- [x] **E1 — Wiki pages rewritten** for the material tree, plus two new
      `DEBUGGING.md` entries and the namespace split in `SCHEMA.md` (`c66febd`).
- [ ] **E2 — Merge `development` → `main` to publish the wiki.**
      `.github/workflows/wiki-sync.yml` triggers only on push to `main` with
      paths `docs/wiki/**`. Until then the GitHub Wiki still shows the old
      Material page, and the `blob/main/...#L` deep links point at line numbers
      that only exist on `development`.

---

## Suggested order

1. **C3** — blocked on Katrina, so ask now and work on the rest while waiting.
2. **B1** — real production 500, root cause already known.
3. **E2** — one merge, unblocks the wiki and ships A1–A4 to users.
4. **A6**, then **A5**, then **C2/C4** once the composite graph rebuilds.
