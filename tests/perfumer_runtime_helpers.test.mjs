import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCapitalConstrainedLaunchRecommendation,
  buildFounderScenarioInputState,
  buildFounderScenarioShareBrief,
  buildFounderTrustSummary,
  buildLaunchRunPlannerSummary,
  buildSubstitutionReviewDraftFormula,
  createFounderLaunchScenarioRecord,
  normalizeFounderLaunchScenarioRecord,
} from "../src/lib/perfumer_runtime_helpers.js";

test("buildFounderTrustSummary marks well-supported baskets as supported", () => {
  const trustSummary = buildFounderTrustSummary({
    basket: {
      lines: [
        { ingredientName: "A", mappingConfidence: "confirmed" },
        { ingredientName: "B", mappingConfidence: "confirmed" },
        { ingredientName: "C", mappingConfidence: "inferred" },
      ],
      missingCount: 0,
      uncertainCount: 0,
    },
    launchReadiness: {
      pricing: { missingCount: 0, uncertainCount: 0 },
      compliance: { finishedProductStatus: "appears_compliant" },
      blockers: [],
      cautions: [],
    },
    expectedLineCount: 3,
  });

  assert.equal(trustSummary.level, "supported");
  assert.equal(trustSummary.confirmedCount, 2);
  assert.equal(trustSummary.inferredCount, 1);
  assert.equal(trustSummary.missingCount, 0);
});

test("buildFounderTrustSummary flags sparse support when missing data drives the read", () => {
  const trustSummary = buildFounderTrustSummary({
    basket: {
      lines: [{ ingredientName: "A", status: "missing" }],
      missingCount: 1,
      uncertainCount: 0,
    },
    launchReadiness: {
      pricing: { missingCount: 1, uncertainCount: 0 },
      compliance: { finishedProductStatus: "warning_with_missing" },
      blockers: ["1 supplier price line is missing in the current basket."],
      cautions: [],
    },
    expectedLineCount: 1,
  });

  assert.ok(["sparse", "blocked"].includes(trustSummary.level));
  assert.equal(trustSummary.missingCount, 1);
  assert.ok(trustSummary.missingSignals.length >= 1);
  assert.equal(trustSummary.blockerDependsOnMissing, true);
});

test("launch planner and recommender expose trust summaries from live launch math", () => {
  const founderItems = [
    {
      formula: {
        formulaKey: "seeded-demo",
        name: "Seeded Demo",
        isSeeded: true,
        ingredients: [{ name: "Bergamot EO FCF", g: 100, note: "top" }],
      },
      displayLabel: "Seeded Demo",
      selectedBasket: {
        lines: [
          {
            ingredientName: "Bergamot EO FCF",
            mappingConfidence: "confirmed",
            lineCost: 18,
          },
        ],
        missingCount: 0,
        uncertainCount: 0,
      },
      launchReadiness: {
        status: "near_ready",
        blockers: [],
        cautions: [],
        pricing: { missingCount: 0, uncertainCount: 0, totalCost: 18 },
        compliance: {
          hasHardBlock: false,
          finishedProductStatus: "appears_compliant",
        },
      },
      batchReport: {
        shortageCount: 0,
      },
    },
  ];

  const economicsItems = [
    {
      formula: founderItems[0].formula,
      displayLabel: "Seeded Demo",
      status: "workable",
      estimatedCogs: 22,
      fragranceOilCostPerSku: 12,
      diluentCostPerSku: 1,
      grossMarginPercent: 68,
      pricingBlockers: [],
      cautions: [],
    },
  ];

  const launchPlan = buildLaunchRunPlannerSummary({
    founderItems,
    economicsItems,
    selectedUnitsByFormula: { "seeded-demo": 12 },
    inventory: {},
    pricesState: {},
    basketMode: "cheapest",
    fillVolumeMl: 50,
    fragranceLoadPercent: 20,
    packagingCost: 4.5,
    laborCost: 1.5,
    retailPrice: 95,
    diluentMaterialName: "Deluxe Perfumer's Alcohol",
    formulaSupplierOverridesByFormula: {},
    db: {},
    pricing: {},
  });

  assert.ok(launchPlan.trustSummary);
  assert.ok(["sparse", "blocked"].includes(launchPlan.trustSummary.level));
  assert.ok(launchPlan.trustSummary.missingSignals.length >= 1);

  const recommendation = buildCapitalConstrainedLaunchRecommendation({
    founderItems,
    economicsItems,
    selectedUnitsByFormula: { "seeded-demo": 12 },
    inventory: {},
    pricesState: {},
    basketMode: "cheapest",
    fillVolumeMl: 50,
    fragranceLoadPercent: 20,
    packagingCost: 4.5,
    laborCost: 1.5,
    retailPrice: 95,
    diluentMaterialName: "Deluxe Perfumer's Alcohol",
    formulaSupplierOverridesByFormula: {},
    budget: 2500,
    emphasisMode: "balanced",
    db: {},
    pricing: {},
  });

  assert.ok(recommendation.trustSummary);
  assert.equal(recommendation.selectedCandidates.length, 1);
  assert.ok(recommendation.selectedCandidates[0].trustSummary);
});

