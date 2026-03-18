import {
  IFRA_CATEGORY_LABELS,
  getIfraMaterialRecord,
  getMaterialNormalizationEntry,
  getSourceDocumentsForCanonicalMaterialKey,
  getEvidenceCandidatesForCanonicalMaterialKey,
  getSupplierProductsForCatalogName,
  getSupplierProductsForCanonicalMaterialKey,
  resolveIngredientIdentity,
} from "./ifra_combined_package.js";
import {
  FORMULA_NOTE_ORDER,
  formatHumanList,
  getFormulaDisplayLabel,
  pushUniqueItem,
  sortFormulaIngredients,
} from "./formula_runtime_helpers.js";

export const SUPPLIER_BASKET_MODE_META = {
  cheapest: {
    label: "Cheapest",
    title: "Cheapest Basket",
    color: "#34D399",
    description:
      "Lowest immediate line spend per ingredient using current live pricing.",
  },
  best_value: {
    label: "Best Value",
    title: "Best-Value Basket",
    color: "#7DD3FC",
    description:
      "Prefers the lowest unit-cost pack among reasonably sized purchase tiers, then falls back to cheapest coverage.",
  },
  best_quality: {
    label: "Best Quality",
    title: "Best-Quality Basket",
    color: "#F59E0B",
    description:
      "Heuristic: favors preferred or registry-backed supplier ownership first, then cheapest coverage within that supplier.",
  },
};

export const SUPPLIER_BASKET_MODE_ORDER = Object.keys(
  SUPPLIER_BASKET_MODE_META
);

const SUPPLIER_BASKET_VALUE_MAX_COVERAGE_MULTIPLE = 3;
const BATCH_PLANNER_SHORTAGE_TOLERANCE = 0.0001;
export const PERFORMANCE_FIXATIVE_NAMES = [
  "Benzyl Salicylate",
  "Hexyl Cinnamic Aldehyde",
  "Habanolide",
  "Helvetolide",
  "Ethylene Brassylate",
  "Benzoin Siam Absolute",
  "Labdanum Absolute 10%",
  "Coumarin",
  "Benzyl Benzoate",
  "Oakmoss Absolute",
];
const PERFORMANCE_FRESH_CLASSES = new Set([
  "Citrus",
  "Green",
  "Marine",
  "Aromatic",
  "Floral",
]);
const PERFORMANCE_DENSE_CLASSES = new Set([
  "Amber",
  "Woody",
  "Oriental",
  "Musk",
  "Chypre",
  "Gourmand",
  "Spice",
]);
const SUPPLIER_LINK_NEGATIVE_STATUSES = new Set([
  "linked_duplicate",
  "cross_wired_listing",
  "dead_url",
  "accord_listing",
]);

export const CRITIQUE_LENS_META = {
  perfumer: {
    label: "Perfumer",
    color: "#F472B6",
    description: "Balance, movement, and sensory polish.",
  },
  chemist: {
    label: "Chemist",
    color: "#7DD3FC",
    description: "Volatility structure, data confidence, and material behavior.",
  },
  cost: {
    label: "Cost",
    color: "#34D399",
    description: "Spend concentration, supplier confidence, and sourcing tradeoffs.",
  },
  compliance: {
    label: "Compliance",
    color: "#F59E0B",
    description: "IFRA exposure, restrictions, and reformulation risk.",
  },
  brand: {
    label: "Brand",
    color: "#A78BFA",
    description: "Distinctiveness, coherence, and signature story.",
  },
};

export const CRITIQUE_LENS_ORDER = Object.keys(CRITIQUE_LENS_META);

function getDbNote(db, ingredientName, fallback = "mid") {
  return db?.[ingredientName]?.note || fallback;
}

export function getLivePricingForIngredient(
  name,
  pricesState,
  pricing = {}
) {
  return pricesState?.[name] || pricing[name] || {};
}

function getSupplierMappingAssessment(
  ingredientName,
  supplierName,
  supplierData,
  { db = {} } = {}
) {
  const dbRecord = db[ingredientName] || {};
  const registryConfirmed = getSupplierProductsForCatalogName(
    ingredientName
  ).some((record) => record?.supplierDisplayName === supplierName);
  const linkStatus = supplierData?.linkStatus || "primary_listing";
  const linkNote = supplierData?.linkNote || null;
  const linkedDuplicateOfCatalogName =
    supplierData?.linkedDuplicateOfCatalogName || null;
  let qualityScore = 0;
  const reasons = [];

  if (dbRecord.supplier === supplierName) {
    qualityScore += 4;
    reasons.push("Matches the current live preferred supplier.");
  }
  if (registryConfirmed) {
    qualityScore += 4;
    reasons.push("Supplier ownership is confirmed in the supplier registry.");
  }
  if (linkStatus === "primary_listing") {
    qualityScore += 3;
    reasons.push("Normalization marks this as a primary supplier listing.");
  } else if (linkStatus === "supplier_grade_variant") {
    qualityScore += 2;
    reasons.push("Normalization recognizes this supplier grade variant.");
  } else if (linkStatus === "linked_duplicate") {
    qualityScore -= 3;
    reasons.push("Normalization marks this row as a linked duplicate.");
  } else if (linkStatus === "cross_wired_listing") {
    qualityScore -= 5;
    reasons.push("Normalization flags a cross-wired supplier listing.");
  } else if (linkStatus === "dead_url") {
    qualityScore -= 4;
    reasons.push("Normalization flags this supplier URL as dead.");
  } else if (linkStatus === "accord_listing") {
    qualityScore -= 2;
    reasons.push("Normalization treats this supplier row as an accord listing.");
  }
  if (supplierData?.url) {
    qualityScore += 1;
  }

  let mappingConfidence = "inferred";
  if (registryConfirmed || linkStatus === "primary_listing") {
    mappingConfidence = "confirmed";
  } else if (SUPPLIER_LINK_NEGATIVE_STATUSES.has(linkStatus)) {
    mappingConfidence = "uncertain";
  }

  const detailParts = [];
  if (registryConfirmed) detailParts.push("Registry-backed ownership.");
  if (dbRecord.supplier === supplierName) {
    detailParts.push("Matches live preferred supplier.");
  }
  if (linkedDuplicateOfCatalogName) {
    detailParts.push(`Linked duplicate of "${linkedDuplicateOfCatalogName}".`);
  }
  if (linkNote) detailParts.push(linkNote);

  return {
    qualityScore,
    mappingConfidence,
    registryConfirmed,
    linkStatus,
    linkNote,
    linkedDuplicateOfCatalogName,
    confidenceNote: detailParts.join(" "),
    qualityNote: reasons.join(" "),
  };
}

function buildSupplierPurchaseCandidates(
  ingredient,
  supplierName,
  supplierData,
  { db = {} } = {}
) {
  const needG = Number(ingredient.g) || 0;
  const d = db[ingredient.name];
  const density = d?.density || d?.densityGmL || 1.0;
  if (!Array.isArray(supplierData?.S) || supplierData.S.length === 0) {
    return [];
  }

  return supplierData.S
    .map(([qty, unit, price]) => {
      const grams = unit === "mL" ? qty * density : qty;
      if (!Number.isFinite(grams) || grams <= 0 || !Number.isFinite(price)) {
        return null;
      }
      const multi = grams >= needG ? 1 : Math.max(1, Math.ceil(needG / grams));
      const totalPurchasedG = grams * multi;
      const lineCost = price * multi;
      return {
        supplier: supplierName,
        qty,
        unit,
        price,
        grams,
        multi,
        totalPurchasedG,
        lineCost,
        remaining: Math.max(0, totalPurchasedG - needG),
        pricePerPurchasedGram: price / grams,
      };
    })
    .filter(Boolean);
}

function selectCheapestPurchaseCandidate(candidates = []) {
  return (
    [...candidates].sort((a, b) => {
      if (a.lineCost !== b.lineCost) return a.lineCost - b.lineCost;
      if (a.remaining !== b.remaining) return a.remaining - b.remaining;
      return a.pricePerPurchasedGram - b.pricePerPurchasedGram;
    })[0] || null
  );
}

function selectBestValuePurchaseCandidate(candidates = []) {
  if (!candidates.length) return null;
  const needG = Math.max(
    candidates[0]?.totalPurchasedG - candidates[0]?.remaining || 0,
    0.0001
  );
  const pool = candidates.filter(
    (candidate) =>
      candidate.totalPurchasedG <=
      needG * SUPPLIER_BASKET_VALUE_MAX_COVERAGE_MULTIPLE + 0.0001
  );
  const rankedPool = (pool.length ? pool : candidates).slice();
  return (
    rankedPool.sort((a, b) => {
      if (a.pricePerPurchasedGram !== b.pricePerPurchasedGram) {
        return a.pricePerPurchasedGram - b.pricePerPurchasedGram;
      }
      if (a.lineCost !== b.lineCost) return a.lineCost - b.lineCost;
      return a.remaining - b.remaining;
    })[0] || null
  );
}

function buildIngredientSupplierOptions(
  ingredient,
  pricesState,
  supplierOverrides = {},
  { db = {}, pricing = {} } = {}
) {
  const pricingState = getLivePricingForIngredient(
    ingredient.name,
    pricesState,
    pricing
  );
  const overrideSupplier = supplierOverrides[ingredient.name] || null;
  const supplierNames = overrideSupplier
    ? [overrideSupplier]
    : Object.keys(pricingState);

  const supplierOptions = supplierNames.map((supplierName) => {
    const supplierData = pricingState[supplierName] || null;
    const assessment = getSupplierMappingAssessment(
      ingredient.name,
      supplierName,
      supplierData,
      { db }
    );
    const candidates = buildSupplierPurchaseCandidates(
      ingredient,
      supplierName,
      supplierData,
      { db }
    );
    return {
      supplier: supplierName,
      supplierData,
      assessment,
      candidates,
      cheapestCandidate: selectCheapestPurchaseCandidate(candidates),
      bestValueCandidate: selectBestValuePurchaseCandidate(candidates),
      forcedByOverride: Boolean(overrideSupplier),
      isMissingPricing:
        !supplierData ||
        !Array.isArray(supplierData.S) ||
        supplierData.S.length === 0,
    };
  });

  return {
    ingredient,
    overrideSupplier,
    supplierOptions,
    availableOptions: supplierOptions.filter(
      (option) => option.candidates.length > 0
    ),
  };
}

function getBasketConfidenceRank(mappingConfidence) {
  if (mappingConfidence === "confirmed") return 3;
  if (mappingConfidence === "inferred") return 2;
  if (mappingConfidence === "uncertain") return 1;
  return 0;
}

function selectIngredientBasketLine(
  ingredient,
  pricesState,
  supplierOverrides = {},
  mode = "cheapest",
  runtime = {}
) {
  const optionState = buildIngredientSupplierOptions(
    ingredient,
    pricesState,
    supplierOverrides,
    runtime
  );
  const { overrideSupplier, supplierOptions, availableOptions } = optionState;
  const requestedMode = SUPPLIER_BASKET_MODE_META[mode] ? mode : "cheapest";

  if (!availableOptions.length) {
    const missingOption = supplierOptions[0] || null;
    const missingReason = overrideSupplier
      ? `Supplier override "${overrideSupplier}" has no saved size/price data.`
      : "No supplier size/price data is currently stored.";
    return {
      ingredientName: ingredient.name,
      needG: Number(ingredient.g) || 0,
      note: ingredient.note,
      supplier: overrideSupplier || missingOption?.supplier || null,
      lineCost: null,
      buyText: "—",
      remaining: null,
      mappingConfidence: "missing",
      confidenceNote:
        missingOption?.assessment?.confidenceNote || missingReason,
      qualityNote: missingOption?.assessment?.qualityNote || "",
      forcedByOverride: Boolean(overrideSupplier),
      status: "missing",
      missingReason,
      linkStatus: missingOption?.assessment?.linkStatus || null,
      registryConfirmed: missingOption?.assessment?.registryConfirmed || false,
      linkedDuplicateOfCatalogName:
        missingOption?.assessment?.linkedDuplicateOfCatalogName || null,
      line: null,
    };
  }

  const selectedOption = (() => {
    if (overrideSupplier) {
      return availableOptions[0];
    }
    if (requestedMode === "cheapest") {
      return [...availableOptions].sort((a, b) => {
        const aCandidate = a.cheapestCandidate;
        const bCandidate = b.cheapestCandidate;
        if (aCandidate.lineCost !== bCandidate.lineCost) {
          return aCandidate.lineCost - bCandidate.lineCost;
        }
        if (aCandidate.remaining !== bCandidate.remaining) {
          return aCandidate.remaining - bCandidate.remaining;
        }
        return (
          aCandidate.pricePerPurchasedGram - bCandidate.pricePerPurchasedGram
        );
      })[0];
    }
    if (requestedMode === "best_value") {
      return [...availableOptions].sort((a, b) => {
        const aCandidate = a.bestValueCandidate || a.cheapestCandidate;
        const bCandidate = b.bestValueCandidate || b.cheapestCandidate;
        if (
          aCandidate.pricePerPurchasedGram !== bCandidate.pricePerPurchasedGram
        ) {
          return (
            aCandidate.pricePerPurchasedGram - bCandidate.pricePerPurchasedGram
          );
        }
        if (aCandidate.lineCost !== bCandidate.lineCost) {
          return aCandidate.lineCost - bCandidate.lineCost;
        }
        return aCandidate.remaining - bCandidate.remaining;
      })[0];
    }
    return [...availableOptions].sort((a, b) => {
      if (a.assessment.qualityScore !== b.assessment.qualityScore) {
        return b.assessment.qualityScore - a.assessment.qualityScore;
      }
      const confidenceDelta =
        getBasketConfidenceRank(b.assessment.mappingConfidence) -
        getBasketConfidenceRank(a.assessment.mappingConfidence);
      if (confidenceDelta !== 0) return confidenceDelta;
      return a.cheapestCandidate.lineCost - b.cheapestCandidate.lineCost;
    })[0];
  })();

  const line =
    requestedMode === "best_value"
      ? selectedOption.bestValueCandidate || selectedOption.cheapestCandidate
      : selectedOption.cheapestCandidate;

  return {
    ingredientName: ingredient.name,
    needG: Number(ingredient.g) || 0,
    note: ingredient.note,
    supplier: selectedOption.supplier,
    lineCost: line.lineCost,
    buyText: `${line.qty}${line.unit}${line.multi > 1 ? ` ×${line.multi}` : ""}`,
    remaining: line.remaining,
    mappingConfidence: selectedOption.assessment.mappingConfidence,
    confidenceNote: selectedOption.assessment.confidenceNote,
    qualityNote: selectedOption.assessment.qualityNote,
    forcedByOverride: selectedOption.forcedByOverride,
    status:
      selectedOption.assessment.mappingConfidence === "uncertain"
        ? "uncertain"
        : selectedOption.assessment.mappingConfidence,
    missingReason: null,
    linkStatus: selectedOption.assessment.linkStatus,
    registryConfirmed: selectedOption.assessment.registryConfirmed,
    linkedDuplicateOfCatalogName:
      selectedOption.assessment.linkedDuplicateOfCatalogName,
    line,
  };
}

export function buildSupplierBasket(
  ingredients,
  pricesState,
  supplierOverrides = {},
  mode = "cheapest",
  runtime = {}
) {
  const lines = ingredients.map((ingredient) =>
    selectIngredientBasketLine(
      ingredient,
      pricesState,
      supplierOverrides,
      mode,
      runtime
    )
  );
  const totalCost = lines.reduce((sum, line) => sum + (line.lineCost || 0), 0);
  const suppliersInUse = Array.from(
    new Set(lines.map((line) => line.supplier).filter(Boolean))
  );
  return {
    mode,
    meta: SUPPLIER_BASKET_MODE_META[mode] || SUPPLIER_BASKET_MODE_META.cheapest,
    lines,
    totalCost,
    missingCount: lines.filter((line) => line.status === "missing").length,
    uncertainCount: lines.filter((line) => line.status === "uncertain").length,
    inferredCount: lines.filter((line) => line.status === "inferred").length,
    confirmedCount: lines.filter((line) => line.status === "confirmed").length,
    supplierCount: suppliersInUse.length,
    suppliersInUse,
  };
}

export function buildSupplierBasketStrategies(
  ingredients,
  pricesState,
  supplierOverrides = {},
  runtime = {}
) {
  return Object.fromEntries(
    SUPPLIER_BASKET_MODE_ORDER.map((mode) => [
      mode,
      buildSupplierBasket(ingredients, pricesState, supplierOverrides, mode, runtime),
    ])
  );
}

export function buildBatchPlannerReport({
  ingredients = [],
  targetBatchG = 0,
  inventory = {},
  pricesState,
  supplierOverrides = {},
  basketMode = "cheapest",
  db = {},
  pricing = {},
}) {
  const normalizedIngredients = Array.isArray(ingredients)
    ? ingredients
        .map((ingredient) => ({
          ...ingredient,
          g: Number(ingredient?.g) || 0,
          note: ingredient?.note || getDbNote(db, ingredient?.name),
        }))
        .filter((ingredient) => ingredient.name && ingredient.g > 0)
    : [];
  const sourceTotalG = normalizedIngredients.reduce(
    (sum, ingredient) => sum + ingredient.g,
    0
  );
  const normalizedTargetBatchG = Math.max(0, Number(targetBatchG) || 0);

  if (sourceTotalG <= 0 || normalizedTargetBatchG <= 0) {
    return {
      sourceTotalG,
      targetBatchG: normalizedTargetBatchG,
      totalRequiredG: 0,
      lines: [],
      blockingMaterials: [],
      constrainingMaterials: [],
      shortageBasket: null,
      shortageCount: 0,
      shortageTotalG: 0,
      canFulfill: false,
      maxProducibleG: 0,
      coveragePercent: 0,
    };
  }

  const lines = normalizedIngredients
    .map((ingredient) => {
      const proportion = ingredient.g / sourceTotalG;
      const requiredG = proportion * normalizedTargetBatchG;
      const onHand = Math.max(0, Number(inventory?.[ingredient.name]?.qty) || 0);
      const shortageG = Math.max(0, requiredG - onHand);
      const remainingG = Math.max(0, onHand - requiredG);
      const maxProducibleG =
        proportion > 0 ? onHand / proportion : Number.POSITIVE_INFINITY;
      return {
        name: ingredient.name,
        note: ingredient.note,
        sourceG: ingredient.g,
        proportion,
        requiredG,
        onHand,
        shortageG,
        remainingG,
        isBlocked: shortageG > BATCH_PLANNER_SHORTAGE_TOLERANCE,
        maxProducibleG,
      };
    })
    .sort((a, b) => b.requiredG - a.requiredG);

  const blockingMaterials = lines
    .filter((line) => line.isBlocked)
    .sort((a, b) => {
      if (b.shortageG !== a.shortageG) return b.shortageG - a.shortageG;
      return a.maxProducibleG - b.maxProducibleG;
    });
  const constrainingMaterials = [...lines].sort((a, b) => {
    if (a.maxProducibleG !== b.maxProducibleG) {
      return a.maxProducibleG - b.maxProducibleG;
    }
    return b.requiredG - a.requiredG;
  });
  const shortageIngredients = blockingMaterials.map((line) => ({
    name: line.name,
    note: line.note,
    g: line.shortageG,
  }));
  const shortageBasket = shortageIngredients.length
    ? buildSupplierBasket(
        shortageIngredients,
        pricesState,
        supplierOverrides,
        basketMode,
        { db, pricing }
      )
    : null;
  const finiteMaxBatchValues = lines
    .map((line) => line.maxProducibleG)
    .filter((value) => Number.isFinite(value));
  const maxProducibleG = finiteMaxBatchValues.length
    ? Math.max(0, Math.min(...finiteMaxBatchValues))
    : 0;

  return {
    sourceTotalG,
    targetBatchG: normalizedTargetBatchG,
    totalRequiredG: lines.reduce((sum, line) => sum + line.requiredG, 0),
    lines,
    blockingMaterials,
    constrainingMaterials,
    shortageBasket,
    shortageCount: blockingMaterials.length,
    shortageTotalG: blockingMaterials.reduce(
      (sum, line) => sum + line.shortageG,
      0
    ),
    canFulfill: blockingMaterials.length === 0,
    maxProducibleG,
    coveragePercent:
      normalizedTargetBatchG > 0
        ? Math.max(0, (maxProducibleG / normalizedTargetBatchG) * 100)
        : 0,
  };
}

