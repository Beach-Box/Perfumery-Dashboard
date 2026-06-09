import test from "node:test";
import assert from "node:assert/strict";

import {
  GCMS_PATTERN_INSIGHTS_MISSING_MESSAGE,
  buildGcmsPatternInsightsPanel,
} from "../src/lib/gcms_pattern_insights_helpers.js";

function buildSyntheticTranslationReport() {
  return {
    reportCount: 124,
    trueComponentRowCount: 15871,
    uniqueIdentifiedMaterialCount: 1664,
    activeHeroFormulaCount: 4,
    beachBoxMoves: {
      highConfidenceMoves: [
        "Use Hedione plus driftwood materials plus Botanical Musk Accord to create lift before adding more marine power.",
      ],
      promisingButTestFirst: [
        "Use trace dirty, mossy, earthy, or resinous materials for low-tide realism.",
        "Explore citrus/terpene lift as salt-air sparkle.",
      ],
      avoidForNow: [
        "Do not chase every common GCMS terpene.",
        "Do not copy exact GCMS percentages or reconstruct commercial formulas.",
      ],
      inventoryGapsWorthConsidering: [
        "Limonene",
        "Phenylethyl Alcohol",
        "Vanillin",
      ],
    },
    translationSections: [
      {
        id: "airy_diffusion_architecture",
        patternName: "Airy Diffusion Architecture",
        heroFormulaRelationships: [
          {
            formulaName: "Skin-Air Bridge",
            status: "already represented",
          },
          {
            formulaName: "Damp Shoreline v1",
            status: "needs wear-test validation",
          },
        ],
      },
      {
        id: "marine_mineral_architecture",
        patternName: "Marine / Mineral Architecture",
        heroFormulaRelationships: [
          {
            formulaName: "Skin-Air Bridge",
            status: "potentially overrepresented",
          },
          {
            formulaName: "Damp Shoreline v1",
            status: "underrepresented",
          },
        ],
      },
    ],
  };
}

test("GCMS pattern insights helper returns a friendly missing state", () => {
  const panel = buildGcmsPatternInsightsPanel(null);

  assert.equal(panel.isAvailable, false);
  assert.equal(panel.missingMessage, GCMS_PATTERN_INSIGHTS_MISSING_MESSAGE);
  assert.match(panel.regenerateCommand, /translate_gcms_patterns_to_beach_box/);
  assert.deepEqual(panel.highConfidenceMoves, []);
});

test("GCMS pattern insights helper summarizes moves, gaps, and formula relevance", () => {
  const source = buildSyntheticTranslationReport();
  const before = JSON.stringify(source);
  const panel = buildGcmsPatternInsightsPanel(source);

  assert.equal(JSON.stringify(source), before);
  assert.equal(panel.isAvailable, true);
  assert.equal(panel.counts.translatedCategories, 2);
  assert.equal(panel.counts.activeHeroFormulas, 4);
  assert.equal(panel.highConfidenceMoves.length, 1);
  assert.equal(panel.avoidForNow.some((item) => /copy exact GCMS/i.test(item)), true);
  assert.equal(panel.inventoryGaps.length, 3);
  assert.match(
    panel.inventoryGaps.find((gap) => gap.name === "Limonene").why,
    /citrus\/terpene lift/i
  );
  assert.match(
    panel.inventoryGaps.find((gap) => gap.name === "Vanillin").why,
    /mineral skin/i
  );

  const skinAir = panel.heroFormulaRelevance.find(
    (row) => row.formulaName === "Skin-Air Bridge"
  );
  assert.deepEqual(skinAir.statusGroups.already_represented, ["airy diffusion"]);
  assert.deepEqual(skinAir.statusGroups.potentially_overrepresented, [
    "marine texture",
  ]);
  assert.match(skinAir.watch, /Do not increase marine force/i);
  assert.match(skinAir.nextValidation, /detergent-adjacent/i);

  const damp = panel.heroFormulaRelevance.find(
    (row) => row.formulaName === "Damp Shoreline v1"
  );
  assert.deepEqual(damp.statusGroups.underrepresented, ["marine texture"]);
  assert.deepEqual(damp.statusGroups.needs_wear_test_validation, [
    "airy diffusion",
  ]);
});

test("GCMS pattern insights helper adds conservative test conditions", () => {
  const panel = buildGcmsPatternInsightsPanel(buildSyntheticTranslationReport());

  assert.match(
    panel.promisingButTestFirst.find((item) => /dirty/i.test(item.text))
      .testCondition,
    /too clean, flat, or generic/i
  );
  assert.match(
    panel.promisingButTestFirst.find((item) => /citrus/i.test(item.text))
      .testCondition,
    /opening feels dull/i
  );
  assert.match(panel.guardrail, /not formulas to copy/i);
});
