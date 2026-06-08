import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHeroComparisonInterpreter,
  buildHeroDecisionBrief,
  buildHeroSensoryEvidenceSummary,
  countEvaluatedHeroCandidates,
  selectHeroFinalists,
  selectHeroLaunchCandidates,
  selectMarkedHeroWinner,
  selectStrongestHeroSensoryCandidate,
} from "../src/lib/hero_decision_brief_helpers.js";

function makeCandidate({
  formulaKey,
  name,
  status = "active",
  evaluationCount = 0,
  launchConfidence = null,
  preference = null,
  nextModificationNeededLabel = "No next modification logged",
  launchScore = 70,
  readinessLabel = "Ready",
  blockers = [],
  cautions = [],
  canFulfill = true,
  shortageCount = 0,
  supportLabel = "51/51 supported",
  confidenceSummary = null,
  ingredients = [
    { name: "Bergamot EO FCF", g: 0.4, note: "top" },
    { name: "Hedione", g: 1, note: "mid" },
    { name: "Iso E Super", g: 1.2, note: "base" },
  ],
  basket = null,
  compliance = null,
} = {}) {
  return {
    formula: {
      formulaKey,
      name,
      tagline: `${name} test candidate`,
      desc: `${name} model candidate for hero comparison.`,
      revisionNote: "Test helper formula.",
      ingredients,
    },
    status,
    launchReadiness: {
      totalScore: launchScore,
      status: readinessLabel.toLowerCase(),
      statusMeta: { label: readinessLabel },
      blockers,
      cautions,
      compliance: compliance || {
        failCount: 0,
        warnCount: 0,
        hasHardBlock: blockers.some((blocker) => blocker.includes("IFRA")),
      },
      inventory: {
        canFulfill,
        shortageCount,
        targetBatchG: 100,
      },
    },
    trustSummary: {
      supportLabel,
      levelMeta: { label: "Supported" },
      missingSignals: [],
      uncertainSignals: [],
      blockerSignals: [],
    },
    confidenceSummary,
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
    totalG: ingredients.reduce((sum, ingredient) => sum + (ingredient.g || 0), 0),
    performance: {
      longevity: 7,
      sillage: 7,
      projection: 7,
    },
    sensorySummary: {
      evaluationCount,
      latestEvaluation:
        evaluationCount > 0
          ? {
              ratings: {
                launchConfidence,
                preference,
                diffusion: 7,
                longevity: 8,
              },
            }
          : null,
      nextModificationNeededLabel,
    },
  };
}

const BASE_ITEMS = [
  makeCandidate({
    formulaKey: "seed-hero-random-concoction-original",
    name: "Random Concoction - Original",
    launchScore: 72,
  }),
  makeCandidate({
    formulaKey: "seed-hero-skin-air-bridge",
    name: "Skin-Air Bridge",
    launchScore: 82,
  }),
  makeCandidate({
    formulaKey: "seed-hero-damp-shoreline-v1",
    name: "Damp Shoreline v1",
    launchScore: 78,
  }),
  makeCandidate({
    formulaKey: "seed-hero-damp-shoreline-v2",
    name: "Damp Shoreline v2",
    launchScore: 76,
  }),
];

function getComparisonSection(interpreter, key) {
  return interpreter.sections.find((section) => section.key === key);
}

