# IFRA Source Acquisition Workflow

This workflow turns active hero formula IFRA/source gaps into a local acquisition and review queue. It helps answer which documents are needed, where to look, what has been acquired, what is pending review, and what still blocks launch confidence.

It does not prove compliance, add IFRA limits, parse PDFs, or promote structured IFRA records.

## Source Identity vs Formula Stock Name

IFRA/source acquisition uses the regulated or source material identity, not the bench-stock display name. Diluted formula rows still keep their original formula names for loading, costing, and UI display, but source search and evidence matching should use the parent active material.

Examples:

- `Calone 1951 20% TEC` searches as `Calone 1951` / `Calone`.
- `Geosmin 1% TEC` searches as `Geosmin`.
- `Ambrettolide 50% TEC` searches as `Ambrettolide`.
- `Ethyl Vanillin 10%` searches as `Ethyl Vanillin`.
- `Helional 25%` searches as `Helional`.
- `Veramoss 20% TEC` searches as `Veramoss` / `Evernyl` / `Methyl atrarate`.
- `Seaweed Absolute 10%` searches as `Seaweed Absolute`.

The dilution percentage and carrier still matter for active-load math, carrier grams, and formula interpretation. They should not be searched as if `20% TEC`, `1% TEC`, `DPG`, `EtOH`, or other carrier labels were regulated material identities.

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

## Harvest Official IFRA Sources

The official IFRA harvester uses three public IFRA source roles conservatively:

- IFRA Standards Library: source-backed standard metadata and public standard download links.
- IFRA Transparency List: ingredient identity, CAS, and public disclosure support only.
- IFRA Standards Documentation: methodology/context reference only.

Run the cache-safe report:

```bash
node scripts/harvest_official_ifra_sources.mjs \
  --markdown \
  --write docs/ifra/official_ifra_harvest_report.md
```

This writes review-first official candidates to:

```bash
data/ifra_source_acquisition/official_ifra_source_candidates.json
docs/ifra/official_ifra_source_candidates.md
```

Use `--download` to fetch/cache public official IFRA index pages and public standard PDFs where download links are available:

```bash
node scripts/harvest_official_ifra_sources.mjs --download
```

Downloaded official IFRA files stay local and ignored under:

```bash
downloads/source_documents/ifra/official_ifra/
downloads/source_documents/ifra/official_ifra/standards/
downloads/source_documents/ifra/official_ifra/transparency/
```

Official Standards Library matches can become `standard_candidate` records for review. Transparency List matches become `identity_support` records only. The Transparency List must not be used as IFRA category-limit data.

The Smart IFRA Evidence Resolver and Autopilot read `official_ifra_source_candidates.json` when present. Exact/high-confidence official standard matches rank above supplier/product-page snippets, but they still remain review workflow evidence. The resolver does not promote category limits, change runtime IFRA classification, or claim launch clearance.

## Candidate IFRA/Product-Page Extraction

After linked pages are cached, run:

```bash
node scripts/extract_candidate_ifra_from_sources.mjs \
  --markdown \
  --write docs/ifra/candidate_ifra_source_extractions.md
```

The candidate extractor scans cached HTML/text pages for review snippets mentioning terms such as IFRA, Category 4, Cat 4, fine fragrance, maximum use level, SDS, CAS, allergen, phototoxic, furocoumarin, bergapten-free, and FCF.

Candidate values from product pages are not runtime IFRA standards. A report entry like “Candidate IFRA value found on supplier product page” means the value requires source review before any later structured IFRA promotion.

The extractor is review triage, not compliance logic. It now prioritizes:

- high-priority IFRA/product candidates, such as Cat 4/fine-fragrance values and supplier product-page IFRA language,
- phototoxic/FCF candidates,
- SDS, allergen, and restriction candidates,
- identity-only references.

High-priority candidates should be reviewed before identity-only references. Identity-reference pages, including Good Scents-style pages, are useful for CAS/name/source targeting but are not compliance evidence. Generic navigation, supplier-directory prose, social links, and broad unknown snippets from identity references are suppressed or demoted so they do not create review spam.

