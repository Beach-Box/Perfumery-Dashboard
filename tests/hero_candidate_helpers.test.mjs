import test from "node:test";
import assert from "node:assert/strict";

import {
  applyHeroCandidateStatus,
  getHeroCandidateRoleLabel,
  normalizeHeroCandidateStatusState,
  sortHeroCandidateFormulas,
} from "../src/lib/hero_candidate_helpers.js";

const HERO_FORMULAS_UNSORTED = [
  {
    formulaKey: "seed-hero-damp-shoreline-v2",
    familyKey: "hero-scent",
    variationRole: "test_variation",
    variationNumber: 3,
    developmentStatus: "active",
    name: "Damp Shoreline v2",
  },
  {
    formulaKey: "formula-hero-draft",
    familyKey: "hero-scent",
    variationRole: "test_variation",
    variationNumber: 4,
    developmentStatus: "active",
    name: "Hero Draft",
  },
  {
    formulaKey: "seed-hero-random-concoction-original",
    familyKey: "hero-scent",
    variationRole: "original",
    variationNumber: 0,
    developmentStatus: "active",
    name: "Random Concoction - Original",
  },
  {
    formulaKey: "seed-other-family",
    familyKey: "future-line",
    variationRole: "test_variation",
    variationNumber: 1,
    developmentStatus: "active",
    name: "Other Family",
  },
  {
    formulaKey: "seed-hero-skin-air-bridge",
    familyKey: "hero-scent",
    variationRole: "test_variation",
    variationNumber: 1,
    developmentStatus: "active",
    name: "Skin-Air Bridge",
  },
  {
    formulaKey: "seed-hero-damp-shoreline-v1",
    familyKey: "hero-scent",
    variationRole: "test_variation",
    variationNumber: 2,
    developmentStatus: "active",
    name: "Damp Shoreline v1",
  },
];

test("sortHeroCandidateFormulas groups active hero seed formulas by variation order", () => {
  assert.deepEqual(
    sortHeroCandidateFormulas(HERO_FORMULAS_UNSORTED).map(
      (formula) => formula.formulaKey
    ),
    [
      "seed-hero-random-concoction-original",
      "seed-hero-skin-air-bridge",
      "seed-hero-damp-shoreline-v1",
      "seed-hero-damp-shoreline-v2",
    ]
  );
});

test("getHeroCandidateRoleLabel formats original and test variation roles", () => {
  const formulas = sortHeroCandidateFormulas(HERO_FORMULAS_UNSORTED);

  assert.deepEqual(formulas.map(getHeroCandidateRoleLabel), [
    "Original",
    "Test Variation 1",
    "Test Variation 2",
    "Test Variation 3",
  ]);
});

test("normalizeHeroCandidateStatusState defaults active statuses and removes unknown keys", () => {
  assert.deepEqual(
    normalizeHeroCandidateStatusState(HERO_FORMULAS_UNSORTED, {
      "seed-hero-skin-air-bridge": "finalist",
      "seed-other-family": "winner",
      "not-a-formula": "parked",
      "seed-hero-damp-shoreline-v1": "not_real",
    }),
    {
      "seed-hero-random-concoction-original": "active",
      "seed-hero-skin-air-bridge": "finalist",
      "seed-hero-damp-shoreline-v1": "active",
      "seed-hero-damp-shoreline-v2": "active",
    }
  );
});

test("applyHeroCandidateStatus enforces winner exclusivity", () => {
  const firstWinnerState = applyHeroCandidateStatus(
    {},
    HERO_FORMULAS_UNSORTED,
    "seed-hero-skin-air-bridge",
    "winner"
  );
  const secondWinnerState = applyHeroCandidateStatus(
    firstWinnerState,
    HERO_FORMULAS_UNSORTED,
    "seed-hero-damp-shoreline-v2",
    "winner"
  );

  assert.equal(secondWinnerState["seed-hero-skin-air-bridge"], "active");
  assert.equal(secondWinnerState["seed-hero-damp-shoreline-v2"], "winner");
});

test("applyHeroCandidateStatus preserves non-winner candidate status choices", () => {
  assert.deepEqual(
    applyHeroCandidateStatus(
      {},
      HERO_FORMULAS_UNSORTED,
      "seed-hero-damp-shoreline-v1",
      "launch_candidate"
    ),
    {
      "seed-hero-random-concoction-original": "active",
      "seed-hero-skin-air-bridge": "active",
      "seed-hero-damp-shoreline-v1": "launch_candidate",
      "seed-hero-damp-shoreline-v2": "active",
    }
  );
});
