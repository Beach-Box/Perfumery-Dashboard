# IFRA Source Acquisition Workflow

This workflow turns active hero formula IFRA/source gaps into a local acquisition and review queue. It helps answer which documents are needed, where to look, what has been acquired, what is pending review, and what still blocks launch confidence.

It does not prove compliance, add IFRA limits, parse PDFs, or promote structured IFRA records.

## Run The Queue Builder

From the repo root:

```bash
node scripts/build_hero_ifra_source_acquisition_queue.mjs
node scripts/build_hero_ifra_source_acquisition_queue.mjs --json
node scripts/build_hero_ifra_source_acquisition_queue.mjs --markdown
node scripts/build_hero_ifra_source_acquisition_queue.mjs --markdown --write docs/ifra/hero_ifra_source_acquisition_queue.md
```

The generated JSON queue is written to:

```bash
data/ifra_source_acquisition/hero_ifra_source_queue.json
```

The generated Markdown checklist can be written to:

```bash
docs/ifra/hero_ifra_source_acquisition_queue.md
```

## Local Source Documents

Place acquired IFRA standards, supplier IFRA certificates, SDS files, allergen declarations, and product identity/spec sheets under:

```bash
downloads/source_documents/ifra/
```

`downloads/source_documents/` is gitignored, including common PDF, DOCX, and XLSX source-document formats. Keep proprietary supplier PDFs and downloaded source documents local unless a future task explicitly changes the policy.

## Inventory Acquired Documents

After placing documents in the local folder, run:

```bash
node scripts/inventory_ifra_source_documents.mjs
node scripts/inventory_ifra_source_documents.mjs --json
node scripts/inventory_ifra_source_documents.mjs --markdown
node scripts/inventory_ifra_source_documents.mjs --markdown --write docs/ifra/ifra_source_document_inventory.md
```

The inventory JSON is written to:

```bash
data/ifra_source_acquisition/ifra_source_document_inventory.json
```

The script scans filenames only. It uses conservative matching against queue material names, normalized names, candidate search terms, suggested document names, and source type hints. Ambiguous matches are not confirmed automatically; they stay possible matches for human review.

This inventory does not parse PDFs, read IFRA category limits, or prove compliance.

## Updating Queue Status

After acquiring or reviewing a document, update only the manual review fields with:

```bash
node scripts/update_ifra_source_queue_status.mjs \
  --id hero-ifra-source-octanal-aldehyde-c-8-global_ifra_standard_needed \
  --status acquired \
  --review-status needs_review \
  --source-file downloads/source_documents/ifra/Aldehyde_C8_IFRA.pdf \
  --notes "Downloaded source document; needs extraction/review."
```

The script also accepts short material/source-type aliases when they are unambiguous, such as:

```bash
node scripts/update_ifra_source_queue_status.mjs \
  --id aldehyde-c-8-global-ifra-standard-needed \
  --status acquired \
  --review-status needs_review
```

It writes the updated queue to:

```bash
data/ifra_source_acquisition/hero_ifra_source_queue.json
```

Only these fields can be updated by the status script:

- `status`
- `reviewStatus`
- `sourceFile`
- `sourceNotes`
- `reviewNotes`

Manual fields preserved on queue regeneration:

- `status`
- `reviewStatus`
- `sourceFile`
- `sourceNotes`
- `reviewNotes`
- `lastUpdated`

Suggested status flow:

- `needed`: document has not been acquired.
- `searching`: source search is active.
- `acquired`: document exists locally, but has not been reviewed.
- `reviewed`: document was reviewed and is suitable for a later promotion task.
- `promoted`: reviewed source has been separately promoted into structured IFRA data.
- `deferred`: intentionally not in scope yet, such as accord component expansion.
- `not_applicable`: no acquisition action is currently needed.

Suggested review status flow:

- `not_started`
- `needs_review`
- `reviewed_ok`
- `rejected`
- `needs_more_source`

## Review Status Report

To generate a review-state report grouped by needed, searching, acquired/needs review, reviewed OK, rejected, needs more source, deferred, and promoted:

```bash
node scripts/update_ifra_source_queue_status.mjs --review-report --write docs/ifra/hero_ifra_source_review_status.md
```

`reviewed_ok` means the acquired document looks suitable for a later structured-data promotion task. It does not mean a material is compliant, does not add an IFRA limit, and does not clear launch use.

## Promotion Is Separate

Reviewed source documents should not be copied into structured IFRA data automatically. Promotion into `src/data/ifra_master_standards.json`, alias wiring, or supplier IFRA support should happen in a separate reviewed implementation task with source references and tests.

Do not use this workflow to invent limits, infer launch clearance, or treat missing data as safe.
