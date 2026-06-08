import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFinishedProductIfraGuidance,
  buildIngredientTruthCompletenessReport,
  auditFormulaIfraCoverage,
  compareMaterialCasSupportValues,
  computeActiveRestrictedPercent,
  formatMaterialCasSupportValue,
  getIfraMaterialRecord,
  resolveIngredientIdentity,
} from "../src/lib/ifra_combined_package.js";
import {
  applyAiCritiqueIssueTriageState,
  buildBenchStockDuplicateDraft,
  buildBenchStockEffectiveActivePercent,
  buildBenchStockRuntimeSummary,
  computeDilutedFormulaLineGrams,
  buildAiCritiqueIssueTriageKey,
  buildAiCritiqueGroundTruth,
  buildAiCritiquePrompt,
  buildAiCritiqueTruthSignature,
  buildCapitalConstrainedLaunchRecommendation,
  buildFormulaCritiqueReport,
  buildMaterialSubstitutionSuggestions,
  buildDoseAwareOdorMapModel,
  buildFormulaDecisionGuidance,
  buildFormulaTimelineContributionModel,
  buildVaporPressureDisplay,
  buildFraterworksSupplierAdapterResult,
  buildFormulaCriticalDataAudit,
  buildFormulaFieldCorrectionReviewCandidate,
  buildFormulaMissingMaterialReviewCandidates,
  buildLocalDraftIngredientArtifacts,
  buildMaterialBackfillWorkbench,
  buildMaterialBehaviorSignals,
  buildSupplierAdapterConflictReviewCandidate,
  buildSupplierAdapterExportPayload,
  buildGeneratedProposalReviewCandidate,
  buildMaterialImprovementQueue,
  deriveVisibleMaterialDescriptorText,
  formatVaporPressureNumber,
  buildFounderScenarioInputState,
  buildFounderScenarioShareBrief,
  buildFounderTrustSummary,
  buildLaunchReadinessSummary,
  buildLaunchRunPlannerSummary,
  buildMaterialTruthGapPrioritization,
  buildSubstitutionReviewDraftFormula,
  createFounderLaunchScenarioRecord,
  isCritiqueResultCurrent,
  normalizeAiCritiqueIssueTriageState,
  normalizeFounderLaunchScenarioRecord,
  normalizeLooseNumericInput,
  parseVaporPressureInput,
  parseSupplierAdapterPackLines,
} from "../src/lib/perfumer_runtime_helpers.js";

test("isCritiqueResultCurrent requires matching formula and critique lens metadata", () => {
  assert.equal(
    isCritiqueResultCurrent({
      critique: { formulaKey: "seed-hero-original", lens: "perfumer" },
      formulaKey: "seed-hero-original",
      lens: "perfumer",
    }),
    true
  );
  assert.equal(
    isCritiqueResultCurrent({
      critique: { formulaKey: "seed-hero-skin-air-bridge", lens: "perfumer" },
      formulaKey: "seed-hero-original",
      lens: "perfumer",
    }),
    false
  );
  assert.equal(
    isCritiqueResultCurrent({
      critique: { formulaKey: "seed-hero-original", lens: "compliance" },
      formulaKey: "seed-hero-original",
      lens: "perfumer",
    }),
    false
  );
  assert.equal(
    isCritiqueResultCurrent({
      critique: {},
      formulaKey: "seed-hero-original",
      lens: "perfumer",
    }),
    false
  );
  assert.equal(
    isCritiqueResultCurrent({
      critique: { formulaKey: "seed-hero-damp-shoreline-v2", lens: "cost" },
      formulaKey: "seed-hero-damp-shoreline-v2",
      lens: "cost",
    }),
    true
  );
  assert.equal(
    isCritiqueResultCurrent({
      critique: {
        formulaKey: "seed-hero-damp-shoreline-v2",
        lens: "cost",
        truthSignature: "truth-a",
      },
      formulaKey: "seed-hero-damp-shoreline-v2",
      lens: "cost",
      truthSignature: "truth-a",
    }),
    true
  );
  assert.equal(
    isCritiqueResultCurrent({
      critique: {
        formulaKey: "seed-hero-damp-shoreline-v2",
        lens: "cost",
        truthSignature: "truth-a",
      },
      formulaKey: "seed-hero-damp-shoreline-v2",
      lens: "cost",
      truthSignature: "truth-b",
    }),
    false
  );
  assert.equal(
    isCritiqueResultCurrent({
      critique: { formulaKey: "seed-hero-damp-shoreline-v2", lens: "cost" },
      formulaKey: "seed-hero-damp-shoreline-v2",
      lens: "cost",
      truthSignature: "truth-b",
    }),
    false
  );
});

test("Bergamot FCF is separated from regular expressed bergamot IFRA restriction", () => {
  const fcfIdentity = resolveIngredientIdentity("Bergamot EO FCF");
  const fcfMaterial = getIfraMaterialRecord("Bergamot EO FCF");
  assert.equal(fcfIdentity.resolvedIfraMaterial, "bergamot eo fcf");
  assert.equal(fcfMaterial.limits.cat4, null);
  assert.match(fcfMaterial.missingLimitReason, /furocoumarin-free/i);

  const bergamotFcfMaterial = getIfraMaterialRecord("Bergamot FCF");
  assert.equal(bergamotFcfMaterial.limits.cat4, null);
  const catalogFcfIdentity = resolveIngredientIdentity(
    "Bergamot Oil FCF, Côte d'Ivoire"
  );
  assert.equal(catalogFcfIdentity.resolvedIfraMaterial, "bergamot eo fcf");

  const regularIdentity = resolveIngredientIdentity("Bergamot oil");
  const regularMaterial = getIfraMaterialRecord("Bergamot oil");
  assert.equal(regularIdentity.resolvedIfraMaterial, "bergamot expressed");
  assert.equal(regularMaterial.limits.cat4, 0.4);

  const regularGuidance = buildFinishedProductIfraGuidance({
    items: [{ name: "Bergamot oil", g: 1 }],
    category: "cat4",
    fragranceLoadPercent: 17.5,
  });
  assert.equal(regularGuidance.offenderRows.length, 1);
  assert.equal(regularGuidance.offenderRows[0].name, "Bergamot oil");

  const fcfGuidance = buildFinishedProductIfraGuidance({
    items: [{ name: "Bergamot EO FCF", g: 1 }],
    category: "cat4",
    fragranceLoadPercent: 17.5,
  });
  assert.equal(fcfGuidance.offenderRows.length, 0);
  assert.equal(fcfGuidance.warningRows.length, 0);
  assert.equal(fcfGuidance.missingRows.length, 1);
  assert.match(fcfGuidance.missingRows[0].missingReason, /regular expressed/i);

  const lemonFcfIdentity = resolveIngredientIdentity("Lemon FCF");
  const lemonFcfMaterial = getIfraMaterialRecord("Lemon FCF");
  assert.equal(lemonFcfIdentity.resolvedIfraMaterial, "lemon fcf");
  assert.equal(lemonFcfMaterial.limits.cat4, null);
  assert.match(lemonFcfMaterial.missingLimitReason, /cold-pressed lemon/i);

  const lemonFcfGuidance = buildFinishedProductIfraGuidance({
    items: [{ name: "Lemon FCF", g: 1 }],
    category: "cat4",
    fragranceLoadPercent: 17.5,
  });
  assert.equal(lemonFcfGuidance.offenderRows.length, 0);
  assert.equal(lemonFcfGuidance.warningRows.length, 0);
  assert.equal(lemonFcfGuidance.missingRows.length, 1);
  assert.match(lemonFcfGuidance.missingRows[0].missingReason, /cold-pressed lemon/i);
});

test("non-FCF citrus IFRA restriction remains active", () => {
  const lemonMaterial = getIfraMaterialRecord("Lemon EO Italy");
  assert.equal(lemonMaterial.limits.cat4, 2.0);

  const lemonGuidance = buildFinishedProductIfraGuidance({
    items: [{ name: "Lemon EO Italy", g: 1 }],
    category: "cat4",
    fragranceLoadPercent: 17.5,
  });
  assert.equal(lemonGuidance.offenderRows.length, 1);
  assert.equal(lemonGuidance.offenderRows[0].name, "Lemon EO Italy");
});

test("formula IFRA coverage audit classifies matches, gaps, and accord rows conservatively", () => {
  const audit = auditFormulaIfraCoverage(
    [
      { name: "Lemon EO Italy", g: 0.2 },
      { name: "Bergamot Oil FCF, Côte d'Ivoire", g: 0.3 },
      { name: "TEC", g: 1 },
      { name: "Botanical Musk Accord", g: 1.3 },
      { name: "No Such Material", g: 0.1 },
    ],
    {
      db: {
        "Botanical Musk Accord": { type: "ACCORD" },
      },
    }
  );

  assert.equal(audit.counts.exactIfraMatch, 1);
  assert.equal(audit.counts.aliasIfraMatch, 0);
  assert.equal(audit.counts.fcfSpecialCase, 1);
  assert.equal(audit.counts.sourceUnavailable, 0);
  assert.equal(audit.counts.intentionallyNotMatchedNoStandard, 1);
  assert.equal(audit.counts.noKnownRestriction, 1);
  assert.equal(audit.counts.accordLevelOnly, 1);
  assert.equal(audit.counts.missingAlias, 1);
  assert.equal(audit.counts.knownRestrictionRows, 1);
  assert.equal(
    audit.rows.find((row) => row.name === "Botanical Musk Accord").label,
    "Accord-level row; component IFRA not expanded"
  );
  assert.equal(
    audit.rows.find((row) => row.name === "No Such Material").label,
    "No IFRA record matched in current structured data"
  );
  assert.equal(
    audit.rows.find((row) => row.name === "Bergamot Oil FCF, Côte d'Ivoire")
      .label,
    "Special handling: FCF/furocoumarin-free citrus"
  );

  const supplierAudit = auditFormulaIfraCoverage(
    [{ name: "Seaweed Absolute 10%", g: 0.2 }],
    { db: { "Seaweed Absolute 10%": { type: "ABS" } } }
  );
  assert.equal(supplierAudit.counts.supplierSdsNeeded, 1);
  assert.equal(supplierAudit.rows[0].label, "Supplier IFRA/SDS needed");

  const missingGuidance = buildFinishedProductIfraGuidance({
    items: [{ name: "No Such Material", g: 1 }],
    category: "cat4",
    fragranceLoadPercent: 17.5,
  });
  assert.equal(missingGuidance.offenderRows.length, 0);
  assert.equal(missingGuidance.warningRows.length, 0);
  assert.equal(missingGuidance.missingRows.length, 1);
});

