import test from "node:test";
import assert from "node:assert/strict";

import { buildHeroComparisonInterpreter } from "../src/lib/hero_decision_brief_helpers.js";
import { buildNextControlledWearTestPlan } from "../src/lib/hero_controlled_wear_test_plan_helpers.js";

function makeCandidate({
  formulaKey,
  name,
  launchScore = 75,
  status = "active",
  ingredients = [],
  evaluationCount = 0,
  latestEvaluation = null,
  confidenceSummary = null,
  basket = null,
} = {}) {
  return {
    formula: {
      formulaKey,
      name,
      tagline: `${name} hero test`,
      desc: `${name} Beach Box skin-air marine-wood candidate.`,
      revisionNote: "Synthetic helper formula.",
      ingredients,
    },
    status,
    launchReadiness: {
      totalScore: launchScore,
      status: "testable",
      statusMeta: { label: "Testable" },
      blockers: [],
      cautions: [],
      compliance: {
        statusLabel: "No modeled finished-product offenders",
        finishedProductOffenderCount: 0,
        dataReviewCount: 0,
      },
      inventory: {
        canFulfill: true,
        targetBatchG: 100,
      },
    },
    confidenceSummary:
      confidenceSummary || {
        categoryCounts: {
          black_box_accord: 0,
          missing_pricing: 0,
          missing_ifra: 0,
          missing_threshold: 0,
          legacy: 0,
          proxy_or_uvcb: 0,
        },
      },
    selectedBasket:
      basket || {
        totalCost: 24,
        missingCount: 0,
        uncertainCount: 0,
        lines: ingredients.map((ingredient, index) => ({
          ingredientName: ingredient.name,
          lineCost: 4 + index,
          mappingConfidence: "confirmed",
          status: "confirmed",
        })),
      },
    ingredientCount: ingredients.length,
    performance: {
      longevity: 7,
      sillage: 7,
      projection: 7,
    },
    sensorySummary: {
      evaluationCount,
      latestEvaluation,
      latestTestDateLabel: latestEvaluation?.testDate || "Not tested",
      latestSurfaceLabel: latestEvaluation?.testSurface || "Not tested",
      launchConfidenceLabel:
        latestEvaluation?.ratings?.launchConfidence == null
          ? "Not scored"
          : `${latestEvaluation.ratings.launchConfidence}/10`,
      summaryLabel: latestEvaluation?.summary || "No summary logged",
      nextModificationNeededLabel:
        latestEvaluation?.nextModificationNeeded || "No next modification logged",
      offNoteLabel: latestEvaluation?.impressions?.offNotes || "No off-note logged",
    },
  };
}

function buildCandidates() {
  return [
    makeCandidate({
      formulaKey: "seed-hero-original",
      name: "Random Concoction - Original",
      launchScore: 72,
      ingredients: [
        { name: "Bergamot EO FCF", g: 0.4, note: "top" },
        { name: "Hedione", g: 0.8, note: "mid" },
        { name: "Iso E Super", g: 1.2, note: "base" },
      ],
    }),
    makeCandidate({
      formulaKey: "seed-hero-skin-air-bridge",
      name: "Skin-Air Bridge",
      launchScore: 88,
      ingredients: [
        { name: "Dihydromyrcenol", g: 0.4, note: "top" },
        { name: "Hedione", g: 0.9, note: "mid" },
        { name: "Oceanol 10%", g: 0.3, note: "mid" },
        { name: "Calone 1951 20%", g: 0.2, note: "mid" },
        { name: "Botanical Musk Accord", g: 1.2, note: "base" },
        { name: "Ambroxan 50% TEC", g: 0.6, note: "base" },
      ],
    }),
    makeCandidate({
      formulaKey: "seed-hero-damp-shoreline-v2",
      name: "Damp Shoreline v2",
      launchScore: 77,
      ingredients: [
        { name: "Lemon FCF", g: 0.1, note: "top" },
        { name: "Seaweed Absolute 10%", g: 0.2, note: "mid" },
        { name: "Geosmin 1% TEC", g: 0.04, note: "base" },
        { name: "Driftwood Accord v2", g: 0.15, note: "base" },
      ],
      confidenceSummary: {
        categoryCounts: {
          black_box_accord: 1,
          missing_pricing: 1,
          missing_ifra: 2,
          missing_threshold: 1,
          legacy: 0,
          proxy_or_uvcb: 2,
        },
      },
      basket: {
        totalCost: 42,
        missingCount: 1,
        uncertainCount: 1,
        lines: [],
      },
    }),
  ];
}

const GCMS_INSIGHTS = {
  heroFormulaRelevance: [
    {
      formulaName: "Skin-Air Bridge",
      watch: "Do not increase marine force until wear-tested.",
      nextValidation:
        "Whether the marine/floral bridge feels skinlike or detergent-adjacent.",
    },
  ],
};