export function buildFormulaProcurementRows(
  ingredients,
  pricesState,
  supplierOverrides = {},
  runtime = {}
) {
  const total = ingredients.reduce((sum, ingredient) => sum + ingredient.g, 0);
  const cheapestBasket = buildSupplierBasket(
    ingredients,
    pricesState,
    supplierOverrides,
    "cheapest",
    runtime
  );
  const rows = cheapestBasket.lines.map((line, index) => {
    const ing = ingredients[index];
    return {
      ...ing,
      best: line.line
        ? {
            qty: line.line.qty,
            unit: line.line.unit,
            price: line.line.price,
            g: line.line.grams,
            sup: line.supplier,
            url:
              getLivePricingForIngredient(
                ing.name,
                pricesState,
                runtime.pricing
              )[line.supplier]?.url || "",
            multi: line.line.multi,
          }
        : null,
      cost: line.lineCost,
      pct: total > 0 ? ((ing.g / total) * 100).toFixed(1) : "0.0",
    };
  });
  return { total, grandTotal: cheapestBasket.totalCost, rows };
}

export function getFormulaCompareIngredientKey(name) {
  const normalizationEntry = getMaterialNormalizationEntry(name);
  const identity = resolveIngredientIdentity(name);
  return (
    normalizationEntry?.canonicalMaterialKey ||
    identity?.normalizationEntry?.canonicalMaterialKey ||
    identity?.resolvedIfraMaterial ||
    String(name || "").trim().toLowerCase()
  );
}

export function buildFormulaIngredientSummaryMap(ingredients = []) {
  const summaryMap = new Map();
  ingredients.forEach((ingredient) => {
    const key = getFormulaCompareIngredientKey(ingredient.name);
    const existing = summaryMap.get(key);
    const nextNames = new Set(existing?.names || []);
    nextNames.add(ingredient.name);
    const nextNotes = new Set(existing?.notes || []);
    nextNotes.add(ingredient.note || "mid");
    summaryMap.set(key, {
      key,
      primaryName: existing?.primaryName || ingredient.name,
      names: Array.from(nextNames),
      notes: Array.from(nextNotes).sort(
        (a, b) =>
          (FORMULA_NOTE_ORDER[a] ?? 2) - (FORMULA_NOTE_ORDER[b] ?? 2)
      ),
      totalG: (existing?.totalG || 0) + (Number(ingredient.g) || 0),
    });
  });
  return summaryMap;
}

export function summarizeComputedChemistry(chem = []) {
  const topContributor = [...chem].sort(
    (a, b) => (b.intensity || 0) - (a.intensity || 0)
  )[0];
  return {
    totalIntensity: chem.reduce((sum, ingredient) => sum + (ingredient.intensity || 0), 0),
    totalOV: chem.reduce((sum, ingredient) => sum + (ingredient.OV || 0), 0),
    weightedXLogP: chem.reduce(
      (sum, ingredient) => sum + (ingredient.wfrac || 0) * (ingredient.d?.xLogP || 0),
      0
    ),
    weightedVP: chem.reduce(
      (sum, ingredient) => sum + (ingredient.wfrac || 0) * (ingredient.d?.VP || 0),
      0
    ),
    topContributor: topContributor?.name || "—",
  };
}

export function summarizeFormulaChemistry(
  ingredients = [],
  { computeChemistry } = {}
) {
  return summarizeComputedChemistry(computeChemistry(ingredients));
}

function clampPerformanceModelScore(value, min = 0, max = 10) {
  return Math.max(min, Math.min(max, value));
}

function getPerformanceModelBand(
  score,
  {
    low = 3.5,
    high = 7,
    labels = { low: "Low", mid: "Moderate", high: "High" },
  } = {}
) {
  if (score >= high) return labels.high;
  if (score <= low) return labels.low;
  return labels.mid;
}

export function buildPerformanceModelSummary(ingredients = [], options = {}) {
  const {
    db = {},
    computeChemistry,
    perfScore,
  } = options;
  const activeIngredients = Array.isArray(ingredients)
    ? ingredients
        .map((ingredient) => ({
          ...ingredient,
          g: Number(ingredient?.g) || 0,
          note: ingredient?.note || getDbNote(db, ingredient?.name),
        }))
        .filter((ingredient) => ingredient.name && ingredient.g > 0)
    : [];

  if (!activeIngredients.length) {
    return {
      headline: "Add ingredients to see a model-based performance read.",
      estimateNote:
        "Estimate only — this layer translates the current chemistry and score heuristics into plain English.",
      caveats: [],
      facets: [],
      axisScores: {},
    };
  }

  const chemistry = options.chemistry || computeChemistry(activeIngredients);
  const performance = options.performance || perfScore(activeIngredients);
  const chemistrySummary =
    options.chemistrySummary || summarizeComputedChemistry(chemistry);
  const totalG =
    activeIngredients.reduce((sum, ingredient) => sum + ingredient.g, 0) || 1;
  const noteWeight = {
    top:
      activeIngredients
        .filter((ingredient) => ingredient.note === "top")
        .reduce((sum, ingredient) => sum + ingredient.g, 0) / totalG,
    mid:
      activeIngredients
        .filter((ingredient) => ingredient.note === "mid")
        .reduce((sum, ingredient) => sum + ingredient.g, 0) / totalG,
    base:
      activeIngredients
        .filter((ingredient) => ingredient.note === "base")
        .reduce((sum, ingredient) => sum + ingredient.g, 0) / totalG,
    carrier:
      activeIngredients
        .filter((ingredient) => ingredient.note === "carrier")
        .reduce((sum, ingredient) => sum + ingredient.g, 0) / totalG,
  };
  const totalIntensity =
    chemistry.reduce((sum, ingredient) => sum + (ingredient.intensity || 0), 0) ||
    0;
  const noteIntensity = {
    top: chemistry
      .filter((ingredient) => ingredient.note === "top")
      .reduce((sum, ingredient) => sum + (ingredient.intensity || 0), 0),
    mid: chemistry
      .filter((ingredient) => ingredient.note === "mid")
      .reduce((sum, ingredient) => sum + (ingredient.intensity || 0), 0),
    base: chemistry
      .filter((ingredient) => ingredient.note === "base")
      .reduce((sum, ingredient) => sum + (ingredient.intensity || 0), 0),
    carrier: chemistry
      .filter((ingredient) => ingredient.note === "carrier")
      .reduce((sum, ingredient) => sum + (ingredient.intensity || 0), 0),
  };
  const noteIntensityShare = {
    top: totalIntensity > 0 ? noteIntensity.top / totalIntensity : noteWeight.top,
    mid: totalIntensity > 0 ? noteIntensity.mid / totalIntensity : noteWeight.mid,
    base:
      totalIntensity > 0 ? noteIntensity.base / totalIntensity : noteWeight.base,
  };
  const freshClassPct =
    activeIngredients
      .filter((ingredient) =>
        PERFORMANCE_FRESH_CLASSES.has(db[ingredient.name]?.scentClass)
      )
      .reduce((sum, ingredient) => sum + ingredient.g, 0) / totalG;
  const denseClassPct =
    activeIngredients
      .filter((ingredient) =>
        PERFORMANCE_DENSE_CLASSES.has(db[ingredient.name]?.scentClass)
      )
      .reduce((sum, ingredient) => sum + ingredient.g, 0) / totalG;
  const fixativePct =
    activeIngredients
      .filter((ingredient) => PERFORMANCE_FIXATIVE_NAMES.includes(ingredient.name))
      .reduce((sum, ingredient) => sum + ingredient.g, 0) / totalG;
  const highImpactMaterials = chemistry.filter((ingredient) => (ingredient.OV || 0) > 1);
  const crowdedFamilies = Object.entries(
    highImpactMaterials.reduce((acc, ingredient) => {
      const family = ingredient.d?.scentClass || "Other";
      if (!acc[family]) acc[family] = [];
      acc[family].push(ingredient);
      return acc;
    }, {})
  )
    .map(([family, members]) => ({
      family,
      count: members.length,
      share:
        totalIntensity > 0
          ? members.reduce(
              (sum, ingredient) => sum + (ingredient.intensity || 0),
              0
            ) / totalIntensity
          : 0,
    }))
    .filter((family) => family.count >= 3 || family.share >= 0.35)
    .sort((a, b) => {
      if (b.share !== a.share) return b.share - a.share;
      return b.count - a.count;
    });
  const dominantNoteLayer =
    Object.entries({
      opening: noteWeight.top,
      heart: noteWeight.mid,
      drydown: noteWeight.base,
    }).sort((a, b) => b[1] - a[1])[0]?.[0] || "heart";
  const unknownIngredientCount = chemistry.filter((ingredient) => !ingredient.d).length;

  const axisScores = {
    openingImpact: clampPerformanceModelScore(
      performance.projection * 0.55 +
        noteWeight.top * 3.25 +
        noteIntensityShare.top * 3.25
    ),
    liftFreshness: clampPerformanceModelScore(
      noteWeight.top * 3 +
        freshClassPct * 4.8 +
        Math.min(performance.projection, 6) * 0.35
    ),
    densityHeaviness: clampPerformanceModelScore(
      noteWeight.base * 4 +
        denseClassPct * 2.5 +
        Math.min(chemistrySummary.weightedXLogP || 0, 5) * 0.7 +
        fixativePct * 5
    ),
    drydownPersistence: clampPerformanceModelScore(
      performance.longevity * 0.8 + noteWeight.base * 2 + fixativePct * 5
    ),
    likelyProjection: clampPerformanceModelScore(
      performance.projection * 0.65 + performance.sillage * 0.35
    ),
    clutterImbalance: clampPerformanceModelScore(
      crowdedFamilies.length * 2.4 +
        Math.max(0, highImpactMaterials.length - 6) * 0.45 +
        (Math.max(noteWeight.top, noteWeight.mid, noteWeight.base) > 0.62
          ? 1.4
          : 0) +
        (crowdedFamilies[0]?.share || 0) * 3
    ),
    bridgeWeakness: clampPerformanceModelScore(
      (noteWeight.mid < 0.18 ? 4 : 0) +
        (noteIntensityShare.mid < 0.16 ? 3 : 0) +
        (noteWeight.top > 0.24 && noteWeight.base > 0.28 ? 2 : 0)
    ),
  };

  const openingBand = getPerformanceModelBand(axisScores.openingImpact, {
    labels: { low: "Soft", mid: "Moderate", high: "Strong" },
  });
  const liftBand = getPerformanceModelBand(axisScores.liftFreshness, {
    labels: { low: "Grounded", mid: "Balanced", high: "Fresh" },
  });
  const densityBand = getPerformanceModelBand(axisScores.densityHeaviness, {
    labels: { low: "Light", mid: "Moderate", high: "Dense" },
  });
  const drydownBand = getPerformanceModelBand(axisScores.drydownPersistence, {
    labels: { low: "Short", mid: "Steady", high: "Persistent" },
  });
  const projectionBand = getPerformanceModelBand(axisScores.likelyProjection, {
    labels: { low: "Intimate", mid: "Noticeable", high: "Expansive" },
  });
  const clutterBand = getPerformanceModelBand(axisScores.clutterImbalance, {
    low: 2.5,
    high: 6,
    labels: { low: "Low", mid: "Watch", high: "Elevated" },
  });
  const bridgeBand = getPerformanceModelBand(axisScores.bridgeWeakness, {
    low: 2.5,
    high: 6,
    labels: { low: "Solid", mid: "Watch", high: "Possible gap" },
  });

  const headlineParts = [];
  if (axisScores.openingImpact >= 7) headlineParts.push("a lively opening");
  else if (axisScores.openingImpact <= 3.5) {
    headlineParts.push("a restrained opening");
  } else {
    headlineParts.push("a measured opening");
  }
  if (axisScores.drydownPersistence >= 7) {
    headlineParts.push("a fairly persistent drydown");
  } else if (axisScores.drydownPersistence <= 3.5) {
    headlineParts.push("a shorter drydown");
  } else {
    headlineParts.push("a steady drydown");
  }
  if (axisScores.likelyProjection >= 7) {
    headlineParts.push("noticeable projection");
  } else if (axisScores.likelyProjection <= 3.5) {
    headlineParts.push("an intimate scent cloud");
  } else {
    headlineParts.push("moderate projection");
  }

  const caveats = [];
  if (unknownIngredientCount > 0) {
    caveats.push(
      `${unknownIngredientCount} ingredient${
        unknownIngredientCount === 1 ? "" : "s"
      } lack full chemistry data, so this read is rougher than usual.`
    );
  }
  if (chemistry.filter((ingredient) => ingredient.isUVCB).length > 0) {
    caveats.push(
      "Some naturals/UVCB materials are treated more coarsely in the current model."
    );
  }

  return {
    headline: `Model read: ${headlineParts.join(", ")}.`,
    estimateNote:
      "Estimate only — this summary translates the current chemistry and score heuristics into plain English, not guaranteed wear behavior.",
    caveats,
    axisScores,
    facets: [
      {
        key: "openingImpact",
        label: "Opening impact",
        rating: openingBand,
        tone:
          axisScores.openingImpact >= 7
            ? "warm"
            : axisScores.openingImpact <= 3.5
            ? "muted"
            : "accent",
        detail:
          axisScores.openingImpact >= 7
            ? "Top-note weight and the current projection model suggest a fairly assertive first impression."
            : axisScores.openingImpact <= 3.5
            ? "The opening reads restrained in the current model rather than sharp or explosive."
            : "The opening should register clearly without reading especially forceful.",
      },
      {
        key: "liftFreshness",
        label: "Lift / freshness",
        rating: liftBand,
        tone:
          axisScores.liftFreshness >= 7
            ? "positive"
            : axisScores.liftFreshness <= 3.5
            ? "muted"
            : "accent",
        detail:
          axisScores.liftFreshness >= 7
            ? "Top-heavy weight plus fresher material classes suggest a bright, lifted feel."
            : axisScores.liftFreshness <= 3.5
            ? "The balance leans more grounded than sparkling; freshness signals look modest."
            : "There is some lift, but the model does not read this as especially airy.",
      },
      {
        key: "densityHeaviness",
        label: "Density / heaviness",
        rating: densityBand,
        tone:
          axisScores.densityHeaviness >= 7
            ? "cool"
            : axisScores.densityHeaviness <= 3.5
            ? "muted"
            : "accent",
        detail:
          axisScores.densityHeaviness >= 7
            ? "Base weight and more lipophilic materials point to a denser body through the heart and drydown."
            : axisScores.densityHeaviness <= 3.5
            ? "The structure reads relatively open and light-bodied rather than dense."
            : "The body looks balanced between openness and density in the current model.",
      },
      {
        key: "drydownPersistence",
        label: "Drydown persistence",
        rating: drydownBand,
        tone:
          axisScores.drydownPersistence >= 7
            ? "cool"
            : axisScores.drydownPersistence <= 3.5
            ? "caution"
            : "accent",
        detail:
          axisScores.drydownPersistence >= 7
            ? "Longevity signals, base-note weight, and fixative support suggest a persistent drydown."
            : axisScores.drydownPersistence <= 3.5
            ? "The drydown may taper earlier than the opening suggests."
            : "The drydown should hold reasonably well without reading especially tenacious.",
      },
      {
        key: "likelyProjection",
        label: "Likely projection",
        rating: projectionBand,
        tone:
          axisScores.likelyProjection >= 7
            ? "warm"
            : axisScores.likelyProjection <= 3.5
            ? "muted"
            : "accent",
        detail:
          axisScores.likelyProjection >= 7
            ? "Projection and sillage scores point to a fairly noticeable scent cloud."
            : axisScores.likelyProjection <= 3.5
            ? "The model reads projection as intimate rather than room-filling."
            : "Projection looks present but not especially aggressive.",
      },
      {
        key: "clutterImbalance",
        label: "Possible clutter / imbalance",
        rating: clutterBand,
        tone:
          axisScores.clutterImbalance >= 6
            ? "danger"
            : axisScores.clutterImbalance > 2.5
            ? "caution"
            : "positive",
        detail:
          axisScores.clutterImbalance >= 6
            ? crowdedFamilies.length > 0
              ? `Several high-impact materials are competing in ${crowdedFamilies
                  .slice(0, 2)
                  .map((family) => family.family)
                  .join(" / ")}, so the formula could read crowded.`
              : `The current balance leans heavily toward the ${dominantNoteLayer}, so parts of the formula may overshadow the rest.`
            : axisScores.clutterImbalance > 2.5
            ? `There is a mild imbalance signal, mostly around ${dominantNoteLayer} weight or crowded high-impact materials.`
            : "No obvious crowding signal stands out in the current model.",
      },
      {
        key: "bridgeWeakness",
        label: "Transition / bridge",
        rating: bridgeBand,
        tone:
          axisScores.bridgeWeakness >= 6
            ? "danger"
            : axisScores.bridgeWeakness > 2.5
            ? "caution"
            : "positive",
        detail:
          axisScores.bridgeWeakness >= 6
            ? "Mid-note coverage looks thin relative to the top and base, so the transition may feel abrupt."
            : axisScores.bridgeWeakness > 2.5
            ? "The heart looks a bit lean, so the opening-to-drydown handoff is worth watching."
            : "No obvious bridge gap stands out from the current note balance.",
      },
    ],
  };
}

export function buildPerformanceComparisonNarrative(leftSummary, rightSummary) {
  if (!leftSummary?.axisScores || !rightSummary?.axisScores) {
    return [];
  }
  const notes = [];
  const openingDelta =
    rightSummary.axisScores.openingImpact -
    leftSummary.axisScores.openingImpact;
  const drydownDelta =
    rightSummary.axisScores.drydownPersistence -
    leftSummary.axisScores.drydownPersistence;
  const densityDelta =
    rightSummary.axisScores.densityHeaviness -
    leftSummary.axisScores.densityHeaviness;
  const clutterDelta =
    rightSummary.axisScores.clutterImbalance -
    leftSummary.axisScores.clutterImbalance;
  const bridgeDelta =
    rightSummary.axisScores.bridgeWeakness -
    leftSummary.axisScores.bridgeWeakness;

  if (openingDelta > 1.1) {
    notes.push("Compared formula reads livelier in the opening.");
  } else if (openingDelta < -1.1) {
    notes.push("Compared formula reads softer in the opening.");
  }
  if (drydownDelta > 1.1) {
    notes.push("Compared formula looks more persistent in the drydown.");
  } else if (drydownDelta < -1.1) {
    notes.push("Compared formula looks shorter in the drydown.");
  }
  if (densityDelta > 1.1) {
    notes.push("Compared formula reads denser through the heart and base.");
  } else if (densityDelta < -1.1) {
    notes.push("Compared formula reads lighter and more open through the body.");
  }
  if (clutterDelta > 1.1) {
    notes.push("Compared formula carries a higher clutter or imbalance signal.");
  } else if (bridgeDelta > 1.1) {
    notes.push(
      "Compared formula shows a weaker modeled bridge from opening to drydown."
    );
  }
  if (!notes.length) {
    notes.push(
      "Both formulas read fairly similar in the current model, with no major shift in opening, body, or drydown."
    );
  }
  return notes.slice(0, 3);
}

