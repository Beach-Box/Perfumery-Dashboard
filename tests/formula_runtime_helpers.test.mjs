import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFormulaLibrary,
  filterRetiredSeedFormulaRecords,
  isRetiredSeedFormulaRecord,
  LEGACY_FORMULA_SEED_KEYS_2026_06_07,
} from "../src/lib/formula_runtime_helpers.js";

test("legacy formula seed key list captures the scheduled retired seeds", () => {
  assert.deepEqual(LEGACY_FORMULA_SEED_KEYS_2026_06_07, [
    "seed-cabana-confessions-1",
    "seed-coastal-af-2",
    "seed-dominican-drift-3",
    "seed-heat-stroke-4",
    "seed-low-tide-lust-5",
    "seed-nauti-by-nature-6",
    "seed-rum-riptide-7",
    "seed-salty-skin-8",
    "seed-seasick-satisfied-9",
    "seed-wet-shore-10",
  ]);
});

test("retired seed detection targets only seeded baselines and overrides", () => {
  assert.equal(
    isRetiredSeedFormulaRecord({
      formulaKey: "seed-cabana-confessions-1",
      isSeeded: true,
      sourceType: "seeded_override",
    }),
    true
  );
  assert.equal(
    isRetiredSeedFormulaRecord({
      formulaKey: "seed-cabana-confessions-1",
      isSeeded: false,
      sourceType: "custom",
    }),
    false
  );
  assert.equal(
    isRetiredSeedFormulaRecord({
      formulaKey: "formula-derived-from-cabana",
      isSeeded: false,
      sourceType: "version",
      seedSourceKey: "seed-cabana-confessions-1",
    }),
    false
  );
});

test("retired seed filter preserves custom formulas and derived versions", () => {
  const records = [
    {
      formulaKey: "seed-cabana-confessions-1",
      isSeeded: true,
      sourceType: "seeded_override",
    },
    {
      formulaKey: "custom-launch-draft",
      isSeeded: false,
      sourceType: "custom",
    },
    {
      formulaKey: "formula-derived-from-cabana",
      isSeeded: false,
      sourceType: "version",
      seedSourceKey: "seed-cabana-confessions-1",
    },
  ];

  assert.deepEqual(
    filterRetiredSeedFormulaRecords(records).map((record) => record.formulaKey),
    ["custom-launch-draft", "formula-derived-from-cabana"]
  );
});

test("buildFormulaLibrary preserves default behavior without retired seed keys", () => {
  const library = buildFormulaLibrary(
    [
      {
        formulaKey: "seed-hero-original",
        name: "Hero Original",
        ingredients: [{ name: "Bergamot EO FCF", g: 10, note: "top" }],
      },
    ],
    [
      {
        formulaKey: "seed-cabana-confessions-1",
        name: "Cabana Override",
        isSeeded: true,
        sourceType: "seeded_override",
        ingredients: [{ name: "Habanolide", g: 5, note: "base" }],
      },
    ],
    {}
  );

  assert.deepEqual(
    library.map((record) => record.formulaKey),
    ["seed-hero-original", "seed-cabana-confessions-1"]
  );
});

test("buildFormulaLibrary filters retired seed overrides when keys are provided", () => {
  const library = buildFormulaLibrary(
    [
      {
        formulaKey: "seed-hero-original",
        name: "Hero Original",
        ingredients: [{ name: "Bergamot EO FCF", g: 10, note: "top" }],
      },
    ],
    [
      {
        formulaKey: "seed-cabana-confessions-1",
        name: "Cabana Override",
        isSeeded: true,
        sourceType: "seeded_override",
        ingredients: [{ name: "Habanolide", g: 5, note: "base" }],
      },
      {
        formulaKey: "custom-launch-draft",
        name: "Custom Launch Draft",
        isSeeded: false,
        sourceType: "custom",
        createdAt: "2026-01-01T00:00:00.000Z",
        ingredients: [{ name: "Iso E Super", g: 7, note: "base" }],
      },
      {
        formulaKey: "formula-derived-from-cabana",
        name: "Cabana Derived Draft",
        isSeeded: false,
        sourceType: "version",
        seedSourceKey: "seed-cabana-confessions-1",
        createdAt: "2026-01-02T00:00:00.000Z",
        ingredients: [{ name: "Helvetolide", g: 8, note: "base" }],
      },
    ],
    { retiredSeedKeys: LEGACY_FORMULA_SEED_KEYS_2026_06_07 }
  );

  assert.deepEqual(
    library.map((record) => record.formulaKey),
    [
      "seed-hero-original",
      "custom-launch-draft",
      "formula-derived-from-cabana",
    ]
  );
});

test("buildFormulaLibrary keeps unrelated seeds and their overrides", () => {
  const library = buildFormulaLibrary(
    [
      {
        formulaKey: "seed-hero-original",
        name: "Hero Original",
        ingredients: [{ name: "Bergamot EO FCF", g: 10, note: "top" }],
      },
      {
        formulaKey: "seed-active-test-1",
        name: "Active Test 1",
        ingredients: [{ name: "Habanolide", g: 10, note: "base" }],
      },
    ],
    [
      {
        formulaKey: "seed-active-test-1",
        name: "Active Test Override",
        isSeeded: true,
        sourceType: "seeded_override",
        ingredients: [{ name: "Helvetolide", g: 12, note: "base" }],
      },
    ],
    { retiredSeedKeys: LEGACY_FORMULA_SEED_KEYS_2026_06_07 }
  );

  assert.deepEqual(
    library.map((record) => [record.formulaKey, record.name]),
    [
      ["seed-hero-original", "Hero Original"],
      ["seed-active-test-1", "Active Test Override"],
    ]
  );
});
