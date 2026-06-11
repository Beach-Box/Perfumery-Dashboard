import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHeroFormulaGcmsReferenceMatches,
  formatHeroFormulaGcmsReferenceMatchesMarkdown,
  formatHeroFormulaGcmsReferenceMatchesText,
} from "../scripts/lib/gcms_formula_reference_matcher.mjs";

function buildSyntheticFormulas() {
  return [
    {
      name: "Skin-Air Bridge",
      familyKey: "hero-scent",
      developmentStatus: "active",
      ingredients: [
        { name: "Driftwood Accord", g: 1.2, note: "base" },
        { name: "Botanical Musk Accord", g: 0.6, note: "base" },
        { name: "Calone 1951 20%", g: 0.08, note: "heart" },
      ],
    },
  ];
}

function buildSyntheticAccordRecipes() {
  return {
    recipes: [
      {
        name: "Driftwood Accord",
        components: [
          { name: "Iso E Super" },
          { name: "Cashmeran" },
          { name: "Ambroxan 50% TEC" },
        ],
      },
      {
        name: "Botanical Musk Accord",
        components: [
          { name: "Ethylene Brassylate" },
          { name: "Ambrettolide" },
        ],
      },
    ],
  };
}

function buildSyntheticStructuredPayload() {
  return {
    reportCount: 2,
    reports: [
      {
        id: "fixture-coastal-air",
        sourceFilename: "Fixture Coastal Air.pdf",
        fragranceName: "Coastal Air Study",
        brand: "Fixture",
        releaseYear: 2026,
        detectedMaterials: [
          { name: "Iso E Super", percent: 8, rank: 1 },
          { name: "Cashmeran", percent: 3, rank: 2 },
          { name: "Hedione", percent: 5, rank: 3 },
          { name: "Ethylene Brassylate", percent: 1, rank: 9 },
          { name: "Calone", percent: 0.2, rank: 18 },
        ],
      },
      {
        id: "fixture-citrus-only",
        sourceFilename: "Fixture Citrus.pdf",
        fragranceName: "Citrus Only",
        brand: "Fixture",
        releaseYear: 2025,
        detectedMaterials: [
          { name: "Limonene", percent: 12, rank: 1 },
          { name: "Linalool", percent: 8, rank: 2 },
        ],
      },
    ],
  };
}

function buildSyntheticPatterns() {
  return {
    reportCount: 2,
    trueComponentRowCount: 7,
    mostValuableMissingMaterials: [
      {
        rawName: "Phenylethyl Alcohol",
        priority: "worth considering",
      },
      {
        rawName: "Vanillin",
        priority: "worth considering",
      },
      {
        rawName: "Limonene",
        priority: "worth considering",
      },
    ],
  };
}

function buildSyntheticAliasData() {
  return {
    records: [
      {
        canonicalName: "Calone 1951",
        identityGroup: "calone_watermelon_ketone",
        targetName: "Calone 1951",
        aliases: [{ name: "Calone", matchType: "alias", matchConfidence: "high" }],
      },
      {
        canonicalName: "Ambroxan Crystals",
        identityGroup: "ambergris_ambroxide_family",
        targetName: "Ambroxan Crystals",
        aliases: [{ name: "Ambroxan", matchType: "alias", matchConfidence: "high" }],
      },
    ],
  };
}

test("formula GCMS matcher uses accord components without mutating formulas", () => {
  const formulas = buildSyntheticFormulas();
  const before = JSON.stringify(formulas);
  const report = buildHeroFormulaGcmsReferenceMatches({
    formulas,
    accordRecipes: buildSyntheticAccordRecipes(),
    structuredPayload: buildSyntheticStructuredPayload(),
    patterns: buildSyntheticPatterns(),
    aliasData: buildSyntheticAliasData(),
    generatedAt: "2026-06-11T00:00:00.000Z",
  });

  assert.equal(JSON.stringify(formulas), before);
  assert.equal(report.activeHeroFormulaCount, 1);
  assert.equal(report.gcmsReferenceCount, 2);
  assert.equal(report.formulas[0].formulaName, "Skin-Air Bridge");

  const topMatch = report.formulas[0].topReferenceMatches[0];
  assert.equal(topMatch.displayName, "Fixture Coastal Air Study (2026)");
  assert.ok(topMatch.sharedMaterials.includes("Iso E Super"));
  assert.ok(topMatch.sharedMaterials.includes("Cashmeran"));
  assert.ok(topMatch.sharedMaterials.includes("Ethylene Brassylate"));
});

test("formula GCMS matcher assigns qualitative labels and explainable signals", () => {
  const report = buildHeroFormulaGcmsReferenceMatches({
    formulas: buildSyntheticFormulas(),
    accordRecipes: buildSyntheticAccordRecipes(),
    structuredPayload: buildSyntheticStructuredPayload(),
    patterns: buildSyntheticPatterns(),
    aliasData: buildSyntheticAliasData(),
  });
  const labels = report.formulas[0].topReferenceMatches.map((match) => match.similarityLabel);

  assert.ok(
    labels.some((label) =>
      ["strong construction resemblance", "partial architecture resemblance"].includes(label)
    )
  );
  assert.match(
    report.formulas[0].topReferenceMatches[0].matchSignals.signalSummary,
    /shared material identities/
  );
});

test("formula GCMS matcher output is non-reconstructive and has no percentage-copy recommendations", () => {
  const report = buildHeroFormulaGcmsReferenceMatches({
    formulas: buildSyntheticFormulas(),
    accordRecipes: buildSyntheticAccordRecipes(),
    structuredPayload: buildSyntheticStructuredPayload(),
    patterns: buildSyntheticPatterns(),
    aliasData: buildSyntheticAliasData(),
  });
  const text = formatHeroFormulaGcmsReferenceMatchesText(report);
  const markdown = formatHeroFormulaGcmsReferenceMatchesMarkdown(report);

  assert.match(text, /pattern guidance, not formula reconstruction/);
  assert.match(markdown, /Do not copy exact GCMS percentages/);
  assert.doesNotMatch(markdown, /\b\d+(?:\.\d+)?\s*g\b/i);
  assert.doesNotMatch(markdown, /copy\s+\d+(?:\.\d+)?%/i);
  assert.doesNotMatch(markdown, /target\s+\d+(?:\.\d+)?%/i);
  assert.equal(JSON.stringify(report).includes("recommendedPercent"), false);
});
