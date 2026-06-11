import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_GCMS_STRUCTURED_CANDIDATES_PATH,
  ROOT,
  normalizeMaterialName,
  uniqueStrings,
  writeJsonFile,
} from "./gcms_reference_pipeline.mjs";
import {
  DEFAULT_GCMS_CONSTRUCTION_PATTERNS_PATH,
  DEFAULT_GCMS_MATERIAL_ALIASES_PATH,
} from "./gcms_construction_patterns.mjs";
import {
  ACTIVE_HERO_NAMES,
  DEFAULT_BEACH_BOX_PATTERN_TRANSLATION_PATH,
  expandHeroFormulaMaterials,
  loadActiveHeroFormulas,
  PATTERN_DEFINITIONS,
} from "./gcms_beach_box_translator.mjs";

export const DEFAULT_HERO_FORMULA_GCMS_REFERENCE_MATCHES_PATH = path.join(
  ROOT,
  "data",
  "gcms_extracted",
  "hero_formula_gcms_reference_matches.json"
);

export const DEFAULT_HERO_FORMULA_GCMS_REFERENCE_MATCHES_MARKDOWN_PATH = path.join(
  ROOT,
  "docs",
  "gcms",
  "hero_formula_gcms_reference_matches.md"
);

const GENERIC_CONTAINS_TERMS = [
  "bergamot",
  "lemon",
  "ylang",
  "oakmoss",
  "seaweed",
  "pink peppercorn",
  "cedarwood",
  "patchouli",
  "cumin",
  "carrot",
  "leather",
  "indole",
  "ionone",
  "galaxolide",
  "musks",
  "musk",
  "marine",
  "ozonic",
  "algae",
  "resin",
  "spice",
];

const FAMILY_SHORT_NAMES = new Map(
  PATTERN_DEFINITIONS.map((definition) => [definition.id, definition.patternName])
);

const HIGH_VALUE_GAP_HINTS = [
  {
    name: "Phenylethyl Alcohol",
    patternIds: ["floral_transparency_heart_bridge"],
    reason:
      "Worth reviewing later for skin-warmed floral body if wear tests need more humid heart volume.",
  },
  {
    name: "Vanillin",
    patternIds: [
      "skin_musk_soft_base_architecture",
      "woody_amber_driftwood_architecture",
      "dark_dirty_realism_modifiers",
    ],
    reason:
      "Only consider if drydown needs warmth; avoid if it turns the coastal skin direction gourmand.",
  },
  {
    name: "Limonene",
    patternIds: ["citrus_terpene_lift"],
    reason:
      "Only useful as citrus lift if the opening needs sparkle; citrus oils may already cover part of this role.",
  },
  {
    name: "Geraniol",
    patternIds: ["floral_transparency_heart_bridge"],
    reason:
      "A floral-body corpus signal to review only if the heart feels too thin on skin.",
  },
];

function readJson(filePath, fallback = {}) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stripWorkingStockSuffix(value) {
  return String(value || "")
    .trim()
    .replace(/\s+\d+(?:\.\d+)?\s*%\s*(?:TEC|DPG|IPM|alcohol|EtOH)?$/i, "")
    .trim();
}

function normalizeMatchName(value) {
  return normalizeMaterialName(stripWorkingStockSuffix(value));
}

function displayReferenceName(reference = {}) {
  const fragrance = reference.fragranceName || reference.titleGuess || reference.id || "Unknown";
  const brand = reference.brand || reference.brandGuess || "";
  const year = reference.releaseYear ? ` (${reference.releaseYear})` : "";
  return brand ? `${brand} ${fragrance}${year}` : `${fragrance}${year}`;
}

function materialMatchesTerm(name, term) {
  const normalizedName = normalizeMatchName(name);
  const normalizedTerm = normalizeMatchName(term);
  if (!normalizedName || !normalizedTerm) return false;
  if (normalizedName === normalizedTerm) return true;
  if (GENERIC_CONTAINS_TERMS.includes(normalizedTerm)) {
    return normalizedName.includes(normalizedTerm);
  }
  return false;
}

function materialMatchesAnyTerm(name, terms = []) {
  return terms.some((term) => materialMatchesTerm(name, term));
}

function termsPresent(rows = [], terms = []) {
  return terms.some((term) => rows.some((row) => materialMatchesTerm(row.rawName, term)));
}

function sortByName(items) {
  return [...items].sort((a, b) => String(a).localeCompare(String(b)));
}

