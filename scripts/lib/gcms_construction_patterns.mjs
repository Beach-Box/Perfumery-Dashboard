import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_GCMS_STRUCTURED_CANDIDATES_PATH,
  ROOT,
  normalizeMaterialName,
  uniqueStrings,
  writeJsonFile,
} from "./gcms_reference_pipeline.mjs";

export const DEFAULT_GCMS_CONSTRUCTION_PATTERNS_PATH = path.join(
  ROOT,
  "data",
  "gcms_extracted",
  "gcms_construction_patterns.json"
);
export const DEFAULT_HERO_MATERIAL_SUPPORT_PATH = path.join(
  ROOT,
  "src",
  "data",
  "hero_formula_material_support.json"
);
export const DEFAULT_HERO_ACCORD_RECIPES_PATH = path.join(
  ROOT,
  "src",
  "data",
  "hero_formula_accord_recipes.json"
);

export const HIGH_DOSE_THRESHOLDS = [1, 2.5, 5, 10, 20];
export const DOSAGE_BANDS = [
  { key: "trace", label: "trace", range: "<0.1%" },
  { key: "support", label: "support", range: "0.1-0.5%" },
  { key: "modifier", label: "modifier", range: "0.5-2%" },
  { key: "structural", label: "structural", range: "2-10%" },
  { key: "backbone", label: "backbone", range: ">10%" },
];

const ROLE_PATTERNS = [
  ["marine/mineral effect", /\b(calone|ocean|marine|seaweed|algenone|maritima|ozon|aqu|helional)\b/i],
  ["woody amber structure", /\b(iso e|otne|cashmeran|cedar|sandal|vetiver|patchouli|bacdanol|ambermax|norlimbanol|amber xtreme)\b/i],
  ["amber/skin diffusion", /\b(ambrox|cetalox|amber|labdan|benzoin|vanillin|ambrocenide)\b/i],
  ["musk body/fixation", /\b(musk|galaxolide|habanolide|ambrettolide|ethylene brassylate|exaltolide|helvetolide|muscenone|ambromusc)\b/i],
  ["floral transparency", /\b(hedione|jasmine|rose|ionone|linalool|geraniol|nerol|phenylethyl|muguet|florol|hydroxycitronellal)\b/i],
  ["citrus/terpene lift", /\b(limonene|linalyl acetate|bergamot|lemon|orange|grapefruit|mandarin|pinene|terpinene|citral)\b/i],
  ["sweet/gourmand modifier", /\b(vanillin|maltol|coumarin|cocoa|caramel|lactone|ethyl maltol)\b/i],
  ["green/aromatic modifier", /\b(galban|hexen|leaf|violet leaf|cyclogalbanate|lavender|rosemary|clary|sage|basil)\b/i],
  ["spice/resin accent", /\b(pepper|clove|eugenol|cinnamon|cardamom|ginger|olibanum|frankincense|myrrh|incense)\b/i],
  ["solvent/carrier or technical base", /\b(dpg|dipropylene glycol|diethyl phthalate|hercolyn|tec|triethyl citrate)\b/i],
];

const FAMILY_PATTERNS = [
  ["aldehydic", /\b(aldehyd|octanal|nonanal|decanal|undecanal|dodecanal)\b/i],
  ["amber", /\b(amber|ambrox|cetalox|labdan|benzoin|vanillin|ambrocenide|ambermax)\b/i],
  ["aromatic", /\b(lavender|rosemary|thyme|basil|clary|sage|coumarin)\b/i],
  ["citrus", /\b(citral|limonene|linalyl acetate|bergamot|lemon|orange|grapefruit|mandarin|pinene|terpinene)\b/i],
  ["floral", /\b(hedione|jasmine|rose|ionone|linalool|geraniol|nerol|phenylethyl|muguet|florol|hydroxycitronellal)\b/i],
  ["fruity", /\b(fruit|berry|apple|peach|pear|lactone|damascone|nonalactone)\b/i],
  ["gourmand", /\b(vanillin|ethyl maltol|maltol|coumarin|cocoa|caramel|tonka)\b/i],
  ["green", /\b(galban|hexen|leaf|stem|violet leaf|cyclogalbanate)\b/i],
  ["incense", /\b(incense|olibanum|frankincense|myrrh|elemi)\b/i],
  ["leather", /\b(leather|birch|isobutyl quinoline|suederal|safraleine)\b/i],
  ["marine", /\b(calone|ocean|marine|seaweed|ozon|algenone|maritima|aqu|helional)\b/i],
  ["moss/chypre", /\b(oakmoss|evernyl|veramoss|atranol|methyl atrarate|patchouli)\b/i],
  ["musk", /\b(musk|galaxolide|habanolide|ambrettolide|ethylene brassylate|exaltolide|helvetolide|muscenone|ambromusc)\b/i],
  ["resinous", /\b(resin|balsam|benzoin|labdan|olibanum|frankincense|myrrh)\b/i],
  ["spicy", /\b(pepper|clove|eugenol|cinnamon|cardamom|ginger)\b/i],
  ["woody", /\b(cedar|sandal|vetiver|patchouli|iso e|cashmeran|guaiac|bacdanol|norlimbanol|amber xtreme)\b/i],
];

