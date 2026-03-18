function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function makeIssue(code, message) {
  return { code, message };
}

export function buildLiveCatalogNamesFromAppSource(appSourceText) {
  const rawDbStart = appSourceText.indexOf("const RAW_DB = {");
  const rawDbEnd = appSourceText.indexOf("const FIELDS = [", rawDbStart);
  if (rawDbStart === -1 || rawDbEnd === -1 || rawDbEnd <= rawDbStart) {
    return [];
  }

  const rawDbSection = appSourceText.slice(rawDbStart, rawDbEnd);
  const keyPattern = /^\s*(?:"([^"]+)"|([A-Za-z0-9_]+)):\s*\[/gm;
  const catalogNames = [];
  let match = null;
  while ((match = keyPattern.exec(rawDbSection))) {
    const key = match[1] || match[2];
    if (key) catalogNames.push(key);
  }

  return catalogNames;
}

function summarizeDraftResult(result) {
  if (result.blockingConflicts.length > 0) return "blocking_conflicts";
  if (result.warnings.length > 0) return "warnings";
  return "safe_to_apply";
}

export function validateGeneratedCatalogRowDraftExport(
  payload,
  {
    liveCatalogNames = [],
    materialNormalization = {},
  } = {}
) {
  const drafts = Array.isArray(payload?.catalogRowDrafts)
    ? payload.catalogRowDrafts
    : [];
  const liveCatalogNameSet = new Set(
    liveCatalogNames.map((name) => normalizeName(name))
  );

  const draftResults = drafts.map((draft) => {
    const warnings = [];
    const blockingConflicts = [];
    const catalogDisplayName =
      draft?.catalogDisplayName || draft?.catalogRowDraft?.displayName || null;
    const entryKind =
      draft?.entryKind || draft?.catalogRowDraft?.entryKind || null;
    const canonicalMaterialKey =
      draft?.canonicalMaterialKey ||
      draft?.catalogRowDraft?.canonicalMaterialKey ||
      null;
    const catalogRowDraft = draft?.catalogRowDraft || null;
    const sourceSupplierProducts = Array.isArray(draft?.sourceSupplierProducts)
      ? draft.sourceSupplierProducts
      : [];

    if (!catalogDisplayName) {
      blockingConflicts.push(
        makeIssue(
          "missing_catalog_display_name",
          "Draft is missing catalogDisplayName."
        )
      );
    }

    if (!catalogRowDraft || typeof catalogRowDraft !== "object") {
      blockingConflicts.push(
        makeIssue(
          "missing_catalog_row_draft",
          "Draft is missing catalogRowDraft."
        )
      );
    }

    if (
      catalogRowDraft?.displayName &&
      catalogDisplayName &&
      normalizeName(catalogRowDraft.displayName) !==
        normalizeName(catalogDisplayName)
    ) {
      blockingConflicts.push(
        makeIssue(
          "catalog_display_name_mismatch",
          `catalogRowDraft.displayName "${catalogRowDraft.displayName}" does not match catalogDisplayName "${catalogDisplayName}".`
        )
      );
    }

    if (!entryKind) {
      blockingConflicts.push(
        makeIssue("missing_entry_kind", "Draft is missing entryKind.")
      );
    }

    if (!canonicalMaterialKey) {
      blockingConflicts.push(
        makeIssue(
          "missing_canonical_material_key",
          "Draft is missing canonicalMaterialKey."
        )
      );
    }

    if (draft?.liveCatalogRowPresent === true) {
      blockingConflicts.push(
        makeIssue(
          "duplicate_live_row_presence",
          "Draft indicates a live catalog row is already present."
        )
      );
    }

    if (
      catalogDisplayName &&
      liveCatalogNameSet.has(normalizeName(catalogDisplayName))
    ) {
      blockingConflicts.push(
        makeIssue(
          "catalog_display_name_collision",
          `Catalog display name "${catalogDisplayName}" already exists in the live catalog.`
        )
      );
    }

    if (!sourceSupplierProducts.length) {
      warnings.push(
        makeIssue(
          "missing_supplier_product_ownership",
          "Draft has no sourceSupplierProducts ownership records."
        )
      );
    }

    const canonicalMaterialExists = canonicalMaterialKey
      ? Object.values(materialNormalization || {}).some(
          (entry) => entry?.canonicalMaterialKey === canonicalMaterialKey
        )
      : false;
    if (canonicalMaterialKey && !canonicalMaterialExists) {
      warnings.push(
        makeIssue(
          "canonical_material_key_not_present_in_normalization",
          `canonicalMaterialKey "${canonicalMaterialKey}" is not present in current normalization data.`
        )
      );
    }

    if (Array.isArray(draft?.missingData?.chemistry) && draft.missingData.chemistry.length) {
      warnings.push(
        makeIssue(
          "missing_chemistry_fields",
          `Draft still has missing chemistry fields: ${draft.missingData.chemistry.join(", ")}.`
        )
      );
    }

    if (Array.isArray(draft?.missingData?.ifra) && draft.missingData.ifra.length) {
      warnings.push(
        makeIssue(
          "missing_ifra_fields",
          `Draft still has missing IFRA fields: ${draft.missingData.ifra.join(", ")}.`
        )
      );
    }

    return {
      catalogDisplayName,
      entryKind,
      canonicalMaterialKey,
      status: "pending",
      warnings,
      blockingConflicts,
    };
  }).map((result) => ({
    ...result,
    status: summarizeDraftResult(result),
  }));

  const summary = {
    draftCount: draftResults.length,
    safeToApplyCount: draftResults.filter(
      (draft) => draft.status === "safe_to_apply"
    ).length,
    warningDraftCount: draftResults.filter(
      (draft) => draft.status === "warnings"
    ).length,
    blockingConflictDraftCount: draftResults.filter(
      (draft) => draft.status === "blocking_conflicts"
    ).length,
    warningCount: draftResults.reduce(
      (sum, draft) => sum + draft.warnings.length,
      0
    ),
    blockingConflictCount: draftResults.reduce(
      (sum, draft) => sum + draft.blockingConflicts.length,
      0
    ),
    overallStatus: "safe_to_apply",
  };

  if (summary.blockingConflictCount > 0) {
    summary.overallStatus = "blocking_conflicts";
  } else if (summary.warningCount > 0) {
    summary.overallStatus = "warnings";
  }

  return {
    metadata: {
      version: 1,
      generatedAt: new Date().toISOString(),
      note:
        "Preflight review only. No live catalog rows, canonical chemistry, or IFRA data are applied by this report.",
    },
    summary,
    drafts: draftResults,
  };
}