test("active hero IFRA aliases map to structured master standards without mutating formula rows", () => {
  const cashmeran = getIfraMaterialRecord("Cashmeran");
  assert.equal(
    resolveIngredientIdentity("Cashmeran").resolvedIfraMaterial,
    "cashmeran"
  );
  assert.equal(cashmeran.limits.cat4, 3.8);

  const helional = getIfraMaterialRecord("Helional®");
  assert.equal(
    resolveIngredientIdentity("Helional®").resolvedIfraMaterial,
    "helional"
  );
  assert.equal(helional.limits.cat4, 2.6);
  assert.equal(
    computeActiveRestrictedPercent({
      formulaPercent: 4,
      ingredientName: "Helional 25%",
    }),
    1
  );

  const cyclamen = getIfraMaterialRecord("Cyclamen Aldehyde");
  assert.equal(
    resolveIngredientIdentity("Cyclamen Aldehyde").resolvedIfraMaterial,
    "cyclamen aldehyde"
  );
  assert.equal(cyclamen.limits.cat4, 0.95);

  const ylang = getIfraMaterialRecord("Ylang Ylang Complete 10%");
  assert.equal(
    resolveIngredientIdentity("Ylang Ylang 10%").resolvedIfraMaterial,
    "ylang ylang extracts"
  );
  assert.equal(ylang.limits.cat4, 0.73);
  assert.ok(
    Math.abs(
      computeActiveRestrictedPercent({
        formulaPercent: 3,
        ingredientName: "Ylang Ylang Complete 10%",
      }) - 0.3
    ) < 0.000001
  );

  const formulaRows = [
    { name: "Cashmeran", g: 0.12 },
    { name: "Helional 25%", g: 0.31 },
    { name: "Cyclamen Aldehyde", g: 0.13 },
    { name: "Ylang Ylang Complete 10%", g: 0.112 },
  ];
  const before = JSON.stringify(formulaRows);
  const audit = auditFormulaIfraCoverage(formulaRows);
  assert.equal(JSON.stringify(formulaRows), before);
  assert.equal(audit.counts.exactIfraMatch, 1);
  assert.equal(audit.counts.aliasIfraMatch, 3);
  assert.equal(audit.counts.knownRestrictionRows, 4);
});

test("formula timeline contribution model decays absolute contribution over time", () => {
  const db = {
    "Calone Test": {
      MW: 178.187,
      VP: 0.00000285,
      ODT: 0.00001,
      note: "top",
      xLogP: 2.43,
      scentClass: "Marine",
      descriptorTags: ["Marine", "High Impact Marine"],
    },
    "Bergamot Test": {
      MW: 150,
      VP: 0.05,
      ODT: 5,
      note: "top",
      xLogP: 2.1,
      scentClass: "Citrus",
      descriptorTags: ["Citrus"],
    },
    "Musk Base Test": {
      MW: 238,
      VP: 0.000000225,
      ODT: 0.012,
      note: "base",
      xLogP: 5.45,
      scentClass: "Musk",
      descriptorTags: ["Musk"],
      odorThresholdSource: { unit: "ppbv air" },
    },
  };
  const model = buildFormulaTimelineContributionModel(
    [
      { name: "Calone Test", g: 0.06, note: "top" },
      { name: "Bergamot Test", g: 0.8, note: "top" },
      { name: "Musk Base Test", g: 4.5, note: "base" },
    ],
    { db }
  );

  const caloneSeries = model.absoluteRows.map((row) => row["Calone Test"]);
  assert.ok(
    caloneSeries.every(
      (value, index) => index === 0 || value <= caloneSeries[index - 1] + 1e-9
    )
  );
  const calone = model.materials.find((row) => row.name === "Calone Test");
  const musk = model.materials.find((row) => row.name === "Musk Base Test");
  assert.ok(musk.retentionAtEightHours > calone.retentionAtEightHours);
  assert.match(
    buildFormulaDecisionGuidance(
      [{ name: "Calone Test", g: 0.06, note: "top" }],
      { db, timelineModel: model }
    ).timeline.find((row) => row.label === "Do not overreact").text,
    /physically stronger/i
  );
});

test("trace high-impact materials are capped and flagged without dominating by default", () => {
  const db = {
    "Ald Trace Test": {
      MW: 128.21,
      VP: 1.18,
      ODT: 0.000001,
      note: "top",
      xLogP: 2.7,
      scentClass: "Aldehydic",
      descriptorTags: ["Aldehydic", "High Impact Aldehydic"],
      odorThresholdSource: { unit: "ppbv air" },
    },
    "Musk Base Test": {
      MW: 250,
      VP: 0.0000001,
      ODT: 5,
      note: "base",
      xLogP: 5.4,
      scentClass: "Musk",
      descriptorTags: ["Musk"],
    },
    "Woody Body Test": {
      MW: 220,
      VP: 0.000003,
      ODT: 2,
      note: "base",
      xLogP: 4.6,
      scentClass: "Woody",
      descriptorTags: ["Woody"],
    },
  };
  const ingredients = [
    { name: "Ald Trace Test", g: 0.02, note: "top" },
    { name: "Musk Base Test", g: 10, note: "base" },
    { name: "Woody Body Test", g: 4, note: "base" },
  ];
  const timelineModel = buildFormulaTimelineContributionModel(ingredients, { db });
  const trace = timelineModel.traceAlerts.find(
    (row) => row.name === "Ald Trace Test"
  );
  const musk = timelineModel.materials.find(
    (row) => row.name === "Musk Base Test"
  );

  assert.ok(trace);
  assert.equal(trace.capApplied, true);
  assert.ok(trace.cappedImpact < musk.initialContribution);
  assert.notEqual(timelineModel.materials[0].name, "Ald Trace Test");

  const odorMap = buildDoseAwareOdorMapModel(ingredients, {
    db,
    timelineModel,
  });
  assert.equal(odorMap.traceAlerts[0].name, "Ald Trace Test");
  assert.notEqual(odorMap.dominantFamilies[0].family, "Aldehydic");
  assert.ok(
    ["Musk", "Woody"].includes(odorMap.dominantFamilies[0].family)
  );
});

test("AI critique issue triage state is keyed by formula, lens, and issue", () => {
  const triageKey = buildAiCritiqueIssueTriageKey({
    formulaKey: "seed-hero-skin-air-bridge",
    lens: "compliance",
    issueId: "section-weaknesses",
  });
  assert.equal(
    triageKey,
    "seed-hero-skin-air-bridge::compliance::section-weaknesses"
  );

  const applied = applyAiCritiqueIssueTriageState(
    {},
    {
      formulaKey: "seed-hero-skin-air-bridge",
      lens: "compliance",
      issueId: "section-weaknesses",
      status: "false_positive",
      note: "Bergamot FCF data source issue",
      updatedAt: "2026-06-08T12:00:00.000Z",
    }
  );
  assert.equal(applied[triageKey].status, "false_positive");
  assert.equal(applied[triageKey].note, "Bergamot FCF data source issue");

  const normalized = normalizeAiCritiqueIssueTriageState({
    [triageKey]: applied[triageKey],
    invalid: {
      formulaKey: "seed-hero-skin-air-bridge",
      lens: "compliance",
      issueId: "section-strengths",
      status: "not-real",
    },
  });
  assert.deepEqual(Object.keys(normalized), [triageKey]);

  const cleared = applyAiCritiqueIssueTriageState(applied, {
    formulaKey: "seed-hero-skin-air-bridge",
    lens: "compliance",
    issueId: "section-weaknesses",
    status: "",
  });
  assert.equal(cleared[triageKey], undefined);
});

test("AI critique prompt includes current structured pricing and accord truth", () => {
  const formula = {
    formulaKey: "seed-hero-skin-air-bridge",
    name: "Skin-Air Bridge",
    tagline: "Hero test variation",
    versionLabel: "v1.0",
    ingredients: [
      { name: "Botanical Musk Accord", g: 1.491, note: "base" },
      { name: "Driftwood Accord", g: 0.884, note: "base" },
      { name: "Bergamot EO FCF", g: 0.723, note: "top" },
    ],
  };
  const basket = {
    meta: {
      label: "Cheapest",
      title: "Cheapest Purchase Basket",
    },
    totalCost: 168.655092,
    missingCount: 0,
    uncertainCount: 0,
    inferredCount: 2,
    confirmedCount: 29,
    supplierCount: 5,
    lines: [
      {
        ingredientName: "Botanical Musk Accord",
        supplier: "Bench Accord",
        status: "inferred",
        lineCost: 0.527121,
        linkStatus: "component_derived_accord",
        costingMode: "component_derived",
      },
      {
        ingredientName: "Driftwood Accord",
        supplier: "Bench Accord",
        status: "inferred",
        lineCost: 0.557971,
        linkStatus: "component_derived_accord",
        costingMode: "component_derived",
      },
      {
        ingredientName: "Bergamot EO FCF",
        supplier: "Fraterworks",
        status: "confirmed",
        lineCost: 9.44,
      },
    ],
  };
  const db = {
    "Botanical Musk Accord": { scentClass: "Accord" },
    "Driftwood Accord": { scentClass: "Accord" },
    "Bergamot EO FCF": { scentClass: "Citrus" },
  };
  const critiqueReport = buildFormulaCritiqueReport({
    formula,
    chemistry: [],
    performance: { longevity: 7.1, sillage: 5.6, projection: 5.2 },
    performanceModel: {
      headline: "Directional performance model available.",
      facets: [],
      axisScores: {},
      caveats: [],
    },
    basket,
    cheapestBasket: basket,
    basketModeMeta: { label: "Cheapest" },
    ifraRows: [],
    lens: "cost",
    db,
    modelConfidenceSummary: {
      categoryCounts: {
        black_box_accord: 2,
        missing_pricing: 0,
        missing_ifra: 2,
        directional_only: 1,
      },
    },
  });
  const prompt = buildAiCritiquePrompt({
    targetFormula: formula,
    critiqueReport,
    performance: { longevity: 7.1, sillage: 5.6, projection: 5.2 },
    db,
  });

  assert.match(prompt, /Current dashboard truth data/);
  assert.match(prompt, /"initialPurchaseBasketEstimate": 168\.66/);
  assert.match(prompt, /"missingPriceCount": 0/);
  assert.match(prompt, /"missingPricingFlags": 0/);
  assert.match(prompt, /"componentCostedAccordCount": 2/);
  assert.match(prompt, /"unpricedAccordCount": 0/);
  assert.match(prompt, /"supplierCount": 5/);
  assert.match(prompt, /"lowConfidenceSupplierMappingCount": 2/);
  assert.match(prompt, /"shippingTaxMinimumOrdersIncluded": false/);
  assert.match(prompt, /"costViewType": "initial_purchase_basket_estimate"/);
  assert.match(prompt, /Do not claim missing supplier prices unless/);
  assert.match(prompt, /Do not claim known accords are unpriced/);
  assert.match(prompt, /Do not claim IFRA violations unless/);
  assert.match(prompt, /mapping-confidence or sourcing-confidence uncertainty/);
  assert.match(
    prompt,
    /cost is recipe-derived while chemistry\/IFRA modeling remains accord-level/
  );
  assert.match(
    critiqueReport.costIssues.join(" "),
    /No active ingredients are missing price rows/
  );
  assert.match(
    critiqueReport.costIssues.join(" "),
    /Known accord rows are component-costed/
  );
});

