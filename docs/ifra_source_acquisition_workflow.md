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

## IFRA 51 PDF Location

The source harvester checks for the IFRA 51st Amendment PDF at:

```bash
/Users/b.russmacbetch/Downloads/IFRA - 51st Amendment.pdf
```

If present and the harvester is run with `--copy-ifra-51` or `--download`, it copies the PDF into this ignored local path:

```bash
downloads/source_documents/ifra/global/IFRA - 51st Amendment.pdf
```

If the PDF is not at the expected Downloads path, place it manually in `downloads/source_documents/ifra/global/`. The PDF is not committed.

To copy only the local IFRA 51 PDF without downloading supplier links:

```bash
node scripts/harvest_ifra_sources_from_ingredient_csv.mjs \
  --ingredient-reference "/Users/b.russmacbetch/Library/Mobile Documents/com~apple~CloudDocs/Ingredient data - Ingredient Data.csv" \
  --copy-ifra-51
```

## Harvest From Ingredient Reference CSV

The ingredient reference CSV can reduce manual source research by harvesting known SDS, product page, supplier page, and identity URLs already associated with materials.

Dry-run report:

```bash
node scripts/harvest_ifra_sources_from_ingredient_csv.mjs \
  --ingredient-reference "/Users/b.russmacbetch/Library/Mobile Documents/com~apple~CloudDocs/Ingredient data - Ingredient Data.csv" \
  --markdown \
  --write docs/ifra/ingredient_source_harvest_report.md
```

Download/cache linked source documents and pages:

```bash
node scripts/harvest_ifra_sources_from_ingredient_csv.mjs \
  --ingredient-reference "/Users/b.russmacbetch/Library/Mobile Documents/com~apple~CloudDocs/Ingredient data - Ingredient Data.csv" \
  --download
```

Default mode is dry-run. `--download` is required before the script fetches linked URLs or copies the IFRA 51 PDF. Downloaded content is stored under ignored folders:

```bash
downloads/source_documents/ifra/from_csv/
downloads/source_documents/ifra/product_pages/
downloads/source_documents/ifra/sds/
```

For cached webpages, the harvester saves `.html` plus a metadata JSON containing the source URL, matched material, supplier, HTTP status, content type, local path, and source type. It skips duplicate URLs, uses simple rate limiting, does not run broad web searches, and does not bypass logins or blocked pages.

CSV links and cached pages are source-acquisition evidence only. They do not prove compliance.

## Candidate IFRA/Product-Page Extraction

After linked pages are cached, run:

```bash
node scripts/extract_candidate_ifra_from_sources.mjs \
  --markdown \
  --write docs/ifra/candidate_ifra_source_extractions.md
```

The candidate extractor scans cached HTML/text pages for review snippets mentioning terms such as IFRA, Category 4, Cat 4, fine fragrance, maximum use level, SDS, CAS, allergen, phototoxic, furocoumarin, bergapten-free, and FCF.

Candidate values from product pages are not runtime IFRA standards. A report entry like “Candidate IFRA value found on supplier product page” means the value requires source review before any later structured IFRA promotion.

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
