# Repository instructions

## Stack
- This project uses Vite, not react-scripts.
- Use Node 20 or newer.

## Setup
- Run `npm install`

## Validation
- Run `npm run build` before finishing any coding task.

## Local run
- Run `npm start -- --host 0.0.0.0 --port 5173` for local preview.

## Repo rules
- Do not introduce `react-scripts`.
- Do not commit `dist/`.
- Prefer small, targeted changes over broad refactors.
- Preserve unrelated user work and existing behavior.
- When changing IFRA/compliance logic, use the structured lookup files in the repo instead of hardcoded limits.

## Branch rules
- Codex work belongs on `chatgpt-feature-work`.
- Do not work directly on `main` unless explicitly told.

## Output expectations
- After making changes, report:
  1. files changed
  2. whether build passed
  3. remaining concerns

---

## Ingredient data pipeline (src/data/)

The app uses a review-first data intake pipeline. Do not blindly update live app data.

```
Agent stages candidates → src/data/staged/
Human reviews:            node scripts/review-staged.js
Moves approved files:     src/data/staged/ → src/data/approved/
Applies to App.jsx:       node scripts/apply-approved.js
Archive:                  src/data/applied/
```

All batch files use the schema at `src/data/schemas/candidate.schema.json`.

### Candidate format

Every candidate must include:
- `canonical_key` — exact RAW_DB key (case-sensitive, must match App.jsx exactly)
- `field` — field name from FIELDS array
- `proposed_value` — new value (correct JS type)
- `confidence` — `confirmed` / `likely` / `conflicting` / `missing`
- `source_type` — `official_supplier_page` / `official_pdf_sds_tds` / `approved_evidence_record` / `repo_source_doc` / `inferred`
- `source_ref` — URL or document title
- `apply_path` — `promotion-safe` / `manual-review-only` / `insufficient-support`

### Identity rules

- Never overwrite a stronger canonical field with weaker evidence.
- Do not infer CAS or INCI from name similarity alone.
- Keep neat vs diluted stock explicit.
- Do not collapse distinct supplier variants into one record.
- If two sources conflict, flag both — do not guess.

### Promotion-safe requires all of:
- Strong identity match (canonical_key found in RAW_DB)
- Strong source (official supplier page or SDS/TDS)
- No unresolved conflict
- Field in the inline-editable range (FIELDS indices 0–21)

### Patch-block fields (indices 22–28)
`dilutionFactor`, `isUVCB`, `descriptorTags`, `odorThreshold_ngL`, `vpConfidence`,
`isIsomerMix`, `ifraLimits` — these are runtime-patched via the DB patch block
in App.jsx. Do not apply them through the intake pipeline; update the patch block directly.

### Output per intake task
1. Promotion-safe JSON → `src/data/staged/<batch-id>-safe.json`
2. Manual-review JSON → `src/data/staged/<batch-id>-review.json`
3. Markdown summary: what was found, what is missing, what conflicts exist