test("AI critique truth signatures change when pricing support context changes", () => {
  const formula = {
    formulaKey: "seed-hero-skin-air-bridge",
    name: "Skin-Air Bridge",
    ingredients: [{ name: "Botanical Musk Accord", g: 1, note: "base" }],
  };
  const baseTruth = buildAiCritiqueGroundTruth({
    formula,
    basket: {
      totalCost: 168.655092,
      missingCount: 0,
      inferredCount: 1,
      supplierCount: 5,
      lines: [
        {
          ingredientName: "Botanical Musk Accord",
          supplier: "Bench Accord",
          lineCost: 0.5,
          linkStatus: "component_derived_accord",
          costingMode: "component_derived",
        },
      ],
    },
    basketModeMeta: { label: "Cheapest" },
    ifraRows: [],
    modelConfidenceSummary: { categoryCounts: { missing_pricing: 0 } },
  });
  const changedTruth = buildAiCritiqueGroundTruth({
    formula,
    basket: {
      totalCost: 171.12,
      missingCount: 0,
      inferredCount: 1,
      supplierCount: 5,
      lines: [
        {
          ingredientName: "Botanical Musk Accord",
          supplier: "Bench Accord",
          lineCost: 0.5,
          linkStatus: "component_derived_accord",
          costingMode: "component_derived",
        },
      ],
    },
    basketModeMeta: { label: "Cheapest" },
    ifraRows: [],
    modelConfidenceSummary: { categoryCounts: { missing_pricing: 0 } },
  });

  assert.notEqual(
    buildAiCritiqueTruthSignature(baseTruth),
    buildAiCritiqueTruthSignature(changedTruth)
  );
});

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

test("ingredient truth completeness keeps local drafts honest even with strong manual fields", () => {
  const artifacts = buildLocalDraftIngredientArtifacts({
    materialName: "Local Draft Amber",
    supplierName: "Owned Stock",
    url: "https://example.com/local-draft-amber",
    pricePoints: [[15, "g", 18.5, null]],
    availabilityStatus: "in stock",
    ifraPercent: "0.5",
    sdsUrl: "https://example.com/local-draft-amber/sds.pdf",
    inci: "Amber Accord",
    cas: "111-22-3",
    note: "base",
    materialType: "SYNTH",
    scentSummary: "Warm ambery material.",
    technicalNotes: "Still awaiting canonical review.",
  });

  const report = buildIngredientTruthCompletenessReport("Local Draft Amber", {
    record: artifacts.dbRecord,
    livePricing: artifacts.pricingBySupplier,
  });

  assert.equal(report.isLocalDraft, true);
  assert.equal(report.dimensionByKey.identity.status, "inferred");
  assert.ok(
    report.uncertainSignals.some((signal) =>
      signal.includes("browser-local manual draft ingredient")
    )
  );
});

test("ingredient truth completeness treats direct manual identity edits as strong support when no conflict is active", () => {
  const report = buildIngredientTruthCompletenessReport("QA Manual Identity", {
    record: {
      cas: "123-45-6",
      inci: "Manual Identity Ingredient",
      type: "SYNTH",
      note: "mid",
      manualIdentityEdited: true,
      manualIdentityNotes: "Updated directly from the dossier.",
    },
    livePricing: {},
  });

  assert.equal(report.dimensionByKey.identity.status, "confirmed");
  assert.equal(report.dimensionByKey.regulatory.status, "confirmed");
  assert.equal(report.dimensionByKey.evidence.status, "inferred");
  assert.equal(report.hasStrongManualIdentitySupport, true);
  assert.ok(
    report.manualTrustedSignals.some((signal) =>
      signal.includes("CAS / identity fields were manually verified")
    )
  );
  assert.ok(
    report.uncertainSignals.every(
      (signal) => !signal.includes("CAS / identity fields include browser-local manual edits")
    )
  );
});

test("ingredient truth completeness treats direct technical edits as strong support when no conflict is active", () => {
  const report = buildIngredientTruthCompletenessReport("QA Manual Technical", {
    record: {
      MW: 180.2,
      xLogP: 3.1,
      VP: 0.002,
      ODT: 12,
      TPSA: 21.5,
      odorThreshold_ngL: 8,
      manualTechnicalEdited: true,
      manualTechnicalNotes: "Manual trusted molecular estimate.",
    },
    livePricing: {},
  });

  assert.equal(report.dimensionByKey.technical.status, "confirmed");
  assert.equal(report.dimensionByKey.evidence.status, "inferred");
  assert.equal(report.hasStrongManualTechnicalSupport, true);
  assert.ok(
    report.manualTrustedSignals.some((signal) =>
      signal.includes(
        "Technical / molecular fields were manually verified"
      )
    )
  );
});

test("material CAS comparison treats multi-CAS ordering and mixture intentionally", () => {
  assert.equal(
    compareMaterialCasSupportValues(
      "8007-75-8 ; 89957-91-5",
      "89957-91-5;8007-75-8"
    ),
    true
  );
  assert.equal(compareMaterialCasSupportValues("Mixture", "mixture"), true);
  assert.equal(
    formatMaterialCasSupportValue("89957-91-5; 8007-75-8"),
    "8007-75-8 ; 89957-91-5"
  );
});

test("visible descriptor text suppresses stale FCF copy when the current visible record is non-FCF", () => {
  const correctedDescriptor = deriveVisibleMaterialDescriptorText({
    recordName: "Bergamot EO FCF",
    record: {
      displayName: "Bergamot EO",
      scentSummary: "Fresh, zesty bergamot - FCF safe for skin",
      scentDesc:
        "Bergamot FCF (furocoumarin-free) — the benchmark citrus opening note.",
      char: "Fresh bergamot peel with floral-green lift.",
    },
    fallbackSummary: "Supplier-confirmed regular bergamot peel.",
    fallbackDescription: "Regular bergamot essential oil confirmed from current suppliers.",
  });

  assert.equal(
    correctedDescriptor.summary,
    "Supplier-confirmed regular bergamot peel."
  );
  assert.equal(
    correctedDescriptor.description,
    "Regular bergamot essential oil confirmed from current suppliers."
  );
  assert.equal(correctedDescriptor.suppressedStaleSummary, true);
  assert.equal(correctedDescriptor.suppressedStaleDescription, true);

  const fcfDescriptor = deriveVisibleMaterialDescriptorText({
    recordName: "Bergamot EO FCF",
    record: {
      displayName: "Bergamot EO FCF",
      scentSummary: "Fresh, zesty bergamot - FCF safe for skin",
      scentDesc:
        "Bergamot FCF (furocoumarin-free) — the benchmark citrus opening note.",
    },
  });

  assert.equal(fcfDescriptor.summary, "Fresh, zesty bergamot - FCF safe for skin");
  assert.equal(
    fcfDescriptor.description,
    "Bergamot FCF (furocoumarin-free) — the benchmark citrus opening note."
  );
  assert.equal(fcfDescriptor.suppressedStaleSummary, false);
  assert.equal(fcfDescriptor.suppressedStaleDescription, false);
});

test("material behavior signals distinguish low VP from low perceived impact caveats", () => {
  const signals = buildMaterialBehaviorSignals("Oceanol", {
    db: {
      Oceanol: {
        MW: 182,
        VP: 0.000051,
        xLogP: 2.97,
        ODT: null,
        note: "mid",
        descriptorTags: ["Marine", "High Impact Marine", "Low VP Caveat"],
      },
    },
  });

  assert.equal(
    signals.facets.find((facet) => facet.key === "impact").rating,
    "Unknown"
  );
  assert.ok(
    signals.notes.some((note) =>
      note.includes("Low vapor pressure does not automatically mean low perceived impact")
    )
  );
});

test("material behavior signals do not imply odor-threshold certainty when ODT is missing", () => {
  const signals = buildMaterialBehaviorSignals("Trace Marine", {
    db: {
      "Trace Marine": {
        MW: 180,
        VP: 0.0001,
        xLogP: 3,
        ODT: null,
      },
    },
  });

  const impactFacet = signals.facets.find((facet) => facet.key === "impact");
  assert.equal(impactFacet.rating, "Unknown");
  assert.match(impactFacet.detail, /Odor-threshold data is limited/);
});