const SKELETON_DEFINITIONS = [
  {
    id: "woody_amber",
    name: "Woody Amber Skeleton",
    rule:
      "At least one woody material plus amber or musk support appears at or above modifier dose.",
    beachBoxTwist:
      "Translate as airy mineral driftwood diffusion: keep the woody amber frame skin-warm and leave space for salt-air and marine accents.",
    matches: ({ families, hasDoseFamily }) =>
      hasDoseFamily("woody", 0.5) && (families.has("amber") || families.has("musk")),
  },
  {
    id: "musky_floral",
    name: "Musky Floral Skeleton",
    rule: "Floral transparency and musk materials both appear in the report.",
    beachBoxTwist:
      "Use the floral/musk bridge as clean skin radiance, with marine notes treated as texture rather than a generic laundry effect.",
    matches: ({ families }) => families.has("floral") && families.has("musk"),
  },
  {
    id: "floral_chypre",
    name: "Floral Chypre Skeleton",
    rule: "Floral materials appear with moss/chypre or patchouli-like support.",
    beachBoxTwist:
      "Translate the mossy floral idea into damp shoreline shadow: restrained moss/woods under translucent floral air, not a vintage chypre clone.",
    matches: ({ families }) => families.has("floral") && families.has("moss/chypre"),
  },
  {
    id: "gourmand_leather",
    name: "Gourmand Leather Skeleton",
    rule: "Sweet/gourmand materials appear with leather, spice, resin, or smoke-adjacent support.",
    beachBoxTwist:
      "Use only the tension: a low sweet/resin shadow under sun-warmed skin and driftwood, avoiding dessert or literal leather reconstruction.",
    matches: ({ families }) =>
      families.has("gourmand") &&
      (families.has("leather") || families.has("spicy") || families.has("resinous")),
  },
  {
    id: "incense_amber",
    name: "Incense/Amber Skeleton",
    rule: "Incense or resinous materials appear with amber, woody, or musk support.",
    beachBoxTwist:
      "Translate as mineral smoke over warm skin: a dry resin/amber undertow beneath coastal woods, not temple incense.",
    matches: ({ families }) =>
      (families.has("incense") || families.has("resinous")) &&
      (families.has("amber") || families.has("woody") || families.has("musk")),
  },
  {
    id: "marine_mineral",
    name: "Marine/Mineral Skeleton",
    rule: "Marine/mineral materials appear with woody, amber, musk, or floral structure.",
    beachBoxTwist:
      "Use marine materials as a salt-air/mineral facet tied into woods and musks, rather than letting the aquatic note become the whole identity.",
    matches: ({ families }) =>
      families.has("marine") &&
      (families.has("woody") ||
        families.has("amber") ||
        families.has("musk") ||
        families.has("floral")),
  },
];

const FEATURED_CO_OCCURRENCE_PAIRS = [
  ["Iso E Super", "Hedione"],
  ["Iso E Super", "Cashmeran"],
  ["Hedione", "Linalool"],
  ["Hedione", "Phenylethyl Alcohol"],
  ["Ethylene Brassylate", "Galaxolide"],
  ["Ambroxan", "Iso E Super"],
  ["Linalool", "Linalyl Acetate"],
  ["Benzyl Salicylate", "Hedione"],
];

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function roundNumber(value, digits = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Number(numeric.toFixed(digits));
}

function materialPercent(material = {}) {
  const value = material.percent ?? material.relativePercent ?? material.areaPercent;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isUnidentifiedMaterial(material = {}) {
  return /\bunidentified compounds?\b/i.test(material.name || "");
}

function incrementCounter(map, key, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + amount);
}