function addIdentityRecord(lookup, name, record = {}) {
  const normalized = normalizeMatchName(name);
  if (!normalized) return;
  if (!lookup.has(normalized)) {
    lookup.set(normalized, {
      canonicalName: record.canonicalName || record.targetName || name,
      identityGroup: record.identityGroup || normalizeMatchName(record.canonicalName || name),
      matchType: record.matchType || "exact",
      matchConfidence: record.matchConfidence || "high",
      notes: record.notes || "",
    });
  }
}

function buildIdentityLookup({ aliasData = {}, patterns = {} } = {}) {
  const lookup = new Map();
  for (const record of aliasData.records || []) {
    addIdentityRecord(lookup, record.canonicalName, record);
    addIdentityRecord(lookup, record.targetName, record);
    for (const alias of record.aliases || []) {
      addIdentityRecord(lookup, alias.name, {
        ...record,
        canonicalName: alias.targetName || record.targetName || record.canonicalName,
        matchType: alias.matchType || "alias",
        matchConfidence: alias.matchConfidence || "medium",
        notes: alias.notes || record.notes || "",
      });
    }
  }

  const addPatternRows = (rows = []) => {
    for (const row of rows) {
      addIdentityRecord(lookup, row.rawName || row.name, row);
      addIdentityRecord(lookup, row.canonicalName, row);
    }
  };
  addPatternRows(patterns.universalStructuralMaterials);
  addPatternRows(patterns.dosageBandGuidance);
  addPatternRows(patterns.mostValuableMissingMaterials);
  for (const rows of Object.values(patterns.highDoseArchitectureMaterials?.thresholds || {})) {
    addPatternRows(rows);
  }

  return lookup;
}

function canonicalizeMaterial(name, identityLookup = new Map()) {
  const rawName = String(name || "").trim();
  const strippedName = stripWorkingStockSuffix(rawName);
  const normalizedName = normalizeMatchName(rawName);
  const normalizedStrippedName = normalizeMatchName(strippedName);
  const identity =
    identityLookup.get(normalizedName) || identityLookup.get(normalizedStrippedName) || null;
  const canonicalName = identity?.canonicalName || strippedName || rawName;
  const identityGroup = identity?.identityGroup || normalizeMatchName(canonicalName);
  return {
    rawName,
    strippedName,
    normalizedName,
    normalizedStrippedName,
    canonicalName,
    normalizedCanonicalName: normalizeMatchName(canonicalName),
    identityGroup,
    identityMatchType: identity?.matchType || "raw_name",
    identityMatchConfidence: identity?.matchConfidence || "low",
  };
}

function summarizePatternPresence(rows = []) {
  return PATTERN_DEFINITIONS.map((definition) => {
    const matchedNames = uniqueStrings(
      rows
        .filter((row) =>
          materialMatchesAnyTerm(row.rawName, [
            ...definition.materialTerms,
            row.canonicalName || "",
          ])
        )
        .filter((row) => materialMatchesAnyTerm(row.rawName, definition.materialTerms))
        .map((row) => row.canonicalName || row.strippedName || row.rawName)
    );
    return {
      id: definition.id,
      patternName: definition.patternName,
      matchedMaterials: matchedNames.slice(0, 14),
      matchCount: matchedNames.length,
    };
  }).filter((pattern) => pattern.matchCount > 0);
}

function buildPairSet(rows = []) {
  const pairLabels = [];
  for (const definition of PATTERN_DEFINITIONS) {
    for (const [left, right] of definition.pairIncludes || []) {
      if (termsPresent(rows, [left]) && termsPresent(rows, [right])) {
        pairLabels.push(`${left} + ${right}`);
      }
    }
  }
  return uniqueStrings(pairLabels);
}

