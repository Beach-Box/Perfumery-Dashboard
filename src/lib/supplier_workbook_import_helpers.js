import * as XLSX from "xlsx";

import {
  compareMaterialCasSupportValues,
  formatMaterialCasSupportValue,
  parseMaterialCasSupport,
} from "./ifra_combined_package.js";
import {
  buildLocalDraftIngredientArtifacts,
  SUPPLIER_ADAPTER_TRUST_LANE_META,
} from "./perfumer_runtime_helpers.js";

export const TRUSTED_SUPPLIER_IMPORT_SHEET_NAMES = [
  "Supplier_Products_Import",
  "Supplier_Prices_Import",
  "Material_Mapping",
];

export const TRUSTED_SUPPLIER_REFERENCE_EXPORT_SHEET_NAMES = [
  "Existing_FW_Products_Reference",
  "Existing_Materials_Reference",
  "Existing_FW_Product_Prices_Ref",
];

const SUPPLIER_PRODUCT_SHEET = "Supplier_Products_Import";
const SUPPLIER_PRICE_SHEET = "Supplier_Prices_Import";
const MATERIAL_MAPPING_SHEET = "Material_Mapping";
const FRATERWORKS_PRODUCTS_REFERENCE_SHEET = "Existing_FW_Products_Reference";
const MATERIALS_REFERENCE_SHEET = "Existing_Materials_Reference";
const FRATERWORKS_PRICES_REFERENCE_SHEET = "Existing_FW_Product_Prices_Ref";

const REFERENCE_EXPORT_HEADERS = {
  [FRATERWORKS_PRODUCTS_REFERENCE_SHEET]: [
    "supplier_product_key",
    "supplier_name",
    "current_supplier_product_name",
    "current_supplier_product_url",
    "current_material_name_if_mapped",
    "current_mapping_status",
    "current_availability",
    "current_ifra_percent_shown",
    "current_sds_url",
    "current_inci_shown",
    "current_cas_shown",
    "current_description",
    "current_scent_summary",
    "current_dilution_or_carrier",
    "current_sizes_summary",
    "current_prices_summary",
    "local_draft_or_canonical_status",
    "trust_completeness_status",
    "notes_warnings",
  ],
  [MATERIALS_REFERENCE_SHEET]: [
    "material_name",
    "canonical_or_local_draft",
    "supplier_variants_known",
    "cas",
    "inci",
    "note_role",
    "material_type",
    "scent_summary",
    "trust_completeness_level",
  ],
  [FRATERWORKS_PRICES_REFERENCE_SHEET]: [
    "supplier_product_key",
    "supplier_product_name",
    "supplier_product_url",
    "size_value",
    "size_unit",
    "price_value",
    "currency",
    "availability",
  ],
};

const SHEET_COLUMN_ALIASES = {
  [SUPPLIER_PRODUCT_SHEET]: {
    supplier_product_key: ["supplier_product_key", "product_key", "product id"],
    supplier_name: ["supplier_name", "supplier", "supplier display name"],
    supplier_product_name: [
      "supplier_product_name",
      "product_name",
      "supplier product name",
      "product title",
    ],
    supplier_product_url: [
      "supplier_product_url",
      "product_url",
      "supplier url",
      "url",
    ],
    supplier_sku: ["supplier_sku", "sku"],
    availability: ["availability", "availability_status", "stock_status"],
    ifra_percent_shown: [
      "ifra_percent_shown",
      "ifra_shown",
      "ifra_percent",
      "ifra",
    ],
    sds_url: ["sds_url", "sds"],
    inci_shown: ["inci_shown", "inci"],
    cas_shown: ["cas_shown", "cas"],
    product_description: [
      "product_description",
      "description",
      "supplier_product_description",
    ],
    scent_summary: ["scent_summary", "summary"],
    note_role: ["note_role", "note"],
    material_type: ["material_type", "type"],
    dilution_or_carrier: ["dilution_or_carrier", "dilution", "carrier"],
    technical_notes: ["technical_notes", "technical_note", "notes"],
    mw: ["mw"],
    xlogp: ["xlogp", "x_log_p", "logp"],
    tpsa: ["tpsa"],
    vp: ["vp", "vapor_pressure"],
    odt: ["odt", "odor_threshold"],
    create_local_draft: ["create_local_draft", "local_draft", "new_local_draft"],
    local_draft_material_name: [
      "local_draft_material_name",
      "draft_material_name",
      "new_material_name",
    ],
    source_trust: ["source_trust", "trust"],
    manual_trusted_context: [
      "manual_trusted_context",
      "trusted_context",
      "manual_context",
    ],
  },
  [SUPPLIER_PRICE_SHEET]: {
    supplier_product_key: ["supplier_product_key", "product_key", "product id"],
    supplier_name: ["supplier_name", "supplier", "supplier display name"],
    supplier_product_name: [
      "supplier_product_name",
      "product_name",
      "supplier product name",
      "product title",
    ],
    supplier_product_url: [
      "supplier_product_url",
      "product_url",
      "supplier url",
      "url",
    ],
    supplier_sku: ["supplier_sku", "sku"],
    size_value: ["size_value", "size", "pack_size", "qty", "quantity"],
    size_unit: ["size_unit", "unit", "pack_unit"],
    price_usd: ["price_usd", "price", "usd_price", "price_usd"],
    dilution_note: ["dilution_note", "dilution", "dilution_or_carrier"],
  },
  [MATERIAL_MAPPING_SHEET]: {
    supplier_product_key: ["supplier_product_key", "product_key", "product id"],
    supplier_name: ["supplier_name", "supplier", "supplier display name"],
    supplier_product_name: [
      "supplier_product_name",
      "product_name",
      "supplier product name",
      "product title",
    ],
    supplier_product_url: [
      "supplier_product_url",
      "product_url",
      "supplier url",
      "url",
    ],
    supplier_sku: ["supplier_sku", "sku"],
    mapping_action: [
      "mapping_action",
      "mapping_status",
      "mapping_decision",
      "material_mapping",
    ],
    mapped_material_name: [
      "mapped_material_name",
      "mapped_material",
      "existing_material_name",
      "catalog_name",
    ],
    local_draft_material_name: [
      "local_draft_material_name",
      "draft_material_name",
      "new_material_name",
    ],
    review_note: ["review_note", "mapping_note", "note"],
  },
};

const REQUIRED_HEADER_GROUPS = {
  [SUPPLIER_PRODUCT_SHEET]: [["supplier_name"], ["supplier_product_name"]],
  [SUPPLIER_PRICE_SHEET]: [
    ["size_value"],
    ["size_unit"],
    ["price_usd"],
    ["supplier_product_key", "supplier_name"],
  ],
  [MATERIAL_MAPPING_SHEET]: [
    ["mapping_action"],
    ["supplier_product_key", "supplier_name"],
  ],
};

const ISSUE_LABELS = {
  new_item_candidate: "New item candidate",
  mapping_unresolved: "Mapping unresolved",
  merge_review: "Merge / duplicate review",
  canonical_conflict_inci: "INCI conflict",
  canonical_conflict_cas: "CAS conflict",
  canonical_conflict_ifra: "IFRA / restriction conflict",
};

const AVAILABILITY_LABELS = {
  unknown: "Unknown",
  in_stock: "In stock",
  limited_stock: "Limited stock",
  request_only: "Request / quote",
  sold_out: "Sold out",
  discontinued: "Discontinued",
};

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return raw;
  }
}

function getUrlSlug(value) {
  const normalizedUrl = normalizeUrl(value);
  if (!normalizedUrl) return null;
  try {
    const url = new URL(normalizedUrl);
    const pieces = url.pathname.split("/").filter(Boolean);
    return slugify(pieces[pieces.length - 1] || url.hostname || normalizedUrl);
  } catch {
    return slugify(normalizedUrl);
  }
}

function parseBooleanFlag(value) {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return ["true", "yes", "y", "1", "local draft", "create"].includes(
    normalized
  );
}

function parseNumberValue(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePercentValue(value) {
  const parsed = parseNumberValue(value);
  return parsed != null && parsed >= 0 ? parsed : null;
}

function normalizeAvailability(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "unknown";
  if (normalized.includes("request") || normalized.includes("quote")) {
    return "request_only";
  }
  if (normalized.includes("limited") || normalized.includes("low stock")) {
    return "limited_stock";
  }
  if (
    normalized.includes("sold out") ||
    normalized.includes("out of stock") ||
    normalized.includes("unavailable")
  ) {
    return "sold_out";
  }
  if (normalized.includes("discontinued")) {
    return "discontinued";
  }
  if (normalized.includes("stock") || normalized.includes("available")) {
    return "in_stock";
  }
  return "unknown";
}

function normalizePriceUnit(value) {
  const normalized = normalizeText(value);
  if (normalized === "g" || normalized === "gram" || normalized === "grams") {
    return "g";
  }
  if (normalized === "ml" || normalized === "milliliter" || normalized === "milliliters") {
    return "mL";
  }
  return null;
}

function normalizeMappingAction(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (
    [
      "existing",
      "existing material",
      "existing_material",
      "map existing",
      "map_existing",
      "link existing material",
    ].includes(normalized)
  ) {
    return "existing_material";
  }
  if (
    [
      "create local draft",
      "create_local_draft",
      "local draft",
      "local_draft",
      "new local draft",
      "new_local_draft",
    ].includes(normalized)
  ) {
    return "create_local_draft";
  }
  if (
    ["unresolved", "review", "pending review", "pending", "hold"].includes(
      normalized
    )
  ) {
    return "unresolved";
  }
  return normalized;
}

function getCanonicalValue(rawRow, aliasesByCanonical, canonicalKey) {
  const aliasSet = new Set(
    [canonicalKey, ...(aliasesByCanonical[canonicalKey] || [])].map(normalizeHeader)
  );
  const matchKey = Object.keys(rawRow || {}).find((rawKey) =>
    aliasSet.has(normalizeHeader(rawKey))
  );
  return matchKey ? rawRow[matchKey] : "";
}

function normalizeSheetRows(rows, sheetName) {
  const aliasesByCanonical = SHEET_COLUMN_ALIASES[sheetName] || {};
  return (Array.isArray(rows) ? rows : []).map((row, index) => {
    const normalizedRow = { rowNumber: index + 2, sheetName };
    Object.keys(aliasesByCanonical).forEach((canonicalKey) => {
      normalizedRow[canonicalKey] = getCanonicalValue(
        row,
        aliasesByCanonical,
        canonicalKey
      );
    });
    return normalizedRow;
  });
}

function validateSheetHeaders(sheetName, headerRow) {
  const normalizedHeaders = new Set(
    (Array.isArray(headerRow) ? headerRow : []).map(normalizeHeader).filter(Boolean)
  );
  const missingGroups = (REQUIRED_HEADER_GROUPS[sheetName] || []).filter(
    (group) =>
      !group.some((canonicalKey) => {
        const aliases = SHEET_COLUMN_ALIASES[sheetName]?.[canonicalKey] || [];
        return [canonicalKey, ...aliases].some((alias) =>
          normalizedHeaders.has(normalizeHeader(alias))
        );
      })
  );

  return missingGroups.map((group) =>
    `Missing required column for ${sheetName}: ${group.join(" or ")}.`
  );
}

function buildRowWarning({
  sheetName,
  rowNumber = null,
  supplierProductKey = null,
  severity = "warning",
  message,
}) {
  return {
    sheetName,
    rowNumber,
    supplierProductKey: supplierProductKey || null,
    severity,
    message,
  };
}

export function parseTrustedSupplierWorkbookArrayBuffer(arrayBuffer) {
  const fatalErrors = [];
  let workbook = null;

  try {
    workbook = XLSX.read(arrayBuffer, { type: "array" });
  } catch (error) {
    return {
      fatalErrors: [
        `Workbook could not be read as XLSX: ${String(
          error?.message || error || "Unknown error"
        )}`,
      ],
      warnings: [],
      workbookMetadata: null,
      rowsBySheet: {},
    };
  }

  const warnings = [];
  const rowsBySheet = {};
  const workbookSheetNames = Array.isArray(workbook?.SheetNames)
    ? workbook.SheetNames
    : [];

  TRUSTED_SUPPLIER_IMPORT_SHEET_NAMES.forEach((sheetName) => {
    const sheet = workbook?.Sheets?.[sheetName];
    if (!sheet) {
      fatalErrors.push(`Missing required sheet: ${sheetName}.`);
      rowsBySheet[sheetName] = [];
      return;
    }

    const headerRow = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      range: 0,
      defval: "",
      blankrows: false,
    })?.[0] || [];
    fatalErrors.push(...validateSheetHeaders(sheetName, headerRow));

    const rows = XLSX.utils.sheet_to_json(sheet, {
      defval: "",
      raw: false,
      blankrows: false,
    });
    rowsBySheet[sheetName] = normalizeSheetRows(rows, sheetName);
  });

  return {
    fatalErrors,
    warnings,
    workbookMetadata: {
      sheetNames: workbookSheetNames,
      rowCounts: Object.fromEntries(
        Object.entries(rowsBySheet).map(([sheetName, rows]) => [
          sheetName,
          rows.length,
        ])
      ),
    },
    rowsBySheet,
  };
}

function deriveSupplierProductKey(row, { buildSupplierProductKey } = {}) {
  const explicitKey = String(row?.supplier_product_key || "").trim();
  if (explicitKey) return explicitKey;

  const supplierName = String(row?.supplier_name || "").trim();
  const url = normalizeUrl(row?.supplier_product_url);
  const sku = String(row?.supplier_sku || "").trim();

  if (typeof buildSupplierProductKey === "function") {
    const builtKey = buildSupplierProductKey({
      supplierName,
      supplierKey: supplierName,
      url,
      sku,
    });
    if (builtKey) return builtKey;
  }

  const supplierSlug = slugify(supplierName);
  const identifier =
    slugify(sku) ||
    getUrlSlug(url) ||
    slugify(row?.supplier_product_name || row?.mapped_material_name);

  return identifier ? `${supplierSlug}:${identifier}` : null;
}

