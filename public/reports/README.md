# Temporary reports

One-off HTML reports for the team, served as static files at
`/reports/<name>.html` on the **development** deployment only. A build
pointed at the production API leaves this folder out (`vite.reports.ts`,
checked by `ui/tests/reportsDevOnly.test.ts`). They are not linked from the app.

Each report is a single self-contained `.html` file that carries its own
expiry date:

```html
<meta name="expires" content="YYYY-MM-DD" />
```

Default to 30 days. Once a report is past its date, `npm test` fails
(`ui/tests/reportExpiry.test.ts`): delete the file and its row below, or move
the date on purpose if the report is still in use.

| Report | For | Expires |
|---|---|---|
| `subdivision-coverage.html` | #123, which entity types have subdivision links | 2026-12-07 |