export function buildFormulaCritiqueReport({
  formula,
  chemistry = [],
  performance = { longevity: 0, sillage: 0, projection: 0 },
  performanceModel,
  basket,
  cheapestBasket,
  basketModeMeta,
  ifraRows = [],
  lens = "perfumer",
  db = {},
}) {
  const lensMeta = CRITIQUE_LENS_META[lens] || CRITIQUE_LENS_META.perfumer;
  const formulaLabel = getFormulaDisplayLabel(formula, {
    includeVersion: true,
  });
  const fallback = {
    lens,
    lensMeta,
    formulaLabel,
    headline: `Structured critique — ${lensMeta.label} lens`,
    lensSummary: lensMeta.description,
    supportNote:
      "Estimate only — this critique stays grounded in the app's current model signals.",
    strengths: [
      "Add a formula with ingredients to see structured critique findings.",
    ],
    weaknesses: [
      "No formula data is available yet, so no weakness signal can be inferred.",
    ],
    sensoryIssues: [
      "Likely sensory issues appear here once the formula has ingredient data.",
    ],
    costIssues: [
      "Likely cost issues appear here once the formula has supplier basket data.",
    ],
    suggestedChanges: [
      "Build or load a formula first, then use the selected lens to guide the next revision.",
    ],
    uncertainty: [
      "This advisor is model-based and should be treated as an estimate rather than certainty.",
    ],
  };

  if (!formula?.ingredients?.length) return fallback;

  const totalG =
    formula.ingredients.reduce(
      (sum, ingredient) => sum + (Number(ingredient.g) || 0),
      0
    ) || 1;
  const noteWeight = {
    top:
      formula.ingredients
        .filter((ingredient) => ingredient.note === "top")
        .reduce((sum, ingredient) => sum + (Number(ingredient.g) || 0), 0) /
      totalG,
    mid:
      formula.ingredients
        .filter((ingredient) => ingredient.note === "mid")
        .reduce((sum, ingredient) => sum + (Number(ingredient.g) || 0), 0) /
      totalG,
    base:
      formula.ingredients
        .filter((ingredient) => ingredient.note === "base")
        .reduce((sum, ingredient) => sum + (Number(ingredient.g) || 0), 0) /
      totalG,
  };
  const modelFacets = Object.fromEntries(
    (performanceModel?.facets || []).map((facet) => [facet.key, facet])
  );
  const axisScores = performanceModel?.axisScores || {};
  const openingScore = axisScores.openingImpact || 0;
  const liftScore = axisScores.liftFreshness || 0;
  const densityScore = axisScores.densityHeaviness || 0;
  const drydownScore = axisScores.drydownPersistence || 0;
  const projectionScore = axisScores.likelyProjection || 0;
  const clutterScore = axisScores.clutterImbalance || 0;
  const bridgeScore = axisScores.bridgeWeakness || 0;
  const unknownIngredientCount = chemistry.filter((ingredient) => !ingredient.d)
    .length;
  const uvcbCount = chemistry.filter((ingredient) => ingredient.isUVCB).length;
  const highImpactMaterials = [...chemistry]
    .filter((ingredient) => ingredient.d && (ingredient.OV || 0) > 1)
    .sort((a, b) => (b.intensity || 0) - (a.intensity || 0));
  const dominantFamilies = Object.entries(
    highImpactMaterials.reduce((acc, ingredient) => {
      const family = ingredient.d?.scentClass || "Other";
      if (!acc[family]) {
        acc[family] = { family, count: 0, intensity: 0 };
      }
      acc[family].count += 1;
      acc[family].intensity += ingredient.intensity || 0;
      return acc;
    }, {})
  )
    .map(([, value]) => value)
    .sort((a, b) => {
      if (b.intensity !== a.intensity) return b.intensity - a.intensity;
      return b.count - a.count;
    });
  const dominantFamily = dominantFamilies[0]?.family || null;
  const heroMaterials = highImpactMaterials
    .slice(0, 3)
    .map((ingredient) => ingredient.name);
  const basketLines = basket?.lines || [];
  const totalBasketCost = basket?.totalCost || 0;
  const topSpendLines = [...basketLines]
    .filter((line) => line.lineCost != null)
    .sort((a, b) => (b.lineCost || 0) - (a.lineCost || 0));
  const spendLeader = topSpendLines[0] || null;
  const spendLeaderShare =
    totalBasketCost > 0 && spendLeader
      ? spendLeader.lineCost / totalBasketCost
      : 0;
  const basketDeltaVsCheapest =
    basket && cheapestBasket ? basket.totalCost - cheapestBasket.totalCost : 0;
  const ifraFails = ifraRows.filter((row) => row.status === "fail");
  const ifraWarns = ifraRows.filter((row) => row.status === "warn");
  const restrictedRows = ifraRows.filter((row) => row.limit != null);

  const strengths = [];
  const weaknesses = [];
  const sensoryIssues = [];
  const costIssues = [];
  const suggestedChanges = [];
  const uncertainty = [...(performanceModel?.caveats || [])];

  if (basket?.missingCount) {
    pushUniqueItem(
      uncertainty,
      `${basket.missingCount} supplier price line${
        basket.missingCount === 1 ? "" : "s"
      } are missing in the current ${basket.meta.title.toLowerCase()}.`
    );
  }
  if (basket?.uncertainCount) {
    pushUniqueItem(
      uncertainty,
      `${basket.uncertainCount} supplier mapping${
        basket.uncertainCount === 1 ? "" : "s"
      } are still low-confidence in the current basket.`
    );
  }
  if (ifraWarns.length && !ifraFails.length) {
    pushUniqueItem(
      uncertainty,
      `Cat 4 IFRA review shows ${ifraWarns.length} caution flag${
        ifraWarns.length === 1 ? "" : "s"
      }, so compliance still needs review before production decisions.`
    );
  }

  if (performanceModel?.headline) {
    pushUniqueItem(strengths, performanceModel.headline);
  }
  if (openingScore >= 6.5) {
    pushUniqueItem(strengths, modelFacets.openingImpact?.detail);
  }
  if (drydownScore >= 6.5) {
    pushUniqueItem(strengths, modelFacets.drydownPersistence?.detail);
  }
  if (bridgeScore <= 2.5) {
    pushUniqueItem(strengths, modelFacets.bridgeWeakness?.detail);
  }
  if (!ifraFails.length && !ifraWarns.length) {
    pushUniqueItem(
      strengths,
      "Current Cat 4 IFRA review shows no modeled violations."
    );
  }
  if (basket && basket.missingCount === 0 && basket.uncertainCount === 0) {
    pushUniqueItem(
      strengths,
      `Current ${basket.meta.title.toLowerCase()} is fully mapped with no missing or uncertain supplier lines.`
    );
  }

  if (clutterScore > 4.5) {
    pushUniqueItem(weaknesses, modelFacets.clutterImbalance?.detail);
  }
  if (bridgeScore > 4) {
    pushUniqueItem(weaknesses, modelFacets.bridgeWeakness?.detail);
  }
  if (openingScore < 4) {
    pushUniqueItem(weaknesses, modelFacets.openingImpact?.detail);
  }
  if (drydownScore < 4) {
    pushUniqueItem(weaknesses, modelFacets.drydownPersistence?.detail);
  }
  if (unknownIngredientCount > 0) {
    pushUniqueItem(
      weaknesses,
      `${unknownIngredientCount} ingredient${
        unknownIngredientCount === 1 ? "" : "s"
      } still lack full chemistry data, so confidence in the volatility read is reduced.`
    );
  }
  if (uvcbCount > 0) {
    pushUniqueItem(
      weaknesses,
      `${uvcbCount} natural/UVCB material${
        uvcbCount === 1 ? "" : "s"
      } are being modeled more coarsely than single molecules.`
    );
  }
  if (ifraFails.length) {
    pushUniqueItem(
      weaknesses,
      `Cat 4 IFRA review currently flags ${formatHumanList(
        ifraFails.map((row) => row.name)
      )} above the modeled limit.`
    );
  }

  if (clutterScore > 4.5) {
    pushUniqueItem(
      sensoryIssues,
      dominantFamily
        ? `Several high-impact ${dominantFamily.toLowerCase()} materials may compete, so the formula could read crowded.`
        : "Several high-impact materials may compete, so parts of the formula could read crowded."
    );
  }
  if (densityScore >= 7 && liftScore <= 4) {
    pushUniqueItem(
      sensoryIssues,
      "The formula may feel denser than it is fresh, especially through the heart and early drydown."
    );
  }
  if (projectionScore < 4 && drydownScore >= 6.5) {
    pushUniqueItem(
      sensoryIssues,
      "Drydown support looks stronger than the opening throw, so it may wear closer to the skin than its base weight suggests."
    );
  }
  if (bridgeScore > 4) {
    pushUniqueItem(
      sensoryIssues,
      "The opening-to-heart transition may feel abrupt if the mid-notes do not bridge enough of the top/base contrast."
    );
  }
  if (openingScore > 7 && drydownScore < 4.5) {
    pushUniqueItem(
      sensoryIssues,
      "The opening may promise more lift than the later wear can sustain."
    );
  }

  if (spendLeaderShare > 0.32 && spendLeader) {
    pushUniqueItem(
      costIssues,
      `${spendLeader.ingredientName} is the main spend driver in the current basket at about ${Math.round(
        spendLeaderShare * 100
      )}% of the modeled line cost.`
    );
  }
  if (basketDeltaVsCheapest > 0.01 && basketModeMeta?.label) {
    pushUniqueItem(
      costIssues,
      `Current ${basketModeMeta.label.toLowerCase()} mode is +$${basketDeltaVsCheapest.toFixed(
        2
      )} versus the cheapest basket before shipping.`
    );
  }
  if (basket?.missingCount || basket?.uncertainCount) {
    pushUniqueItem(
      costIssues,
      "Cost confidence is reduced because some supplier lines are missing or still low-confidence."
    );
  }
  if (basket?.supplierCount > 3) {
    pushUniqueItem(
      costIssues,
      `The current basket spans ${basket.supplierCount} suppliers, and shipping is not modeled in the total.`
    );
  }

  if (bridgeScore > 4) {
    pushUniqueItem(
      suggestedChanges,
      "Test a slightly fuller heart so the opening and drydown connect more smoothly."
    );
  }
  if (clutterScore > 4.5) {
    pushUniqueItem(
      suggestedChanges,
      dominantFamily
        ? `Trim one or two overlapping ${dominantFamily.toLowerCase()} materials before adding anything new.`
        : "Trim one or two overlapping high-impact materials before adding anything new."
    );
  }
  if (drydownScore < 4) {
    pushUniqueItem(
      suggestedChanges,
      "If you want more staying power, test a modest increase in base support or fixative weight."
    );
  }
  if (openingScore < 4) {
    pushUniqueItem(
      suggestedChanges,
      "If you want more lift, test a clearer top-note accent or reduce a little dense base weight."
    );
  }
  if (basketDeltaVsCheapest > 0.01) {
    pushUniqueItem(
      suggestedChanges,
      `If cost is the priority, the cheapest basket saves about $${basketDeltaVsCheapest.toFixed(
        2
      )} against the current mode.`
    );
  }
  if (spendLeaderShare > 0.32 && spendLeader) {
    pushUniqueItem(
      suggestedChanges,
      `Audit ${spendLeader.ingredientName} first if you need to lower spend without changing many lines.`
    );
  }
  if (basket?.missingCount || basket?.uncertainCount) {
    pushUniqueItem(
      suggestedChanges,
      "Resolve missing or uncertain supplier lines before treating the cost read as final."
    );
  }
  if (ifraFails.length || ifraWarns.length) {
    pushUniqueItem(
      suggestedChanges,
      `Recheck ${formatHumanList(
        [...ifraFails, ...ifraWarns].map((row) => row.name)
      )} against Cat 4 limits before locking this version.`
    );
  }

  const lensOverrides = {
    perfumer: {
      strengths,
      weaknesses,
      sensoryIssues,
      costIssues,
      suggestedChanges,
    },
    chemist: {
      strengths: [
        strengths.find((item) => item?.includes("chemistry data")) ||
          (unknownIngredientCount === 0
            ? "Most ingredients in this formula have chemistry data, which makes the current volatility read more dependable."
            : null),
        strengths.find((item) => item?.includes("bridge")) ||
          modelFacets.bridgeWeakness?.detail,
        strengths.find((item) => item?.includes("drydown")) ||
          modelFacets.drydownPersistence?.detail,
      ],
      weaknesses: [
        unknownIngredientCount > 0
          ? `${unknownIngredientCount} ingredient${
              unknownIngredientCount === 1 ? "" : "s"
            } still lack full chemistry data, which weakens the modeled volatility curve.`
          : null,
        uvcbCount > 0
          ? `${uvcbCount} natural/UVCB material${
              uvcbCount === 1 ? "" : "s"
            } are being handled with coarser assumptions than single molecules.`
          : null,
        clutterScore > 4.5
          ? `High-impact materials in ${
              dominantFamily
                ? dominantFamily.toLowerCase()
                : "one dominant family"
            } may be overlapping enough to blur the effective OV picture.`
          : null,
      ],
      sensoryIssues: [
        bridgeScore > 4
          ? "The current volatility curve suggests a weaker mid-note bridge than the opening/base contrast needs."
          : null,
        densityScore >= 7 && liftScore <= 4
          ? "The structure may read heavier than it is fresh because dense/base-heavy signals are outrunning lift."
          : null,
        projectionScore < 4 && drydownScore >= 6.5
          ? "The formula may retain on skin more than it throws into the air."
          : null,
      ],
      costIssues: [
        basket?.missingCount || basket?.uncertainCount
          ? "Supplier confidence gaps also reduce reproducibility of the current cost and sourcing read."
          : null,
        basket?.supplierCount > 3
          ? `The current sourcing path is split across ${basket.supplierCount} suppliers.`
          : null,
        spendLeaderShare > 0.32 && spendLeader
          ? `${spendLeader.ingredientName} dominates spend enough that any concentration change there will move total cost materially.`
          : null,
      ],
      suggestedChanges: [
        unknownIngredientCount > 0
          ? "Fill the main chemistry data gaps before over-trusting small volatility differences."
          : null,
        clutterScore > 4.5
          ? "Simplify overlapping high-OV materials before adding more complexity."
          : null,
        uvcbCount > 0 || restrictedRows.length > 0
          ? "Verify diluted or restricted materials at the active-percent level when possible."
          : null,
      ],
    },
    cost: {
      strengths: [
        basket && basket.missingCount === 0 && basket.uncertainCount === 0
          ? `Current ${basket.meta.title.toLowerCase()} is fully mapped, which makes this cost read relatively dependable.`
          : null,
        basket?.supplierCount <= 2 && basket?.supplierCount > 0
          ? `The current basket stays fairly consolidated across ${basket.supplierCount} supplier${
              basket.supplierCount === 1 ? "" : "s"
            }.`
          : null,
        totalBasketCost > 0
          ? `Current modeled basket total is $${totalBasketCost.toFixed(2)} in ${basketModeMeta?.label || "current"} mode.`
          : null,
      ],
      weaknesses: [
        spendLeaderShare > 0.32 && spendLeader
          ? `${spendLeader.ingredientName} dominates spend enough to limit low-risk savings elsewhere.`
          : null,
        basketDeltaVsCheapest > 0.01
          ? `The selected sourcing mode is paying a $${basketDeltaVsCheapest.toFixed(
              2
            )} premium over cheapest before shipping.`
          : null,
        basket?.missingCount || basket?.uncertainCount
          ? "Some supplier lines are still missing or low-confidence, so the total should not be treated as final."
          : null,
      ],
      sensoryIssues: [
        clutterScore > 4.5
          ? "If you reduce cost without simplifying the crowded families first, you may still keep the same sensory clutter."
          : null,
        drydownScore < 4
          ? "Cutting base support further would likely make the short drydown more obvious."
          : null,
        openingScore < 4
          ? "Removing lift-heavy materials first could make the opening read even quieter."
          : null,
      ],
      costIssues: [
        spendLeaderShare > 0.32 && spendLeader
          ? `${spendLeader.ingredientName} is about ${Math.round(
              spendLeaderShare * 100
            )}% of modeled basket cost right now.`
          : null,
        basket?.supplierCount > 3
          ? `The basket spans ${basket.supplierCount} suppliers, and shipping is outside the modeled total.`
          : null,
        basket?.missingCount || basket?.uncertainCount
          ? "Missing or uncertain supplier data is still the biggest blocker to a confident cost read."
          : null,
      ],
      suggestedChanges: [
        spendLeaderShare > 0.32 && spendLeader
          ? `Start with ${spendLeader.ingredientName} if you need to test lower-cost revisions.`
          : null,
        basketDeltaVsCheapest > 0.01
          ? `Switching back to cheapest mode would save about $${basketDeltaVsCheapest.toFixed(
              2
            )} before shipping.`
          : null,
        basket?.missingCount || basket?.uncertainCount
          ? "Resolve missing and uncertain basket lines before making supplier decisions permanent."
          : null,
      ],
    },
    compliance: {
      strengths: [
        !ifraFails.length && !ifraWarns.length
          ? "Current Cat 4 IFRA review shows no modeled failures or caution flags."
          : null,
        restrictedRows.length > 0 && !ifraFails.length
          ? `Restricted materials are present, but the current model does not show them over Cat 4 limits.`
          : null,
        bridgeScore <= 2.5 ? modelFacets.bridgeWeakness?.detail : null,
      ],
      weaknesses: [
        ifraFails.length
          ? `Cat 4 IFRA review currently fails ${formatHumanList(
              ifraFails.map((row) => row.name)
            )}.`
          : null,
        ifraWarns.length
          ? `Cat 4 IFRA review is already close on ${formatHumanList(
              ifraWarns.map((row) => row.name)
            )}.`
          : null,
        restrictedRows.length >= 4
          ? `There are ${restrictedRows.length} restricted-material rows in play, so reformulation risk is not trivial.`
          : null,
      ],
      sensoryIssues: [
        ifraFails.length || ifraWarns.length
          ? "Any required compliance cuts could change the balance the performance model is currently describing."
          : null,
        openingScore > 7 &&
        ifraRows.some(
          (row) => row.status !== "ok" && db[row.name]?.note === "top"
        )
          ? "Some of the lift may depend on top-note materials that already need compliance review."
          : null,
        drydownScore >= 6.5 &&
        ifraRows.some(
          (row) => row.status !== "ok" && db[row.name]?.note === "base"
        )
          ? "Some of the modeled persistence may depend on base materials that already need compliance review."
          : null,
      ],
      costIssues: [
        basket?.missingCount || basket?.uncertainCount
          ? "Supplier confidence gaps make it harder to estimate reformulation cost cleanly."
          : null,
        spendLeaderShare > 0.32 && spendLeader
          ? `${spendLeader.ingredientName} is both a major spend line and a likely place to watch if reformulation becomes necessary.`
          : null,
      ],
      suggestedChanges: [
        ifraFails.length || ifraWarns.length
          ? `Prioritize ${formatHumanList(
              [...ifraFails, ...ifraWarns].map((row) => row.name)
            )} for compliance review before locking the formula.`
          : null,
        restrictedRows.length > 0
          ? "Keep Cat 4 as the working baseline and verify active-percent assumptions for diluted stocks."
          : null,
        bridgeScore > 4
          ? "If compliance cuts are required, protect the mid-note bridge first so the transition does not collapse."
          : null,
      ],
    },
    brand: {
      strengths: [
        heroMaterials.length
          ? `The current read suggests ${formatHumanList(heroMaterials)} are the main signature materials.`
          : null,
        performanceModel?.headline,
        openingScore >= 6.5 || drydownScore >= 6.5
          ? "There is enough modeled movement between opening and drydown to build a clearer story around the formula."
          : null,
      ],
      weaknesses: [
        clutterScore > 4.5
          ? "Too many high-impact signals may blur the formula's identity instead of sharpening it."
          : null,
        dominantFamilies.length >= 4
          ? `The formula is pulling from ${dominantFamilies.length} strong scent families, which can dilute the story.`
          : null,
        bridgeScore > 4
          ? "The opening-to-drydown handoff may be less coherent than the brand story wants."
          : null,
      ],
      sensoryIssues: [
        clutterScore > 4.5
          ? "The character may feel busy instead of signature if the crowded families all stay at current strength."
          : null,
        openingScore > 7 && drydownScore < 4.5
          ? "The first impression may over-promise versus the later wear."
          : null,
        densityScore >= 7 && liftScore <= 4
          ? "The formula may read more dense than fresh, which narrows the personality it projects."
          : null,
      ],
      costIssues: [
        spendLeaderShare > 0.32 && spendLeader
          ? `${spendLeader.ingredientName} is a signature-level spend driver in the current basket.`
          : null,
        basket?.missingCount || basket?.uncertainCount
          ? "Uncertain supplier lines make the commercial story less settled than it looks."
          : null,
      ],
      suggestedChanges: [
        heroMaterials.length
          ? `Choose whether ${formatHumanList(heroMaterials.slice(0, 2))} are the hero materials, then simplify anything fighting them.`
          : null,
        clutterScore > 4.5
          ? "Edit for identity first: remove overlapping accents before you add more nuance."
          : null,
        bridgeScore > 4
          ? "Use the heart to connect the opening and drydown so the overall story reads as one idea."
          : null,
      ],
    },
  };

  const activeLensSections = lensOverrides[lens] || lensOverrides.perfumer;
  const sectionDefaults = {
    strengths:
      "No standout strength dominates the current read beyond a workable baseline.",
    weaknesses:
      "No single weakness dominates the current read, though the estimate remains heuristic.",
    sensoryIssues:
      "No single sensory issue stands out strongly in the current model.",
    costIssues:
      "No major cost issue stands out beyond ordinary supplier and shipping variability.",
    suggestedChanges:
      "If you iterate further, make one small change at a time so the next revision stays readable.",
  };

  const cleanSection = (items, fallbackText) => {
    const cleaned = items.filter(Boolean).slice(0, 3);
    return cleaned.length ? cleaned : [fallbackText];
  };

  const critiqueHeadline = `${lensMeta.label} lens on ${formulaLabel}`;
  const supportNote = [
    performanceModel?.headline || null,
    totalBasketCost > 0
      ? `${basketModeMeta?.label || basket?.meta?.label || "Current"} basket: $${totalBasketCost.toFixed(
          2
        )}`
      : null,
    ifraFails.length
      ? `Cat 4 IFRA: ${ifraFails.length} fail`
      : ifraWarns.length
      ? `Cat 4 IFRA: ${ifraWarns.length} caution`
      : "Cat 4 IFRA: no modeled failures",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    lens,
    lensMeta,
    formulaLabel,
    headline: critiqueHeadline,
    lensSummary: lensMeta.description,
    supportNote,
    strengths: cleanSection(
      activeLensSections.strengths,
      sectionDefaults.strengths
    ),
    weaknesses: cleanSection(
      activeLensSections.weaknesses,
      sectionDefaults.weaknesses
    ),
    sensoryIssues: cleanSection(
      activeLensSections.sensoryIssues,
      sectionDefaults.sensoryIssues
    ),
    costIssues: cleanSection(
      activeLensSections.costIssues,
      sectionDefaults.costIssues
    ),
    suggestedChanges: cleanSection(
      activeLensSections.suggestedChanges,
      sectionDefaults.suggestedChanges
    ),
    uncertainty: cleanSection(
      uncertainty,
      "Estimate only — this advisor stays grounded in current formula, cost, and compliance heuristics rather than certainty."
    ),
    promptSummary: {
      performanceHeadline: performanceModel?.headline || "",
      performance: {
        longevity: performance.longevity || 0,
        sillage: performance.sillage || 0,
        projection: performance.projection || 0,
      },
      basketTotal: totalBasketCost,
      basketModeLabel: basketModeMeta?.label || basket?.meta?.label || "Current",
      heroMaterials,
      dominantFamily,
      topSpendIngredient: spendLeader?.ingredientName || null,
      restrictedCount: restrictedRows.length,
      noteWeight,
    },
  };
}

