import test from "node:test";
import assert from "node:assert/strict";

import {
  buildIngredientTruthCompletenessReport,
  compareMaterialCasSupportValues,
  formatMaterialCasSupportValue,
} from "../src/lib/ifra_combined_package.js";
import {
  buildCapitalConstrainedLaunchRecommendation,
  buildFraterworksSupplierAdapterResult,
  buildFormulaCriticalDataAudit,
  buildFormulaFieldCorrectionReviewCandidate,
  buildFormulaMissingMaterialReviewCandidates,
  buildLocalDraftIngredientArtifacts,
  buildMaterialBackfillWorkbench,
  buildSupplierAdapterConflictReviewCandidate,
  buildSupplierAdapterExportPayload,
  buildGeneratedProposalReviewCandidate,
  buildMaterialImprovementQueue,
  buildFounderScenarioInputState,
  buildFounderScenarioShareBrief,
  buildFounderTrustSummary,
  buildLaunchRunPlannerSummary,
  buildMaterialTruthGapPrioritization,
  buildSubstitutionReviewDraftFormula,
  createFounderLaunchScenarioRecord,
  normalizeFounderLaunchScenarioRecord,
  parseSupplierAdapterPackLines,
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
