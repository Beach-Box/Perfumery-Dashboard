# Repository State Audit - 2026-06-05

This audit summarizes the current checked-out state of the Perfumery Dashboard repository on `chatgpt-feature-work`.

Scope constraints followed:

- Documentation-only audit. No runtime code, dependency, test, or build configuration was changed.
- Existing uncommitted source edits were preserved and treated as part of the current working state.
- Validation was limited to local build and existing helper tests.

## 1. Executive Summary

The repo is an advanced local-first perfumery operating dashboard, not a scratch prototype. It contains a Vite React app with formula management, ingredient cataloging, IFRA/compliance guidance, supplier pricing/import workflows, inventory and bench stock tools, and founder/business launch planning.

The core product is currently concentrated in a very large `src/App.jsx` file, supported by focused helper modules under `src/lib/` and structured JSON registries under `src/data/`. The helper modules show meaningful test coverage, especially around formula runtime behavior, supplier imports, identity/compliance support, founder launch math, and bench stock calculations.

Validation on this audit date:

- `npm run build`: passed.
- `npm run test:helpers`: passed, 54 tests and 0 failures.
- Build warning: Vite reports large chunks, including a roughly 1.9 MB minified main app chunk. This is a maintainability/performance warning, not a build failure.
- Test warning: Node reparses ES module-style helper files because `package.json` does not declare `"type": "module"`.

The main risks are not that the app is absent or unable to build. The risks are maintainability, source-of-truth clarity, browser-only secret handling, limited UI-level tests, stale documentation/templates, and the sheer blast radius of `src/App.jsx`.

Recommended next work should focus on tightening documentation, adding smoke/e2e coverage, making data-source boundaries explicit, and gradually extracting runtime/UI areas from `App.jsx` without changing behavior.

## 2. Product Capabilities Observed

The app currently appears to support these product areas:

- Formula library and formula detail workflows:
  - Seeded formulas and saved formulas.
  - Formula normalization, versions, draft handling, locking, notes, comparison state, and build-to-library flows.
  - Formula cost, chemistry, vapor pressure, odor value, performance, critique, and IFRA guidance.

- Build lab:
  - Ad hoc formula builder with ingredient search/add/edit behavior.
  - Batch size math and ingredient gram/percent calculations.
  - Active material handling for dilutions and bench stocks.
  - Save/duplicate/import-style flows into the formula library.

- Ingredient catalog:
  - Searchable/filterable ingredient records sourced from embedded `RAW_DB`.
  - Canonical normalization enrichment from `src/data/material_normalization.json`.
  - Detail/dossier modal with identity, supplier, technical, compliance, and manual edit sections.
  - Linked duplicate support, supplier relationship reassignment, substitution suggestions, and review draft flows.

- IFRA/compliance guidance:
  - Structured IFRA package usage through `src/lib/ifra_combined_package.js`.
  - Material identity resolution, CAS comparison support, IFRA UI states, active restricted percentage calculations, and finished-product guidance.
  - IFRA master standard data from structured JSON rather than only hardcoded display limits.

- Supplier and procurement workflows:
  - Supplier Hub with Fraterworks as the primary active provider.
  - Supplier price rows, package sizes, unit prices, stock flags, supplier links, and basket/procurement helpers.
  - Trusted workbook import, Fraterworks Shopify JSON import, full catalog sync, pasted JSON normalization, and exception queue flows.
  - Local/manual supplier evidence and generated proposal review workflows.

- Founder/business planning:
  - Founder dashboard/launch planner with scenario persistence.
  - SKU economics, capital-constrained recommendations, launch readiness, trust summaries, and share/export brief generation.

- Inventory and bench operations:
  - Local inventory storage.
  - Batch planner/procurement recommendations.
  - Bench stock and working dilution logic that compounds parent activity and carrier dilution.