export function buildAiCritiquePrompt({
  targetFormula,
  critiqueReport,
  performance,
  db = {},
}) {
  const total = targetFormula.ingredients.reduce(
    (sum, ingredient) => sum + ingredient.g,
    0
  );
  const formulaLabel = getFormulaDisplayLabel(targetFormula, {
    includeVersion: true,
  });
  const ingList = targetFormula.ingredients
    .map((ingredient) => {
      const d = db[ingredient.name];
      return `  • ${ingredient.name} (${ingredient.g}g, ${(
        (ingredient.g / total) *
        100
      ).toFixed(1)}%, ${ingredient.note}${d ? `, ${d.scentClass}` : ""})`;
    })
    .join("\n");
  const formatSection = (label, items) =>
    `${label}:\n${items.map((item) => `- ${item}`).join("\n")}`;

  return `You are an expert fragrance advisor reviewing a concentrate through the ${
    critiqueReport.lensMeta.label
  } lens.

Stay consistent with the app's current model signals unless you clearly mark uncertainty. Do not contradict the supplied rule-based findings casually.

Formula: "${formulaLabel}" — ${targetFormula.tagline}
Total: ${total}g concentrate

Ingredients:
${ingList}

Current model anchors:
- ${critiqueReport.supportNote}
- Performance scores: Longevity ${performance.longevity.toFixed(
    1
  )}/10, Sillage ${performance.sillage.toFixed(
    1
  )}/10, Projection ${performance.projection.toFixed(1)}/10
- Lens focus: ${critiqueReport.lensSummary}

Structured rule-based findings:
${formatSection("Strengths", critiqueReport.strengths)}

${formatSection("Weaknesses", critiqueReport.weaknesses)}

${formatSection("Likely sensory issues", critiqueReport.sensoryIssues)}

${formatSection("Likely cost issues", critiqueReport.costIssues)}

${formatSection("Suggested next changes", critiqueReport.suggestedChanges)}

${formatSection("Uncertainty", critiqueReport.uncertainty)}

Return under exactly these headings:
**Strengths**
**Weaknesses**
**Likely sensory issues**
**Likely cost issues**
**Suggested next changes**
**Uncertainty**

Keep it under 300 words, practical, and grounded in the supplied signals.`;
}

export function buildFormulaComparison(
  leftFormula,
  rightFormula,
  {
    pricesState,
    formulaSupplierOverrides = {},
    computeChemistry,
    perfScore,
    db = {},
    pricing = {},
  } = {}
) {
  if (!leftFormula || !rightFormula) return null;

  const leftIngredients = buildFormulaIngredientSummaryMap(
    leftFormula.ingredients || []
  );
  const rightIngredients = buildFormulaIngredientSummaryMap(
    rightFormula.ingredients || []
  );
  const allKeys = Array.from(
    new Set([...leftIngredients.keys(), ...rightIngredients.keys()])
  );

  const diffRows = allKeys
    .map((key) => {
      const left = leftIngredients.get(key) || null;
      const right = rightIngredients.get(key) || null;
      const leftNotes = left?.notes.join(", ") || "—";
      const rightNotes = right?.notes.join(", ") || "—";
      const gramDelta = (right?.totalG || 0) - (left?.totalG || 0);
      const status = !left
        ? "added"
        : !right
        ? "removed"
        : leftNotes !== rightNotes || Math.abs(gramDelta) > 0.0001
        ? "changed"
        : "same";

      return {
        key,
        status,
        displayName: left?.primaryName || right?.primaryName || key,
        leftNames: left?.names || [],
        rightNames: right?.names || [],
        leftGrams: left?.totalG || 0,
        rightGrams: right?.totalG || 0,
        gramDelta,
        leftNotes,
        rightNotes,
        noteChanged: leftNotes !== rightNotes,
      };
    })
    .filter((row) => row.status !== "same")
    .sort((a, b) => {
      const statusWeight = { changed: 0, added: 1, removed: 2 };
      const statusDelta =
        (statusWeight[a.status] ?? 3) - (statusWeight[b.status] ?? 3);
      if (statusDelta !== 0) return statusDelta;
      return Math.abs(b.gramDelta) - Math.abs(a.gramDelta);
    });

  const leftCost = buildFormulaProcurementRows(
    leftFormula.ingredients || [],
    pricesState,
    formulaSupplierOverrides[leftFormula.formulaKey] || {},
    { db, pricing }
  );
  const rightCost = buildFormulaProcurementRows(
    rightFormula.ingredients || [],
    pricesState,
    formulaSupplierOverrides[rightFormula.formulaKey] || {},
    { db, pricing }
  );
  const leftChemistryModel = computeChemistry(leftFormula.ingredients || []);
  const rightChemistryModel = computeChemistry(rightFormula.ingredients || []);
  const leftPerformance = perfScore(leftFormula.ingredients || []);
  const rightPerformance = perfScore(rightFormula.ingredients || []);
  const leftChemistry = summarizeComputedChemistry(leftChemistryModel);
  const rightChemistry = summarizeComputedChemistry(rightChemistryModel);
  const leftPerformanceModel = buildPerformanceModelSummary(
    leftFormula.ingredients || [],
    {
      db,
      chemistry: leftChemistryModel,
      performance: leftPerformance,
      chemistrySummary: leftChemistry,
      computeChemistry,
      perfScore,
    }
  );
  const rightPerformanceModel = buildPerformanceModelSummary(
    rightFormula.ingredients || [],
    {
      db,
      chemistry: rightChemistryModel,
      performance: rightPerformance,
      chemistrySummary: rightChemistry,
      computeChemistry,
      perfScore,
    }
  );
  const leftBaskets = buildSupplierBasketStrategies(
    leftFormula.ingredients || [],
    pricesState,
    formulaSupplierOverrides[leftFormula.formulaKey] || {},
    { db, pricing }
  );
  const rightBaskets = buildSupplierBasketStrategies(
    rightFormula.ingredients || [],
    pricesState,
    formulaSupplierOverrides[rightFormula.formulaKey] || {},
    { db, pricing }
  );

  return {
    diffRows,
    addedCount: diffRows.filter((row) => row.status === "added").length,
    removedCount: diffRows.filter((row) => row.status === "removed").length,
    changedCount: diffRows.filter((row) => row.status === "changed").length,
    leftCost,
    rightCost,
    costDelta: rightCost.grandTotal - leftCost.grandTotal,
    leftBaskets,
    rightBaskets,
    leftPerformance,
    rightPerformance,
    leftPerformanceModel,
    rightPerformanceModel,
    performanceNarrative: buildPerformanceComparisonNarrative(
      leftPerformanceModel,
      rightPerformanceModel
    ),
    performanceDelta: {
      longevity: rightPerformance.longevity - leftPerformance.longevity,
      sillage: rightPerformance.sillage - leftPerformance.sillage,
      projection: rightPerformance.projection - leftPerformance.projection,
    },
    leftChemistry,
    rightChemistry,
    chemistryDelta: {
      totalIntensity:
        rightChemistry.totalIntensity - leftChemistry.totalIntensity,
      totalOV: rightChemistry.totalOV - leftChemistry.totalOV,
      weightedXLogP:
        rightChemistry.weightedXLogP - leftChemistry.weightedXLogP,
      weightedVP: rightChemistry.weightedVP - leftChemistry.weightedVP,
    },
  };
}

export const LAUNCH_READINESS_STATUS_META = {
  near_ready: {
    label: "Near Launch-Ready",
    color: "#34D399",
    bg: "#052E16",
    border: "#166534",
  },
  needs_cleanup: {
    label: "Needs Cleanup",
    color: "#FCD34D",
    bg: "#422006",
    border: "#92400E",
  },
  blocked: {
    label: "Blocked",
    color: "#FCA5A5",
    bg: "#450A0A",
    border: "#991B1B",
  },
  early: {
    label: "Early",
    color: "#7DD3FC",
    bg: "#071826",
    border: "#1E3A52",
  },
};

function clampLaunchReadinessScore(value, max = 20) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, value));
}

function getFinishedProductReadinessScore(guidance) {
  switch (guidance?.overallStatus) {
    case "appears_compliant":
      return 20;
    case "no_restricted_rows":
      return 17;
    case "appears_compliant_with_missing":
      return 13;
    case "warning":
      return 11;
    case "warning_with_missing":
      return 8;
    case "blocked_missing":
      return 4;
    case "offender":
    case "offender_with_missing":
      return 0;
    default:
      return 8;
  }
}

function getLaunchReadinessStatus(score, blockers = []) {
  if (blockers.length > 0) return "blocked";
  if (score >= 78) return "near_ready";
  if (score >= 55) return "needs_cleanup";
  return "early";
}

function toFiniteNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function buildLaunchReadinessSummary({
  formula,
  basket,
  batchReport,
  ifraRows = [],
  finishedProductGuidance,
  performanceModel,
  critiqueReport,
  targetBatchG = 0,
} = {}) {
  const ingredients = formula?.ingredients || [];
  const totalIngredients = ingredients.length;
  const noteSet = new Set(
    ingredients.map((ingredient) => ingredient?.note).filter(Boolean)
  );
  const hasCoreNoteStructure =
    noteSet.has("top") && noteSet.has("mid") && noteSet.has("base");
  const hasPartialNoteStructure = noteSet.size >= 2;

  const completenessScore = clampLaunchReadinessScore(
    (totalIngredients > 0 ? 8 : 0) +
      (totalIngredients >= 5 ? 4 : totalIngredients >= 3 ? 2 : 0) +
      (hasCoreNoteStructure ? 6 : hasPartialNoteStructure ? 3 : 0) +
      (formula?.versionLabel ? 2 : 0),
    20
  );

  const pricingMissingShare =
    totalIngredients > 0
      ? toFiniteNumber(basket?.missingCount) / totalIngredients
      : 1;
  const pricingUncertainShare =
    totalIngredients > 0
      ? toFiniteNumber(basket?.uncertainCount) / totalIngredients
      : 0;
  const pricingCoverageScore = clampLaunchReadinessScore(
    (1 - pricingMissingShare) * 14 + (1 - pricingUncertainShare) * 6,
    20
  );

  const inventoryCoverageScore = clampLaunchReadinessScore(
    batchReport?.canFulfill
      ? 20
      : toFiniteNumber(batchReport?.coveragePercent) / 5 -
          Math.min(4, toFiniteNumber(batchReport?.shortageCount)),
    20
  );

  const axisScores = performanceModel?.axisScores || {};
  const failRows = ifraRows.filter((row) => row.status === "fail");
  const warnRows = ifraRows.filter((row) => row.status === "warn");
  const critiqueComplianceScore = clampLaunchReadinessScore(
    20 -
      failRows.length * 8 -
      warnRows.length * 3 -
      ((axisScores.clutterImbalance || 0) >= 6
        ? 4
        : (axisScores.clutterImbalance || 0) > 2.5
        ? 2
        : 0) -
      ((axisScores.bridgeWeakness || 0) >= 6
        ? 3
        : (axisScores.bridgeWeakness || 0) > 2.5
        ? 1
        : 0),
    20
  );

  const finishedProductScore = getFinishedProductReadinessScore(
    finishedProductGuidance
  );

  const blockers = [];
  const cautions = [];

  const hasComplianceBlock =
    failRows.length > 0 ||
    finishedProductGuidance?.overallStatus === "offender" ||
    finishedProductGuidance?.overallStatus === "offender_with_missing";
  if (hasComplianceBlock) {
    blockers.push(
      failRows.length
        ? `Concentrate IFRA has ${failRows.length} fail row${
            failRows.length === 1 ? "" : "s"
          }.`
        : "Finished-product guidance shows an offender."
    );
  }
  if (toFiniteNumber(batchReport?.shortageCount) > 0) {
    blockers.push(
      `${batchReport.shortageCount} inventory shortage${
        batchReport.shortageCount === 1 ? "" : "s"
      } at ${toFiniteNumber(targetBatchG).toFixed(0)}g.`
    );
  }
  if (toFiniteNumber(basket?.missingCount) > 0) {
    blockers.push(
      `${basket.missingCount} supplier price line${
        basket.missingCount === 1 ? "" : "s"
      } are missing in the current basket.`
    );
  }

  if (warnRows.length > 0 && !hasComplianceBlock) {
    cautions.push(
      `${warnRows.length} concentrate IFRA row${
        warnRows.length === 1 ? "" : "s"
      } are close to limit.`
    );
  }
  if (
    finishedProductGuidance?.overallStatus === "warning" ||
    finishedProductGuidance?.overallStatus === "warning_with_missing"
  ) {
    cautions.push("Finished-product headroom looks tight in the current use context.");
  }
  if (
    finishedProductGuidance?.missingRows?.length ||
    finishedProductGuidance?.overallStatus === "blocked_missing" ||
    finishedProductGuidance?.overallStatus === "appears_compliant_with_missing" ||
    finishedProductGuidance?.overallStatus === "offender_with_missing" ||
    finishedProductGuidance?.overallStatus === "warning_with_missing"
  ) {
    cautions.push("Finished-product guidance is partially blocked by missing data.");
  }
  if (toFiniteNumber(basket?.uncertainCount) > 0) {
    cautions.push(
      `${basket.uncertainCount} supplier mapping${
        basket.uncertainCount === 1 ? "" : "s"
      } are still low-confidence.`
    );
  }
  if ((axisScores.clutterImbalance || 0) >= 6) {
    cautions.push("Performance model shows elevated clutter or imbalance risk.");
  }
  if ((axisScores.bridgeWeakness || 0) >= 6) {
    cautions.push("Performance model shows a weak transition bridge.");
  }

  const totalScore = Number(
    (
      completenessScore +
      pricingCoverageScore +
      inventoryCoverageScore +
      critiqueComplianceScore +
      finishedProductScore
    ).toFixed(1)
  );
  const status = getLaunchReadinessStatus(totalScore, blockers);
  const statusMeta =
    LAUNCH_READINESS_STATUS_META[status] || LAUNCH_READINESS_STATUS_META.early;

  const spendLeader =
    [...(basket?.lines || [])]
      .filter((line) => line?.lineCost != null)
      .sort((a, b) => (b.lineCost || 0) - (a.lineCost || 0))[0] || null;
  const bottleneck =
    batchReport?.blockingMaterials?.[0] ||
    batchReport?.constrainingMaterials?.[0] ||
    null;
  const launchNote =
    critiqueReport?.suggestedChanges?.[0] ||
    critiqueReport?.weaknesses?.[0] ||
    performanceModel?.headline ||
    "Use the current model signals to tighten the next revision.";

  return {
    totalScore,
    status,
    statusMeta,
    blockers: blockers.slice(0, 3),
    cautions: cautions.slice(0, 3),
    subscores: {
      completeness: Number(completenessScore.toFixed(1)),
      pricingCoverage: Number(pricingCoverageScore.toFixed(1)),
      inventoryMakeability: Number(inventoryCoverageScore.toFixed(1)),
      critiqueCompliance: Number(critiqueComplianceScore.toFixed(1)),
      finishedProduct: Number(finishedProductScore.toFixed(1)),
    },
    compliance: {
      failCount: failRows.length,
      warnCount: warnRows.length,
      finishedProductStatus: finishedProductGuidance?.overallStatus || null,
      hasHardBlock: hasComplianceBlock,
    },
    pricing: {
      missingCount: toFiniteNumber(basket?.missingCount),
      uncertainCount: toFiniteNumber(basket?.uncertainCount),
      supplierCount: toFiniteNumber(basket?.supplierCount),
      totalCost: toFiniteNumber(basket?.totalCost),
    },
    inventory: {
      canFulfill: Boolean(batchReport?.canFulfill),
      shortageCount: toFiniteNumber(batchReport?.shortageCount),
      shortageTotalG: toFiniteNumber(batchReport?.shortageTotalG),
      maxProducibleG: toFiniteNumber(batchReport?.maxProducibleG),
      coveragePercent: toFiniteNumber(batchReport?.coveragePercent),
      targetBatchG: toFiniteNumber(targetBatchG),
    },
    spendLeader: spendLeader
      ? {
          ingredientName: spendLeader.ingredientName,
          lineCost: toFiniteNumber(spendLeader.lineCost),
          supplier: spendLeader.supplier || null,
        }
      : null,
    bottleneck: bottleneck
      ? {
          name: bottleneck.name,
          shortageG: toFiniteNumber(bottleneck.shortageG),
          maxProducibleG: toFiniteNumber(bottleneck.maxProducibleG),
        }
      : null,
    launchNote,
  };
}

