export const MODEL_CONFIDENCE_CATEGORIES = [
  "source_backed",
  "legacy",
  "parent_inherited",
  "proxy_or_uvcb",
  "black_box_accord",
  "missing_pricing",
  "missing_ifra",
  "missing_threshold",
  "estimated_model",
  "directional_only",
];

export const MODEL_CONFIDENCE_CATEGORY_META = {
  source_backed: {
    label: "Source-backed data",
    shortLabel: "Source-backed",
    description: "Reviewed source/provenance is attached to this modeled field.",
    tone: "good",
    bg: "#052E16",
    border: "#166534",
    color: "#86EFAC",
  },
  legacy: {
    label: "Legacy data caveat",
    shortLabel: "Legacy ODT/VP",
    description: "A modeled field is present, but source/provenance is incomplete.",
    tone: "caution",
    bg: "#2A1806",
    border: "#92400E",
    color: "#FCD34D",
  },
  parent_inherited: {
    label: "Inherited dilution data",
    shortLabel: "Inherited dilution",
    description: "This diluted stock inherits parent-material molecular data.",
    tone: "info",
    bg: "#071826",
    border: "#1E3A52",
    color: "#7DD3FC",
  },
  proxy_or_uvcb: {
    label: "Proxy/UVCB material",
    shortLabel: "Proxy/UVCB",
    description: "This material is mixture, natural, or proxy-level support.",
    tone: "caution",
    bg: "#251404",
    border: "#B45309",
    color: "#FCD34D",
  },
  black_box_accord: {
    label: "Black-box accord caveat",
    shortLabel: "Black-box accord",
    description: "This accord is intentionally not expanded into components.",
    tone: "warning",
    bg: "#3F0D12",
    border: "#991B1B",
    color: "#FCA5A5",
  },
  missing_pricing: {
    label: "Missing/placeholder pricing",
    shortLabel: "Pricing caveat",
    description: "Pricing is missing or represented by a placeholder support row.",
    tone: "warning",
    bg: "#3F0D12",
    border: "#991B1B",
    color: "#FCA5A5",
  },
  missing_ifra: {
    label: "IFRA coverage gap",
    shortLabel: "IFRA gap",
    description: "IFRA support is missing, inferred, or blocked for this context.",
    tone: "warning",
    bg: "#3F0D12",
    border: "#991B1B",
    color: "#FCA5A5",
  },
  missing_threshold: {
    label: "Threshold data incomplete",
    shortLabel: "Missing threshold",
    description: "VP exists, but source-backed odor threshold data is missing.",
    tone: "caution",
    bg: "#2A1806",
    border: "#92400E",
    color: "#FCD34D",
  },
  estimated_model: {
    label: "Model estimate",
    shortLabel: "Model estimate",
    description: "Score and chart outputs are heuristic model estimates.",
    tone: "neutral",
    bg: "#0A2540",
    border: "#1D4ED8",
    color: "#7DD3FC",
  },
  directional_only: {
    label: "Directional estimate",
    shortLabel: "Directional",
    description: "Use this output for comparison direction, not final certainty.",
    tone: "neutral",
    bg: "#111827",
    border: "#334155",
    color: "#CBD5E1",
  },
};

const POSITIVE_NUMBER_EPSILON = 0;
const BLACK_BOX_ACCORD_SUPPLIER = "Bench Accord";
const SUPPORT_SUPPLIER = "Hero Formula Support";

function toPositiveNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > POSITIVE_NUMBER_EPSILON
    ? numericValue
    : null;
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function uniqueByCategory(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.category || seen.has(item.category)) return false;
    seen.add(item.category);
    return true;
  });
}

function hasObjectValue(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0
  );
}

export function hasDescriptorTag(record = {}, tag = "") {
  const normalizedTag = normalizeName(tag);
  return (Array.isArray(record?.descriptorTags) ? record.descriptorTags : []).some(
    (candidate) => normalizeName(candidate) === normalizedTag
  );
}

function buildCategoryBadge(category, overrides = {}) {
  const meta = MODEL_CONFIDENCE_CATEGORY_META[category] || {};
  return {
    category,
    label: overrides.label || meta.label || category,
    shortLabel: overrides.shortLabel || meta.shortLabel || meta.label || category,
    description: overrides.description || meta.description || "",
    count: overrides.count ?? 1,
    severity: overrides.severity || meta.tone || "neutral",
  };
}

