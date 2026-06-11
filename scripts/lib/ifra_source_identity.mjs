import { HERO_FORMULA_MATERIAL_SUPPORT } from "../../src/lib/hero_formula_material_support.js";

const STOCK_BY_NORMALIZED_NAME = new Map(
  (HERO_FORMULA_MATERIAL_SUPPORT.dilutedStocks || []).map((stock) => [
    normalizeSourceIdentityText(stock.name),
    stock,
  ])
);

const ACCORD_NAMES = new Set(
  (HERO_FORMULA_MATERIAL_SUPPORT.accords || []).map((accord) =>
    normalizeSourceIdentityText(accord.name)
  )
);

const SOURCE_IDENTITY_ALIASES = [
  {
    match: /\bcalone(?:\s+1951)?\b/i,
    terms: ["Calone 1951", "Calone"],
  },
  {
    match: /\bveramoss\b|\bevernyl\b|\bmethyl atrarate\b/i,
    terms: ["Veramoss", "Evernyl", "Methyl atrarate"],
  },
  {
    match: /\bethyl\s+vanillin\b|\bethylvanillin\b/i,
    terms: ["Ethyl Vanillin", "Ethylvanillin"],
  },
  {
    match: /\bhedione\b|\bmethyl dihydrojasmonate\b|\bmdj\b/i,
    terms: ["Hedione", "Methyl dihydrojasmonate", "MDJ"],
  },
  {
    match: /\bambroxan\b|\bambroxide\b/i,
    terms: ["Ambroxan", "Ambroxide", "Ambroxan Crystals"],
  },
  {
    match: /\bseaweed absolute\b/i,
    terms: ["Seaweed Absolute"],
  },
  {
    match: /\bgeosmin\b/i,
    terms: ["Geosmin"],
  },
  {
    match: /\bambrettolide\b/i,
    terms: ["Ambrettolide"],
  },
  {
    match: /\bhelional\b/i,
    terms: ["Helional", "Helional®"],
  },
];

const CARRIER_WORD_RE =
  /(?:TEC|DPG|IPM|EtOH|ethanol|ethyl alcohol|alcohol|in alcohol)/i;

function uniqueStrings(values = []) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
  }
  return output;
}

export function normalizeSourceIdentityText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/®|™/g, "")
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatPercentLabel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return `${Number.isInteger(numeric) ? numeric : Number(numeric.toFixed(4))}%`;
}

function carrierFromText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/\bTEC\b/i.test(text)) return "TEC";
  if (/\bDPG\b/i.test(text)) return "DPG";
  if (/\bIPM\b/i.test(text)) return "IPM";
  if (/\bEtOH\b/i.test(text)) return "EtOH";
  if (/\bethanol\b|\beth(?:yl)? alcohol\b|\bin alcohol\b/i.test(text)) {
    return "ethyl alcohol";
  }
  return "";
}

function stripDilutionSuffixFromName(value) {
  let text = String(value || "").trim();
  if (!text) return { sourceIdentityName: "", dilutionLabel: "", carrierLabel: "" };

  const original = text;
  let carrierLabel = "";
  let dilutionLabel = "";

  const parentheticalPercent = text.match(
    /\s*\((\d+(?:\.\d+)?)\s*%\s*([^)]+)?\)\s*$/i
  );
  if (parentheticalPercent) {
    carrierLabel = carrierFromText(parentheticalPercent[2] || "");
    dilutionLabel = uniqueStrings([
      `${parentheticalPercent[1]}%`,
      carrierLabel,
    ]).join(" ");
    text = text.slice(0, parentheticalPercent.index).trim();
    return {
      sourceIdentityName: text || original,
      dilutionLabel,
      carrierLabel,
    };
  }

  const suffix = text.match(
    /\s+(\d+(?:\.\d+)?)\s*%\s*((?:in\s+)?(?:TEC|DPG|IPM|EtOH|ethanol|ethyl alcohol|alcohol))?\s*(?:dilution|stock)?\s*$/i
  );
  if (suffix) {
    carrierLabel = carrierFromText(suffix[2] || "");
    dilutionLabel = uniqueStrings([`${suffix[1]}%`, carrierLabel]).join(" ");
    text = text.slice(0, suffix.index).trim();
    return {
      sourceIdentityName: text || original,
      dilutionLabel,
      carrierLabel,
    };
  }

  const namedDilution = text.match(
    /\s+(?:in\s+)?((?:TEC|DPG|IPM|EtOH|ethanol|ethyl alcohol|alcohol))\s+(?:dilution|stock)\s*$/i
  );
  if (namedDilution) {
    carrierLabel = carrierFromText(namedDilution[1] || "");
    dilutionLabel = carrierLabel ? `${carrierLabel} stock` : "stock";
    text = text.slice(0, namedDilution.index).trim();
    return {
      sourceIdentityName: text || original,
      dilutionLabel,
      carrierLabel,
    };
  }

  return { sourceIdentityName: text, dilutionLabel: "", carrierLabel: "" };
}