export function buildFounderDashboardSummary(items = []) {
  const sortedItems = [...items].sort((a, b) => {
    const scoreDelta =
      (b.launchReadiness?.totalScore || 0) - (a.launchReadiness?.totalScore || 0);
    if (scoreDelta !== 0) return scoreDelta;
    return (a.displayLabel || "").localeCompare(b.displayLabel || "");
  });

  const blockedByCompliance = sortedItems.filter(
    (item) => item.launchReadiness?.compliance?.hasHardBlock
  );
  const blockedByInventory = sortedItems.filter(
    (item) => item.launchReadiness?.inventory?.shortageCount > 0
  );
  const blockedByPricing = sortedItems.filter(
    (item) => item.launchReadiness?.pricing?.missingCount > 0
  );
  const nearestProductionReady = sortedItems.filter(
    (item) => item.launchReadiness?.status !== "blocked"
  );

  const bottleneckMap = new Map();
  const spendMap = new Map();

  sortedItems.forEach((item) => {
    const formulaLabel = item.displayLabel || item.formula?.name || "Formula";
    const bottleneckRows =
      item.batchReport?.blockingMaterials?.length > 0
        ? item.batchReport.blockingMaterials.slice(0, 3)
        : (item.batchReport?.constrainingMaterials || []).slice(0, 1);
    bottleneckRows.forEach((row) => {
      const existing = bottleneckMap.get(row.name) || {
        name: row.name,
        blockingFormulaCount: 0,
        constrainingFormulaCount: 0,
        totalShortageG: 0,
        lowestMaxProducibleG: Number.POSITIVE_INFINITY,
        formulas: [],
      };
      if (row.shortageG > 0.0001) {
        existing.blockingFormulaCount += 1;
      } else {
        existing.constrainingFormulaCount += 1;
      }
      existing.totalShortageG += toFiniteNumber(row.shortageG);
      existing.lowestMaxProducibleG = Math.min(
        existing.lowestMaxProducibleG,
        toFiniteNumber(row.maxProducibleG, Number.POSITIVE_INFINITY)
      );
      pushUniqueItem(existing.formulas, formulaLabel);
      bottleneckMap.set(row.name, existing);
    });

    (item.selectedBasket?.lines || []).forEach((line) => {
      if (!line?.ingredientName || line.lineCost == null) return;
      const existing = spendMap.get(line.ingredientName) || {
        ingredientName: line.ingredientName,
        totalLineCost: 0,
        formulaCount: 0,
        formulas: [],
      };
      existing.totalLineCost += toFiniteNumber(line.lineCost);
      existing.formulaCount += 1;
      pushUniqueItem(existing.formulas, formulaLabel);
      spendMap.set(line.ingredientName, existing);
    });
  });

  const topBottleneckIngredients = Array.from(bottleneckMap.values())
    .sort((a, b) => {
      if (b.blockingFormulaCount !== a.blockingFormulaCount) {
        return b.blockingFormulaCount - a.blockingFormulaCount;
      }
      if (b.totalShortageG !== a.totalShortageG) {
        return b.totalShortageG - a.totalShortageG;
      }
      return a.lowestMaxProducibleG - b.lowestMaxProducibleG;
    })
    .slice(0, 6);

  const topSpendIngredients = Array.from(spendMap.values())
    .sort((a, b) => {
      if (b.totalLineCost !== a.totalLineCost) {
        return b.totalLineCost - a.totalLineCost;
      }
      return b.formulaCount - a.formulaCount;
    })
    .slice(0, 6);

  const trustSummary = buildFounderTrustSummary({
    trustSummaries: sortedItems.map(
      (item) =>
        item?.trustSummary ||
        buildFounderTrustSummary({
          basket: item?.selectedBasket || null,
          launchReadiness: item?.launchReadiness || null,
          expectedLineCount: Array.isArray(item?.formula?.ingredients)
            ? item.formula.ingredients.length
            : null,
        })
    ),
    extraMissingSignals:
      blockedByPricing.length > 0
        ? [
            `${blockedByPricing.length} formula${
              blockedByPricing.length === 1 ? "" : "s"
            } still have missing supplier pricing in the active basket.`,
          ]
        : [],
  });

  return {
    sortedItems,
    nearestProductionReady: nearestProductionReady.slice(0, 5),
    blockedByCompliance: blockedByCompliance.slice(0, 5),
    blockedByInventory: blockedByInventory.slice(0, 5),
    blockedByPricing: blockedByPricing.slice(0, 5),
    topBottleneckIngredients,
    topSpendIngredients,
    trustSummary,
    summary: {
      formulaCount: sortedItems.length,
      nearReadyCount: sortedItems.filter(
        (item) => item.launchReadiness?.status === "near_ready"
      ).length,
      blockedCount: sortedItems.filter(
        (item) => item.launchReadiness?.status === "blocked"
      ).length,
      customCount: sortedItems.filter(
        (item) => !item.formula?.isSeeded || item.formula?.parentVersionId
      ).length,
      seededCount: sortedItems.filter((item) => item.formula?.isSeeded).length,
      trustSupportedCount: sortedItems.filter(
        (item) => item?.trustSummary?.level === "supported"
      ).length,
      trustSparseCount: sortedItems.filter(
        (item) =>
          item?.trustSummary?.level === "sparse" ||
          item?.trustSummary?.level === "blocked"
      ).length,
    },
  };
}

export const SKU_ECONOMICS_STATUS_META = {
  strong: {
    label: "Strong",
    color: "#34D399",
    bg: "#052E16",
    border: "#166534",
  },
  workable: {
    label: "Workable",
    color: "#7DD3FC",
    bg: "#071826",
    border: "#1E3A52",
  },
  thin: {
    label: "Thin",
    color: "#F59E0B",
    bg: "#251404",
    border: "#B45309",
  },
  blocked: {
    label: "Blocked",
    color: "#F87171",
    bg: "#2A0C0C",
    border: "#991B1B",
  },
};

export const FOUNDER_TRUST_LEVEL_META = {
  supported: {
    label: "Supported",
    color: "#34D399",
    bg: "#052E16",
    border: "#166534",
  },
  mixed: {
    label: "Mixed",
    color: "#7DD3FC",
    bg: "#071826",
    border: "#1E3A52",
  },
  sparse: {
    label: "Sparse",
    color: "#F59E0B",
    bg: "#251404",
    border: "#B45309",
  },
  blocked: {
    label: "Missing-Driven",
    color: "#F87171",
    bg: "#2A0C0C",
    border: "#991B1B",
  },
};

function createFounderTrustAccumulator() {
  return {
    totalConsideredCount: 0,
    confirmedCount: 0,
    inferredCount: 0,
    uncertainCount: 0,
    missingCount: 0,
    missingSignals: [],
    uncertainSignals: [],
    blockerSignals: [],
    blockerDependsOnMissing: false,
    blockerDependsOnUncertain: false,
  };
}

function addTrustSignal(target, message) {
  if (!message) return;
  pushUniqueItem(target, String(message).trim());
}

function mergeTrustCounts(target, counts) {
  if (!counts) return;
  target.totalConsideredCount += toFiniteNumber(counts.totalConsideredCount);
  target.confirmedCount += toFiniteNumber(counts.confirmedCount);
  target.inferredCount += toFiniteNumber(counts.inferredCount);
  target.uncertainCount += toFiniteNumber(counts.uncertainCount);
  target.missingCount += toFiniteNumber(counts.missingCount);
}

function countTrustFromLines(lines = [], expectedLineCount = null) {
  const counts = {
    totalConsideredCount: 0,
    confirmedCount: 0,
    inferredCount: 0,
    uncertainCount: 0,
    missingCount: 0,
  };

  (lines || []).forEach((line) => {
    const isMissing =
      line?.status === "missing" || line?.mappingConfidence === "missing";
    const mappingConfidence = isMissing
      ? "missing"
      : line?.mappingConfidence || line?.status || "inferred";
    if (mappingConfidence === "confirmed") {
      counts.confirmedCount += 1;
    } else if (mappingConfidence === "inferred") {
      counts.inferredCount += 1;
    } else if (mappingConfidence === "uncertain") {
      counts.uncertainCount += 1;
    } else {
      counts.missingCount += 1;
    }
  });

  counts.totalConsideredCount =
    counts.confirmedCount +
    counts.inferredCount +
    counts.uncertainCount +
    counts.missingCount;

  if (expectedLineCount != null) {
    counts.totalConsideredCount = Math.max(
      counts.totalConsideredCount,
      Math.round(toFiniteNumber(expectedLineCount))
    );
  }

  return counts;
}

function collectLaunchReadinessTrustSignals(acc, launchReadiness = null) {
  if (!launchReadiness) return;
  if (toFiniteNumber(launchReadiness?.pricing?.missingCount) > 0) {
    addTrustSignal(
      acc.missingSignals,
      `${launchReadiness.pricing.missingCount} formula pricing line${
        launchReadiness.pricing.missingCount === 1 ? "" : "s"
      } are still missing in the active basket.`
    );
  }
  if (toFiniteNumber(launchReadiness?.pricing?.uncertainCount) > 0) {
    addTrustSignal(
      acc.uncertainSignals,
      `${launchReadiness.pricing.uncertainCount} formula supplier mapping${
        launchReadiness.pricing.uncertainCount === 1 ? "" : "s"
      } remain low-confidence.`
    );
  }
  if (
    String(launchReadiness?.compliance?.finishedProductStatus || "").includes(
      "missing"
    )
  ) {
    addTrustSignal(
      acc.missingSignals,
      "Finished-product IFRA guidance is partially blocked by missing data."
    );
  }
  if (launchReadiness?.blockers?.length) {
    addTrustSignal(acc.blockerSignals, launchReadiness.blockers[0]);
  } else if (launchReadiness?.cautions?.length) {
    addTrustSignal(acc.blockerSignals, launchReadiness.cautions[0]);
  }
}

function collectEconomicsTrustSignals(acc, economics = null) {
  if (!economics) return;
  if (economics?.status === "blocked" && economics?.pricingBlockers?.length) {
    addTrustSignal(acc.missingSignals, economics.pricingBlockers[0]);
    addTrustSignal(acc.blockerSignals, economics.pricingBlockers[0]);
  }
  const lowConfidenceCaution = (economics?.cautions || []).find((message) =>
    message?.toLowerCase?.().includes("low-confidence")
  );
  if (lowConfidenceCaution) {
    addTrustSignal(acc.uncertainSignals, lowConfidenceCaution);
  }
}

function collectLaunchPlanTrustSignals(acc, launchPlan = null) {
  if (!launchPlan) return;
  (launchPlan?.selectedItems || []).forEach((item) => {
    const expectedIngredientCount = Array.isArray(item?.formula?.ingredients)
      ? item.formula.ingredients.length
      : null;
    const basketCounts = countTrustFromLines(
      item?.selectedBasket?.lines || [],
      expectedIngredientCount
    );
    const basketMissingCount = toFiniteNumber(item?.selectedBasket?.missingCount);
    if (basketMissingCount > basketCounts.missingCount) {
      const delta = basketMissingCount - basketCounts.missingCount;
      basketCounts.missingCount += delta;
      basketCounts.totalConsideredCount += delta;
    }
    mergeTrustCounts(acc, basketCounts);
    collectLaunchReadinessTrustSignals(acc, item?.launchReadiness || null);
    collectEconomicsTrustSignals(acc, item?.economics || null);
  });

  const buyListCounts = countTrustFromLines(launchPlan?.buyListLines || []);
  mergeTrustCounts(acc, buyListCounts);

  if (toFiniteNumber(launchPlan?.shortageBasket?.missingCount) > 0) {
    addTrustSignal(
      acc.missingSignals,
      `${launchPlan.shortageBasket.missingCount} buy-list line${
        launchPlan.shortageBasket.missingCount === 1 ? "" : "s"
      } still lack supplier pricing.`
    );
  }
  if (toFiniteNumber(launchPlan?.shortageBasket?.uncertainCount) > 0) {
    addTrustSignal(
      acc.uncertainSignals,
      `${launchPlan.shortageBasket.uncertainCount} buy-list supplier mapping${
        launchPlan.shortageBasket.uncertainCount === 1 ? "" : "s"
      } remain low-confidence.`
    );
  }
  if (toFiniteNumber(launchPlan?.summary?.blockedEconomicsCount) > 0) {
    addTrustSignal(
      acc.missingSignals,
      `${launchPlan.summary.blockedEconomicsCount} selected formula${
        launchPlan.summary.blockedEconomicsCount === 1 ? "" : "s"
      } still have blocked SKU economics.`
    );
  }
  if (toFiniteNumber(launchPlan?.summary?.blockedReadinessCount) > 0) {
    addTrustSignal(
      acc.blockerSignals,
      `${launchPlan.summary.blockedReadinessCount} selected formula${
        launchPlan.summary.blockedReadinessCount === 1 ? "" : "s"
      } are still blocked in launch-readiness review.`
    );
  }
}

function finalizeFounderTrustSummary(acc) {
  const totalConsideredCount = Math.max(
    0,
    Math.round(toFiniteNumber(acc.totalConsideredCount))
  );
  const resolvedCount = acc.confirmedCount + acc.inferredCount;
  const confirmedCoveragePercent =
    totalConsideredCount > 0 ? (acc.confirmedCount / totalConsideredCount) * 100 : 0;
  const resolvedCoveragePercent =
    totalConsideredCount > 0 ? (resolvedCount / totalConsideredCount) * 100 : 0;

  let level = "supported";
  if (
    totalConsideredCount === 0 ||
    (acc.missingSignals.length > 0 && resolvedCoveragePercent < 50)
  ) {
    level = "blocked";
  } else if (acc.missingSignals.length > 0 || resolvedCoveragePercent < 70) {
    level = "sparse";
  } else if (acc.uncertainSignals.length > 0 || confirmedCoveragePercent < 65) {
    level = "mixed";
  }

  const levelMeta =
    FOUNDER_TRUST_LEVEL_META[level] || FOUNDER_TRUST_LEVEL_META.supported;
  const headline =
    level === "blocked"
      ? "Key founder outputs are still being pushed by missing pricing or compliance support."
      : level === "sparse"
      ? "The current output is usable, but sparse data is still shaping the result."
      : level === "mixed"
      ? "Most lines are modeled, but some supplier links are still inferred or uncertain."
      : "Most of the current output is backed by resolved supplier and pricing support.";
  const blockerSupportLine = acc.missingSignals.length
    ? "Some blockers or caveats are being driven by missing inputs, not only by resolved data."
    : acc.uncertainSignals.length
    ? "The current blocker/caveat read still depends partly on low-confidence inputs."
    : "The current blocker/caveat read is mostly being driven by resolved inputs.";

  return {
    level,
    levelMeta,
    totalConsideredCount,
    confirmedCount: Math.round(acc.confirmedCount),
    inferredCount: Math.round(acc.inferredCount),
    uncertainCount: Math.round(acc.uncertainCount),
    missingCount: Math.round(acc.missingCount),
    resolvedCount: Math.round(resolvedCount),
    confirmedCoveragePercent: Number(confirmedCoveragePercent.toFixed(1)),
    resolvedCoveragePercent: Number(resolvedCoveragePercent.toFixed(1)),
    dataSparse: level === "sparse" || level === "blocked",
    blockerDependsOnMissing: acc.missingSignals.length > 0,
    blockerDependsOnUncertain:
      acc.missingSignals.length === 0 && acc.uncertainSignals.length > 0,
    headline,
    blockerSupportLine,
    supportLabel: `${resolvedCoveragePercent.toFixed(
      0
    )}% resolved · ${confirmedCoveragePercent.toFixed(0)}% confirmed`,
    breakdownLabel: `${Math.round(acc.confirmedCount)} confirmed · ${Math.round(
      acc.inferredCount
    )} inferred · ${Math.round(acc.uncertainCount)} uncertain · ${Math.round(
      acc.missingCount
    )} missing`,
    missingSignals: acc.missingSignals.slice(0, 4),
    uncertainSignals: acc.uncertainSignals.slice(0, 4),
    blockerSignals: acc.blockerSignals.slice(0, 4),
  };
}

export function buildFounderTrustSummary({
  trustSummaries = [],
  basket = null,
  launchReadiness = null,
  economics = null,
  launchPlan = null,
  expectedLineCount = null,
  extraMissingSignals = [],
  extraUncertainSignals = [],
  extraBlockerSignals = [],
} = {}) {
  const acc = createFounderTrustAccumulator();

  if (Array.isArray(trustSummaries) && trustSummaries.length > 0) {
    trustSummaries.filter(Boolean).forEach((summary) => {
      mergeTrustCounts(acc, summary);
      (summary?.missingSignals || []).forEach((message) =>
        addTrustSignal(acc.missingSignals, message)
      );
      (summary?.uncertainSignals || []).forEach((message) =>
        addTrustSignal(acc.uncertainSignals, message)
      );
      (summary?.blockerSignals || []).forEach((message) =>
        addTrustSignal(acc.blockerSignals, message)
      );
    });
  } else {
    if (basket) {
      const basketCounts = countTrustFromLines(
        basket?.lines || [],
        expectedLineCount
      );
      const basketMissingCount = toFiniteNumber(basket?.missingCount);
      if (basketMissingCount > basketCounts.missingCount) {
        const delta = basketMissingCount - basketCounts.missingCount;
        basketCounts.missingCount += delta;
        basketCounts.totalConsideredCount += delta;
      }
      const basketUncertainCount = toFiniteNumber(basket?.uncertainCount);
      const currentLowConfidence =
        basketCounts.uncertainCount + basketCounts.missingCount;
      if (basketUncertainCount > basketCounts.uncertainCount) {
        const delta = basketUncertainCount - basketCounts.uncertainCount;
        basketCounts.uncertainCount += delta;
        if (basketCounts.totalConsideredCount < currentLowConfidence + delta) {
          basketCounts.totalConsideredCount += delta;
        }
      }
      mergeTrustCounts(acc, basketCounts);
    }
    collectLaunchReadinessTrustSignals(acc, launchReadiness);
    collectEconomicsTrustSignals(acc, economics);
    collectLaunchPlanTrustSignals(acc, launchPlan);
  }

  (extraMissingSignals || []).forEach((message) =>
    addTrustSignal(acc.missingSignals, message)
  );
  (extraUncertainSignals || []).forEach((message) =>
    addTrustSignal(acc.uncertainSignals, message)
  );
  (extraBlockerSignals || []).forEach((message) =>
    addTrustSignal(acc.blockerSignals, message)
  );

  return finalizeFounderTrustSummary(acc);
}

export function normalizeFounderLaunchPlanUnits(unitsByFormula = {}) {
  return Object.fromEntries(
    Object.entries(unitsByFormula || {})
      .map(([formulaKey, units]) => [
        String(formulaKey || "").trim(),
        Math.max(0, Math.round(toFiniteNumber(units))),
      ])
      .filter(([formulaKey, units]) => formulaKey && units > 0)
  );
}

export function buildFounderScenarioInputState({
  basketMode = "cheapest",
  dilType = "EDP",
  ifraCategory = "cat4",
  batchPlannerTargetG = 1000,
  dilAlcohol = false,
  skuFillVolumeMl = 50,
  skuRetailPrice = 95,
  skuPackagingCost = 4.5,
  skuLaborCost = 1.5,
  launchPlanUnitsByFormula = {},
} = {}) {
  return {
    basketMode: SUPPLIER_BASKET_MODE_META[basketMode] ? basketMode : "cheapest",
    dilType: String(dilType || "EDP").trim() || "EDP",
    ifraCategory: IFRA_CATEGORY_LABELS[ifraCategory] ? ifraCategory : "cat4",
    batchPlannerTargetG: Math.max(1, toFiniteNumber(batchPlannerTargetG, 1000)),
    dilAlcohol: Boolean(dilAlcohol),
    skuFillVolumeMl: Math.max(1, toFiniteNumber(skuFillVolumeMl, 50)),
    skuRetailPrice: Math.max(0, toFiniteNumber(skuRetailPrice, 95)),
    skuPackagingCost: Math.max(0, toFiniteNumber(skuPackagingCost, 4.5)),
    skuLaborCost: Math.max(0, toFiniteNumber(skuLaborCost, 1.5)),
    launchPlanUnitsByFormula:
      normalizeFounderLaunchPlanUnits(launchPlanUnitsByFormula),
  };
}

export function normalizeFounderLaunchScenarioRecord(record) {
  if (!record || typeof record !== "object") return null;
  const createdAt = record.createdAt || new Date().toISOString();
  const updatedAt = record.updatedAt || createdAt;
  return {
    id:
      String(record.id || "").trim() ||
      `launch-scenario-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`,
    name: String(record.name || "Launch Scenario").trim() || "Launch Scenario",
    createdAt,
    updatedAt,
    inputs: buildFounderScenarioInputState(record.inputs || {}),
  };
}

export function createFounderLaunchScenarioRecord({
  id = null,
  name = "Launch Scenario",
  inputs = {},
  createdAt = null,
  updatedAt = null,
} = {}) {
  const timestamp = new Date().toISOString();
  return normalizeFounderLaunchScenarioRecord({
    id:
      id ||
      `launch-scenario-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`,
    name,
    createdAt: createdAt || timestamp,
    updatedAt: updatedAt || timestamp,
    inputs,
  });
}