function buildComparisonItems() {
  return [
    makeCandidate({
      formulaKey: "seed-hero-random-concoction-original",
      name: "Random Concoction - Original",
      launchScore: 72,
      ingredients: [
        { name: "Bergamot EO FCF", g: 0.4, note: "top" },
        { name: "Hedione", g: 0.8, note: "mid" },
        { name: "Driftwood Accord", g: 0.8, note: "base" },
        { name: "Iso E Super", g: 1.4, note: "base" },
      ],
      basket: {
        totalCost: 18,
        missingCount: 0,
        uncertainCount: 0,
        lines: [
          { ingredientName: "Bergamot EO FCF", lineCost: 4, mappingConfidence: "confirmed", status: "confirmed" },
          { ingredientName: "Hedione", lineCost: 3, mappingConfidence: "confirmed", status: "confirmed" },
          {
            ingredientName: "Driftwood Accord",
            lineCost: 5,
            mappingConfidence: "inferred",
            status: "inferred",
            linkStatus: "component_derived_accord",
            costingMode: "component_derived",
          },
          { ingredientName: "Iso E Super", lineCost: 6, mappingConfidence: "confirmed", status: "confirmed" },
        ],
      },
      confidenceSummary: {
        categoryCounts: {
          black_box_accord: 1,
          missing_pricing: 0,
          missing_ifra: 0,
          missing_threshold: 1,
          legacy: 1,
          proxy_or_uvcb: 0,
        },
      },
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
      basket: {
        totalCost: 31,
        missingCount: 0,
        uncertainCount: 0,
        lines: [
          { ingredientName: "Dihydromyrcenol", lineCost: 4, mappingConfidence: "confirmed", status: "confirmed" },
          { ingredientName: "Hedione", lineCost: 5, mappingConfidence: "confirmed", status: "confirmed" },
          { ingredientName: "Oceanol 10%", lineCost: 4, mappingConfidence: "confirmed", status: "confirmed" },
          { ingredientName: "Calone 1951 20%", lineCost: 4, mappingConfidence: "confirmed", status: "confirmed" },
          {
            ingredientName: "Botanical Musk Accord",
            lineCost: 7,
            mappingConfidence: "inferred",
            status: "inferred",
            linkStatus: "component_derived_accord",
            costingMode: "component_derived",
          },
          { ingredientName: "Ambroxan 50% TEC", lineCost: 7, mappingConfidence: "confirmed", status: "confirmed" },
        ],
      },
      confidenceSummary: {
        categoryCounts: {
          black_box_accord: 1,
          missing_pricing: 0,
          missing_ifra: 0,
          missing_threshold: 1,
          legacy: 1,
          proxy_or_uvcb: 0,
        },
      },
    }),
    makeCandidate({
      formulaKey: "seed-hero-damp-shoreline-v1",
      name: "Damp Shoreline v1",
      launchScore: 79,
      ingredients: [
        { name: "Bergamot EO FCF", g: 0.5, note: "top" },
        { name: "Seaweed Absolute 10%", g: 0.2, note: "mid" },
        { name: "Algenone", g: 0.16, note: "mid" },
        { name: "Driftwood Accord", g: 1, note: "base" },
        { name: "Oakmoss Absolute 10%", g: 0.05, note: "base" },
      ],
      basket: {
        totalCost: 34,
        missingCount: 0,
        uncertainCount: 1,
        lines: [
          { ingredientName: "Bergamot EO FCF", lineCost: 7, mappingConfidence: "confirmed", status: "confirmed" },
          { ingredientName: "Seaweed Absolute 10%", lineCost: 8, mappingConfidence: "uncertain", status: "uncertain" },
          { ingredientName: "Algenone", lineCost: 5, mappingConfidence: "confirmed", status: "confirmed" },
          { ingredientName: "Driftwood Accord", lineCost: 9, mappingConfidence: "inferred", status: "inferred", costingMode: "component_derived" },
          { ingredientName: "Oakmoss Absolute 10%", lineCost: 5, mappingConfidence: "confirmed", status: "confirmed" },
        ],
      },
      confidenceSummary: {
        categoryCounts: {
          black_box_accord: 1,
          missing_pricing: 0,
          missing_ifra: 1,
          missing_threshold: 2,
          legacy: 1,
          proxy_or_uvcb: 1,
        },
      },
    }),
    makeCandidate({
      formulaKey: "seed-hero-damp-shoreline-v2",
      name: "Damp Shoreline v2",
      launchScore: 77,
      cautions: ["Finished-product headroom looks tight in the current use context."],
      compliance: { failCount: 0, warnCount: 1, hasHardBlock: false },
      ingredients: [
        { name: "Lemon FCF", g: 0.1, note: "top" },
        { name: "Calone 1951 20%", g: 0.25, note: "mid" },
        { name: "Geosmin 1% TEC", g: 0.04, note: "base" },
        { name: "Driftwood Accord v2", g: 0.15, note: "base" },
        { name: "Cedarwood Virginia EO", g: 0.35, note: "base" },
        { name: "Oakmoss Absolute 10%", g: 0.08, note: "base" },
      ],
      basket: {
        totalCost: 48,
        missingCount: 1,
        uncertainCount: 2,
        lines: [
          { ingredientName: "Lemon FCF", lineCost: 4, mappingConfidence: "confirmed", status: "confirmed" },
          { ingredientName: "Calone 1951 20%", lineCost: 5, mappingConfidence: "confirmed", status: "confirmed" },
          { ingredientName: "Geosmin 1% TEC", lineCost: null, mappingConfidence: "missing", status: "missing" },
          { ingredientName: "Driftwood Accord v2", lineCost: 9, mappingConfidence: "inferred", status: "inferred", costingMode: "component_derived" },
          { ingredientName: "Cedarwood Virginia EO", lineCost: 9, mappingConfidence: "uncertain", status: "uncertain" },
          { ingredientName: "Oakmoss Absolute 10%", lineCost: 6, mappingConfidence: "uncertain", status: "uncertain" },
        ],
      },
      confidenceSummary: {
        categoryCounts: {
          black_box_accord: 2,
          missing_pricing: 1,
          missing_ifra: 2,
          missing_threshold: 3,
          legacy: 2,
          proxy_or_uvcb: 2,
        },
      },
    }),
  ];
}