- Source document and evidence workflow:
  - Local registries for source documents, evidence candidates, supplier products, supplier import review queue, and supplier price draft seeds.
  - Scripts for source document intake, PDF inspection, evidence candidate generation/promotion, supplier document discovery, and catalog/supplier draft application.

- Local persistence:
  - Browser `localStorage` stores API keys, inventory, formula notes, supplier data, local draft ingredients, manual record edits, saved builds, formula compare state, critique lens, founder scenarios, supplier import review, evidence review, supplier page facts, and bench stocks.

## 3. Repo Map

| Path | Purpose | Notes |
| --- | --- | --- |
| `AGENTS.md` | Repository instructions for Codex work | Requires Vite, Node 20+, `npm run build`, `chatgpt-feature-work`, and no committed `dist/`. |
| `package.json` | App dependencies and scripts | Uses Vite, React 19, Recharts, and `xlsx`. Scripts are `start`, `build`, `preview`, and `test:helpers`. |
| `vite.config.js` | Vite config | Uses `@vitejs/plugin-react` and manual chunks for Recharts, React vendor, IFRA runtime, and app runtime helpers. |
| `index.html` | Active Vite HTML entry | Correct Vite entry with `/src/index.jsx`. |
| `public/index.html` | Stale CRA-style template | Contains `%PUBLIC_URL%` and "React App" template text. It is not the active Vite entrypoint. |
| `.eslintrc.json` | Minimal ESLint config | Only declares `@typescript-eslint/parser`; that parser was not found in `package.json` or `package-lock.json`, and there is no lint script. |
| `.gitignore` | Ignore rules | Ignores `node_modules/`, `dist/`, `.env`, `.vscode/`, `.DS_Store`, and `downloads/source_documents/`. |
| `README.md` | Minimal project README | Only says the project was created with CodeSandbox. It does not describe current setup or capabilities. |
| `WORKFLOW.md` | Branch/development notes | Useful branch guidance, but contains stale/malformed markdown and recovery commands that should be treated carefully. |
| `src/index.jsx` | React entrypoint | Renders `<App />` in `StrictMode`. |
| `src/App.jsx` | Main app | About 102,741 lines in the current working tree. Contains most UI, embedded catalog/pricing/formula data, state, orchestration, and browser provider calls. |
| `src/App.jsx.backup` | Tracked backup artifact | Appears legacy/generated. It increases repo noise and should be reviewed before removal. |
| `src/styles.css` | Minimal CSS | Only contains a basic `.App` rule. Most styling is inline or inside app code. |
| `src/lib/browser_storage.js` | Local storage keys/helpers | Centralizes app localStorage keys and defensive JSON/text reads/writes. |
| `src/lib/formula_runtime_helpers.js` | Formula library helpers | Handles formula keys, saved formula normalization, version history, and compare state helpers. |
| `src/lib/ifra_combined_package.js` | IFRA/identity/source data adapter | Wraps structured IFRA package JSON, material normalization, evidence/source/supplier registries, identity matching, CAS support, and IFRA guidance helpers. |
| `src/lib/perfumer_runtime_helpers.js` | Main business/runtime helper module | Formula math, founder planning, procurement, bench stocks, critiques, material truth, substitution, supplier adapter, and review workflow helpers. |
| `src/lib/supplier_workbook_import_helpers.js` | Supplier import helper module | Trusted workbook parsing, Fraterworks product JSON handling, full catalog sync, compliance extraction, and reference workbook export. |
| `src/lib/*_preflight.mjs` | Preflight validators | Validate draft payloads before scripts mutate catalog/supplier data. |
| `src/data/*.json` | Structured registries | IFRA package, IFRA master standards, material normalization, source docs, evidence candidates, supplier products, supplier import review queue, and supplier price draft seeds. |
| `tests/*.test.mjs` | Node helper tests | Broad helper-level tests. No UI/e2e tests were found. |
| `scripts/*` | Data intake/application tooling | PDF extraction, source document registry import, supplier document discovery, evidence promotion, supplier product import, and catalog/supplier draft application. |
| `scripts/proof_*` and fixtures | Proof/demo payloads | Demonstrate import/review flows and preflight paths. |
| `downloads/source_documents/` | Local PDF evidence folder | Present locally with 13 PDF files; ignored by git. |
| `dist/` | Vite build output | Present locally and ignored by git. Must not be committed. |
| `.claude/skills/*` | Claude workflow skill docs | Skills exist for IFRA audit, ingredient identity resolution, smoke tests, dilution checks, and commit checks. |
| `beach-box-perfumery/*` | Legacy/prototype IFRA patch files | Tracked. Contains old patch helper language about removing hardcoded IFRA limits. |

