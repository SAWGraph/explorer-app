---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.mts"
---
# TypeScript

The compiler is `strict` with `noUnusedLocals` and `noUnusedParameters`.
`npm run build` is the type check.

- Explicit parameter and return types on exported functions. Let locals infer.
- `interface` for object shapes, `type` for unions and utility types. String
  literal unions over `enum`.
- No `any`. Use `unknown` for SPARQL bindings, API responses and storage
  reads, then narrow (see `isWireResult` in `src/engine/wire.ts`).
- In `.map()` callbacks that may drop items, return `MapFeature | null`
  explicitly, then filter. Avoids type predicate errors with `.filter(Boolean)`.
- Copy, don't mutate, when the value is shared state or a step context
  (`context.targetIris = [...iris]`).
- Install with `npm install --legacy-peer-deps` (react-leaflet's peer range
  excludes React 19). Add a dependency only when a few lines cannot do it.
- After editing, check LSP diagnostics and fix type errors before moving on.
