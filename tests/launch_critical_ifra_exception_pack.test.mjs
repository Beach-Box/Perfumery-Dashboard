import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLaunchCriticalIfraExceptionPack,
  formatLaunchCriticalIfraExceptionPackMarkdown,
} from "../scripts/lib/launch_critical_ifra_exception_pack.mjs";

const FORMULA_NAMES = [
  "Random Concoction - Original",
  "Skin-Air Bridge",
  "Damp Shoreline v1",
  "Damp Shoreline v2",
];

function activeFormula(name, variationNumber, ingredients) {
  return {
    name,
    familyKey: "hero-scent",
    developmentStatus: "active",
    variationRole: variationNumber === 0 ? "original" : "variant",
    variationNumber,
    ingredients,
  };
}

function queueItem(overrides = {}) {
  return {
    id: "item-iso",
    materialName: "Iso E Super",
    sourceIdentityName: "Iso E Super",
    formulasUsedIn: FORMULA_NAMES,
    priority: "high",
    requiredSourceType: "global_ifra_standard_needed",
    status: "needed",
    reviewStatus: "not_started",
    ...overrides,
  };
}

function baseFixture(overrides = {}) {
  const activeFormulas = [
    activeFormula("Random Concoction - Original", 0, [
      { name: "Iso E Super", g: 2 },
      { name: "Calone 1951", g: 0.2 },
      { name: "Vetiveryl Acetate", g: 0.1 },
      { name: "Aldehyde C-8", g: 0.01 },
    ]),
    activeFormula("Skin-Air Bridge", 1, [
      { name: "Iso E Super", g: 2.2 },
      { name: "Calone 1951", g: 0.2 },
      { name: "Vetiveryl Acetate", g: 0.1 },
      { name: "Aldehyde C-8", g: 0.01 },
    ]),
    activeFormula("Damp Shoreline v1", 2, [
      { name: "Iso E Super", g: 2.4 },
      { name: "Calone 1951", g: 0.2 },
      { name: "Vetiveryl Acetate", g: 0.1 },
      { name: "Aldehyde C-8", g: 0.01 },
    ]),
    activeFormula("Damp Shoreline v2", 3, [
      { name: "Iso E Super", g: 2.6 },
      { name: "Calone 1951", g: 0.2 },
      { name: "Clearwood", g: 0.3 },
      { name: "Vetiveryl Acetate", g: 0.1 },
      { name: "Aldehyde C-8", g: 0.01 },
    ]),
  ];
  const longSnippet = `${"Calone 1951 IFRA Category 4 supplier product-page wording. ".repeat(
    20
  )}TAIL_SHOULD_NOT_APPEAR`;
  const sourceQueue = {
    items: [
      queueItem({
        id: "item-iso",
        materialName: "Iso E Super",
        sourceIdentityName: "Iso E Super",
        requiredSourceType: "global_ifra_standard_needed",
      }),
      queueItem({
        id: "item-clearwood",
        materialName: "Clearwood",
        sourceIdentityName: "Clearwood",
        formulasUsedIn: ["Damp Shoreline v2"],
        requiredSourceType: "specialty_supplier_document_needed",
      }),
      queueItem({
        id: "item-vetiveryl",
        materialName: "Vetiveryl Acetate",
        sourceIdentityName: "Acetylated Vetiver Oil",
        requiredSourceType: "global_ifra_standard_needed",
      }),
      queueItem({
        id: "item-aldehyde-c8",
        materialName: "Aldehyde C-8",
        sourceIdentityName: "Octanal",
        requiredSourceType: "global_ifra_standard_needed",
      }),
      queueItem({
        id: "item-calone",
        materialName: "Calone 1951",
        sourceIdentityName: "Calone 1951",
        requiredSourceType: "global_ifra_standard_needed",
      }),
    ],
  };
  const evidenceResolution = {
    items: [
      {
        queueItemId: "item-iso",
        materialName: "Iso E Super",
        evidenceStatus: "review_ready",
        suggestedAction: "review_top_candidate",
        bestCandidates: [
          {
            sourceType: "supplier_product_page",
            sourceUrl: "https://supplier.example/iso-e-super",
            snippet: "Iso E Super IFRA category language from a supplier page.",
          },
        ],
      },
      {
        queueItemId: "item-aldehyde-c8",
        materialName: "Aldehyde C-8",
        evidenceStatus: "insufficient_evidence",
        suggestedAction: "No useful source found.",
      },
    ],
  };
  const recommendations = {
    items: [
      {
        queueItemId: "item-calone",
        materialName: "Calone 1951",
        recommendationStatus: "proposed_structured_record_ready_for_final_review",
      },
      {
        queueItemId: "item-aldehyde-c8",
        materialName: "Aldehyde C-8",
        recommendationStatus: "no_useful_evidence_found",
        suggestedAction: "No useful allowed source found.",
      },
    ],
  };
  const promotionOpportunities = {
    opportunities: [
      {
        queueItemId: "item-calone",
        materialName: "Calone 1951",
        classification: "needs_better_source",
      },
    ],
  };
  const proposedRecordsFile = {
    records: [
      {
        queueItemId: "item-calone",
        materialName: "Calone 1951",
        sourceIdentityName: "Calone 1951",
        recordType: "ifra_category_limit",
        category: "4",
        candidateValue: "No restriction",
        candidateUnit: "",
        sourceType: "supplier_product_page",
        sourceUrl: "https://supplier.example/calone",
        sourceSnippet: longSnippet,
      },
    ],
  };
  const reviewedStructuredOverrides = {
    records: [
      {
        standardName: "Acetylated Vetiver Oil",
        sourceIdentityName: "Acetylated Vetiver Oil",
        materialNames: ["Vetiveryl Acetate"],
        reviewStatus: "reviewed_ok",
      },
    ],
  };

  return {
    generatedAt: "2026-06-12T12:00:00.000Z",
    activeFormulas,
    sourceQueue,
    evidenceResolution,
    recommendations,
    promotionOpportunities,
    proposedRecordsFile,
    reviewedSourceRecords: { records: [] },
    reviewedStructuredOverrides,
    sourceAcquisitionAutopilot: {
      materialResults: [
        {
          queueItemId: "item-aldehyde-c8",
          result: "no_source_found",
        },
      ],
    },
    ...overrides,
  };
}

