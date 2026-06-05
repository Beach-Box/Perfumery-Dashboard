# Perfumery Dashboard

A local-first Vite React dashboard for perfumery formulation, ingredient cataloging, IFRA/compliance review, supplier pricing/import workflows, inventory planning, bench stocks, and founder launch planning.

This repo is currently best treated as a private workstation tool. It builds and has meaningful helper test coverage, but it is not production SaaS: there is no backend, no auth layer, no durable multi-user database, and some external/API workflows run directly in the browser.

## Current Status

- Buildable Vite React app.
- Helper test suite passes.
- Most app orchestration, embedded data, UI, and runtime state still live in a very large `src/App.jsx`.
- Important data is split across embedded JavaScript, structured JSON registries, browser `localStorage`, supplier import review flows, and script-generated payloads.
- Documentation and source-of-truth boundaries are now being made explicit so future work can resume more safely.

See [docs/repo_state_audit_2026-06-05.md](docs/repo_state_audit_2026-06-05.md) for the latest full repo audit.

## What The App Does

- Formula library, formula detail, formula comparison, and formula build workflows.
- Ingredient catalog search, filtering, dossier views, and manual/local material support.
- IFRA and compliance guidance using structured lookup data.
- Supplier Hub workflows, especially Fraterworks workbook/JSON/catalog import support.
- Supplier pricing, procurement, and basket planning helpers.
- Inventory and bench stock/dilution planning.
- Founder launch scenarios, SKU economics, readiness/trust summaries, and share/export briefs.
- Evidence/source-document review workflows for strengthening ingredient truth over time.

## Local-First Warning

This app stores important state in the browser. Local edits, saved builds, inventory, founder scenarios, supplier review state, evidence review state, bench stocks, and API keys can live in `localStorage` for the browser profile you use.

Treat browser-stored API keys as local/private only. The app has browser-side calls to external services, including Anthropic API calls using a user-entered key. Do not deploy this as a shared app without redesigning secrets and external calls behind a server or proxy.

## Tech Stack

- Vite
- React 19
- Recharts
- `xlsx`
- Node test runner for helper tests
- Structured JSON registries in `src/data/`
- Local browser persistence through `localStorage`

Use Node 20 or newer.

## Setup

```sh
npm install
```

If your shell cannot find `node` or `npm`, make sure your Node 20+ install is on `PATH`. On the audited machine, validation used `/usr/local/bin` explicitly because default `node` was not available in one shell context.

## Run

```sh
npm start -- --host 0.0.0.0 --port 5173
```

Vite will print the local preview URL.

## Build And Test

```sh
npm run validate
git diff --check
```

`npm run validate` currently runs `npm run test:helpers` and then `npm run build`.

There is no active lint script in `package.json` at the time of writing.

## Important Directories

| Path | Purpose |
| --- | --- |
| `src/App.jsx` | Main app, major UI surfaces, embedded `RAW_DB`, `PRICING`, and seeded formulas. Edit carefully. |
| `src/lib/` | Runtime, IFRA, supplier import, formula, storage, and preflight helpers. Prefer focused helper changes with tests. |
| `src/data/` | Structured registries for IFRA, material normalization, source documents, evidence candidates, supplier products, review queues, and price draft seeds. |
| `tests/` | Node helper tests for formula/runtime and supplier import logic. |
| `scripts/` | Data intake, evidence, supplier, and catalog review/apply tooling. Run dry-runs before applying. |
| `docs/` | Repository state, architecture, and local operator documentation. |
| `downloads/source_documents/` | Ignored local PDF/source-document cache. Do not commit. |
| `dist/` | Ignored Vite build output. Do not commit. |

## Data Safety Notes

- Do not commit `dist/`, `node_modules/`, `.env`, browser secrets, or local source-document downloads.
- `downloads/source_documents/` is ignored and can contain local evidence PDFs.
- `localStorage` can contain user-created formulas, inventory, manual material edits, supplier data, evidence review state, and API keys.
- Supplier imports and evidence scripts should be treated as review-first workflows. Run dry-runs, inspect payloads and diffs, then apply only intentional changes.
- IFRA/compliance changes should use the structured lookup files and helper paths. Do not hardcode new IFRA limits in UI code.

For the current source-of-truth model, read [docs/data_sources.md](docs/data_sources.md).

## Known Risks

- `src/App.jsx` is extremely large, so small behavior changes can have broad review and merge risk.
- Source-of-truth boundaries are split across embedded app data, JSON registries, local browser overlays, imports, and generated review payloads.
- Browser-side API key storage and direct external calls are local/private-tool grade only.
- Helper tests exist, but no UI/e2e test suite was found in the audit.
- Vite build passes but warns about large chunks.
- Node emits module-type warnings during helper tests because the package does not declare `"type": "module"`.
- `public/index.html`, `src/App.jsx.backup`, and `beach-box-perfumery/*` appear stale or legacy but are intentionally left untouched until a dedicated cleanup task.

## Recommended Validation

Before making changes:

```sh
git branch --show-current
git status --short
npm run validate
git diff --check
```

After documentation-only changes:

```sh
git status --short
npm run validate
git diff --check
```

After runtime/data changes, also run any targeted tests or dry-run/preflight scripts that cover the touched area.

## More Docs

- [Repository state audit](docs/repo_state_audit_2026-06-05.md)
- [Data source architecture](docs/data_sources.md)
- [Local operator guide](docs/local_operator_guide.md)
