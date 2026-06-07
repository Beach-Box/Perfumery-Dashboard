import test from "node:test";
import assert from "node:assert/strict";

import {
  HERO_SENSORY_SCHEMA_VERSION,
  buildHeroSensorySummary,
  cleanHeroSensoryEvaluationState,
  countHeroSensoryEvaluations,
  createEmptyHeroSensoryEvaluationRecord,
  getHeroSensoryEvaluationsForFormula,
  getLatestHeroSensoryEvaluation,
  groupHeroSensoryEvaluationsByFormulaKey,
  normalizeHeroSensoryEvaluationRecord,
  normalizeHeroSensoryRating,
} from "../src/lib/hero_sensory_evaluation_helpers.js";

const FORMULA_KEY = "seed-hero-skin-air-bridge";
const OTHER_FORMULA_KEY = "seed-hero-damp-shoreline-v1";
const NOW = "2026-06-07T15:30:00.000Z";

test("cleanHeroSensoryEvaluationState returns a default empty sensory state", () => {
  assert.deepEqual(cleanHeroSensoryEvaluationState(null), {
    schemaVersion: HERO_SENSORY_SCHEMA_VERSION,
    byFormulaKey: {},
  });

  assert.deepEqual(buildHeroSensorySummary({}, FORMULA_KEY), {
    formulaKey: FORMULA_KEY,
    evaluationCount: 0,
    statusLabel: "No wear test yet",
    statusKey: "empty",
    latestEvaluation: null,
    latestTestDateLabel: "Not tested",
    latestSurfaceLabel: "Not tested",
    preferenceLabel: "Not scored",
    launchConfidenceLabel: "Not scored",
    diffusionLabel: "Not scored",
    longevityLabel: "Not scored",
    offNoteLabel: "No off-note logged",
    nextModificationNeededLabel: "No next modification logged",
    summaryLabel: "No summary logged",
  });
});

test("createEmptyHeroSensoryEvaluationRecord creates a stable formula-keyed draft", () => {
  assert.deepEqual(
    createEmptyHeroSensoryEvaluationRecord(FORMULA_KEY, {
      now: NOW,
      id: "wear-fixed",
    }),
    {
      id: "wear-fixed",
      formulaKey: FORMULA_KEY,
      createdAt: NOW,
      updatedAt: NOW,
      testDate: "2026-06-07",
      evaluator: "",
      testSurface: "skin",
      dose: {
        sprays: 1,
        amount: "",
        unit: "",
      },
      impressions: {
        opening: "",
        heart: "",
        drydown: "",
        skinFeel: "",
        offNotes: "",
        memorability: "",
        emotionalBrandFit: "",
      },
      ratings: {
        diffusion: null,
        longevity: null,
        preference: null,
        launchConfidence: null,
      },
      nextModificationNeeded: "",
      summary: "",
    }
  );
});

test("normalizeHeroSensoryRating uses predictable 0-10 bounds", () => {
  assert.equal(normalizeHeroSensoryRating(""), null);
  assert.equal(normalizeHeroSensoryRating("bad"), null);
  assert.equal(normalizeHeroSensoryRating("-4"), 0);
  assert.equal(normalizeHeroSensoryRating("12"), 10);
  assert.equal(normalizeHeroSensoryRating("7.26"), 7.3);
});

test("cleanHeroSensoryEvaluationState normalizes malformed persisted records", () => {
  const cleaned = cleanHeroSensoryEvaluationState({
    schemaVersion: 999,
    byFormulaKey: {
      [FORMULA_KEY]: {
        evaluations: [
          null,
          {
            id: " wear-1 ",
            formulaKey: "ignored",
            createdAt: "bad",
            updatedAt: "2026-06-08T10:00:00.000Z",
            testDate: "not-a-date",
            evaluator: "  Ben  ",
            testSurface: "paper",
            dose: { sprays: "-2", amount: " 2 ", unit: " sprays " },
            impressions: {
              opening: "  salty lift ",
              offNotes: "  iodine edge ",
            },
            ratings: {
              diffusion: "12",
              longevity: "nope",
              preference: "7",
              launchConfidence: "-1",
            },
            nextModificationNeeded: "  soften seaweed ",
            summary: "  promising ",
          },
        ],
      },
      "": { evaluations: [{ id: "discard" }] },
    },
  });

  const evaluations = cleaned.byFormulaKey[FORMULA_KEY].evaluations;
  assert.equal(cleaned.schemaVersion, HERO_SENSORY_SCHEMA_VERSION);
  assert.equal(evaluations.length, 1);
  assert.equal(evaluations[0].id, "wear-1");
  assert.equal(evaluations[0].formulaKey, FORMULA_KEY);
  assert.equal(evaluations[0].testDate, evaluations[0].createdAt.slice(0, 10));
  assert.equal(evaluations[0].testSurface, "skin");
  assert.equal(evaluations[0].dose.sprays, 0);
  assert.equal(evaluations[0].dose.amount, "2");
  assert.equal(evaluations[0].impressions.opening, "salty lift");
  assert.equal(evaluations[0].impressions.offNotes, "iodine edge");
  assert.equal(evaluations[0].ratings.diffusion, 10);
  assert.equal(evaluations[0].ratings.longevity, null);
  assert.equal(evaluations[0].ratings.preference, 7);
  assert.equal(evaluations[0].ratings.launchConfidence, 0);
  assert.equal(evaluations[0].nextModificationNeeded, "soften seaweed");
  assert.equal(evaluations[0].summary, "promising");
});

