import heroFormulaMaterialSupport from "../data/hero_formula_material_support.json" with { type: "json" };
import heroFormulaAccordRecipes from "../data/hero_formula_accord_recipes.json" with { type: "json" };

export const HERO_FORMULA_MATERIAL_SUPPORT = heroFormulaMaterialSupport;
export const HERO_FORMULA_ACCORD_RECIPES = heroFormulaAccordRecipes;

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
  "odorThresholdSource",
];

const HERO_SUPPORT_SUPPLIER_NAME = "Hero Formula Support";
const BENCH_ACCORD_SUPPLIER_NAME = "Bench Accord";
const ACCORD_RECIPE_PRICING_MODE = "component_derived";
const UNIT_COST_PRICING_MODE = "unit_cost";

function cloneJsonValue(value) {
  if (Array.isArray(value)) return value.map((item) => cloneJsonValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item)])
    );
  }
  return value;
}

function normalizeLookupName(value) {
  return String(value || "").trim().toLowerCase();
}

function roundCost(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Number(numericValue.toFixed(6))
    : null;
}

function normalizePercentFraction(percent) {
  const value = Number(percent);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Number((value / 100).toFixed(8));
}

function parseDilutionFraction(value) {
  const text = String(value || "").trim();
  if (!text || normalizeLookupName(text) === "neat") return null;
  const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? normalizePercentFraction(match[1]) : null;
}

function nameContainsPercent(value) {
  return /\d+(?:\.\d+)?\s*%/.test(String(value || ""));
}

function buildAccordRecipeLookup() {
  const lookup = new Map();
  for (const recipe of HERO_FORMULA_ACCORD_RECIPES.recipes || []) {
    if (!recipe?.name) continue;
    lookup.set(normalizeLookupName(recipe.name), recipe);
    for (const alias of recipe.aliases || []) {
      lookup.set(normalizeLookupName(alias), recipe);
    }
  }
  return lookup;
}

function buildComponentPricingAliasLookup() {
  return new Map(
    (HERO_FORMULA_ACCORD_RECIPES.componentPricingAliases || [])
      .filter((alias) => alias?.name && alias?.targetName)
      .map((alias) => [normalizeLookupName(alias.name), alias.targetName])
  );
}

const ACCORD_RECIPE_BY_NAME = buildAccordRecipeLookup();
const COMPONENT_PRICING_ALIAS_BY_NAME = buildComponentPricingAliasLookup();

export function getHeroFormulaAccordRecipe(name) {
  const recipe = ACCORD_RECIPE_BY_NAME.get(normalizeLookupName(name));
  return recipe ? cloneJsonValue(recipe) : null;
}

function getComponentPriceAlias(name) {
  return COMPONENT_PRICING_ALIAS_BY_NAME.get(normalizeLookupName(name)) || null;
}

function buildComponentPricingCandidates(component = {}) {
  const candidates = [];
  const componentName = component.name;
  if (!componentName) return candidates;

  const dilutionFraction = parseDilutionFraction(component.dilution);
  if (dilutionFraction && !nameContainsPercent(componentName)) {
    candidates.push({
      name: `${componentName} ${component.dilution}`,
      appliesDilutionScaling: false,
    });
  }

  candidates.push({
    name: componentName,
    appliesDilutionScaling:
      Boolean(dilutionFraction) && !nameContainsPercent(componentName),
  });

  const aliasTarget = getComponentPriceAlias(componentName);
  if (aliasTarget) {
    candidates.push({
      name: aliasTarget,
      appliesDilutionScaling:
        Boolean(dilutionFraction) && !nameContainsPercent(aliasTarget),
    });
  }

  return candidates;
}

function getCheapestGramUnitPrice(supplierPricing = {}) {
  let best = null;
  for (const [supplierName, supplierData] of Object.entries(supplierPricing || {})) {
    for (const row of supplierData?.S || []) {
      if (!Array.isArray(row) || row.length < 3) continue;
      const [qty, unit, price] = row;
      if (unit !== "g") continue;
      const numericQty = Number(qty);
      const numericPrice = Number(price);
      if (
        !Number.isFinite(numericQty) ||
        numericQty <= 0 ||
        !Number.isFinite(numericPrice) ||
        numericPrice <= 0
      ) {
        continue;
      }
      const pricePerGram = numericPrice / numericQty;
      if (!best || pricePerGram < best.pricePerGram) {
        best = {
          supplierName,
          qty: numericQty,
          unit,
          price: numericPrice,
          pricePerGram,
        };
      }
    }
  }
  return best;
}