export function buildFounderScenarioShareBrief({
  scenario = null,
  snapshot = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const normalizedInputs = buildFounderScenarioInputState(
    snapshot?.normalizedScenario || scenario?.inputs || {}
  );
  const scenarioName =
    String(scenario?.name || "Launch Scenario").trim() || "Launch Scenario";
  const basketLabel =
    snapshot?.selectedBasketModeMeta?.label ||
    SUPPLIER_BASKET_MODE_META[normalizedInputs.basketMode]?.label ||
    normalizedInputs.basketMode;
  const fragranceLabel =
    snapshot?.selectedFragranceType?.label || normalizedInputs.dilType;
  const ifraLabel =
    IFRA_CATEGORY_LABELS[normalizedInputs.ifraCategory] ||
    normalizedInputs.ifraCategory;
  const diluentMaterialName =
    snapshot?.diluentMaterialName ||
    (normalizedInputs.dilAlcohol ? "Deluxe Perfumer's Alcohol" : "DPG");
  const launchRunPlannerSummary = snapshot?.launchRunPlannerSummary || null;
  const launchSummary = launchRunPlannerSummary?.summary || {};
  const trustSummary =
    launchRunPlannerSummary?.trustSummary ||
    buildFounderTrustSummary({
      launchPlan: launchRunPlannerSummary,
    });
  const selectedItems = launchRunPlannerSummary?.selectedItems || [];
  const formulaMixLines = selectedItems.length
    ? selectedItems.map(
        (item) => `- ${item.displayLabel}: ${item.units} unit${item.units === 1 ? "" : "s"}`
      )
    : Object.entries(normalizedInputs.launchPlanUnitsByFormula || {}).map(
        ([formulaKey, units]) =>
          `- ${formulaKey}: ${units} unit${units === 1 ? "" : "s"}`
      );
  const caveatLines =
    launchRunPlannerSummary?.capitalCaveats?.length > 0
      ? launchRunPlannerSummary.capitalCaveats.slice(0, 5).map((line) => `- ${line}`)
      : ["- No major caveat surfaced under the current runtime assumptions."];
  const topCapitalDriverLines =
    launchRunPlannerSummary?.topCapitalIngredients?.length > 0
      ? launchRunPlannerSummary.topCapitalIngredients
          .slice(0, 5)
          .map(
            (line) =>
              `- ${line.ingredientName}: $${toFiniteNumber(line.lineCost).toFixed(
                2
              )} estimated buy cost`
          )
      : ["- No capital gap driver surfaced in the current runtime."];

  return [
    `# Founder Launch Scenario Brief`,
    ``,
    `Scenario: ${scenarioName}`,
    `Generated: ${generatedAt}`,
    ``,
    `This brief reruns live founder math against the current formula library, pricing, inventory, and readiness signals. It is heuristic only, not an accounting statement.`,
    ``,
    `## Stored Scenario Context`,
    `- Basket mode: ${basketLabel}`,
    `- Fragrance/load context: ${fragranceLabel}`,
    `- IFRA category: ${ifraLabel}`,
    `- Batch target: ${toFiniteNumber(normalizedInputs.batchPlannerTargetG).toFixed(
      0
    )}g`,
    `- Diluent mode: ${
      normalizedInputs.dilAlcohol ? "Alcohol" : "Carrier"
    } (${diluentMaterialName})`,
    `- SKU fill: ${toFiniteNumber(normalizedInputs.skuFillVolumeMl).toFixed(
      0
    )}mL`,
    `- Retail price: $${toFiniteNumber(normalizedInputs.skuRetailPrice).toFixed(2)}`,
    `- Packaging cost: $${toFiniteNumber(normalizedInputs.skuPackagingCost).toFixed(
      2
    )}`,
    `- Labor buffer: $${toFiniteNumber(normalizedInputs.skuLaborCost).toFixed(2)}`,
    ``,
    `## Formula Mix`,
    ...(formulaMixLines.length ? formulaMixLines : ["- No formulas selected."]),
    ``,
    `## Live Runtime Snapshot`,
    `- Total units: ${Math.round(toFiniteNumber(launchSummary.totalUnits))}`,
    `- Launch cash need: $${toFiniteNumber(
      launchSummary.launchCashRequirement
    ).toFixed(2)}`,
    `- Estimated launch COGS: $${toFiniteNumber(
      launchSummary.estimatedTotalCogs
    ).toFixed(2)}`,
    `- Estimated revenue: $${toFiniteNumber(
      launchSummary.estimatedGrossRevenue
    ).toFixed(2)}`,
    `- Estimated gross profit: $${toFiniteNumber(
      launchSummary.estimatedGrossProfit
    ).toFixed(2)}`,
    `- Estimated gross margin: ${toFiniteNumber(
      launchSummary.estimatedGrossMarginPercent
    ).toFixed(1)}%`,
    `- Inventory shortages: ${Math.round(
      toFiniteNumber(launchSummary.shortageIngredientCount)
    )} ingredient line${Math.round(
      toFiniteNumber(launchSummary.shortageIngredientCount)
    ) === 1 ? "" : "s"} / ${toFiniteNumber(
      launchSummary.totalRawMaterialShortageG
    ).toFixed(1)}g short`,
    ``,
    `## Major Caveats / Blockers`,
    ...caveatLines,
    ``,
    `## Trust / Evidence Context`,
    `- Trust level: ${trustSummary.levelMeta.label}`,
    `- Support mix: ${trustSummary.breakdownLabel}`,
    `- Coverage: ${trustSummary.supportLabel}`,
    `- Read: ${trustSummary.blockerSupportLine}`,
    ...(trustSummary.missingSignals.length > 0
      ? [
          `- Main missing-data driver: ${trustSummary.missingSignals[0]}`,
        ]
      : trustSummary.uncertainSignals.length > 0
      ? [
          `- Main low-confidence driver: ${trustSummary.uncertainSignals[0]}`,
        ]
      : ["- No major trust gap surfaced in the current runtime snapshot."]),
    ``,
    `## Top Capital Drivers`,
    ...topCapitalDriverLines,
    ``,
    `## Note`,
    `- Current formulas, pricing, inventory, and compliance/readiness signals are live inputs, so rerunning this scenario later can change the numbers even if the stored scenario fields stay the same.`,
  ].join("\n");
}

function getBasketConsumedUnitCost(line) {
  const unitCost = Number(line?.line?.pricePerPurchasedGram);
  return Number.isFinite(unitCost) && unitCost >= 0 ? unitCost : null;
}

function getSkuEconomicsStatus({ pricingBlocked = false, grossMarginPercent = 0 }) {
  if (pricingBlocked) return "blocked";
  if (grossMarginPercent >= 78) return "strong";
  if (grossMarginPercent >= 60) return "workable";
  return "thin";
}

export function buildSkuEconomicsDashboardSummary(
  items = [],
  {
    fillVolumeMl = 50,
    fragranceLoadPercent = 20,
    packagingCost = 0,
    laborCost = 0,
    retailPrice = 95,
    diluentMaterialName = "Deluxe Perfumer's Alcohol",
    diluentBasket = null,
  } = {}
) {
  const normalizedFillVolumeMl = Math.max(1, toFiniteNumber(fillVolumeMl, 50));
  const normalizedFragranceLoadPercent = Math.min(
    100,
    Math.max(0, toFiniteNumber(fragranceLoadPercent, 20))
  );
  const normalizedPackagingCost = Math.max(0, toFiniteNumber(packagingCost));
  const normalizedLaborCost = Math.max(0, toFiniteNumber(laborCost));
  const normalizedRetailPrice = Math.max(0, toFiniteNumber(retailPrice));
  const finishedLiquidG = normalizedFillVolumeMl;
  const fragranceOilG =
    finishedLiquidG * (normalizedFragranceLoadPercent / 100);
  const diluentG = Math.max(0, finishedLiquidG - fragranceOilG);
  const diluentLine = diluentBasket?.lines?.[0] || null;
  const diluentUnitCost = getBasketConsumedUnitCost(diluentLine);
  const diluentCostPerSku =
    diluentUnitCost != null ? diluentUnitCost * diluentG : 0;
  const packagingAndLaborCost =
    normalizedPackagingCost + normalizedLaborCost;
  const topCostDriverMap = new Map();

  const economicsItems = items
    .map((item) => {
      const formula = item?.formula || null;
      const ingredients = Array.isArray(formula?.ingredients)
        ? formula.ingredients
        : [];
      const formulaTotalG = ingredients.reduce(
        (sum, ingredient) => sum + toFiniteNumber(ingredient?.g),
        0
      );
      const basketLines = item?.selectedBasket?.lines || [];
      const basketLineByName = new Map(
        basketLines.map((line) => [line.ingredientName, line])
      );
      const concentrateMaterialCost = ingredients.reduce((sum, ingredient) => {
        const basketLine = basketLineByName.get(ingredient.name);
        const unitCost = getBasketConsumedUnitCost(basketLine);
        return unitCost == null
          ? sum
          : sum + unitCost * toFiniteNumber(ingredient.g);
      }, 0);
      const concentrateUnitCost =
        formulaTotalG > 0 ? concentrateMaterialCost / formulaTotalG : 0;
      const fragranceOilCostPerSku = concentrateUnitCost * fragranceOilG;

      const ingredientCostDrivers = ingredients
        .map((ingredient) => {
          const formulaG = toFiniteNumber(ingredient.g);
          const basketLine = basketLineByName.get(ingredient.name);
          const unitCost = getBasketConsumedUnitCost(basketLine);
          const skuUsageG =
            formulaTotalG > 0 ? (formulaG / formulaTotalG) * fragranceOilG : 0;
          const perSkuCost = unitCost == null ? null : unitCost * skuUsageG;
          return {
            ingredientName: ingredient.name,
            note: ingredient.note || null,
            supplier: basketLine?.supplier || null,
            mappingConfidence: basketLine?.mappingConfidence || "missing",
            formulaG,
            skuUsageG,
            unitCost,
            perSkuCost,
          };
        })
        .sort((a, b) => (b.perSkuCost || 0) - (a.perSkuCost || 0));

      ingredientCostDrivers
        .filter((driver) => driver.perSkuCost != null)
        .slice(0, 5)
        .forEach((driver) => {
          const existing = topCostDriverMap.get(driver.ingredientName) || {
            ingredientName: driver.ingredientName,
            totalPerSkuCost: 0,
            formulaCount: 0,
            formulas: [],
          };
          existing.totalPerSkuCost += toFiniteNumber(driver.perSkuCost);
          existing.formulaCount += 1;
          pushUniqueItem(
            existing.formulas,
            item?.displayLabel || formula?.name || "Formula"
          );
          topCostDriverMap.set(driver.ingredientName, existing);
        });

      const missingIngredientCostCount = ingredientCostDrivers.filter(
        (driver) => driver.skuUsageG > 0 && driver.perSkuCost == null
      ).length;
      const pricingBlockers = [];
      const cautions = [];

      if (formulaTotalG <= 0) {
        pricingBlockers.push("Formula has no measurable concentrate grams.");
      }
      if (missingIngredientCostCount > 0) {
        pricingBlockers.push(
          `${missingIngredientCostCount} ingredient cost line${
            missingIngredientCostCount === 1 ? "" : "s"
          } are still missing in the current basket.`
        );
      }
      if (diluentG > 0 && diluentUnitCost == null) {
        pricingBlockers.push(
          `${diluentMaterialName} pricing is missing for the current finished-load scenario.`
        );
      }
      if (toFiniteNumber(item?.selectedBasket?.uncertainCount) > 0) {
        cautions.push(
          `${item.selectedBasket.uncertainCount} supplier mapping${
            item.selectedBasket.uncertainCount === 1 ? "" : "s"
          } remain low-confidence in the active basket.`
        );
      }
      if (item?.launchReadiness?.compliance?.hasHardBlock) {
        cautions.push("Compliance still shows a hard blocker in the current context.");
      }
      if (toFiniteNumber(item?.batchReport?.shortageCount) > 0) {
        cautions.push(
          `${item.batchReport.shortageCount} inventory shortage${
            item.batchReport.shortageCount === 1 ? "" : "s"
          } still affect launch readiness.`
        );
      }

      const liquidCostPerSku = fragranceOilCostPerSku + diluentCostPerSku;
      const estimatedCogs = liquidCostPerSku + packagingAndLaborCost;
      const grossProfit = normalizedRetailPrice - estimatedCogs;
      const grossMarginPercent =
        normalizedRetailPrice > 0
          ? (grossProfit / normalizedRetailPrice) * 100
          : 0;
      const status = getSkuEconomicsStatus({
        pricingBlocked: pricingBlockers.length > 0,
        grossMarginPercent,
      });
      const statusMeta =
        SKU_ECONOMICS_STATUS_META[status] || SKU_ECONOMICS_STATUS_META.blocked;
      const topCostDriver = ingredientCostDrivers.find(
        (driver) => driver.perSkuCost != null
      );

      const economicsItem = {
        formula,
        displayLabel: item?.displayLabel || formula?.name || "Formula",
        status,
        statusMeta,
        concentrateUnitCost,
        fragranceOilCostPerSku,
        diluentCostPerSku,
        liquidCostPerSku,
        packagingAndLaborCost,
        estimatedCogs,
        grossProfit,
        grossMarginPercent,
        retailPrice: normalizedRetailPrice,
        pricingBlockers,
        cautions,
        ingredientCostDrivers: ingredientCostDrivers.slice(0, 5),
        topCostDriver: topCostDriver
          ? {
              ingredientName: topCostDriver.ingredientName,
              perSkuCost: toFiniteNumber(topCostDriver.perSkuCost),
              supplier: topCostDriver.supplier || null,
            }
          : null,
        opsConstraint:
          item?.launchReadiness?.blockers?.[0] ||
          item?.launchReadiness?.cautions?.[0] ||
          item?.launchReadiness?.launchNote ||
          "No major ops blocker surfaced.",
        sourceBasket: item?.selectedBasket || null,
      };
      return {
        ...economicsItem,
        trustSummary: buildFounderTrustSummary({
          basket: item?.selectedBasket || null,
          launchReadiness: item?.launchReadiness || null,
          economics: economicsItem,
          expectedLineCount: ingredients.length,
        }),
      };
    })
    .sort((a, b) => {
      if (a.status === "blocked" && b.status !== "blocked") return 1;
      if (b.status === "blocked" && a.status !== "blocked") return -1;
      if (b.grossMarginPercent !== a.grossMarginPercent) {
        return b.grossMarginPercent - a.grossMarginPercent;
      }
      return a.displayLabel.localeCompare(b.displayLabel);
    });

  const modeledItems = economicsItems.filter((item) => item.status !== "blocked");
  const strongItems = modeledItems
    .filter((item) => item.status === "strong")
    .slice(0, 5);
  const poorItems = [...economicsItems]
    .filter((item) => item.status === "thin" || item.status === "blocked")
    .sort((a, b) => {
      if (a.status === "blocked" && b.status !== "blocked") return -1;
      if (b.status === "blocked" && a.status !== "blocked") return 1;
      return a.grossMarginPercent - b.grossMarginPercent;
    })
    .slice(0, 5);
  const topCostDrivers = Array.from(topCostDriverMap.values())
    .sort((a, b) => {
      if (b.totalPerSkuCost !== a.totalPerSkuCost) {
        return b.totalPerSkuCost - a.totalPerSkuCost;
      }
      return b.formulaCount - a.formulaCount;
    })
    .slice(0, 6);

  const averageCogs = modeledItems.length
    ? modeledItems.reduce((sum, item) => sum + item.estimatedCogs, 0) /
      modeledItems.length
    : 0;
  const averageMarginPercent = modeledItems.length
    ? modeledItems.reduce((sum, item) => sum + item.grossMarginPercent, 0) /
      modeledItems.length
    : 0;
  const bestMarginPercent = modeledItems.length
    ? Math.max(...modeledItems.map((item) => item.grossMarginPercent))
    : 0;
  const worstMarginPercent = modeledItems.length
    ? Math.min(...modeledItems.map((item) => item.grossMarginPercent))
    : 0;
  const trustSummary = buildFounderTrustSummary({
    trustSummaries: economicsItems.map((item) => item.trustSummary).filter(Boolean),
    extraMissingSignals:
      economicsItems.filter((item) => item.status === "blocked").length > 0
        ? [
            `${economicsItems.filter((item) => item.status === "blocked").length} formula${
              economicsItems.filter((item) => item.status === "blocked").length === 1
                ? ""
                : "s"
            } still have blocked SKU economics.`,
          ]
        : [],
  });

  return {
    items: economicsItems,
    strongItems,
    poorItems,
    topCostDrivers,
    trustSummary,
    context: {
      fillVolumeMl: normalizedFillVolumeMl,
      fragranceLoadPercent: normalizedFragranceLoadPercent,
      fragranceOilG,
      diluentG,
      packagingCost: normalizedPackagingCost,
      laborCost: normalizedLaborCost,
      retailPrice: normalizedRetailPrice,
      diluentMaterialName,
      diluentCostPerSku,
      diluentBasket,
      hasDiluentPricing: diluentG <= 0 || diluentUnitCost != null,
    },
    summary: {
      formulaCount: economicsItems.length,
      modeledCount: modeledItems.length,
      blockedCount: economicsItems.filter((item) => item.status === "blocked")
        .length,
      strongCount: economicsItems.filter((item) => item.status === "strong")
        .length,
      thinCount: economicsItems.filter((item) => item.status === "thin").length,
      averageCogs,
      averageMarginPercent,
      bestMarginPercent,
      worstMarginPercent,
    },
  };
}

export function buildLaunchRunPlannerSummary({
  founderItems = [],
  economicsItems = [],
  selectedUnitsByFormula = {},
  inventory = {},
  pricesState,
  basketMode = "cheapest",
  fillVolumeMl = 50,
  fragranceLoadPercent = 20,
  packagingCost = 0,
  laborCost = 0,
  retailPrice = 95,
  diluentMaterialName = "Deluxe Perfumer's Alcohol",
  formulaSupplierOverridesByFormula = {},
  db = {},
  pricing = {},
} = {}) {
  const normalizedFillVolumeMl = Math.max(1, toFiniteNumber(fillVolumeMl, 50));
  const normalizedFragranceLoadPercent = Math.min(
    100,
    Math.max(0, toFiniteNumber(fragranceLoadPercent, 20))
  );
  const normalizedPackagingCost = Math.max(0, toFiniteNumber(packagingCost));
  const normalizedLaborCost = Math.max(0, toFiniteNumber(laborCost));
  const normalizedRetailPrice = Math.max(0, toFiniteNumber(retailPrice));
  const fragranceOilPerSkuG =
    normalizedFillVolumeMl * (normalizedFragranceLoadPercent / 100);
  const diluentPerSkuG = Math.max(0, normalizedFillVolumeMl - fragranceOilPerSkuG);
  const economicsByFormulaKey = new Map(
    economicsItems
      .filter((item) => item?.formula?.formulaKey)
      .map((item) => [item.formula.formulaKey, item])
  );
  const ingredientDemandMap = new Map();
  const overrideTracker = new Map();
  const selectedItems = [];
  let totalUnits = 0;

  founderItems.forEach((item) => {
    const formula = item?.formula || null;
    const formulaKey = formula?.formulaKey || null;
    const units = Math.max(
      0,
      Math.round(toFiniteNumber(selectedUnitsByFormula?.[formulaKey], 0))
    );
    if (!formulaKey || units <= 0) return;

    const ingredients = Array.isArray(formula?.ingredients)
      ? formula.ingredients
      : [];
    const formulaTotalG = ingredients.reduce(
      (sum, ingredient) => sum + toFiniteNumber(ingredient?.g),
      0
    );
    const displayLabel = item?.displayLabel || formula?.name || "Formula";
    const economics = economicsByFormulaKey.get(formulaKey) || null;

    totalUnits += units;

    ingredients.forEach((ingredient) => {
      const ingredientName = ingredient?.name;
      if (!ingredientName || formulaTotalG <= 0) return;
      const requiredG =
        (toFiniteNumber(ingredient.g) / formulaTotalG) *
        fragranceOilPerSkuG *
        units;
      if (requiredG <= 0) return;

      const existing = ingredientDemandMap.get(ingredientName) || {
        name: ingredientName,
        note: ingredient?.note || getDbNote(db, ingredientName),
        requiredG: 0,
        formulas: [],
      };
      existing.requiredG += requiredG;
      pushUniqueItem(existing.formulas, displayLabel);
      ingredientDemandMap.set(ingredientName, existing);

      const overrideSupplier =
        formulaSupplierOverridesByFormula?.[formulaKey]?.[ingredientName] || null;
      if (overrideSupplier) {
        const overrideSet = overrideTracker.get(ingredientName) || new Set();
        overrideSet.add(overrideSupplier);
        overrideTracker.set(ingredientName, overrideSet);
      }
    });

    selectedItems.push({
      formula,
      displayLabel,
      units,
      economics,
      launchReadiness: item?.launchReadiness || null,
      selectedBasket: item?.selectedBasket || null,
      totalFinishedLiquidG: units * normalizedFillVolumeMl,
      totalFragranceOilG: units * fragranceOilPerSkuG,
      totalDiluentG: units * diluentPerSkuG,
    });
  });

  if (totalUnits > 0 && diluentPerSkuG > 0) {
    const existing = ingredientDemandMap.get(diluentMaterialName) || {
      name: diluentMaterialName,
      note: getDbNote(db, diluentMaterialName, "carrier"),
      requiredG: 0,
      formulas: [],
    };
    existing.requiredG += totalUnits * diluentPerSkuG;
    pushUniqueItem(existing.formulas, "Shared diluent context");
    ingredientDemandMap.set(diluentMaterialName, existing);
  }

  const aggregatedSupplierOverrides = {};
  const conflictingOverrideIngredients = [];
  Array.from(overrideTracker.entries()).forEach(([ingredientName, suppliers]) => {
    const supplierList = Array.from(suppliers);
    if (supplierList.length === 1) {
      aggregatedSupplierOverrides[ingredientName] = supplierList[0];
    } else if (supplierList.length > 1) {
      conflictingOverrideIngredients.push({
        ingredientName,
        suppliers: supplierList,
      });
    }
  });

  const ingredientLines = Array.from(ingredientDemandMap.values())
    .map((line) => {
      const onHand = Math.max(0, toFiniteNumber(inventory?.[line.name]?.qty));
      const coveredG = Math.min(onHand, line.requiredG);
      const shortageG = Math.max(0, line.requiredG - onHand);
      return {
        ...line,
        onHand,
        coveredG,
        shortageG,
        remainingAfterPlanG: Math.max(0, onHand - line.requiredG),
        coveragePercent: line.requiredG > 0 ? (coveredG / line.requiredG) * 100 : 100,
        isBlocked: shortageG > BATCH_PLANNER_SHORTAGE_TOLERANCE,
      };
    })
    .sort((a, b) => b.requiredG - a.requiredG);

  const shortageIngredients = ingredientLines
    .filter((line) => line.isBlocked)
    .map((line) => ({
      name: line.name,
      note: line.note,
      g: line.shortageG,
    }));
  const shortageBasketStrategies = shortageIngredients.length
    ? buildSupplierBasketStrategies(
        shortageIngredients,
        pricesState,
        aggregatedSupplierOverrides,
        { db, pricing }
      )
    : null;
  const shortageBasket =
    shortageBasketStrategies?.[basketMode] || shortageBasketStrategies?.cheapest || null;
  const shortageLineByName = new Map(
    shortageIngredients.map((line) => [line.name, line])
  );

  const buyListLines = (shortageBasket?.lines || [])
    .map((line) => {
      const shortageLine = shortageLineByName.get(line.ingredientName);
      return {
        ingredientName: line.ingredientName,
        note: shortageLine?.note || null,
        shortageG: toFiniteNumber(shortageLine?.g),
        supplier: line.supplier || null,
        lineCost: toFiniteNumber(line.lineCost),
        buyText: line.buyText || "—",
        mappingConfidence: line.mappingConfidence || "missing",
        status: line.status || "missing",
        confidenceNote: line.confidenceNote || "",
        forcedByOverride: Boolean(line.forcedByOverride),
      };
    })
    .sort((a, b) => {
      if (b.lineCost !== a.lineCost) return b.lineCost - a.lineCost;
      return b.shortageG - a.shortageG;
    });

  const topCapitalIngredients = buyListLines.slice(0, 6);
  const selectedFormulaCount = selectedItems.length;
  const selectedBlockedReadinessItems = selectedItems.filter(
    (item) => item.launchReadiness?.status === "blocked"
  );
  const selectedCautionItems = selectedItems.filter(
    (item) =>
      item.launchReadiness?.status !== "blocked" &&
      (item.launchReadiness?.cautions?.length > 0 ||
        toFiniteNumber(item.selectedBasket?.uncertainCount) > 0)
  );
  const blockedEconomicsItems = selectedItems.filter(
    (item) => !item.economics || item.economics.status === "blocked"
  );
  const modeledEconomicsItems = selectedItems.filter(
    (item) => item.economics && item.economics.status !== "blocked"
  );
  const totalPackagingLaborCost =
    totalUnits * (normalizedPackagingCost + normalizedLaborCost);
  const estimatedGrossRevenue = totalUnits * normalizedRetailPrice;
  const estimatedTotalCogs = modeledEconomicsItems.reduce(
    (sum, item) => sum + toFiniteNumber(item.economics?.estimatedCogs) * item.units,
    0
  );
  const estimatedRawMaterialCogs = modeledEconomicsItems.reduce(
    (sum, item) => {
      const liquidCostPerSku =
        toFiniteNumber(item.economics?.fragranceOilCostPerSku) +
        toFiniteNumber(item.economics?.diluentCostPerSku);
      return sum + liquidCostPerSku * item.units;
    },
    0
  );
  const estimatedGrossProfit = estimatedGrossRevenue - estimatedTotalCogs;
  const estimatedGrossMarginPercent =
    estimatedGrossRevenue > 0
      ? (estimatedGrossProfit / estimatedGrossRevenue) * 100
      : 0;
  const totalRawMaterialRequiredG = ingredientLines.reduce(
    (sum, line) => sum + line.requiredG,
    0
  );
  const totalRawMaterialCoveredG = ingredientLines.reduce(
    (sum, line) => sum + line.coveredG,
    0
  );
  const totalRawMaterialShortageG = ingredientLines.reduce(
    (sum, line) => sum + line.shortageG,
    0
  );
  const materialGapCapitalRequired = toFiniteNumber(shortageBasket?.totalCost);
  const launchCashRequirement = materialGapCapitalRequired + totalPackagingLaborCost;
  const capitalCaveats = [];

  if (blockedEconomicsItems.length > 0) {
    capitalCaveats.push(
      `${blockedEconomicsItems.length} selected formula${
        blockedEconomicsItems.length === 1 ? "" : "s"
      } still have blocked SKU economics, so modeled launch COGS stays partial.`
    );
  }
  if (toFiniteNumber(shortageBasket?.missingCount) > 0) {
    capitalCaveats.push(
      `${shortageBasket.missingCount} shortage buy-list line${
        shortageBasket.missingCount === 1 ? "" : "s"
      } still lack supplier pricing.`
    );
  }
  if (conflictingOverrideIngredients.length > 0) {
    capitalCaveats.push(
      `${conflictingOverrideIngredients.length} ingredient override conflict${
        conflictingOverrideIngredients.length === 1 ? "" : "s"
      } were left to the shared basket mode.`
    );
  }
  if (selectedBlockedReadinessItems.length > 0) {
    capitalCaveats.push(
      `${selectedBlockedReadinessItems.length} selected formula${
        selectedBlockedReadinessItems.length === 1 ? "" : "s"
      } are still blocked in launch-readiness review.`
    );
  }
  if (selectedCautionItems.length > 0) {
    capitalCaveats.push(
      `${selectedCautionItems.length} selected formula${
        selectedCautionItems.length === 1 ? "" : "s"
      } still carry caution-level data or inventory risk.`
    );
  }

  const launchPlanResult = {
    context: {
      fillVolumeMl: normalizedFillVolumeMl,
      fragranceLoadPercent: normalizedFragranceLoadPercent,
      fragranceOilPerSkuG,
      diluentPerSkuG,
      packagingCost: normalizedPackagingCost,
      laborCost: normalizedLaborCost,
      retailPrice: normalizedRetailPrice,
      diluentMaterialName,
    },
    selectedItems,
    ingredientLines,
    buyListLines,
    topCapitalIngredients,
    shortageBasket,
    aggregatedSupplierOverrides,
    conflictingOverrideIngredients,
    capitalCaveats,
    summary: {
      selectedFormulaCount,
      totalUnits,
      modeledFormulaCount: modeledEconomicsItems.length,
      blockedEconomicsCount: blockedEconomicsItems.length,
      blockedReadinessCount: selectedBlockedReadinessItems.length,
      cautionFormulaCount: selectedCautionItems.length,
      totalRawMaterialRequiredG,
      totalRawMaterialCoveredG,
      totalRawMaterialShortageG,
      shortageIngredientCount: ingredientLines.filter((line) => line.isBlocked).length,
      totalPackagingLaborCost,
      estimatedRawMaterialCogs,
      estimatedTotalCogs,
      estimatedGrossRevenue,
      estimatedGrossProfit,
      estimatedGrossMarginPercent,
      materialGapCapitalRequired,
      launchCashRequirement,
      isPartialEconomics: blockedEconomicsItems.length > 0,
    },
  };
  const trustSummary = buildFounderTrustSummary({
    launchPlan: launchPlanResult,
  });

  return {
    ...launchPlanResult,
    trustSummary,
  };
}

export const FOUNDER_RECOMMENDER_EMPHASIS_META = {
  balanced: {
    label: "Balanced",
    description: "Blend readiness, margin, and capital efficiency.",
  },
  best_margin: {
    label: "Best Margin",
    description: "Prioritize stronger gross margin when capital still fits.",
  },
  lowest_capital: {
    label: "Lowest Capital",
    description: "Favor formulas that fit under tighter launch cash.",
  },
  best_readiness: {
    label: "Best Readiness",
    description: "Lean toward formulas that look cleaner to launch today.",
  },
};

function clampUnitInterval(value) {
  return Math.max(0, Math.min(1, toFiniteNumber(value)));
}

function getFounderRecommendationWeights(emphasisMode = "balanced") {
  switch (emphasisMode) {
    case "best_margin":
      return {
        readiness: 0.22,
        margin: 0.4,
        capitalEfficiency: 0.26,
        lowCapital: 0.12,
      };
    case "lowest_capital":
      return {
        readiness: 0.2,
        margin: 0.12,
        capitalEfficiency: 0.2,
        lowCapital: 0.48,
      };
    case "best_readiness":
      return {
        readiness: 0.46,
        margin: 0.2,
        capitalEfficiency: 0.18,
        lowCapital: 0.16,
      };
    default:
      return {
        readiness: 0.32,
        margin: 0.24,
        capitalEfficiency: 0.24,
        lowCapital: 0.2,
      };
  }
}

function buildRecommendationReasonList(candidate) {
  const reasons = [];
  if (candidate.readinessScore >= 78) {
    reasons.push(
      `High launch-readiness score (${candidate.readinessScore.toFixed(0)}).`
    );
  } else if (candidate.readinessScore >= 55) {
    reasons.push(
      `Usable readiness score (${candidate.readinessScore.toFixed(0)}) with cleanup still needed.`
    );
  }
  if (candidate.marginPercent >= 75) {
    reasons.push(
      `Strong gross margin (${candidate.marginPercent.toFixed(0)}%).`
    );
  } else if (candidate.marginPercent >= 55) {
    reasons.push(
      `Workable gross margin (${candidate.marginPercent.toFixed(0)}%).`
    );
  }
  if (candidate.launchCashNeed <= candidate.budget * 0.2) {
    reasons.push(
      `Capital-light at $${candidate.launchCashNeed.toFixed(2)} launch cash.`
    );
  }
  if (candidate.planSummary.shortageIngredientCount === 0) {
    reasons.push("No shortage buy-list line is blocking this mix right now.");
  }
  if (candidate.topCapitalDriver) {
    reasons.push(
      `Main capital driver is ${candidate.topCapitalDriver.ingredientName}.`
    );
  }
  return reasons.slice(0, 3);
}

export function buildCapitalConstrainedLaunchRecommendation({
  founderItems = [],
  economicsItems = [],
  selectedUnitsByFormula = {},
  inventory = {},
  pricesState = {},
  basketMode = "cheapest",
  fillVolumeMl = 50,
  fragranceLoadPercent = 20,
  packagingCost = 0,
  laborCost = 0,
  retailPrice = 95,
  diluentMaterialName = "Deluxe Perfumer's Alcohol",
  formulaSupplierOverridesByFormula = {},
  budget = 2500,
  skuLimit = null,
  emphasisMode = "balanced",
  defaultUnitsPerFormula = 24,
  db = {},
  pricing = {},
} = {}) {
  const normalizedBudget = Math.max(0, toFiniteNumber(budget, 2500));
  const normalizedSkuLimit =
    skuLimit == null || skuLimit === ""
      ? null
      : Math.max(1, Math.round(toFiniteNumber(skuLimit, 1)));
  const normalizedDefaultUnits = Math.max(
    1,
    Math.round(toFiniteNumber(defaultUnitsPerFormula, 24))
  );
  const normalizedEmphasisMode = FOUNDER_RECOMMENDER_EMPHASIS_META[emphasisMode]
    ? emphasisMode
    : "balanced";
  const emphasisMeta =
    FOUNDER_RECOMMENDER_EMPHASIS_META[normalizedEmphasisMode] ||
    FOUNDER_RECOMMENDER_EMPHASIS_META.balanced;
  const weights = getFounderRecommendationWeights(normalizedEmphasisMode);
  const economicsByFormulaKey = new Map(
    (economicsItems || [])
      .filter((item) => item?.formula?.formulaKey)
      .map((item) => [item.formula.formulaKey, item])
  );

  const rawCandidates = (founderItems || [])
    .map((item) => {
      const formula = item?.formula || null;
      const formulaKey = formula?.formulaKey || null;
      if (!formulaKey) return null;
      const economics = economicsByFormulaKey.get(formulaKey) || null;
      const recommendedUnits = Math.max(
        1,
        Math.round(
          toFiniteNumber(
            selectedUnitsByFormula?.[formulaKey],
            normalizedDefaultUnits
          )
        )
      );
      const singleFormulaPlan = buildLaunchRunPlannerSummary({
        founderItems,
        economicsItems,
        selectedUnitsByFormula: {
          [formulaKey]: recommendedUnits,
        },
        inventory,
        pricesState,
        basketMode,
        fillVolumeMl,
        fragranceLoadPercent,
        packagingCost,
        laborCost,
        retailPrice,
        diluentMaterialName,
        formulaSupplierOverridesByFormula,
        db,
        pricing,
      });
      const planSummary = singleFormulaPlan.summary;
      const readiness = item?.launchReadiness || {};
      const readinessBlocker = readiness?.blockers?.[0] || null;
      const economicsBlocker =
        economics?.status === "blocked"
          ? economics?.pricingBlockers?.[0] || "SKU economics are still blocked."
          : null;
      const hardBlockReason = readinessBlocker || economicsBlocker || null;
      const candidate = {
        item,
        formula,
        formulaKey,
        displayLabel: item?.displayLabel || formula?.name || "Formula",
        economics,
        recommendedUnits,
        usedCurrentUnits: toFiniteNumber(selectedUnitsByFormula?.[formulaKey]) > 0,
        plan: singleFormulaPlan,
        planSummary,
        readinessScore: toFiniteNumber(readiness?.totalScore),
        marginPercent: toFiniteNumber(economics?.grossMarginPercent),
        launchCashNeed: toFiniteNumber(planSummary.launchCashRequirement),
        revenue: toFiniteNumber(planSummary.estimatedGrossRevenue),
        profit: toFiniteNumber(planSummary.estimatedGrossProfit),
        hardBlockReason,
        topCapitalDriver: singleFormulaPlan.topCapitalIngredients?.[0] || null,
        budget: normalizedBudget,
      };
      return {
        ...candidate,
        trustSummary: buildFounderTrustSummary({
          launchPlan: singleFormulaPlan,
          extraBlockerSignals: hardBlockReason ? [hardBlockReason] : [],
        }),
      };
    })
    .filter(Boolean);

  const viableCandidates = rawCandidates.filter((candidate) => !candidate.hardBlockReason);
  const maxLaunchCash = Math.max(
    1,
    ...viableCandidates.map((candidate) => candidate.launchCashNeed)
  );
  const maxProfitPerDollar = Math.max(
    1,
    ...viableCandidates.map((candidate) =>
      candidate.launchCashNeed > 0
        ? Math.max(0, candidate.profit / candidate.launchCashNeed)
        : 0
    )
  );

  const rankedCandidates = rawCandidates
    .map((candidate) => {
      const lowCapitalScore =
        candidate.hardBlockReason
          ? 0
          : clampUnitInterval(1 - candidate.launchCashNeed / maxLaunchCash);
      const marginScore = clampUnitInterval(candidate.marginPercent / 100);
      const readinessScore = clampUnitInterval(candidate.readinessScore / 100);
      const capitalEfficiencyScore =
        candidate.hardBlockReason || candidate.launchCashNeed <= 0
          ? 0
          : clampUnitInterval(
              Math.max(0, candidate.profit / candidate.launchCashNeed) /
                maxProfitPerDollar
            );
      const cautionPenalty =
        Math.min(
          0.18,
          (candidate.item?.launchReadiness?.cautions?.length || 0) * 0.04 +
            (candidate.economics?.cautions?.length || 0) * 0.03
        ) + (candidate.planSummary.shortageIngredientCount > 0 ? 0.04 : 0);
      const blockerPenalty = candidate.hardBlockReason ? 0.65 : 0;
      const weightedScore =
        readinessScore * weights.readiness +
        marginScore * weights.margin +
        capitalEfficiencyScore * weights.capitalEfficiency +
        lowCapitalScore * weights.lowCapital -
        cautionPenalty -
        blockerPenalty;
      return {
        ...candidate,
        lowCapitalScore,
        marginScore,
        readinessSignal: readinessScore,
        capitalEfficiencyScore,
        totalScore: Number((weightedScore * 100).toFixed(1)),
      };
    })
    .sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.readinessScore !== a.readinessScore) {
        return b.readinessScore - a.readinessScore;
      }
      if (b.marginPercent !== a.marginPercent) {
        return b.marginPercent - a.marginPercent;
      }
      return a.displayLabel.localeCompare(b.displayLabel);
    });

  const selectedCandidates = [];
  const excludedCandidates = [];
  let remainingBudget = normalizedBudget;

  rankedCandidates.forEach((candidate) => {
    if (candidate.hardBlockReason) {
      excludedCandidates.push({
        ...candidate,
        exclusionReason: candidate.hardBlockReason,
      });
      return;
    }
    if (
      normalizedSkuLimit != null &&
      selectedCandidates.length >= normalizedSkuLimit
    ) {
      excludedCandidates.push({
        ...candidate,
        exclusionReason:
          "Skipped because the SKU limit was already filled by higher-priority formulas.",
      });
      return;
    }
    if (candidate.launchCashNeed > remainingBudget + 0.0001) {
      excludedCandidates.push({
        ...candidate,
        exclusionReason: `Needs $${Math.max(
          0,
          candidate.launchCashNeed - remainingBudget
        ).toFixed(2)} more launch cash at the current units.`,
      });
      return;
    }
    selectedCandidates.push({
      ...candidate,
      inclusionReasons: buildRecommendationReasonList(candidate),
    });
    remainingBudget = Math.max(0, remainingBudget - candidate.launchCashNeed);
  });

  const recommendedUnitsByFormula = Object.fromEntries(
    selectedCandidates.map((candidate) => [
      candidate.formulaKey,
      candidate.recommendedUnits,
    ])
  );

  const recommendedLaunchPlan = buildLaunchRunPlannerSummary({
    founderItems,
    economicsItems,
    selectedUnitsByFormula: recommendedUnitsByFormula,
    inventory,
    pricesState,
    basketMode,
    fillVolumeMl,
    fragranceLoadPercent,
    packagingCost,
    laborCost,
    retailPrice,
    diluentMaterialName,
    formulaSupplierOverridesByFormula,
    db,
    pricing,
  });

  const nextUnlockCandidate =
    excludedCandidates.find(
      (candidate) =>
        !candidate.hardBlockReason &&
        candidate.exclusionReason?.includes("launch cash")
    ) || null;
  const additionalCapitalToUnlockNext = nextUnlockCandidate
    ? Math.max(0, nextUnlockCandidate.launchCashNeed - remainingBudget)
    : 0;
  const recommendedFormulaCount = selectedCandidates.length;
  const trustSummary = buildFounderTrustSummary({
    launchPlan: recommendedLaunchPlan,
    extraBlockerSignals:
      excludedCandidates.filter((candidate) => candidate.hardBlockReason).length > 0
        ? [
            `${excludedCandidates.filter((candidate) => candidate.hardBlockReason).length} higher-ranked formula${
              excludedCandidates.filter((candidate) => candidate.hardBlockReason)
                .length === 1
                ? ""
                : "s"
            } were excluded because the current data still block them.`,
          ]
        : [],
  });

  return {
    emphasisMode: normalizedEmphasisMode,
    emphasisMeta,
    budget: normalizedBudget,
    remainingBudget,
    skuLimit: normalizedSkuLimit,
    defaultUnitsPerFormula: normalizedDefaultUnits,
    selectedCandidates,
    excludedCandidates,
    rankedCandidates,
    recommendedUnitsByFormula,
    recommendedLaunchPlan,
    trustSummary,
    nextUnlockCandidate,
    additionalCapitalToUnlockNext,
    summary: {
      recommendedFormulaCount,
      totalUnits: toFiniteNumber(recommendedLaunchPlan.summary.totalUnits),
      launchCashNeed: toFiniteNumber(
        recommendedLaunchPlan.summary.launchCashRequirement
      ),
      estimatedRevenue: toFiniteNumber(
        recommendedLaunchPlan.summary.estimatedGrossRevenue
      ),
      estimatedTotalCogs: toFiniteNumber(
        recommendedLaunchPlan.summary.estimatedTotalCogs
      ),
      estimatedGrossProfit: toFiniteNumber(
        recommendedLaunchPlan.summary.estimatedGrossProfit
      ),
      estimatedGrossMarginPercent: toFiniteNumber(
        recommendedLaunchPlan.summary.estimatedGrossMarginPercent
      ),
      shortageIngredientCount: toFiniteNumber(
        recommendedLaunchPlan.summary.shortageIngredientCount
      ),
      blockedExcludedCount: excludedCandidates.filter(
        (candidate) => candidate.hardBlockReason
      ).length,
      overBudgetExcludedCount: excludedCandidates.filter((candidate) =>
        candidate.exclusionReason?.includes("launch cash")
      ).length,
    },
  };
}