export function classifyOdorThreshold(record = {}) {
  const odt = toPositiveNumber(record?.ODT);
  const vp = toPositiveNumber(record?.VP);
  const source = record?.odorThresholdSource;
  if (odt && hasObjectValue(source)) {
    return {
      status: "source_backed",
      category: "source_backed",
      label: "Source-backed ODT",
      value: odt,
      source,
    };
  }
  if (odt) {
    return {
      status: "legacy",
      category: "legacy",
      label: hasDescriptorTag(record, "Legacy ODT Caveat")
        ? "Legacy ODT"
        : "Unprovenanced ODT",
      value: odt,
      source: null,
    };
  }
  if (vp) {
    return {
      status: "missing",
      category: "missing_threshold",
      label: "Missing ODT",
      value: null,
      source: null,
    };
  }
  return {
    status: "unsupported",
    category: null,
    label: "ODT unsupported",
    value: null,
    source: null,
  };
}

export function classifyVaporPressure(record = {}) {
  const vp = toPositiveNumber(record?.VP);
  if (!vp) {
    return {
      status: "unsupported",
      category: null,
      label: "VP unsupported",
      value: null,
    };
  }

  const confidence = String(record?.vpConfidence || "").trim();
  if (confidence && confidence !== "not_applicable" && confidence !== "review_needed") {
    return {
      status: "source_backed",
      category: "source_backed",
      label: "Source-backed VP",
      value: vp,
      confidence,
    };
  }

  return {
    status: "unprovenanced",
    category: "legacy",
    label: "Unprovenanced VP",
    value: vp,
    confidence: confidence || null,
  };
}

export function isParentInheritedDilutionRecord(record = {}, name = "") {
  const dilutionFactor = toPositiveNumber(record?.dilutionFactor);
  if (!dilutionFactor || dilutionFactor >= 1) return false;
  if (record?.supplier === SUPPORT_SUPPLIER) return true;
  if (record?.scentClass === "Diluted Stock") return true;
  const rep = String(record?.rep || "").trim();
  return Boolean(rep && rep !== name);
}

export function isBlackBoxAccordRecord(record = {}) {
  return Boolean(
    record?.type === "ACCORD" ||
      record?.supplier === BLACK_BOX_ACCORD_SUPPLIER ||
      hasDescriptorTag(record, "Accord")
  );
}

export function isProxyOrUvcbRecord(record = {}) {
  if (isBlackBoxAccordRecord(record)) return false;
  return Boolean(
    record?.isUVCB === true ||
      hasDescriptorTag(record, "Mixture Proxy Caveat") ||
      hasDescriptorTag(record, "Natural / Absolute") ||
      record?.cas === "Mixture"
  );
}

export function hasMissingPricingRisk({ record = {}, basketLine = null } = {}) {
  if (isBlackBoxAccordRecord(record)) {
    return !basketLine || basketLine.lineCost == null || Number(basketLine.lineCost) === 0;
  }
  return Boolean(
    !basketLine ||
      basketLine.status === "missing" ||
      basketLine.lineCost == null ||
      basketLine.mappingConfidence === "missing"
  );
}

export function hasMissingIfraSupportRisk({ record = {}, finishedProductRow = null } = {}) {
  if (isBlackBoxAccordRecord(record)) return true;
  if (!finishedProductRow) return false;
  return Boolean(
    finishedProductRow.dataState === "missing" ||
      finishedProductRow.status === "blocked"
  );
}

