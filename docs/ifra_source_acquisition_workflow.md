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

`downloads/source_documents/` is gitignored. Keep proprietary supplier PDFs and downloaded source documents local unless a future task explicitly changes the policy.

## Updating Queue Status

After acquiring or reviewing a document, edit the relevant item in:

```bash
data/ifra_source_acquisition/hero_ifra_source_queue.json
```

Manual fields preserved on regeneration:

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

## Promotion Is Separate

Reviewed source documents should not be copied into structured IFRA data automatically. Promotion into `src/data/ifra_master_standards.json`, alias wiring, or supplier IFRA support should happen in a separate reviewed implementation task with source references and tests.

Do not use this workflow to invent limits, infer launch clearance, or treat missing data as safe.
