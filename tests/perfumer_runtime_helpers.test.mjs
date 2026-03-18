import test from "node:test";
import assert from "node:assert/strict";

import { buildIngredientTruthCompletenessReport } from "../src/lib/ifra_combined_package.js";
import {
  buildCapitalConstrainedLaunchRecommendation,
  buildMaterialBackfillWorkbench,
  buildFounderScenarioInputState,
  buildFounderScenarioShareBrief,
  buildFounderTrustSummary,
  buildLaunchRunPlannerSummary,
  buildMaterialTruthGapPrioritization,
  buildSubstitutionReviewDraftFormula,
  createFounderLaunchScenarioRecord,
  normalizeFounderLaunchScenarioRecord,
} from "../src/lib/perfumer_runtime_helpers.js";

test("ingredient truth completeness surfaces canonical and supplier support from current registries", () => {
  const report = buildIngredientTruthCompletenessReport("Ylang-Ylang Extra Oil, Org");

  assert.equal(report.canonicalMaterialKey, "ylang_ylang_extra_oil");
  assert.equal(report.dimensionByKey.identity.status, "confirmed");
  assert.ok(report.supplierVariantCount > 0);
  assert.ok(["inferred", "confirmed"].includes(report.dimensionByKey.pricing.status));
});

test("ingredient truth completeness flags sparse pricing and identity gaps when support is weak", () => {
  const report = buildIngredientTruthCompletenessReport("QA Sparse Material", {
    record: {
      note: "top",
    },
    livePricing: {},
  });

  assert.ok(["partial", "sparse"].includes(report.level));
  assert.ok(report.missingSignals.length >= 1);
  assert.equal(report.dimensionByKey.pricing.status, "missing");
});

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
    extraTrustCounts: {
      totalConsideredCount: 1,
      confirmedCount: 0,
      inferredCount: 0,
      uncertainCount: 1,
      missingCount: 0,
    },
    extraUncertainSignals: [
      "Ingredient truth is still partial for one material in the current formula.",
    ],
  });

  assert.ok(["sparse", "blocked"].includes(trustSummary.level));
  assert.equal(trustSummary.missingCount, 1);
  assert.ok(trustSummary.missingSignals.length >= 1);
  assert.equal(trustSummary.blockerDependsOnMissing, true);
  assert.ok(trustSummary.uncertainSignals.length >= 1);
});

test("material truth prioritization ranks weak materials by usage, spend, and founder relevance", () => {
  const prioritization = buildMaterialTruthGapPrioritization([
    {
      name: "Sparse Workhorse",
      truthLevel: "sparse",
      formulaCount: 5,
      appearanceCount: 5,
      totalLineCost: 24,
      founderCriticalCount: 3,
      nearReadyCount: 2,
      blockedFormulaCount: 1,
      pricingGapCount: 2,
      uncertainPricingCount: 1,
      inventoryBlockerCount: 1,
      pricingStatus: "missing",
      technicalStatus: "uncertain",
      ifraStatus: "uncertain",
      evidenceStatus: "uncertain",
      identityStatus: "confirmed",
      regulatoryStatus: "uncertain",
      primaryGap: "No live supplier pricing rows are attached yet.",
    },
    {
      name: "Expensive Partial",
      truthLevel: "partial",
      formulaCount: 2,
      appearanceCount: 2,
      totalLineCost: 96,
      founderCriticalCount: 1,
      nearReadyCount: 1,
      blockedFormulaCount: 0,
      pricingGapCount: 0,
      uncertainPricingCount: 1,
      inventoryBlockerCount: 0,
      pricingStatus: "inferred",
      technicalStatus: "confirmed",
      ifraStatus: "confirmed",
      evidenceStatus: "inferred",
      identityStatus: "confirmed",
      regulatoryStatus: "confirmed",
      primaryGap: "Supplier variants exist, but live-priced size options are still missing.",
    },
    {
      name: "Well Supported Material",
      truthLevel: "strong",
      formulaCount: 4,
      appearanceCount: 4,
      totalLineCost: 40,
      founderCriticalCount: 2,
      nearReadyCount: 2,
      blockedFormulaCount: 0,
      pricingGapCount: 0,
      uncertainPricingCount: 0,
      inventoryBlockerCount: 0,
      pricingStatus: "confirmed",
      technicalStatus: "confirmed",
      ifraStatus: "confirmed",
      evidenceStatus: "confirmed",
      identityStatus: "confirmed",
      regulatoryStatus: "confirmed",
    },
  ]);

  assert.equal(prioritization.summary.weakMaterialCount, 2);
  assert.equal(prioritization.mostUsedWeakMaterials[0].name, "Sparse Workhorse");
  assert.equal(prioritization.highestSpendWeakMaterials[0].name, "Expensive Partial");
  assert.equal(
    prioritization.founderCriticalWeakMaterials[0].name,
    "Sparse Workhorse"
  );
  assert.equal(
    prioritization.strongestBackfillCandidates[0].name,
    "Sparse Workhorse"
  );
});

