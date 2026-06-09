export const GCMS_PATTERN_INSIGHTS_MISSING_MESSAGE =
  "GCMS pattern translation has not been generated yet. Run the GCMS translator script to create Beach Box pattern insights.";

export const GCMS_PATTERN_INSIGHTS_GUARDRAIL =
  "These are construction-pattern translations from GCMS references, not formulas to copy. Use them as architectural lessons and validate with wear tests.";

export const GCMS_PATTERN_INSIGHTS_REGENERATE_COMMAND =
  "node scripts/translate_gcms_patterns_to_beach_box.mjs --markdown --write docs/gcms/beach_box_pattern_translation.md";

const FALLBACK_HIGH_CONFIDENCE_MOVES = [
  "Use Hedione / airy lift plus driftwood plus botanical musk before adding more marine force.",
  "Let woody amber and musks carry the skin-air bridge.",
  "Treat marine/mineral materials as texture, not the entire identity.",
];

const FALLBACK_PROMISING_MOVES = [
  "Trace dirty/earthy realism.",
  "Citrus sparkle.",
  "Floral transparency.",
];

const FALLBACK_AVOID_MOVES = [
  "Do not chase every common GCMS terpene.",
  "Do not copy GCMS percentages.",
  "Do not add more Calone-style marine force before wear testing.",
  "Do not treat reference formulas as formulas to clone.",
];

const STATUS_LABELS = {
  already_represented: "Already represented",
  underrepresented: "Underrepresented",
  potentially_overrepresented: "Potentially overrepresented",
  needs_wear_test_validation: "Needs wear-test validation",
};

const PATTERN_SHORT_LABELS = {
  airy_diffusion_architecture: "airy diffusion",
  skin_musk_soft_base_architecture: "driftwood/musk base",
  woody_amber_driftwood_architecture: "woody amber/driftwood",
  marine_mineral_architecture: "marine texture",
  citrus_terpene_lift: "citrus sparkle",
  floral_transparency_heart_bridge: "floral transparency",
  dark_dirty_realism_modifiers: "low-tide realism",
};

const GAP_GUIDANCE = {
  limonene:
    "Citrus/terpene lift, but it may already be represented through citrus oils.",
  "phenylethyl alcohol":
    "Rose/floral body and transparent floral volume.",
  vanillin:
    "Gourmand warmth and softness, but it may pull Beach Box away from mineral skin if overused.",
};

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