function resolveComponentPricing(component = {}, pricing = {}) {
  const dilutionFraction = parseDilutionFraction(component.dilution);
  const candidates = buildComponentPricingCandidates(component);

  for (const candidate of candidates) {
    const supplierPricing = pricing[candidate.name];
    if (!supplierPricing) continue;
    const bestPrice = getCheapestGramUnitPrice(supplierPricing);
    if (!bestPrice) continue;
    const effectivePricePerGram =
      candidate.appliesDilutionScaling && dilutionFraction
        ? bestPrice.pricePerGram * dilutionFraction
        : bestPrice.pricePerGram;
    return {
      componentName: component.name,
      pricingName: candidate.name,
      supplierName: bestPrice.supplierName,
      sourcePackage: {
        qty: bestPrice.qty,
        unit: bestPrice.unit,
        price: bestPrice.price,
      },
      basePricePerGram: roundCost(bestPrice.pricePerGram),
      dilutionFraction: candidate.appliesDilutionScaling
        ? dilutionFraction
        : null,
      effectivePricePerGram: roundCost(effectivePricePerGram),
    };
  }

  return null;
}

function buildAccordRecipeCost(recipe = {}, pricing = {}) {
  const components = Array.isArray(recipe.components) ? recipe.components : [];
  const componentCosts = [];
  const missingComponents = [];
  let totalComponentCost = 0;

  for (const component of components) {
    const amount = Number(component?.amount);
    const resolved = resolveComponentPricing(component, pricing);
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !resolved ||
      !Number.isFinite(resolved.effectivePricePerGram)
    ) {
      missingComponents.push(component?.name || "Unnamed component");
      continue;
    }

    const componentCost = amount * resolved.effectivePricePerGram;
    totalComponentCost += componentCost;
    componentCosts.push({
      name: component.name,
      amount,
      unit: component.unit || "g",
      dilution: component.dilution || "neat",
      pricingName: resolved.pricingName,
      supplierName: resolved.supplierName,
      sourcePackage: resolved.sourcePackage,
      basePricePerGram: resolved.basePricePerGram,
      dilutionFraction: resolved.dilutionFraction,
      effectivePricePerGram: resolved.effectivePricePerGram,
      componentCost: roundCost(componentCost),
    });
  }

  const totalAmount = Number(recipe.totalAmount);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return {
      status: "incomplete",
      missingComponents: ["Recipe total amount"],
      componentCosts,
      unitCostPerG: null,
    };
  }

  return {
    status: missingComponents.length ? "incomplete" : "complete",
    missingComponents,
    componentCosts,
    unitCostPerG: missingComponents.length
      ? null
      : roundCost(totalComponentCost / totalAmount),
    totalComponentCost: roundCost(totalComponentCost),
  };
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
  "descriptorTags",
  "odorThresholdSource",
];

