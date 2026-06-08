import heroFormulaMaterialSupport from "../data/hero_formula_material_support.json" with { type: "json" };

export const HERO_FORMULA_MATERIAL_SUPPORT = heroFormulaMaterialSupport;

export const HERO_FORMULA_RAW_DB_FIELDS = [
  "MW",
  "xLogP",
  "TPSA",
  "HBD",
  "HBA",
  "VP",
  "ODT",
  "n",
  "note",
  "type",
  "ifra",
  "supplier",
  "char",
  "rep",
  "densityGmL",
  "cas",
  "inci",
  "scentClass",
  "scentSummary",
  "scentDesc",
  "ifraLimit",
  "densityGmL2",
  "dilutionFactor",
  "isUVCB",
  "descriptorTags",
  "odorThreshold_ngL",
  "vpConfidence",
  "isIsomerMix",
  "ifraLimits",
];

const HERO_SUPPORT_SUPPLIER_NAME = "Hero Formula Support";
const BENCH_ACCORD_SUPPLIER_NAME = "Bench Accord";

function cloneJsonValue(value) {
  if (Array.isArray(value)) return value.map((item) => cloneJsonValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item)])
    );
  }
  return value;
}

function normalizePercentFraction(percent) {
  const value = Number(percent);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Number((value / 100).toFixed(8));
}

function createRawDbRow(record = {}) {
  return HERO_FORMULA_RAW_DB_FIELDS.map((field) => record[field] ?? null);
}

function rawDbRowToRecord(row = null) {
  if (!Array.isArray(row)) return null;
  return Object.fromEntries(
    HERO_FORMULA_RAW_DB_FIELDS.map((field, index) => [field, row[index]])
  );
}

const PARENT_INHERITED_MOLECULAR_FIELDS = [
  "MW",
  "VP",
  "xLogP",
  "odorThreshold_ngL",
  "ODT",
  "densityGmL",
  "vpConfidence",
  "isUVCB",
  "isIsomerMix",
];

function hasParentMolecularValue(field, value) {
  if (value == null) return false;
  if (field === "vpConfidence") {
    return typeof value === "string" && value.trim() !== "";
  }
  if (field === "isUVCB" || field === "isIsomerMix") {
    return typeof value === "boolean";
  }
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return false;
  if (field === "xLogP") return true;
  return numericValue > 0;
}

function inheritParentMolecularFields(record = {}, parentRecord = null) {
  if (!parentRecord) return;

  for (const field of PARENT_INHERITED_MOLECULAR_FIELDS) {
    if (hasParentMolecularValue(field, record[field])) continue;
    if (!hasParentMolecularValue(field, parentRecord[field])) continue;
    record[field] = cloneJsonValue(parentRecord[field]);
  }
}

function createDilutedStockRawDbRow(stock = {}, parentRow = null) {
  const fraction = normalizePercentFraction(stock.activePercent);
  const carrierText = stock.carrierName ? ` in ${stock.carrierName}` : "";
  const record = {
    HBD: 0,
    HBA: 0,
    note: stock.note || "base",
    type: stock.type || "SYNTH",
    ifra: false,
    supplier: HERO_SUPPORT_SUPPLIER_NAME,
    char: `${stock.activePercent}% dilution of ${stock.parentName}${carrierText}.`,
    rep: stock.parentName,
    scentClass: "Diluted Stock",
    scentSummary: `${stock.activePercent}% ${stock.parentName} working stock`,
    scentDesc:
      `Hero formula support row for ${stock.name}. Chemistry and IFRA identity inherit from ${stock.parentName}; dilution factor preserves active-material behavior.`,
    dilutionFactor: fraction,
  };

  inheritParentMolecularFields(record, rawDbRowToRecord(parentRow));

  return createRawDbRow(record);
}

function createAccordRawDbRow(accord = {}) {
  return createRawDbRow({
    HBD: 0,
    HBA: 0,
    note: accord.note || "base",
    type: accord.type || "ACCORD",
    ifra: false,
    supplier: BENCH_ACCORD_SUPPLIER_NAME,
    char: accord.scentSummary || "Formula-level accord support row",
    rep: "Accord",
    densityGmL: 1,
    cas: "Mixture",
    inci: accord.name,
    scentClass: accord.scentClass || "Accord",
    scentSummary: accord.scentSummary || accord.name,
    scentDesc:
      accord.scentDesc ||
      "Formula-level accord support row. Composition is intentionally not expanded.",
    densityGmL2: 1,
    isUVCB: true,
    descriptorTags: ["Hero Formula", "Accord"],
    vpConfidence: "not_applicable",
    isIsomerMix: true,
  });
}

