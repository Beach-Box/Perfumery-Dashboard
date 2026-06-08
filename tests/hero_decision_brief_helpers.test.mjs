import test from "node:test";
import assert from "node:assert/strict";

import {
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
} = {}) {
  return {
    formula: {
      formulaKey,
      name,
    },
    status,
    launchReadiness: {
      totalScore: launchScore,
      status: readinessLabel.toLowerCase(),
      statusMeta: { label: readinessLabel },
      blockers,
      cautions,
      compliance: {
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
    },
    confidenceSummary,
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
              legacy: 2,
              missing_threshold: 3,
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
      warning.includes("Skin-Air Bridge model caveat: 1 black-box accord row")
    )
  );
  assert.ok(
    brief.warnings.some((warning) =>
      warning.includes("Threshold and vapor-pressure support is mixed")
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