function sortedCounterRows(counter, limit = 25) {
  return [...counter.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function displayNameFromCounter(counter) {
  const [top] = sortedCounterRows(counter, 1);
  return top?.name || "";
}

export function assignDosageBand(percent) {
  const numeric = Number(percent);
  if (!Number.isFinite(numeric) || numeric < 0) return "unknown";
  if (numeric < 0.1) return "trace";
  if (numeric < 0.5) return "support";
  if (numeric < 2) return "modifier";
  if (numeric <= 10) return "structural";
  return "backbone";
}

export function summarizePercentiles(values = []) {
  const sorted = values
    .map((value) => Number(value))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!sorted.length) {
    return {
      count: 0,
      min: null,
      p25: null,
      median: null,
      p75: null,
      max: null,
      mean: null,
    };
  }
  const percentile = (p) => {
    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  };
  return {
    count: sorted.length,
    min: roundNumber(sorted[0]),
    p25: roundNumber(percentile(0.25)),
    median: roundNumber(percentile(0.5)),
    p75: roundNumber(percentile(0.75)),
    max: roundNumber(sorted[sorted.length - 1]),
    mean: roundNumber(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
  };
}

export function guessMaterialFamilies(name) {
  const families = FAMILY_PATTERNS.filter(([, pattern]) => pattern.test(name)).map(
    ([family]) => family
  );
  return uniqueStrings(families);
}

export function guessCommonRole(name) {
  return (
    ROLE_PATTERNS.find(([, pattern]) => pattern.test(name))?.[0] ||
    "corpus-observed supporting material"
  );
}

function normalizeInventoryName(value) {
  return normalizeMaterialName(value);
}

function addInventoryName(map, name, payload) {
  const normalized = normalizeInventoryName(name);
  if (!normalized) return;
  if (!map.has(normalized)) {
    map.set(normalized, {
      matchedName: name,
      sources: [],
      accordNames: [],
    });
  }
  const existing = map.get(normalized);
  if (payload.source) existing.sources.push(payload.source);
  if (payload.accordName) existing.accordNames.push(payload.accordName);
  if (payload.matchedName && payload.matchedName.length > existing.matchedName.length) {
    existing.matchedName = payload.matchedName;
  }
}

export function buildBeachBoxInventoryIndex({
  supportData = {},
  accordRecipes = {},
  inventoryNames = [],
} = {}) {
  const supportMap = new Map();
  const accordComponentMap = new Map();

  for (const name of inventoryNames || []) {
    addInventoryName(supportMap, name, {
      source: "runtime support row",
      matchedName: name,
    });
  }

  for (const row of supportData.dilutedStocks || []) {
    addInventoryName(supportMap, row.name, {
      source: "diluted stock",
      matchedName: row.name,
    });
    addInventoryName(supportMap, row.parentName, {
      source: "diluted stock parent",
      matchedName: row.parentName,
    });
  }

  for (const row of supportData.supportRecords || []) {
    addInventoryName(supportMap, row.name, {
      source: "support record",
      matchedName: row.name,
    });
    addInventoryName(supportMap, row.sourceProductTitle, {
      source: "support record product title",
      matchedName: row.name,
    });
  }

  for (const alias of supportData.aliases || []) {
    addInventoryName(supportMap, alias.name, {
      source: "support alias",
      matchedName: alias.targetName || alias.name,
    });
    addInventoryName(supportMap, alias.targetName, {
      source: "support alias target",
      matchedName: alias.targetName,
    });
  }

  const pricingAliasByName = new Map(
    (accordRecipes.componentPricingAliases || [])
      .filter((alias) => alias?.name && alias?.targetName)
      .map((alias) => [normalizeInventoryName(alias.name), alias.targetName])
  );

  for (const recipe of accordRecipes.recipes || []) {
    addInventoryName(supportMap, recipe.name, {
      source: "accord row",
      matchedName: recipe.name,
    });
    for (const alias of recipe.aliases || []) {
      addInventoryName(supportMap, alias, {
        source: "accord alias",
        matchedName: recipe.name,
      });
    }
    for (const component of recipe.components || []) {
      const componentName = component.name;
      addInventoryName(accordComponentMap, componentName, {
        source: "accord component",
        accordName: recipe.name,
        matchedName: componentName,
      });
      const pricingAlias = pricingAliasByName.get(normalizeInventoryName(componentName));
      if (pricingAlias) {
        addInventoryName(accordComponentMap, pricingAlias, {
          source: "accord component pricing alias",
          accordName: recipe.name,
          matchedName: pricingAlias,
        });
      }
      if (component.dilution && !/\d+(?:\.\d+)?\s*%/.test(componentName)) {
        addInventoryName(accordComponentMap, `${componentName} ${component.dilution}`, {
          source: "accord diluted component",
          accordName: recipe.name,
          matchedName: componentName,
        });
      }
    }
  }

  return { supportMap, accordComponentMap };
}

export function classifyBeachBoxInventoryOverlap(name, inventoryIndex = {}) {
  const normalizedName = normalizeInventoryName(name);
  if (!normalizedName) {
    return {
      status: "unknown",
      matchedName: "",
      notes: "Material name is empty or unavailable.",
    };
  }

  const supportMatch = inventoryIndex.supportMap?.get(normalizedName);
  if (supportMatch) {
    return {
      status: "in Beach Box inventory/support",
      matchedName: supportMatch.matchedName,
      sources: uniqueStrings(supportMatch.sources),
      accordNames: uniqueStrings(supportMatch.accordNames),
      notes: "Matched to existing Beach Box support, inventory, alias, stock, or accord-row data.",
    };
  }

  const accordMatch = inventoryIndex.accordComponentMap?.get(normalizedName);
  if (accordMatch) {
    return {
      status: "in accord component",
      matchedName: accordMatch.matchedName,
      sources: uniqueStrings(accordMatch.sources),
      accordNames: uniqueStrings(accordMatch.accordNames),
      notes: "Material appears as a known component inside a Beach Box accord recipe.",
    };
  }

  return {
    status: "missing from inventory",
    matchedName: "",
    sources: [],
    accordNames: [],
    notes: "No conservative Beach Box support or accord-component match found.",
  };
}

function collectMaterialStats(reports = []) {
  const materialMap = new Map();
  let trueComponentRowCount = 0;
  let identifiedComponentRowCount = 0;

  for (const report of reports) {
    const seenInReport = new Set();
    for (const material of report.detectedMaterials || []) {
      trueComponentRowCount += 1;
      if (isUnidentifiedMaterial(material)) continue;
      const percent = materialPercent(material);
      if (percent === null) continue;

      identifiedComponentRowCount += 1;
      const normalizedName = normalizeMaterialName(material.name);
      if (!normalizedName) continue;

      if (!materialMap.has(normalizedName)) {
        materialMap.set(normalizedName, {
          normalizedName,
          displayNames: new Map(),
          casNumbers: new Map(),
          observations: [],
          reportIds: new Set(),
          dosageBandCounts: Object.fromEntries(DOSAGE_BANDS.map((band) => [band.key, 0])),
          highDoseCounts: Object.fromEntries(
            HIGH_DOSE_THRESHOLDS.map((threshold) => [`>${threshold}%`, 0])
          ),
        });
      }

      const record = materialMap.get(normalizedName);
      incrementCounter(record.displayNames, material.name);
      incrementCounter(record.casNumbers, material.cas);
      if (!seenInReport.has(normalizedName)) {
        record.reportIds.add(report.id);
        seenInReport.add(normalizedName);
      }
      record.observations.push({
        reportId: report.id,
        reportLabel: report.fragranceName
          ? `${report.brand ? `${report.brand} - ` : ""}${report.fragranceName}`
          : report.sourceFilename || report.id,
        percent,
        ppt: material.ppt ?? null,
        cas: material.cas || "",
      });
      const band = assignDosageBand(percent);
      if (record.dosageBandCounts[band] !== undefined) {
        record.dosageBandCounts[band] += 1;
      }
      for (const threshold of HIGH_DOSE_THRESHOLDS) {
        if (percent > threshold) record.highDoseCounts[`>${threshold}%`] += 1;
      }
    }
  }

  return {
    materialMap,
    trueComponentRowCount,
    identifiedComponentRowCount,
  };
}

function buildMaterialSummary(record, reportCount, inventoryIndex) {
  const name = displayNameFromCounter(record.displayNames);
  const percents = record.observations.map((observation) => observation.percent);
  const percentileSummary = summarizePercentiles(percents);
  const dominantDosageBand =
    Object.entries(record.dosageBandCounts).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    )[0]?.[0] || "unknown";
  const casNumbers = sortedCounterRows(record.casNumbers, 5)
    .filter((row) => row.name && !/^(?:n\/a|not available)$/i.test(row.name))
    .map((row) => row.name);

  return {
    name,
    normalizedName: record.normalizedName,
    reportFrequency: record.reportIds.size,
    reportFrequencyPercent: reportCount
      ? roundNumber((record.reportIds.size / reportCount) * 100, 1)
      : 0,
    observationCount: record.observations.length,
    medianPercent: percentileSummary.median,
    meanPercent: percentileSummary.mean,
    p25Percent: percentileSummary.p25,
    p75Percent: percentileSummary.p75,
    minPercent: percentileSummary.min,
    maxPercent: percentileSummary.max,
    dosageBandCounts: record.dosageBandCounts,
    dominantDosageBand,
    highDoseCounts: record.highDoseCounts,
    commonRoleGuess: guessCommonRole(name),
    families: guessMaterialFamilies(name),
    casNumbers,
    inventoryOverlap: classifyBeachBoxInventoryOverlap(name, inventoryIndex),
    beachBoxTwist: beachBoxMaterialTwist(name, guessCommonRole(name)),
    note: "Corpus observation only; this is not a recommended dosage or reconstruction instruction.",
  };
}

function beachBoxMaterialTwist(name, role) {
  const families = new Set(guessMaterialFamilies(name));
  if (families.has("marine")) {
    return "Use as a salt-air or mineral signal and anchor it with skin woods/musks so it does not dominate as a generic aquatic note.";
  }
  if (families.has("woody") || families.has("amber")) {
    return "Use as driftwood, sun-warmed skin, or mineral-amber structure rather than copying any reference backbone.";
  }
  if (families.has("musk")) {
    return "Use as clean skin persistence and diffusion underneath marine/wood materials.";
  }
  if (families.has("floral")) {
    return "Use as transparent lift and humidity around the coastal body, not as a conventional floral heart.";
  }
  if (families.has("citrus")) {
    return "Use restrained freshness as salt-air lift rather than a cologne-style top.";
  }
  if (families.has("gourmand") || /sweet/i.test(role)) {
    return "Use only as warmth or shadow if needed; avoid turning the Beach Box brief toward dessert sweetness.";
  }
  return "Treat as pattern evidence for balance and support, then reinterpret through coastal skin, wood, musk, and mineral constraints.";
}

function buildUniversalStructuralMaterials(materialSummaries, reportCount) {
  const minimumFrequency =
    reportCount < 8
      ? Math.max(1, Math.ceil(reportCount * 0.5))
      : Math.max(8, Math.ceil(reportCount * 0.25));
  return materialSummaries
    .filter((material) => {
      const hasStructuralSignal =
        (material.medianPercent || 0) >= 0.1 ||
        (material.p75Percent || 0) >= 0.5 ||
        (material.highDoseCounts[">1%"] || 0) >= 5;
      return material.reportFrequency >= minimumFrequency && hasStructuralSignal;
    })
    .sort(
      (a, b) =>
        b.reportFrequency - a.reportFrequency ||
        (b.medianPercent || 0) - (a.medianPercent || 0) ||
        a.name.localeCompare(b.name)
    )
    .slice(0, 40);
}

function buildHighDoseArchitecture(materialSummaries) {
  const thresholds = {};
  for (const threshold of HIGH_DOSE_THRESHOLDS) {
    const key = `>${threshold}%`;
    thresholds[key] = materialSummaries
      .filter((material) => (material.highDoseCounts[key] || 0) > 0)
      .sort(
        (a, b) =>
          (b.highDoseCounts[key] || 0) - (a.highDoseCounts[key] || 0) ||
          b.reportFrequency - a.reportFrequency ||
          a.name.localeCompare(b.name)
      )
      .slice(0, 25)
      .map((material) => ({
        name: material.name,
        reportFrequencyAboveThreshold: material.highDoseCounts[key],
        totalReportFrequency: material.reportFrequency,
        medianPercent: material.medianPercent,
        maxPercent: material.maxPercent,
        commonRoleGuess: material.commonRoleGuess,
        inventoryOverlap: material.inventoryOverlap,
        beachBoxTwist: material.beachBoxTwist,
      }));
  }
  return {
    note: "Threshold counts are corpus observations from detected GCMS composition, not suggested formula targets.",
    thresholds,
  };
}

function buildReportContext(report) {
  const families = new Set();
  const materialRows = [];
  for (const material of report.detectedMaterials || []) {
    if (isUnidentifiedMaterial(material)) continue;
    const percent = materialPercent(material);
    if (percent === null) continue;
    const name = material.name || "";
    const rowFamilies = guessMaterialFamilies(name);
    rowFamilies.forEach((family) => families.add(family));
    materialRows.push({
      name,
      normalizedName: normalizeMaterialName(name),
      percent,
      families: rowFamilies,
    });
  }

  return {
    report,
    families,
    materialRows,
    hasDoseFamily: (family, minimumPercent = 0) =>
      materialRows.some(
        (row) => row.percent >= minimumPercent && row.families.includes(family)
      ),
  };
}

function buildAccordSkeletons(reports) {
  const contexts = reports.map(buildReportContext);
  return SKELETON_DEFINITIONS.map((definition) => {
    const matchedContexts = contexts.filter((context) => definition.matches(context));
    const commonCounter = new Map();
    for (const context of matchedContexts) {
      const topRows = [...context.materialRows]
        .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name))
        .slice(0, 20);
      const seen = new Set();
      for (const row of topRows) {
        if (seen.has(row.normalizedName)) continue;
        seen.add(row.normalizedName);
        incrementCounter(commonCounter, row.name);
      }
    }

    return {
      id: definition.id,
      name: definition.name,
      matchedReportCount: matchedContexts.length,
      matchedReportPercent: reports.length
        ? roundNumber((matchedContexts.length / reports.length) * 100, 1)
        : 0,
      transparentRule: definition.rule,
      commonMaterials: sortedCounterRows(commonCounter, 12),
      exampleReports: matchedContexts.slice(0, 8).map((context) => ({
        id: context.report.id,
        fragranceName: context.report.fragranceName || "",
        brand: context.report.brand || "",
        sourceFilename: context.report.sourceFilename || "",
      })),
      beachBoxTwist: definition.beachBoxTwist,
      caution:
        "Skeletons are transparent family/dose heuristics from the corpus, not reference reconstructions.",
    };
  }).sort((a, b) => b.matchedReportCount - a.matchedReportCount || a.name.localeCompare(b.name));
}