test("brief reports no marked candidate and no sensory evidence by default", () => {
  const brief = buildHeroDecisionBrief(BASE_ITEMS);

  assert.equal(selectMarkedHeroWinner(BASE_ITEMS), null);
  assert.equal(brief.headline, "No launch candidate marked yet");
  assert.equal(
    brief.decisionStateLabel,
    "No finalist, launch candidate, or winner selected"
  );
  assert.equal(brief.sensoryEvidence.statusLabel, "No wear tests yet");
  assert.equal(brief.sensoryEvidence.totalEvaluationCount, 0);
  assert.equal(brief.topReadinessCandidate.formula.name, "Skin-Air Bridge");
  assert.ok(
    brief.warnings.includes(
      "No candidate is marked finalist, launch candidate, or winner."
    )
  );
  assert.ok(
    brief.warnings.includes(
      "4 hero formulas still have no structured wear test."
    )
  );
  assert.equal(
    brief.nextAction,
    "Log at least one skin wear test for each variation."
  );
});

test("comparison interpreter ranks and labels hero formulas deterministically", () => {
  const items = buildComparisonItems();
  const interpreter = buildHeroComparisonInterpreter(items);

  assert.equal(interpreter.modeLabel, "Model-guided only");
  assert.equal(interpreter.declaresWinner, false);
  assert.equal(
    getComparisonSection(interpreter, "best_current_launch_candidate")
      .selectedFormulaName,
    "Skin-Air Bridge"
  );
  assert.equal(
    getComparisonSection(interpreter, "highest_technical_risk")
      .selectedFormulaName,
    "Damp Shoreline v2"
  );
  assert.equal(
    getComparisonSection(interpreter, "most_uncertain_model")
      .selectedFormulaName,
    "Damp Shoreline v2"
  );
  assert.equal(
    getComparisonSection(interpreter, "first_test_priority").selectedFormulaName,
    "Skin-Air Bridge"
  );
  assert.match(interpreter.rankedNames.readiness, /1\. Skin-Air Bridge/);
});

test("comparison interpreter caveats missing wear tests without declaring a fake winner", () => {
  const interpreter = buildHeroComparisonInterpreter(buildComparisonItems());

  assert.equal(interpreter.declaresWinner, false);
  assert.ok(
    interpreter.caveats.includes(
      "No real wear-test evidence recorded yet. This comparison is model-guided only."
    )
  );
  assert.match(
    getComparisonSection(interpreter, "best_current_launch_candidate").caveat,
    /model-guided only/i
  );
  assert.doesNotMatch(
    getComparisonSection(interpreter, "best_current_launch_candidate").title,
    /winner/i
  );
});

test("comparison interpreter includes cost, IFRA, and component-costed accord caveats", () => {
  const interpreter = buildHeroComparisonInterpreter(buildComparisonItems());
  const costSection = getComparisonSection(
    interpreter,
    "best_cost_complexity_balance"
  );
  const uncertaintySection = getComparisonSection(
    interpreter,
    "most_uncertain_model"
  );
  const dampV2Summary = interpreter.candidateSummaries.find(
    (summary) => summary.name === "Damp Shoreline v2"
  );
  const originalSummary = interpreter.candidateSummaries.find(
    (summary) => summary.name === "Random Concoction - Original"
  );

  assert.equal(costSection.selectedFormulaName, "Random Concoction - Original");
  assert.match(costSection.reason, /\$18\.00/);
  assert.match(costSection.caveat, /component-costed/i);
  assert.equal(originalSummary.missingPriceCount, 0);
  assert.equal(originalSummary.componentCostedAccordCount, 1);
  assert.equal(originalSummary.accordModelCaveatCount, 1);
  assert.match(uncertaintySection.reason, /IFRA confidence caveat/);
  assert.equal(dampV2Summary.ifraLabel, "1 IFRA warning row");
});

