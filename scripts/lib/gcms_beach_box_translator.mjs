import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

import {
  DEFAULT_APP_PATH,
  ROOT,
  normalizeMaterialName,
  uniqueStrings,
  writeJsonFile,
} from "./gcms_reference_pipeline.mjs";
import {
  DEFAULT_GCMS_CONSTRUCTION_PATTERNS_PATH,
  DEFAULT_HERO_ACCORD_RECIPES_PATH,
} from "./gcms_construction_patterns.mjs";

export const DEFAULT_BEACH_BOX_PATTERN_TRANSLATION_PATH = path.join(
  ROOT,
  "data",
  "gcms_extracted",
  "beach_box_pattern_translation.json"
);
export const DEFAULT_BEACH_BOX_PATTERN_TRANSLATION_MARKDOWN_PATH = path.join(
  ROOT,
  "docs",
  "gcms",
  "beach_box_pattern_translation.md"
);

export const ACTIVE_HERO_NAMES = [
  "Random Concoction - Original",
  "Skin-Air Bridge",
  "Damp Shoreline v1",
  "Damp Shoreline v2",
];

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
  "marine",
  "ozonic",
  "algae",
  "resin",
  "spice",
];

export const PATTERN_DEFINITIONS = [
  {
    id: "airy_diffusion_architecture",
    patternName: "Airy Diffusion Architecture",
    corpusFocus:
      "Hedione + Iso E Super, Hedione + musks, Iso E Super + Cashmeran, and Iso E Super + Ambroxan relationships.",
    materialTerms: [
      "Hedione",
      "Hedione HC",
      "Hedione® High Cis",
      "Iso E Super",
      "Cashmeran",
      "Ambroxan",
      "Ambroxan Crystals",
      "Ambrox",
      "Cetalox",
      "Botanical Musk Accord",
      "Driftwood Accord",
      "Ethylene Brassylate",
      "Ambrettolide",
    ],
    skeletonNames: ["Woody Amber Skeleton", "Musky Floral Skeleton"],
    pairIncludes: [
      ["Hedione", "Iso E Super"],
      ["Iso E Super", "Cashmeran"],
      ["Ambroxan", "Iso E Super"],
      ["Hedione", "Linalool"],
    ],
    beachBoxTranslation:
      "Build salt-air lift through a transparent Hedione/wood/musk bridge: driftwood transparency, skin-air diffusion, mineral radiance, and sun-warmed musks before adding more marine force.",
    whatToTest:
      "Compare lift and trail from the existing Hedione, Iso E/driftwood, Ambroxan/Cetalox, Cashmeran, and botanical musk structure before increasing aquatic impact.",
    whatNotToOverdo:
      "Do not keep stacking diffusers until the formula turns abstract, dry, or laundry-like; keep enough skin warmth and shoreline materiality.",
    risk:
      "High diffusion can make the formula feel impressive in air but thin on skin; wear-test against skin closeness and drydown identity.",
    overrepresentedThreshold: 8,
    representedThreshold: 4,
    sensitivity: "diffusion can outrun identity",
  },
  {
    id: "skin_musk_soft_base_architecture",
    patternName: "Skin Musk / Soft Base Architecture",
    corpusFocus:
      "Ethylene Brassylate, Galaxolide, Ambrettolide, Habanolide, Helvetolide, and soft musk-body patterns.",
    materialTerms: [
      "Ethylene Brassylate",
      "Galaxolide",
      "Ambrettolide",
      "Habanolide",
      "Helvetolide",
      "Exaltolide",
      "Muscenone",
      "Musk",
      "Botanical Musk Accord",
    ],
    skeletonNames: ["Musky Floral Skeleton"],
    pairIncludes: [["Ethylene Brassylate", "Galaxolide"]],
    beachBoxTranslation:
      "Translate the common musk base into a salted skin veil: clean skin warmth, soft towel air, and intimate diffusion under the marine/wood topography.",
    whatToTest:
      "Test whether the Botanical Musk Accord gives enough cushion and persistence before adding or buying more standalone musks.",
    whatNotToOverdo:
      "Avoid making the base too clean, sweet, or fabric-soft; Beach Box should feel like skin by the shore, not a detergent musk study.",
    risk:
      "Musk-heavy structures can hide the mineral/marine story and may need side-by-side skin wear to judge real persistence.",
    overrepresentedThreshold: 6,
    representedThreshold: 2,
    sensitivity: "musk can flatten contrast",
  },
  {
    id: "woody_amber_driftwood_architecture",
    patternName: "Woody Amber / Driftwood Architecture",
    corpusFocus:
      "Iso E Super, Cashmeran, Ambroxan/Ambroxide, cedar materials, vetiver, patchouli, and amberwood support.",
    materialTerms: [
      "Iso E Super",
      "Cashmeran",
      "Ambroxan",
      "Ambroxan Crystals",
      "Ambrox",
      "Ambroxide",
      "Cetalox",
      "Cedarwood Virginia EO",
      "Vetiveryl Acetate",
      "Timbersilk",
      "Orbitone T Neo",
      "Clearwood",
      "Driftwood Accord",
      "Cypriol",
      "Patchoulol",
      "Patchouli",
      "Amber Xtreme",
    ],
    skeletonNames: ["Woody Amber Skeleton"],
    pairIncludes: [
      ["Iso E Super", "Cashmeran"],
      ["Ambroxan", "Iso E Super"],
      ["Hedione", "Iso E Super"],
    ],
    beachBoxTranslation:
      "Use woody amber architecture as dry driftwood and sun-bleached boards: warm mineral amber underneath, airy wood in the middle, and rougher wood shadows only where the shoreline needs realism.",
    whatToTest:
      "Test Driftwood Accord versions against direct Iso E/Cashmeran/Ambroxan/Cetalox structure to decide whether the formula needs more weathered wood or more air.",
    whatNotToOverdo:
      "Avoid a generic amberwood blast; Beach Box should read as weathered coastal material, not only modern woody diffusion.",
    risk:
      "Woody amber materials can dominate identity quickly and may make marine notes feel pasted on rather than integrated.",
    overrepresentedThreshold: 8,
    representedThreshold: 4,
    sensitivity: "amberwood can dominate the brief",
  },
  {
    id: "marine_mineral_architecture",
    patternName: "Marine / Mineral Architecture",
    corpusFocus:
      "Calone, marine ozonics, algae/seaweed markers, mineral musks, Ambroxan/Cetalox, Helional, and shoreline support.",
    materialTerms: [
      "Calone",
      "Calone 1951",
      "Oceanol",
      "Seaweed Absolute",
      "Maritima",
      "Algenone",
      "Helional",
      "Allyl Amyl Glycolate",
      "Cyclogalbanate",
      "Ambroxan",
      "Cetalox",
      "Marine",
      "Ozonic",
      "Algae",
    ],
    skeletonNames: ["Marine/Mineral Skeleton"],
    pairIncludes: [["Ambroxan", "Iso E Super"]],
    beachBoxTranslation:
      "Treat marine materials as a salt-air and mineral facet woven into musks and woods, not as the whole identity. The corpus supports marine/mineral structure, but the source data is thinner than the floral/musk and woody-amber patterns.",
    whatToTest:
      "Test whether current Calone/Oceanol/Seaweed/Algenone/Maritima levels read like mineral shore air or like obvious aquatic power.",
    whatNotToOverdo:
      "Do not solve every gap by adding more Calone-style power; the better move may be more wood/musk integration or less top-note pressure.",
    risk:
      "Marine materials can become loud, metallic, or generic before they become more realistic.",
    overrepresentedThreshold: 7,
    representedThreshold: 3,
    sensitivity: "marine power needs restraint",
  },
  {
    id: "citrus_terpene_lift",
    patternName: "Citrus / Terpene Lift",
    corpusFocus:
      "Limonene, Linalool, Linalyl Acetate, citrus markers, bergamot/lemon materials, and terpene-rich opening energy.",
    materialTerms: [
      "Limonene",
      "Linalool",
      "Linalyl Acetate",
      "Ethyl Linalool",
      "Ethyl Linalyl Acetate",
      "Bergamot",
      "Bergamot EO FCF",
      "Lemon FCF",
      "Dihydromyrcenol",
      "Alpha.-Pinene",
      "Beta.-Pinene",
      "Gamma.-Terpinene",
    ],
    skeletonNames: [],
    pairIncludes: [
      ["Linalool", "Linalyl Acetate"],
      ["Limonene", "Linalool"],
      ["Limonene", "Linalyl Acetate"],
    ],
    beachBoxTranslation:
      "Use citrus/terpene patterns as salt-air sparkle and controlled opening energy, not as a cologne top. Beach Box needs freshness that flashes off the shoreline and then yields to skin, wood, and musk.",
    whatToTest:
      "Test whether bergamot/lemon/dihydromyrcenol and ethyl linalool/linalyl acetate give enough lift before chasing every common GCMS terpene.",
    whatNotToOverdo:
      "Do not buy or add every frequent terpene marker; many are natural-oil signatures in the corpus, not necessary architecture purchases.",
    risk:
      "Too much citrus/terpene lift can make the formula read like fresh cologne instead of coastal skin.",
    overrepresentedThreshold: 6,
    representedThreshold: 2,
    sensitivity: "freshness can pull cologne",
  },
  {
    id: "floral_transparency_heart_bridge",
    patternName: "Floral Transparency / Heart Bridge",
    corpusFocus:
      "Hedione, Phenylethyl Alcohol, Benzyl Acetate, Hydroxycitronellal, Linalool, ylang/jasmine/rose markers, and translucent floral bridges.",
    materialTerms: [
      "Hedione",
      "Hedione HC",
      "Phenylethyl Alcohol",
      "Phenyl Ethyl Acetate",
      "Benzyl Acetate",
      "Hydroxycitronellal",
      "Linalool",
      "Ylang",
      "Florol",
      "Celestafleur",
      "Methyl Ionone",
      "Jasmine",
      "Rose",
    ],
    skeletonNames: ["Musky Floral Skeleton", "Floral Chypre Skeleton"],
    pairIncludes: [
      ["Hedione", "Linalool"],
      ["Hedione", "Phenylethyl Alcohol"],
      ["Benzyl Salicylate", "Hedione"],
    ],
    beachBoxTranslation:
      "Use floral transparency as sunlit humidity and skin-warmed bloom between marine top and musk base. The goal is bridge and air, not a conventional floral heart.",
    whatToTest:
      "Test whether Hedione/Hedione HC plus Florol/Celestafleur/Ylang and phenethyl materials makes the marine top feel more natural and less isolated.",
    whatNotToOverdo:
      "Avoid letting floral materials take over the concept; they should humidify and connect the structure.",
    risk:
      "A too-floral heart may blur the beach/marine identity or make the scent feel cosmetic.",
    overrepresentedThreshold: 7,
    representedThreshold: 3,
    sensitivity: "floral lift should stay transparent",
  },
  {
    id: "dark_dirty_realism_modifiers",
    patternName: "Dark / Dirty / Realism Modifiers",
    corpusFocus:
      "Patchouli markers, oakmoss/Veramoss, geosmin, cypriol, cumin/carrot/indole-like traces, leather/IBQ, resins, spices, and shadow materials.",
    materialTerms: [
      "Patchoulol",
      "Patchouli",
      "Oakmoss",
      "Veramoss",
      "Evernyl",
      "Geosmin",
      "Cypriol",
      "Cumin",
      "Carrot",
      "Indole",
      "Leather",
      "IBQ",
      "Caryophyllene Oxide",
      "Pink Peppercorn",
      "Ethyl Vanillin",
      "Vanillin",
      "Resin",
      "Spice",
    ],
    skeletonNames: ["Floral Chypre Skeleton", "Gourmand Leather Skeleton"],
    pairIncludes: [],
    beachBoxTranslation:
      "Use dark modifiers for low-tide realism, sun-warmed skin dirt, driftwood shadow, or a beach-fire trace. They should add believable friction, not announce themselves.",
    whatToTest:
      "Test trace dirty/earthy/shadow materials in isolation and on skin before putting them into the hero path.",
    whatNotToOverdo:
      "Do not push mud, soil, smoke, spice, or moss until the formula loses wearability.",
    risk:
      "Realism modifiers are high-risk: a tiny success reads alive, but too much reads dirty or off.",
    overrepresentedThreshold: 4,
    representedThreshold: 1,
    sensitivity: "realism modifiers are high-risk",
  },
];