Candidate extraction does not update `src/data/ifra_master_standards.json`, runtime IFRA aliases, formula IFRA classification, or launch-readiness state.

## Candidate IFRA Review Queue

Candidate snippets are intentionally review-first. To avoid reviewing hundreds of loose snippets, build a grouped review queue:

```bash
node scripts/build_candidate_ifra_review_queue.mjs
node scripts/build_candidate_ifra_review_queue.mjs --markdown --write docs/ifra/candidate_ifra_review_queue.md
node scripts/build_candidate_ifra_review_queue.mjs --json
```

The queue reads `data/ifra_source_acquisition/candidate_ifra_source_extractions.json` and `data/ifra_source_acquisition/hero_ifra_source_queue.json`, then groups candidates by queue item/material. Diluted formula stocks are grouped under their source identity for evidence matching while preserving the original formula material display name. High-priority `ifra_category_limit`, `phototoxic_note`, and SDS/restriction candidates are shown before identity-only snippets. Markdown output shows only the top few snippets per item so the report stays reviewable.

Manual review state is preserved in:

```text
data/ifra_source_acquisition/candidate_ifra_review_queue.json
```

Use the updater to mark review progress:

```bash
node scripts/update_candidate_ifra_review_status.mjs \
  --id "candidate-ifra-review-hero-ifra-source-octanal-global-ifra-standard-needed" \
  --review-status accepted \
  --accept-candidate "candidate-id" \
  --notes "Candidate appears source-backed; ready for a later promotion review."
```

Review statuses mean:

- `not_started`: no human review yet.
- `in_review`: actively being checked against source identity and context.
- `accepted`: suitable evidence for a later controlled promotion task.
- `rejected`: not suitable, wrong identity, weak source, or misleading context.
- `needs_more_source`: potentially useful, but missing stronger source support.
- `deferred`: intentionally not in scope yet.

Accepted candidate review is not runtime promotion. It does not add an IFRA limit, does not mark a material compliant, and does not change launch readiness. Promotion to structured IFRA data remains a separate implementation task with source references and tests.

## Smart IFRA Evidence Resolver

The candidate queue can contain hundreds of retained snippets. Use the resolver to turn those snippets into a short material-by-material decision list:

```bash
node scripts/resolve_ifra_evidence_candidates.mjs
node scripts/resolve_ifra_evidence_candidates.mjs --json
node scripts/resolve_ifra_evidence_candidates.mjs --markdown
node scripts/resolve_ifra_evidence_candidates.mjs --markdown --write docs/ifra/ifra_evidence_resolution.md
node scripts/resolve_ifra_evidence_candidates.mjs --markdown --top 3
```

The resolver reads the existing source acquisition queue, candidate extractions, candidate review queue, reviewed FCF records, and ingredient harvest report. It does not scrape new pages.

Resolver statuses mean:

- `review_ready`: a linked, material-specific candidate has strong source/SDS/product-page IFRA or restriction language. Review the top candidate and mark it accepted if it checks out.
- `likely_fcf_evidence`: an FCF citrus candidate appears to support furocoumarin-free, bergapten-free, or phototoxic special-case evidence. Review it, then use the FCF promotion pilot only if the source is suitable.
- `candidate_found_needs_review`: useful evidence exists, but identity/source confidence needs human review.
- `identity_only`: candidates can help with CAS/name/source targeting, but are not compliance evidence.
- `insufficient_evidence`: no strong candidate exists yet.
- `needs_supplier_doc`: request or locate supplier IFRA/SDS documentation.
- `already_reviewed`, `not_applicable`, and `deferred`: no immediate candidate review is recommended.