function materialSummaryLookup(materialSummaries) {
  return new Map(materialSummaries.map((material) => [material.normalizedName, material]));
}

function pairKey(a, b) {
  return [a, b].sort().join("||");
}

function buildCoOccurrenceRows(reports, materialSummaries) {
  const lookup = materialSummaryLookup(materialSummaries);
  const pairCounts = new Map();
  const pairExampleReports = new Map();

  for (const report of reports) {
    const reportMaterials = new Map();
    for (const material of report.detectedMaterials || []) {
      if (isUnidentifiedMaterial(material)) continue;
      const percent = materialPercent(material);
      if (percent === null || percent < 0.1) continue;
      const normalizedName = normalizeMaterialName(material.name);
      if (!normalizedName) continue;
      const existing = reportMaterials.get(normalizedName);
      if (!existing || percent > existing.percent) {
        reportMaterials.set(normalizedName, { normalizedName, percent });
      }
    }
    const keys = [...reportMaterials.keys()].sort();
    for (let aIndex = 0; aIndex < keys.length; aIndex += 1) {
      for (let bIndex = aIndex + 1; bIndex < keys.length; bIndex += 1) {
        const key = pairKey(keys[aIndex], keys[bIndex]);
        incrementCounter(pairCounts, key);
        if (!pairExampleReports.has(key)) pairExampleReports.set(key, []);
        const examples = pairExampleReports.get(key);
        if (examples.length < 5) {
          examples.push({
            id: report.id,
            fragranceName: report.fragranceName || "",
            brand: report.brand || "",
            sourceFilename: report.sourceFilename || "",
          });
        }
      }
    }
  }

  return [...pairCounts.entries()]
    .map(([key, count]) => {
      const [a, b] = key.split("||");
      const first = lookup.get(a);
      const second = lookup.get(b);
      return {
        materials: [first?.name || a, second?.name || b],
        normalizedNames: [a, b],
        reportFrequency: count,
        reportFrequencyPercent: reports.length ? roundNumber((count / reports.length) * 100, 1) : 0,
        roles: [first?.commonRoleGuess || "", second?.commonRoleGuess || ""],
        beachBoxTwist: beachBoxPairTwist(first?.name || a, second?.name || b),
        exampleReports: pairExampleReports.get(key) || [],
        note:
          "Pair appears in the same GCMS report at or above 0.1%; this is co-occurrence evidence, not a formula instruction.",
      };
    })
    .filter((row) => row.reportFrequency >= 2 || reports.length < 5)
    .sort(
      (a, b) =>
        b.reportFrequency - a.reportFrequency ||
        a.materials.join(" + ").localeCompare(b.materials.join(" + "))
    );
}

