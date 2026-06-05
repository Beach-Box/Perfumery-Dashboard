import test from "node:test";
import assert from "node:assert/strict";

import {
  formatSupplierAdapterPricePointsForTextarea,
  formatSupplierReviewContextValue,
} from "../src/lib/supplier_display_helpers.js";

test("formatSupplierAdapterPricePointsForTextarea returns empty text for empty or non-array input", () => {
  assert.equal(formatSupplierAdapterPricePointsForTextarea(), "");
  assert.equal(formatSupplierAdapterPricePointsForTextarea(null), "");
  assert.equal(formatSupplierAdapterPricePointsForTextarea({}), "");
});

test("formatSupplierAdapterPricePointsForTextarea formats one price point", () => {
  assert.equal(
    formatSupplierAdapterPricePointsForTextarea([[10, "g", 12.5]]),
    "10 g 12.5"
  );
});

test("formatSupplierAdapterPricePointsForTextarea joins multiple price points with newlines", () => {
  assert.equal(
    formatSupplierAdapterPricePointsForTextarea([
      [10, "g", 12.5, "10% TEC"],
      [30, "ml", 42, "  limited stock  "],
    ]),
    "10 g 12.5 10% TEC\n30 ml 42 limited stock"
  );
});

test("formatSupplierAdapterPricePointsForTextarea skips rows missing required fields", () => {
  assert.equal(
    formatSupplierAdapterPricePointsForTextarea([
      [null, "g", 12.5],
      [10, "", 12.5],
      [10, "g", null],
      [0, "g", 0, 0],
    ]),
    "0 g 0"
  );
});

test("formatSupplierReviewContextValue falls back for missing values", () => {
  assert.equal(formatSupplierReviewContextValue(), "—");
  assert.equal(formatSupplierReviewContextValue(null), "—");
  assert.equal(formatSupplierReviewContextValue(""), "—");
  assert.equal(formatSupplierReviewContextValue("   "), "—");
});

test("formatSupplierReviewContextValue formats scalar values with current string coercion", () => {
  assert.equal(formatSupplierReviewContextValue("  CAS value  "), "CAS value");
  assert.equal(formatSupplierReviewContextValue(42), "42");
  assert.equal(formatSupplierReviewContextValue(0), "0");
  assert.equal(formatSupplierReviewContextValue(true), "true");
  assert.equal(formatSupplierReviewContextValue(false), "false");
  assert.equal(formatSupplierReviewContextValue({ field: "value" }), "[object Object]");
});

test("formatSupplierReviewContextValue joins array values and skips falsy items", () => {
  assert.equal(
    formatSupplierReviewContextValue([
      " CAS ",
      null,
      "",
      0,
      false,
      " INCI ",
      true,
      { field: "value" },
    ]),
    "CAS · INCI · true · [object Object]"
  );
  assert.equal(formatSupplierReviewContextValue([null, "", 0, false]), "—");
});