function createSupportRecordRawDbRow(record = {}) {
  const supplierName = record.supplierName || HERO_SUPPORT_SUPPLIER_NAME;
  const summary =
    record.scentSummary || `Hero formula support record for ${record.name}`;
  const description =
    record.scentDesc ||
    "Reviewed hero formula support record. Chemistry, CAS, IFRA limits, and pricing are intentionally not inferred.";

  return createRawDbRow({
    note: record.note || null,
    type: record.type || null,
    ifra: false,
    supplier: supplierName,
    char: description,
    rep: record.name || null,
    cas: record.cas || null,
    inci: record.inci || null,
    scentClass: record.scentClass || "Support Record",
    scentSummary: summary,
    scentDesc: description,
    isUVCB: record.isUVCB ?? null,
    descriptorTags: ["Hero Formula", "Support Record"],
    vpConfidence: "review_needed",
  });
}

function scaleSupplierPriceRowsForDilution(rows = [], activeFraction) {
  if (!activeFraction) return cloneJsonValue(rows);
  return rows.map((row) => {
    if (!Array.isArray(row) || row.length < 3) return cloneJsonValue(row);
    const [qty, unit, price, ...rest] = row;
    const numericQty = Number(qty);
    if (!Number.isFinite(numericQty) || numericQty <= 0) {
      return cloneJsonValue(row);
    }
    return [
      Number((numericQty / activeFraction).toFixed(6)),
      unit,
      price,
      ...cloneJsonValue(rest),
    ];
  });
}

function createDilutedStockPricing(parentPricing = {}, stock = {}) {
  const fraction = normalizePercentFraction(stock.activePercent);
  return Object.fromEntries(
    Object.entries(parentPricing || {}).map(([supplierName, supplierData]) => [
      supplierName,
      {
        ...cloneJsonValue(supplierData),
        S: scaleSupplierPriceRowsForDilution(supplierData?.S || [], fraction),
        supportSourceName: stock.parentName,
        supportActivePercent: stock.activePercent,
        supportCarrierName: stock.carrierName || null,
      },
    ])
  );
}

function createAccordPricing() {
  return {
    [BENCH_ACCORD_SUPPLIER_NAME]: {
      url: null,
      S: [
        [1, "g", 0],
        [10, "g", 0],
        [100, "g", 0],
      ],
      inStock: true,
      supportNote:
        "Placeholder pricing support for a black-box formula accord. Replace with component-derived pricing when the accord recipe is approved.",
    },
  };
}

export function buildHeroFormulaRawDbSupportRows(rawDb = {}) {
  const supportRows = {};

  for (const stock of HERO_FORMULA_MATERIAL_SUPPORT.dilutedStocks || []) {
    if (!rawDb[stock.name]) {
      supportRows[stock.name] = createDilutedStockRawDbRow(
        stock,
        rawDb[stock.parentName]
      );
    }
  }

  for (const accord of HERO_FORMULA_MATERIAL_SUPPORT.accords || []) {
    if (!rawDb[accord.name]) {
      supportRows[accord.name] = createAccordRawDbRow(accord);
    }
  }

  for (const record of HERO_FORMULA_MATERIAL_SUPPORT.supportRecords || []) {
    if (!rawDb[record.name]) {
      supportRows[record.name] = createSupportRecordRawDbRow(record);
    }
  }

  const combinedRows = { ...rawDb, ...supportRows };
  for (const alias of HERO_FORMULA_MATERIAL_SUPPORT.aliases || []) {
    if (combinedRows[alias.name]) continue;
    const targetRow = combinedRows[alias.targetName];
    if (!targetRow) continue;
    supportRows[alias.name] = cloneJsonValue(targetRow);
    combinedRows[alias.name] = supportRows[alias.name];
  }

  return supportRows;
}

export function buildHeroFormulaPricingSupportRows(pricing = {}) {
  const supportPricing = {};

  for (const stock of HERO_FORMULA_MATERIAL_SUPPORT.dilutedStocks || []) {
    if (pricing[stock.name]) continue;
    const parentPricing = pricing[stock.parentName];
    if (!parentPricing) continue;
    supportPricing[stock.name] = createDilutedStockPricing(parentPricing, stock);
  }

  for (const accord of HERO_FORMULA_MATERIAL_SUPPORT.accords || []) {
    if (!pricing[accord.name]) {
      supportPricing[accord.name] = createAccordPricing();
    }
  }

  const combinedPricing = { ...pricing, ...supportPricing };
  for (const alias of HERO_FORMULA_MATERIAL_SUPPORT.aliases || []) {
    if (combinedPricing[alias.name]) continue;
    const targetPricing = combinedPricing[alias.targetName];
    if (!targetPricing) continue;
    supportPricing[alias.name] = cloneJsonValue(targetPricing);
    combinedPricing[alias.name] = supportPricing[alias.name];
  }

  return supportPricing;
}

function createSupplierLink(status, note) {
  return {
    [HERO_SUPPORT_SUPPLIER_NAME]: {
      status,
      note,
    },
  };
}