function featuredPairKey(pair) {
  return pair.map((name) => normalizeMaterialName(name)).sort().join("||");
}

function buildFeaturedCoOccurrencePatterns(coOccurrenceRows) {
  const rowsByKey = new Map(
    coOccurrenceRows.map((row) => [row.normalizedNames.sort().join("||"), row])
  );
  return FEATURED_CO_OCCURRENCE_PAIRS.map((pair) => rowsByKey.get(featuredPairKey(pair)))
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.reportFrequency - a.reportFrequency ||
        a.materials.join(" + ").localeCompare(b.materials.join(" + "))
    );
}

function buildCoOccurrencePatterns(coOccurrenceRows, limit = 50) {
  return coOccurrenceRows.slice(0, limit);
}

function beachBoxPairTwist(first, second) {
  const names = `${first} ${second}`;
  const families = new Set(guessMaterialFamilies(names));
  if (families.has("marine")) {
    return "Treat the pairing as marine texture plus structure; keep coastal identity distinct from the reference by changing the surrounding wood/musk balance.";
  }
  if (families.has("woody") && families.has("floral")) {
    return "Use as an airy driftwood/floral-transparency bridge under coastal skin notes.";
  }
  if (families.has("musk") && (families.has("woody") || families.has("amber"))) {
    return "Use as a skin-warm amberwood/musk base for marine lift, not as a copied base accord.";
  }
  if (families.has("citrus") && families.has("floral")) {
    return "Use as fresh salt-air lift around the formula opening, not a conventional citrus floral top.";
  }
  return "Use the relationship as balance evidence, then translate through the Beach Box brief instead of copying the reference context.";
}