export function buildMaterialConfidenceCaveats(
  name,
  { record = {}, basketLine = null, finishedProductRow = null } = {}
) {
  const caveats = [];
  const odtClassification = classifyOdorThreshold(record);
  const vpClassification = classifyVaporPressure(record);

  if (odtClassification.category === "source_backed") {
    caveats.push(
      buildCategoryBadge("source_backed", {
        label: odtClassification.label,
        shortLabel: "Source-backed ODT",
      })
    );
  } else if (odtClassification.category === "legacy") {
    caveats.push(
      buildCategoryBadge("legacy", {
        label: odtClassification.label,
        shortLabel: "Legacy ODT",
      })
    );
  } else if (odtClassification.category === "missing_threshold") {
    caveats.push(
      buildCategoryBadge("missing_threshold", {
        label: "Threshold data incomplete",
        shortLabel: "Missing threshold",
      })
    );
  }

  if (vpClassification.category === "source_backed") {
    caveats.push(
      buildCategoryBadge("source_backed", {
        label: vpClassification.label,
        shortLabel: "Source-backed VP",
      })
    );
  } else if (vpClassification.category === "legacy") {
    caveats.push(
      buildCategoryBadge("legacy", {
        label: vpClassification.label,
        shortLabel: "Legacy VP",
      })
    );
  }

  if (isParentInheritedDilutionRecord(record, name)) {
    caveats.push(buildCategoryBadge("parent_inherited"));
  }
  if (isBlackBoxAccordRecord(record)) {
    caveats.push(buildCategoryBadge("black_box_accord"));
  }
  if (isProxyOrUvcbRecord(record)) {
    caveats.push(buildCategoryBadge("proxy_or_uvcb"));
  }
  if (hasMissingPricingRisk({ record, basketLine })) {
    caveats.push(buildCategoryBadge("missing_pricing"));
  }
  if (hasMissingIfraSupportRisk({ record, finishedProductRow })) {
    caveats.push(buildCategoryBadge("missing_ifra"));
  }

  return uniqueByCategory(caveats);
}

function buildLookupByName(rows = [], keyName = "name") {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const name = row?.[keyName] || row?.ingredientName;
    if (!name) return;
    map.set(name, row);
  });
  return map;
}

export function buildFormulaConfidenceSummary(
  ingredients = [],
  {
    db = {},
    basket = null,
    finishedProductGuidance = null,
  } = {}
) {
  const basketLineByName = buildLookupByName(basket?.lines || [], "ingredientName");
  const finishedProductRowByName = buildLookupByName(
    finishedProductGuidance?.rows || [],
    "name"
  );
  const categoryCounts = Object.fromEntries(
    MODEL_CONFIDENCE_CATEGORIES.map((category) => [category, 0])
  );
  const activeIngredients = Array.isArray(ingredients) ? ingredients : [];
  const materialSummaries = [];
  let sourceBackedOdtCount = 0;
  let sourceBackedVpCount = 0;
  let legacyOdtCount = 0;
  let missingThresholdCount = 0;

  activeIngredients.forEach((ingredient) => {
    const name = ingredient?.name;
    if (!name) return;
    const record = db[name] || ingredient?.d || {};
    const caveats = buildMaterialConfidenceCaveats(name, {
      record,
      basketLine: basketLineByName.get(name) || null,
      finishedProductRow: finishedProductRowByName.get(name) || null,
    });
    const odtClassification = classifyOdorThreshold(record);
    const vpClassification = classifyVaporPressure(record);

    if (odtClassification.status === "source_backed") sourceBackedOdtCount += 1;
    if (odtClassification.status === "legacy") legacyOdtCount += 1;
    if (odtClassification.status === "missing") missingThresholdCount += 1;
    if (vpClassification.status === "source_backed") sourceBackedVpCount += 1;

    caveats.forEach((caveat) => {
      categoryCounts[caveat.category] = (categoryCounts[caveat.category] || 0) + 1;
    });

    materialSummaries.push({
      name,
      caveats,
      odtStatus: odtClassification.status,
      vpStatus: vpClassification.status,
    });
  });

  categoryCounts.estimated_model = activeIngredients.length ? 1 : 0;
  categoryCounts.directional_only = activeIngredients.length ? 1 : 0;

  return {
    categoryCounts,
    materialSummaries,
    totalMaterials: activeIngredients.length,
    sourceBackedOdtCount,
    sourceBackedVpCount,
    legacyOdtCount,
    missingThresholdCount,
    hasBlackBoxAccord: categoryCounts.black_box_accord > 0,
    hasProxyOrUvcb: categoryCounts.proxy_or_uvcb > 0,
    hasMissingPricing: categoryCounts.missing_pricing > 0,
    hasMissingIfra: categoryCounts.missing_ifra > 0,
    hasLegacyData: categoryCounts.legacy > 0,
    hasMissingThreshold: categoryCounts.missing_threshold > 0,
    hasParentInherited: categoryCounts.parent_inherited > 0,
  };
}

const FORMULA_BADGE_ORDER = [
  "estimated_model",
  "black_box_accord",
  "missing_pricing",
  "missing_ifra",
  "missing_threshold",
  "legacy",
  "proxy_or_uvcb",
  "parent_inherited",
  "directional_only",
];