function hasParentMolecularValue(field, value) {
  if (value == null) return false;
  if (field === "vpConfidence") {
    return typeof value === "string" && value.trim() !== "";
  }
  if (field === "isUVCB" || field === "isIsomerMix") {
    return typeof value === "boolean";
  }
  if (field === "descriptorTags") {
    return Array.isArray(value) && value.length > 0;
  }
  if (field === "odorThresholdSource") {
    return value && typeof value === "object" && Object.keys(value).length > 0;
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
  const recipe = getHeroFormulaAccordRecipe(accord.name);
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
      (recipe
        ? "Formula-level accord support row. Recipe is used for component-derived costing only."
        : "Formula-level accord support row. Composition is intentionally not expanded."),
    densityGmL2: 1,
    isUVCB: true,
    descriptorTags: [
      "Hero Formula",
      "Accord",
      ...(recipe ? ["Component Costed Accord"] : []),
    ],
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

function normalizeSupportPriceTiers(priceTiers = []) {
  return (Array.isArray(priceTiers) ? priceTiers : [])
    .map((tier) => {
      const qty = Number(tier?.qty);
      const price = Number(tier?.price);
      const unit = String(tier?.unit || "").trim();
      if (!Number.isFinite(qty) || qty <= 0 || !unit) return null;
      if (!Number.isFinite(price) || price <= 0) return null;
      return [qty, unit, price];
    })
    .filter(Boolean);
}

export function createHeroSupportRecordPricing(record = {}) {
  if (!record?.name || !record?.supplierName) return null;
  const tiers = normalizeSupportPriceTiers(record.priceTiers);
  const hasReviewedPrices = tiers.length > 0;
  return {
    [record.supplierName]: {
      url: record.sourceUrl || null,
      S: tiers,
      inStock: hasReviewedPrices,
      linkStatus: "primary_listing",
      sourceProductTitle: record.sourceProductTitle || null,
      sourceConfidence:
        record.priceSourceConfidence ||
        record.sourceConfidence ||
        "reviewed_supplier_product",
      priceSourceUpdatedAt: record.priceSourceUpdatedAt || null,
      priceReviewStatus: hasReviewedPrices
        ? "reviewed_current_price_tiers"
        : "current_price_needed",
      supportNote: hasReviewedPrices
        ? "Reviewed supplier price tiers from the confirmed source product page."
        : "Source-backed supplier product. Current size/price tiers are still needed, so this row should remain a pricing caveat.",
    },
  };
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

function createAccordPricing(accord = {}, pricing = {}) {
  const recipe = getHeroFormulaAccordRecipe(accord.name);
  if (!recipe) {
    return {
      [BENCH_ACCORD_SUPPLIER_NAME]: {
        url: null,
        S: [],
        inStock: false,
        pricingMode: ACCORD_RECIPE_PRICING_MODE,
        linkStatus: "accord_recipe_missing",
        componentPricingStatus: "missing_recipe",
        supportNote:
          "No component recipe is available for this formula-level accord. It is intentionally unpriced rather than treated as $0.",
      },
    };
  }

  const recipeCost = buildAccordRecipeCost(recipe, pricing);
  if (recipeCost.status !== "complete" || !recipeCost.unitCostPerG) {
    return {
      [BENCH_ACCORD_SUPPLIER_NAME]: {
        url: null,
        S: [],
        inStock: false,
        pricingMode: ACCORD_RECIPE_PRICING_MODE,
        linkStatus: "accord_component_pricing_incomplete",
        recipeName: recipe.name,
        recipeStatus: recipe.recipeStatus || "known",
        componentPricingStatus: "incomplete",
        missingComponents: recipeCost.missingComponents,
        componentCosts: recipeCost.componentCosts,
        supportNote:
          "Component-derived accord costing is incomplete because one or more recipe components lack usable gram-based pricing.",
      },
    };
  }

  return {
    [BENCH_ACCORD_SUPPLIER_NAME]: {
      url: null,
      pricingMode: UNIT_COST_PRICING_MODE,
      costingMode: ACCORD_RECIPE_PRICING_MODE,
      linkStatus: "component_derived_accord",
      recipeName: recipe.name,
      recipeStatus: recipe.recipeStatus || "known",
      recipeTotalAmount: recipe.totalAmount,
      recipeUnit: recipe.unit || "g",
      unitCostPerG: recipeCost.unitCostPerG,
      componentPricingStatus: "complete",
      componentCosts: recipeCost.componentCosts,
      missingComponents: [],
      S: [
        [1, "g", recipeCost.unitCostPerG],
        [10, "g", roundCost(recipeCost.unitCostPerG * 10)],
        [100, "g", roundCost(recipeCost.unitCostPerG * 100)],
      ],
      inStock: true,
      supportNote:
        "Component-derived accord pricing from the reviewed hero formula accord recipe. Formula rows remain single accord rows.",
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

  for (const record of HERO_FORMULA_MATERIAL_SUPPORT.supportRecords || []) {
    if (pricing[record.name]) continue;
    const recordPricing = createHeroSupportRecordPricing(record);
    if (!recordPricing) continue;
    supportPricing[record.name] = recordPricing;
  }

  const combinedPricing = { ...pricing, ...supportPricing };
  for (const alias of HERO_FORMULA_MATERIAL_SUPPORT.aliases || []) {
    if (combinedPricing[alias.name]) continue;
    const targetPricing = combinedPricing[alias.targetName];
    if (!targetPricing) continue;
    supportPricing[alias.name] = cloneJsonValue(targetPricing);
    combinedPricing[alias.name] = supportPricing[alias.name];
  }

  for (const accord of HERO_FORMULA_MATERIAL_SUPPORT.accords || []) {
    if (combinedPricing[accord.name]) continue;
    supportPricing[accord.name] = createAccordPricing(accord, combinedPricing);
    combinedPricing[accord.name] = supportPricing[accord.name];
  }

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
  const recipe = getHeroFormulaAccordRecipe(accord.name);
  return {
    entryKind: "accord",
    canonicalMaterialKey: accord.canonicalMaterialKey,
    supplierLinks: {
      [BENCH_ACCORD_SUPPLIER_NAME]: {
        status: recipe ? "component_derived_accord" : "accord_listing",
        note:
          recipe
            ? "Formula-level accord support row with component-derived pricing. Do not expand inside active formulas."
            : "Formula-level black-box accord support row. Do not expand until the accord recipe is explicitly supplied.",
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
  const isAccordAlias = alias.entryKind === "accord";
  return {
    entryKind: isDilutedAlias
      ? "diluted_stock"
      : isAccordAlias
      ? "accord"
      : "supplier_product",
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