## 4. Architecture

The app is a browser-only Vite React SPA. There is no backend server, API route layer, database, authentication system, or server-side secret management in the repo.

High-level flow:

1. `index.html` loads `/src/index.jsx`.
2. `src/index.jsx` renders `src/App.jsx`.
3. `src/App.jsx` imports structured data adapters, formula/runtime helpers, supplier import helpers, and JSON registries.
4. `RAW_DB`, `PRICING`, and `FORMULAS_INIT` are embedded inside `App.jsx` and enriched by helper modules and JSON data.
5. Browser state and user edits are persisted through `localStorage` via `src/lib/browser_storage.js`.
6. External calls are made directly from the browser for AI-assisted workflows and supplier fetch/import flows.

Important architectural facts:

- Most UI composition and orchestration is still monolithic in `src/App.jsx`.
- The helper modules are comparatively well factored and are the current best place for low-risk logic changes.
- IFRA/compliance and source evidence are partly structured in JSON registries and should remain structured.
- App chunking exists in Vite config, but the main app chunk remains very large after build.
- The app has no server-side authority for secrets, user identity, multi-user data, durable storage, or audit logs.

Observed external integration surfaces:

- Anthropic Messages API calls from the browser using a user-entered API key stored in localStorage.
- Fraterworks Shopify-style product JSON/catalog fetch flows.
- Local workbook import/export through `xlsx`.
- Node scripts that can discover/download supplier/source documents when run manually.

## 5. Core Logic Areas

### Formula Runtime

Key files:

- `src/App.jsx`
- `src/lib/formula_runtime_helpers.js`
- `src/lib/perfumer_runtime_helpers.js`
- `tests/perfumer_runtime_helpers.test.mjs`

The formula layer handles:

- Formula identity, saved formula records, and versions.
- Ingredient line normalization and active grams.
- Batch scaling.
- Formula chemistry summary and performance modeling.
- Formula critique, comparison, and substitution review drafts.
- Founder scenario integration and launch readiness scoring.

### IFRA and Identity

Key files:

- `src/lib/ifra_combined_package.js`
- `src/data/ifra_combined_package.json`
- `src/data/ifra_master_standards.json`
- `src/data/material_normalization.json`

The IFRA layer handles:

- Structured IFRA master material records and category limits.
- Ingredient identity map lookup.
- CAS support and comparison, including mixtures and multi-CAS ordering.
- IFRA UI states and material support states.
- Active restricted percent and finished-product guidance.

Important rule: changes in this area should continue using structured lookup files, not hardcoded limits.

### Supplier Import and Pricing

Key files:

- `src/App.jsx`
- `src/lib/supplier_workbook_import_helpers.js`
- `src/lib/perfumer_runtime_helpers.js`
- `src/data/supplier_product_registry.json`
- `src/data/supplier_import_review_queue.json`
- `src/data/supplier_price_draft_seeds.json`
- `tests/supplier_workbook_import_helpers.test.mjs`

The supplier layer handles:

- Supplier product identities and supplier links.
- Price rows and package variants.
- Trusted workbook import plans.
- Fraterworks JSON paste/import and full catalog sync plans.
- Review-first handling for unresolved or risky supplier data.
- Local draft ingredient creation where explicitly requested.