function createCanonicalMaterialEntry(name, canonicalMaterialKey) {
  return {
    entryKind: "canonical_material",
    canonicalMaterialKey,
    supplierLinks: createSupplierLink(
      "primary_listing",
      `Hero formula support overlay treats ${name} as the canonical parent for related formula support rows.`
    ),
  };
}

function createDilutedStockNormalizationEntry(stock = {}) {
  const isMixtureLikeParent = stock.type === "EO" || stock.type === "ABS";
  return {
    entryKind: "diluted_stock",
    canonicalMaterialKey: stock.canonicalMaterialKey,
    linkedDuplicateOfCatalogName: stock.parentName,
    molecularSource: "parent_inherited",
    molecularParentName: stock.parentName,
    molecularInheritanceConfidence: isMixtureLikeParent
      ? "parent_proxy_mixture"
      : "parent_material",
    stock: {
      activeMaterialName: stock.parentName,
      activePercent: stock.activePercent,
      carrierName: stock.carrierName || null,
    },
    supplierLinks: createSupplierLink(
      "primary_listing",
      `${stock.name} is a ${stock.activePercent}% working dilution of ${stock.parentName}.`
    ),
  };
}

function createAccordNormalizationEntry(accord = {}) {
  return {
    entryKind: "accord",
    canonicalMaterialKey: accord.canonicalMaterialKey,
    supplierLinks: {
      [BENCH_ACCORD_SUPPLIER_NAME]: {
        status: "accord_listing",
        note:
          "Formula-level black-box accord support row. Do not expand until the accord recipe is explicitly supplied.",
      },
    },
  };
}

function createSupportRecordNormalizationEntry(record = {}) {
  const supplierName = record.supplierName || HERO_SUPPORT_SUPPLIER_NAME;
  const supplierLink = {
    status: record.reviewState || "support_record",
    note:
      record.scentDesc ||
      `${record.name} has a reviewed hero formula support record. Chemistry, CAS, IFRA limits, and pricing are intentionally not inferred.`,
  };

  if (record.sourceUrl) supplierLink.url = record.sourceUrl;
  if (record.sourceProductTitle) {
    supplierLink.productTitle = record.sourceProductTitle;
  }
  if (record.sourceConfidence) {
    supplierLink.sourceConfidence = record.sourceConfidence;
  }

  return {
    entryKind: record.entryKind || "canonical_material",
    canonicalMaterialKey: record.canonicalMaterialKey,
    reviewState: record.reviewState || "support_record",
    sourceConfidence: record.sourceConfidence || "reviewed_support_overlay",
    supplierLinks: {
      [supplierName]: supplierLink,
    },
  };
}

function createAliasNormalizationEntry(alias = {}, targetEntry = null) {
  const isDilutedAlias = alias.entryKind === "diluted_stock";
  return {
    entryKind: isDilutedAlias ? "diluted_stock" : "supplier_product",
    canonicalMaterialKey:
      alias.canonicalMaterialKey || targetEntry?.canonicalMaterialKey || null,
    linkedDuplicateOfCatalogName: alias.targetName,
    ...(isDilutedAlias && targetEntry?.stock
      ? { stock: cloneJsonValue(targetEntry.stock) }
      : {}),
    supplierLinks: createSupplierLink(
      "linked_duplicate",
      `${alias.name} is a hero formula alias for ${alias.targetName}.`
    ),
  };
}

export function buildHeroFormulaMaterialNormalizationEntries(baseEntries = {}) {
  const entries = {};

  const ensureCanonicalParent = (name, canonicalMaterialKey) => {
    if (!name || !canonicalMaterialKey || baseEntries[name] || entries[name]) {
      return;
    }
    entries[name] = createCanonicalMaterialEntry(name, canonicalMaterialKey);
  };

  for (const stock of HERO_FORMULA_MATERIAL_SUPPORT.dilutedStocks || []) {
    ensureCanonicalParent(stock.parentName, stock.canonicalMaterialKey);
    entries[stock.name] = createDilutedStockNormalizationEntry(stock);
  }

  for (const accord of HERO_FORMULA_MATERIAL_SUPPORT.accords || []) {
    entries[accord.name] = createAccordNormalizationEntry(accord);
  }

  for (const record of HERO_FORMULA_MATERIAL_SUPPORT.supportRecords || []) {
    entries[record.name] = createSupportRecordNormalizationEntry(record);
  }

  for (const alias of HERO_FORMULA_MATERIAL_SUPPORT.aliases || []) {
    const targetEntry = entries[alias.targetName] || baseEntries[alias.targetName] || null;
    if (!targetEntry) {
      ensureCanonicalParent(alias.targetName, alias.canonicalMaterialKey);
    }
    entries[alias.name] = createAliasNormalizationEntry(
      alias,
      entries[alias.targetName] || baseEntries[alias.targetName] || null
    );
  }

  return entries;
}