function stockIdentityForName(displayName) {
  return STOCK_BY_NORMALIZED_NAME.get(normalizeSourceIdentityText(displayName)) || null;
}

function stockIdentityForSupportRecord(displayName, supportRecord = {}) {
  const activePercent = Number(supportRecord?.dilutionFactor);
  const parentName = String(supportRecord?.rep || "").trim();
  if (!parentName || !Number.isFinite(activePercent) || activePercent <= 0 || activePercent >= 1) {
    return null;
  }
  const carrierLabel = carrierFromText(displayName) || carrierFromText(supportRecord.carrierName);
  const percentLabel = formatPercentLabel(activePercent * 100);
  return {
    name: displayName,
    parentName,
    activePercent: activePercent * 100,
    carrierName: carrierLabel || null,
  };
}

function aliasTermsForIdentity(sourceIdentityName) {
  const terms = [];
  for (const aliasGroup of SOURCE_IDENTITY_ALIASES) {
    if (aliasGroup.match.test(sourceIdentityName)) terms.push(...aliasGroup.terms);
  }
  return uniqueStrings(terms);
}

export function stripSourceDilutionTerms(value) {
  const text = String(value || "").trim();
  if (ACCORD_NAMES.has(normalizeSourceIdentityText(text))) return text;
  const stripped = stripDilutionSuffixFromName(value);
  return stripped.sourceIdentityName;
}

export function buildIfraSourceIdentity(
  materialName,
  { supportRecord = {}, extraSearchTerms = [] } = {}
) {
  const displayName = String(materialName || "").trim();
  if (ACCORD_NAMES.has(normalizeSourceIdentityText(displayName))) {
    return {
      displayName,
      formulaMaterialName: displayName,
      sourceIdentityName: displayName,
      activeMaterialName: displayName,
      dilutionLabel: "",
      carrierLabel: "",
      isDilutedStock: false,
      sourceSearchTerms: uniqueStrings([displayName, ...extraSearchTerms]),
    };
  }
  const stock =
    stockIdentityForName(displayName) ||
    stockIdentityForSupportRecord(displayName, supportRecord);
  const fallback = stripDilutionSuffixFromName(displayName);
  const carrierLabel =
    stock?.carrierName || fallback.carrierLabel || carrierFromText(displayName);
  const dilutionLabel = stock
    ? uniqueStrings([formatPercentLabel(stock.activePercent), carrierLabel]).join(" ")
    : fallback.dilutionLabel;
  const sourceIdentityName =
    String(stock?.parentName || fallback.sourceIdentityName || displayName).trim();
  const activeMaterialName = sourceIdentityName;
  const sourceSearchTerms = uniqueStrings([
    sourceIdentityName,
    ...aliasTermsForIdentity(sourceIdentityName),
    ...extraSearchTerms.map(stripSourceDilutionTerms),
  ]).filter((term) => {
    const normalized = normalizeSourceIdentityText(term);
    if (!normalized) return false;
    if (normalized === normalizeSourceIdentityText(displayName) && dilutionLabel) {
      return normalizeSourceIdentityText(term) === normalizeSourceIdentityText(sourceIdentityName);
    }
    return !/\b(?:tec|dpg|ipm|etoh|ethanol|ethyl alcohol|alcohol|dilution|stock)\b/i.test(
      term
    ) || !/\d+(?:\.\d+)?\s*%/.test(term);
  });

  return {
    displayName,
    formulaMaterialName: displayName,
    sourceIdentityName,
    activeMaterialName,
    dilutionLabel,
    carrierLabel,
    isDilutedStock: Boolean(dilutionLabel),
    sourceSearchTerms,
  };
}

export function addSourceIdentityFields(row = {}, materialName = row.materialName) {
  const identity = buildIfraSourceIdentity(materialName, {
    extraSearchTerms: [row.normalizedName, ...(row.candidateSearchTerms || [])],
  });
  return {
    ...row,
    formulaMaterialName: row.formulaMaterialName || identity.formulaMaterialName,
    sourceIdentityName: row.sourceIdentityName || identity.sourceIdentityName,
    activeMaterialName: row.activeMaterialName || identity.activeMaterialName,
    dilutionLabel: row.dilutionLabel || identity.dilutionLabel,
    carrierLabel: row.carrierLabel || identity.carrierLabel,
    sourceSearchTerms: uniqueStrings([
      ...(row.sourceSearchTerms || []),
      ...identity.sourceSearchTerms,
    ]),
  };
}

export function buildSourceIdentitySearchTerms(values = []) {
  return uniqueStrings(
    values
      .flatMap((value) => {
        const identity = buildIfraSourceIdentity(value);
        return [identity.sourceIdentityName, ...identity.sourceSearchTerms];
      })
      .filter(Boolean)
  );
}