test("material behavior signals surface legacy ODT, missing ODT, and mixture caveats", () => {
  const geosminSignals = buildMaterialBehaviorSignals("Geosmin", {
    db: {
      Geosmin: {
        MW: 182.31,
        VP: 0.001,
        ODT: 0.00001,
        xLogP: 3.3,
        descriptorTags: ["Earthy", "High Impact Earthy", "Legacy ODT Caveat"],
      },
    },
  });
  assert.ok(
    geosminSignals.notes.some((note) =>
      note.includes("legacy or insufficiently sourced")
    )
  );

  const aldehydeSignals = buildMaterialBehaviorSignals("Aldehyde C-8", {
    db: {
      "Aldehyde C-8": {
        MW: 128.21,
        VP: 1.18,
        ODT: null,
        descriptorTags: ["Aldehydic", "High Impact Aldehydic", "ODT Needed"],
      },
    },
  });
  assert.equal(
    aldehydeSignals.facets.find((facet) => facet.key === "impact").rating,
    "Unknown"
  );
  assert.ok(
    aldehydeSignals.notes.some((note) =>
      note.includes("qualitative decision support")
    )
  );
  assert.ok(
    aldehydeSignals.notes.some((note) =>
      note.includes("ODT is still needed")
    )
  );

  const seaweedSignals = buildMaterialBehaviorSignals("Seaweed Absolute", {
    db: {
      "Seaweed Absolute": {
        VP: 0.02,
        ODT: 0.1,
        type: "ABS",
        descriptorTags: ["Marine", "Natural / Absolute", "Mixture Proxy Caveat"],
      },
    },
  });
  assert.ok(
    seaweedSignals.notes.some((note) =>
      note.includes("proxy-level support")
    )
  );
});

test("ingredient truth completeness keeps explicit manual conflicts cautious", () => {
  const report = buildIngredientTruthCompletenessReport("QA Manual Identity Conflict", {
    record: {
      cas: "123-45-6",
      inci: "Manual Identity Ingredient",
      type: "SYNTH",
      note: "mid",
      manualIdentityEdited: true,
      activeConflictFieldKeys: ["cas"],
    },
    livePricing: {},
  });

  assert.equal(report.dimensionByKey.identity.status, "uncertain");
  assert.equal(report.dimensionByKey.regulatory.status, "uncertain");
  assert.equal(report.hasActiveManualConflict, true);
  assert.ok(
    report.uncertainSignals.some((signal) =>
      signal.includes("explicit active conflict")
    )
  );
});

test("ingredient truth completeness keeps manual trusted support strong even without formal evidence review", () => {
  const report = buildIngredientTruthCompletenessReport(
    "QA Manual Trusted Bergamot",
    {
      record: {
        supplier: "Manual Supplier",
        cas: "8007-75-8",
        inci: "Citrus Aurantium Bergamia Peel Oil",
        type: "EO",
        note: "top",
        rep: "Linalyl acetate",
        scentClass: "citrus",
        scentSummary: "Fresh bergamot peel.",
        descriptorTags: ["citrus", "fresh"],
        manualIdentityEdited: true,
        manualSupplierEdited: true,
        manualTechnicalEdited: true,
        MW: 156.2,
        xLogP: 3.2,
        VP: 0.01,
        ODT: 10,
        TPSA: 21,
        odorThreshold_ngL: 2,
      },
      livePricing: {
        "Manual Supplier": {
          url: "https://example.com/bergamot-eo",
          sdsUrl: "https://example.com/bergamot-eo/sds.pdf",
          ifraPercent: "0.4",
          price: 12.5,
          S: [[10, "g", 12.5]],
        },
      },
    }
  );

  const trustSummary = buildFounderTrustSummary({
    basket: {
      lines: [{ ingredientName: "QA Manual Trusted Bergamot", mappingConfidence: "confirmed" }],
      missingCount: 0,
      uncertainCount: 0,
    },
    launchReadiness: {
      pricing: { missingCount: 0, uncertainCount: 0 },
      compliance: { finishedProductStatus: "appears_compliant" },
      blockers: [],
      cautions: [],
    },
    expectedLineCount: 1,
    extraTrustCounts: report.ingredientTrustCounts,
    extraMissingSignals: report.missingSignals,
    extraUncertainSignals: report.uncertainSignals,
  });

  assert.equal(report.level, "strong");
  assert.equal(report.dimensionByKey.evidence.status, "inferred");
  assert.equal(report.dimensionByKey.ifra.status, "confirmed");
  assert.equal(report.hasAnyStrongManualSupport, true);
  assert.ok(
    report.manualTrustedSignals.some((signal) =>
      signal.includes("Formal evidence review is not attached yet")
    )
  );
  assert.ok(
    report.uncertainSignals.every(
      (signal) =>
        !signal.includes("Source-document and evidence-candidate support is still light")
    )
  );
  assert.equal(trustSummary.level, "supported");
});

test("bench stock effective active percent compounds parent activity with stock dilution", () => {
  assert.equal(
    buildBenchStockEffectiveActivePercent({
      dilutionPercent: 10,
      parentEffectiveActivePercent: 100,
    }),
    10
  );
  assert.equal(
    buildBenchStockEffectiveActivePercent({
      dilutionPercent: 10,
      parentEffectiveActivePercent: 50,
    }),
    5
  );
  assert.equal(
    buildBenchStockEffectiveActivePercent({
      dilutionPercent: 10.24,
      parentEffectiveActivePercent: 100,
    }),
    10.24
  );
  assert.equal(
    buildBenchStockEffectiveActivePercent({
      dilutionPercent: 50,
      parentEffectiveActivePercent: 100,
    }),
    50
  );
});

test("bench stock duplicate draft preserves parent/carrier while creating a new variant draft", () => {
  const originalStock = {
    id: "ylang-10-tec",
    stockName: "Ylang Ylang Complete — 10.00% in TEC",
    parentMaterialName: "Ylang Ylang Complete",
    supplierName: "Fraterworks",
    carrierName: "TEC",
    dilutionPercent: 10,
    parentEffectiveActivePercent: 100,
    gramsOnHand: 18,
    notes: "Bench working stock",
  };

  const duplicateDraft = buildBenchStockDuplicateDraft(originalStock, {
    dilutionPercent: 5,
  });

  assert.equal(duplicateDraft.id, null);
  assert.equal(duplicateDraft.duplicateSourceId, "ylang-10-tec");
  assert.equal(duplicateDraft.parentMaterialName, "Ylang Ylang Complete");
  assert.equal(duplicateDraft.supplierName, "Fraterworks");
  assert.equal(duplicateDraft.carrierName, "TEC");
  assert.equal(duplicateDraft.dilutionPercent, "5.00");
  assert.equal(duplicateDraft.parentEffectiveActivePercent, "100.00");
  assert.equal(duplicateDraft.gramsOnHand, "");
  assert.equal(duplicateDraft.notes, "Bench working stock");
  assert.equal(originalStock.dilutionPercent, 10);
  assert.equal(
    buildBenchStockEffectiveActivePercent({
      dilutionPercent: duplicateDraft.dilutionPercent,
      parentEffectiveActivePercent: duplicateDraft.parentEffectiveActivePercent,
    }),
    5
  );
});

test("vapor pressure formatter keeps UI values readable without scientific notation", () => {
  assert.equal(formatVaporPressureNumber(0.03000246730816679), "0.03");
  assert.equal(formatVaporPressureNumber(0.217518), "0.2175");
  assert.equal(formatVaporPressureNumber(2.25e-7), "0.000000225");
});

test("bench stock runtime summary computes stock, active, and carrier grams correctly", () => {
  const runtime = buildBenchStockRuntimeSummary(
    [
      {
        name: "Ylang Ylang Complete",
        g: 0.8,
        note: "mid",
        benchStockId: "ylang-10-tec",
      },
      {
        name: "Frangipani Absolute",
        g: 0.5,
        note: "mid",
        benchStockId: "frangipani-10-24-tec",
      },
      {
        name: "Pre-Diluted Parent",
        g: 1,
        note: "base",
        benchStockId: "prediluted-parent-10-tec",
      },
    ],
    {
      benchStocksById: {
        "ylang-10-tec": {
          id: "ylang-10-tec",
          stockName: "Ylang Ylang Complete — 10.00% in TEC",
          parentMaterialName: "Ylang Ylang Complete",
          carrierName: "TEC",
          dilutionPercent: 10,
          parentEffectiveActivePercent: 100,
          gramsOnHand: 25,
        },
        "frangipani-10-24-tec": {
          id: "frangipani-10-24-tec",
          stockName: "Frangipani Absolute — 10.24% in TEC",
          parentMaterialName: "Frangipani Absolute",
          carrierName: "TEC",
          dilutionPercent: 10.24,
          parentEffectiveActivePercent: 100,
          gramsOnHand: 12,
        },
        "prediluted-parent-10-tec": {
          id: "prediluted-parent-10-tec",
          stockName: "Pre-Diluted Parent — 10.00% in TEC",
          parentMaterialName: "Pre-Diluted Parent",
          carrierName: "TEC",
          dilutionPercent: 10,
          parentEffectiveActivePercent: 50,
          gramsOnHand: 10,
        },
      },
      db: {
        "Ylang Ylang Complete": { note: "mid", type: "EO" },
        "Frangipani Absolute": { note: "mid", type: "ABS" },
        "Pre-Diluted Parent": {
          note: "base",
          type: "SYNTH",
          dilutionFactor: 0.5,
        },
        TEC: { note: "carrier", type: "CARRIER" },
      },
    }
  );

  assert.equal(runtime.rows[0].activeGrams, 0.08);
  assert.equal(runtime.rows[0].carrierGrams, 0.72);
  assert.equal(runtime.rows[1].activeGrams, 0.0512);
  assert.equal(runtime.rows[1].carrierGrams, 0.4488);
  assert.equal(runtime.rows[2].effectiveActivePercent, 5);
  assert.equal(runtime.rows[2].activeGrams, 0.05);
  assert.equal(runtime.rows[2].carrierGrams, 0.95);
  assert.equal(runtime.totals.totalStockGrams, 2.3);
  assert.ok(Math.abs(runtime.totals.totalActiveGrams - 0.1812) < 1e-9);
  assert.ok(Math.abs(runtime.totals.totalBenchCarrierGrams - 2.1188) < 1e-9);
});

test("diluted formula line gram helper computes carrier for common working-stock strengths", () => {
  assert.deepEqual(
    computeDilutedFormulaLineGrams({ stockGrams: 0.8, dilutionPercent: 25 }),
    {
      stockGrams: 0.8,
      activeGrams: 0.2,
      carrierGrams: 0.6,
      dilutionFactor: 0.25,
      isDiluted: true,
    }
  );
  assert.deepEqual(
    computeDilutedFormulaLineGrams({ stockGrams: 0.25, dilutionFactor: 0.2 }),
    {
      stockGrams: 0.25,
      activeGrams: 0.05,
      carrierGrams: 0.2,
      dilutionFactor: 0.2,
      isDiluted: true,
    }
  );
  assert.equal(
    computeDilutedFormulaLineGrams({ stockGrams: 0.4, dilutionPercent: 10 })
      .carrierGrams,
    0.36
  );
  assert.equal(
    computeDilutedFormulaLineGrams({ stockGrams: 0.5, dilutionFactor: 0.5 })
      .carrierGrams,
    0.25
  );
});

