import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBeachBoxPatternTranslation,
  expandHeroFormulaMaterials,
  formatBeachBoxPatternTranslationMarkdown,
  formatBeachBoxPatternTranslationText,
} from "../scripts/lib/gcms_beach_box_translator.mjs";

function buildSyntheticPatterns() {
  return {
    reportCount: 4,
    trueComponentRowCount: 40,
    uniqueIdentifiedMaterialCount: 9,
    universalStructuralMaterials: [
      {
        rawName: "Hedione",
        canonicalName: "Hedione",
        reportFrequency: 3,
        dominantDosageBand: "structural",
        commonRoleGuess: "floral transparency",
        inventoryOverlap: { status: "exact Beach Box inventory/support match" },
      },
      {
        rawName: "Iso E Super",
        canonicalName: "Iso E Super",
        reportFrequency: 3,
        dominantDosageBand: "backbone",
        commonRoleGuess: "woody amber structure",
        inventoryOverlap: { status: "accord component match" },
      },
      {
        rawName: "Ethylene Brassylate",
        canonicalName: "Ethylene Brassylate",
        reportFrequency: 3,
        dominantDosageBand: "structural",
        commonRoleGuess: "musk body/fixation",
        inventoryOverlap: { status: "accord component match" },
      },
      {
        rawName: "Limonene",
        canonicalName: "Limonene",
        reportFrequency: 4,
        dominantDosageBand: "modifier",
        commonRoleGuess: "citrus/terpene lift",
        inventoryOverlap: { status: "missing from inventory" },
      },
      {
        rawName: "Patchoulol",
        canonicalName: "Patchoulol",
        reportFrequency: 2,
        dominantDosageBand: "modifier",
        commonRoleGuess: "corpus-observed supporting material",
        inventoryOverlap: { status: "missing from inventory" },
      },
    ],
    highDoseArchitectureMaterials: {
      thresholds: {
        ">5%": [
          {
            name: "Iso E Super",
            rawName: "Iso E Super",
            reportFrequencyAboveThreshold: 2,
            totalReportFrequency: 3,
            commonRoleGuess: "woody amber structure",
            inventoryOverlap: { status: "accord component match" },
          },
        ],
      },
    },
    accordSkeletons: [
      { name: "Woody Amber Skeleton", matchedReportCount: 3 },
      { name: "Musky Floral Skeleton", matchedReportCount: 3 },
      { name: "Marine/Mineral Skeleton", matchedReportCount: 1 },
    ],
    coOccurrencePatterns: [],
    featuredCoOccurrencePatterns: [
      {
        materials: ["Hedione", "Iso E Super"],
        reportFrequency: 3,
        beachBoxTwist: "Use as an airy driftwood bridge.",
      },
      {
        materials: ["Ethylene Brassylate", "Galaxolide"],
        reportFrequency: 2,
        beachBoxTwist: "Use as soft skin musk evidence.",
      },
    ],
    dosageBandGuidance: [],
    mostValuableMissingMaterials: [
      {
        rawName: "Limonene",
        priority: "worth considering",
        reason: "Citrus lift signal.",
      },
      {
        rawName: "Patchoulol",
        priority: "not urgent",
        reason: "Dark support signal.",
      },
    ],
  };
}

function buildSyntheticFormulas() {
  return [
    {
      name: "Random Concoction - Original",
      familyKey: "hero-scent",
      developmentStatus: "active",
      ingredients: [
        { name: "Hedione", g: 0.4, note: "mid" },
        { name: "Iso E Super", g: 0.5, note: "base" },
        { name: "Botanical Musk Accord", g: 1, note: "base" },
      ],
    },
    {
      name: "Skin-Air Bridge",
      familyKey: "hero-scent",
      developmentStatus: "active",
      ingredients: [
        { name: "Calone 1951 20%", g: 0.2, note: "mid" },
        { name: "Oceanol 10%", g: 0.4, note: "mid" },
      ],
    },
  ];
}

function buildSyntheticAccordRecipes() {
  return {
    recipes: [
      {
        name: "Botanical Musk Accord",
        components: [
          { name: "Ethylene Brassylate" },
          { name: "Ambrettolide" },
          { name: "Habanolide" },
        ],
      },
    ],
  };
}

test("Beach Box translator expands accord components for hero formula matching", () => {
  const rows = expandHeroFormulaMaterials(
    buildSyntheticFormulas()[0],
    buildSyntheticAccordRecipes()
  );
  assert.equal(rows.some((row) => row.rawName === "Ethylene Brassylate"), true);
  assert.equal(rows.some((row) => row.rawName === "Botanical Musk Accord"), true);
});

test("Beach Box translator generates sections with inventory overlap and formula relationships", () => {
  const report = buildBeachBoxPatternTranslation({
    patterns: buildSyntheticPatterns(),
    formulas: buildSyntheticFormulas(),
    accordRecipes: buildSyntheticAccordRecipes(),
    generatedAt: "2026-06-09T00:00:00.000Z",
  });

  assert.equal(report.translationSections.length, 7);
  const airy = report.translationSections.find(
    (section) => section.id === "airy_diffusion_architecture"
  );
  assert.ok(airy.corpusEvidence.some((line) => /Hedione \+ Iso E Super/.test(line)));
  assert.ok(
    airy.materialsAlreadyHave.some((material) => material.rawName === "Iso E Super")
  );
  assert.equal(
    airy.heroFormulaRelationships.find(
      (relationship) => relationship.formulaName === "Random Concoction - Original"
    ).status,
    "already represented"
  );

  const marine = report.translationSections.find(
    (section) => section.id === "marine_mineral_architecture"
  );
  assert.equal(
    marine.heroFormulaRelationships.find(
      (relationship) => relationship.formulaName === "Skin-Air Bridge"
    ).status,
    "already represented"
  );

  const citrus = report.translationSections.find(
    (section) => section.id === "citrus_terpene_lift"
  );
  assert.equal(
    citrus.materialsMissingButWorthConsidering.some(
      (material) => material.rawName === "Limonene" && material.priority === "worth considering"
    ),
    true
  );
  assert.equal(report.beachBoxMoves.inventoryGapsWorthConsidering.includes("Limonene"), true);
});

test("Beach Box translator preserves inputs and keeps guidance non-reconstructive", () => {
  const patterns = buildSyntheticPatterns();
  const formulas = buildSyntheticFormulas();
  const beforePatterns = JSON.stringify(patterns);
  const beforeFormulas = JSON.stringify(formulas);
  const report = buildBeachBoxPatternTranslation({
    patterns,
    formulas,
    accordRecipes: buildSyntheticAccordRecipes(),
  });
  const text = formatBeachBoxPatternTranslationText(report);
  const markdown = formatBeachBoxPatternTranslationMarkdown(report);

  assert.equal(JSON.stringify(patterns), beforePatterns);
  assert.equal(JSON.stringify(formulas), beforeFormulas);
  assert.match(text, /This is pattern translation, not formula reconstruction/);
  assert.match(markdown, /Do not copy exact GCMS percentages/);
  assert.doesNotMatch(markdown, /\b\d+(?:\.\d+)?\s*g\b/i);
  assert.doesNotMatch(markdown, /copy\s+\d+(?:\.\d+)?%/i);
  assert.doesNotMatch(markdown, /target\s+\d+(?:\.\d+)?%/i);
});
