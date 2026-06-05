# Local Operator Guide

This guide is for safely running, validating, and maintaining the Perfumery Dashboard on a local machine.

The app should currently be treated as a private workstation tool. Do not assume production security, shared-user durability, or backend-managed secrets.

## Local Install

Use Node 20 or newer.

```sh
npm install
```

If `node` or `npm` is not found, fix your shell `PATH` before continuing.

## Local Run

```sh
npm start -- --host 0.0.0.0 --port 5173
```

Open the URL printed by Vite.

## Build And Test

```sh
npm run validate
git diff --check
```

`npm run validate` currently runs helper tests first, then the production build.

Expected current behavior:

- Build passes.
- Helper tests pass.
- Vite may warn about large chunks.
- Node may warn about ES module reparsing because the package does not declare `"type": "module"`.

## Before Making Changes

Run:

```sh
git branch --show-current
git status --short
npm run validate
git diff --check
```

Then read:

- `AGENTS.md`
- `README.md`
- `docs/repo_state_audit_2026-06-05.md`
- `docs/data_sources.md`

Confirm you are on `chatgpt-feature-work` unless the user explicitly instructs otherwise.

## After Making Changes

For documentation-only changes:

```sh
git status --short
npm run validate
git diff --check
```

For runtime or data changes, also run targeted tests or dry-run/preflight commands for the touched area.

Always report:

- Files changed.
- Whether build passed.
- Whether helper tests passed if run.
- Remaining concerns.

## Working Tree Already Dirty

If `git status --short` shows existing changes before you start:

- Treat them as user or previous-agent work.
- Do not revert them.
- Do not run destructive cleanup commands.
- Inspect only what you need to understand your task.
- Keep your edits narrowly scoped.
- In the final response, separate pre-existing dirty files from files you changed.

If existing changes touch the same files you need to edit, read the relevant diffs first and work with them. Ask the user only if the overlap makes the task genuinely unsafe or impossible.

## LocalStorage Persistence

The app stores important local state in browser `localStorage`, including:

- API key text
- Inventory
- Formula notes
- Supplier data
- Local draft ingredients
- Manual material edits
- Saved builds
- Formula comparison state
- Critique lens
- Founder launch scenarios
- Supplier import review state
- Evidence candidate review state
- Supplier page facts
- Bench stocks

This state is browser-profile-local. A different browser, incognito session, or cleared site data may not have it.

Before clearing browser storage, changing localStorage keys, or testing flows that overwrite local data, export or record anything important from the UI.

## Browser-Stored API Keys

The app can store a user-entered API key in localStorage and call external APIs directly from the browser.

Operational rules:

- Use only local/private keys in a trusted browser profile.
- Do not commit keys to `.env`, docs, screenshots, JSON payloads, or test fixtures.
- Do not deploy this app as a shared public tool while browser-side key handling remains in place.
- If shared deployment becomes a goal, move secrets and external API calls behind a backend or proxy first.

## Ignored Local Files

These are intentionally ignored:

- `node_modules/`
- `dist/`
- `.env`
- `.vscode/`
- `.DS_Store`
- `downloads/source_documents/`

`npm run build` writes `dist/`. Do not commit it.

`downloads/source_documents/` can contain local PDFs or source-document downloads. Do not commit those files unless a future task explicitly changes the policy and updates `.gitignore`.

## Supplier Import Workflow

Supplier imports should be review-first.

Recommended flow:

1. Start clean or record existing dirty state with `git status --short`.
2. Use the app or scripts to generate/import supplier review data.
3. Review conflicts and unresolved rows in the UI or generated payload.
4. Dry-run any apply script before writing:

```sh
node scripts/apply_supplier_import_drafts.mjs <approved-drafts.json> --dry-run
node scripts/apply_catalog_supplier_links.mjs <catalog-row-drafts.json> --dry-run
node scripts/apply_catalog_supplier_prices.mjs <supplier-price-drafts.json> --dry-run
node scripts/apply_catalog_row_drafts.mjs <catalog-row-drafts.json> --dry-run
```

5. Inspect the dry-run output.
6. Apply only the specific reviewed payload if the dry-run is clean.
7. Run:

```sh
npm run validate
git diff --check
```

Notes:

- Supplier data can support supplier records without becoming canonical ingredient chemistry.
- New catalog rows and pricing edits can touch `src/App.jsx`; review those diffs carefully.
- Fraterworks is the most developed provider path. Other provider surfaces may be placeholders.

## Evidence And Source Document Workflow

Evidence/source-document workflows should also be review-first.

Useful read/report commands:

```sh
python3 scripts/report_source_document_acquisition_gaps.py --report-path <report.json>
python3 scripts/inspect_source_document_pdfs.py --report-path <report.json>
node scripts/discover_supplier_documents.cjs <manifest.json> --dry-run
```

Review-only registry/candidate generation commands:

```sh
node scripts/import_source_documents.cjs <manifest.json> --dry-run
node scripts/generate_evidence_candidates.cjs <manifest.json> --dry-run
node scripts/promote_evidence_candidates.mjs <approved-evidence-candidates.json> --dry-run
```

Only remove `--dry-run` after reviewing:

- The source manifest.
- The generated candidate or promotion payload.
- The expected file writes.
- The `git diff`.

Be careful with:

- `--download`, which can write local PDF files.
- `--update-registry`, which can mutate source registries.
- Evidence promotion, which can write reviewed fields into helper/canonical support layers.

Do not treat downloaded PDFs or generated candidates as canonical truth until reviewed and promoted.

## IFRA And Compliance Changes

IFRA/compliance logic should use structured lookup files and helper paths.

Prefer:

- `src/data/ifra_master_standards.json`
- `src/data/ifra_combined_package.json`
- `src/lib/ifra_combined_package.js`
- Focused helper tests

Avoid:

- Hardcoded new IFRA limits in UI code.
- Unreviewed edits to generated IFRA data.
- Supplier-imported compliance claims becoming canonical without review.

## What Not To Commit

Do not commit:

- `dist/`
- `node_modules/`
- `.env`
- Browser API keys
- Local source-document downloads
- Temporary reports in random locations
- Unreviewed generated import/apply payloads
- Unrelated source edits from a dirty working tree

Commit documentation, scripts, tests, or structured data only when they are intentional task outputs.

## Before Starting A New Codex Task

1. Read the user request and `AGENTS.md`.
2. Check the branch:

```sh
git branch --show-current
```

3. Check dirty state:

```sh
git status --short
```

4. Review this guide and [data_sources.md](data_sources.md) if the task touches app data.
5. Decide whether the task is documentation-only, helper logic, UI/runtime, structured data, or script/operator work.
6. Keep edits scoped to the task.

## If Something Looks Stale

Known stale or legacy areas include:

- `public/index.html`
- `src/App.jsx.backup`
- `beach-box-perfumery/*`
- Parts of `WORKFLOW.md`

Do not clean these up as drive-by work. Handle them in a dedicated cleanup task with build/test validation.
