# GCMS Reference Pipeline

This pipeline prepares locally downloaded GCMS-backed fragrance analysis PDFs for review-first fragrance construction research. It is intended to help identify recurring construction materials, families, and Beach Box inventory overlap. It does not create exact formulas, compliance claims, IFRA limits, pricing data, sensory records, candidate statuses, or AI behavior.

## Local PDF Folder

Place downloaded GCMS analysis PDFs here:

```bash
downloads/gcms_reports/
```

That folder is gitignored. Do not commit raw GCMS PDFs or generated raw extracted text. Many GCMS reports are copyrighted or supplier-provided documents, so the repo should only contain tooling, docs, tests, and reviewed/approved derived outputs.

The raw extraction folder is also gitignored:

```bash
data/gcms_extracted/raw_text/
```

## Pipeline Commands

Run the pipeline from the repo root.

```bash
node scripts/build_gcms_manifest.mjs
node scripts/extract_gcms_pdf_text.mjs
node scripts/structure_gcms_reports.mjs
node scripts/report_gcms_reference_summary.mjs
node scripts/report_gcms_reference_summary.mjs --markdown
node scripts/report_gcms_reference_summary.mjs --markdown --write docs/gcms/gcms_reference_summary.md
node scripts/analyze_gcms_construction_patterns.mjs
node scripts/analyze_gcms_construction_patterns.mjs --markdown --write docs/gcms/gcms_construction_patterns.md
node scripts/translate_gcms_patterns_to_beach_box.mjs
node scripts/translate_gcms_patterns_to_beach_box.mjs --markdown --write docs/gcms/beach_box_pattern_translation.md
```

## Outputs

`scripts/build_gcms_manifest.mjs` scans `downloads/gcms_reports/` and writes:

```bash
data/gcms_extracted/gcms_manifest.json
```

Each manifest record includes a stable local id, filename, relative path, size, modified time, filename-derived title/brand guesses, and `pending_extraction` status.

`scripts/extract_gcms_pdf_text.mjs` reads the manifest, extracts PDF text locally, writes one JSON text record per PDF under `data/gcms_extracted/raw_text/`, and writes:

```bash
data/gcms_extracted/gcms_extraction_status.json
```

One failed PDF does not stop the run. Failed or weak extractions are recorded for manual review.

`scripts/structure_gcms_reports.mjs` reads extraction output and writes conservative candidate records to:

```bash
data/gcms_extracted/gcms_structured_candidates.json
```

Candidate records include detected material rows only when the text line has conservative evidence such as a CAS number or explicit percentage. Missing percentages and CAS values are left null/blank.

`scripts/report_gcms_reference_summary.mjs` summarizes the structured candidates. Markdown output can be written to:

```bash
docs/gcms/gcms_reference_summary.md
```

`scripts/analyze_gcms_construction_patterns.mjs` reads the structured candidates and writes derived construction-pattern analysis to:

```bash
data/gcms_extracted/gcms_construction_patterns.json
```

Markdown output can be written to:

```bash
docs/gcms/gcms_construction_patterns.md
```

The pattern extractor reports recurring structural materials, high-dose architecture observations, transparent accord-skeleton heuristics, material co-occurrences, dosage-band distributions, Beach Box inventory/accord overlap, and conservative Beach Box translation notes. It does not generate reconstructed formulas, change active formulas, or treat GCMS percentages as target dosage rules.

`scripts/translate_gcms_patterns_to_beach_box.mjs` reads the construction-pattern analysis and active hero formulas, expands known accord components for relationship checks, and writes original Beach Box formulation guidance to:

```bash
data/gcms_extracted/beach_box_pattern_translation.json
```

Markdown output can be written to:

```bash
docs/gcms/beach_box_pattern_translation.md
```

The translator converts corpus observations into Beach Box decision prompts such as airy diffusion architecture, skin musk/base structure, woody amber driftwood support, marine/mineral restraint, citrus lift, floral transparency, and dark realism modifiers. It is a pattern-translation tool, not a formula reconstruction tool: it does not output commercial formulas, does not copy GCMS percentages, and does not change active formulas, IFRA logic, pricing, accord recipes, sensory data, candidate statuses, UI, or AI behavior.

GCMS material identity matching is handled with raw-name preservation. The analyzer keeps the raw GCMS material name, then adds normalized identity fields for reporting:

- exact Beach Box inventory/support matches,
- reviewed alias matches,
- accord component matches,
- related-family matches,
- missing inventory rows,
- ambiguous rows that need review.

The reviewed alias map lives at:

```bash
scripts/data/gcms_material_aliases.json
```

This alias/group data is for construction-pattern intelligence only. Related-family matches are not exact substitutions, and distinct materials such as Linalool, Ethyl Linalool, Linalyl Acetate, Ambroxan, Cetalox, and Hedione High Cis remain distinct unless a reviewed source supports an exact identity.

## What GCMS Can Help With

- Spot recurring materials across reference fragrances.
- Find likely construction families such as marine, woody, musk, floral, amber, citrus, or aldehydic.
- Compare detected material names with the current Beach Box inventory.
- Identify absent materials that may deserve review.
- Prioritize manual study of reports with richer detected material rows.
- Learn recurring construction patterns and translate them into original Beach Box design questions without copying references.

## What GCMS Cannot Prove

- GCMS is not an exact formula.
- GCMS area percentages are not finished fragrance percentages.
- GCMS does not capture every perceptually important material.
- GCMS output does not prove IFRA compliance or launch clearance.
- GCMS reports do not justify adding IFRA category limits.
- Extracted material rows require manual review before use.
- Construction-pattern outputs are corpus observations, not dosing rules or formula instructions.
- Inventory overlap is directional; alias and related-family matches do not prove that one material can replace another.

## Review Rules

- Do not invent missing percentages, CAS numbers, or match-quality values.
- Do not treat detected materials as formula instructions.
- Do not change active formulas from generated candidates without a separate review task.
- Do not use GCMS as compliance data.
- Keep raw PDFs and raw extracted text local.