function buildDosageBandGuidance(materialSummaries) {
  return materialSummaries
    .sort(
      (a, b) =>
        b.reportFrequency - a.reportFrequency ||
        (b.observationCount || 0) - (a.observationCount || 0) ||
        a.name.localeCompare(b.name)
    )
    .slice(0, 60)
    .map((material) => ({
      name: material.name,
      reportFrequency: material.reportFrequency,
      medianPercent: material.medianPercent,
      observedRange: {
        minPercent: material.minPercent,
        p25Percent: material.p25Percent,
        p75Percent: material.p75Percent,
        maxPercent: material.maxPercent,
      },
      dosageBandCounts: material.dosageBandCounts,
      dominantDosageBand: material.dominantDosageBand,
      guidance:
        "Observed dosage band distribution only; use as construction literacy, not as a dosing rule.",
    }));
}

function buildInventoryOverlapSummary(materialSummaries) {
  const counter = new Map();
  for (const material of materialSummaries) {
    incrementCounter(counter, material.inventoryOverlap.status);
  }
  return {
    counts: Object.fromEntries(counter),
    examples: {
      inBeachBoxInventorySupport: materialSummaries
        .filter((material) => material.inventoryOverlap.status === "in Beach Box inventory/support")
        .slice(0, 20)
        .map((material) => material.name),
      inAccordComponent: materialSummaries
        .filter((material) => material.inventoryOverlap.status === "in accord component")
        .slice(0, 20)
        .map((material) => material.name),
      missingFromInventory: materialSummaries
        .filter((material) => material.inventoryOverlap.status === "missing from inventory")
        .slice(0, 20)
        .map((material) => material.name),
    },
  };
}

function buildCautions() {
  return [
    "GCMS is not exact formula cloning and should not be used to reconstruct references.",
    "PPT/% values reflect detected composition in the source reports, not necessarily original perfumer intent.",
    "Naturals, bases, aging products, degradation artifacts, and proprietary/captive materials can be incomplete or approximated.",
    "Use patterns as inspiration for original Beach Box construction only.",
    "This output does not change formulas, IFRA status, pricing, accord recipes, sensory data, UI state, or AI behavior.",
  ];
}