test("diluted formula line gram helper keeps neat and malformed dilution rows safe", () => {
  assert.deepEqual(
    computeDilutedFormulaLineGrams({ stockGrams: 1.2, dilutionPercent: 100 }),
    {
      stockGrams: 1.2,
      activeGrams: 1.2,
      carrierGrams: 0,
      dilutionFactor: null,
      isDiluted: false,
    }
  );
  assert.deepEqual(
    computeDilutedFormulaLineGrams({ stockGrams: 1.2, dilutionPercent: "nope" }),
    {
      stockGrams: 1.2,
      activeGrams: 1.2,
      carrierGrams: 0,
      dilutionFactor: null,
      isDiluted: false,
    }
  );
});

test("runtime summary displays carrier grams for diluted catalog rows without changing totals", () => {
  const runtime = buildBenchStockRuntimeSummary(
    [
      { name: "Material 25%", g: 0.8, note: "mid" },
      { name: "Material 20%", g: 0.25, note: "mid" },
      { name: "Material 10%", g: 0.4, note: "mid" },
      { name: "Material 50%", g: 0.5, note: "base" },
      { name: "Neat Material", g: 1, note: "base" },
      { name: "Malformed Dilution", g: 0.3, note: "mid" },
    ],
    {
      db: {
        "Material 25%": { note: "mid", type: "SYNTH", dilutionPercent: 25 },
        "Material 20%": { note: "mid", type: "SYNTH", dilutionFactor: 0.2 },
        "Material 10%": { note: "mid", type: "SYNTH", dilutionFactor: 0.1 },
        "Material 50%": { note: "base", type: "SYNTH", dilutionFactor: 0.5 },
        "Neat Material": { note: "base", type: "SYNTH" },
        "Malformed Dilution": {
          note: "mid",
          type: "SYNTH",
          dilutionFactor: "bad",
        },
      },
    }
  );

  assert.equal(runtime.rows[0].carrierGrams, 0.6);
  assert.equal(runtime.rows[1].carrierGrams, 0.2);
  assert.equal(runtime.rows[2].carrierGrams, 0.36);
  assert.equal(runtime.rows[3].carrierGrams, 0.25);
  assert.equal(runtime.rows[4].carrierGrams, 0);
  assert.equal(runtime.rows[5].carrierGrams, 0);
  assert.equal(runtime.totals.totalStockGrams, 3.25);
});

test("bench stock IFRA calculations respect active grams instead of raw stock grams", () => {
  assert.equal(
    computeActiveRestrictedPercent({
      formulaPercent: 8,
      ingredientName: "Bench Stock Parent",
      activePercentOverride: 10,
    }),
    0.8
  );
});

test("loose numeric and vapor-pressure parsing handle messy supplier-style inputs", () => {
  assert.equal(normalizeLooseNumericInput(".04"), 0.04);
  assert.equal(normalizeLooseNumericInput("0.04 hPa"), 0.04);

  const singleObservation = parseVaporPressureInput("0.005516 mm Hg @ 23° C");
  assert.equal(singleObservation.normalizedRaw, "0.005516 mmHg @ 23°C");
  assert.equal(singleObservation.parsedObservationCount, 1);
  assert.ok(
    Math.abs((singleObservation.legacyModelValueMmHg || 0) - 0.005516) < 1e-9
  );

  const comparatorObservation = parseVaporPressureInput("< 0,01 hPa");
  assert.equal(comparatorObservation.normalizedRaw, "< 0.01 hPa");
  assert.equal(comparatorObservation.observations[0].comparator, "<");
  assert.ok(
    Math.abs((comparatorObservation.observations[0].valueHpa || 0) - 0.01) <
      1e-9
  );

  const multiObservation = parseVaporPressureInput(
    "1 mbar(20 °C)| 2 mbar (50 °C)"
  );
  assert.equal(multiObservation.parsedObservationCount, 2);
  assert.equal(multiObservation.observations[0].temperatureC, 20);
  assert.equal(multiObservation.observations[1].temperatureC, 50);

  const display = buildVaporPressureDisplay({
    VP: multiObservation.legacyModelValueMmHg,
    vaporPressureRaw: multiObservation.normalizedRaw,
    vaporPressureObservations: multiObservation.observations,
  });
  assert.equal(display.summary, "2 VP observations");
  assert.deepEqual(display.detailLines, ["1 mbar @ 20°C", "2 mbar @ 50°C"]);
});

test("ingredient truth completeness treats manual IFRA supplier support as strong when no conflict is active", () => {
  const report = buildIngredientTruthCompletenessReport("QA Manual IFRA", {
    record: {
      manualSupplierEdited: true,
      note: "mid",
      type: "SYNTH",
    },
    livePricing: {
      "Trusted Supplier": {
        ifraPercent: "30.00%",
      },
    },
  });

  assert.equal(report.dimensionByKey.ifra.status, "confirmed");
  assert.equal(report.hasStrongManualIfraSupport, true);
  assert.ok(
    report.manualTrustedSignals.some((signal) =>
      signal.includes("Supplier-page facts were manually verified")
    )
  );
});

test("ingredient truth completeness exposes specific drilldown details for weak technical and evidence support", () => {
  const report = buildIngredientTruthCompletenessReport("QA Drilldown Material", {
    record: {
      type: "SYNTH",
      note: "mid",
      scentSummary: "Powdery floral material.",
      MW: 218.3,
    },
    livePricing: {},
  });

  assert.ok(
    report.dimensionDetailByKey.technical.detailLines.some((line) =>
      line.includes("Missing technical fields:")
    )
  );
  assert.ok(
    report.dimensionDetailByKey.technical.detailLines.some((line) =>
      line.includes("xLogP")
    )
  );
  assert.ok(
    report.dimensionDetailByKey.ifra.detailLines.some((line) =>
      line.includes("No supplier or helper IFRA support")
    )
  );
  assert.ok(
    report.dimensionDetailByKey.evidence.detailLines.some((line) =>
      line.includes("No source documents are attached")
    )
  );
  assert.ok(
    report.dimensionDetailByKey.evidence.improveLines[0].includes(
      "Attach SDS or source documents"
    )
  );
});

test("substitution suggestions avoid unrelated carriers and broad accord mismatches", () => {
  const suggestions = buildMaterialSubstitutionSuggestions(
    "Methyl Ionone Gamma Coeur",
    {
      db: {
        "Methyl Ionone Gamma Coeur": {
          note: "base",
          type: "SYNTH",
          scentClass: "violet",
          scentSummary: "Powdery violet-woody ionone profile.",
          rep: "Ionone",
          xLogP: 4.3,
          VP: 0.02,
        },
        "Gamma Methyl Ionone": {
          note: "base",
          type: "SYNTH",
          scentClass: "violet",
          scentSummary: "Powdery violet-woody ionone profile.",
          rep: "Ionone",
          xLogP: 4.1,
          VP: 0.018,
        },
        DPG: {
          note: "carrier",
          type: "CARRIER",
          scentClass: "carrier",
          scentSummary: "Odorless solvent.",
          xLogP: -0.4,
          VP: 0.004,
        },
        "Vanilla Bourbon Absolute": {
          note: "base",
          type: "ABS",
          scentClass: "gourmand",
          scentSummary: "Sweet vanilla absolute.",
          rep: "Vanillin",
          xLogP: 5.5,
          VP: 0.0001,
        },
        "Woody Accord Base": {
          note: "base",
          type: "ACCORD",
          scentClass: "woody",
          scentSummary: "General woody accord base.",
          rep: "Woody accord",
          xLogP: 4.8,
          VP: 0.008,
        },
        "Rum Absolute": {
          note: "base",
          type: "ABS",
          scentClass: "gourmand",
          scentSummary: "Boozy rum absolute with dark sweetness.",
          rep: "Rum absolute",
          xLogP: 5.1,
          VP: 0.0002,
        },
        "Oud Supreme": {
          note: "base",
          type: "EO",
          scentClass: "woody",
          scentSummary: "Dense oud-amber natural.",
          rep: "Oud",
          xLogP: 5.8,
          VP: 0.00005,
        },
      },
    }
  );

  const candidateNames = Object.values(suggestions.categories)
    .flat()
    .map((candidate) => candidate.name);

  assert.ok(candidateNames.includes("Gamma Methyl Ionone"));
  assert.equal(candidateNames.includes("DPG"), false);
  assert.equal(candidateNames.includes("Vanilla Bourbon Absolute"), false);
  assert.equal(candidateNames.includes("Woody Accord Base"), false);
  assert.equal(candidateNames.includes("Rum Absolute"), false);
  assert.equal(candidateNames.includes("Oud Supreme"), false);
  assert.equal(suggestions.advisoryMessage, null);
});

test("substitution suggestions suppress Botanical Musk Accord components already represented by recipe", () => {
  const suggestions = buildMaterialSubstitutionSuggestions(
    "Botanical Musk Accord",
    {
      formulaItems: [{ name: "Botanical Musk Accord", g: 1.3, note: "base" }],
      db: {
        "Botanical Musk Accord": {
          note: "base",
          type: "ACCORD",
          scentClass: "Musk",
          scentSummary: "Soft botanical macrocyclic musk accord.",
          rep: "musk",
          descriptorTags: ["Musk", "Botanical"],
          xLogP: 5,
          VP: 0.0002,
        },
        Habanolide: {
          note: "base",
          type: "SYNTH",
          scentClass: "Musk",
          scentSummary: "Soft macrocyclic musk.",
          rep: "musk",
          descriptorTags: ["Musk", "Botanical"],
          xLogP: 5.3,
          VP: 0.0001,
        },
        "Clean Musk Accord": {
          note: "base",
          type: "ACCORD",
          scentClass: "Musk",
          scentSummary: "Soft macrocyclic musk accord.",
          rep: "musk",
          descriptorTags: ["Musk"],
          xLogP: 5.1,
          VP: 0.00012,
        },
      },
    }
  );

  const candidateNames = Object.values(suggestions.categories).flat().map(
    (candidate) => candidate.name
  );
  assert.equal(candidateNames.includes("Habanolide"), false);
  assert.ok(candidateNames.includes("Clean Musk Accord"));
  assert.ok(suggestions.accordRepresentation.suppressedCandidateCount > 0);
  assert.match(suggestions.advisoryMessage, /known accord component/i);
});