### Evidence and Source Documents

Key files:

- `src/data/source_document_registry.json`
- `src/data/evidence_candidate_registry.json`
- `scripts/import_source_documents.cjs`
- `scripts/discover_supplier_documents.cjs`
- `scripts/generate_evidence_candidates.cjs`
- `scripts/promote_evidence_candidates.mjs`
- `scripts/inspect_source_document_pdfs.py`
- `scripts/report_source_document_acquisition_gaps.py`

The evidence workflow is designed around review and promotion:

- Register source documents.
- Inspect or discover candidate source documents.
- Generate evidence candidates.
- Promote low-risk approved fields into structured helper seeds.
- Keep unresolved or risky material in review queues.

### Founder and Procurement Planning

Key files:

- `src/lib/perfumer_runtime_helpers.js`
- `src/App.jsx`
- `tests/perfumer_runtime_helpers.test.mjs`

The founder workflow handles:

- Product context and SKU economics.
- Formula readiness/trust summaries.
- Launch batch planning.
- Procurement recommendations under capital constraints.
- Scenario persistence and share/export summaries.

## 6. Data Model and Schema Snapshot

The app currently uses a split source-of-truth model:

- Embedded app data in `src/App.jsx`.
- Structured registry JSON under `src/data/`.
- Local browser overlays in `localStorage`.
- Manual script-generated review/apply payloads.

Observed embedded data counts from `src/App.jsx`:

| Data set | Count |
| --- | ---: |
| `RAW_DB` rows | 1,252 |
| Pricing catalog rows | 1,251 |
| Supplier rows in `PRICING` | 1,590 |
| Supplier price points | 10,101 |
| Seeded formulas | 4 active hero-scent development seeds; prior 10 legacy seeds archived |
| Seeded formula ingredient lines | 129 active hero seed lines |

The active formula seeds are now the focused hero-scent development set:
`Random Concoction - Original`, `Skin-Air Bridge`, `Damp Shoreline v1`, and
`Damp Shoreline v2`. The previous 10-formula beach-line seed set is archived in
[`docs/archive/legacy_formula_seeds_2026-06-07.md`](archive/legacy_formula_seeds_2026-06-07.md)
and filtered out of active saved-build library construction when old
seed-derived records exist in browser localStorage.

Common `RAW_DB` fields observed:

- Identity and descriptive: `n`, `note`, `type`, `cas`, `inci`, `scentClass`, `scentSummary`, `scentDesc`, `descriptorTags`.
- Chemistry/physical: `MW`, `xLogP`, `TPSA`, `HBD`, `HBA`, `VP`, `densityGmL`, `densityGmL2`, `odorThreshold_ngL`, `vpConfidence`, `isIsomerMix`.
- Compliance and usage: `ifra`, `ifraLimit`, `ifraLimits`, `dilutionFactor`, `isUVCB`.
- Supplier/commerce: `supplier`, `char`, `rep`.

Observed structured registry summaries:

| File | Snapshot |
| --- | --- |
| `src/data/ifra_combined_package.json` | Contains `meta`, schema, 3 IFRA master materials, 66 ingredient identity map entries, compliance config, and stats. |
| `src/data/ifra_master_standards.json` | Generated from `IFRA - 51st Amendment.pdf`; metadata shows 726 PDF pages, 259 extracted standards, 168 category-limit records, 86 prohibitions, and 30 specifications. |
| `src/data/material_normalization.json` | 36 top-level material normalization entries. |
| `src/data/source_document_registry.json` | Registry version 1; 15 documents and 7 intake targets. |
| `src/data/evidence_candidate_registry.json` | Registry version 1; 5 evidence candidates and 7 candidate targets. |
| `src/data/supplier_product_registry.json` | Registry version 1; 14 supplier products across Eden Botanicals and Fraterworks. |
| `src/data/supplier_import_review_queue.json` | Registry version 1; 3 review queue items. |
| `src/data/supplier_price_draft_seeds.json` | Registry version 1; 3 trusted review-only price draft seeds. |

