function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const pathname = url.pathname.replace(/\/+$/g, "") || "/";
    return `${url.host.toLowerCase()}${pathname.toLowerCase()}`;
  } catch {
    return null;
  }
}

function getUrlSlug(value) {
  try {
    const pathname = new URL(String(value || "")).pathname
      .replace(/^\/+|\/+$/g, "")
      .replace(/\.html?$/i, "")
      .trim()
      .toLowerCase();
    return pathname || null;
  } catch {
    return null;
  }
}

function makeIssue(code, message) {
  return { code, message };
}

function areDraftEntriesEquivalent(existingEntry, draftEntry) {
  if (!existingEntry || !draftEntry) return false;
  return (
    (existingEntry.entryKind || null) === (draftEntry.entryKind || null) &&
    (existingEntry.canonicalMaterialKey || null) ===
      (draftEntry.canonicalMaterialKey || null) &&
    (existingEntry.linkedDuplicateOfCatalogName || null) ===
      (draftEntry.linkedDuplicateOfCatalogName || null)
  );
}

function buildCatalogNameIndex(catalogNames, materialNormalization) {
  const index = {};

  [...(catalogNames || []), ...Object.keys(materialNormalization || {})].forEach(
    (name) => {
      const normalized = normalizeName(name);
      if (!normalized) return;
      if (!index[normalized]) index[normalized] = [];
      if (!index[normalized].includes(name)) index[normalized].push(name);
    }
  );

  return index;
}

function buildCanonicalMaterialIndex(materialNormalization) {
  return Object.entries(materialNormalization || {}).reduce((acc, [name, entry]) => {
    const canonicalMaterialKey = entry?.canonicalMaterialKey;
    if (!canonicalMaterialKey) return acc;
    if (!acc[canonicalMaterialKey]) {
      acc[canonicalMaterialKey] = {
        allNames: [],
        canonicalOwners: [],
      };
    }
    acc[canonicalMaterialKey].allNames.push(name);
    if (entry?.entryKind === "canonical_material") {
      acc[canonicalMaterialKey].canonicalOwners.push(name);
    }
    return acc;
  }, {});
}

function buildRegistryIndexes(supplierProductRegistry) {
  const byNormalizedUrl = {};
  const bySupplierSlug = {};

  Object.entries(supplierProductRegistry || {}).forEach(([key, record]) => {
    const normalizedUrl = normalizeUrl(record?.url);
    if (normalizedUrl) {
      if (!byNormalizedUrl[normalizedUrl]) byNormalizedUrl[normalizedUrl] = [];
      byNormalizedUrl[normalizedUrl].push(key);
    }

    const supplierKey = record?.supplierKey || String(key).split(":")[0] || null;
    const urlSlug = record?.urlSlug || getUrlSlug(record?.url);
    if (supplierKey && urlSlug) {
      const composite = `${supplierKey}:${urlSlug}`;
      if (!bySupplierSlug[composite]) bySupplierSlug[composite] = [];
      bySupplierSlug[composite].push(key);
    }
  });

  return { byNormalizedUrl, bySupplierSlug };
}

