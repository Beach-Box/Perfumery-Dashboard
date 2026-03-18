# src/data — Ingredient Data Pipeline

This directory holds the review-first data intake pipeline for the Perfumery Dashboard.

## Pipeline stages

```
Agent produces candidates
        │
        ▼
  src/data/staged/        ← Incoming batches (JSON). Not yet reviewed.
        │
   Human review
   node scripts/review-staged.js
        │
        ▼
  src/data/approved/      ← Reviewed and approved. Ready to apply.
        │
   Apply to App.js
   node scripts/apply-approved.js
        │
        ▼
  src/data/applied/       ← Archive. Processed batches moved here.
```

## File format

All batch files use the schema defined in `schemas/candidate.schema.json`.

Each candidate has:
- `canonical_key` — exact RAW_DB key in src/App.js
- `field` — field name from the FIELDS array
- `proposed_value` — new value (correct JS type for the field)
- `confidence` — confirmed / likely / conflicting / missing
- `source_type` — official_supplier_page / official_pdf_sds_tds / approved_evidence_record / repo_source_doc / inferred
- `source_ref` — URL or document title
- `apply_path` — promotion-safe / manual-review-only / insufficient-support

## Scripts

```bash
# Show a diff table of all staged candidates vs current DB
node scripts/review-staged.js

# Apply all promotion-safe candidates in approved/
node scripts/apply-approved.js

# Dry-run (show what would change without writing)
node scripts/apply-approved.js --dry-run
```

## RAW_DB field index reference

| Index | Field | Type | Notes |
|-------|-------|------|-------|
| 0 | MW | number | Molecular weight |
| 1 | xLogP | number | Lipophilicity |
| 2 | TPSA | number | Topological polar surface area |
| 3 | HBD | number | H-bond donors |
| 4 | HBA | number | H-bond acceptors |
| 5 | VP | number | Vapor pressure (mmHg at 25°C) |
| 6 | ODT | number | Odor detection threshold (ppbv) |
| 7 | n | number | Stevens' Law exponent |
| 8 | note | string | top / mid / base / carrier |
| 9 | type | string | SYNTH / EO / ABS / CO2 / CARRIER |
| 10 | ifra | boolean | IFRA restricted? |
| 11 | supplier | string | Primary supplier |
| 12 | char | string | Short character description |
| 13 | rep | string | Representative/INCI name |
| 14 | densityGmL | number | Density |
| 15 | cas | string | CAS number |
| 16 | inci | string | INCI name |
| 17 | scentClass | string | Scent family |
| 18 | scentSummary | string | 1-line scent summary |
| 19 | scentDesc | string | Full scent description |
| 20 | ifraLimit | number/null | Legacy IFRA limit |
| 21 | densityGmL2 | number | Secondary density |
| 22–28 | patch-block fields | various | Set via _dilOverrides / _uvNames / _ifraLimits in App.js patch block |

## Hard rules

- Never move RAW_DB or PRICING out of src/App.js without updating these scripts.
- Only promotion-safe candidates with no unresolved conflicts are auto-applied.
- All other candidates require human review before moving to approved/.
- Patch-block fields (22–28: dilutionFactor, isUVCB, descriptorTags, odorThreshold_ngL, vpConfidence, isIsomerMix, ifraLimits) are managed by the DB patch block in App.js, not by apply-approved.js.