test("comparison interpreter is pure and does not alter formula composition", () => {
  const items = buildComparisonItems();
  const before = JSON.stringify(
    items.map((item) => ({
      formulaKey: item.formula.formulaKey,
      ingredients: item.formula.ingredients,
      status: item.status,
    }))
  );

  buildHeroComparisonInterpreter(items);

  const after = JSON.stringify(
    items.map((item) => ({
      formulaKey: item.formula.formulaKey,
      ingredients: item.formula.ingredients,
      status: item.status,
    }))
  );
  assert.equal(after, before);
});

test("brief preserves manual winner priority", () => {
  const items = BASE_ITEMS.map((item) =>
    item.formula.formulaKey === "seed-hero-damp-shoreline-v2"
      ? { ...item, status: "winner" }
      : item.formula.formulaKey === "seed-hero-skin-air-bridge"
      ? { ...item, status: "launch_candidate" }
      : item
  );
  const brief = buildHeroDecisionBrief(items);

  assert.equal(selectMarkedHeroWinner(items).formula.name, "Damp Shoreline v2");
  assert.equal(brief.headline, "Current marked winner: Damp Shoreline v2");
  assert.equal(brief.decisionStateLabel, "Winner selected manually");
  assert.equal(brief.decisionCandidate.formula.name, "Damp Shoreline v2");
  assert.ok(
    brief.warnings.includes(
      "Current marked winner has no structured wear test yet."
    )
  );
  assert.equal(
    brief.nextAction,
    "Log at least one skin wear test for Damp Shoreline v2 before production planning."
  );
});

test("brief uses launch candidate when no winner is marked", () => {
  const items = BASE_ITEMS.map((item) =>
    item.formula.formulaKey === "seed-hero-skin-air-bridge"
      ? { ...item, status: "launch_candidate" }
      : item
  );
  const brief = buildHeroDecisionBrief(items);

  assert.deepEqual(
    selectHeroLaunchCandidates(items).map((item) => item.formula.name),
    ["Skin-Air Bridge"]
  );
  assert.equal(brief.headline, "Current launch candidate: Skin-Air Bridge");
  assert.equal(brief.decisionCandidate.formula.name, "Skin-Air Bridge");
});

test("brief lists finalists when no winner or launch candidate exists", () => {
  const items = BASE_ITEMS.map((item) =>
    item.formula.formulaKey === "seed-hero-skin-air-bridge" ||
    item.formula.formulaKey === "seed-hero-damp-shoreline-v1"
      ? { ...item, status: "finalist" }
      : item
  );
  const brief = buildHeroDecisionBrief(items);

  assert.deepEqual(
    selectHeroFinalists(items).map((item) => item.formula.name),
    ["Skin-Air Bridge", "Damp Shoreline v1"]
  );
  assert.equal(
    brief.headline,
    "Current finalists: Skin-Air Bridge, Damp Shoreline v1"
  );
  assert.equal(brief.decisionCandidate.formula.name, "Skin-Air Bridge");
});

test("brief selects strongest sensory-supported candidate from current records", () => {
  const items = BASE_ITEMS.map((item) => {
    if (item.formula.formulaKey === "seed-hero-skin-air-bridge") {
      return {
        ...item,
        sensorySummary: {
          ...item.sensorySummary,
          evaluationCount: 1,
          latestEvaluation: {
            ratings: { launchConfidence: 9, preference: 9 },
          },
        },
      };
    }
    if (item.formula.formulaKey === "seed-hero-damp-shoreline-v1") {
      return {
        ...item,
        sensorySummary: {
          ...item.sensorySummary,
          evaluationCount: 2,
          latestEvaluation: {
            ratings: { launchConfidence: 7, preference: 8 },
          },
        },
      };
    }
    return item;
  });
  const summary = buildHeroSensoryEvidenceSummary(items);
  const strongest = selectStrongestHeroSensoryCandidate(items);
  const brief = buildHeroDecisionBrief(items);

  assert.equal(countEvaluatedHeroCandidates(items), 2);
  assert.equal(summary.statusLabel, "Partial wear testing");
  assert.equal(strongest.formula.name, "Damp Shoreline v1");
  assert.equal(
    brief.strongestSensoryLabel,
    "Damp Shoreline v1 (2 tests · confidence 7/10 · preference 8/10)"
  );
});