test("material backfill workbench stages promotable candidates, manual follow-up, and conflicts", () => {
  const workbench = buildMaterialBackfillWorkbench({
    targetNames: ["Sparse Workhorse"],
    prioritizationRows: [
      {
        name: "Sparse Workhorse",
        truthLevel: "sparse",
        priorityScore: 88,
        primaryGap: "No live priced pack-size options are attached yet.",
      },
    ],
    evidenceCandidates: [
      {
        evidenceCandidateKey: "sparse:cas:a",
        canonicalMaterialKey: "sparse_workhorse",
        candidateFieldName: "cas",
        candidateValue: "100-00-1",
        confidence: "medium",
        sourceType: "sds",
        supplier: "Supplier A",
        reviewStatus: "pending_review",
      },
      {
        evidenceCandidateKey: "sparse:cas:b",
        canonicalMaterialKey: "sparse_workhorse",
        candidateFieldName: "cas",
        candidateValue: "100-00-2",
        confidence: "low",
        sourceType: "supplier_pdf",
        supplier: "Supplier B",
        reviewStatus: "pending_review",
      },
      {
        evidenceCandidateKey: "sparse:scentdesc",
        canonicalMaterialKey: "sparse_workhorse",
        candidateFieldName: "scentDesc",
        candidateValue: "Warm resinous floral note.",
        confidence: "high",
        sourceType: "tds",
        supplier: "Supplier A",
        reviewStatus: "approved_for_promotion",
      },
      {
        evidenceCandidateKey: "sparse:ifra-hint",
        canonicalMaterialKey: "sparse_workhorse",
        candidateFieldName: "ifraMaterialHint",
        candidateValue: "Possible balsam family link",
        confidence: "medium",
        sourceType: "other",
        supplier: "Local Repo",
        reviewStatus: "pending_review",
      },
    ],
    intakeTargets: [
      {
        canonicalMaterialKey: "sparse_workhorse",
        relatedCatalogNames: ["Sparse Workhorse"],
        stillMissingFields: ["cas", "inci", "ifraMaterialHint"],
        requestedSourceTypes: ["sds", "tds"],
        notes: ["Prefer trusted SDS before promoting CAS."],
      },
    ],
    materialContextByName: {
      "Sparse Workhorse": {
        canonicalMaterialKey: "sparse_workhorse",
        supplierVariantCount: 0,
        livePricingSupplierCount: 0,
        livePricingPackCount: 0,
        sourceDocumentCount: 0,
        evidenceCandidateCount: 4,
        supplierProducts: [],
        truthReport: {
          name: "Sparse Workhorse",
          primaryGap: "No live priced pack-size options are attached yet.",
          dimensionByKey: {
            identity: { status: "confirmed" },
            supplier: { status: "uncertain" },
            pricing: { status: "missing" },
            technical: { status: "uncertain" },
            ifra: { status: "uncertain" },
            evidence: { status: "uncertain" },
          },
          uncertainSignals: [
            "Technical behavior support is still sparse (MW / xLogP / VP / ODT / TPSA).",
            "Structured IFRA restriction support is still partial in the current helper path.",
            "Source-document and evidence-candidate support is still light for this material.",
          ],
          normalizationEntry: { entryKind: "supplier_product" },
        },
      },
    },
  });

  assert.equal(workbench.summary.targetCount, 1);
  assert.equal(workbench.summary.promotableCandidateCount, 3);
  assert.equal(workbench.targets[0].conflictSummary[0].fieldKey, "cas");
  assert.ok(
    workbench.targets[0].manualFollowUpRows.some(
      (row) => row.fieldKey === "pricing"
    )
  );
  assert.ok(
    workbench.targets[0].manualCandidates.some(
      (candidate) => candidate.fieldKey === "ifraMaterialHint"
    )
  );
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