export function getFormulaConfidenceBadges(summary = {}, { max = 6 } = {}) {
  const counts = summary?.categoryCounts || {};
  return FORMULA_BADGE_ORDER.filter((category) => (counts[category] || 0) > 0)
    .map((category) => {
      const meta = MODEL_CONFIDENCE_CATEGORY_META[category];
      const count = counts[category] || 0;
      const label =
        category === "estimated_model" || category === "directional_only"
          ? meta.shortLabel
          : count > 1
          ? `${meta.shortLabel} (${count})`
          : meta.shortLabel;
      return {
        ...meta,
        category,
        count,
        label,
      };
    })
    .slice(0, max);
}

export function buildFormulaConfidenceWarningLabels(summary = {}) {
  const counts = summary?.categoryCounts || {};
  const warnings = [];
  if (counts.black_box_accord > 0) {
    warnings.push(
      `${counts.black_box_accord} black-box accord row${
        counts.black_box_accord === 1 ? "" : "s"
      } remain accord-level for chemistry/IFRA modeling.`
    );
  }
  if (counts.missing_pricing > 0) {
    warnings.push(
      `${counts.missing_pricing} pricing row${
        counts.missing_pricing === 1 ? "" : "s"
      } are missing or placeholder-supported.`
    );
  }
  if (counts.missing_ifra > 0) {
    warnings.push(
      `${counts.missing_ifra} IFRA coverage row${
        counts.missing_ifra === 1 ? "" : "s"
      } need cautious reading.`
    );
  }
  if (counts.missing_threshold > 0 || counts.legacy > 0) {
    warnings.push(
      "Threshold and vapor-pressure support is mixed: source-backed, legacy, and missing rows are not equivalent."
    );
  }
  if (counts.proxy_or_uvcb > 0) {
    warnings.push(
      `${counts.proxy_or_uvcb} proxy/UVCB material${
        counts.proxy_or_uvcb === 1 ? "" : "s"
      } should be treated as directional model support.`
    );
  }
  return warnings;
}

export function buildIfraCoverageEstimate({
  ifraRows = [],
  finishedProductGuidance = null,
} = {}) {
  const failCount = (Array.isArray(ifraRows) ? ifraRows : []).filter(
    (row) => row?.status === "fail"
  ).length;
  const warnCount = (Array.isArray(ifraRows) ? ifraRows : []).filter(
    (row) => row?.status === "warn"
  ).length;
  const status = finishedProductGuidance?.overallStatus || null;

  if (failCount > 0 || status === "offender" || status === "offender_with_missing") {
    return {
      score: Math.max(0, 4 - failCount * 2),
      label: "IFRA Coverage Estimate",
      tip: "One or more checked rows exceed the current limit.",
      confidenceCategory: "missing_ifra",
    };
  }
  if (status === "blocked_missing") {
    return {
      score: 3,
      label: "IFRA Coverage Estimate",
      tip: "Finished-product guidance is blocked by missing IFRA data.",
      confidenceCategory: "missing_ifra",
    };
  }
  if (
    status === "appears_compliant_with_missing" ||
    status === "warning_with_missing"
  ) {
    return {
      score: warnCount > 0 ? 5.5 : 6,
      label: "IFRA Coverage Estimate",
      tip: "Checked rows are not over limit, but missing IFRA coverage remains.",
      confidenceCategory: "missing_ifra",
    };
  }
  if (status === "warning" || warnCount > 0) {
    return {
      score: 7,
      label: "IFRA Coverage Estimate",
      tip: "Checked rows are within limit but close enough to review.",
      confidenceCategory: "directional_only",
    };
  }
  if (status === "no_restricted_rows") {
    return {
      score: 7,
      label: "IFRA Coverage Estimate",
      tip: "No restricted rows triggered; this is not blanket safety clearance.",
      confidenceCategory: "directional_only",
    };
  }
  if (status === "appears_compliant") {
    return {
      score: 10,
      label: "IFRA Coverage Estimate",
      tip: "Current checked rows appear within the selected IFRA context.",
      confidenceCategory: "source_backed",
    };
  }
  return {
    score: 6,
    label: "IFRA Coverage Estimate",
    tip: "IFRA support should be read as a coverage estimate until context is reviewed.",
    confidenceCategory: "directional_only",
  };
}