test("brief flags low-confidence winner and blockers", () => {
  const items = BASE_ITEMS.map((item) =>
    item.formula.formulaKey === "seed-hero-skin-air-bridge"
      ? makeCandidate({
          formulaKey: item.formula.formulaKey,
          name: item.formula.name,
          status: "winner",
          evaluationCount: 1,
          launchConfidence: 4.5,
          preference: 7,
          blockers: ["1 inventory shortage at 100g."],
          canFulfill: false,
          shortageCount: 1,
        })
      : item
  );
  const brief = buildHeroDecisionBrief(items);

  assert.ok(
    brief.warnings.includes(
      "Current marked winner has low launch confidence (4.5/10)."
    )
  );
  assert.ok(
    brief.warnings.includes(
      "Current marked winner still has a blocker: 1 inventory shortage at 100g."
    )
  );
  assert.equal(
    brief.nextAction,
    "Resolve blockers before treating Skin-Air Bridge as production-ready."
  );
});

test("brief surfaces selected winner model confidence caveats as advisory warnings", () => {
  const items = BASE_ITEMS.map((item) =>
    item.formula.formulaKey === "seed-hero-skin-air-bridge"
      ? makeCandidate({
          formulaKey: item.formula.formulaKey,
          name: item.formula.name,
          status: "winner",
          evaluationCount: 2,
          launchConfidence: 8,
          preference: 8,
          confidenceSummary: {
            categoryCounts: {
              black_box_accord: 1,
              missing_pricing: 1,
              missing_ifra: 1,
              legacy: 2,
              missing_threshold: 3,
              proxy_or_uvcb: 1,
              estimated_model: 1,
              directional_only: 1,
            },
          },
        })
      : item
  );
  const brief = buildHeroDecisionBrief(items);

  assert.ok(
    brief.warnings.some((warning) =>
      warning.includes("Skin-Air Bridge model caveat: 1 accord row")
    )
  );
  assert.ok(
    brief.warnings.some((warning) =>
      warning.includes("1 pricing caveat row")
    )
  );
  assert.ok(
    brief.warnings.some((warning) =>
      warning.includes("1 IFRA coverage row")
    )
  );
  assert.ok(
    brief.warnings.some((warning) =>
      warning.includes("threshold and vapor-pressure support is mixed")
    )
  );
  assert.ok(
    brief.warnings.some((warning) =>
      warning.includes("1 proxy/UVCB material")
    )
  );
  assert.ok(
    brief.warnings.some((warning) =>
      warning.includes("latest wear test snapshot")
    )
  );
  assert.equal(brief.decisionCandidate.formula.name, "Skin-Air Bridge");
});

test("brief summarizes complete multi-test sensory coverage", () => {
  const items = BASE_ITEMS.map((item, index) =>
    makeCandidate({
      formulaKey: item.formula.formulaKey,
      name: item.formula.name,
      evaluationCount: index === 0 ? 2 : 1,
      launchConfidence: 7 + index,
      preference: 6 + index,
      launchScore: item.launchReadiness.totalScore,
    })
  );
  const brief = buildHeroDecisionBrief(items);

  assert.equal(brief.sensoryEvidence.statusLabel, "Multiple wear tests logged");
  assert.equal(brief.sensoryEvidence.evaluatedCandidateCount, 4);
  assert.equal(brief.sensoryEvidence.totalEvaluationCount, 5);
  assert.equal(brief.sensoryEvidence.unevaluatedCandidateCount, 0);
});

test("brief can surface next modification when evidence is otherwise complete", () => {
  const items = BASE_ITEMS.map((item) =>
    makeCandidate({
      formulaKey: item.formula.formulaKey,
      name: item.formula.name,
      evaluationCount: 1,
      launchConfidence: item.formula.formulaKey === "seed-hero-skin-air-bridge" ? 8 : 7,
      preference: item.formula.formulaKey === "seed-hero-skin-air-bridge" ? 9 : 6,
      nextModificationNeededLabel:
        item.formula.formulaKey === "seed-hero-skin-air-bridge"
          ? "soften damp edge"
          : "No next modification logged",
    })
  );
  const brief = buildHeroDecisionBrief(items);

  assert.equal(
    brief.nextAction,
    "Review next modification for Skin-Air Bridge: soften damp edge"
  );
});