export function buildGcmsConstructionPatterns({
  structuredPayload = {},
  supportData = {},
  accordRecipes = {},
  inventoryNames = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const reports = Array.isArray(structuredPayload.reports) ? structuredPayload.reports : [];
  const originalStructuredFingerprint = JSON.stringify(structuredPayload);
  const inventoryIndex = buildBeachBoxInventoryIndex({
    supportData,
    accordRecipes,
    inventoryNames,
  });
  const { materialMap, trueComponentRowCount, identifiedComponentRowCount } =
    collectMaterialStats(reports);
  const materialSummaries = [...materialMap.values()]
    .map((record) => buildMaterialSummary(record, reports.length, inventoryIndex))
    .sort(
      (a, b) =>
        b.reportFrequency - a.reportFrequency ||
        (b.medianPercent || 0) - (a.medianPercent || 0) ||
        a.name.localeCompare(b.name)
    );

  const coOccurrenceRows = buildCoOccurrenceRows(reports, materialSummaries);
  const report = {
    generatedAt,
    sourceStructuredCandidatesPath: "data/gcms_extracted/gcms_structured_candidates.json",
    reportCount: reports.length,
    reportsParsed: reports.filter((item) => (item.detectedMaterials || []).length > 0).length,
    trueComponentRowCount,
    identifiedComponentRowCount,
    uniqueIdentifiedMaterialCount: materialSummaries.length,
    universalStructuralMaterials: buildUniversalStructuralMaterials(
      materialSummaries,
      reports.length
    ),
    highDoseArchitectureMaterials: buildHighDoseArchitecture(materialSummaries),
    accordSkeletons: buildAccordSkeletons(reports),
    coOccurrencePatterns: buildCoOccurrencePatterns(coOccurrenceRows),
    featuredCoOccurrencePatterns: buildFeaturedCoOccurrencePatterns(coOccurrenceRows),
    dosageBandGuidance: buildDosageBandGuidance(materialSummaries),
    inventoryOverlapSummary: buildInventoryOverlapSummary(materialSummaries),
    cautions: buildCautions(),
  };

  if (JSON.stringify(structuredPayload) !== originalStructuredFingerprint) {
    throw new Error("GCMS construction pattern analysis mutated the structured payload.");
  }

  return report;
}

function formatPercent(value) {
  return value === null || value === undefined ? "n/a" : `${value}%`;
}

function markdownTable(rows, columns, emptyLabel) {
  if (!rows.length) return `_${emptyLabel}_`;
  const header = `| ${columns.map((column) => column.label).join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows
    .map(
      (row) =>
        `| ${columns
          .map((column) => String(column.value(row)).replace(/\|/g, "\\|"))
          .join(" | ")} |`
    )
    .join("\n");
  return [header, divider, body].join("\n");
}

export function formatGcmsConstructionPatternsText(report) {
  const topUniversal = report.universalStructuralMaterials
    .slice(0, 12)
    .map(
      (material) =>
        `- ${material.name}: ${material.reportFrequency}/${report.reportCount} reports, median ${formatPercent(material.medianPercent)}, role ${material.commonRoleGuess}, ${material.inventoryOverlap.status}`
    )
    .join("\n");
  const topHighDose =
    report.highDoseArchitectureMaterials.thresholds[">5%"]
      ?.slice(0, 12)
      .map(
        (material) =>
          `- ${material.name}: ${material.reportFrequencyAboveThreshold} reports >5%, max ${formatPercent(material.maxPercent)}`
      )
      .join("\n") || "- No >5% materials observed.";
  const topPairs = report.coOccurrencePatterns
    .slice(0, 12)
    .map(
      (pair) =>
        `- ${pair.materials.join(" + ")}: ${pair.reportFrequency}/${report.reportCount} reports`
    )
    .join("\n");
  const featuredPairs = (report.featuredCoOccurrencePatterns || [])
    .slice(0, 12)
    .map(
      (pair) =>
        `- ${pair.materials.join(" + ")}: ${pair.reportFrequency}/${report.reportCount} reports`
    )
    .join("\n");

  return [
    "GCMS Construction Patterns",
    "",
    `Reports analyzed: ${report.reportCount}`,
    `True component rows analyzed: ${report.trueComponentRowCount}`,
    `Identified component rows analyzed: ${report.identifiedComponentRowCount}`,
    `Unique identified materials: ${report.uniqueIdentifiedMaterialCount}`,
    "",
    "Universal structural materials:",
    topUniversal || "- No universal structural materials detected.",
    "",
    "High-dose architecture materials above 5%:",
    topHighDose,
    "",
    "Strong co-occurrence patterns:",
    topPairs || "- No recurring co-occurrence patterns detected.",
    "",
    "Construction-relevant co-occurrence patterns:",
    featuredPairs || "- No construction-relevant target pairs detected.",
    "",
    "Inventory overlap:",
    ...Object.entries(report.inventoryOverlapSummary.counts).map(
      ([status, count]) => `- ${status}: ${count}`
    ),
    "",
    "Cautions:",
    ...report.cautions.map((caution) => `- ${caution}`),
  ].join("\n");
}

export function formatGcmsConstructionPatternsMarkdown(report) {
  const materialColumns = [
    { label: "Material", value: (row) => row.name },
    { label: "Reports", value: (row) => `${row.reportFrequency}/${report.reportCount}` },
    { label: "Median %", value: (row) => formatPercent(row.medianPercent) },
    { label: "p25-p75 %", value: (row) => `${formatPercent(row.p25Percent)}-${formatPercent(row.p75Percent)}` },
    { label: "Max %", value: (row) => formatPercent(row.maxPercent) },
    { label: "Role Guess", value: (row) => row.commonRoleGuess },
    { label: "Beach Box Overlap", value: (row) => row.inventoryOverlap.status },
  ];
  const pairColumns = [
    { label: "Materials", value: (row) => row.materials.join(" + ") },
    { label: "Reports", value: (row) => `${row.reportFrequency}/${report.reportCount}` },
    { label: "Beach Box Translation", value: (row) => row.beachBoxTwist },
  ];
  const skeletonColumns = [
    { label: "Skeleton", value: (row) => row.name },
    { label: "Reports", value: (row) => `${row.matchedReportCount}/${report.reportCount}` },
    { label: "Transparent Rule", value: (row) => row.transparentRule },
    { label: "Beach Box Twist", value: (row) => row.beachBoxTwist },
  ];
  const bandColumns = [
    { label: "Material", value: (row) => row.name },
    { label: "Dominant Band", value: (row) => row.dominantDosageBand },
    { label: "Median %", value: (row) => formatPercent(row.medianPercent) },
    { label: "Observed Range", value: (row) => `${formatPercent(row.observedRange.minPercent)}-${formatPercent(row.observedRange.maxPercent)}` },
    {
      label: "Band Counts",
      value: (row) =>
        DOSAGE_BANDS.map((band) => `${band.key}:${row.dosageBandCounts[band.key] || 0}`).join(", "),
    },
  ];

  return [
    "# GCMS Construction Patterns",
    "",
    "Review-first extraction of recurring construction patterns from the local structured GCMS corpus. This is pattern literacy for original Beach Box work, not a formula reconstruction tool.",
    "",
    "## Counts",
    "",
    `- Reports analyzed: ${report.reportCount}`,
    `- Reports parsed: ${report.reportsParsed}`,
    `- True component rows analyzed: ${report.trueComponentRowCount}`,
    `- Identified component rows analyzed: ${report.identifiedComponentRowCount}`,
    `- Unique identified materials: ${report.uniqueIdentifiedMaterialCount}`,
    "",
    "## Universal Structural Materials",
    "",
    markdownTable(
      report.universalStructuralMaterials.slice(0, 30),
      materialColumns,
      "No universal structural materials detected."
    ),
    "",
    "## High-Dose Architecture Materials",
    "",
    "Threshold counts are corpus observations from detected GCMS composition, not suggested dosing targets.",
    "",
    ...HIGH_DOSE_THRESHOLDS.flatMap((threshold) => {
      const key = `>${threshold}%`;
      return [
        `### ${key}`,
        "",
        markdownTable(
          report.highDoseArchitectureMaterials.thresholds[key] || [],
          [
            { label: "Material", value: (row) => row.name },
            { label: "Reports Above Threshold", value: (row) => row.reportFrequencyAboveThreshold },
            { label: "Median %", value: (row) => formatPercent(row.medianPercent) },
            { label: "Max %", value: (row) => formatPercent(row.maxPercent) },
            { label: "Role Guess", value: (row) => row.commonRoleGuess },
            { label: "Beach Box Overlap", value: (row) => row.inventoryOverlap.status },
          ],
          `No materials observed above ${threshold}%.`
        ),
        "",
      ];
    }),
    "## Accord Skeletons",
    "",
    markdownTable(report.accordSkeletons, skeletonColumns, "No skeletons inferred."),
    "",
    "## Material Co-Occurrence Patterns",
    "",
    markdownTable(
      report.coOccurrencePatterns.slice(0, 40),
      pairColumns,
      "No recurring co-occurrence patterns detected."
    ),
    "",
    "## Construction-Relevant Co-Occurrence Checks",
    "",
    "These checks surface requested construction pairs only when the corpus actually contains the pair at or above 0.1% in the same report.",
    "",
    markdownTable(
      report.featuredCoOccurrencePatterns || [],
      pairColumns,
      "No featured construction pairs detected."
    ),
    "",
    "## Dosage Band Guidance",
    "",
    "Bands are corpus observations only: trace <0.1%, support 0.1-0.5%, modifier 0.5-2%, structural 2-10%, backbone >10%.",
    "",
    markdownTable(report.dosageBandGuidance.slice(0, 40), bandColumns, "No dosage bands detected."),
    "",
    "## Beach Box Inventory Overlap",
    "",
    ...Object.entries(report.inventoryOverlapSummary.counts).map(
      ([status, count]) => `- ${status}: ${count}`
    ),
    "",
    "## Cautions",
    "",
    ...report.cautions.map((caution) => `- ${caution}`),
    "",
  ].join("\n");
}

export function loadGcmsConstructionPatternInputs({
  structuredPath = DEFAULT_GCMS_STRUCTURED_CANDIDATES_PATH,
  supportPath = DEFAULT_HERO_MATERIAL_SUPPORT_PATH,
  accordPath = DEFAULT_HERO_ACCORD_RECIPES_PATH,
} = {}) {
  return {
    structuredPayload: readJson(structuredPath, { reports: [] }),
    supportData: readJson(supportPath, {}),
    accordRecipes: readJson(accordPath, {}),
  };
}

export function writeGcmsConstructionPatterns(filePath, report) {
  writeJsonFile(filePath, report);
}