test("all-formula materials rank above variant-only materials", () => {
  const report = buildLaunchCriticalIfraExceptionPack(baseFixture());
  const launchCritical = report.groups.launchCriticalAcrossAllActiveFormulas;
  const variantOnly = report.groups.variantSpecificOnly;
  const iso = launchCritical.find((row) => row.material === "Iso E Super");
  const clearwood = variantOnly.find((row) => row.material === "Clearwood");

  assert.ok(iso);
  assert.ok(clearwood);
  assert.ok(iso.exceptionScore > clearwood.exceptionScore);
  assert.equal(iso.currentFormulaRelevance, "Used in all active hero formulas");
});

test("already reviewed structured records are classified as already handled", () => {
  const report = buildLaunchCriticalIfraExceptionPack(baseFixture());
  const handled = report.groups.alreadyHandled.find(
    (row) => row.material === "Vetiveryl Acetate"
  );

  assert.ok(handled);
  assert.equal(handled.evidenceQuality, "reviewed_official_runtime");
  assert.match(handled.doNotDo, /Do not re-promote/i);
});

test("source-unavailable rows are tagged as blocked by source availability", () => {
  const report = buildLaunchCriticalIfraExceptionPack(baseFixture());
  const blocked = report.groups.blockedBySourceAvailability.find(
    (row) => row.material === "Aldehyde C-8"
  );

  assert.ok(blocked);
  assert.equal(blocked.evidenceQuality, "no_useful_allowed_source");
  assert.match(blocked.whatIsMissing, /useful allowed public source/i);
});

test("proposed-but-not-promotable all-formula rows remain launch-critical", () => {
  const report = buildLaunchCriticalIfraExceptionPack(baseFixture());
  const calone = report.groups.launchCriticalAcrossAllActiveFormulas.find(
    (row) => row.material === "Calone 1951"
  );

  assert.ok(calone);
  assert.equal(calone.evidenceQuality, "supplier_product_page_only");
  assert.match(calone.currentIfraSourceStatus, /requires better source/i);
  assert.match(calone.doNotDo, /Do not promote weak supplier/i);
});

test("report limits snippet spam", () => {
  const report = buildLaunchCriticalIfraExceptionPack(baseFixture());
  const calone = report.groups.launchCriticalAcrossAllActiveFormulas.find(
    (row) => row.material === "Calone 1951"
  );
  const markdown = formatLaunchCriticalIfraExceptionPackMarkdown(report);

  assert.ok(calone.bestEvidenceSnippet.length <= 240);
  assert.doesNotMatch(calone.bestEvidenceSnippet, /TAIL_SHOULD_NOT_APPEAR/);
  assert.doesNotMatch(markdown, /TAIL_SHOULD_NOT_APPEAR/);
});

test("builder does not mutate runtime IFRA override inputs", () => {
  const fixture = baseFixture();
  const before = JSON.stringify(fixture.reviewedStructuredOverrides);

  buildLaunchCriticalIfraExceptionPack(fixture);

  assert.equal(JSON.stringify(fixture.reviewedStructuredOverrides), before);
});