function getMaterialLogVp(record = {}) {
  const vp = Number(record?.VP);
  if (!Number.isFinite(vp) || vp <= 0) return null;
  return Math.log10(vp);
}

function getMaterialDiffusionProxy(record = {}) {
  const vp = Math.max(Number(record?.VP) || 0, 1e-9);
  const mw = Math.max(Number(record?.MW) || 0, 50);
  return (Math.sqrt(vp) / Math.sqrt(mw)) * 100;
}

function getMaterialPersistenceProxy(record = {}) {
  const xLogP = Number(record?.xLogP) || 0;
  const logVp = Math.log10(1 / Math.max(Number(record?.VP) || 0, 1e-9));
  const noteWeight =
    record?.note === "base" ? 1.2 : record?.note === "mid" ? 0.5 : 0;
  return xLogP * 1.75 + logVp * 2 + noteWeight;
}

function getBehaviorBand(value, { high, mid, highLabel, midLabel, lowLabel }) {
  if (value == null || !Number.isFinite(value)) return "Unknown";
  if (value >= high) return highLabel;
  if (value >= mid) return midLabel;
  return lowLabel;
}

function getMaterialDescriptorTags(record = {}) {
  if (Array.isArray(record?.descriptorTags) && record.descriptorTags.length) {
    return record.descriptorTags.map((tag) => String(tag));
  }
  const fallback = [
    record?.scentClass,
    record?.note,
    ...(String(record?.scentSummary || "")
      .split(/[^A-Za-z0-9]+/)
      .filter((token) => token.length > 3)
      .slice(0, 3) || []),
  ].filter(Boolean);
  return Array.from(new Set(fallback));
}

