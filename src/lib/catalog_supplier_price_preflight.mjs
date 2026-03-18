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

function normalizeUnit(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.toLowerCase() === "ml") return "mL";
  return raw;
}

function makeIssue(code, message) {
  return { code, message };
}

function normalizePricePoint(point) {
  if (!Array.isArray(point) || point.length !== 3) return null;

  const qty = Number(point[0]);
  const unit = normalizeUnit(point[1]);
  const price = Number(point[2]);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  if (!unit) return null;
  if (!Number.isFinite(price) || price < 0) return null;

  return [qty, unit, price];
}

function buildPricePointIdentityKey(point) {
  return `${point[0]}|${normalizeUnit(point[1])}|${point[2]}`;
}

function buildPricePointSizeKey(point) {
  return `${point[0]}|${normalizeUnit(point[1])}`;
}

function summarizeDraftResult(result) {
  if (result.blockingConflicts.length > 0) return "blocking_conflicts";
  if (result.warnings.length > 0) return "warnings";
  return "safe_to_apply";
}

export function validateCatalogSupplierPricePayload(
  payload,
  {
    liveCatalogNames = [],
    pricingData = {},
    materialNormalization = {},
    supplierProductRegistry = {},
  } = {}
) {
  const drafts = Array.isArray(payload?.supplierPriceDrafts)
    ? payload.supplierPriceDrafts
    : [];
  const liveCatalogNameSet = new Set(
    liveCatalogNames.map((name) => normalizeName(name))
  );

  const draftResults = drafts
    .map((draft) => {
      const warnings = [];
      const blockingConflicts = [];
      const catalogDisplayName = draft?.catalogDisplayName || null;
      const supplierName = draft?.supplierName || null;
      const supplierProductKey = draft?.supplierProductKey || null;
      const incomingUrl = normalizeUrl(draft?.url);
      const pricePoints = Array.isArray(draft?.pricePoints) ? draft.pricePoints : [];
      const pricingRow = pricingData?.[catalogDisplayName] || null;
      const ownedSupplierEntry = pricingRow?.[supplierName] || null;
      const normalizationEntry = materialNormalization?.[catalogDisplayName] || null;
      const registryRecord = supplierProductKey
        ? supplierProductRegistry?.[supplierProductKey] || null
        : null;

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
            `Target live catalog row "${catalogDisplayName}" does not exist.`
          )
        );
      }

      if (!supplierName) {
        blockingConflicts.push(
          makeIssue("missing_supplier_name", "Draft is missing supplierName.")
        );
      }

      if (!Array.isArray(draft?.pricePoints)) {
        blockingConflicts.push(
          makeIssue(
            "missing_price_points",
            "Draft must include a pricePoints array."
          )
        );
      } else if (pricePoints.length === 0) {
        blockingConflicts.push(
          makeIssue(
            "empty_price_points",
            "Draft pricePoints array is empty."
          )
        );
      }

      if (!ownedSupplierEntry) {
        blockingConflicts.push(
          makeIssue(
            "supplier_ownership_missing",
            `Supplier ownership for "${supplierName}" is not present on "${catalogDisplayName}".`
          )
        );
      }

      const ownedUrl = normalizeUrl(ownedSupplierEntry?.url);
      if (!incomingUrl) {
        blockingConflicts.push(
          makeIssue("missing_supplier_url", "Draft is missing a usable supplier URL.")
        );
      } else if (ownedUrl && incomingUrl !== ownedUrl) {
        blockingConflicts.push(
          makeIssue(
            "incoming_url_does_not_match_owned_url",
            `Incoming URL does not match the owned supplier URL for "${supplierName}" on "${catalogDisplayName}".`
          )
        );
      }

      if (supplierProductKey && !registryRecord) {
        blockingConflicts.push(
          makeIssue(
            "supplier_product_key_missing_from_registry",
            `supplierProductKey "${supplierProductKey}" is not present in the supplier registry.`
          )
        );
      }

      if (
        supplierProductKey &&
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
        supplierProductKey &&
        registryRecord?.supplierDisplayName &&
        supplierName &&
        normalizeName(registryRecord.supplierDisplayName) !==
          normalizeName(supplierName)
      ) {
        blockingConflicts.push(
          makeIssue(
            "supplier_product_registry_supplier_mismatch",
            `supplierProductKey "${supplierProductKey}" belongs to supplier "${registryRecord.supplierDisplayName}", not "${supplierName}".`
          )
        );
      }

      if (
        supplierProductKey &&
        registryRecord?.url &&
        incomingUrl &&
        normalizeUrl(registryRecord.url) !== incomingUrl
      ) {
        blockingConflicts.push(
          makeIssue(
            "supplier_product_registry_url_mismatch",
            `supplierProductKey "${supplierProductKey}" does not match the incoming supplier URL.`
          )
        );
      }

      if (normalizationEntry?.supplierLinks?.[supplierName] == null) {
        warnings.push(
          makeIssue(
            "normalization_supplier_link_missing",
            `Normalization supplierLinks does not currently list "${supplierName}" for "${catalogDisplayName}".`
          )
        );
      }

      const existingPointsRaw = Array.isArray(ownedSupplierEntry?.S)
        ? ownedSupplierEntry.S
        : [];
      const existingPoints = [];
      let existingPointsMalformed = false;
      existingPointsRaw.forEach((point) => {
        const normalized = normalizePricePoint(point);
        if (!normalized) {
          existingPointsMalformed = true;
          return;
        }
        existingPoints.push(normalized);
      });

      if (existingPointsMalformed) {
        blockingConflicts.push(
          makeIssue(
            "owned_supplier_price_data_malformed",
            `Existing price data for "${supplierName}" on "${catalogDisplayName}" is malformed.`
          )
        );
      }

      const existingIdentityKeys = new Set(
        existingPoints.map(buildPricePointIdentityKey)
      );
      const existingSizeMap = new Map(
        existingPoints.map((point) => [buildPricePointSizeKey(point), point[2]])
      );
      const incomingIdentityKeys = new Set();
      const incomingSizeMap = new Map();
      const normalizedIncomingPoints = [];

      pricePoints.forEach((point, idx) => {
        const normalized = normalizePricePoint(point);
        if (!normalized) {
          blockingConflicts.push(
            makeIssue(
              "malformed_price_point",
              `pricePoints[${idx}] must be [positive number, non-empty unit, non-negative price].`
            )
          );
          return;
        }

        const identityKey = buildPricePointIdentityKey(normalized);
        const sizeKey = buildPricePointSizeKey(normalized);

        if (incomingIdentityKeys.has(identityKey)) {
          warnings.push(
            makeIssue(
              "duplicate_incoming_price_point",
              `Incoming price point ${identityKey} is duplicated in the payload and will be applied once.`
            )
          );
          return;
        }

        if (
          incomingSizeMap.has(sizeKey) &&
          incomingSizeMap.get(sizeKey) !== normalized[2]
        ) {
          blockingConflicts.push(
            makeIssue(
              "incoming_size_conflict",
              `Incoming payload contains conflicting prices for size "${sizeKey}".`
            )
          );
          return;
        }

        incomingIdentityKeys.add(identityKey);
        incomingSizeMap.set(sizeKey, normalized[2]);

        if (existingIdentityKeys.has(identityKey)) {
          warnings.push(
            makeIssue(
              "price_point_already_present",
              `Price point ${identityKey} already exists for "${supplierName}" on "${catalogDisplayName}".`
            )
          );
          return;
        }

        if (
          existingSizeMap.has(sizeKey) &&
          existingSizeMap.get(sizeKey) !== normalized[2]
        ) {
          blockingConflicts.push(
            makeIssue(
              "existing_size_conflict",
              `Existing price data already has a different price for size "${sizeKey}".`
            )
          );
          return;
        }

        normalizedIncomingPoints.push(normalized);
      });

      if (
        blockingConflicts.length === 0 &&
        normalizedIncomingPoints.length === 0
      ) {
        warnings.push(
          makeIssue(
            "no_new_price_points",
            `No new price points remain to apply for "${supplierName}" on "${catalogDisplayName}".`
          )
        );
      }

      return {
        catalogDisplayName,
        supplierName,
        supplierProductKey,
        normalizedIncomingPoints,
        status: "pending",
        warnings,
        blockingConflicts,
      };
    })
    .map((result) => ({
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
        "Preflight review only. No supplier price-point data is applied by this report.",
    },
    summary,
    drafts: draftResults,
  };
}