test("substitution suggestions suppress Driftwood Accord components already represented by recipe", () => {
  const suggestions = buildMaterialSubstitutionSuggestions("Driftwood Accord", {
    formulaItems: [{ name: "Driftwood Accord", g: 0.6, note: "base" }],
    db: {
      "Driftwood Accord": {
        note: "base",
        type: "ACCORD",
        scentClass: "Woody",
        scentSummary: "Transparent woody amber accord.",
        rep: "woody amber",
        descriptorTags: ["Woody", "Amber"],
        xLogP: 4.8,
        VP: 0.001,
      },
      "Iso E Super": {
        note: "base",
        type: "SYNTH",
        scentClass: "Woody",
        scentSummary: "Transparent woody amber diffusion.",
        rep: "woody amber",
        descriptorTags: ["Woody", "Amber"],
        xLogP: 4.7,
        VP: 0.0011,
      },
      "Dry Woods Accord": {
        note: "base",
        type: "ACCORD",
        scentClass: "Woody",
        scentSummary: "Transparent woody amber accord.",
        rep: "woody amber",
        descriptorTags: ["Woody", "Amber"],
        xLogP: 4.9,
        VP: 0.001,
      },
    },
  });

  const candidateNames = Object.values(suggestions.categories).flat().map(
    (candidate) => candidate.name
  );
  assert.equal(candidateNames.includes("Iso E Super"), false);
  assert.ok(candidateNames.includes("Dry Woods Accord"));
  assert.ok(suggestions.accordRepresentation.suppressedCandidateCount > 0);
});