const MISSING_PRIORITY_RANK = {
  "worth considering": 4,
  "needs identity review": 3,
  "already covered by related material": 2,
  "not urgent": 1,
};

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function extractArrayConstant(source, marker) {
  const markerStart = source.indexOf(marker);
  if (markerStart === -1) throw new Error(`${marker} was not found`);
  const arrayStart = source.indexOf("[", markerStart);
  if (arrayStart === -1) throw new Error(`${marker} array start was not found`);

  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;
  for (let index = arrayStart; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) inString = false;
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      inString = true;
      quote = char;
      continue;
    }
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) return source.slice(arrayStart, index + 1);
    }
  }
  throw new Error(`${marker} array end was not found`);
}

export function extractFormulasInitFromAppSource(source) {
  const arraySource = extractArrayConstant(source, "const FORMULAS_INIT");
  return vm.runInNewContext(`(${arraySource})`, {}, { timeout: 1000 });
}

export function loadActiveHeroFormulas(appPath = DEFAULT_APP_PATH) {
  const formulas = extractFormulasInitFromAppSource(fs.readFileSync(appPath, "utf8"));
  return formulas.filter(
    (formula) =>
      formula?.familyKey === "hero-scent" &&
      formula?.developmentStatus === "active" &&
      ACTIVE_HERO_NAMES.includes(formula.name)
  );
}