function validateDraftRecord(draft, context) {
  const warnings = [];
  const blockingConflicts = [];
  const catalogNames = context.catalogNames || [];
  const materialNormalization = context.materialNormalization || {};
  const supplierProductRegistry = context.supplierProductRegistry || {};
  const catalogNameIndex = context.catalogNameIndex || {};
  const canonicalMaterialIndex = context.canonicalMaterialIndex || {};
  const registryIndexes = context.registryIndexes || {
    byNormalizedUrl: {},
    bySupplierSlug: {},
  };

  const sourceSnapshot = draft?.sourceSnapshot || {};
  const supplierProductRowDraft = draft?.supplierProductRowDraft || null;
  const normalizationEntryDraft = draft?.normalizationEntryDraft || null;
  const supplierProductKey = draft?.supplierProductKey || null;
  const proposedCatalogName =
    supplierProductRowDraft?.catalogName ||
    sourceSnapshot?.proposedCatalogName ||
    null;
  const proposedEntryKind =
    supplierProductRowDraft?.entryKind ||
    sourceSnapshot?.proposedEntryKind ||
    null;
  const proposedCanonicalMaterialKey =
    supplierProductRowDraft?.canonicalMaterialKey ||
    sourceSnapshot?.proposedCanonicalMaterialKey ||
    null;
  const draftUrl = supplierProductRowDraft?.url || sourceSnapshot?.url || null;
  const draftUrlSlug = getUrlSlug(draftUrl);

  if (!supplierProductKey) {
    blockingConflicts.push(
      makeIssue(
        "missing_supplier_product_key",
        "Draft is missing supplierProductKey."
      )
    );
  }

  if (!proposedCatalogName) {
    blockingConflicts.push(
      makeIssue(
        "missing_catalog_name",
        "Draft is missing a proposed catalog name."
      )
    );
  }

  if (!supplierProductRowDraft) {
    blockingConflicts.push(
      makeIssue(
        "missing_supplier_product_row_draft",
        "Approved export is missing supplierProductRowDraft."
      )
    );
  }

  let draftNormalizationEntry = null;
  if (!normalizationEntryDraft) {
    warnings.push(
      makeIssue(
        "missing_normalization_entry_draft",
        "Draft does not include a normalizationEntryDraft yet."
      )
    );
  } else {
    const normalizationKeys = Object.keys(normalizationEntryDraft);
    if (normalizationKeys.length !== 1) {
      blockingConflicts.push(
        makeIssue(
          "invalid_normalization_entry_shape",
          "normalizationEntryDraft must contain exactly one catalog-name key."
        )
      );
    } else {
      const normalizationCatalogName = normalizationKeys[0];
      draftNormalizationEntry = normalizationEntryDraft[normalizationCatalogName];
      if (
        proposedCatalogName &&
        normalizeName(normalizationCatalogName) !== normalizeName(proposedCatalogName)
      ) {
        blockingConflicts.push(
          makeIssue(
            "normalization_key_mismatch",
            `normalizationEntryDraft targets "${normalizationCatalogName}" but supplierProductRowDraft targets "${proposedCatalogName}".`
          )
        );
      }
    }
  }

  if (proposedCatalogName) {
    const existingCatalogNames =
      catalogNameIndex[normalizeName(proposedCatalogName)] || [];
    const existingNormalizationEntry =
      materialNormalization[proposedCatalogName] ||
      Object.entries(materialNormalization).find(
        ([name]) => normalizeName(name) === normalizeName(proposedCatalogName)
      )?.[1] ||
      null;

    if (existingCatalogNames.length > 0 && existingNormalizationEntry) {
      if (
        draftNormalizationEntry &&
        areDraftEntriesEquivalent(existingNormalizationEntry, draftNormalizationEntry)
      ) {
        warnings.push(
          makeIssue(
            "catalog_name_already_normalized",
            `Catalog name "${proposedCatalogName}" already exists with the same normalization mapping.`
          )
        );
      } else {
        blockingConflicts.push(
          makeIssue(
            "catalog_name_collision",
            `Catalog name "${proposedCatalogName}" already exists in repo normalization/catalog data.`
          )
        );
      }
    } else if (existingCatalogNames.length > 0) {
      warnings.push(
        makeIssue(
          "catalog_name_already_exists_in_catalog",
          `Catalog name "${proposedCatalogName}" already exists in the live catalog.`
        )
      );
    }
  }

  if (!proposedCanonicalMaterialKey) {
    warnings.push(
      makeIssue(
        "missing_canonical_material_key",
        "Draft has no canonicalMaterialKey yet; chemistry/IFRA inheritance would remain unresolved."
      )
    );
  } else {
    const canonicalInfo =
      canonicalMaterialIndex[proposedCanonicalMaterialKey] || null;
    if (!canonicalInfo) {
      warnings.push(
        makeIssue(
          "canonical_material_key_not_present",
          `canonicalMaterialKey "${proposedCanonicalMaterialKey}" is not present in current normalization data.`
        )
      );
    } else if (!canonicalInfo.canonicalOwners.length) {
      warnings.push(
        makeIssue(
          "canonical_material_key_has_no_canonical_owner",
          `canonicalMaterialKey "${proposedCanonicalMaterialKey}" has no canonical_material source row yet.`
        )
      );
    } else if (
      proposedEntryKind === "canonical_material" &&
      !canonicalInfo.canonicalOwners.some(
        (name) => normalizeName(name) === normalizeName(proposedCatalogName)
      )
    ) {
      blockingConflicts.push(
        makeIssue(
          "canonical_material_key_owned_by_other_row",
          `canonicalMaterialKey "${proposedCanonicalMaterialKey}" is already owned by canonical row(s): ${canonicalInfo.canonicalOwners.join(", ")}.`
        )
      );
    }
  }

  if (draftNormalizationEntry?.linkedDuplicateOfCatalogName) {
    const targetName = draftNormalizationEntry.linkedDuplicateOfCatalogName;
    const targetExists =
      catalogNames.some((name) => normalizeName(name) === normalizeName(targetName)) ||
      Object.keys(materialNormalization).some(
        (name) => normalizeName(name) === normalizeName(targetName)
      );

    if (!targetExists) {
      blockingConflicts.push(
        makeIssue(
          "linked_duplicate_target_missing",
          `linkedDuplicateOfCatalogName "${targetName}" does not exist in current repo data.`
        )
      );
    }
  }

  const registryRecord = supplierProductKey
    ? supplierProductRegistry[supplierProductKey] || null
    : null;

  if (!registryRecord) {
    warnings.push(
      makeIssue(
        "supplier_product_key_missing_from_registry",
        `supplierProductKey "${supplierProductKey}" is not present in the current supplier registry.`
      )
    );
  } else {
    const mappedCatalogName = registryRecord?.mappedCatalogName || null;
    const mappedCanonicalMaterialKey =
      registryRecord?.mappedCanonicalMaterialKey || null;
    const mappedEntryKind = registryRecord?.mappedEntryKind || null;
    const isAlreadyMapped =
      mappedCatalogName || mappedCanonicalMaterialKey || mappedEntryKind;

    if (isAlreadyMapped) {
      if (
        normalizeName(mappedCatalogName) === normalizeName(proposedCatalogName) &&
        (mappedCanonicalMaterialKey || null) ===
          (proposedCanonicalMaterialKey || null) &&
        (mappedEntryKind || null) === (proposedEntryKind || null)
      ) {
        warnings.push(
          makeIssue(
            "supplier_product_key_already_mapped_same_way",
            `supplierProductKey "${supplierProductKey}" is already mapped in the registry with the same target.`
          )
        );
      } else {
        blockingConflicts.push(
          makeIssue(
            "supplier_product_key_already_mapped_differently",
            `supplierProductKey "${supplierProductKey}" is already mapped to "${mappedCatalogName || "unknown"}" in the supplier registry.`
          )
        );
      }
    }

    if (
      draftUrl &&
      registryRecord?.url &&
      normalizeUrl(draftUrl) !== normalizeUrl(registryRecord.url)
    ) {
      warnings.push(
        makeIssue(
          "draft_url_differs_from_registry_record",
          "Draft URL differs from the current supplier registry record."
        )
      );
    }
  }

  if (!draftUrl) {
    warnings.push(
      makeIssue(
        "missing_supplier_url",
        "Draft has no supplier URL, so supplier URL collision checks are incomplete."
      )
    );
  } else {
    const normalizedDraftUrl = normalizeUrl(draftUrl);
    const conflictingUrlKeys = (
      registryIndexes.byNormalizedUrl[normalizedDraftUrl] || []
    ).filter((key) => key !== supplierProductKey);
    if (conflictingUrlKeys.length > 0) {
      blockingConflicts.push(
        makeIssue(
          "supplier_url_collision",
          `Draft URL is already used by registry key(s): ${conflictingUrlKeys.join(", ")}.`
        )
      );
    }

    if (!draftUrlSlug) {
      warnings.push(
        makeIssue(
          "missing_supplier_url_slug",
          "Draft URL slug could not be parsed, so supplier slug checks are incomplete."
        )
      );
    } else {
      const supplierKey =
        registryRecord?.supplierKey || String(supplierProductKey || "").split(":")[0] || null;
      if (!supplierKey) {
        warnings.push(
          makeIssue(
            "missing_supplier_key",
            "Supplier key could not be determined for URL slug collision checks."
          )
        );
      } else {
        const slugComposite = `${supplierKey}:${draftUrlSlug}`;
        const conflictingSlugKeys = (
          registryIndexes.bySupplierSlug[slugComposite] || []
        ).filter((key) => key !== supplierProductKey);
        if (conflictingSlugKeys.length > 0) {
          blockingConflicts.push(
            makeIssue(
              "supplier_url_slug_collision",
              `Supplier URL slug is already owned by registry key(s): ${conflictingSlugKeys.join(", ")}.`
            )
          );
        }
      }
    }
  }

  const status =
    blockingConflicts.length > 0
      ? "blocking_conflicts"
      : warnings.length > 0
      ? "warnings"
      : "safe_to_apply";

  return {
    supplierProductKey,
    proposedCatalogName: proposedCatalogName || null,
    proposedCanonicalMaterialKey: proposedCanonicalMaterialKey || null,
    proposedEntryKind: proposedEntryKind || null,
    status,
    warnings,
    blockingConflicts,
  };
}