test("buildSubstitutionReviewDraftFormula swaps and merges duplicate ingredients without mutating the source", () => {
  const sourceFormula = {
    formulaKey: "formula-demo",
    name: "Demo Formula",
    versionLabel: "v1.0",
    ingredients: [
      { name: "Bergamot EO FCF", g: 10, note: "top" },
      { name: "Litsea Cubeba EO", g: 5, note: "top" },
      { name: "Habanolide", g: 20, note: "base" },
    ],
  };

  const draftFormula = buildSubstitutionReviewDraftFormula(
    sourceFormula,
    "Bergamot EO FCF",
    "Litsea Cubeba EO",
    {
      db: {
        "Litsea Cubeba EO": { note: "top" },
        Habanolide: { note: "base" },
      },
      formulaKey: "review-draft-demo",
      versionLabel: "v1.1",
      revisionNote: "Swap review",
    }
  );

  assert.equal(sourceFormula.ingredients.length, 3);
  assert.equal(draftFormula.formulaKey, "review-draft-demo");
  assert.equal(draftFormula.versionLabel, "v1.1");
  assert.equal(draftFormula.revisionNote, "Swap review");
  assert.deepEqual(
    draftFormula.ingredients.map((row) => [row.name, row.g, row.note]),
    [
      ["Litsea Cubeba EO", 15, "top"],
      ["Habanolide", 20, "base"],
    ]
  );
});

test("founder scenario inputs preserve batch target and IFRA context through record normalization", () => {
  const scenarioInputs = buildFounderScenarioInputState({
    basketMode: "best_value",
    founderProductProfile: "fine_fragrance_spray",
    founderFragranceLoadPercent: 18,
    dilType: "EDT",
    ifraCategory: "cat5b",
    batchPlannerTargetG: 750,
    dilAlcohol: false,
    skuFillVolumeMl: 30,
    skuRetailPrice: 82,
    skuPackagingCost: 5,
    skuLaborCost: 2,
    launchPlanUnitsByFormula: {
      "seeded-demo": 24,
      "draft-demo": 0,
    },
  });

  const scenarioRecord = createFounderLaunchScenarioRecord({
    name: "Lean Launch",
    inputs: scenarioInputs,
  });
  const normalized = normalizeFounderLaunchScenarioRecord(scenarioRecord);

  assert.equal(normalized.inputs.basketMode, "best_value");
  assert.equal(normalized.inputs.founderProductProfile, "fine_fragrance_spray");
  assert.equal(normalized.inputs.founderFragranceLoadPercent, 18);
  assert.equal(normalized.inputs.dilType, "EDT");
  assert.equal(normalized.inputs.ifraCategory, "cat5b");
  assert.equal(normalized.inputs.batchPlannerTargetG, 750);
  assert.equal(normalized.inputs.dilAlcohol, true);
  assert.deepEqual(normalized.inputs.launchPlanUnitsByFormula, {
    "seeded-demo": 24,
  });
});

test("founder scenario share brief includes stored context and live launch metrics", () => {
  const scenario = createFounderLaunchScenarioRecord({
    name: "Broad Launch",
    inputs: {
      basketMode: "best_quality",
      founderProductProfile: "fine_fragrance_spray",
      founderFragranceLoadPercent: 18,
      dilType: "EDP",
      ifraCategory: "cat4",
      batchPlannerTargetG: 1200,
      dilAlcohol: false,
      skuFillVolumeMl: 50,
      skuRetailPrice: 110,
      skuPackagingCost: 6,
      skuLaborCost: 2.5,
      launchPlanUnitsByFormula: {
        "seeded-demo": 36,
      },
    },
  });

  const brief = buildFounderScenarioShareBrief({
    scenario,
    snapshot: {
      normalizedScenario: scenario.inputs,
      selectedBasketModeMeta: { label: "Best Quality" },
      founderProductContext: {
        label: "Fine Fragrance Spray",
        contextLabel: "Fine Fragrance Spray · 18% load",
        diluentModeLabel: "Alcohol",
        diluentMaterialName: "Deluxe Perfumer's Alcohol",
      },
      selectedFragranceType: { label: "Fine Fragrance Spray", pct: 18 },
      diluentMaterialName: "Deluxe Perfumer's Alcohol",
      launchRunPlannerSummary: {
        summary: {
          totalUnits: 36,
          launchCashRequirement: 540,
          estimatedTotalCogs: 420,
          estimatedGrossRevenue: 3960,
          estimatedGrossProfit: 3540,
          estimatedGrossMarginPercent: 89.4,
          shortageIngredientCount: 2,
          totalRawMaterialShortageG: 180,
        },
        capitalCaveats: ["2 pricing lines remain uncertain in the current basket."],
        topCapitalIngredients: [
          { ingredientName: "Habanolide", lineCost: 95 },
        ],
        selectedItems: [
          { displayLabel: "Seeded Demo", units: 36 },
        ],
        trustSummary: buildFounderTrustSummary({
          basket: {
            lines: [{ ingredientName: "Habanolide", mappingConfidence: "inferred" }],
            missingCount: 0,
            uncertainCount: 1,
          },
          launchReadiness: {
            pricing: { missingCount: 0, uncertainCount: 1 },
            compliance: { finishedProductStatus: "appears_compliant_with_missing" },
            blockers: [],
            cautions: ["Some supplier confidence remains inferred."],
          },
          expectedLineCount: 1,
        }),
      },
    },
    generatedAt: "2026-03-18T12:00:00.000Z",
  });

  assert.match(brief, /Scenario: Broad Launch/);
  assert.match(brief, /Basket mode: Best Quality/);
  assert.match(brief, /Product context: Fine Fragrance Spray/);
  assert.match(brief, /Fragrance\/load context: Fine Fragrance Spray · 18% load/);
  assert.match(brief, /IFRA category: Cat 4/);
  assert.match(brief, /Batch target: 1200g/);
  assert.match(brief, /Diluent mode: Alcohol \(Deluxe Perfumer's Alcohol\)/);
  assert.match(brief, /Launch cash need: \$540.00/);
  assert.match(brief, /Estimated revenue: \$3960.00/);
  assert.match(brief, /Habanolide: \$95.00 estimated buy cost/);
});