function normalizePricePoint(point) {
  if (!Array.isArray(point) || point.length < 3) return null;
  const qty = Number(point[0]);
  const unit = normalizePriceUnit(point[1]);
  const price = Number(point[2]);
  const dilution = String(point[3] || "").trim() || null;
  if (!Number.isFinite(qty) || qty <= 0) return null;
  if (!unit) return null;
  if (!Number.isFinite(price) || price < 0) return null;
  return [qty, unit, price, dilution];
}

function dedupePricePoints(pricePoints = []) {
  const seen = new Set();
  return pricePoints
    .map(normalizePricePoint)
    .filter((point) => {
      if (!point) return false;
      const key = point.join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a[0] - b[0] || a[2] - b[2]);
}

function normalizeSupplierWorkbookReviewItem({
  reviewItemKey,
  supplierProductKey,
  supplierDisplayName,
  trustLane = "batch_review_mapping",
  issueType = "mapping_unresolved",
  productTitle,
  url,
  mappedCatalogName = null,
  canonicalMaterialKey = null,
  whyItMatters,
  nextAction,
  fieldKey = null,
  fieldLabel = null,
  supplierValue = null,
  currentValue = null,
  fetchTimestamp = null,
  sourceOrigin = "trusted_supplier_xlsx_import",
  sourceSystemLabel = "Trusted Supplier XLSX Import",
  evidenceCandidateKeyPrefix = "trusted_supplier_import_conflict",
}) {
  const laneMeta = SUPPLIER_ADAPTER_TRUST_LANE_META[trustLane];

  return {
    reviewItemKey,
    supplierProductKey,
    supplier: supplierDisplayName || null,
    supplierDisplayName: supplierDisplayName || null,
    trustLane,
    trustLaneLabel: laneMeta?.label || trustLane,
    issueType,
    issueLabel: ISSUE_LABELS[issueType] || issueType,
    productTitle: productTitle || null,
    url: url || null,
    mappedCatalogName: mappedCatalogName || null,
    canonicalMaterialKey: canonicalMaterialKey || null,
    whyItMatters,
    nextAction,
    fieldKey,
    fieldLabel,
    supplierValue,
    currentValue,
    fetchTimestamp: fetchTimestamp || null,
    canStageToEvidence: Boolean(fieldKey),
    sourceOrigin,
    sourceSystemLabel,
    sourceSummary:
      sourceSystemLabel === "Trusted Supplier XLSX Import"
        ? "Conflict staged from a trusted supplier workbook import."
        : `Conflict staged from ${sourceSystemLabel}.`,
    evidenceCandidateKeyPrefix,
  };
}

function buildImportSourceNote(productRow) {
  return [
    "Trusted supplier workbook import",
    String(productRow?.source_trust || "").trim() || null,
    String(productRow?.manual_trusted_context || "").trim() || null,
    String(productRow?.technical_notes || "").trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function buildSupplierLayerRecord({
  supplierProductKey,
  supplierDisplayName,
  productRow,
  pricePoints,
  importedAt,
  trustLane,
  mappedCatalogName,
  canonicalMaterialKey,
  reviewItems,
  canAutoApplyToPricing,
}) {
  const laneMeta = SUPPLIER_ADAPTER_TRUST_LANE_META[trustLane];
  const recordKey = `supplier_layer:${slugify(supplierProductKey)}`;
  const normalizedUrl = normalizeUrl(productRow?.supplier_product_url);
  const normalizedAvailability = normalizeAvailability(productRow?.availability);
  const normalizedIfraPercent = parsePercentValue(productRow?.ifra_percent_shown);
  const normalizedCasSupport = parseMaterialCasSupport(productRow?.cas_shown);
  const notes = [
    "Trusted supplier workbook facts were captured into the supplier layer.",
    canAutoApplyToPricing && mappedCatalogName
      ? `Mapped pricing for "${mappedCatalogName}" refreshed immediately from the workbook import.`
      : mappedCatalogName
      ? "Mapped supplier facts were captured, but live pricing stayed review-gated."
      : "Supplier-layer facts were captured without creating live catalog ownership yet.",
    reviewItems.length > 0
      ? `${reviewItems.length} review item${
          reviewItems.length === 1 ? "" : "s"
        } still need attention.`
      : "No mapping or conflict issues were surfaced by this import row.",
  ];

  return {
    recordKey,
    supplierKey: slugify(supplierDisplayName),
    supplierDisplayName,
    supplierProductKey,
    trustLane,
    trustLaneLabel: laneMeta?.label || trustLane,
    trustLaneDescription: laneMeta?.description || null,
    mappedCatalogName: mappedCatalogName || null,
    canonicalMaterialKey: canonicalMaterialKey || null,
    fetchedAt: importedAt,
    sourceUrl: normalizedUrl,
    sourceNote: buildImportSourceNote(productRow),
    sourceOrigin: "trusted_supplier_xlsx_import",
    pageFacts: {
      productTitle: String(productRow?.supplier_product_name || "").trim() || null,
      url: normalizedUrl,
      pricePoints,
      availabilityStatus: normalizedAvailability,
      availabilityStatusLabel:
        AVAILABILITY_LABELS[normalizedAvailability] || "Unknown",
      ifraPercent: normalizedIfraPercent,
      sdsUrl: normalizeUrl(productRow?.sds_url),
      inci: String(productRow?.inci_shown || "").trim() || null,
      casShown: normalizedCasSupport.displayValue || null,
      casState: normalizedCasSupport.state,
      casValues: normalizedCasSupport.values,
      casComparisonKey: normalizedCasSupport.comparisonKey || null,
      productDescription:
        String(productRow?.product_description || "").trim() || null,
      scentSummary: String(productRow?.scent_summary || "").trim() || null,
      noteRole: String(productRow?.note_role || "").trim() || null,
      materialType: String(productRow?.material_type || "").trim() || null,
      dilutionOrCarrier:
        String(productRow?.dilution_or_carrier || "").trim() || null,
      technicalNotes: String(productRow?.technical_notes || "").trim() || null,
      molecularSupport: {
        MW: parseNumberValue(productRow?.mw),
        xLogP: parseNumberValue(productRow?.xlogp),
        TPSA: parseNumberValue(productRow?.tpsa),
        VP: parseNumberValue(productRow?.vp),
        ODT: parseNumberValue(productRow?.odt),
      },
      importedFromWorkbook: true,
    },
    autoAppliedFieldKeys: [
      productRow?.supplier_product_name ? "productTitle" : null,
      normalizedUrl ? "url" : null,
      pricePoints.length > 0 ? "pricePoints" : null,
      productRow?.availability ? "availabilityStatus" : null,
      normalizedIfraPercent != null ? "ifraPercent" : null,
      productRow?.sds_url ? "sdsUrl" : null,
      productRow?.inci_shown ? "inci" : null,
      productRow?.product_description ? "productDescription" : null,
    ].filter(Boolean),
    autoAppliedFieldLabels: [],
    canAutoApplyToPricing,
    pricingAutoApplyCatalogName: canAutoApplyToPricing ? mappedCatalogName : null,
    reviewItems,
    notes,
  };
}

function buildPricingPatch({
  catalogName,
  supplierName,
  productRow,
  pricePoints,
}) {
  return {
    catalogName,
    supplierName,
    url: normalizeUrl(productRow?.supplier_product_url) || "",
    pricePoints,
    availabilityStatus: normalizeAvailability(productRow?.availability),
    ifraPercent: parsePercentValue(productRow?.ifra_percent_shown),
    sdsUrl: normalizeUrl(productRow?.sds_url) || "",
    sourceType: "trusted_supplier_xlsx_import",
  };
}

function buildImportResultRow({
  supplierProductKey,
  supplierName,
  productTitle,
  mappedCatalogName,
  trustLane,
  reviewItemCount,
  priceRowCount,
  createdLocalDraft,
  warnings,
  status,
  note,
}) {
  return {
    supplierProductKey,
    supplierName,
    productTitle,
    mappedCatalogName: mappedCatalogName || null,
    trustLane,
    trustLaneLabel:
      SUPPLIER_ADAPTER_TRUST_LANE_META[trustLane]?.label || trustLane,
    reviewItemCount,
    priceRowCount,
    createdLocalDraft: Boolean(createdLocalDraft),
    warningCount: warnings.length,
    warnings,
    status,
    note,
  };
}

function getSupplierRegistryProductMap(supplierProductRegistry = {}) {
  if (
    supplierProductRegistry?.products &&
    typeof supplierProductRegistry.products === "object"
  ) {
    return supplierProductRegistry.products;
  }
  return supplierProductRegistry && typeof supplierProductRegistry === "object"
    ? supplierProductRegistry
    : {};
}

function isFraterworksSupplierRecord(record) {
  const supplierKey = normalizeText(
    record?.supplierKey || record?.supplierDisplayName || record?.supplier_name
  );
  return supplierKey === "fraterworks";
}

function findSupplierPricingEntry(pricingByName, supplierName) {
  const entries = Object.entries(pricingByName || {});
  const matchedEntry = entries.find(
    ([name]) => normalizeText(name) === normalizeText(supplierName)
  );
  return matchedEntry?.[1] || null;
}

function buildMergedLivePricing(pricesState = {}, pricing = {}) {
  const names = new Set([
    ...Object.keys(pricing || {}),
    ...Object.keys(pricesState || {}),
  ]);
  return Object.fromEntries(
    Array.from(names).map((name) => [
      name,
      {
        ...(pricing?.[name] || {}),
        ...(pricesState?.[name] || {}),
      },
    ])
  );
}

function formatDecimal(value, digits = 2) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "";
}

function formatCurrency(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `$${parsed.toFixed(2)}` : "";
}

function formatPricePointSize(point) {
  if (!Array.isArray(point) || point.length < 2) return "";
  const qty = Number(point[0]);
  const unit = normalizePriceUnit(point[1]);
  if (!Number.isFinite(qty) || qty <= 0 || !unit) return "";
  return `${formatDecimal(qty, qty % 1 === 0 ? 0 : 2)}${unit}`;
}

function formatPricePointSummary(point) {
  if (!Array.isArray(point) || point.length < 3) return "";
  const sizeLabel = formatPricePointSize(point);
  const priceLabel = formatCurrency(point[2]);
  const dilution = String(point[3] || "").trim();
  return [priceLabel && sizeLabel ? `${priceLabel} / ${sizeLabel}` : null, dilution]
    .filter(Boolean)
    .join(" · ");
}

function summarizeSizes(pricePoints = []) {
  return pricePoints.map(formatPricePointSize).filter(Boolean).join("; ");
}

function summarizePrices(pricePoints = []) {
  return pricePoints.map(formatPricePointSummary).filter(Boolean).join("; ");
}

function getAvailabilityLabel(value) {
  if (value == null || value === "") return "";
  const normalized = normalizeAvailability(value);
  return AVAILABILITY_LABELS[normalized] || String(value).trim();
}

function buildMaterialStatusLabel(record) {
  if (record?.isLocalDraft || record?.entryKind === "local_draft") {
    return "Local draft / manual trusted entry";
  }
  if (record?.entryKind === "canonical_material") {
    return "Canonical material";
  }
  if (record?.entryKind === "supplier_product") {
    return "Supplier-product row";
  }
  if (record?.entryKind) {
    return String(record.entryKind).replace(/_/g, " ");
  }
  return "Live catalog row";
}

function buildMappingStatusLabel({
  mappedCatalogName,
  mappedRecord,
  reviewItems = [],
  registryRecord,
}) {
  if (mappedCatalogName && (mappedRecord?.isLocalDraft || mappedRecord?.entryKind === "local_draft")) {
    return "mapped_local_draft";
  }
  if (mappedCatalogName) {
    return "mapped_existing_material";
  }
  if ((reviewItems || []).length > 0) {
    return "review_required";
  }
  if (registryRecord) {
    return "registry_unmapped";
  }
  return "unresolved";
}

function buildTrustStatusLabel(truthReport) {
  if (!truthReport) return "No mapped material trust context";
  return [truthReport.levelLabel, truthReport.supportLabel]
    .filter(Boolean)
    .join(" · ");
}

function buildNotesWarningsSummary(parts) {
  return Array.from(
    new Set(
      (Array.isArray(parts) ? parts : [])
        .flat()
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  ).join(" | ");
}

function buildReferenceSheet(rows, headers) {
  return XLSX.utils.json_to_sheet(Array.isArray(rows) ? rows : [], {
    header: Array.isArray(headers) ? headers : [],
    skipHeader: false,
  });
}

const FRATERWORKS_JSON_SOURCE_LABEL = "Fraterworks JSON Paste Import";
const FRATERWORKS_FULL_SYNC_SOURCE_LABEL = "Fraterworks Full Catalog Sync";
const FRATERWORKS_JSON_WARNING_SHEET = "Fraterworks JSON";
const FRATERWORKS_PRODUCTS_JSON_URL = "https://fraterworks.com/products.json";
const FRATERWORKS_PRODUCTS_JSON_PAGE_LIMIT = 250;
const FRATERWORKS_PRODUCTS_JSON_MAX_PAGES = 40;

const HTML_ENTITY_MAP = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeHtmlEntities(value) {
  return String(value || "").replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (match, entity) => {
      const normalizedEntity = String(entity || "").toLowerCase();
      if (normalizedEntity.startsWith("#x")) {
        const parsed = Number.parseInt(normalizedEntity.slice(2), 16);
        return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : match;
      }
      if (normalizedEntity.startsWith("#")) {
        const parsed = Number.parseInt(normalizedEntity.slice(1), 10);
        return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : match;
      }
      return HTML_ENTITY_MAP[normalizedEntity] || match;
    }
  );
}

function resolveRelativeUrl(value, baseUrl = "") {
  const rawValue = String(value || "").trim();
  if (!rawValue) return null;
  try {
    if (baseUrl) {
      return normalizeUrl(new URL(rawValue, baseUrl).toString());
    }
    return normalizeUrl(new URL(rawValue).toString());
  } catch {
    return normalizeUrl(rawValue);
  }
}

export function deriveFraterworksProductJsonUrl(productUrl = "") {
  const normalizedUrl = normalizeUrl(productUrl);
  if (!normalizedUrl) return null;
  try {
    const url = new URL(normalizedUrl);
    if (!/fraterworks\.com$/i.test(url.hostname)) {
      return null;
    }
    const productHandle = url.pathname.match(/\/products\/([^/?#]+)/i)?.[1];
    if (!productHandle) return null;
    url.pathname = `/products/${productHandle}.js`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function cleanShopifyHtmlToText(value) {
  return decodeHtmlEntities(
    String(value || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

function extractLabelValueFromCleanText(cleanText, labelPatterns = []) {
  const lines = String(cleanText || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const pattern of labelPatterns) {
      if (!(pattern instanceof RegExp)) continue;
      const inlineMatch = line.match(
        new RegExp(`${pattern.source}\\s*[:\\-]\\s*(.+)$`, pattern.flags)
      );
      if (inlineMatch?.[1]) {
        return inlineMatch[1].trim();
      }
      if (pattern.test(line) && lines[index + 1]) {
        return lines[index + 1].trim();
      }
    }
  }
  return "";
}

function extractFraterworksSdsUrl(bodyHtml = "", productUrl = "") {
  const anchorMatches = Array.from(
    String(bodyHtml || "").matchAll(
      /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
    )
  );
  for (const match of anchorMatches) {
    const href = resolveRelativeUrl(match?.[1], productUrl);
    const label = cleanShopifyHtmlToText(match?.[2] || "");
    const haystack = normalizeText([href, label].filter(Boolean).join(" "));
    if (
      href &&
      (haystack.includes(" sds ") ||
        haystack.startsWith("sds ") ||
        haystack.includes(" msds ") ||
        haystack.includes(" safety data ") ||
        haystack.includes(" safety datasheet "))
    ) {
      return href;
    }
  }

  const pdfMatches = Array.from(
    String(bodyHtml || "").matchAll(/href=["']([^"']+\.pdf[^"']*)["']/gi)
  );
  for (const match of pdfMatches) {
    const href = resolveRelativeUrl(match?.[1], productUrl);
    const haystack = normalizeText(href);
    if (
      href &&
      (haystack.includes("sds") ||
        haystack.includes("msds") ||
        haystack.includes("safety"))
    ) {
      return href;
    }
  }

  return null;
}

function extractFraterworksIfraPercent(bodyHtml = "", cleanText = "") {
  const matches = [
    String(bodyHtml || "").match(/IFRA[\s\S]{0,160}?(\d+(?:\.\d+)?)\s*%/i),
    String(cleanText || "").match(/IFRA[^\n%]{0,80}(\d+(?:\.\d+)?)\s*%/i),
  ].filter(Boolean);
  for (const match of matches) {
    const parsed = parsePercentValue(match?.[1]);
    if (parsed != null) return parsed;
  }
  return null;
}

function extractFraterworksComplianceFields(bodyHtml = "", productUrl = "") {
  const cleanText = cleanShopifyHtmlToText(bodyHtml);
  const inciValue = extractLabelValueFromCleanText(cleanText, [
    /INCI(?:\s+Name)?/i,
  ]);
  const casValue = extractLabelValueFromCleanText(cleanText, [
    /CAS(?:\s+(?:No\.?|Number))?/i,
  ]);
  const casSupport = parseMaterialCasSupport(casValue);

  return {
    cleanText,
    sdsUrl: extractFraterworksSdsUrl(bodyHtml, productUrl),
    ifraPercent: extractFraterworksIfraPercent(bodyHtml, cleanText),
    inci: inciValue || null,
    casSupport,
  };
}

function normalizeTagList(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function deriveScentSummaryFromDescription(description) {
  const paragraphs = String(description || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const firstUsefulParagraph =
    paragraphs.find((paragraph) => paragraph.length >= 24) || paragraphs[0] || "";
  return firstUsefulParagraph.length > 220
    ? `${firstUsefulParagraph.slice(0, 217).trim()}...`
    : firstUsefulParagraph;
}

function deriveFraterworksMaterialType(productType, tags = []) {
  const haystack = normalizeText([productType, ...(tags || [])].join(" "));
  if (!haystack) return "";
  if (haystack.includes("essential oil") || haystack.includes(" eo ")) return "EO";
  if (haystack.includes("absolute")) return "ABS";
  if (haystack.includes("co2")) return "CO2";
  if (haystack.includes("resinoid")) return "RES";
  if (
    haystack.includes("carrier") ||
    haystack.includes("solvent") ||
    haystack.includes("diluent")
  ) {
    return "CARRIER";
  }
  if (
    haystack.includes("accord") ||
    haystack.includes("compound") ||
    haystack.includes("base")
  ) {
    return "ACCORD";
  }
  if (haystack.includes("isolate")) return "ISOLATE";
  if (
    haystack.includes("synthetic") ||
    haystack.includes("molecule") ||
    haystack.includes("aroma chemical")
  ) {
    return "SYNTH";
  }
  return "";
}

function deriveFraterworksNoteRole(productType, tags = []) {
  const haystack = normalizeText([productType, ...(tags || [])].join(" "));
  if (!haystack) return "";
  if (haystack.includes("top")) return "top";
  if (haystack.includes("heart") || haystack.includes("middle") || haystack.includes("mid")) {
    return "mid";
  }
  if (haystack.includes("base")) return "base";
  return "";
}

function getShopifyImageUrl(product) {
  const firstImage =
    (Array.isArray(product?.images) ? product.images[0] : null) || product?.image || null;
  return normalizeUrl(firstImage?.src || firstImage?.url || "");
}

function parseFraterworksVariantSize(variant) {
  const candidates = [
    variant?.option1,
    variant?.title,
    ...(Array.isArray(variant?.options)
      ? variant.options.map((option) => option?.value || option)
      : []),
  ];
  for (const candidate of candidates) {
    const match = String(candidate || "").match(
      /(\d+(?:\.\d+)?)\s*(g|grams?|ml|mL|milliliters?)/i
    );
    if (!match) continue;
    const sizeValue = Number(match[1]);
    const sizeUnit = normalizePriceUnit(match[2]);
    if (Number.isFinite(sizeValue) && sizeValue > 0 && sizeUnit) {
      return { sizeValue, sizeUnit };
    }
  }
  return null;
}

function parseFraterworksVariantDilution(variant) {
  const candidates = [
    variant?.option2,
    variant?.option3,
    variant?.title,
    ...(Array.isArray(variant?.options)
      ? variant.options.map((option) => option?.value || option)
      : []),
  ];
  for (const candidate of candidates) {
    const normalizedCandidate = String(candidate || "").trim();
    if (!normalizedCandidate) continue;
    const match = normalizedCandidate.match(
      /(\d+(?:\.\d+)?)\s*%\s*[a-z0-9 ]+/i
    );
    if (match) {
      return match[0].trim().replace(/\s+/g, " ");
    }
  }
  return null;
}

function extractCasLikePrefixFromSku(sku) {
  const rawSku = String(sku || "").trim();
  if (!rawSku) return { casCandidate: null, looksCasLike: false };
  const match = rawSku.match(/^(\d{2,7}-\d{2}-\d)\b/);
  return {
    casCandidate: match?.[1] || null,
    looksCasLike: /^\d{2,7}-/.test(rawSku),
  };
}

function findExactCatalogNameByTitle(title, db = {}) {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) return null;
  const matches = Object.keys(db || {}).filter(
    (name) => normalizeText(name) === normalizedTitle
  );
  return matches.length === 1 ? matches[0] : null;
}

function buildJsonPreviewRows(products = []) {
  return (Array.isArray(products) ? products : []).slice(0, 8).map((product, index) => {
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    const anyAvailable = variants.some((variant) => Boolean(variant?.available));
    return {
      rowKey: String(product?.id || product?.handle || index),
      title: String(product?.title || "").trim() || `Product ${index + 1}`,
      handle: String(product?.handle || "").trim() || "",
      vendor: String(product?.vendor || "").trim() || "Fraterworks",
      variantCount: variants.length,
      availability: variants.length
        ? anyAvailable
          ? "In stock"
          : "Sold out"
        : "Unknown",
    };
  });
}

function normalizeSmartJsonPunctuation(text) {
  let replacements = 0;
  const normalizedText = String(text || "").replace(/[\u2018\u2019\u201A\u201B]/g, () => {
    replacements += 1;
    return "'";
  }).replace(/[\u201C\u201D\u201E\u201F]/g, () => {
    replacements += 1;
    return '"';
  }).replace(/\u00A0/g, () => {
    replacements += 1;
    return " ";
  });

  return {
    text: normalizedText,
    replacements,
  };
}

function stripLikelyJsonWrapperJunk(text) {
  let nextText = String(text || "");
  let changed = false;
  const wrapperNotes = [];

  const fencedMatch = nextText.match(/^\s*```(?:json|javascript|js)?\s*([\s\S]*?)\s*```\s*$/i);
  if (fencedMatch) {
    nextText = fencedMatch[1];
    changed = true;
    wrapperNotes.push("Removed Markdown code fences around the pasted JSON.");
  }

  const trimmedText = nextText.trim().replace(/^\uFEFF/, "");
  if (trimmedText !== nextText) {
    nextText = trimmedText;
    changed = true;
  }

  const firstObjectIndex = nextText.indexOf("{");
  const firstArrayIndex = nextText.indexOf("[");
  const startIndexCandidates = [firstObjectIndex, firstArrayIndex].filter(
    (value) => value >= 0
  );
  const startIndex =
    startIndexCandidates.length > 0 ? Math.min(...startIndexCandidates) : -1;
  const lastObjectIndex = nextText.lastIndexOf("}");
  const lastArrayIndex = nextText.lastIndexOf("]");
  const endIndex = Math.max(lastObjectIndex, lastArrayIndex);

  if (
    startIndex >= 0 &&
    endIndex >= startIndex &&
    (startIndex > 0 || endIndex < nextText.length - 1)
  ) {
    nextText = nextText.slice(startIndex, endIndex + 1).trim();
    changed = true;
    wrapperNotes.push("Removed obvious wrapper text around the JSON payload.");
  }

  return {
    text: nextText,
    changed,
    wrapperNotes,
  };
}

function removeTrailingCommasOutsideStrings(text) {
  let result = "";
  let inString = false;
  let escapeNext = false;
  let removedCount = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      result += char;
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }

    if (!inString && char === ",") {
      let lookaheadIndex = index + 1;
      while (lookaheadIndex < text.length && /\s/.test(text[lookaheadIndex])) {
        lookaheadIndex += 1;
      }
      if (text[lookaheadIndex] === "}" || text[lookaheadIndex] === "]") {
        removedCount += 1;
        continue;
      }
    }

    result += char;
  }

  return {
    text: result,
    removedCount,
  };
}

function repairHtmlFieldQuotes(text, fieldKey = "body_html") {
  const keyToken = `"${fieldKey}"`;
  let cursor = 0;
  let result = "";
  let repairCount = 0;

  while (cursor < text.length) {
    const keyIndex = text.indexOf(keyToken, cursor);
    if (keyIndex < 0) {
      result += text.slice(cursor);
      break;
    }

    result += text.slice(cursor, keyIndex);
    let scanIndex = keyIndex + keyToken.length;
    while (scanIndex < text.length && /\s/.test(text[scanIndex])) {
      scanIndex += 1;
    }
    if (text[scanIndex] !== ":") {
      result += keyToken;
      cursor = keyIndex + keyToken.length;
      continue;
    }
    scanIndex += 1;
    while (scanIndex < text.length && /\s/.test(text[scanIndex])) {
      scanIndex += 1;
    }
    if (text[scanIndex] !== '"') {
      result += text.slice(keyIndex, scanIndex);
      cursor = scanIndex;
      continue;
    }

    result += text.slice(keyIndex, scanIndex + 1);
    scanIndex += 1;

    while (scanIndex < text.length) {
      const char = text[scanIndex];
      if (char === "\\") {
        result += text.slice(scanIndex, scanIndex + 2);
        scanIndex += 2;
        continue;
      }
      if (char === '"') {
        let lookaheadIndex = scanIndex + 1;
        while (lookaheadIndex < text.length && /\s/.test(text[lookaheadIndex])) {
          lookaheadIndex += 1;
        }
        const nextChar = text[lookaheadIndex];
        if (nextChar === "," || nextChar === "}" || nextChar === "]") {
          result += '"';
          scanIndex += 1;
          break;
        }
        result += '\\"';
        repairCount += 1;
        scanIndex += 1;
        continue;
      }
      result += char;
      scanIndex += 1;
    }

    cursor = scanIndex;
  }

  return {
    text: result,
    repairCount,
  };
}

function looksLikeShopifyProductObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Boolean(
    String(value?.title || "").trim() ||
      String(value?.handle || "").trim() ||
      Array.isArray(value?.variants) ||
      String(value?.body_html || "").trim()
  );
}

function buildJsonParseErrorContext(text, error) {
  const message = String(error?.message || error || "Unknown JSON parse error");
  const positionMatch = message.match(/position\s+(\d+)/i);
  if (positionMatch) {
    const position = Number(positionMatch[1]);
    if (Number.isFinite(position)) {
      const start = Math.max(0, position - 60);
      const end = Math.min(text.length, position + 60);
      return text
        .slice(start, end)
        .replace(/\s+/g, " ")
        .trim();
    }
  }
  return String(text || "")
    .slice(0, 120)
    .replace(/\s+/g, " ")
    .trim();
}

function tryParseJsonText(text) {
  try {
    return {
      ok: true,
      parsedJson: JSON.parse(text),
      errorMessage: "",
    };
  } catch (error) {
    const context = buildJsonParseErrorContext(text, error);
    return {
      ok: false,
      parsedJson: null,
      errorMessage: `${String(
        error?.message || error || "Unknown JSON parse error"
      )}${context ? ` Near: ${context}` : ""}`,
    };
  }
}

export function normalizeFraterworksJsonPastePayload(jsonText) {
  const fatalErrors = [];
  const warnings = [];
  const repairMessages = [];
  const rawText = String(jsonText || "");
  const trimmedText = rawText.trim();
  let repairCount = 0;
  let strictParsePassed = false;
  let normalizationApplied = false;

  if (!trimmedText) {
    fatalErrors.push("Paste Fraterworks JSON before importing.");
    return {
      ok: false,
      readyToImport: false,
      fatalErrors,
      warnings,
      repairMessages,
      repairCount,
      strictParsePassed,
      normalizationApplied,
      normalizedText: "",
      parsedJson: null,
      productsDetected: 0,
      previewRows: [],
    };
  }

  const strictAttempt = tryParseJsonText(trimmedText);
  let parsedJson = strictAttempt.parsedJson;
  let workingText = trimmedText;

  if (strictAttempt.ok) {
    strictParsePassed = true;
  } else {
    const punctuationResult = normalizeSmartJsonPunctuation(workingText);
    if (punctuationResult.replacements > 0) {
      workingText = punctuationResult.text;
      repairCount += punctuationResult.replacements;
      normalizationApplied = true;
      repairMessages.push(
        `Normalized ${punctuationResult.replacements} smart quote or whitespace character${
          punctuationResult.replacements === 1 ? "" : "s"
        }.`
      );
    }

    const wrapperResult = stripLikelyJsonWrapperJunk(workingText);
    if (wrapperResult.changed) {
      workingText = wrapperResult.text;
      repairCount += 1;
      normalizationApplied = true;
      repairMessages.push(...wrapperResult.wrapperNotes);
    }

    const htmlRepairResult = repairHtmlFieldQuotes(workingText, "body_html");
    if (htmlRepairResult.repairCount > 0) {
      workingText = htmlRepairResult.text;
      repairCount += htmlRepairResult.repairCount;
      normalizationApplied = true;
      repairMessages.push(
        `Escaped ${htmlRepairResult.repairCount} unescaped quote${
          htmlRepairResult.repairCount === 1 ? "" : "s"
        } inside body_html.`
      );
    }

    const trailingCommaResult = removeTrailingCommasOutsideStrings(workingText);
    if (trailingCommaResult.removedCount > 0) {
      workingText = trailingCommaResult.text;
      repairCount += trailingCommaResult.removedCount;
      normalizationApplied = true;
      repairMessages.push(
        `Removed ${trailingCommaResult.removedCount} trailing comma${
          trailingCommaResult.removedCount === 1 ? "" : "s"
        }.`
      );
    }

    const normalizedAttempt = tryParseJsonText(workingText);
    if (!normalizedAttempt.ok) {
      fatalErrors.push(`Invalid JSON after normalization: ${normalizedAttempt.errorMessage}`);
      return {
        ok: false,
        readyToImport: false,
        fatalErrors,
        warnings,
        repairMessages,
        repairCount,
        strictParsePassed,
        normalizationApplied,
        normalizedText: workingText,
        parsedJson: null,
        productsDetected: 0,
        previewRows: [],
      };
    }

    parsedJson = normalizedAttempt.parsedJson;
  }

  if (!parsedJson || typeof parsedJson !== "object") {
    fatalErrors.push(
      'The pasted payload parsed, but it did not resolve to a usable JSON object.'
    );
    return {
      ok: false,
      readyToImport: false,
      fatalErrors,
      warnings,
      repairMessages,
      repairCount,
      strictParsePassed,
      normalizationApplied,
      normalizedText: workingText,
      parsedJson: null,
      productsDetected: 0,
      previewRows: [],
    };
  }

  if (!Array.isArray(parsedJson?.products)) {
    if (looksLikeShopifyProductObject(parsedJson)) {
      parsedJson = { products: [parsedJson] };
      repairCount += 1;
      normalizationApplied = true;
      repairMessages.push(
        'Wrapped a single product object into {"products":[...]} for import.'
      );
    } else {
      fatalErrors.push(
        'Missing top-level "products" array after normalization.'
      );
      return {
        ok: false,
        readyToImport: false,
        fatalErrors,
        warnings,
        repairMessages,
        repairCount,
        strictParsePassed,
        normalizationApplied,
        normalizedText: workingText,
        parsedJson: null,
        productsDetected: 0,
        previewRows: [],
      };
    }
  }

  const products = Array.isArray(parsedJson.products) ? parsedJson.products : [];
  if (!products.length) {
    warnings.push(
      buildRowWarning({
        sheetName: FRATERWORKS_JSON_WARNING_SHEET,
        rowNumber: null,
        severity: "warning",
        message: 'The payload normalized correctly, but "products" is empty.',
      })
    );
  }

  return {
    ok: fatalErrors.length === 0,
    readyToImport: fatalErrors.length === 0 && products.length > 0,
    fatalErrors,
    warnings,
    repairMessages,
    repairCount,
    strictParsePassed,
    normalizationApplied,
    normalizedText: JSON.stringify(parsedJson, null, 2),
    parsedJson,
    productsDetected: products.length,
    previewRows: buildJsonPreviewRows(products),
  };
}

function buildFraterworksStableProductKey(product) {
  if (product?.id != null && String(product.id).trim()) {
    return `id:${String(product.id).trim()}`;
  }
  const handle = String(product?.handle || "").trim().toLowerCase();
  return handle ? `handle:${handle}` : null;
}

async function readResponseText(response) {
  if (typeof response?.text === "function") {
    return response.text();
  }
  if (typeof response?.json === "function") {
    const jsonValue = await response.json();
    return JSON.stringify(jsonValue);
  }
  return "";
}

export async function fetchFraterworksPaginatedCatalog({
  fetchImpl = null,
  baseUrl = FRATERWORKS_PRODUCTS_JSON_URL,
  limit = FRATERWORKS_PRODUCTS_JSON_PAGE_LIMIT,
  maxPages = FRATERWORKS_PRODUCTS_JSON_MAX_PAGES,
  onPageFetched = null,
} = {}) {
  const fatalErrors = [];
  const warnings = [];
  const mergedProducts = [];
  const pageResults = [];
  const seenKeys = new Set();
  let totalProductsFetched = 0;
  let duplicateProductsSkipped = 0;
  let stopReason = "completed";

  const safeLimit =
    Number.isInteger(limit) && limit > 0
      ? limit
      : FRATERWORKS_PRODUCTS_JSON_PAGE_LIMIT;
  const safeMaxPages =
    Number.isInteger(maxPages) && maxPages > 0
      ? maxPages
      : FRATERWORKS_PRODUCTS_JSON_MAX_PAGES;
  const safeFetch =
    typeof fetchImpl === "function"
      ? fetchImpl
      : typeof globalThis.fetch === "function"
      ? globalThis.fetch.bind(globalThis)
      : null;

  if (!safeFetch) {
    fatalErrors.push(
      "Fraterworks full-catalog sync is unavailable because no fetch implementation is available."
    );
  }

  if (!String(baseUrl || "").trim()) {
    fatalErrors.push("Fraterworks full-catalog sync requires a products.json URL.");
  }

  if (fatalErrors.length > 0) {
    return {
      fatalErrors,
      warnings,
      mergedProducts,
      mergedPayloadText: JSON.stringify({ products: mergedProducts }, null, 2),
      pageResults,
      summary: {
        pagesFetched: 0,
        pagesWithProducts: 0,
        totalProductsFetched,
        uniqueProductsMerged: 0,
        duplicateProductsSkipped,
        pageLimit: safeLimit,
        maxPages: safeMaxPages,
        baseUrl: String(baseUrl || ""),
        stopReason: "invalid_setup",
      },
    };
  }

  for (let page = 1; page <= safeMaxPages; page += 1) {
    const url = new URL(baseUrl);
    url.searchParams.set("limit", String(safeLimit));
    url.searchParams.set("page", String(page));
    const pageUrl = url.toString();

    let response;
    try {
      response = await safeFetch(pageUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });
    } catch (error) {
      fatalErrors.push(
        `Fraterworks catalog request failed on page ${page}: ${String(
          error?.message || error || "Unknown error"
        )}`
      );
      stopReason = "request_failed";
      break;
    }

    if (!response?.ok) {
      fatalErrors.push(
        `Fraterworks catalog request failed on page ${page}: HTTP ${
          response?.status || "unknown"
        }.`
      );
      stopReason = "request_failed";
      break;
    }

    let responseText = "";
    try {
      responseText = await readResponseText(response);
    } catch (error) {
      fatalErrors.push(
        `Fraterworks catalog page ${page} could not be read: ${String(
          error?.message || error || "Unknown error"
        )}`
      );
      stopReason = "response_read_failed";
      break;
    }

    const normalizedPage = normalizeFraterworksJsonPastePayload(responseText);
    warnings.push(
      ...(normalizedPage.warnings || []).map((warning) => ({
        ...warning,
        message: `Page ${page}: ${warning.message}`,
      }))
    );

    if (!normalizedPage.ok) {
      fatalErrors.push(
        `Fraterworks catalog page ${page} could not be parsed: ${
          normalizedPage.fatalErrors?.[0] || "Unknown parse error"
        }`
      );
      stopReason = "parse_failed";
      break;
    }

    const pageProducts = Array.isArray(normalizedPage.parsedJson?.products)
      ? normalizedPage.parsedJson.products
      : [];
    totalProductsFetched += pageProducts.length;
    pageResults.push({
      pageNumber: page,
      url: pageUrl,
      productCount: pageProducts.length,
    });

    if (typeof onPageFetched === "function") {
      onPageFetched({
        pageNumber: page,
        url: pageUrl,
        productCount: pageProducts.length,
        totalProductsFetched,
      });
    }

    pageProducts.forEach((product, index) => {
      const dedupeKey = buildFraterworksStableProductKey(product);
      if (!dedupeKey) {
        warnings.push(
          buildRowWarning({
            sheetName: FRATERWORKS_JSON_WARNING_SHEET,
            rowNumber: index + 2,
            severity: "warning",
            message: `Page ${page}: skipped a product because neither product.id nor handle was available for stable deduplication.`,
          })
        );
        return;
      }
      if (seenKeys.has(dedupeKey)) {
        duplicateProductsSkipped += 1;
        warnings.push(
          buildRowWarning({
            sheetName: FRATERWORKS_JSON_WARNING_SHEET,
            rowNumber: index + 2,
            severity: "warning",
            message: `Page ${page}: skipped duplicate Fraterworks product "${
              String(product?.title || product?.handle || dedupeKey).trim() ||
              dedupeKey
            }" after deduplicating by ${dedupeKey.startsWith("id:") ? "product.id" : "handle"}.`,
          })
        );
        return;
      }
      seenKeys.add(dedupeKey);
      mergedProducts.push(product);
    });

    if (pageProducts.length === 0) {
      stopReason = "empty_page";
      break;
    }
    if (pageProducts.length < safeLimit) {
      stopReason = "short_page";
      break;
    }
    if (page === safeMaxPages) {
      stopReason = "max_pages_reached";
      warnings.push(
        buildRowWarning({
          sheetName: FRATERWORKS_JSON_WARNING_SHEET,
          rowNumber: null,
          severity: "warning",
          message: `Fraterworks full-catalog sync stopped after ${safeMaxPages} pages to avoid an endless pagination loop.`,
        })
      );
    }
  }

  if (!fatalErrors.length && mergedProducts.length === 0) {
    fatalErrors.push(
      "Fraterworks full-catalog sync finished without any usable products."
    );
  }

  return {
    fatalErrors,
    warnings,
    mergedProducts,
    mergedPayloadText: JSON.stringify({ products: mergedProducts }, null, 2),
    pageResults,
    summary: {
      pagesFetched: pageResults.length,
      pagesWithProducts: pageResults.filter((page) => page.productCount > 0).length,
      totalProductsFetched,
      uniqueProductsMerged: mergedProducts.length,
      duplicateProductsSkipped,
      pageLimit: safeLimit,
      maxPages: safeMaxPages,
      baseUrl: String(baseUrl || ""),
      stopReason,
    },
  };
}

function buildFraterworksJsonParsedWorkbook(
  jsonText,
  {
    db = {},
    supplierLayerRecords = [],
    supplierProductRegistry = {},
    buildSupplierProductKey = null,
    createLocalDrafts = false,
  } = {}
) {
  const fatalErrors = [];
  const warnings = [];
  const parsedWorkbook = {
    fatalErrors,
    warnings,
    workbookMetadata: {
      sheetNames: TRUSTED_SUPPLIER_IMPORT_SHEET_NAMES,
      rowCounts: {},
    },
    rowsBySheet: {
      [SUPPLIER_PRODUCT_SHEET]: [],
      [SUPPLIER_PRICE_SHEET]: [],
      [MATERIAL_MAPPING_SHEET]: [],
    },
  };
  const extraPageFactsByKey = {};
  const normalizationResult = normalizeFraterworksJsonPastePayload(jsonText);

  if (!normalizationResult.ok) {
    fatalErrors.push(...(normalizationResult.fatalErrors || []));
    warnings.push(...(normalizationResult.warnings || []));
    return {
      fatalErrors,
      warnings,
      parsedWorkbook,
      extraPageFactsByKey,
      productsParsed: normalizationResult.productsDetected || 0,
      normalizationResult,
    };
  }

  warnings.push(...(normalizationResult.warnings || []));
  const parsedJson = normalizationResult.parsedJson;
  const products = Array.isArray(parsedJson?.products) ? parsedJson.products : [];

  const registryProductMap = getSupplierRegistryProductMap(supplierProductRegistry);
  const existingSupplierLayerByKey = new Map(
    (Array.isArray(supplierLayerRecords) ? supplierLayerRecords : [])
      .filter((record) => record?.supplierProductKey)
      .map((record) => [record.supplierProductKey, record])
  );
  const seenKeys = new Set();
  let priceRowNumber = 2;
  let usableProductCount = 0;

  products.forEach((product, productIndex) => {
    const rowNumber = productIndex + 2;
    if (!product || typeof product !== "object" || Array.isArray(product)) {
      warnings.push(
        buildRowWarning({
          sheetName: FRATERWORKS_JSON_WARNING_SHEET,
          rowNumber,
          severity: "warning",
          message: "Skipped a product entry because it was not a usable object.",
        })
      );
      return;
    }

    const title = String(product?.title || "").trim();
    const handle = String(product?.handle || "").trim();
    if (!title || !handle) {
      warnings.push(
        buildRowWarning({
          sheetName: FRATERWORKS_JSON_WARNING_SHEET,
          rowNumber,
          severity: "warning",
          message:
            "Skipped a product because title or handle was missing, so no stable Fraterworks product URL/key could be derived.",
        })
      );
      return;
    }

    const productUrl = normalizeUrl(`https://fraterworks.com/products/${handle}`);
    const supplierProductKey =
      (typeof buildSupplierProductKey === "function"
        ? buildSupplierProductKey({
            supplierKey: "fraterworks",
            supplierName: "Fraterworks",
            url: productUrl,
          })
        : null) || `fraterworks:${slugify(handle)}`;

    if (seenKeys.has(supplierProductKey)) {
      warnings.push(
        buildRowWarning({
          sheetName: FRATERWORKS_JSON_WARNING_SHEET,
          rowNumber,
          supplierProductKey,
          severity: "warning",
          message:
            "Duplicate Fraterworks product handle/key detected in the pasted JSON. The first row was kept and the later duplicate was skipped.",
        })
      );
      return;
    }
    seenKeys.add(supplierProductKey);
    usableProductCount += 1;

    const cleanedDescription = cleanShopifyHtmlToText(product?.body_html);
    const scentSummary = deriveScentSummaryFromDescription(cleanedDescription);
    const tags = normalizeTagList(product?.tags);
    const tagsSummary = tags.join(", ");
    const materialType = deriveFraterworksMaterialType(product?.product_type, tags);
    const noteRole = deriveFraterworksNoteRole(product?.product_type, tags);
    const complianceFields = extractFraterworksComplianceFields(
      product?.body_html,
      productUrl
    );
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    const variantFacts = [];
    const variantDilutions = new Set();
    const casCandidates = new Set();
    let anyVariantAvailable = false;
    let validVariantCount = 0;

    variants.forEach((variant, variantIndex) => {
      if (!variant || typeof variant !== "object") {
        warnings.push(
          buildRowWarning({
            sheetName: FRATERWORKS_JSON_WARNING_SHEET,
            rowNumber,
            supplierProductKey,
            severity: "warning",
            message: `Variant ${variantIndex + 1} was skipped because it was not a usable object.`,
          })
        );
        return;
      }

      const parsedSize = parseFraterworksVariantSize(variant);
      if (!parsedSize) {
        warnings.push(
          buildRowWarning({
            sheetName: FRATERWORKS_JSON_WARNING_SHEET,
            rowNumber,
            supplierProductKey,
            severity: "warning",
            message: `Variant "${
              String(variant?.title || variant?.option1 || `#${variantIndex + 1}`).trim()
            }" was skipped because size could not be parsed from the variant title/options.`,
          })
        );
        return;
      }

      const priceValue = parseNumberValue(variant?.price);
      if (!Number.isFinite(priceValue)) {
        warnings.push(
          buildRowWarning({
            sheetName: FRATERWORKS_JSON_WARNING_SHEET,
            rowNumber,
            supplierProductKey,
            severity: "warning",
            message: `Variant "${
              String(variant?.title || parsedSize.sizeValue).trim()
            }" was skipped because price was missing or malformed.`,
          })
        );
        return;
      }

      const dilutionNote = parseFraterworksVariantDilution(variant);
      const { casCandidate, looksCasLike } = extractCasLikePrefixFromSku(
        variant?.sku
      );
      if (looksCasLike && !casCandidate) {
        warnings.push(
          buildRowWarning({
            sheetName: FRATERWORKS_JSON_WARNING_SHEET,
            rowNumber,
            supplierProductKey,
            severity: "warning",
            message: `Variant SKU "${
              String(variant?.sku || "").trim()
            }" looks CAS-like but no clean CAS prefix could be extracted safely.`,
          })
        );
      }
      if (casCandidate) casCandidates.add(casCandidate);
      if (dilutionNote) variantDilutions.add(dilutionNote);
      if (Boolean(variant?.available)) anyVariantAvailable = true;

      parsedWorkbook.rowsBySheet[SUPPLIER_PRICE_SHEET].push({
        rowNumber: priceRowNumber,
        sheetName: SUPPLIER_PRICE_SHEET,
        supplier_product_key: supplierProductKey,
        supplier_name: "Fraterworks",
        supplier_product_name: title,
        supplier_product_url: productUrl,
        supplier_sku: String(variant?.sku || "").trim(),
        size_value: parsedSize.sizeValue,
        size_unit: parsedSize.sizeUnit,
        price_usd: priceValue,
        dilution_note: dilutionNote || "",
      });
      priceRowNumber += 1;
      validVariantCount += 1;

      variantFacts.push({
        variantId: variant?.id || null,
        title: String(variant?.title || "").trim() || null,
        sku: String(variant?.sku || "").trim() || null,
        sizeValue: parsedSize.sizeValue,
        sizeUnit: parsedSize.sizeUnit,
        priceValue,
        available: Boolean(variant?.available),
        availabilityLabel: variant?.available ? "In stock" : "Sold out",
        dilutionNote: dilutionNote || null,
        casCandidate,
      });
    });

    if (!variants.length) {
      warnings.push(
        buildRowWarning({
          sheetName: FRATERWORKS_JSON_WARNING_SHEET,
          rowNumber,
          supplierProductKey,
          severity: "warning",
          message:
            "This product had no variants, so supplier facts were captured without any size/price rows.",
        })
      );
    } else if (validVariantCount === 0) {
      warnings.push(
        buildRowWarning({
          sheetName: FRATERWORKS_JSON_WARNING_SHEET,
          rowNumber,
          supplierProductKey,
          severity: "warning",
          message:
            "This product imported without any valid size/price rows because every variant was malformed or missing a usable price/size.",
        })
      );
    }

    const skuCasSupport = parseMaterialCasSupport(Array.from(casCandidates));
    const productCasSupport =
      complianceFields.casSupport.hasStructuredCas ||
      complianceFields.casSupport.isMixture
        ? complianceFields.casSupport
        : skuCasSupport;

    if (casCandidates.size > 1) {
      warnings.push(
        buildRowWarning({
          sheetName: FRATERWORKS_JSON_WARNING_SHEET,
          rowNumber,
          supplierProductKey,
          severity: "warning",
          message:
            "Multiple different CAS-like SKU prefixes were detected across variants, so product-level CAS support was stored as a multi-CAS supplier-layer value instead of a single CAS.",
        })
      );
    }

    if (variantDilutions.size > 1) {
      warnings.push(
        buildRowWarning({
          sheetName: FRATERWORKS_JSON_WARNING_SHEET,
          rowNumber,
          supplierProductKey,
          severity: "warning",
          message:
            "Variants carry different dilution/concentration labels, so the product-level dilution/carrier field was left blank and the truth stays variant-level.",
        })
      );
    }

    const registryRecord = registryProductMap?.[supplierProductKey] || null;
    const existingSupplierLayerRecord =
      existingSupplierLayerByKey.get(supplierProductKey) || null;
    const existingMappedCatalogName =
      existingSupplierLayerRecord?.mappedCatalogName ||
      registryRecord?.mappedCatalogName ||
      null;
    const exactCatalogName = findExactCatalogNameByTitle(title, db);
    let mappingAction = "";
    let mappedMaterialName = "";
    let localDraftMaterialName = "";
    let reviewNote =
      "Imported from pasted Fraterworks JSON as a supplier-first new-item candidate.";

    if (existingMappedCatalogName && db?.[existingMappedCatalogName]) {
      mappingAction = "existing_material";
      mappedMaterialName = existingMappedCatalogName;
      reviewNote = "Existing Fraterworks mapping reused from the current app runtime.";
    } else if (exactCatalogName) {
      mappingAction = "existing_material";
      mappedMaterialName = exactCatalogName;
      reviewNote = "Exact catalog-name match reused for this Fraterworks JSON import.";
    } else if (createLocalDrafts) {
      mappingAction = "create_local_draft";
      localDraftMaterialName = title;
      reviewNote =
        "No live mapped material was found, so this pasted Fraterworks product can create a local draft for immediate use.";
    }

    parsedWorkbook.rowsBySheet[SUPPLIER_PRODUCT_SHEET].push({
      rowNumber,
      sheetName: SUPPLIER_PRODUCT_SHEET,
      supplier_product_key: supplierProductKey,
      supplier_name: "Fraterworks",
      supplier_product_name: title,
      supplier_product_url: productUrl,
      availability: anyVariantAvailable ? "In stock" : variants.length ? "Sold out" : "Unknown",
      product_description: cleanedDescription,
      scent_summary: scentSummary,
      note_role: noteRole,
      material_type: materialType,
      dilution_or_carrier:
        variantDilutions.size === 1 ? Array.from(variantDilutions)[0] : "",
      ifra_percent_shown: complianceFields.ifraPercent ?? "",
      sds_url: complianceFields.sdsUrl || "",
      inci_shown: complianceFields.inci || "",
      cas_shown: productCasSupport.displayValue || "",
      technical_notes: buildNotesWarningsSummary([
        String(product?.vendor || "").trim()
          ? `Vendor: ${String(product.vendor).trim()}`
          : null,
        String(product?.product_type || "").trim()
          ? `Product type: ${String(product.product_type).trim()}`
          : null,
        tagsSummary ? `Tags: ${tagsSummary}` : null,
        getShopifyImageUrl(product) ? `Image: ${getShopifyImageUrl(product)}` : null,
      ]),
      create_local_draft:
        mappingAction === "create_local_draft" ? "yes" : "",
      local_draft_material_name:
        mappingAction === "create_local_draft" ? title : "",
      source_trust: FRATERWORKS_JSON_SOURCE_LABEL,
      manual_trusted_context: buildNotesWarningsSummary([
        product?.id != null ? `Shopify product id ${product.id}` : null,
        handle ? `handle ${handle}` : null,
        "Pasted Shopify-style Fraterworks JSON",
      ]),
    });

    parsedWorkbook.rowsBySheet[MATERIAL_MAPPING_SHEET].push({
      rowNumber,
      sheetName: MATERIAL_MAPPING_SHEET,
      supplier_product_key: supplierProductKey,
      supplier_name: "Fraterworks",
      supplier_product_name: title,
      supplier_product_url: productUrl,
      mapping_action: mappingAction,
      mapped_material_name: mappedMaterialName,
      local_draft_material_name: localDraftMaterialName,
      review_note: reviewNote,
    });

    extraPageFactsByKey[supplierProductKey] = {
      imageUrl: getShopifyImageUrl(product),
      tagsSummary,
      vendorContext: String(product?.vendor || "").trim() || null,
      vendorName: String(product?.vendor || "").trim() || null,
      productType: String(product?.product_type || "").trim() || null,
      shopifyProductId: product?.id ?? null,
      shopifyHandle: handle,
      variantFacts,
      ifraPercent: complianceFields.ifraPercent,
      sdsUrl: complianceFields.sdsUrl,
      inci: complianceFields.inci,
      casShown: productCasSupport.displayValue || null,
      casState: productCasSupport.state,
      casValues: productCasSupport.values,
      optionNames: Array.isArray(product?.options)
        ? product.options
            .map((option) => String(option?.name || option || "").trim())
            .filter(Boolean)
        : [],
    };
  });

  if (!usableProductCount || !parsedWorkbook.rowsBySheet[SUPPLIER_PRODUCT_SHEET].length) {
    fatalErrors.push(
      "No usable Fraterworks products were found in the pasted JSON."
    );
  }

  parsedWorkbook.workbookMetadata.rowCounts = Object.fromEntries(
    Object.entries(parsedWorkbook.rowsBySheet).map(([sheetName, rows]) => [
      sheetName,
      Array.isArray(rows) ? rows.length : 0,
    ])
  );

  return {
    fatalErrors,
    warnings,
    parsedWorkbook,
    extraPageFactsByKey,
    productsParsed: products.length,
    normalizationResult,
  };
}

export function buildFraterworksJsonPasteImportPlan(
  jsonText,
  {
    db = {},
    supplierLayerRecords = [],
    localDraftIngredients = {},
    supplierProductRegistry = {},
    buildSupplierProductKey = null,
    getIfraMaterialRecord = () => null,
    importedAt = new Date().toISOString(),
    createLocalDrafts = false,
  } = {}
) {
  const parsedJsonImport = buildFraterworksJsonParsedWorkbook(jsonText, {
    db,
    supplierLayerRecords,
    supplierProductRegistry,
    buildSupplierProductKey,
    createLocalDrafts,
  });
  const baseReport = {
    metadata: {
      version: 1,
      source: "fraterworks_json_paste_import",
      sourceLabel: FRATERWORKS_JSON_SOURCE_LABEL,
      importedAt,
      inputKind: "shopify_products_json",
      strictParsePassed:
        parsedJsonImport.normalizationResult?.strictParsePassed || false,
      normalizationApplied:
        parsedJsonImport.normalizationResult?.normalizationApplied || false,
    },
    summary: {
      productsParsed: parsedJsonImport.productsParsed || 0,
      supplierProductsImported: 0,
      productsImported: 0,
      priceRowsImported: 0,
      priceRowsCreated: 0,
      localDraftMaterialsCreated: 0,
      localDraftsCreated: 0,
      mappingsResolved: 0,
      mappedItems: 0,
      itemsSentToReview: 0,
      rowsSkippedWithWarnings: parsedJsonImport.warnings.length,
      repairedIssuesCount:
        parsedJsonImport.normalizationResult?.repairCount || 0,
    },
    fatalErrors: parsedJsonImport.fatalErrors,
    warnings: parsedJsonImport.warnings,
    resultRows: [],
  };

  if (parsedJsonImport.fatalErrors.length > 0) {
    return {
      fatalErrors: parsedJsonImport.fatalErrors,
      warnings: parsedJsonImport.warnings,
      report: baseReport,
      supplierLayerRecordMap: {},
      localDraftRecordsByName: {},
      pricePatches: [],
    };
  }

  const importPlan = buildTrustedSupplierWorkbookImportPlan(
    parsedJsonImport.parsedWorkbook,
    {
      db,
      supplierLayerRecords,
      localDraftIngredients,
      supplierProductRegistry,
      buildSupplierProductKey,
      getIfraMaterialRecord,
      importedAt,
    }
  );

  Object.values(importPlan.supplierLayerRecordMap || {}).forEach((record) => {
    const extraPageFacts =
      parsedJsonImport.extraPageFactsByKey?.[record?.supplierProductKey] || {};
    record.sourceOrigin = "fraterworks_json_paste_import";
    record.sourceNote = buildNotesWarningsSummary([
      record.sourceNote,
      FRATERWORKS_JSON_SOURCE_LABEL,
    ]);
    record.pageFacts = {
      ...(record.pageFacts || {}),
      imageUrl: extraPageFacts.imageUrl || null,
      tagsSummary: extraPageFacts.tagsSummary || null,
      vendorContext: extraPageFacts.vendorContext || null,
      vendorName: extraPageFacts.vendorName || record.pageFacts?.vendorName || null,
      productType: extraPageFacts.productType || null,
      shopifyProductId: extraPageFacts.shopifyProductId ?? null,
      shopifyHandle: extraPageFacts.shopifyHandle || null,
      ifraPercent:
        extraPageFacts.ifraPercent != null
          ? extraPageFacts.ifraPercent
          : record.pageFacts?.ifraPercent ?? null,
      sdsUrl: extraPageFacts.sdsUrl || record.pageFacts?.sdsUrl || null,
      inci: extraPageFacts.inci || record.pageFacts?.inci || null,
      casShown: extraPageFacts.casShown || record.pageFacts?.casShown || null,
      casState: extraPageFacts.casState || record.pageFacts?.casState || "unknown",
      casValues: extraPageFacts.casValues || record.pageFacts?.casValues || [],
      optionNames: extraPageFacts.optionNames || [],
      variantFacts: extraPageFacts.variantFacts || [],
      importedFromFraterworksJsonPaste: true,
    };
    record.notes = Array.from(
      new Set(
        [
          "Imported from pasted Fraterworks Shopify-style JSON.",
          ...(Array.isArray(record.notes) ? record.notes : []),
        ].filter(Boolean)
      )
    );
    record.reviewItems = (Array.isArray(record.reviewItems) ? record.reviewItems : []).map(
      (reviewItem) => ({
        ...reviewItem,
        sourceOrigin: "fraterworks_json_paste_import",
        sourceSystemLabel: FRATERWORKS_JSON_SOURCE_LABEL,
        sourceSummary:
          "Conflict or mapping review staged from pasted Fraterworks JSON.",
        evidenceCandidateKeyPrefix: "fraterworks_json_import_conflict",
      })
    );
  });

  importPlan.pricePatches = (Array.isArray(importPlan.pricePatches)
    ? importPlan.pricePatches
    : []
  ).map((patch) => ({
    ...patch,
    sourceType: "fraterworks_json_paste_import",
  }));

  const summary = {
    ...(importPlan.report?.summary || {}),
    productsParsed: parsedJsonImport.productsParsed || 0,
    productsImported: importPlan.report?.summary?.supplierProductsImported || 0,
    priceRowsCreated: importPlan.report?.summary?.priceRowsImported || 0,
    mappedItems: importPlan.report?.summary?.mappingsResolved || 0,
    localDraftsCreated:
      importPlan.report?.summary?.localDraftMaterialsCreated || 0,
    repairedIssuesCount:
      parsedJsonImport.normalizationResult?.repairCount || 0,
  };
  importPlan.report = {
    ...importPlan.report,
    metadata: {
      ...(importPlan.report?.metadata || {}),
      source: "fraterworks_json_paste_import",
      sourceLabel: FRATERWORKS_JSON_SOURCE_LABEL,
      importedAt,
      inputKind: "shopify_products_json",
      strictParsePassed:
        parsedJsonImport.normalizationResult?.strictParsePassed || false,
      normalizationApplied:
        parsedJsonImport.normalizationResult?.normalizationApplied || false,
      repairMessages:
        parsedJsonImport.normalizationResult?.repairMessages || [],
      workbookSheetNames:
        parsedJsonImport.parsedWorkbook?.workbookMetadata?.sheetNames || [],
      workbookRowCounts:
        parsedJsonImport.parsedWorkbook?.workbookMetadata?.rowCounts || {},
    },
    summary,
  };

  return importPlan;
}

export async function buildFraterworksFullCatalogSyncPlan({
  fetchImpl = null,
  db = {},
  supplierLayerRecords = [],
  localDraftIngredients = {},
  supplierProductRegistry = {},
  buildSupplierProductKey = null,
  getIfraMaterialRecord = () => null,
  importedAt = new Date().toISOString(),
  createLocalDrafts = false,
  baseUrl = FRATERWORKS_PRODUCTS_JSON_URL,
  limit = FRATERWORKS_PRODUCTS_JSON_PAGE_LIMIT,
  maxPages = FRATERWORKS_PRODUCTS_JSON_MAX_PAGES,
  onPageFetched = null,
} = {}) {
  const fetchResult = await fetchFraterworksPaginatedCatalog({
    fetchImpl,
    baseUrl,
    limit,
    maxPages,
    onPageFetched,
  });

  const baseReport = {
    metadata: {
      version: 1,
      source: "fraterworks_full_catalog_sync",
      sourceLabel: FRATERWORKS_FULL_SYNC_SOURCE_LABEL,
      importedAt,
      inputKind: "shopify_products_json_paginated_sync",
      syncBaseUrl: fetchResult.summary.baseUrl,
      pageLimit: fetchResult.summary.pageLimit,
      maxPages: fetchResult.summary.maxPages,
      pageResults: fetchResult.pageResults,
      stopReason: fetchResult.summary.stopReason,
      createLocalDrafts,
    },
    summary: {
      pagesFetched: fetchResult.summary.pagesFetched,
      totalProductsFetched: fetchResult.summary.totalProductsFetched,
      uniqueProductsMerged: fetchResult.summary.uniqueProductsMerged,
      duplicateProductsSkipped: fetchResult.summary.duplicateProductsSkipped,
      productsImported: 0,
      supplierProductsImported: 0,
      existingSupplierProductsRefreshed: 0,
      newSupplierProductsCreated: 0,
      priceRowsCreated: 0,
      priceRowsImported: 0,
      localDraftsCreated: 0,
      localDraftMaterialsCreated: 0,
      mappedItems: 0,
      mappingsResolved: 0,
      itemsSentToReview: 0,
      rowsSkippedWithWarnings: fetchResult.warnings.length,
    },
    fatalErrors: fetchResult.fatalErrors,
    warnings: fetchResult.warnings,
    resultRows: [],
  };

  if (fetchResult.fatalErrors.length > 0) {
    return {
      fatalErrors: fetchResult.fatalErrors,
      warnings: fetchResult.warnings,
      report: baseReport,
      supplierLayerRecordMap: {},
      localDraftRecordsByName: {},
      pricePatches: [],
    };
  }

  const existingSupplierKeys = new Set([
    ...Object.keys(getSupplierRegistryProductMap(supplierProductRegistry)).filter(
      (key) => key !== "metadata"
    ),
    ...(Array.isArray(supplierLayerRecords)
      ? supplierLayerRecords
          .map((record) => String(record?.supplierProductKey || "").trim())
          .filter(Boolean)
      : []),
  ]);

  const importPlan = buildFraterworksJsonPasteImportPlan(
    fetchResult.mergedPayloadText,
    {
      db,
      supplierLayerRecords,
      localDraftIngredients,
      supplierProductRegistry,
      buildSupplierProductKey,
      getIfraMaterialRecord,
      importedAt,
      createLocalDrafts,
    }
  );

  const combinedWarnings = [
    ...(fetchResult.warnings || []),
    ...(importPlan.warnings || []),
  ];
  const resultRows = Array.isArray(importPlan.report?.resultRows)
    ? importPlan.report.resultRows
    : [];
  const existingSupplierProductsRefreshed = resultRows.filter((row) =>
    existingSupplierKeys.has(row?.supplierProductKey)
  ).length;
  const newSupplierProductsCreated = resultRows.filter(
    (row) =>
      row?.supplierProductKey &&
      !existingSupplierKeys.has(row.supplierProductKey)
  ).length;

  Object.values(importPlan.supplierLayerRecordMap || {}).forEach((record) => {
    const cleanedSourceNoteParts = String(record?.sourceNote || "")
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean)
      .filter(
        (part) =>
          part !== FRATERWORKS_JSON_SOURCE_LABEL &&
          part !== "Pasted Shopify-style Fraterworks JSON"
      );
    record.sourceOrigin = "fraterworks_full_catalog_sync";
    record.sourceNote = buildNotesWarningsSummary([
      cleanedSourceNoteParts,
      "Paginated Fraterworks products.json sync",
      FRATERWORKS_FULL_SYNC_SOURCE_LABEL,
    ]);
    record.pageFacts = {
      ...(record.pageFacts || {}),
      importedFromFraterworksFullCatalogSync: true,
    };
    record.notes = Array.from(
      new Set(
        [
          "Imported from paginated Fraterworks full-catalog sync.",
          ...(Array.isArray(record.notes) ? record.notes : []).filter(
            (note) =>
              note !== "Imported from pasted Fraterworks Shopify-style JSON."
          ),
        ].filter(Boolean)
      )
    );
    record.reviewItems = (Array.isArray(record.reviewItems)
      ? record.reviewItems
      : []
    ).map((reviewItem) => ({
      ...reviewItem,
      sourceOrigin: "fraterworks_full_catalog_sync",
      sourceSystemLabel: FRATERWORKS_FULL_SYNC_SOURCE_LABEL,
      sourceSummary:
        "Conflict or mapping review staged from Fraterworks full-catalog sync.",
      evidenceCandidateKeyPrefix: "fraterworks_full_sync_conflict",
    }));
  });

  importPlan.pricePatches = (Array.isArray(importPlan.pricePatches)
    ? importPlan.pricePatches
    : []
  ).map((patch) => ({
    ...patch,
    sourceType: "fraterworks_full_catalog_sync",
  }));

  importPlan.warnings = combinedWarnings;
  importPlan.report = {
    ...importPlan.report,
    metadata: {
      ...(importPlan.report?.metadata || {}),
      source: "fraterworks_full_catalog_sync",
      sourceLabel: FRATERWORKS_FULL_SYNC_SOURCE_LABEL,
      importedAt,
      inputKind: "shopify_products_json_paginated_sync",
      syncBaseUrl: fetchResult.summary.baseUrl,
      pageLimit: fetchResult.summary.pageLimit,
      maxPages: fetchResult.summary.maxPages,
      pageResults: fetchResult.pageResults,
      stopReason: fetchResult.summary.stopReason,
      createLocalDrafts,
    },
    summary: {
      ...(importPlan.report?.summary || {}),
      pagesFetched: fetchResult.summary.pagesFetched,
      totalProductsFetched: fetchResult.summary.totalProductsFetched,
      uniqueProductsMerged: fetchResult.summary.uniqueProductsMerged,
      duplicateProductsSkipped: fetchResult.summary.duplicateProductsSkipped,
      productsImported:
        importPlan.report?.summary?.supplierProductsImported || 0,
      supplierProductsImported:
        importPlan.report?.summary?.supplierProductsImported || 0,
      existingSupplierProductsRefreshed,
      newSupplierProductsCreated,
      priceRowsCreated: importPlan.report?.summary?.priceRowsImported || 0,
      priceRowsImported: importPlan.report?.summary?.priceRowsImported || 0,
      localDraftsCreated:
        importPlan.report?.summary?.localDraftMaterialsCreated || 0,
      localDraftMaterialsCreated:
        importPlan.report?.summary?.localDraftMaterialsCreated || 0,
      mappedItems: importPlan.report?.summary?.mappingsResolved || 0,
      mappingsResolved: importPlan.report?.summary?.mappingsResolved || 0,
      rowsSkippedWithWarnings: combinedWarnings.length,
    },
    warnings: combinedWarnings,
    fatalErrors: importPlan.fatalErrors,
  };

  return importPlan;
}

export function buildFraterworksReferenceWorkbookExport(
  {
    db = {},
    pricing = {},
    pricesState = {},
    supplierLayerRecords = [],
    supplierProductRegistry = {},
    buildIngredientTruthReport = null,
    exportedAt = new Date().toISOString(),
  } = {}
) {
  const registryProductMap = getSupplierRegistryProductMap(supplierProductRegistry);
  const registryProductRecords = Object.entries(registryProductMap)
    .filter(([key, record]) => key !== "metadata" && record && typeof record === "object")
    .map(([supplierProductKey, record]) => ({
      supplierProductKey,
      ...record,
    }));
  const fraterworksRegistryRecords = registryProductRecords.filter(
    isFraterworksSupplierRecord
  );
  const supplierLayerFraterworksRecords = (Array.isArray(supplierLayerRecords)
    ? supplierLayerRecords
    : []
  ).filter(
    (record) =>
      record?.supplierProductKey &&
      isFraterworksSupplierRecord(record)
  );
  const supplierLayerByKey = new Map(
    supplierLayerFraterworksRecords.map((record) => [
      record.supplierProductKey,
      record,
    ])
  );
  const registryByKey = new Map(
    fraterworksRegistryRecords.map((record) => [record.supplierProductKey, record])
  );
  const allFraterworksKeys = Array.from(
    new Set([...registryByKey.keys(), ...supplierLayerByKey.keys()])
  ).sort((a, b) => a.localeCompare(b));
  const mergedLivePricing = buildMergedLivePricing(pricesState, pricing);

  const productRows = [];
  const priceRows = [];

  allFraterworksKeys.forEach((supplierProductKey) => {
    const registryRecord = registryByKey.get(supplierProductKey) || null;
    const supplierLayerRecord = supplierLayerByKey.get(supplierProductKey) || null;
    const supplierName =
      supplierLayerRecord?.supplierDisplayName ||
      registryRecord?.supplierDisplayName ||
      "Fraterworks";
    const mappedCatalogName =
      supplierLayerRecord?.mappedCatalogName || registryRecord?.mappedCatalogName || null;
    const mappedRecord = mappedCatalogName ? db?.[mappedCatalogName] || null : null;
    const livePricingEntry = mappedCatalogName
      ? findSupplierPricingEntry(mergedLivePricing?.[mappedCatalogName], supplierName)
      : null;
    const pricePoints = dedupePricePoints(
      supplierLayerRecord?.pageFacts?.pricePoints ||
        livePricingEntry?.S ||
        []
    );
    const truthReport =
      mappedCatalogName && typeof buildIngredientTruthReport === "function"
        ? buildIngredientTruthReport(mappedCatalogName, {
            record: mappedRecord,
            livePricing: mergedLivePricing?.[mappedCatalogName] || {},
          })
        : null;
    const productTitle =
      supplierLayerRecord?.pageFacts?.productTitle ||
      registryRecord?.productTitle ||
      supplierProductKey;
    const productUrl =
      supplierLayerRecord?.pageFacts?.url ||
      livePricingEntry?.url ||
      registryRecord?.url ||
      "";
    const availability =
      supplierLayerRecord?.pageFacts?.availabilityStatusLabel ||
      getAvailabilityLabel(supplierLayerRecord?.pageFacts?.availabilityStatus) ||
      getAvailabilityLabel(livePricingEntry?.availabilityStatus) ||
      "";
    const ifraPercent =
      supplierLayerRecord?.pageFacts?.ifraPercent ??
      livePricingEntry?.ifraPercent ??
      "";
    const sdsUrl =
      supplierLayerRecord?.pageFacts?.sdsUrl || livePricingEntry?.sdsUrl || "";
    const reviewItems = Array.isArray(supplierLayerRecord?.reviewItems)
      ? supplierLayerRecord.reviewItems
      : [];

    productRows.push({
      supplier_product_key: supplierProductKey,
      supplier_name: supplierName,
      current_supplier_product_name: productTitle,
      current_supplier_product_url: productUrl,
      current_material_name_if_mapped: mappedCatalogName || "",
      current_mapping_status: buildMappingStatusLabel({
        mappedCatalogName,
        mappedRecord,
        reviewItems,
        registryRecord,
      }),
      current_availability: availability,
      current_ifra_percent_shown:
        ifraPercent === "" || ifraPercent == null ? "" : Number(ifraPercent),
      current_sds_url: sdsUrl,
      current_inci_shown: supplierLayerRecord?.pageFacts?.inci || "",
      current_cas_shown: supplierLayerRecord?.pageFacts?.casShown || "",
      current_description:
        supplierLayerRecord?.pageFacts?.productDescription || "",
      current_scent_summary:
        supplierLayerRecord?.pageFacts?.scentSummary || "",
      current_dilution_or_carrier:
        supplierLayerRecord?.pageFacts?.dilutionOrCarrier || "",
      current_sizes_summary: summarizeSizes(pricePoints),
      current_prices_summary: summarizePrices(pricePoints),
      local_draft_or_canonical_status: mappedCatalogName
        ? buildMaterialStatusLabel(mappedRecord)
        : "Unmapped supplier row",
      trust_completeness_status: buildTrustStatusLabel(truthReport),
      notes_warnings: buildNotesWarningsSummary([
        supplierLayerRecord?.notes,
        registryRecord?.notes,
        reviewItems.length > 0
          ? `${reviewItems.length} review item${
              reviewItems.length === 1 ? "" : "s"
            } pending`
          : null,
      ]),
    });

    pricePoints.forEach((point) => {
      priceRows.push({
        supplier_product_key: supplierProductKey,
        supplier_product_name: productTitle,
        supplier_product_url: productUrl,
        size_value: Number(point[0]),
        size_unit: normalizePriceUnit(point[1]) || point[1] || "",
        price_value: Number(point[2]),
        currency: "USD",
        availability: availability,
      });
    });
  });

  const supplierVariantsByMaterial = new Map();
  registryProductRecords.forEach((record) => {
    const mappedCatalogName = String(record?.mappedCatalogName || "").trim();
    if (!mappedCatalogName) return;
    const existing = supplierVariantsByMaterial.get(mappedCatalogName) || [];
    existing.push(record);
    supplierVariantsByMaterial.set(mappedCatalogName, existing);
  });

  const materialRows = Object.keys(db || {})
    .filter((materialName) => {
      const record = db?.[materialName];
      return record && record.entryKind !== "diluted_stock";
    })
    .sort((a, b) => a.localeCompare(b))
    .map((materialName) => {
      const record = db?.[materialName] || {};
      const truthReport =
        typeof buildIngredientTruthReport === "function"
          ? buildIngredientTruthReport(materialName, {
              record,
              livePricing: mergedLivePricing?.[materialName] || {},
            })
          : null;
      const supplierVariants = supplierVariantsByMaterial.get(materialName) || [];
      const supplierNames = Array.from(
        new Set(supplierVariants.map((variant) => variant?.supplierDisplayName).filter(Boolean))
      );
      return {
        material_name: materialName,
        canonical_or_local_draft: buildMaterialStatusLabel(record),
        supplier_variants_known: supplierVariants.length
          ? `${supplierVariants.length} linked variant${
              supplierVariants.length === 1 ? "" : "s"
            }${supplierNames.length ? ` · ${supplierNames.join(", ")}` : ""}`
          : "0",
        cas: record?.cas || "",
        inci: record?.inci || "",
        note_role: record?.note || "",
        material_type: record?.type || "",
        scent_summary:
          record?.scentSummary || record?.scentDesc || record?.char || "",
        trust_completeness_level: buildTrustStatusLabel(truthReport),
      };
    });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    buildReferenceSheet(
      productRows,
      REFERENCE_EXPORT_HEADERS[FRATERWORKS_PRODUCTS_REFERENCE_SHEET]
    ),
    FRATERWORKS_PRODUCTS_REFERENCE_SHEET
  );
  XLSX.utils.book_append_sheet(
    workbook,
    buildReferenceSheet(
      materialRows,
      REFERENCE_EXPORT_HEADERS[MATERIALS_REFERENCE_SHEET]
    ),
    MATERIALS_REFERENCE_SHEET
  );
  XLSX.utils.book_append_sheet(
    workbook,
    buildReferenceSheet(
      priceRows,
      REFERENCE_EXPORT_HEADERS[FRATERWORKS_PRICES_REFERENCE_SHEET]
    ),
    FRATERWORKS_PRICES_REFERENCE_SHEET
  );

  return {
    exportedAt,
    fileName: `fraterworks_reference_export_${String(exportedAt).slice(
      0,
      10
    )}.xlsx`,
    workbookArrayBuffer: XLSX.write(workbook, {
      type: "array",
      bookType: "xlsx",
    }),
    summary: {
      fraterworksProductsExported: productRows.length,
      materialsExported: materialRows.length,
      fraterworksPriceRowsExported: priceRows.length,
    },
    rowsBySheet: {
      [FRATERWORKS_PRODUCTS_REFERENCE_SHEET]: productRows,
      [MATERIALS_REFERENCE_SHEET]: materialRows,
      [FRATERWORKS_PRICES_REFERENCE_SHEET]: priceRows,
    },
  };
}

export function buildTrustedSupplierWorkbookImportPlan(
  parsedWorkbook,
  {
    db = {},
    supplierLayerRecords = [],
    localDraftIngredients = {},
    supplierProductRegistry = {},
    buildSupplierProductKey = null,
    getIfraMaterialRecord = () => null,
    importedAt = new Date().toISOString(),
  } = {}
) {
  const fatalErrors = [...(parsedWorkbook?.fatalErrors || [])];
  const warnings = [...(parsedWorkbook?.warnings || [])];
  const rowsBySheet = parsedWorkbook?.rowsBySheet || {};
  const productRows = rowsBySheet[SUPPLIER_PRODUCT_SHEET] || [];
  const priceRows = rowsBySheet[SUPPLIER_PRICE_SHEET] || [];
  const mappingRows = rowsBySheet[MATERIAL_MAPPING_SHEET] || [];

  const productRowsByKey = new Map();
  const priceRowsByKey = new Map();
  const mappingRowsByKey = new Map();
  const existingLocalDraftNames = new Set(
    Object.keys(localDraftIngredients || {}).filter(Boolean)
  );
  const existingSupplierLayerByKey = new Map(
    (Array.isArray(supplierLayerRecords) ? supplierLayerRecords : [])
      .filter((record) => record?.supplierProductKey)
      .map((record) => [record.supplierProductKey, record])
  );

  const registerProductKeyWarning = (sheetName, row, message, severity = "warning") => {
    warnings.push(
      buildRowWarning({
        sheetName,
        rowNumber: row?.rowNumber,
        supplierProductKey: null,
        severity,
        message,
      })
    );
  };

  productRows.forEach((row) => {
    const supplierProductKey = deriveSupplierProductKey(row, {
      buildSupplierProductKey,
    });
    if (!supplierProductKey) {
      registerProductKeyWarning(
        SUPPLIER_PRODUCT_SHEET,
        row,
        "Could not derive a supplier product key from this product row.",
        "error"
      );
      return;
    }
    if (productRowsByKey.has(supplierProductKey)) {
      fatalErrors.push(
        `Duplicate supplier product key in ${SUPPLIER_PRODUCT_SHEET}: ${supplierProductKey}.`
      );
      return;
    }
    productRowsByKey.set(supplierProductKey, {
      ...row,
      supplierProductKey,
      supplier_name: String(row?.supplier_name || "").trim(),
      supplier_product_name: String(row?.supplier_product_name || "").trim(),
    });
  });

  priceRows.forEach((row) => {
    const supplierProductKey = deriveSupplierProductKey(row, {
      buildSupplierProductKey,
    });
    if (!supplierProductKey) {
      registerProductKeyWarning(
        SUPPLIER_PRICE_SHEET,
        row,
        "Could not derive a supplier product key from this price row.",
        "warning"
      );
      return;
    }
    const qty = parseNumberValue(row?.size_value);
    const unit = normalizePriceUnit(row?.size_unit);
    const price = parseNumberValue(row?.price_usd);
    if (!Number.isFinite(qty) || qty <= 0 || !unit || !Number.isFinite(price)) {
      warnings.push(
        buildRowWarning({
          sheetName: SUPPLIER_PRICE_SHEET,
          rowNumber: row?.rowNumber,
          supplierProductKey,
          severity: "warning",
          message:
            "Price row skipped because quantity, unit, or price is malformed.",
        })
      );
      return;
    }
    const nextRows = priceRowsByKey.get(supplierProductKey) || [];
    nextRows.push([qty, unit, price, String(row?.dilution_note || "").trim() || null]);
    priceRowsByKey.set(supplierProductKey, nextRows);
  });

  mappingRows.forEach((row) => {
    const supplierProductKey = deriveSupplierProductKey(row, {
      buildSupplierProductKey,
    });
    if (!supplierProductKey) {
      registerProductKeyWarning(
        MATERIAL_MAPPING_SHEET,
        row,
        "Could not derive a supplier product key from this mapping row.",
        "warning"
      );
      return;
    }
    if (mappingRowsByKey.has(supplierProductKey)) {
      warnings.push(
        buildRowWarning({
          sheetName: MATERIAL_MAPPING_SHEET,
          rowNumber: row?.rowNumber,
          supplierProductKey,
          severity: "warning",
          message:
            "Duplicate mapping row detected. The first mapping row was kept and the later one was skipped.",
        })
      );
      return;
    }
    mappingRowsByKey.set(supplierProductKey, {
      ...row,
      supplierProductKey,
      mapping_action: normalizeMappingAction(row?.mapping_action),
      mapped_material_name: String(row?.mapped_material_name || "").trim(),
      local_draft_material_name: String(
        row?.local_draft_material_name || ""
      ).trim(),
      review_note: String(row?.review_note || "").trim(),
    });
  });

  const supplierLayerRecordMap = {};
  const localDraftRecordsByName = {};
  const pricePatches = [];
  const resultRows = [];
  let priceRowsImported = 0;
  let mappingsResolved = 0;
  let localDraftMaterialsCreated = 0;
  let itemsSentToReview = 0;

  productRowsByKey.forEach((productRow, supplierProductKey) => {
    const rowWarnings = [];
    const supplierName =
      String(productRow?.supplier_name || "").trim() || "Manual Trusted Import";
    const productTitle =
      String(productRow?.supplier_product_name || "").trim() ||
      supplierProductKey;
    const pricePoints = dedupePricePoints(priceRowsByKey.get(supplierProductKey) || []);
    const mappingRow = mappingRowsByKey.get(supplierProductKey) || null;
    const registryRecord = supplierProductRegistry[supplierProductKey] || null;
    const existingSupplierLayerRecord =
      existingSupplierLayerByKey.get(supplierProductKey) || null;
    const explicitCreateLocalDraft =
      parseBooleanFlag(productRow?.create_local_draft) ||
      mappingRow?.mapping_action === "create_local_draft";
    const explicitExistingMaterial =
      mappingRow?.mapping_action === "existing_material";
    const explicitUnresolved = mappingRow?.mapping_action === "unresolved";
    const reviewItems = [];
    let mappedCatalogName = null;
    let canonicalMaterialKey = null;
    let trustLane = "auto_apply_safe";
    let canAutoApplyToPricing = false;
    let createdLocalDraft = false;
    let resultStatus = "imported";
    let resultNote = "Supplier-layer facts imported.";

    const registryMappedCatalogName = registryRecord?.mappedCatalogName || null;
    const explicitMappedMaterialName =
      mappingRow?.mapped_material_name || null;
    const requestedLocalDraftName =
      mappingRow?.local_draft_material_name ||
      productRow?.local_draft_material_name ||
      productTitle;

    if (explicitExistingMaterial) {
      if (!explicitMappedMaterialName) {
        rowWarnings.push(
          buildRowWarning({
            sheetName: MATERIAL_MAPPING_SHEET,
            rowNumber: mappingRow?.rowNumber,
            supplierProductKey,
            severity: "warning",
            message:
              "Mapping row requested an existing material, but no mapped_material_name was provided. The item was routed to review instead.",
          })
        );
      } else if (!db[explicitMappedMaterialName]) {
        rowWarnings.push(
          buildRowWarning({
            sheetName: MATERIAL_MAPPING_SHEET,
            rowNumber: mappingRow?.rowNumber,
            supplierProductKey,
            severity: "warning",
            message: `"${explicitMappedMaterialName}" is not in the live catalog. The item was routed to review instead of blocking the whole import.`,
          })
        );
      } else {
        mappedCatalogName = explicitMappedMaterialName;
      }
    } else if (explicitCreateLocalDraft) {
      mappedCatalogName = requestedLocalDraftName || null;
    } else if (registryMappedCatalogName && db[registryMappedCatalogName]) {
      mappedCatalogName = registryMappedCatalogName;
    }

    const mappedRecord = mappedCatalogName ? db[mappedCatalogName] || null : null;
    const isMappedLocalDraft =
      Boolean(mappedRecord?.isLocalDraft) ||
      existingLocalDraftNames.has(mappedCatalogName);

    if (explicitCreateLocalDraft) {
      if (
        mappedCatalogName &&
        db[mappedCatalogName] &&
        !isMappedLocalDraft
      ) {
        rowWarnings.push(
          buildRowWarning({
            sheetName: MATERIAL_MAPPING_SHEET,
            rowNumber: mappingRow?.rowNumber || productRow?.rowNumber,
            supplierProductKey,
            severity: "warning",
            message: `"${mappedCatalogName}" already exists as a live catalog material, so this row was routed to review instead of creating a duplicate local draft.`,
          })
        );
        mappedCatalogName = null;
      } else if (mappedCatalogName) {
        const localDraftArtifacts = buildLocalDraftIngredientArtifacts({
          materialName: mappedCatalogName,
          supplierName,
          supplierSourceNote: buildImportSourceNote(productRow),
          url: productRow?.supplier_product_url,
          pricePoints,
          availabilityStatus: productRow?.availability,
          ifraPercent: productRow?.ifra_percent_shown,
          sdsUrl: productRow?.sds_url,
          inci: productRow?.inci_shown,
          cas: productRow?.cas_shown,
          note: productRow?.note_role,
          materialType: productRow?.material_type,
          scentSummary: productRow?.scent_summary,
          scentDescription: productRow?.product_description,
          technicalNotes: [
            String(productRow?.technical_notes || "").trim() || null,
            String(productRow?.dilution_or_carrier || "").trim()
              ? `Dilution / carrier: ${String(
                  productRow?.dilution_or_carrier || ""
                ).trim()}`
              : null,
            "Manual trusted import staged from the supplier workbook.",
          ]
            .filter(Boolean)
            .join(" · "),
          confidence: "high",
          MW: productRow?.mw,
          xLogP: productRow?.xlogp,
          TPSA: productRow?.tpsa,
          VP: productRow?.vp,
          ODT: productRow?.odt,
          createdAt:
            localDraftIngredients?.[mappedCatalogName]?.createdAt || importedAt,
          updatedAt: importedAt,
        });

        if (localDraftArtifacts?.name) {
          localDraftRecordsByName[localDraftArtifacts.name] =
            localDraftArtifacts.localDraftRecord;
          if (!db[localDraftArtifacts.name]) {
            localDraftMaterialsCreated += 1;
          }
          mappingsResolved += 1;
          createdLocalDraft = true;
          canAutoApplyToPricing = true;
          resultStatus = "local_draft_created";
          resultNote = `Local draft "${localDraftArtifacts.name}" was created and is immediately usable in the runtime.`;
        } else {
          rowWarnings.push(
            buildRowWarning({
              sheetName: MATERIAL_MAPPING_SHEET,
              rowNumber: mappingRow?.rowNumber || productRow?.rowNumber,
              supplierProductKey,
              severity: "warning",
              message:
                "The requested local draft could not be normalized, so this row was routed to review instead.",
            })
          );
          mappedCatalogName = null;
        }
      }
    }

    if (mappedCatalogName && !explicitCreateLocalDraft) {
      canonicalMaterialKey = mappedRecord?.canonicalMaterialKey || null;

      if (
        registryMappedCatalogName &&
        registryMappedCatalogName !== mappedCatalogName
      ) {
        reviewItems.push(
          normalizeSupplierWorkbookReviewItem({
            reviewItemKey: `${supplierProductKey}:merge_review`,
            supplierProductKey,
            supplierDisplayName: supplierName,
            trustLane: "batch_review_mapping",
            issueType: "merge_review",
            productTitle,
            url: normalizeUrl(productRow?.supplier_product_url),
            mappedCatalogName,
            canonicalMaterialKey,
            whyItMatters:
              "The workbook mapping disagrees with the current supplier registry mapping, so the app cannot safely decide whether this is a variant, duplicate, or remap.",
            nextAction:
              "Resolve the mapping in the review queue before this workbook import updates live ownership.",
            fetchTimestamp: importedAt,
          })
        );
      }

      const incomingInci = String(productRow?.inci_shown || "").trim();
      const incomingCasSupport = parseMaterialCasSupport(productRow?.cas_shown);
      const currentIfra = parsePercentValue(
        getIfraMaterialRecord(mappedCatalogName)?.limits?.cat4
      );
      const incomingIfra = parsePercentValue(productRow?.ifra_percent_shown);

      if (
        incomingInci &&
        mappedRecord?.inci &&
        normalizeText(incomingInci) !== normalizeText(mappedRecord.inci)
      ) {
        reviewItems.push(
          normalizeSupplierWorkbookReviewItem({
            reviewItemKey: `${supplierProductKey}:canonical_conflict_inci`,
            supplierProductKey,
            supplierDisplayName: supplierName,
            trustLane: "manual_review_conflict",
            issueType: "canonical_conflict_inci",
            productTitle,
            url: normalizeUrl(productRow?.supplier_product_url),
            mappedCatalogName,
            canonicalMaterialKey,
            whyItMatters:
              "The imported supplier INCI does not match the currently mapped app material, so identity and compliance advice could be distorted.",
            nextAction:
              "Stage this conflict through the existing evidence-review lane before changing canonical identity support.",
            fieldKey: "inci",
            fieldLabel: "INCI shown on supplier import",
            supplierValue: incomingInci,
            currentValue: mappedRecord.inci,
            fetchTimestamp: importedAt,
          })
        );
      }

      if (
        incomingCasSupport.hasValue &&
        mappedRecord?.cas &&
        !compareMaterialCasSupportValues(
          incomingCasSupport.displayValue,
          mappedRecord.cas
        )
      ) {
        reviewItems.push(
          normalizeSupplierWorkbookReviewItem({
            reviewItemKey: `${supplierProductKey}:canonical_conflict_cas`,
            supplierProductKey,
            supplierDisplayName: supplierName,
            trustLane: "manual_review_conflict",
            issueType: "canonical_conflict_cas",
            productTitle,
            url: normalizeUrl(productRow?.supplier_product_url),
            mappedCatalogName,
            canonicalMaterialKey,
            whyItMatters:
              "The imported supplier CAS does not match the currently mapped app material, so identity support may be wrong downstream.",
            nextAction:
              "Stage this CAS conflict into evidence review before changing live identity truth.",
            fieldKey: "cas",
            fieldLabel: "CAS shown on supplier import",
            supplierValue: incomingCasSupport.displayValue,
            currentValue:
              formatMaterialCasSupportValue(mappedRecord.cas) || mappedRecord.cas,
            fetchTimestamp: importedAt,
          })
        );
      }

      if (
        incomingIfra != null &&
        currentIfra != null &&
        Math.abs(incomingIfra - currentIfra) > 0.05
      ) {
        reviewItems.push(
          normalizeSupplierWorkbookReviewItem({
            reviewItemKey: `${supplierProductKey}:canonical_conflict_ifra`,
            supplierProductKey,
            supplierDisplayName: supplierName,
            trustLane: "manual_review_conflict",
            issueType: "canonical_conflict_ifra",
            productTitle,
            url: normalizeUrl(productRow?.supplier_product_url),
            mappedCatalogName,
            canonicalMaterialKey,
            whyItMatters:
              "The imported supplier IFRA percentage conflicts with current restriction support, so compliance advice could be distorted.",
            nextAction:
              "Keep the workbook IFRA value in the supplier layer and stage the restriction conflict for review.",
            fieldKey: "ifra",
            fieldLabel: "IFRA % shown on supplier import",
            supplierValue: `${incomingIfra}%`,
            currentValue: `${currentIfra}%`,
            fetchTimestamp: importedAt,
          })
        );
      }

      canAutoApplyToPricing = !reviewItems.some(
        (item) => item.trustLane === "batch_review_mapping"
      );
      resultStatus = canAutoApplyToPricing ? "mapped_existing" : "review_required";
      resultNote = canAutoApplyToPricing
        ? `Mapped to existing material "${mappedCatalogName}" and refreshed trusted supplier pricing where available.`
        : `Mapped to "${mappedCatalogName}", but review is still required before live ownership can rely on the workbook mapping.`;
      mappingsResolved += 1;
    }

    if (!mappedCatalogName && !createdLocalDraft) {
      const shouldRouteUnmappedRowToReview = Boolean(
        explicitUnresolved ||
          (explicitExistingMaterial && !explicitMappedMaterialName) ||
          (explicitExistingMaterial &&
            explicitMappedMaterialName &&
            !db[explicitMappedMaterialName]) ||
          (explicitCreateLocalDraft && !createdLocalDraft)
      );

      if (shouldRouteUnmappedRowToReview) {
        reviewItems.push(
          normalizeSupplierWorkbookReviewItem({
            reviewItemKey: `${supplierProductKey}:mapping_unresolved`,
            supplierProductKey,
            supplierDisplayName: supplierName,
            trustLane: "batch_review_mapping",
            issueType: "mapping_unresolved",
            productTitle,
            url: normalizeUrl(productRow?.supplier_product_url),
            mappedCatalogName: null,
            canonicalMaterialKey: null,
            whyItMatters:
              explicitUnresolved
                ? "The workbook intentionally left this mapping unresolved, so the supplier facts were imported without choosing a live material target."
                : "The workbook requested a mapping or local-draft action that could not be completed safely, so this supplier row still needs a review decision.",
            nextAction:
              explicitUnresolved
                ? "Resolve the mapping before this supplier import can refresh live ownership or pricing."
                : "Fix the mapping instruction or choose a local-draft / existing-material target before relying on this supplier row downstream.",
            fetchTimestamp: importedAt,
          })
        );
        trustLane = "batch_review_mapping";
        resultStatus = "review_required";
        resultNote = explicitUnresolved
          ? "Imported with unresolved mapping and routed into the review lane."
          : "Imported supplier facts safely, but the requested mapping action still needs review.";
      } else {
        trustLane = "auto_apply_safe";
        resultStatus = "supplier_layer_created";
        resultNote =
          "Trusted supplier facts were captured as a clean supplier-layer create-state. This product stays usable for supplier sync and later mapping without creating a review exception by default.";
      }
    }

    if (reviewItems.some((item) => item.trustLane === "manual_review_conflict")) {
      trustLane = "manual_review_conflict";
    } else if (
      reviewItems.some((item) => item.trustLane === "batch_review_mapping")
    ) {
      trustLane = "batch_review_mapping";
    }

    const supplierLayerRecord = buildSupplierLayerRecord({
      supplierProductKey,
      supplierDisplayName: supplierName,
      productRow,
      pricePoints,
      importedAt,
      trustLane,
      mappedCatalogName,
      canonicalMaterialKey:
        mappedCatalogName && !createdLocalDraft
          ? db[mappedCatalogName]?.canonicalMaterialKey || null
          : null,
      reviewItems,
      canAutoApplyToPricing,
    });
    supplierLayerRecordMap[supplierLayerRecord.recordKey] = supplierLayerRecord;
    itemsSentToReview += reviewItems.length;
    priceRowsImported += pricePoints.length;

    if (mappedCatalogName && canAutoApplyToPricing) {
      pricePatches.push(
        buildPricingPatch({
          catalogName: mappedCatalogName,
          supplierName,
          productRow,
          pricePoints,
        })
      );
    }

    resultRows.push(
      buildImportResultRow({
        supplierProductKey,
        supplierName,
        productTitle,
        mappedCatalogName,
        trustLane,
        reviewItemCount: reviewItems.length,
        priceRowCount: pricePoints.length,
        createdLocalDraft,
        warnings: rowWarnings,
        status: resultStatus,
        note: resultNote,
      })
    );
    warnings.push(...rowWarnings);
  });

  const report = {
    metadata: {
      version: 1,
      source: "trusted_supplier_xlsx_import",
      importedAt,
      workbookSheetNames: parsedWorkbook?.workbookMetadata?.sheetNames || [],
      workbookRowCounts: parsedWorkbook?.workbookMetadata?.rowCounts || {},
    },
    summary: {
      supplierProductsImported: Object.keys(supplierLayerRecordMap).length,
      priceRowsImported,
      localDraftMaterialsCreated,
      mappingsResolved,
      itemsSentToReview,
      rowsSkippedWithWarnings: warnings.length,
    },
    fatalErrors,
    warnings,
    resultRows,
  };

  return {
    fatalErrors,
    warnings,
    report,
    supplierLayerRecordMap,
    localDraftRecordsByName,
    pricePatches,
  };
}