test("substitution suggestions keep unknown accords safe without recipe suppression", () => {
  const suggestions = buildMaterialSubstitutionSuggestions("Unknown Accord", {
    formulaItems: [{ name: "Unknown Accord", g: 0.4, note: "base" }],
    db: {
      "Unknown Accord": {
        note: "base",
        type: "ACCORD",
        scentClass: "Woody",
        scentSummary: "Transparent woody accord.",
        rep: "woody",
        descriptorTags: ["Woody"],
        xLogP: 4,
        VP: 0.001,
      },
      "Iso E Super": {
        note: "base",
        type: "SYNTH",
        scentClass: "Woody",
        scentSummary: "Transparent woody diffusion.",
        rep: "woody",
        descriptorTags: ["Woody"],
        xLogP: 4.2,
        VP: 0.001,
      },
    },
  });

  assert.equal(suggestions.accordRepresentation.suppressedCandidateCount, 0);
  assert.equal(suggestions.accordRepresentation.accordRows.length, 0);
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

test("launch readiness surfaces component-costed accord caveats without changing basket missing counts", () => {
  const summary = buildLaunchReadinessSummary({
    formula: {
      ingredients: [{ name: "Driftwood Accord", note: "base", g: 1 }],
      versionLabel: "Test",
    },
    basket: {
      lines: [
        {
          ingredientName: "Driftwood Accord",
          supplier: "Bench Accord",
          status: "inferred",
          lineCost: 0.42,
          linkStatus: "component_derived_accord",
          costingMode: "component_derived",
        },
      ],
      missingCount: 0,
      uncertainCount: 0,
      supplierCount: 1,
      totalCost: 0,
    },
    batchReport: {
      canFulfill: true,
      coveragePercent: 100,
      shortageCount: 0,
      shortageTotalG: 0,
      maxProducibleG: 100,
    },
    ifraRows: [],
    finishedProductGuidance: {
      overallStatus: "appears_compliant",
    },
    performanceModel: {
      axisScores: {},
      headline: "Model available.",
    },
    modelConfidenceSummary: {
      categoryCounts: {
        black_box_accord: 1,
        missing_pricing: 0,
      },
    },
    targetBatchG: 100,
  });

  assert.ok(
    summary.cautions.some((caution) =>
      caution.includes("Component-costed accord")
    )
  );
  assert.ok(
    summary.cautions.every((caution) => !caution.includes("unresolved or unpriced"))
  );
  assert.equal(summary.pricing.missingCount, 0);
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
        dbRecord: {},
        truthReport: {
          name: "Sparse Workhorse",
          primaryGap: "No live priced pack-size options are attached yet.",
          canonicalSource: null,
          sourceDocuments: [],
          livePricingEntries: [],
          dimensionByKey: {
            identity: { status: "confirmed" },
            regulatory: { status: "missing" },
            descriptive: { status: "missing" },
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
  assert.ok(workbench.summary.generatedProposalCount >= 1);
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
  assert.equal(
    workbench.targets[0].generatedProposalRows.find(
      (row) => row.fieldKey === "cas_inci"
    )?.supportStatus,
    "conflicting"
  );
  assert.ok(
    workbench.targets[0].generatedProposalRows.some(
      (row) => row.fieldKey === "pricing"
    )
  );
});

test("material improvement queue surfaces founder-critical and high-spend weak materials", () => {
  const queue = buildMaterialImprovementQueue({
    prioritizationRows: [
      {
        name: "Sparse Workhorse",
        truthLevel: "sparse",
        priorityScore: 88,
        priorityReason: "Used in 5 formulas · 2 pricing gap hits · Sparse truth",
        formulaCount: 5,
        appearanceCount: 5,
        totalLineCost: 24,
        founderCriticalCount: 3,
        nearReadyCount: 2,
        blockedFormulaCount: 1,
        pricingGapCount: 2,
        pricingStatus: "missing",
        primaryGap: "No live priced pack-size options are attached yet.",
      },
      {
        name: "Expensive Partial",
        truthLevel: "partial",
        priorityScore: 62,
        priorityReason: "Used in 2 formulas · ~$96.00 basket spend · Partial truth",
        formulaCount: 2,
        appearanceCount: 2,
        totalLineCost: 96,
        founderCriticalCount: 1,
        nearReadyCount: 1,
        blockedFormulaCount: 0,
        pricingGapCount: 0,
        pricingStatus: "inferred",
        primaryGap:
          "Supplier variants exist, but live-priced size options are still missing.",
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
    ],
    intakeTargets: [
      {
        canonicalMaterialKey: "sparse_workhorse",
        relatedCatalogNames: ["Sparse Workhorse"],
        stillMissingFields: ["cas", "inci", "ifraMaterialHint"],
        requestedSourceTypes: ["sds", "tds"],
        notes: ["Prefer trusted SDS before promoting CAS."],
      },
      {
        canonicalMaterialKey: "expensive_partial",
        relatedCatalogNames: ["Expensive Partial"],
        stillMissingFields: ["scentDesc"],
        requestedSourceTypes: ["supplier_pdf"],
        notes: ["Tighten descriptive support before deeper launch reads."],
      },
    ],
    materialContextByName: {
      "Sparse Workhorse": {
        canonicalMaterialKey: "sparse_workhorse",
        supplierVariantCount: 0,
        livePricingSupplierCount: 0,
        livePricingPackCount: 0,
        sourceDocumentCount: 0,
        evidenceCandidateCount: 2,
        supplierProducts: [],
        dbRecord: {},
        truthReport: {
          name: "Sparse Workhorse",
          supportLabel: "25% resolved · 0% confirmed",
          primaryGap: "No live priced pack-size options are attached yet.",
          canonicalSource: null,
          sourceDocuments: [],
          livePricingEntries: [],
          dimensionByKey: {
            identity: { status: "confirmed" },
            regulatory: { status: "missing" },
            descriptive: { status: "missing" },
            supplier: { status: "missing" },
            pricing: { status: "missing" },
            technical: { status: "uncertain" },
            ifra: { status: "uncertain" },
            evidence: { status: "uncertain" },
          },
          uncertainSignals: [
            "Technical behavior support is still sparse (MW / xLogP / VP / ODT / TPSA).",
            "Structured IFRA restriction support is still partial in the current helper path.",
          ],
          missingSignals: [
            "No live supplier pricing or registry-backed supplier variant is attached yet.",
          ],
          normalizationEntry: { entryKind: "supplier_product" },
        },
      },
      "Expensive Partial": {
        canonicalMaterialKey: "expensive_partial",
        supplierVariantCount: 1,
        livePricingSupplierCount: 1,
        livePricingPackCount: 1,
        sourceDocumentCount: 1,
        evidenceCandidateCount: 0,
        supplierProducts: [
          {
            supplierDisplayName: "Supplier A",
            productTitle: "Expensive Partial Material",
          },
        ],
        dbRecord: {
          note: "base",
          type: "ABS",
          MW: 250,
          xLogP: 3.8,
        },
        truthReport: {
          name: "Expensive Partial",
          supportLabel: "63% resolved · 38% confirmed",
          primaryGap:
            "Supplier variants exist, but live-priced size options are still missing.",
          canonicalSource: {
            canonicalName: "Expensive Partial",
            cas: "9000-00-0",
            scentDesc: "Warm balsamic material.",
            note: "base",
            type: "ABS",
          },
          sourceDocuments: [{ sourceType: "supplier_pdf" }],
          livePricingEntries: [["Supplier A", { S: [[100, "g", 55]] }]],
          dimensionByKey: {
            identity: { status: "confirmed" },
            regulatory: { status: "uncertain" },
            descriptive: { status: "inferred" },
            supplier: { status: "confirmed" },
            pricing: { status: "inferred" },
            technical: { status: "inferred" },
            ifra: { status: "uncertain" },
            evidence: { status: "inferred" },
          },
          uncertainSignals: [
            "CAS / INCI support is still partial in the current catalog and canonical records.",
          ],
          missingSignals: [],
          normalizationEntry: { entryKind: "supplier_product" },
        },
      },
    },
  });

  assert.equal(queue.topRows[0].name, "Sparse Workhorse");
  assert.ok(
    queue.buckets.highestSpendWeakMaterials.some(
      (row) => row.name === "Expensive Partial"
    )
  );
  assert.ok(
    queue.buckets.founderCriticalWeakMaterials.some(
      (row) => row.name === "Sparse Workhorse"
    )
  );
  assert.ok(queue.summary.pricingGapMaterialCount >= 1);
});

test("formula-critical data audit ranks weak ingredient truth by likely distortion impact", () => {
  const audit = buildFormulaCriticalDataAudit({
    contextLabel: "QA Formula",
    contextKind: "formula",
    items: [
      { name: "Sparse Workhorse", g: 18, note: "top" },
      { name: "Well Supported Material", g: 42, note: "base" },
    ],
    basket: {
      totalCost: 60,
      lines: [
        {
          ingredientName: "Sparse Workhorse",
          lineCost: 42,
          status: "missing",
          mappingConfidence: "missing",
        },
        {
          ingredientName: "Well Supported Material",
          lineCost: 18,
          status: "confirmed",
          mappingConfidence: "confirmed",
        },
      ],
    },
    evidenceCandidates: [
      {
        evidenceCandidateKey: "sparse-workhorse:cas:a",
        canonicalMaterialKey: "sparse_workhorse",
        candidateFieldName: "cas",
        candidateValue: "100-00-1",
        confidence: "medium",
        sourceType: "sds",
        supplier: "Supplier A",
        reviewStatus: "pending_review",
      },
      {
        evidenceCandidateKey: "sparse-workhorse:cas:b",
        canonicalMaterialKey: "sparse_workhorse",
        candidateFieldName: "cas",
        candidateValue: "100-00-2",
        confidence: "low",
        sourceType: "supplier_pdf",
        supplier: "Supplier B",
        reviewStatus: "pending_review",
      },
    ],
    intakeTargets: [
      {
        canonicalMaterialKey: "sparse_workhorse",
        relatedCatalogNames: ["Sparse Workhorse"],
        stillMissingFields: ["cas", "inci", "ifraMaterialHint"],
        requestedSourceTypes: ["sds", "tds"],
      },
    ],
    materialContextByName: {
      "Sparse Workhorse": {
        dbRecord: {
          note: "top",
          type: "EO",
        },
        canonicalMaterialKey: "sparse_workhorse",
        supplierVariantCount: 0,
        livePricingSupplierCount: 0,
        livePricingPackCount: 0,
        sourceDocumentCount: 0,
        evidenceCandidateCount: 2,
        supplierProducts: [],
        truthReport: {
          name: "Sparse Workhorse",
          level: "sparse",
          supportLabel: "25% resolved · 0% confirmed",
          breakdownLabel: "Sparse truth",
          primaryGap: "No live priced pack-size options are attached yet.",
          canonicalMaterialKey: "sparse_workhorse",
          canonicalSource: null,
          sourceDocuments: [],
          livePricingEntries: [],
          dimensionByKey: {
            identity: { status: "confirmed" },
            regulatory: { status: "missing" },
            descriptive: { status: "missing" },
            supplier: { status: "missing" },
            pricing: { status: "missing" },
            technical: { status: "uncertain" },
            ifra: { status: "uncertain" },
            evidence: { status: "uncertain" },
          },
          uncertainSignals: [
            "Technical behavior support is still sparse (MW / xLogP / VP / ODT / TPSA).",
            "Structured IFRA restriction support is still partial in the current helper path.",
          ],
          missingSignals: [
            "No live supplier pricing or registry-backed supplier variant is attached yet.",
          ],
          normalizationEntry: { entryKind: "supplier_product" },
        },
      },
      "Well Supported Material": {
        dbRecord: {
          note: "base",
          type: "ABS",
          MW: 250,
          xLogP: 3.8,
          VP: 0.1,
          ODT: 5,
        },
        canonicalMaterialKey: "well_supported_material",
        supplierVariantCount: 1,
        livePricingSupplierCount: 1,
        livePricingPackCount: 1,
        sourceDocumentCount: 1,
        evidenceCandidateCount: 0,
        supplierProducts: [],
        truthReport: {
          name: "Well Supported Material",
          level: "strong",
          supportLabel: "88% resolved · 75% confirmed",
          breakdownLabel: "Strong truth",
          primaryGap: null,
          canonicalMaterialKey: "well_supported_material",
          canonicalSource: {
            canonicalName: "Well Supported Material",
          },
          sourceDocuments: [{ sourceType: "tds" }],
          livePricingEntries: [["Supplier A", { S: [[100, "g", 18]] }]],
          dimensionByKey: {
            identity: { status: "confirmed" },
            regulatory: { status: "confirmed" },
            descriptive: { status: "confirmed" },
            supplier: { status: "confirmed" },
            pricing: { status: "confirmed" },
            technical: { status: "confirmed" },
            ifra: { status: "confirmed" },
            evidence: { status: "confirmed" },
          },
          uncertainSignals: [],
          missingSignals: [],
          normalizationEntry: { entryKind: "supplier_product" },
        },
      },
    },
    critiqueReport: {
      uncertainty: ["Structured critique is estimate-only while ingredient truth stays sparse."],
    },
    performanceModel: {
      caveats: ["Projection math is rougher when technical support is sparse."],
    },
    finishedProductGuidance: {
      overallStatus: "warning_with_missing",
    },
  });

  assert.equal(audit.summary.weakMaterialCount, 1);
  assert.equal(audit.rows[0].name, "Sparse Workhorse");
  assert.ok(audit.rows[0].distortionTags.includes("Critique"));
  assert.ok(audit.rows[0].distortionTags.includes("Performance"));
  assert.ok(audit.rows[0].distortionTags.includes("Compliance"));
  assert.ok(audit.rows[0].distortionTags.includes("Cost"));
  assert.ok(
    ["pricing_distortion", "conflicting_staged_truth"].includes(
      audit.rows[0].issueTypeKey
    )
  );
  assert.ok(audit.rows[0].whyItMatters.includes("formula"));
  assert.ok(audit.guardrail.toLowerCase().includes("directional"));
  assert.equal(audit.summary.topPriorityMaterialName, "Sparse Workhorse");
});

test("manual formula review candidate builders keep missing-material intake and corrections review-first", () => {
  const correctionCandidate = buildFormulaFieldCorrectionReviewCandidate({
    materialName: "Bergamot EO FCF",
    canonicalMaterialKey: "bergamot_eo_fcf",
    relatedCatalogNames: ["Bergamot EO FCF"],
    fieldKey: "ifraMaterialHint",
    proposedValue: "Review Cat 4 restriction support against trusted supplier SDS.",
    confidence: "high",
    contextLabel: "QA Formula",
    sourceNote: "Trusted supplier SDS reviewed manually.",
  });

  assert.equal(correctionCandidate.materialName, "Bergamot EO FCF");
  assert.equal(correctionCandidate.candidateFieldName, "ifraMaterialHint");
  assert.equal(correctionCandidate.applyPath, "manual_review");
  assert.equal(
    correctionCandidate.applyPathClassification,
    "manual_review_only"
  );
  assert.equal(correctionCandidate.confidenceLabel, "High");
  assert.match(correctionCandidate.sourceSummary, /QA Formula/);

  const missingMaterialCandidates = buildFormulaMissingMaterialReviewCandidates({
    materialName: "Algenone",
    supplierSourceNote: "Owned bottle on hand",
    cas: "123-45-6",
    inci: "Algenone Extract",
    note: "mid",
    materialType: "SYNTH",
    scentSummary: "Marine ambergris-style material.",
    technicalNotes: "MW still needs source-backed confirmation.",
    confidence: "medium",
    contextLabel: "Current Build",
    createdAt: "2026-03-19T12:00:00.000Z",
  });

  assert.ok(missingMaterialCandidates.length >= 3);
  assert.equal(
    missingMaterialCandidates[0].candidateFieldName,
    "missing_material_intake"
  );
  assert.ok(
    missingMaterialCandidates.every(
      (candidate) => candidate.applyPath === "manual_review"
    )
  );
  assert.ok(
    missingMaterialCandidates.every((candidate) =>
      candidate.sourceOrigin.includes("formula_critical_missing_material")
    )
  );
  assert.ok(
    missingMaterialCandidates.some(
      (candidate) => candidate.candidateFieldName === "cas"
    )
  );
  assert.ok(
    missingMaterialCandidates.some(
      (candidate) => candidate.candidateFieldName === "technical_support"
    )
  );
});

test("supplier adapter parses trusted pack rows and auto-applies safe known Fraterworks facts", () => {
  const parsed = parseSupplierAdapterPackLines("15 g 12.5\n30 g 22.0");
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.pricePoints, [
    [15, "g", 12.5, null],
    [30, "g", 22, null],
  ]);

  const result = buildFraterworksSupplierAdapterResult({
    supplierProductKey: "fraterworks:ylang-ylang-extra-oil-comoros",
    productTitle: "Ylang-Ylang Extra Oil, Comoros",
    url: "https://fraterworks.com/products/ylang-ylang-extra-oil-comoros",
    pricePoints: parsed.pricePoints,
    availabilityStatus: "in stock",
    ifraPercent: "",
    registryRecord: {
      supplierKey: "fraterworks",
      productTitle: "Ylang-Ylang Extra Oil, Comoros",
      mappedCatalogName: "Ylang-Ylang Extra Oil, Comoros",
      mappedCanonicalMaterialKey: "ylang_ylang_extra_oil",
    },
    mappedRecord: {
      inci: "Cananga Odorata Flower Oil",
      type: "EO",
      scentSummary: "Diffusive creamy ylang oil",
    },
    ifraRecord: null,
    relatedSupplierProducts: [
      {
        supplierKey: "fraterworks",
        productTitle: "Ylang-Ylang Extra Oil, Comoros",
      },
    ],
  });

  assert.equal(result.trustLane, "auto_apply_safe");
  assert.equal(result.reviewItems.length, 0);
  assert.equal(result.canAutoApplyToPricing, true);
  assert.equal(result.pricingPatch.catalogName, "Ylang-Ylang Extra Oil, Comoros");
  assert.ok(result.autoAppliedFieldKeys.includes("url"));
  assert.ok(result.autoAppliedFieldKeys.includes("pricePoints"));
});

test("local draft ingredient artifacts preserve local/manual status while producing live runtime records", () => {
  const artifacts = buildLocalDraftIngredientArtifacts({
    materialName: "Local Draft Neroli",
    supplierName: "Owned Stock",
    supplierSourceNote: "Manual trusted entry from bottle on hand",
    url: "https://example.com/neroli",
    pricePoints: [[5, "mL", 24, null]],
    availabilityStatus: "limited stock",
    ifraPercent: "0.3%",
    sdsUrl: "https://example.com/neroli/sds",
    inci: "Citrus Aurantium Amara Flower Oil",
    cas: "8016-38-4",
    note: "top",
    materialType: "EO",
    scentSummary: "Fresh floral citrus.",
    scentDescription: "Bright orange blossom top note.",
    technicalNotes: "Manual draft pending canonical reconciliation.",
    MW: "156.2",
    xLogP: "2.1",
    TPSA: "20.5",
    VP: "0.003",
    ODT: "12",
  });

  assert.equal(artifacts.name, "Local Draft Neroli");
  assert.equal(artifacts.localDraftRecord.localOnly, true);
  assert.equal(artifacts.dbRecord.entryKind, "local_draft");
  assert.equal(artifacts.dbRecord.isLocalDraft, true);
  assert.equal(
    artifacts.dbRecord.localDraftStatusLabel,
    "Local Draft / Manual Trusted Entry"
  );
  assert.deepEqual(Object.keys(artifacts.pricingBySupplier), ["Owned Stock"]);
  assert.equal(artifacts.pricingBySupplier["Owned Stock"].S.length, 1);
});

test("supplier adapter auto-captures clean new items while still surfacing canonical conflicts", () => {
  const newItemResult = buildFraterworksSupplierAdapterResult({
    productTitle: "Fraterworks Mystery Base",
    url: "https://fraterworks.com/products/fraterworks-mystery-base",
    pricePoints: [[15, "g", 19.5, null]],
    availabilityStatus: "request",
  });

  assert.equal(newItemResult.trustLane, "auto_apply_safe");
  assert.equal(newItemResult.canAutoApplyToPricing, false);
  assert.equal(newItemResult.reviewItems.length, 0);

  const conflictResult = buildFraterworksSupplierAdapterResult({
    supplierProductKey: "fraterworks:ylang-ylang-extra-oil-comoros",
    productTitle: "Ylang-Ylang Extra Oil, Comoros",
    url: "https://fraterworks.com/products/ylang-ylang-extra-oil-comoros",
    pricePoints: [[15, "g", 12.5, null]],
    availabilityStatus: "in stock",
    ifraPercent: "0.2",
    inci: "Unexpected Different Inci",
    registryRecord: {
      supplierKey: "fraterworks",
      productTitle: "Ylang-Ylang Extra Oil, Comoros",
      mappedCatalogName: "Ylang-Ylang Extra Oil, Comoros",
      mappedCanonicalMaterialKey: "ylang_ylang_extra_oil",
    },
    mappedRecord: {
      inci: "Cananga Odorata Flower Oil",
      type: "EO",
      scentSummary: "Diffusive creamy ylang oil",
    },
    ifraRecord: {
      limits: {
        cat4: 0.8,
      },
    },
    relatedSupplierProducts: [
      {
        supplierKey: "fraterworks",
        productTitle: "Ylang-Ylang Extra Oil, Comoros",
      },
    ],
  });

  assert.equal(conflictResult.trustLane, "manual_review_conflict");
  assert.equal(conflictResult.canAutoApplyToPricing, true);
  assert.ok(
    conflictResult.reviewItems.some(
      (item) => item.issueType === "canonical_conflict_inci"
    )
  );
  assert.ok(
    conflictResult.reviewItems.some(
      (item) => item.issueType === "canonical_conflict_ifra"
    )
  );
});

test("supplier adapter conflict review candidates and export payload preserve review-first separation", () => {
  const result = buildFraterworksSupplierAdapterResult({
    supplierProductKey: "fraterworks:ylang-ylang-extra-oil-comoros",
    productTitle: "Ylang-Ylang Extra Oil, Comoros",
    url: "https://fraterworks.com/products/ylang-ylang-extra-oil-comoros",
    pricePoints: [[15, "g", 12.5, null]],
    availabilityStatus: "in stock",
    inci: "Unexpected Different Inci",
    registryRecord: {
      supplierKey: "fraterworks",
      productTitle: "Ylang-Ylang Extra Oil, Comoros",
      mappedCatalogName: "Ylang-Ylang Extra Oil, Comoros",
      mappedCanonicalMaterialKey: "ylang_ylang_extra_oil",
    },
    mappedRecord: {
      inci: "Cananga Odorata Flower Oil",
      type: "EO",
      scentSummary: "Diffusive creamy ylang oil",
    },
    relatedSupplierProducts: [
      {
        supplierKey: "fraterworks",
        productTitle: "Ylang-Ylang Extra Oil, Comoros",
      },
    ],
  });
  const conflictReviewItem = result.reviewItems.find(
    (item) => item.issueType === "canonical_conflict_inci"
  );
  const conflictCandidate =
    buildSupplierAdapterConflictReviewCandidate(conflictReviewItem);
  const exportPayload = buildSupplierAdapterExportPayload([
    result.supplierLayerRecord,
  ]);

  assert.equal(conflictCandidate.applyPath, "manual_review");
  assert.equal(
    conflictCandidate.applyPathClassification,
    "manual_review_conflict"
  );
  assert.equal(exportPayload.metadata.supplierLayerRecordCount, 1);
  assert.equal(exportPayload.metadata.reviewItemCount, 1);
  assert.equal(exportPayload.summary.manualReviewConflictCount, 1);
});

test("generated proposal promotion builds a staged review candidate with preserved context", () => {
  const promotedCandidate = buildGeneratedProposalReviewCandidate({
    target: {
      name: "Sparse Workhorse",
      canonicalMaterialKey: "sparse_workhorse",
      relatedCatalogNames: ["Sparse Workhorse"],
      conflictSummary: [
        {
          fieldKey: "cas",
          fieldLabel: "CAS",
          values: ["100-00-1", "100-00-2"],
        },
      ],
    },
    proposal: {
      proposalKey: "Sparse Workhorse:cas_inci",
      fieldKey: "cas_inci",
      fieldLabel: "CAS / INCI",
      displayValue: "CAS 100-00-1 · INCI Sparse Workhorse",
      supportStatus: "conflicting",
      supportStatusLabel: "Conflicting",
      reviewLane: "manual_review_only",
      reviewLaneLabel: "Manual-review-only",
      currentWeakness: "Conflicting CAS / INCI support is already surfacing.",
      recommendedAction: "Resolve conflicting CAS / INCI evidence before promotion.",
      sourceSummary: "2 linked source docs",
    },
  });

  assert.equal(
    promotedCandidate.evidenceCandidateKey,
    "generated_proposal:sparse_workhorse_cas_inci"
  );
  assert.equal(promotedCandidate.candidateFieldName, "cas_inci");
  assert.equal(promotedCandidate.confidence, "low");
  assert.equal(promotedCandidate.confidenceLabel, "Conflicting");
  assert.equal(promotedCandidate.applyPath, "manual_review");
  assert.equal(
    promotedCandidate.applyPathClassification,
    "manual_review_only"
  );
  assert.equal(promotedCandidate.sourceOrigin, "generated_proposal");
  assert.match(promotedCandidate.conflictNote, /100-00-1/);
  assert.match(promotedCandidate.sourceContextNote, /generated proposal logic/i);
});

test("material backfill workbench preserves promoted generated-candidate review metadata", () => {
  const promotedCandidate = buildGeneratedProposalReviewCandidate({
    target: {
      name: "Sparse Workhorse",
      canonicalMaterialKey: "sparse_workhorse",
      relatedCatalogNames: ["Sparse Workhorse"],
      conflictSummary: [],
    },
    proposal: {
      proposalKey: "Sparse Workhorse:pricing",
      fieldKey: "pricing",
      fieldLabel: "Pricing",
      displayValue: "Supplier A · 100g $55.00",
      supportStatus: "likely",
      supportStatusLabel: "Likely",
      reviewLane: "manual_review_only",
      reviewLaneLabel: "Manual-review-only",
      currentWeakness: "Pricing coverage is still too weak for stronger founder cost reads.",
      recommendedAction: "Review live price points before treating current basket economics as settled.",
      sourceSummary: "1 supplier priced",
    },
  });

  const workbench = buildMaterialBackfillWorkbench({
    targetNames: ["Sparse Workhorse"],
    prioritizationRows: [
      {
        name: "Sparse Workhorse",
        truthLevel: "partial",
        priorityScore: 44,
      },
    ],
    evidenceCandidates: [
      {
        ...promotedCandidate,
        reviewStatus: "pending_review",
      },
    ],
    intakeTargets: [
      {
        canonicalMaterialKey: "sparse_workhorse",
        relatedCatalogNames: ["Sparse Workhorse"],
        stillMissingFields: ["pricing"],
        requestedSourceTypes: ["sds"],
      },
    ],
    materialContextByName: {
      "Sparse Workhorse": {
        canonicalMaterialKey: "sparse_workhorse",
        supplierVariantCount: 1,
        livePricingSupplierCount: 1,
        livePricingPackCount: 1,
        sourceDocumentCount: 0,
        evidenceCandidateCount: 1,
        supplierProducts: [],
        dbRecord: {},
        truthReport: {
          name: "Sparse Workhorse",
          primaryGap: "Pricing needs review.",
          canonicalSource: null,
          sourceDocuments: [],
          livePricingEntries: [["Supplier A", { S: [[100, "g", 55]] }]],
          dimensionByKey: {
            identity: { status: "confirmed" },
            regulatory: { status: "missing" },
            descriptive: { status: "missing" },
            supplier: { status: "confirmed" },
            pricing: { status: "inferred" },
            technical: { status: "uncertain" },
            ifra: { status: "uncertain" },
            evidence: { status: "uncertain" },
          },
          uncertainSignals: [],
          normalizationEntry: { entryKind: "supplier_product" },
        },
      },
    },
  });

  const stagedCandidate = workbench.targets[0].stagedCandidates[0];

  assert.equal(stagedCandidate.fieldLabel, "Pricing");
  assert.equal(stagedCandidate.applyPath, "manual_review");
  assert.equal(
    stagedCandidate.applyPathClassification,
    "manual_review_only"
  );
  assert.equal(stagedCandidate.confidenceLabel, "Likely");
  assert.equal(stagedCandidate.sourceOrigin, "generated_proposal");
  assert.match(stagedCandidate.sourceContextNote, /generated proposal logic/i);
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