The scoring is transparent: linked queue items, exact source-identity/material names, CAS terms, supplier SDS/product sources, IFRA/Cat 4/fine-fragrance/max-use language, and FCF/phototoxic wording increase priority. Identity-reference pages, Good Scents navigation/supplier-directory text, GHS hazard Category 4, RIFM average-use percentages, and unlinked snippets are penalized or treated as weak evidence.

The Markdown report intentionally shows only the best candidate per material by default. Use `--top 3` only when you want a little more context. Do not paste every candidate into review docs.

Recommended workflow:

1. Run candidate extraction after harvesting/caching sources.
2. Run the evidence resolver.
3. Review the `Review first` and `Likely FCF evidence` groups before reading raw candidate queues.
4. Mark candidates accepted or rejected in the candidate review queue.
5. Use the FCF promotion pilot only for reviewed FCF evidence.
6. Keep category-limit promotion as a later, separate reviewed implementation task.

Resolver output does not add IFRA limits, update runtime IFRA data, mark a material compliant, or provide launch clearance.

## IFRA Evidence Autopilot

Autopilot runs the review-first source workflow in one command:

```bash
node scripts/run_ifra_evidence_autopilot.mjs \
  --ingredient-reference "/Users/b.russmacbetch/Library/Mobile Documents/com~apple~CloudDocs/Ingredient data - Ingredient Data.csv"
```

To also download or reuse cached source pages/documents from known CSV links:

```bash
node scripts/run_ifra_evidence_autopilot.mjs \
  --ingredient-reference "/Users/b.russmacbetch/Library/Mobile Documents/com~apple~CloudDocs/Ingredient data - Ingredient Data.csv" \
  --download \
  --markdown \
  --write docs/ifra/ifra_evidence_autopilot_report.md
```

The JSON report is written to:

```bash
data/ifra_source_acquisition/ifra_evidence_autopilot_report.json
```

Autopilot orchestrates:

- source acquisition queue regeneration,
- ingredient CSV source-link harvesting,
- optional source download/cache,
- local IFRA/source document inventory,
- candidate IFRA/SDS/product-page snippet extraction,
- candidate review queue regeneration,
- smart evidence resolution,
- conservative review-status recommendations.

Autopilot classifications include:

- `auto_review_ready`: a top candidate is ready for human review.
- `auto_likely_fcf_evidence`: a citrus FCF/phototoxic candidate may be suitable for the narrow FCF evidence pilot after review.
- `auto_needs_supplier_doc`: supplier IFRA/SDS or product documentation is still needed.
- `auto_needs_global_standard`: a global IFRA standard source is still needed.
- `auto_identity_only`: identity/source hints exist, but not compliance evidence.
- `auto_insufficient`: no useful source-backed evidence is available yet.
- `auto_deferred`: intentionally deferred work, such as accord expansion.
- `auto_already_reviewed`: reviewed source evidence or structured coverage already exists.

Safe automatic updates are limited to review workflow metadata:

- high-confidence `review_ready` candidates may move to candidate review `in_review`,
- insufficient or supplier-document-needed queue items may move to `needs_more_source` when no manual review note/status is present,
- already reviewed FCF source evidence may mark the matching non-limit FCF candidate `accepted`.

Autopilot refuses to auto-accept category-limit candidates, promote category limits, write runtime IFRA standards, overwrite manual notes, or claim launch clearance. `review_ready` means “look here first,” not “approved.” `accepted` still means “suitable evidence for a later reviewed promotion task,” not runtime compliance.

## Autopilot Recommendations And Proposed Records

After running evidence autopilot, generate the short recommendation report:

```bash
node scripts/generate_ifra_autopilot_recommendations.mjs \
  --markdown \
  --write docs/ifra/ifra_autopilot_recommendations.md
```

The recommendation JSON is written to:

```bash
data/ifra_source_acquisition/ifra_autopilot_recommendations.json
```

Staged proposed records are written to:

```bash
data/ifra_source_acquisition/proposed_ifra_structured_records.json
```

The data states are intentionally separate:

- `candidate`: raw extracted snippet from cached source pages/documents. It can be useful, noisy, ambiguous, or wrong.
- `proposed structured record`: source-backed structured candidate staged for final review. It is not runtime-active.
- `reviewed source evidence`: accepted non-limit source metadata, such as FCF/bergapten-free support. It does not create category limits.
- `runtime IFRA standard`: structured data used by app IFRA calculations. Promotion into this layer is a later, explicit, reviewed implementation step.

Autopilot can auto-accept only non-limit evidence when it is linked to the exact queue item and does not alter IFRA category limits. Current safe examples are FCF/phototoxic evidence and limited source-identity support from supplier/SDS/product sources. Category-limit evidence is never auto-accepted into runtime data.

Strong Cat 4/fine-fragrance candidates can be staged as `proposed` records when they are linked to the queue item, match the source identity, come from a supplier product page or supplier IFRA/SDS source, contain clear IFRA/category/max-use language, and avoid GHS Category 4, RIFM average usage, navigation text, and identity-reference noise. Proposed records must be reviewed one at a time before any future promotion.

The recommendation report groups work into:

- proposed structured records ready for final review,
- auto-accepted non-limit evidence,
- needs better source,
- rejected/noisy evidence,
- already handled,
- deferred.

This is meant to reduce manual review burden: start with proposed records and unresolved source requests instead of reading every candidate snippet. It still does not claim compliance, does not prove launch clearance, and does not change formula data.

## Reviewed Candidate Promotion Pilot

The first promotion workflow is intentionally narrow: reviewed FCF/furocoumarin-free citrus evidence for `Bergamot EO FCF`, `Bergamot FCF`, and `Lemon FCF`.

Reviewed records live in:

```text
data/ifra_source_acquisition/reviewed_ifra_source_records.json
```

To promote a reviewed FCF candidate into source-evidence metadata:

```bash
node scripts/promote_reviewed_ifra_candidates.mjs \
  --candidate-id "<candidate-id>" \
  --material "Bergamot EO FCF" \
  --record-type fcf_phototoxic_note \
  --finding furocoumarin_free_or_bergapten_free \
  --summary "Reviewed source text supports FCF/bergapten-free handling; regular expressed bergamot phototoxic limit should not be applied as if furocoumarins are present."
```

This pilot only creates a reviewed source record with `runtimeUse: support_special_case_only`. It does not add a Cat 4 limit, does not change `src/data/ifra_master_standards.json`, does not mark the material compliant, and does not claim launch clearance.

When a reviewed FCF source record exists, the app can display “FCF source reviewed” beside the existing FCF special-case IFRA row. That means source evidence supports keeping FCF citrus separate from regular expressed citrus phototoxic restrictions. It still means supplier IFRA/SDS must be verified before final use.

Broad promotion of IFRA category limits, supplier IFRA certificates, or global IFRA standards is a later reviewed task. Do not use this pilot to bulk-promote unrelated candidates.

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

## Reviewed Structured IFRA Promotion

The reviewed structured promotion pilot promotes one reviewed proposed IFRA record at a time into the runtime overlay:

```bash
node scripts/promote_reviewed_ifra_structured_record.mjs \
  --proposed-record-id "<id>" \
  --review-status reviewed_ok \
  --notes "Reviewed official IFRA source PDF; promote one source-backed standard record with provenance."
```

Promotion layers:

- Candidate snippets are extraction evidence only.
- Proposed records are review recommendations only and are not runtime-active.
- Reviewed/promoted records live in `src/data/reviewed_ifra_structured_overrides.json` and are runtime structured IFRA data.
- The pilot requires an official IFRA Standards Library/PDF source and source provenance.
- Promotion is intentionally one record per run.

Official IFRA records are preferred over supplier/product-page candidates for runtime structured promotion. Supplier-only records should stay in review until a separate promotion workflow is designed for that source type.

Promoted runtime records still do not prove launch clearance. Complete structured coverage, supplier IFRA/SDS review where needed, finished-product context, and final compliance review remain separate requirements.
