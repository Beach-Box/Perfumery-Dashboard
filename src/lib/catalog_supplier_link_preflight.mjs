import vm from "node:vm";

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return raw.toLowerCase();
  }
}

function makeIssue(code, message) {
  return { code, message };
}

function findMatchingBrace(text, startIndex) {
  let depth = 0;
  let inString = false;
  let quoteChar = null;
  let escaping = false;

  for (let i = startIndex; i < text.length; i += 1) {
    const char = text[i];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (inString) {
      if (char === "\\") {
        escaping = true;
      } else if (char === quoteChar) {
        inString = false;
        quoteChar = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quoteChar = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

export function extractPricingObjectFromAppSource(appSourceText) {
  const pricingStart = appSourceText.indexOf("const PRICING = {");
  if (pricingStart === -1) {
    throw new Error("Could not locate PRICING section in src/App.jsx.");
  }

  const braceStart = appSourceText.indexOf("{", pricingStart);
  const braceEnd = findMatchingBrace(appSourceText, braceStart);
  if (braceStart === -1 || braceEnd === -1 || braceEnd <= braceStart) {
    throw new Error("Could not determine PRICING object bounds in src/App.jsx.");
  }

  const objectLiteral = appSourceText.slice(braceStart, braceEnd + 1);

  return vm.runInNewContext(`(${objectLiteral})`);
}

export function validateGeneratedCatalogSupplierLinkApply(
  payload,
  {
    liveCatalogNames = [],
    pricingData = {},
    materialNormalization = {},
    supplierProductRegistry = {},
  } = {}
) {
  const drafts = Array.isArray(payload?.catalogRowDrafts)
    ? payload.catalogRowDrafts
    : [];
  const liveCatalogNameSet = new Set(
    liveCatalogNames.map((name) => normalizeName(name))
  );
  const existingUrlOwners = {};

  Object.entries(pricingData || {}).forEach(([catalogName, suppliers]) => {
    Object.entries(suppliers || {}).forEach(([supplierName, supplierData]) => {
      const normalizedUrl = normalizeUrl(supplierData?.url);
      if (!normalizedUrl) return;
      const key = `${normalizeName(supplierName)}|${normalizedUrl}`;
      if (!existingUrlOwners[key]) existingUrlOwners[key] = [];
      existingUrlOwners[key].push(catalogName);
    });
  });

  const draftResults = drafts.map((draft) => {
    const warnings = [];
    const blockingConflicts = [];
    const catalogDisplayName =
      draft?.catalogDisplayName || draft?.catalogRowDraft?.displayName || null;
    const canonicalMaterialKey =
      draft?.canonicalMaterialKey ||
      draft?.catalogRowDraft?.canonicalMaterialKey ||
      null;
    const sourceSupplierProducts = Array.isArray(draft?.sourceSupplierProducts)
      ? draft.sourceSupplierProducts
      : [];
    const normalizationEntry = materialNormalization?.[catalogDisplayName] || null;
    const existingPricingRow = pricingData?.[catalogDisplayName] || null;

    if (!catalogDisplayName) {
      blockingConflicts.push(
        makeIssue(
          "missing_catalog_display_name",
          "Draft is missing catalogDisplayName."
        )
      );
    } else if (!liveCatalogNameSet.has(normalizeName(catalogDisplayName))) {
      blockingConflicts.push(
        makeIssue(
          "target_catalog_row_missing",
          `Target live catalog row "${catalogDisplayName}" does not exist yet.`
        )
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

    if (!sourceSupplierProducts.length) {
      blockingConflicts.push(
        makeIssue(
          "missing_source_supplier_products",
          "Draft has no sourceSupplierProducts ownership records."
        )
      );
    }

    if (
      normalizationEntry?.canonicalMaterialKey &&
      canonicalMaterialKey &&
      normalizeName(normalizationEntry.canonicalMaterialKey) !==
        normalizeName(canonicalMaterialKey)
    ) {
      blockingConflicts.push(
        makeIssue(
          "normalization_canonical_key_mismatch",
          `Normalization canonicalMaterialKey "${normalizationEntry.canonicalMaterialKey}" does not match draft canonicalMaterialKey "${canonicalMaterialKey}".`
        )
      );
    }

    sourceSupplierProducts.forEach((product) => {
      const supplierProductKey = product?.supplierProductKey || null;
      const registryRecord = supplierProductKey
        ? supplierProductRegistry?.[supplierProductKey] || null
        : null;
      const supplierName =
        product?.supplierDisplayName ||
        registryRecord?.supplierDisplayName ||
        null;
      const normalizedUrl = normalizeUrl(product?.url || registryRecord?.url);

      if (!supplierProductKey) {
        blockingConflicts.push(
          makeIssue(
            "missing_supplier_product_key",
            `Draft "${catalogDisplayName}" has a supplier ownership row without supplierProductKey.`
          )
        );
        return;
      }

      if (!registryRecord) {
        blockingConflicts.push(
          makeIssue(
            "supplier_product_key_missing_from_registry",
            `supplierProductKey "${supplierProductKey}" is not present in the supplier registry.`
          )
        );
        return;
      }

      if (
        registryRecord?.mappedCatalogName &&
        catalogDisplayName &&
        normalizeName(registryRecord.mappedCatalogName) !==
          normalizeName(catalogDisplayName)
      ) {
        blockingConflicts.push(
          makeIssue(
            "supplier_product_registry_catalog_mismatch",
            `supplierProductKey "${supplierProductKey}" maps to "${registryRecord.mappedCatalogName}", not "${catalogDisplayName}".`
          )
        );
      }

      if (
        registryRecord?.mappedCanonicalMaterialKey &&
        canonicalMaterialKey &&
        normalizeName(registryRecord.mappedCanonicalMaterialKey) !==
          normalizeName(canonicalMaterialKey)
      ) {
        blockingConflicts.push(
          makeIssue(
            "supplier_product_registry_canonical_mismatch",
            `supplierProductKey "${supplierProductKey}" maps to canonicalMaterialKey "${registryRecord.mappedCanonicalMaterialKey}", not "${canonicalMaterialKey}".`
          )
        );
      }

      if (
        product?.url &&
        registryRecord?.url &&
        normalizeUrl(product.url) !== normalizeUrl(registryRecord.url)
      ) {
        blockingConflicts.push(
          makeIssue(
            "supplier_product_url_mismatch",
            `Draft URL for "${supplierProductKey}" does not match the supplier registry URL.`
          )
        );
      }

      if (!supplierName) {
        blockingConflicts.push(
          makeIssue(
            "missing_supplier_display_name",
            `supplierProductKey "${supplierProductKey}" has no supplier display name.`
          )
        );
      }

      if (!normalizedUrl) {
        blockingConflicts.push(
          makeIssue(
            "missing_supplier_url",
            `supplierProductKey "${supplierProductKey}" has no usable supplier URL.`
          )
        );
      }

      if (supplierName && existingPricingRow?.[supplierName]) {
        const existingUrl = normalizeUrl(existingPricingRow[supplierName]?.url);
        if (existingUrl === normalizedUrl) {
          warnings.push(
            makeIssue(
              "supplier_pricing_already_exists_same_way",
              `Supplier pricing/link ownership for "${supplierName}" is already present on "${catalogDisplayName}" with the same URL.`
            )
          );
        } else {
          blockingConflicts.push(
            makeIssue(
              "supplier_pricing_exists_with_different_url",
              `Supplier "${supplierName}" already has a different URL on "${catalogDisplayName}".`
            )
          );
        }
      }

      if (supplierName && normalizedUrl) {
        const collisionKey = `${normalizeName(supplierName)}|${normalizedUrl}`;
        const collisions = (existingUrlOwners[collisionKey] || []).filter(
          (ownerName) => normalizeName(ownerName) !== normalizeName(catalogDisplayName)
        );
        if (collisions.length > 0) {
          blockingConflicts.push(
            makeIssue(
              "supplier_url_owned_by_other_row",
              `Supplier URL already belongs to another live row for "${supplierName}": ${collisions.join(", ")}.`
            )
          );
        }
      }

      const existingSupplierLinkMeta =
        normalizationEntry?.supplierLinks?.[supplierName] || null;
      if (existingSupplierLinkMeta) {
        warnings.push(
          makeIssue(
            "normalization_supplier_link_already_present",
            `Normalization supplierLinks already contains "${supplierName}" for "${catalogDisplayName}".`
          )
        );
      }

      warnings.push(
        makeIssue(
          "supplier_pricing_points_missing",
          `No explicit supplier price points are present for "${supplierProductKey}"; apply will attach the URL with an empty S list.`
        )
      );
    });

    const status =
      blockingConflicts.length > 0
        ? "blocking_conflicts"
        : warnings.length > 0
        ? "warnings"
        : "safe_to_apply";

    return {
      catalogDisplayName,
      canonicalMaterialKey,
      status,
      warnings,
      blockingConflicts,
    };
  });

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
        "Preflight review only. No supplier pricing or supplier-link ownership is applied by this report.",
    },
    summary,
    drafts: draftResults,
  };
}