function normalizeStatus(status) {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getPatternLabel(section = {}) {
  return PATTERN_SHORT_LABELS[section.id] || section.patternName || "pattern";
}

function reportHasInsights(report) {
  return Boolean(
    report &&
      Array.isArray(report.translationSections) &&
      report.translationSections.length > 0
  );
}

function buildPromisingMove(text) {
  const normalized = normalizeName(text);
  let testCondition =
    "Only increase if the current trial feels too clean, flat, or generic.";
  if (/citrus|terpene|sparkle|opening/.test(normalized)) {
    testCondition =
      "Only increase if the opening feels dull, heavy, or missing salt-air lift.";
  } else if (/floral|heart|humidity|bridge/.test(normalized)) {
    testCondition =
      "Only increase if the marine top feels isolated, harsh, or not skinlike.";
  } else if (/dirty|earthy|mossy|resinous|low tide|realism/.test(normalized)) {
    testCondition =
      "Only increase if the current trial feels too clean, flat, or generic.";
  }
  return { text, testCondition };
}

function buildInventoryGaps(report = {}) {
  return uniqueStrings(report.beachBoxMoves?.inventoryGapsWorthConsidering || []).map(
    (name) => ({
      name,
      posture: "Worth considering, not automatic purchases.",
      why:
        GAP_GUIDANCE[normalizeName(name)] ||
        "Corpus-relevant missing material; review only if the current trials expose this gap.",
    })
  );
}

function makeStatusGroups() {
  return {
    already_represented: [],
    underrepresented: [],
    potentially_overrepresented: [],
    needs_wear_test_validation: [],
  };
}

function buildFormulaWatch(entry) {
  const over = entry.statusGroups.potentially_overrepresented;
  const under = entry.statusGroups.underrepresented;
  const needsWear = entry.statusGroups.needs_wear_test_validation;
  if (over.some((label) => /marine/.test(label))) {
    return "Do not increase marine force until wear-tested.";
  }
  if (over.some((label) => /low-tide|realism/.test(label))) {
    return "Keep realism modifiers trace and skin-test for off-notes.";
  }
  if (over.some((label) => /floral/.test(label))) {
    return "Validate that the floral bridge stays skinlike rather than cosmetic.";
  }
  if (over.length) {
    return "Validate that diffusion, woods, and musks are not masking the Beach Box identity.";
  }
  if (under.length) {
    return "Only test a new pattern move if the current trial clearly exposes that gap.";
  }
  if (needsWear.length) {
    return "Use wear tests to decide whether the represented pattern is actually helping.";
  }
  return "Tune by wear-test evidence rather than adding materials by default.";
}

function buildFormulaNextValidation(entry) {
  const name = entry.formulaName || "";
  if (/skin-air bridge/i.test(name)) {
    return "Whether the marine/floral bridge feels skinlike or detergent-adjacent.";
  }
  if (/damp shoreline/i.test(name)) {
    return "Whether damp realism reads mineral and wearable rather than muddy, mossy, or heavy.";
  }
  if (/random concoction/i.test(name)) {
    return "Whether airy driftwood and musk lift are memorable without needing more marine force.";
  }
  return "Whether the pattern balance still smells original, wearable, and on brief.";
}

function buildHeroFormulaRelevance(report = {}) {
  const byFormula = new Map();
  for (const section of report.translationSections || []) {
    const patternLabel = getPatternLabel(section);
    for (const relationship of section.heroFormulaRelationships || []) {
      const formulaName = relationship.formulaName || "Formula";
      if (!byFormula.has(formulaName)) {
        byFormula.set(formulaName, {
          formulaName,
          statusGroups: makeStatusGroups(),
        });
      }
      const entry = byFormula.get(formulaName);
      const statusKey = normalizeStatus(relationship.status);
      const groupKey = entry.statusGroups[statusKey]
        ? statusKey
        : "needs_wear_test_validation";
      entry.statusGroups[groupKey].push(patternLabel);
    }
  }

  return [...byFormula.values()].map((entry) => {
    const statusGroups = Object.fromEntries(
      Object.entries(entry.statusGroups).map(([key, values]) => [
        key,
        uniqueStrings(values),
      ])
    );
    const primaryStatus =
      statusGroups.potentially_overrepresented.length > 0
        ? "Watch"
        : statusGroups.needs_wear_test_validation.length > 0
          ? "Wear-test"
          : statusGroups.underrepresented.length > 0
            ? "Gap"
            : "Represented";
    return {
      ...entry,
      statusGroups,
      primaryStatus,
      watch: buildFormulaWatch({ ...entry, statusGroups }),
      nextValidation: buildFormulaNextValidation(entry),
    };
  });
}

export function buildGcmsPatternInsightsPanel(report) {
  if (!reportHasInsights(report)) {
    return {
      isAvailable: false,
      missingMessage: GCMS_PATTERN_INSIGHTS_MISSING_MESSAGE,
      guardrail: GCMS_PATTERN_INSIGHTS_GUARDRAIL,
      regenerateCommand: GCMS_PATTERN_INSIGHTS_REGENERATE_COMMAND,
      counts: {
        reports: 0,
        trueComponentRows: 0,
        uniqueMaterials: 0,
        translatedCategories: 0,
        activeHeroFormulas: 0,
      },
      highConfidenceMoves: [],
      promisingButTestFirst: [],
      avoidForNow: [],
      inventoryGaps: [],
      heroFormulaRelevance: [],
    };
  }

  return {
    isAvailable: true,
    missingMessage: "",
    guardrail: GCMS_PATTERN_INSIGHTS_GUARDRAIL,
    regenerateCommand: GCMS_PATTERN_INSIGHTS_REGENERATE_COMMAND,
    counts: {
      reports: Number(report.reportCount) || 0,
      trueComponentRows: Number(report.trueComponentRowCount) || 0,
      uniqueMaterials: Number(report.uniqueIdentifiedMaterialCount) || 0,
      translatedCategories: report.translationSections.length,
      activeHeroFormulas: Number(report.activeHeroFormulaCount) || 0,
    },
    highConfidenceMoves:
      report.beachBoxMoves?.highConfidenceMoves?.length > 0
        ? report.beachBoxMoves.highConfidenceMoves
        : FALLBACK_HIGH_CONFIDENCE_MOVES,
    promisingButTestFirst: (
      report.beachBoxMoves?.promisingButTestFirst?.length > 0
        ? report.beachBoxMoves.promisingButTestFirst
        : FALLBACK_PROMISING_MOVES
    ).map(buildPromisingMove),
    avoidForNow:
      report.beachBoxMoves?.avoidForNow?.length > 0
        ? report.beachBoxMoves.avoidForNow
        : FALLBACK_AVOID_MOVES,
    inventoryGaps: buildInventoryGaps(report),
    heroFormulaRelevance: buildHeroFormulaRelevance(report),
  };
}

export function getGcmsPatternStatusLabel(statusKey) {
  return STATUS_LABELS[statusKey] || statusKey;
}