test("controlled wear test plan selects model priority without declaring a winner", () => {
  const candidates = buildCandidates();
  const comparison = buildHeroComparisonInterpreter(candidates);
  const plan = buildNextControlledWearTestPlan({
    candidateItems: candidates,
    comparisonInterpreter: comparison,
    gcmsPatternInsights: GCMS_INSIGHTS,
  });

  assert.equal(plan.formulaName, "Skin-Air Bridge");
  assert.equal(plan.priorityLabel, "Current model-guided test priority");
  assert.equal(plan.declaresWinner, false);
  assert.doesNotMatch(plan.priorityLabel, /winner/i);
  assert.match(plan.confidenceLabel, /model-guided/i);
});

test("controlled wear test plan caveats missing wear evidence and gives a protocol", () => {
  const comparison = buildHeroComparisonInterpreter(buildCandidates());
  const plan = buildNextControlledWearTestPlan({
    candidateItems: buildCandidates(),
    comparisonInterpreter: comparison,
    gcmsPatternInsights: GCMS_INSIGHTS,
  });

  assert.equal(plan.evidenceStatus.statusKey, "model_guided_only");
  assert.match(plan.evidenceStatus.label, /No real wear-test evidence/i);
  assert.ok(plan.testProtocol.surfaces.some((item) => /Skin: start with 1 spray/i.test(item)));
  assert.deepEqual(plan.testProtocol.checkpoints.slice(0, 5), [
    "5 min",
    "30 min",
    "2 hr",
    "4 hr",
    "6 hr",
  ]);
});

test("controlled wear test plan includes watch, hold, and conditional guidance", () => {
  const candidates = buildCandidates();
  const comparison = buildHeroComparisonInterpreter(candidates);
  const plan = buildNextControlledWearTestPlan({
    candidateItems: candidates,
    comparisonInterpreter: comparison,
    gcmsPatternInsights: GCMS_INSIGHTS,
  });

  assert.ok(plan.watchItems.some((item) => /detergent-aquatic risk/i.test(item)));
  assert.ok(
    plan.doNotChangeYet.some((item) => /Do not treat GCMS pattern guidance as a recipe/i.test(item))
  );
  assert.ok(
    plan.doNotChangeYet.some((item) => /Do not add more marine force/i.test(item))
  );
  assert.ok(
    plan.ifConfirmedThenConsider.some((item) => /If marine heart feels detergent-like/i.test(item))
  );
  assert.equal(
    plan.ifConfirmedThenConsider.some((item) => /\d+(\.\d+)?\s*g/i.test(item)),
    false
  );
});

test("controlled wear test plan summarizes existing sensory evidence", () => {
  const candidates = buildCandidates().map((candidate) =>
    ({
      ...candidate,
      sensorySummary: {
        ...candidate.sensorySummary,
        evaluationCount: 1,
        latestTestDateLabel:
          candidate.formula.formulaKey === "seed-hero-skin-air-bridge"
            ? "2026-06-09"
            : "2026-06-08",
        latestSurfaceLabel: "skin",
        launchConfidenceLabel:
          candidate.formula.formulaKey === "seed-hero-skin-air-bridge"
            ? "8/10"
            : "6/10",
        summaryLabel:
          candidate.formula.formulaKey === "seed-hero-skin-air-bridge"
            ? "airy mineral skin bridge"
            : "baseline comparison touchpoint",
      },
    })
  );
  const plan = buildNextControlledWearTestPlan({
    candidateItems: candidates,
    comparisonInterpreter: buildHeroComparisonInterpreter(candidates),
    gcmsPatternInsights: GCMS_INSIGHTS,
  });

  assert.equal(plan.evidenceStatus.statusKey, "wear_test_logged");
  assert.equal(plan.evidenceStatus.latestTestDateLabel, "2026-06-09");
  assert.equal(plan.evidenceStatus.confidenceLabel, "8/10");
  assert.match(plan.evidenceStatus.keyOutcome, /airy mineral skin bridge/i);
});

test("controlled wear test plan does not mutate formulas or statuses", () => {
  const candidates = buildCandidates();
  const before = JSON.stringify(
    candidates.map((candidate) => ({
      status: candidate.status,
      ingredients: candidate.formula.ingredients,
    }))
  );

  buildNextControlledWearTestPlan({
    candidateItems: candidates,
    comparisonInterpreter: buildHeroComparisonInterpreter(candidates),
    gcmsPatternInsights: GCMS_INSIGHTS,
  });

  const after = JSON.stringify(
    candidates.map((candidate) => ({
      status: candidate.status,
      ingredients: candidate.formula.ingredients,
    }))
  );
  assert.equal(after, before);
});