test("getLatestHeroSensoryEvaluation selects the newest test date then updated time", () => {
  const older = normalizeHeroSensoryEvaluationRecord(
    {
      id: "older",
      formulaKey: FORMULA_KEY,
      testDate: "2026-06-06",
      updatedAt: "2026-06-06T20:00:00.000Z",
    },
    { formulaKey: FORMULA_KEY, now: NOW }
  );
  const latestByUpdate = normalizeHeroSensoryEvaluationRecord(
    {
      id: "latest-update",
      formulaKey: FORMULA_KEY,
      testDate: "2026-06-07",
      updatedAt: "2026-06-07T20:00:00.000Z",
    },
    { formulaKey: FORMULA_KEY, now: NOW }
  );
  const latestDate = normalizeHeroSensoryEvaluationRecord(
    {
      id: "latest-date",
      formulaKey: FORMULA_KEY,
      testDate: "2026-06-08",
      updatedAt: "2026-06-08T08:00:00.000Z",
    },
    { formulaKey: FORMULA_KEY, now: NOW }
  );

  assert.equal(
    getLatestHeroSensoryEvaluation([older, latestByUpdate, latestDate]).id,
    "latest-date"
  );
  assert.equal(
    getLatestHeroSensoryEvaluation([older, latestByUpdate]).id,
    "latest-update"
  );
});

test("groupHeroSensoryEvaluationsByFormulaKey groups records without mutating sources", () => {
  const source = [
    {
      id: "a",
      formulaKey: FORMULA_KEY,
      ratings: { preference: "8" },
      impressions: { opening: "bright" },
    },
    {
      id: "b",
      formulaKey: OTHER_FORMULA_KEY,
      ratings: { preference: "6" },
    },
  ];
  const before = JSON.stringify(source);

  const grouped = groupHeroSensoryEvaluationsByFormulaKey(source);

  assert.equal(JSON.stringify(source), before);
  assert.equal(grouped.byFormulaKey[FORMULA_KEY].evaluations.length, 1);
  assert.equal(grouped.byFormulaKey[OTHER_FORMULA_KEY].evaluations.length, 1);
  assert.equal(
    grouped.byFormulaKey[FORMULA_KEY].evaluations[0].ratings.preference,
    8
  );
});

test("buildHeroSensorySummary reports per-formula latest wear-test details", () => {
  const state = groupHeroSensoryEvaluationsByFormulaKey([
    {
      id: "first",
      formulaKey: FORMULA_KEY,
      testDate: "2026-06-06",
      testSurface: "strip",
      ratings: { preference: 6, launchConfidence: 5 },
    },
    {
      id: "second",
      formulaKey: FORMULA_KEY,
      testDate: "2026-06-07",
      testSurface: "skin",
      impressions: { offNotes: "mineral edge" },
      ratings: {
        diffusion: 7,
        longevity: 8,
        preference: 9,
        launchConfidence: 8,
      },
      nextModificationNeeded: "reduce damp accord",
      summary: "most launchable",
    },
    {
      id: "other",
      formulaKey: OTHER_FORMULA_KEY,
      testDate: "2026-06-09",
    },
  ]);

  const summary = buildHeroSensorySummary(state, FORMULA_KEY);

  assert.equal(countHeroSensoryEvaluations(state, FORMULA_KEY), 2);
  assert.equal(
    getHeroSensoryEvaluationsForFormula(state, FORMULA_KEY).length,
    2
  );
  assert.equal(summary.statusLabel, "Multiple wear tests logged");
  assert.equal(summary.statusKey, "multiple");
  assert.equal(summary.evaluationCount, 2);
  assert.equal(summary.latestTestDateLabel, "2026-06-07");
  assert.equal(summary.latestSurfaceLabel, "Skin");
  assert.equal(summary.preferenceLabel, "9/10");
  assert.equal(summary.launchConfidenceLabel, "8/10");
  assert.equal(summary.diffusionLabel, "7/10");
  assert.equal(summary.longevityLabel, "8/10");
  assert.equal(summary.offNoteLabel, "mineral edge");
  assert.equal(summary.nextModificationNeededLabel, "reduce damp accord");
  assert.equal(summary.summaryLabel, "most launchable");
});