function getSharedMaterialTraits(originalRecord = {}, candidateRecord = {}) {
  const originalTags = new Set(
    getMaterialDescriptorTags(originalRecord).map((tag) => String(tag).toLowerCase())
  );
  const candidateTags = getMaterialDescriptorTags(candidateRecord).filter((tag) =>
    originalTags.has(String(tag).toLowerCase())
  );
  const traits = [];
  if (originalRecord.note && originalRecord.note === candidateRecord.note) {
    traits.push(`${originalRecord.note} note role`);
  }
  if (
    originalRecord.scentClass &&
    originalRecord.scentClass === candidateRecord.scentClass
  ) {
    traits.push(`${originalRecord.scentClass.toLowerCase()} family`);
  }
  if (originalRecord.type && originalRecord.type === candidateRecord.type) {
    traits.push(`${originalRecord.type} material type`);
  }
  candidateTags.slice(0, 2).forEach((tag) => traits.push(`${tag} tag`));
  return Array.from(new Set(traits));
}

function buildSubstitutionReason({
  mode,
  originalName,
  candidateName,
  originalRecord,
  candidateRecord,
  baselineCost,
  candidateCost,
  amountG,
  ifraCategory,
  originalLimit,
  candidateLimit,
}) {
  const sharedTraits = getSharedMaterialTraits(originalRecord, candidateRecord);
  const sharedTraitText = sharedTraits.length
    ? ` while staying close on ${formatHumanList(sharedTraits, 2)}`
    : "";

  if (mode === "cheaper") {
    return `Estimated line cost for ${amountG.toFixed(1)}g is lower at $${
      candidateCost?.toFixed(2) || "—"
    } versus $${baselineCost?.toFixed(2) || "—"}${sharedTraitText}.`;
  }
  if (mode === "compliance") {
    return `Current ${IFRA_CATEGORY_LABELS?.[ifraCategory] || ifraCategory} limit is ${
      candidateLimit != null ? `${candidateLimit}%` : "not resolved"
    } versus ${
      originalLimit != null ? `${originalLimit}%` : "not resolved"
    } for ${originalName}.${sharedTraitText}`;
  }
  if (mode === "diffusive") {
    return `Higher diffusion proxy than ${originalName}${sharedTraitText}. Treat this as a more projecting, not exact, swap.`;
  }
  if (mode === "persistent") {
    return `Higher persistence proxy than ${originalName}${sharedTraitText}. Treat this as a longer-wearing, not exact, swap.`;
  }
  return `Closest stylistic fit to ${originalName} from the current metadata, note-role, family, and technical-signal overlap${sharedTraitText}.`;
}

function buildMaterialLineEstimate(
  materialName,
  amountG,
  { db = {}, pricesState, pricing = {}, basketMode = "cheapest" } = {}
) {
  const strategies = buildSupplierBasketStrategies(
    [
      {
        name: materialName,
        g: Math.max(0.0001, Number(amountG) || 0.0001),
        note: getDbNote(db, materialName),
      },
    ],
    pricesState,
    {},
    { db, pricing }
  );
  const basket = strategies[basketMode] || strategies.cheapest;
  return basket?.lines?.[0] || null;
}

export function replaceIngredientInItems(
  items = [],
  originalName,
  candidateName,
  { db = {} } = {}
) {
  const mergedByName = new Map();

  (items || []).forEach((item) => {
    const nextName = item?.name === originalName ? candidateName : item?.name;
    if (!nextName) return;
    const nextNote =
      item?.name === originalName
        ? db?.[candidateName]?.note || item?.note || "mid"
        : item?.note || db?.[nextName]?.note || "mid";
    const existing = mergedByName.get(nextName);
    if (existing) {
      existing.g += toFiniteNumber(item?.g);
      if (!existing.note && nextNote) existing.note = nextNote;
      return;
    }
    mergedByName.set(nextName, {
      ...item,
      name: nextName,
      note: nextNote,
      g: toFiniteNumber(item?.g),
    });
  });

  return sortFormulaIngredients(Array.from(mergedByName.values()), db);
}

export function buildSubstitutionReviewDraftFormula(
  sourceFormula,
  originalName,
  candidateName,
  {
    db = {},
    formulaKey = null,
    versionLabel = null,
    revisionNote = "",
  } = {}
) {
  if (!sourceFormula || !originalName || !candidateName) return null;
  return {
    ...sourceFormula,
    formulaKey: formulaKey || sourceFormula.formulaKey || null,
    versionLabel: versionLabel || sourceFormula.versionLabel || "v1.0",
    revisionNote,
    ingredients: replaceIngredientInItems(
      sourceFormula.ingredients || [],
      originalName,
      candidateName,
      { db }
    ),
  };
}

export function buildMaterialBehaviorSignals(materialName, { db = {} } = {}) {
  const record = db?.[materialName];
  if (!record) {
    return {
      facets: [],
      descriptorTags: [],
      notes: [],
    };
  }

  const logVp = getMaterialLogVp(record);
  const diffusionProxy = getMaterialDiffusionProxy(record);
  const persistenceProxy = getMaterialPersistenceProxy(record);
  const odt = Number(record?.ODT);

  const volatilityBand = getBehaviorBand(logVp, {
    high: -2.5,
    mid: -4.5,
    highLabel: "High volatility",
    midLabel: "Moderate volatility",
    lowLabel: "Low volatility",
  });
  const diffusionBand = getBehaviorBand(diffusionProxy, {
    high: 0.14,
    mid: 0.05,
    highLabel: "More diffusive",
    midLabel: "Balanced diffusion",
    lowLabel: "Tighter diffusion",
  });
  const persistenceBand = getBehaviorBand(persistenceProxy, {
    high: 13,
    mid: 9,
    highLabel: "More persistent",
    midLabel: "Moderate persistence",
    lowLabel: "Shorter persistence",
  });
  const impactBand = getBehaviorBand(
    Number.isFinite(odt) ? Math.log10(1 / Math.max(odt, 1e-9)) : null,
    {
      high: 0.5,
      mid: -1.5,
      highLabel: "High-impact threshold",
      midLabel: "Moderate threshold impact",
      lowLabel: "Higher threshold / softer impact",
    }
  );

  const notes = [];
  if (record.note === "top") {
    notes.push("Leans toward opening impact in the current note-role model.");
  } else if (record.note === "base") {
    notes.push("Leans toward drydown support in the current note-role model.");
  }
  if (record.isUVCB) {
    notes.push("Natural/UVCB handling stays coarser than single-molecule materials.");
  }
  if (record.isIsomerMix) {
    notes.push("Isomer-mix behavior is summarized heuristically in the current runtime.");
  }

  return {
    descriptorTags: getMaterialDescriptorTags(record),
    facets: [
      {
        key: "volatility",
        label: "Volatility",
        rating: volatilityBand,
        detail:
          logVp == null
            ? "Vapor-pressure data is incomplete, so volatility is only loosely inferred."
            : `Current VP/log(VP) signals place this material in a ${volatilityBand.toLowerCase()} band.`,
      },
      {
        key: "diffusion",
        label: "Diffusion",
        rating: diffusionBand,
        detail:
          diffusionProxy == null
            ? "Diffusion is only loosely inferred from current data."
            : `Current MW and VP suggest a ${diffusionBand.toLowerCase()} profile.`,
      },
      {
        key: "persistence",
        label: "Persistence",
        rating: persistenceBand,
        detail: `xLogP, VP, and note-role weighting suggest a ${persistenceBand.toLowerCase()} profile.`,
      },
      {
        key: "impact",
        label: "Impact",
        rating: impactBand,
        detail:
          Number.isFinite(odt)
            ? `The current odor-threshold data suggests ${impactBand.toLowerCase()}.`
            : "Odor-threshold data is limited, so impact is inferred from other metadata.",
      },
    ],
    notes,
  };
}

export function buildMaterialSubstitutionSuggestions(
  materialName,
  {
    db = {},
    pricesState,
    pricing = {},
    basketMode = "cheapest",
    ifraCategory = "cat4",
    amountG = 10,
  } = {}
) {
  const originalRecord = db?.[materialName];
  if (!originalRecord) {
    return {
      baseline: null,
      categories: {
        cheaper: [],
        complianceFriendlier: [],
        moreDiffusive: [],
        morePersistent: [],
        stylisticFit: [],
      },
    };
  }

  const originalIdentity = resolveIngredientIdentity(materialName);
  const originalLimit =
    getIfraMaterialRecord(materialName)?.limits?.[ifraCategory] ?? null;
  const baselineLine = buildMaterialLineEstimate(materialName, amountG, {
    db,
    pricesState,
    pricing,
    basketMode,
  });
  const baselineCost = baselineLine?.lineCost ?? null;
  const originalDiffusion = getMaterialDiffusionProxy(originalRecord);
  const originalPersistence = getMaterialPersistenceProxy(originalRecord);
  const originalLogVp = getMaterialLogVp(originalRecord);

  const candidates = Object.entries(db)
    .map(([candidateName, candidateRecord]) => {
      if (!candidateRecord || candidateName === materialName) return null;
      if (
        originalRecord.type !== "CARRIER" &&
        candidateRecord.type === "CARRIER"
      ) {
        return null;
      }
      if (
        originalRecord.canonicalMaterialKey &&
        candidateRecord.canonicalMaterialKey &&
        originalRecord.canonicalMaterialKey ===
          candidateRecord.canonicalMaterialKey
      ) {
        return null;
      }

      const sharedTraits = getSharedMaterialTraits(
        originalRecord,
        candidateRecord
      );
      const tagOverlap = sharedTraits.filter((trait) => trait.endsWith("tag"))
        .length;
      const sameClass =
        candidateRecord.scentClass &&
        candidateRecord.scentClass === originalRecord.scentClass;
      const sameNote =
        candidateRecord.note && candidateRecord.note === originalRecord.note;
      const sameType =
        candidateRecord.type && candidateRecord.type === originalRecord.type;
      if (!sameClass && !sameNote && !sameType && tagOverlap === 0) {
        return null;
      }

      const candidateLine = buildMaterialLineEstimate(candidateName, amountG, {
        db,
        pricesState,
        pricing,
        basketMode,
      });
      const candidateCost = candidateLine?.lineCost ?? null;
      const candidateLimit =
        getIfraMaterialRecord(candidateName)?.limits?.[ifraCategory] ?? null;
      const candidateDiffusion = getMaterialDiffusionProxy(candidateRecord);
      const candidatePersistence = getMaterialPersistenceProxy(candidateRecord);
      const candidateLogVp = getMaterialLogVp(candidateRecord);

      const styleScore =
        (sameClass ? 5 : 0) +
        (sameNote ? 3 : 0) +
        (sameType ? 1.5 : 0) +
        tagOverlap * 1.2 -
        Math.min(
          2.5,
          Math.abs((Number(candidateRecord.xLogP) || 0) - (Number(originalRecord.xLogP) || 0))
        ) -
        Math.min(
          2.5,
          Math.abs((candidateLogVp ?? -10) - (originalLogVp ?? -10))
        );

      return {
        name: candidateName,
        note: candidateRecord.note || null,
        type: candidateRecord.type || null,
        scentClass: candidateRecord.scentClass || null,
        scentSummary: candidateRecord.scentSummary || null,
        descriptorTags: getMaterialDescriptorTags(candidateRecord),
        styleScore,
        sharedTraits,
        candidateCost,
        baselineCost,
        candidateLimit,
        originalLimit,
        diffusionDelta: candidateDiffusion - originalDiffusion,
        persistenceDelta: candidatePersistence - originalPersistence,
        lineEstimate: candidateLine,
        identity: resolveIngredientIdentity(candidateName),
      };
    })
    .filter(Boolean);

  const stylisticFit = [...candidates]
    .sort((a, b) => b.styleScore - a.styleScore)
    .slice(0, 4)
    .map((candidate) => ({
      ...candidate,
      reason: buildSubstitutionReason({
        mode: "stylistic",
        originalName: materialName,
        candidateName: candidate.name,
        originalRecord,
        candidateRecord: db[candidate.name],
      }),
    }));

  const cheaper = [...candidates]
    .filter(
      (candidate) =>
        baselineCost != null &&
        candidate.candidateCost != null &&
        candidate.candidateCost < baselineCost &&
        candidate.styleScore >= 2.5
    )
    .sort((a, b) => {
      if (a.candidateCost !== b.candidateCost) {
        return a.candidateCost - b.candidateCost;
      }
      return b.styleScore - a.styleScore;
    })
    .slice(0, 4)
    .map((candidate) => ({
      ...candidate,
      reason: buildSubstitutionReason({
        mode: "cheaper",
        originalName: materialName,
        candidateName: candidate.name,
        originalRecord,
        candidateRecord: db[candidate.name],
        baselineCost,
        candidateCost: candidate.candidateCost,
        amountG,
      }),
    }));

  const complianceFriendlier = [...candidates]
    .filter(
      (candidate) =>
        originalLimit != null &&
        candidate.candidateLimit != null &&
        candidate.candidateLimit > originalLimit &&
        candidate.styleScore >= 2
    )
    .sort((a, b) => {
      if (b.candidateLimit !== a.candidateLimit) {
        return b.candidateLimit - a.candidateLimit;
      }
      return b.styleScore - a.styleScore;
    })
    .slice(0, 4)
    .map((candidate) => ({
      ...candidate,
      reason: buildSubstitutionReason({
        mode: "compliance",
        originalName: materialName,
        candidateName: candidate.name,
        originalRecord,
        candidateRecord: db[candidate.name],
        ifraCategory,
        originalLimit,
        candidateLimit: candidate.candidateLimit,
      }),
    }));

  const moreDiffusive = [...candidates]
    .filter(
      (candidate) => candidate.diffusionDelta > 0.02 && candidate.styleScore >= 1.5
    )
    .sort((a, b) => {
      if (b.diffusionDelta !== a.diffusionDelta) {
        return b.diffusionDelta - a.diffusionDelta;
      }
      return b.styleScore - a.styleScore;
    })
    .slice(0, 4)
    .map((candidate) => ({
      ...candidate,
      reason: buildSubstitutionReason({
        mode: "diffusive",
        originalName: materialName,
        candidateName: candidate.name,
        originalRecord,
        candidateRecord: db[candidate.name],
      }),
    }));

  const morePersistent = [...candidates]
    .filter(
      (candidate) =>
        candidate.persistenceDelta > 1.2 && candidate.styleScore >= 1.5
    )
    .sort((a, b) => {
      if (b.persistenceDelta !== a.persistenceDelta) {
        return b.persistenceDelta - a.persistenceDelta;
      }
      return b.styleScore - a.styleScore;
    })
    .slice(0, 4)
    .map((candidate) => ({
      ...candidate,
      reason: buildSubstitutionReason({
        mode: "persistent",
        originalName: materialName,
        candidateName: candidate.name,
        originalRecord,
        candidateRecord: db[candidate.name],
      }),
    }));

  const canonicalMaterialKey =
    originalRecord.canonicalMaterialKey ||
    originalIdentity?.normalizationEntry?.canonicalMaterialKey ||
    originalIdentity?.canonicalMaterialKey ||
    null;

  return {
    baseline: {
      materialName,
      amountG,
      lineEstimate: baselineLine,
      baselineCost,
      ifraLimit: originalLimit,
      canonicalMaterialKey,
      supplierVariantCount:
        getSupplierProductsForCatalogName(materialName).length +
        (canonicalMaterialKey
          ? getSupplierProductsForCanonicalMaterialKey(canonicalMaterialKey).length
          : 0),
      sourceDocumentCount: canonicalMaterialKey
        ? getSourceDocumentsForCanonicalMaterialKey(canonicalMaterialKey).length
        : 0,
      evidenceCandidateCount: canonicalMaterialKey
        ? getEvidenceCandidatesForCanonicalMaterialKey(canonicalMaterialKey).length
        : 0,
    },
    categories: {
      cheaper,
      complianceFriendlier,
      moreDiffusive,
      morePersistent,
      stylisticFit,
    },
  };
}