Primary localStorage keys:

- `bb_api_key`
- `bb_inventory`
- `bb_formula_notes`
- `bb_supplier_data_v4`
- `bb_local_draft_ingredients_v1`
- `bb_manual_record_edits_v1`
- `bb_saved_builds`
- `bb_formula_compare_state`
- `bb_critique_lens`
- `bb_founder_launch_scenarios_v1`
- `bb_supplier_import_local_review_v1`
- `bb_evidence_candidate_review_v1`
- `bb_supplier_layer_page_facts_v1`
- `bb_bench_stocks_v1`

## 7. Current Development Status

| Area | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Build system | Working | `npm run build` passed | Vite emits large chunk warning. |
| Helper tests | Working | `npm run test:helpers` passed, 54/54 | Node emits module type warning. |
| App shell | Buildable | Vite transformed 690 modules | No browser smoke/e2e run during this audit. |
| Formula runtime | Actively developed and tested | Broad tests in `perfumer_runtime_helpers.test.mjs` | UI-level confidence is lower than helper-level confidence. |
| IFRA/compliance logic | Structured and partially hardened | JSON registries plus tested helper behavior | Data coverage is still limited by identity/evidence registry completeness. |
| Ingredient catalog | Feature-rich but monolithic | Embedded catalog and large UI in `App.jsx` | Source-of-truth split needs documentation and guardrails. |
| Supplier Hub | Advanced, review-first, partly provider-specific | Fraterworks import tests and helper logic pass | Other provider cards are still "coming soon". |
| Founder dashboard | Implemented with tested helper math | Founder launch/trust/scenario tests pass | Business assumptions should be documented for non-author users. |
| Inventory/bench stocks | Implemented and tested at helper level | Bench stock tests pass | Needs UI smoke coverage for common workflows. |
| Evidence/source docs | Partially operational pipeline | Registries and scripts exist | Promotion workflow should be documented and CI-guarded. |
| Documentation | Underdeveloped | README is minimal; WORKFLOW is partly stale | This audit is the first substantial state doc found. |
| Lint/static analysis | Not active | No lint script; skeletal ESLint config | `.eslintrc.json` references a parser not found in package manifests. |
| Runtime security | Local/private-tool grade | API key stored in localStorage and browser direct API call | Not production-ready for shared deployment without server-side mediation. |

## 8. Gaps, Risks, and Technical Debt

- `src/App.jsx` is extremely large, about 102,741 lines in the current working tree. This makes code review, merge conflict resolution, testing, and performance-oriented work harder.
- Important data is split across embedded JavaScript, structured JSON registries, generated review payloads, and localStorage overlays. The source-of-truth rules are understandable from code but not yet documented clearly enough.
- Browser direct API-key usage is suitable for local/private operation only. A production or shared deployment should avoid storing third-party API keys in localStorage and sending them from the browser.
- There is no backend, auth, database, migration layer, or durable multi-user storage. That is fine for a local workstation tool, but it defines the current product boundary.
- No UI/e2e tests were found. Helper tests are useful, but they do not prove major tab flows render, forms work, imports are reachable, or modals remain usable.
- The build passes but warns about chunks larger than 500 kB after minification. The main app bundle is especially large.
- `README.md` is stale/minimal and does not describe the actual app.
- `public/index.html` is a stale CRA-style template with `%PUBLIC_URL%`, while `index.html` is the real Vite entry.
- `WORKFLOW.md` contains useful branch rules but also stale formatting and dangerous recovery commands that should be rewritten carefully.
- `.eslintrc.json` references `@typescript-eslint/parser`, but that dependency was not found in `package.json` or `package-lock.json`, and no lint script exists.
- `src/App.jsx.backup` and `beach-box-perfumery/*` are tracked legacy/prototype artifacts. They may be useful historically, but they add confusion to current repo state.
- Several provider surfaces are explicitly "Provider coming soon"; Fraterworks appears to be the only deeply implemented supplier provider.
- Supplier and source-document scripts can reach external supplier/document URLs. They need careful dry-run defaults, review logging, and clear operator docs before routine use.
- Default shell PATH did not expose `node` during the audit. Validation succeeded by explicitly using `/usr/local/bin` in PATH.
- Current working tree was dirty before this audit. Existing uncommitted files include `src/App.jsx`, several helper modules, and tests. This audit did not attempt to classify those diffs as user work versus previous agent work.

