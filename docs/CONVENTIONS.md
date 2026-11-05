# Coding Conventions

The conventions live in `.claude/rules/`, so Claude Code loads them
automatically: the `common/` files every session, the others only when a
matching file is open. They are plain Markdown and are written for people too.

| File | Covers |
| --- | --- |
| `common/workflow.md` | Read the docs first, test queries live, branches, the before-you-finish checks |
| `common/testing.md` | Vitest in `tests/`, questions as data, a regression test for every fix |
| `common/writing.md` | No em or en dashes, commit format, changelog |
| `typescript/coding-style.md` | Types, `unknown` at boundaries, `MapFeature \| null`, installs |
| `react/patterns.md` | Zustand vs React Query, components, Leaflet panes, popups and coordinate order |
| `sparql/queries.md` | Prefixes, safe interpolation, endpoint choice, what a 429 means, changing a query |
