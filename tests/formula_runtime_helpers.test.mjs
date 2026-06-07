import test from "node:test";
import assert from "node:assert/strict";

import {
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