## 9. Recommended Next Build Steps

1. Update `README.md` with current setup, local run, validation commands, product scope, and data safety warnings.
2. Add a short architecture/data-source document that explains embedded `RAW_DB`, `PRICING`, JSON registries, localStorage overlays, and script promotion/application flows.
3. Add a minimal UI smoke test suite for the major tabs: Founder, Formulas, Build, Catalog, Advisor, Suppliers, Inventory, and Dilution.
4. Add CI or a local aggregate validation script that runs build plus helper tests.
5. Start extracting stable islands from `src/App.jsx` into modules: tab definitions, data constants, modal components, supplier UI, founder UI, and catalog helpers.
6. Keep IFRA/compliance changes behind structured registry updates and helper tests.
7. Decide whether `public/index.html`, `src/App.jsx.backup`, and `beach-box-perfumery/*` should remain tracked, move to docs/archive, or be removed in a dedicated cleanup PR.
8. Harden AI/supplier network integrations by documenting local-only usage now and planning a server/proxy path if shared deployment is required.
9. Add JSON registry validation to catch schema drift before changes are applied to app data.
10. Add a bundle-size tracking note or threshold once the initial modularization work begins.

## 10. Suggested Codex Task Queue

High-signal, small-to-medium tasks for future Codex turns:

1. "Update README for the current Vite perfumery dashboard, including setup, validation, local-only data warnings, and app capability overview."
2. "Add a docs/data_sources.md explaining RAW_DB, PRICING, src/data registries, localStorage overlays, and script promotion workflows."
3. "Add a Playwright or equivalent smoke test that boots the app and verifies all primary tabs render without crashing."
4. "Extract tab metadata and tab shell rendering from src/App.jsx without changing behavior."
5. "Extract Founder dashboard helpers/components from src/App.jsx without changing behavior, then run build and helper tests."
6. "Add a registry validation script for src/data JSON files and wire it into an npm script."
7. "Clean up stale CRA public/index.html if confirmed unused by Vite."
8. "Review whether src/App.jsx.backup and beach-box-perfumery should be archived or removed, then make a dedicated cleanup change."
9. "Document safe operator workflows for supplier import, Fraterworks catalog sync, evidence candidate promotion, and catalog draft application."
10. "Add tests around any future IFRA data update using structured lookup files only."

## 11. Open Questions

- Is the target product a personal/local workstation tool, a founder/internal dashboard, or a multi-user production app?
- Should the Anthropic API key remain a local-only user key, or should future work introduce a backend/proxy?
- Which supplier providers beyond Fraterworks are actually planned for implementation next?
- Should `RAW_DB` and `PRICING` remain embedded in `App.jsx`, or should they migrate to generated JSON/modules?
- What is the intended authority order when embedded data, structured registries, localStorage manual edits, and supplier imports disagree?
- Should `downloads/source_documents/` remain an ignored local evidence cache, or should some source metadata be committed separately?
- Is `src/App.jsx.backup` still needed?
- Are the legacy `beach-box-perfumery` patch files still useful?
- What confidence level is expected before IFRA guidance can be used for business decisions?
- Should `WORKFLOW.md` be rewritten to avoid dangerous recovery snippets and clarify safe branch use?
- Should the repo declare `"type": "module"` or convert helper imports/tests to avoid Node reparsing warnings?
- Should linting be added, fixed, or removed from config until the project is ready for lint enforcement?