function rowPercent(row = {}) {
  const value = row.percent ?? row.relativePercent ?? row.areaPercent;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function buildFormulaProfile(formula = {}, accordRecipes = {}, identityLookup = new Map()) {
  const expandedRows = expandHeroFormulaMaterials(formula, accordRecipes).map((row) => ({
    ...row,
    ...canonicalizeMaterial(row.rawName, identityLookup),
  }));
  const totalGrams = (formula.ingredients || []).reduce(
    (sum, ingredient) => sum + (Number(ingredient.g) || 0),
    0
  );
  const directRows = (formula.ingredients || []).flatMap((ingredient) => {
    const grams = Number(ingredient.g) || 0;
    const doseShare = totalGrams > 0 ? grams / totalGrams : 0;
    const primary = {
      ...canonicalizeMaterial(ingredient.name, identityLookup),
      grams,
      doseShare,
      note: ingredient.note || "",
      source: "formula row",
    };
    const stripped = stripWorkingStockSuffix(ingredient.name);
    if (!stripped || stripped === ingredient.name) return [primary];
    return [
      primary,
      {
        ...canonicalizeMaterial(stripped, identityLookup),
        grams,
        doseShare,
        note: ingredient.note || "",
        source: "working-stock parent",
      },
    ];
  });
  const highDoseRows = directRows
    .filter((row) => row.doseShare >= 0.05)
    .sort((a, b) => b.doseShare - a.doseShare)
    .slice(0, 10);
  const patternPresence = summarizePatternPresence(expandedRows);
  const identityGroups = uniqueStrings(expandedRows.map((row) => row.identityGroup).filter(Boolean));
  const canonicalNames = uniqueStrings(
    expandedRows.map((row) => row.canonicalName || row.strippedName || row.rawName)
  );
  return {
    formulaName: formula.name,
    formulaKey: formula.formulaKey || formula.key || "",
    totalGrams,
    rows: expandedRows,
    directRows,
    highDoseRows,
    canonicalNames,
    identityGroups,
    patternPresence,
    patternIds: patternPresence.map((pattern) => pattern.id),
    pairSet: buildPairSet(expandedRows),
  };
}

function buildReferenceProfile(reference = {}, identityLookup = new Map()) {
  const rows = (reference.detectedMaterials || [])
    .filter((material) => material?.name && !/unidentified/i.test(material.name))
    .map((material) => ({
      ...canonicalizeMaterial(material.name, identityLookup),
      percent: rowPercent(material),
      rank: material.rank ?? null,
      cas: material.cas || "",
    }));
  const highDoseRows = rows
    .filter((row) => (row.percent ?? 0) >= 2.5 || (row.rank && row.rank <= 12))
    .slice(0, 16);
  const patternPresence = summarizePatternPresence(rows);
  const identityGroups = uniqueStrings(rows.map((row) => row.identityGroup).filter(Boolean));
  const canonicalNames = uniqueStrings(rows.map((row) => row.canonicalName || row.rawName));
  return {
    id: reference.id || reference.sourceFilename || displayReferenceName(reference),
    sourceFilename: reference.sourceFilename || "",
    referenceFragrance: reference.fragranceName || reference.titleGuess || reference.id || "",
    brand: reference.brand || reference.brandGuess || "",
    releaseYear: reference.releaseYear ?? null,
    perfumer: reference.perfumer || "",
    displayName: displayReferenceName(reference),
    rows,
    highDoseRows,
    canonicalNames,
    identityGroups,
    patternPresence,
    patternIds: patternPresence.map((pattern) => pattern.id),
    pairSet: buildPairSet(rows),
    detectedMaterialCount: rows.length,
  };
}

function intersectStrings(left = [], right = []) {
  const rightSet = new Set(right);
  return uniqueStrings(left.filter((item) => rightSet.has(item)));
}

function namesForIdentityGroups(rows = [], groups = []) {
  const groupSet = new Set(groups);
  return uniqueStrings(
    rows
      .filter((row) => groupSet.has(row.identityGroup))
      .map((row) => row.canonicalName || row.strippedName || row.rawName)
  );
}

function sharedPatternNames(patternIds = []) {
  return patternIds.map((id) => FAMILY_SHORT_NAMES.get(id) || id);
}

function classifySimilarity({ sharedMaterials, sharedIdentityGroups, sharedPatternIds, sharedHighDoseGroups, sharedPairs }) {
  const materialCount = sharedMaterials.length;
  const identityCount = sharedIdentityGroups.length;
  const patternCount = sharedPatternIds.length;
  const highDoseCount = sharedHighDoseGroups.length;
  const pairCount = sharedPairs.length;
  if (patternCount >= 4 && identityCount >= 5 && (highDoseCount > 0 || pairCount > 0)) {
    return "strong construction resemblance";
  }
  if (patternCount >= 3 && identityCount >= 4) return "strong construction resemblance";
  if (patternCount >= 2 && identityCount >= 2) return "partial architecture resemblance";
  if (materialCount >= 2 || identityCount >= 2) return "material overlap only";
  if (patternCount >= 1) return "conceptual inspiration";
  return "weak match";
}

function buildSignalSummary({
  sharedMaterials,
  sharedIdentityGroups,
  sharedPatternIds,
  sharedHighDoseGroups,
  sharedPairs,
}) {
  const parts = [
    `${sharedMaterials.length} shared material identities`,
    `${sharedPatternIds.length} shared construction families`,
  ];
  if (sharedHighDoseGroups.length) parts.push(`${sharedHighDoseGroups.length} high-dose overlaps`);
  if (sharedPairs.length) parts.push(`${sharedPairs.length} shared co-occurrence patterns`);
  if (sharedIdentityGroups.length > sharedMaterials.length) {
    parts.push(`${sharedIdentityGroups.length - sharedMaterials.length} related identity-group overlaps`);
  }
  return parts.join("; ");
}

function buildKeyDifference(formulaProfile, referenceProfile, sharedPatternIds) {
  const formulaPatterns = new Set(formulaProfile.patternIds);
  const referencePatterns = new Set(referenceProfile.patternIds);
  if (formulaPatterns.has("marine_mineral_architecture") && !referencePatterns.has("marine_mineral_architecture")) {
    return "Beach Box pushes the structure more toward marine/mineral shoreline texture than this reference.";
  }
  if (referencePatterns.has("citrus_terpene_lift") && !formulaPatterns.has("citrus_terpene_lift")) {
    return "The reference carries broader citrus/terpene lift; Beach Box should not chase the whole opening unless wear tests need sparkle.";
  }
  if (referencePatterns.has("dark_dirty_realism_modifiers") && !formulaPatterns.has("dark_dirty_realism_modifiers")) {
    return "The reference leans darker or more resinous; translate only a shadow effect if Beach Box needs more low-tide realism.";
  }
  if (sharedPatternIds.includes("woody_amber_driftwood_architecture")) {
    return "The overlap is mostly woody/musk structure; Beach Box keeps the coastal skin and mineral story as the differentiator.";
  }
  return "The useful overlap is architectural, not a full olfactive match or formula to reconstruct.";
}

function buildUsefulLesson(sharedPatternIds) {
  if (
    sharedPatternIds.includes("airy_diffusion_architecture") &&
    sharedPatternIds.includes("woody_amber_driftwood_architecture")
  ) {
    return "Use this as evidence that airy woody amber plus transparent floral/musk lift can carry trail without adding more aquatic force.";
  }
  if (sharedPatternIds.includes("skin_musk_soft_base_architecture")) {
    return "Use this as a reminder to validate musk cushion and drydown persistence on skin before adding more base material.";
  }
  if (sharedPatternIds.includes("marine_mineral_architecture")) {
    return "Use this as a restraint check: marine effects work best when integrated into wood, musk, and air rather than made louder by default.";
  }
  if (sharedPatternIds.includes("citrus_terpene_lift")) {
    return "Use the opening-energy lesson only if Beach Box needs more top sparkle after controlled wear tests.";
  }
  if (sharedPatternIds.includes("floral_transparency_heart_bridge")) {
    return "Use floral transparency as a skin-air bridge, not as a separate floral theme.";
  }
  return "Use this as broad corpus context, then let controlled Beach Box wear tests decide whether the lesson applies.";
}

function compareFormulaToReference(formulaProfile, referenceProfile) {
  const sharedIdentityGroups = intersectStrings(
    formulaProfile.identityGroups,
    referenceProfile.identityGroups
  );
  const sharedMaterials = sortByName(
    intersectStrings(formulaProfile.canonicalNames, referenceProfile.canonicalNames)
  );
  const sharedPatternIds = intersectStrings(formulaProfile.patternIds, referenceProfile.patternIds);
  const formulaHighDoseGroups = uniqueStrings(
    formulaProfile.highDoseRows.map((row) => row.identityGroup).filter(Boolean)
  );
  const referenceHighDoseGroups = uniqueStrings(
    referenceProfile.highDoseRows.map((row) => row.identityGroup).filter(Boolean)
  );
  const sharedHighDoseGroups = intersectStrings(formulaHighDoseGroups, referenceHighDoseGroups);
  const sharedPairs = intersectStrings(formulaProfile.pairSet, referenceProfile.pairSet);
  const relatedOnlyGroups = sharedIdentityGroups.filter((group) => {
    const formulaNames = namesForIdentityGroups(formulaProfile.rows, [group]);
    return !formulaNames.some((name) => sharedMaterials.includes(name));
  });
  const sortSignal =
    sharedMaterials.length * 5 +
    sharedIdentityGroups.length * 2 +
    sharedPatternIds.length * 4 +
    sharedHighDoseGroups.length * 3 +
    sharedPairs.length * 3;
  const similarityLabel = classifySimilarity({
    sharedMaterials,
    sharedIdentityGroups,
    sharedPatternIds,
    sharedHighDoseGroups,
    sharedPairs,
  });

  return {
    referenceId: referenceProfile.id,
    referenceFragrance: referenceProfile.referenceFragrance,
    brand: referenceProfile.brand,
    releaseYear: referenceProfile.releaseYear,
    perfumer: referenceProfile.perfumer,
    displayName: referenceProfile.displayName,
    similarityLabel,
    sharedConstructionPatterns: sharedPatternNames(sharedPatternIds),
    sharedMaterials: sharedMaterials.slice(0, 18),
    sharedIdentityGroups: relatedOnlyGroups.slice(0, 10),
    sharedHighDoseSignals: namesForIdentityGroups(
      [...formulaProfile.highDoseRows, ...referenceProfile.highDoseRows],
      sharedHighDoseGroups
    ).slice(0, 10),
    sharedCoOccurrencePatterns: sharedPairs.slice(0, 8),
    keyDifference: buildKeyDifference(formulaProfile, referenceProfile, sharedPatternIds),
    usefulLesson: buildUsefulLesson(sharedPatternIds),
    matchSignals: {
      sharedMaterialIdentityCount: sharedMaterials.length,
      sharedRelatedIdentityGroupCount: sharedIdentityGroups.length,
      sharedConstructionFamilyCount: sharedPatternIds.length,
      sharedHighDoseSignalCount: sharedHighDoseGroups.length,
      sharedCoOccurrencePatternCount: sharedPairs.length,
      signalSummary: buildSignalSummary({
        sharedMaterials,
        sharedIdentityGroups,
        sharedPatternIds,
        sharedHighDoseGroups,
        sharedPairs,
      }),
    },
    _sortSignal: sortSignal,
  };
}

function buildFormulaDivergence(profile) {
  const patterns = new Set(profile.patternIds);
  if (patterns.has("marine_mineral_architecture") && patterns.has("woody_amber_driftwood_architecture")) {
    return "Uses proven modern woody/musk diffusion as a frame, then bends it toward salted skin, mineral air, and driftwood.";
  }
  if (patterns.has("dark_dirty_realism_modifiers")) {
    return "Carries darker realism materials into a coastal brief, so its differentiation depends on restraint and skin testing.";
  }
  return "Keeps the Beach Box direction original by treating GCMS patterns as structure rather than commercial formula targets.";
}

function buildFormulaSuggestion(profile) {
  const patterns = new Set(profile.patternIds);
  if (patterns.has("marine_mineral_architecture")) {
    return "Validate whether the marine/mineral heart feels skinlike and coastal before adding more marine force.";
  }
  if (patterns.has("skin_musk_soft_base_architecture")) {
    return "Validate musk cushion, projection, and drydown appeal before changing the base.";
  }
  return "Use the closest references as architecture checks, then rely on controlled wear evidence before changing the formula.";
}

function buildFormulaRisk(profile) {
  const patterns = new Set(profile.patternIds);
  if (patterns.has("marine_mineral_architecture")) {
    return "Marine/mineral materials can become loud, metallic, or generic before they become more realistic.";
  }
  if (patterns.has("woody_amber_driftwood_architecture")) {
    return "Woody amber structure can dominate the brief and make marine notes feel pasted on if the balance is not tested on skin.";
  }
  return "GCMS resemblance can overstate confidence; this still needs controlled wear-test evidence.";
}

function buildWorthConsideringLater(profile, patterns = {}) {
  const formulaGroups = new Set(profile.identityGroups);
  const presentNames = new Set(profile.canonicalNames.map((name) => normalizeMatchName(name)));
  const missingRows = new Map(
    (patterns.mostValuableMissingMaterials || []).map((row) => [
      normalizeMatchName(row.rawName || row.canonicalName),
      row,
    ])
  );
  return HIGH_VALUE_GAP_HINTS.filter((hint) =>
    hint.patternIds.some((patternId) => profile.patternIds.includes(patternId))
  )
    .filter((hint) => !presentNames.has(normalizeMatchName(hint.name)))
    .filter((hint) => {
      const row = missingRows.get(normalizeMatchName(hint.name));
      return row?.priority === "worth considering" || hint.name === "Vanillin";
    })
    .filter((hint) => !formulaGroups.has(normalizeMatchName(hint.name)))
    .slice(0, 3)
    .map((hint) => ({
      material: hint.name,
      reason: hint.reason,
    }));
}

function buildFormulaReport({ profile, topMatches, patterns }) {
  const closestFamilies = profile.patternPresence
    .sort((a, b) => b.matchCount - a.matchCount || a.patternName.localeCompare(b.patternName))
    .slice(0, 4)
    .map((pattern) => ({
      patternName: pattern.patternName,
      representedBy: pattern.matchedMaterials.slice(0, 8),
    }));
  const topSharedMaterials = uniqueStrings(
    topMatches.flatMap((match) => match.sharedMaterials)
  ).slice(0, 16);
  const topSharedPatterns = uniqueStrings(
    topMatches.flatMap((match) => match.sharedConstructionPatterns)
  ).slice(0, 8);
  return {
    formulaName: profile.formulaName,
    formulaKey: profile.formulaKey,
    closestReferenceConstructionFamilies: closestFamilies,
    referenceResemblance:
      topSharedPatterns.length > 0
        ? `Most references overlap through ${topSharedPatterns.slice(0, 3).join(", ")}.`
        : "No strong architecture cluster found; use matches as weak context only.",
    sharedMaterials: topSharedMaterials,
    sharedArchitecturePatterns: topSharedPatterns,
    beachBoxDivergence: buildFormulaDivergence(profile),
    whatThisSuggests:
      "Treat the GCMS corpus as evidence for construction roles, then test the Beach Box formula on skin before changing dosage or materials.",
    whatNotToCopy:
      "Do not copy exact GCMS percentages, commercial material breadth, or reference-style citrus/musk bulk blindly.",
    potentialUsefulMove: buildFormulaSuggestion(profile),
    riskCaveat: buildFormulaRisk(profile),
    worthConsideringLater: buildWorthConsideringLater(profile, patterns),
    topReferenceMatches: topMatches.map(({ _sortSignal, ...match }) => match),
  };
}

function averageTopSignals(formulaReport) {
  const top = formulaReport.topReferenceMatches.slice(0, 5);
  if (!top.length) return 0;
  const total = top.reduce(
    (sum, match) =>
      sum +
      match.matchSignals.sharedMaterialIdentityCount * 2 +
      match.matchSignals.sharedConstructionFamilyCount * 3 +
      match.matchSignals.sharedHighDoseSignalCount,
    0
  );
  return total / top.length;
}

function formulaPatternCount(formulaReport, patternName) {
  return formulaReport.closestReferenceConstructionFamilies.some(
    (pattern) => pattern.patternName === patternName
  )
    ? formulaReport.closestReferenceConstructionFamilies.find(
        (pattern) => pattern.patternName === patternName
      ).representedBy.length
    : 0;
}

function pickBy(formulaReports, valueFn, fallbackLabel) {
  const sorted = [...formulaReports].sort((a, b) => valueFn(b) - valueFn(a));
  return sorted[0]?.formulaName || fallbackLabel;
}

function buildCrossFormulaLessons(formulaReports) {
  const bestModern = pickBy(
    formulaReports,
    (report) => averageTopSignals(report),
    "No formula"
  );
  const mostDifferentiated = [...formulaReports].sort(
    (a, b) => averageTopSignals(a) - averageTopSignals(b)
  )[0]?.formulaName;
  const marineRisk = pickBy(
    formulaReports,
    (report) => formulaPatternCount(report, "Marine / Mineral Architecture"),
    "No formula"
  );
  const woodyMusk = pickBy(
    formulaReports,
    (report) =>
      formulaPatternCount(report, "Woody Amber / Driftwood Architecture") +
      formulaPatternCount(report, "Skin Musk / Soft Base Architecture"),
    "No formula"
  );
  const wearTest = marineRisk || mostDifferentiated || bestModern;
  return [
    {
      topic: "Best embodiment of proven modern construction patterns",
      formulaName: bestModern,
      lesson:
        "This formula has the densest overlap with recurring airy diffusion, woody amber, musk, and transparency patterns; use wear tests to decide whether that strength feels like Beach Box rather than generic modern structure.",
    },
    {
      topic: "Most differentiated construction read",
      formulaName: mostDifferentiated || "No formula",
      lesson:
        "Lower direct reference resemblance can be valuable if the Beach Box coastal skin/marine/wood idea reads clearly in wear tests.",
    },
    {
      topic: "Highest risk of overusing marine/mineral effects",
      formulaName: marineRisk,
      lesson:
        "Treat marine/mineral overlap as a restraint signal: test realism and skin integration before increasing Calone/Oceanol/seaweed-style force.",
    },
    {
      topic: "Strongest woody/musk architecture",
      formulaName: woodyMusk,
      lesson:
        "The woody/musk base is the most commercially familiar architecture; use it as support, not as the whole identity.",
    },
    {
      topic: "Most needs wear-test validation",
      formulaName: wearTest,
      lesson:
        "The model can compare construction patterns, but skin evolution, projection, and drydown appeal remain unproven without controlled testing.",
    },
  ];
}

function normalizeReferencesPayload(payload = {}) {
  return Array.isArray(payload) ? payload : payload.reports || [];
}

export function buildHeroFormulaGcmsReferenceMatches({
  formulas = [],
  accordRecipes = {},
  structuredPayload = {},
  patterns = {},
  aliasData = {},
  translation = {},
  generatedAt = new Date().toISOString(),
  topLimit = 8,
} = {}) {
  const originalFormulasFingerprint = JSON.stringify(formulas);
  const originalStructuredFingerprint = JSON.stringify(structuredPayload);
  const originalPatternsFingerprint = JSON.stringify(patterns);
  const activeFormulas = formulas.filter((formula) => ACTIVE_HERO_NAMES.includes(formula.name));
  const identityLookup = buildIdentityLookup({ aliasData, patterns });
  const formulaProfiles = activeFormulas.map((formula) =>
    buildFormulaProfile(formula, accordRecipes, identityLookup)
  );
  const referenceProfiles = normalizeReferencesPayload(structuredPayload)
    .filter((report) => (report.detectedMaterials || []).length > 0)
    .map((report) => buildReferenceProfile(report, identityLookup));
  const formulasReport = formulaProfiles.map((profile) => {
    const topMatches = referenceProfiles
      .map((referenceProfile) => compareFormulaToReference(profile, referenceProfile))
      .filter((match) => match.similarityLabel !== "weak match" || match._sortSignal > 0)
      .sort(
        (a, b) =>
          b._sortSignal - a._sortSignal ||
          a.displayName.localeCompare(b.displayName)
      )
      .slice(0, topLimit);
    return buildFormulaReport({ profile, topMatches, patterns });
  });
  const report = {
    generatedAt,
    sourceStructuredCandidatesPath: "data/gcms_extracted/gcms_structured_candidates.json",
    sourceConstructionPatternsPath: "data/gcms_extracted/gcms_construction_patterns.json",
    sourceBeachBoxTranslationPath: "data/gcms_extracted/beach_box_pattern_translation.json",
    activeHeroFormulaCount: activeFormulas.length,
    gcmsReferenceCount: referenceProfiles.length,
    trueComponentRowCount: patterns.trueComponentRowCount || structuredPayload.trueComponentRowCount || null,
    guardrails: [
      "GCMS reference matching is pattern guidance, not formula reconstruction.",
      "Use matches to inform original Beach Box design decisions and controlled testing.",
      "Do not copy commercial formulas, exact GCMS percentages, or reference material breadth.",
      "This report does not change active formulas, IFRA logic, pricing, accord recipes, sensory data, candidate statuses, UI, or AI behavior.",
    ],
    formulas: formulasReport,
    crossFormulaLessons: buildCrossFormulaLessons(formulasReport),
    corpusContext: {
      translationSectionCount: translation.translationSections?.length || 0,
      inventoryGapsWorthConsidering:
        translation.beachBoxMoves?.inventoryGapsWorthConsidering || [],
    },
  };

  if (JSON.stringify(formulas) !== originalFormulasFingerprint) {
    throw new Error("Hero formula GCMS matcher mutated formula input.");
  }
  if (JSON.stringify(structuredPayload) !== originalStructuredFingerprint) {
    throw new Error("Hero formula GCMS matcher mutated structured GCMS input.");
  }
  if (JSON.stringify(patterns) !== originalPatternsFingerprint) {
    throw new Error("Hero formula GCMS matcher mutated construction pattern input.");
  }

  return report;
}

function formatList(items, emptyLabel = "None.") {
  if (!items?.length) return `- ${emptyLabel}`;
  return items.map((item) => `- ${item}`).join("\n");
}

function markdownTable(rows, columns, emptyLabel) {
  if (!rows.length) return `_${emptyLabel}_`;
  const header = `| ${columns.map((column) => column.label).join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows
    .map(
      (row) =>
        `| ${columns
          .map((column) => String(column.value(row) ?? "").replace(/\|/g, "\\|"))
          .join(" | ")} |`
    )
    .join("\n");
  return [header, divider, body].join("\n");
}

export function formatHeroFormulaGcmsReferenceMatchesText(report) {
  return [
    "Hero Formula GCMS Reference Matches",
    "",
    `Active hero formulas matched: ${report.activeHeroFormulaCount}`,
    `GCMS references considered: ${report.gcmsReferenceCount}`,
    "",
    "Guardrails:",
    ...report.guardrails.map((guardrail) => `- ${guardrail}`),
    "",
    "Top matches by formula:",
    ...report.formulas.flatMap((formula) => [
      "",
      `${formula.formulaName}:`,
      ...formula.topReferenceMatches.slice(0, 5).map(
        (match) =>
          `- ${match.displayName}: ${match.similarityLabel}; ${match.matchSignals.signalSummary}`
      ),
      `Potential useful move: ${formula.potentialUsefulMove}`,
    ]),
    "",
    "Cross-formula lessons:",
    ...report.crossFormulaLessons.map(
      (lesson) => `- ${lesson.topic}: ${lesson.formulaName}. ${lesson.lesson}`
    ),
  ].join("\n");
}

export function formatHeroFormulaGcmsReferenceMatchesMarkdown(report) {
  const matchColumns = [
    { label: "Reference", value: (row) => row.displayName },
    { label: "Similarity", value: (row) => row.similarityLabel },
    {
      label: "Shared Patterns",
      value: (row) => row.sharedConstructionPatterns.slice(0, 4).join(", ") || "None",
    },
    { label: "Shared Materials", value: (row) => row.sharedMaterials.slice(0, 8).join(", ") || "None" },
    { label: "Key Difference", value: (row) => row.keyDifference },
    { label: "Useful Lesson", value: (row) => row.usefulLesson },
  ];
  const formulaSections = report.formulas.flatMap((formula) => [
    `## ${formula.formulaName}`,
    "",
    `**Closest architecture:** ${formula.closestReferenceConstructionFamilies
      .map((family) => family.patternName)
      .join(" + ") || "No strong corpus family."}`,
    "",
    `**Reference resemblance:** ${formula.referenceResemblance}`,
    "",
    `**Beach Box divergence:** ${formula.beachBoxDivergence}`,
    "",
    `**What this suggests:** ${formula.whatThisSuggests}`,
    "",
    `**What not to copy:** ${formula.whatNotToCopy}`,
    "",
    `**Potential useful move:** ${formula.potentialUsefulMove}`,
    "",
    `**Risk/caveat:** ${formula.riskCaveat}`,
    "",
    "**Top Reference Matches**",
    "",
    markdownTable(formula.topReferenceMatches, matchColumns, "No reference matches found."),
    "",
    "**Worth Considering Later**",
    "",
    formatList(
      formula.worthConsideringLater.map((gap) => `${gap.material}: ${gap.reason}`),
      "No high-value material gaps surfaced for this formula."
    ),
    "",
  ]);

  return [
    "# Hero Formula GCMS Reference Matches",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Active hero formulas matched: ${report.activeHeroFormulaCount}`,
    "",
    `GCMS references considered: ${report.gcmsReferenceCount}`,
    "",
    "## Guardrails",
    "",
    formatList(report.guardrails),
    "",
    "## Cross-Formula Lessons From GCMS Matching",
    "",
    markdownTable(
      report.crossFormulaLessons,
      [
        { label: "Question", value: (row) => row.topic },
        { label: "Formula", value: (row) => row.formulaName },
        { label: "Lesson", value: (row) => row.lesson },
      ],
      "No cross-formula lessons generated."
    ),
    "",
    ...formulaSections,
  ].join("\n");
}

export function loadHeroFormulaGcmsReferenceMatchInputs({
  appPath,
  structuredPath = DEFAULT_GCMS_STRUCTURED_CANDIDATES_PATH,
  patternsPath = DEFAULT_GCMS_CONSTRUCTION_PATTERNS_PATH,
  aliasPath = DEFAULT_GCMS_MATERIAL_ALIASES_PATH,
  translationPath = DEFAULT_BEACH_BOX_PATTERN_TRANSLATION_PATH,
  accordPath,
} = {}) {
  return {
    formulas: loadActiveHeroFormulas(appPath),
    accordRecipes: readJson(
      accordPath || path.join(ROOT, "src", "data", "hero_formula_accord_recipes.json"),
      { recipes: [] }
    ),
    structuredPayload: readJson(structuredPath, { reports: [] }),
    patterns: readJson(patternsPath, {}),
    aliasData: readJson(aliasPath, { records: [] }),
    translation: readJson(translationPath, {}),
  };
}

export function writeHeroFormulaGcmsReferenceMatches(filePath, report) {
  writeJsonFile(filePath, report);
}
