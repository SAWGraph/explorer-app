# Writing

Applies to docs, commit messages, PR and issue bodies, changelog entries, and
every user-facing string in the app (tour copy, prebuilt question text, error
messages, empty states, glossary).

- No em dashes or en dashes as punctuation. Use a comma, colon, parenthesis or
  a new sentence. Ranges read `0.15 to 0.4`. Hyphens inside words
  (`non-detect`), CLI flags (`--index`) and identifiers are fine.
- Sweep app copy before committing:
  `grep -rn $'[–—]' src --include="*.tsx" --include="*.ts"` (ignore comment hits).
- Commits are Conventional Commits with a scope when one fits:
  `fix(engine): ...`, `docs(sweep): ...`, `test(engine): ...`, `chore: ...`.
  Subject says what changed in plain words, lowercase, no trailing period.
- Never add a changelog entry on your own. After a feature or fix, ask:
  "Would you like me to add this to the changelog?"