export function validateApprovedSupplierDraftExport(payload, context) {
  const catalogNames = context?.catalogNames || [];
  const materialNormalization = context?.materialNormalization || {};
  const supplierProductRegistry = context?.supplierProductRegistry || {};
  const approvedDrafts = payload?.approvedDrafts || [];

  const sharedContext = {
    catalogNames,
    materialNormalization,
    supplierProductRegistry,
    catalogNameIndex: buildCatalogNameIndex(catalogNames, materialNormalization),
    canonicalMaterialIndex: buildCanonicalMaterialIndex(materialNormalization),
    registryIndexes: buildRegistryIndexes(supplierProductRegistry),
  };

  const drafts = approvedDrafts.map((draft) =>
    validateDraftRecord(draft, sharedContext)
  );

  const summary = drafts.reduce(
    (acc, draft) => {
      if (draft.status === "safe_to_apply") acc.safeToApplyCount += 1;
      if (draft.status === "warnings") acc.warningDraftCount += 1;
      if (draft.status === "blocking_conflicts")
        acc.blockingConflictDraftCount += 1;
      acc.warningCount += draft.warnings.length;
      acc.blockingConflictCount += draft.blockingConflicts.length;
      return acc;
    },
    {
      approvedDraftCount: drafts.length,
      safeToApplyCount: 0,
      warningDraftCount: 0,
      blockingConflictDraftCount: 0,
      warningCount: 0,
      blockingConflictCount: 0,
    }
  );

  const overallStatus =
    summary.blockingConflictCount > 0
      ? "blocking_conflicts"
      : summary.warningCount > 0
      ? "warnings"
      : "safe_to_apply";

  return {
    metadata: {
      version: 1,
      generatedAt: new Date().toISOString(),
      note:
        "Preflight review only. No live catalog, canonical chemistry, or IFRA data is applied by this report.",
    },
    summary: {
      ...summary,
      overallStatus,
    },
    drafts,
  };
}