## 12. Audit Notes

Files and areas inspected:

- Repository instructions: `AGENTS.md`
- Package/build config: `package.json`, `package-lock.json`, `vite.config.js`, `.eslintrc.json`, `.gitignore`
- Entrypoints/docs: `index.html`, `public/index.html`, `README.md`, `WORKFLOW.md`, `src/index.jsx`, `src/styles.css`
- Main app: `src/App.jsx`, `src/App.jsx.backup`
- Helper modules: `src/lib/browser_storage.js`, `src/lib/formula_runtime_helpers.js`, `src/lib/ifra_combined_package.js`, `src/lib/perfumer_runtime_helpers.js`, `src/lib/supplier_workbook_import_helpers.js`, and preflight modules under `src/lib/`
- Structured data: `src/data/*.json`
- Tests: `tests/*.test.mjs`
- Scripts: `scripts/*`
- Local/generated areas: `dist/`, `downloads/source_documents/`
- Legacy/prototype area: `beach-box-perfumery/*`
- Tooling notes: `.claude/skills/*`

Commands run during audit:

- `pwd`
- `git branch --show-current`
- `git status --short`
- `git diff --stat`
- `git diff --name-status`
- `rg --files -g 'AGENTS.md'`
- `sed -n '1,240p' /Users/b.russmacbetch/.codex/attachments/c550c014-e09e-4ee5-bf1a-1d3fbd79b5c4/pasted-text.txt`
- `sed -n '1,220p' AGENTS.md`
- `sed -n '1,260p' package.json`
- `sed -n '1,220p' README.md`
- `sed -n '1,260p' WORKFLOW.md`
- `sed -n '1,220p' vite.config.js`
- `sed -n '1,220p' src/index.jsx`
- `sed -n '1,220p' src/styles.css`
- `sed -n '1,220p' .gitignore`
- `sed -n '1,220p' .eslintrc.json`
- `sed -n '1,220p' index.html`
- `sed -n '1,220p' public/index.html`
- `find . -maxdepth 2 ...` and `rg --files ...` inventory-style scans
- `wc -l ...` line-count scans of app, helper, data, test, and script files
- `rg -n ...` scans for imports, exports, tab definitions, storage keys, TODO/FIXME/stub/placeholder/legacy/deprecated/demo/hardcoded markers
- `/usr/local/bin/node ...` parsing/count scripts for embedded app data and JSON registries
- `git ls-files dist docs downloads/source_documents src/App.jsx.backup beach-box-perfumery`
- `find downloads/source_documents -maxdepth 1 -type f | wc -l`
- `rg -n '"@typescript-eslint/parser"|@typescript-eslint/parser' package.json package-lock.json`
- `PATH=/usr/local/bin:$PATH /usr/local/bin/npm run build`
- `PATH=/usr/local/bin:$PATH /usr/local/bin/npm run test:helpers`

Command errors or warnings observed:

- `node` was not found on the default shell PATH during one direct Node command attempt. Re-running with `/usr/local/bin` in PATH succeeded.
- One exploratory shell parse command had a quoting error and was rerun safely.
- `rg` for `@typescript-eslint/parser` in package manifests exited with no matches.
- `npm run build` passed but emitted a Vite large-chunk warning.
- `npm run test:helpers` passed but emitted Node module-type warnings for ES module-style helper files.

Current working tree note:

Before this audit document was added, `git status --short` showed uncommitted modifications in:

- `src/App.jsx`
- `src/lib/browser_storage.js`
- `src/lib/ifra_combined_package.js`
- `src/lib/perfumer_runtime_helpers.js`
- `src/lib/supplier_workbook_import_helpers.js`
- `tests/perfumer_runtime_helpers.test.mjs`
- `tests/supplier_workbook_import_helpers.test.mjs`

Those files were not edited by this audit. The only intended repo change from this task is this documentation file.