function stripWorkingStockSuffix(value) {
  return String(value || "")
    .trim()
    .replace(/\s+\d+(?:\.\d+)?\s*%\s*(?:TEC|DPG|IPM|alcohol|EtOH)?$/i, "")
    .trim();
}

function materialMatchesTerm(name, term) {
  const normalizedName = normalizeMaterialName(stripWorkingStockSuffix(name));
  const normalizedTerm = normalizeMaterialName(stripWorkingStockSuffix(term));
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

function buildAccordRecipeLookup(accordRecipes = {}) {
  const lookup = new Map();
  for (const recipe of accordRecipes.recipes || []) {
    if (!recipe?.name) continue;
    lookup.set(normalizeMaterialName(recipe.name), recipe);
    for (const alias of recipe.aliases || []) {
      lookup.set(normalizeMaterialName(alias), recipe);
    }
  }
  return lookup;
}

export function expandHeroFormulaMaterials(formula = {}, accordRecipes = {}) {
  const accordLookup = buildAccordRecipeLookup(accordRecipes);
  const rows = [];
  const addRow = (name, source, note = "", parentAccord = "") => {
    const rawName = String(name || "").trim();
    if (!rawName) return;
    rows.push({
      rawName,
      normalizedName: normalizeMaterialName(rawName),
      strippedName: stripWorkingStockSuffix(rawName),
      normalizedStrippedName: normalizeMaterialName(stripWorkingStockSuffix(rawName)),
      source,
      note,
      parentAccord,
    });
  };

  for (const ingredient of formula.ingredients || []) {
    addRow(ingredient.name, "formula row", ingredient.note || "");
    const stripped = stripWorkingStockSuffix(ingredient.name);
    if (stripped && stripped !== ingredient.name) {
      addRow(stripped, "working-stock parent", ingredient.note || "");
    }
    const recipe = accordLookup.get(normalizeMaterialName(ingredient.name));
    if (recipe) {
      for (const component of recipe.components || []) {
        addRow(component.name, "accord component", ingredient.note || "", recipe.name);
        const componentStripped = stripWorkingStockSuffix(component.name);
        if (componentStripped && componentStripped !== component.name) {
          addRow(componentStripped, "accord component parent", ingredient.note || "", recipe.name);
        }
      }
    }
  }

  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.normalizedName}|${row.source}|${row.parentAccord}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildMaterialIndex(patterns = {}) {
  const byName = new Map();
  const add = (row = {}, source) => {
    const rawName = row.rawName || row.name;
    const normalized = normalizeMaterialName(rawName);
    if (!normalized) return;
    if (!byName.has(normalized)) {
      byName.set(normalized, {
        rawName,
        canonicalName: row.canonicalName || rawName,
        normalizedName: normalized,
        reportFrequency: row.reportFrequency || row.totalReportFrequency || 0,
        medianPercent: row.medianPercent ?? null,
        dominantDosageBand: row.dominantDosageBand || "",
        highDoseAbove5Count: row.highDoseAbove5Count || row.reportFrequencyAboveThreshold || 0,
        commonRoleGuess: row.commonRoleGuess || "",
        inventoryOverlap: row.inventoryOverlap || {
          status: row.inventoryStatus || "missing from inventory",
          matchType: row.matchType || "none",
          matchConfidence: row.matchConfidence || "low",
        },
        priority: row.priority || "",
        reason: row.reason || "",
        sources: [],
      });
    }
    const existing = byName.get(normalized);
    existing.reportFrequency = Math.max(
      existing.reportFrequency || 0,
      row.reportFrequency || row.totalReportFrequency || 0
    );
    existing.highDoseAbove5Count = Math.max(
      existing.highDoseAbove5Count || 0,
      row.highDoseAbove5Count || row.reportFrequencyAboveThreshold || 0
    );
    if (!existing.medianPercent && row.medianPercent) existing.medianPercent = row.medianPercent;
    if (!existing.dominantDosageBand && row.dominantDosageBand) {
      existing.dominantDosageBand = row.dominantDosageBand;
    }
    if (!existing.commonRoleGuess && row.commonRoleGuess) {
      existing.commonRoleGuess = row.commonRoleGuess;
    }
    if (
      row.priority &&
      (MISSING_PRIORITY_RANK[row.priority] || 0) >
        (MISSING_PRIORITY_RANK[existing.priority] || 0)
    ) {
      existing.priority = row.priority;
    }
    if (!existing.reason && row.reason) existing.reason = row.reason;
    if (row.inventoryOverlap) existing.inventoryOverlap = row.inventoryOverlap;
    if (row.inventoryStatus && existing.inventoryOverlap.status === "missing from inventory") {
      existing.inventoryOverlap = {
        ...existing.inventoryOverlap,
        status: row.inventoryStatus,
        matchType: row.matchType || existing.inventoryOverlap.matchType,
        matchConfidence: row.matchConfidence || existing.inventoryOverlap.matchConfidence,
      };
    }
    existing.sources.push(source);
  };

  for (const row of patterns.universalStructuralMaterials || []) add(row, "universal");
  for (const row of patterns.dosageBandGuidance || []) add(row, "dosage");
  for (const row of patterns.mostValuableMissingMaterials || []) add(row, "missing-priority");
  for (const rows of Object.values(patterns.highDoseArchitectureMaterials?.thresholds || {})) {
    for (const row of rows) add(row, "high-dose");
  }

  return byName;
}

function findPatternMaterials(patterns, terms) {
  const rows = [...buildMaterialIndex(patterns).values()]
    .filter((material) => materialMatchesAnyTerm(material.rawName, terms))
    .sort(
      (a, b) =>
        (b.reportFrequency || 0) - (a.reportFrequency || 0) ||
        (b.highDoseAbove5Count || 0) - (a.highDoseAbove5Count || 0) ||
        a.rawName.localeCompare(b.rawName)
    );
  return rows.slice(0, 14);
}

function findPatternPairs(patterns, pairIncludes) {
  const requested = pairIncludes || [];
  const rows = [
    ...(patterns.featuredCoOccurrencePatterns || []),
    ...(patterns.coOccurrencePatterns || []),
  ];
  const seen = new Set();
  const matches = [];
  for (const row of rows) {
    const pairLabel = (row.materials || []).join(" + ");
    if (seen.has(pairLabel)) continue;
    const pairMatches = requested.some(
      ([a, b]) =>
        (row.materials || []).some((name) => materialMatchesTerm(name, a)) &&
        (row.materials || []).some((name) => materialMatchesTerm(name, b))
    );
    if (!pairMatches) continue;
    seen.add(pairLabel);
    matches.push(row);
  }
  return matches.sort((a, b) => b.reportFrequency - a.reportFrequency).slice(0, 8);
}

function findSkeletons(patterns, skeletonNames) {
  return (patterns.accordSkeletons || []).filter((skeleton) =>
    skeletonNames.includes(skeleton.name)
  );
}

function summarizeCorpusEvidence(patterns, definition, matchedMaterials, matchedPairs, skeletons) {
  const evidence = [];
  for (const skeleton of skeletons) {
    evidence.push(
      `${skeleton.name} appears in ${skeleton.matchedReportCount} of ${patterns.reportCount} reports.`
    );
  }
  for (const pair of matchedPairs.slice(0, 4)) {
    evidence.push(
      `${pair.materials.join(" + ")} appears together in ${pair.reportFrequency} of ${patterns.reportCount} reports.`
    );
  }
  if (!evidence.length && matchedMaterials.length) {
    evidence.push(
      `${matchedMaterials
        .slice(0, 5)
        .map((row) => row.rawName)
        .join(", ")} recur as ${definition.corpusFocus.toLowerCase()}`
    );
  }
  if (!evidence.length) evidence.push("Corpus evidence is sparse; treat this as a hypothesis.");
  return evidence;
}

function summarizeDosageBehavior(matchedMaterials) {
  const bands = uniqueStrings(
    matchedMaterials
      .map((material) => material.dominantDosageBand)
      .filter(Boolean)
      .map((band) => band.replace(/_/g, " "))
  );
  const highDoseNames = matchedMaterials
    .filter((material) => (material.highDoseAbove5Count || 0) > 0)
    .slice(0, 5)
    .map((material) => material.rawName);
  const pieces = [];
  if (bands.length) pieces.push(`Observed mainly as ${bands.join(", ")} materials.`);
  if (highDoseNames.length) {
    pieces.push(`High-dose corpus signals include ${highDoseNames.join(", ")}.`);
  }
  if (!pieces.length) pieces.push("Use as a qualitative pattern; dosage behavior is not strong enough for a firm read.");
  pieces.push("Do not copy GCMS percentages; translate only the role and balance.");
  return pieces.join(" ");
}

function classifyInventoryStatus(material) {
  return material?.inventoryOverlap?.status || material?.inventoryStatus || "missing from inventory";
}

function buildMaterialsAlreadyHave(matchedMaterials) {
  return matchedMaterials
    .filter((material) => classifyInventoryStatus(material) !== "missing from inventory")
    .slice(0, 12)
    .map((material) => ({
      rawName: material.rawName,
      canonicalName: material.canonicalName,
      inventoryStatus: classifyInventoryStatus(material),
      matchType: material.inventoryOverlap?.matchType || material.matchType || "exact",
      matchConfidence:
        material.inventoryOverlap?.matchConfidence || material.matchConfidence || "high",
    }));
}

function buildMissingWorthConsidering(patterns, definition, matchedMaterials) {
  const matchedNames = new Set(matchedMaterials.map((row) => normalizeMaterialName(row.rawName)));
  const directMissing = matchedMaterials
    .filter((material) => classifyInventoryStatus(material) === "missing from inventory")
    .map((material) => ({
      rawName: material.rawName,
      priority: material.priority || "not urgent",
      reason:
        material.reason ||
        material.commonRoleGuess ||
        "Corpus material matched this pattern.",
    }));

  const priorityMissing = (patterns.mostValuableMissingMaterials || [])
    .filter((material) => materialMatchesAnyTerm(material.rawName, definition.materialTerms))
    .filter((material) => !matchedNames.has(normalizeMaterialName(material.rawName)))
    .map((material) => ({
      rawName: material.rawName,
      priority: material.priority,
      reason: material.reason,
    }));

  return [...directMissing, ...priorityMissing]
    .filter((material) =>
      ["worth considering", "needs identity review", "already covered by related material"].includes(
        material.priority
      )
    )
    .slice(0, 8);
}

function classifyHeroRelationship(definition, formula, accordRecipes) {
  const expandedRows = expandHeroFormulaMaterials(formula, accordRecipes);
  const matchedRows = expandedRows.filter((row) =>
    materialMatchesAnyTerm(row.rawName, definition.materialTerms)
  );
  const directMatches = matchedRows.filter((row) => row.source === "formula row");
  const accordMatches = matchedRows.filter((row) => row.source.includes("accord"));
  const uniqueMatches = uniqueStrings(matchedRows.map((row) => row.rawName));
  const directNames = uniqueStrings(directMatches.map((row) => row.rawName));
  const accordNames = uniqueStrings(accordMatches.map((row) => row.rawName));

  let status = "underrepresented";
  if (uniqueMatches.length >= definition.overrepresentedThreshold) {
    status = "potentially overrepresented";
  } else if (uniqueMatches.length >= definition.representedThreshold) {
    status = "already represented";
  } else if (uniqueMatches.length > 0) {
    status = "needs wear-test validation";
  }

  return {
    formulaName: formula.name,
    status,
    representedBy: uniqueMatches.slice(0, 12),
    directRows: directNames.slice(0, 10),
    accordComponents: accordNames.slice(0, 10),
    note:
      status === "underrepresented"
        ? "Little direct or accord-expanded representation found."
        : status === "potentially overrepresented"
          ? `Many matching rows are present; validate that ${definition.sensitivity} is not masking the Beach Box identity.`
          : status === "needs wear-test validation"
            ? "Some representation exists, but skin testing should decide whether it works as intended."
            : "Pattern is clearly present; tune by wear-test evidence rather than adding more materials by default.",
  };
}

function buildTranslationSection({ definition, patterns, formulas, accordRecipes }) {
  const matchedMaterials = findPatternMaterials(patterns, definition.materialTerms);
  const matchedPairs = findPatternPairs(patterns, definition.pairIncludes);
  const skeletons = findSkeletons(patterns, definition.skeletonNames);
  const heroFormulaRelationships = formulas.map((formula) =>
    classifyHeroRelationship(definition, formula, accordRecipes)
  );

  return {
    id: definition.id,
    patternName: definition.patternName,
    corpusFocus: definition.corpusFocus,
    corpusEvidence: summarizeCorpusEvidence(
      patterns,
      definition,
      matchedMaterials,
      matchedPairs,
      skeletons
    ),
    commonMaterials: matchedMaterials.slice(0, 10).map((material) => ({
      rawName: material.rawName,
      canonicalName: material.canonicalName,
      inventoryStatus: classifyInventoryStatus(material),
      observedRole: material.commonRoleGuess || "",
      dominantDosageBand: material.dominantDosageBand || "",
      reportFrequency: material.reportFrequency || 0,
    })),
    coOccurrenceEvidence: matchedPairs.map((pair) => ({
      materials: pair.materials,
      reportFrequency: pair.reportFrequency,
      reportFrequencyLabel: `${pair.reportFrequency} of ${patterns.reportCount} reports`,
      translation: pair.beachBoxTwist,
    })),
    typicalDosageBehavior: summarizeDosageBehavior(matchedMaterials),
    beachBoxTranslation: definition.beachBoxTranslation,
    materialsAlreadyHave: buildMaterialsAlreadyHave(matchedMaterials),
    materialsMissingButWorthConsidering: buildMissingWorthConsidering(
      patterns,
      definition,
      matchedMaterials
    ),
    whatToTest: definition.whatToTest,
    whatNotToOverdo: definition.whatNotToOverdo,
    riskCaveat: definition.risk,
    heroFormulaRelationships,
  };
}

function buildBeachBoxMoves(sections) {
  return {
    highConfidenceMoves: [
      "Use Hedione plus driftwood materials plus Botanical Musk Accord to create lift before adding more marine power.",
      "Let Iso E Super, Ambroxan/Cetalox, Cashmeran, and musks carry the skin-air bridge while marine materials provide texture.",
      "Treat Botanical Musk Accord as the soft base first; only add standalone musks when wear tests show a persistence gap.",
    ],
    promisingButTestFirst: [
      "Use trace dirty, mossy, earthy, or resinous materials for low-tide realism, but test them below obvious mud or soil territory.",
      "Explore citrus/terpene lift as salt-air sparkle, while checking that it does not turn the opening into a conventional cologne.",
      "Use floral transparency to humidify the heart, but confirm on skin that it supports the shore rather than becoming the subject.",
    ],
    avoidForNow: [
      "Do not chase every common GCMS terpene; many are natural-oil markers, not necessary purchases.",
      "Do not copy exact GCMS percentages or reconstruct commercial formulas.",
      "Do not add more Calone-style force until the existing marine/mineral structure has been wear-tested.",
    ],
    inventoryGapsWorthConsidering: uniqueStrings(
      sections.flatMap((section) =>
        section.materialsMissingButWorthConsidering
          .filter((material) => material.priority === "worth considering")
          .map((material) => material.rawName)
      )
    ).slice(0, 12),
  };
}

function buildGuardrails() {
  return [
    "This is pattern translation, not formula reconstruction.",
    "Use these as architectural lessons, not recipes.",
    "Do not output or follow recreated commercial formulas.",
    "Do not copy exact GCMS percentages.",
    "Do not treat GCMS output as IFRA, pricing, or launch-clearance evidence.",
  ];
}

export function buildBeachBoxPatternTranslation({
  patterns = {},
  formulas = [],
  accordRecipes = {},
  generatedAt = new Date().toISOString(),
} = {}) {
  const originalPatternsFingerprint = JSON.stringify(patterns);
  const originalFormulasFingerprint = JSON.stringify(formulas);
  const activeFormulas = formulas.filter((formula) => ACTIVE_HERO_NAMES.includes(formula.name));
  const sections = PATTERN_DEFINITIONS.map((definition) =>
    buildTranslationSection({
      definition,
      patterns,
      formulas: activeFormulas,
      accordRecipes,
    })
  );
  const report = {
    generatedAt,
    sourcePatternPath: "data/gcms_extracted/gcms_construction_patterns.json",
    reportCount: patterns.reportCount || 0,
    trueComponentRowCount: patterns.trueComponentRowCount || 0,
    uniqueIdentifiedMaterialCount: patterns.uniqueIdentifiedMaterialCount || 0,
    activeHeroFormulaCount: activeFormulas.length,
    guardrails: buildGuardrails(),
    translationSections: sections,
    beachBoxMoves: buildBeachBoxMoves(sections),
  };

  if (JSON.stringify(patterns) !== originalPatternsFingerprint) {
    throw new Error("Beach Box translation mutated GCMS pattern input.");
  }
  if (JSON.stringify(formulas) !== originalFormulasFingerprint) {
    throw new Error("Beach Box translation mutated formula input.");
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

export function formatBeachBoxPatternTranslationText(report) {
  return [
    "Beach Box GCMS Pattern Translation",
    "",
    `Reports analyzed: ${report.reportCount}`,
    `True component rows: ${report.trueComponentRowCount}`,
    `Unique identified materials: ${report.uniqueIdentifiedMaterialCount}`,
    "",
    "Guardrails:",
    ...report.guardrails.map((guardrail) => `- ${guardrail}`),
    "",
    "Patterns translated:",
    ...report.translationSections.map(
      (section) =>
        `- ${section.patternName}: ${section.heroFormulaRelationships
          .map((row) => `${row.formulaName}=${row.status}`)
          .join("; ")}`
    ),
    "",
    "High-confidence moves:",
    ...report.beachBoxMoves.highConfidenceMoves.map((move) => `- ${move}`),
    "",
    "Promising but test first:",
    ...report.beachBoxMoves.promisingButTestFirst.map((move) => `- ${move}`),
    "",
    "Avoid for now:",
    ...report.beachBoxMoves.avoidForNow.map((move) => `- ${move}`),
    "",
    "Inventory gaps worth considering:",
    formatList(report.beachBoxMoves.inventoryGapsWorthConsidering),
  ].join("\n");
}

export function formatBeachBoxPatternTranslationMarkdown(report) {
  const relationshipColumns = [
    { label: "Formula", value: (row) => row.formulaName },
    { label: "Relationship", value: (row) => row.status },
    { label: "Represented By", value: (row) => row.representedBy.join(", ") || "None" },
    { label: "Note", value: (row) => row.note },
  ];
  const materialColumns = [
    { label: "Material", value: (row) => row.rawName },
    { label: "Inventory Status", value: (row) => row.inventoryStatus },
    { label: "Observed Role", value: (row) => row.observedRole || "Corpus-observed" },
    { label: "Dose Band", value: (row) => row.dominantDosageBand || "mixed" },
    { label: "Reports", value: (row) => row.reportFrequency },
  ];
  const missingColumns = [
    { label: "Material", value: (row) => row.rawName },
    { label: "Priority", value: (row) => row.priority },
    { label: "Reason", value: (row) => row.reason },
  ];

  const sections = report.translationSections.flatMap((section) => [
    `## ${section.patternName}`,
    "",
    `**Corpus focus:** ${section.corpusFocus}`,
    "",
    "**Corpus Evidence**",
    "",
    formatList(section.corpusEvidence),
    "",
    "**Common Materials**",
    "",
    markdownTable(section.commonMaterials, materialColumns, "No common materials matched."),
    "",
    "**Typical Dosage Behavior**",
    "",
    section.typicalDosageBehavior,
    "",
    "**Beach Box Translation**",
    "",
    section.beachBoxTranslation,
    "",
    "**Materials You Already Have**",
    "",
    markdownTable(
      section.materialsAlreadyHave,
      [
        { label: "Material", value: (row) => row.rawName },
        { label: "Inventory Status", value: (row) => row.inventoryStatus },
        { label: "Match", value: (row) => `${row.matchType}/${row.matchConfidence}` },
      ],
      "No direct Beach Box overlap found for this pattern."
    ),
    "",
    "**Materials Missing But Worth Considering**",
    "",
    markdownTable(
      section.materialsMissingButWorthConsidering,
      missingColumns,
      "No urgent missing-material action."
    ),
    "",
    "**What To Test**",
    "",
    section.whatToTest,
    "",
    "**What Not To Overdo**",
    "",
    section.whatNotToOverdo,
    "",
    "**Risk / Caveat**",
    "",
    section.riskCaveat,
    "",
    "**Hero Formula Relationship**",
    "",
    markdownTable(
      section.heroFormulaRelationships,
      relationshipColumns,
      "No active hero formulas available."
    ),
    "",
  ]);

  return [
    "# Beach Box GCMS Pattern Translation",
    "",
    "Pattern translation for adapting GCMS construction intelligence into original Beach Box coastal skin/marine/wood/musk decisions. This is not formula reconstruction.",
    "",
    "## Counts",
    "",
    `- Reports analyzed: ${report.reportCount}`,
    `- True component rows: ${report.trueComponentRowCount}`,
    `- Unique identified materials: ${report.uniqueIdentifiedMaterialCount}`,
    `- Active hero formulas compared: ${report.activeHeroFormulaCount}`,
    "",
    "## Guardrails",
    "",
    formatList(report.guardrails),
    "",
    "## Beach Box Moves",
    "",
    "### High-Confidence Moves",
    "",
    formatList(report.beachBoxMoves.highConfidenceMoves),
    "",
    "### Promising But Test First",
    "",
    formatList(report.beachBoxMoves.promisingButTestFirst),
    "",
    "### Avoid For Now",
    "",
    formatList(report.beachBoxMoves.avoidForNow),
    "",
    "### Inventory Gaps Worth Considering",
    "",
    formatList(report.beachBoxMoves.inventoryGapsWorthConsidering),
    "",
    ...sections,
  ].join("\n");
}

export function loadBeachBoxPatternTranslationInputs({
  patternPath = DEFAULT_GCMS_CONSTRUCTION_PATTERNS_PATH,
  appPath = DEFAULT_APP_PATH,
  accordPath = DEFAULT_HERO_ACCORD_RECIPES_PATH,
} = {}) {
  return {
    patterns: readJson(patternPath, { reportCount: 0 }),
    formulas: loadActiveHeroFormulas(appPath),
    accordRecipes: readJson(accordPath, { recipes: [] }),
  };
}

export function writeBeachBoxPatternTranslation(filePath, report) {
  writeJsonFile(filePath, report);
}
