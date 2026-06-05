import test from "node:test";
import assert from "node:assert/strict";

import {
  formatIfraValueLabel,
  getSupplierIfraSupportLabel,
} from "../src/lib/ifra_display_helpers.js";

test("formatIfraValueLabel preserves current missing and invalid value behavior", () => {
  assert.equal(formatIfraValueLabel(undefined), "Missing");
  assert.equal(formatIfraValueLabel("not-a-number"), "Missing");
  assert.equal(formatIfraValueLabel(Number.POSITIVE_INFINITY), "Missing");
});

test("formatIfraValueLabel formats numeric and numeric-string values", () => {
  assert.equal(formatIfraValueLabel(null), "0%");
  assert.equal(formatIfraValueLabel(0), "0%");
  assert.equal(formatIfraValueLabel(""), "0%");
  assert.equal(formatIfraValueLabel(2), "2%");
  assert.equal(formatIfraValueLabel("2"), "2%");
  assert.equal(formatIfraValueLabel(0.4), "0.40%");
  assert.equal(formatIfraValueLabel("0.4"), "0.40%");
  assert.equal(formatIfraValueLabel(2.345), "2.35%");
});

test("getSupplierIfraSupportLabel formats supplier percent support", () => {
  assert.equal(
    getSupplierIfraSupportLabel({ ifraPercent: 0 }),
    "IFRA shown 0%"
  );
  assert.equal(
    getSupplierIfraSupportLabel({ ifraPercent: "0.4" }),
    "IFRA shown 0.40%"
  );
  assert.equal(
    getSupplierIfraSupportLabel({
      ifraPercent: "",
      ifraRestrictionState: "no_restriction",
      ifraRestrictionLabel: "No restrictions",
    }),
    "IFRA shown 0%"
  );
});

test("getSupplierIfraSupportLabel preserves no-restriction label behavior", () => {
  assert.equal(
    getSupplierIfraSupportLabel({
      ifraRestrictionState: " no_restriction ",
      ifraRestrictionLabel: "No restrictions shown",
    }),
    "No restrictions shown"
  );
  assert.equal(
    getSupplierIfraSupportLabel({
      ifraRestrictionState: "NO_RESTRICTION",
      ifraRestrictionLabel: "   ",
    }),
    "No restrictions"
  );
  assert.equal(
    getSupplierIfraSupportLabel({ ifraRestrictionState: "no_restriction" }),
    "No restrictions"
  );
});

test("getSupplierIfraSupportLabel falls back to null without usable support", () => {
  assert.equal(getSupplierIfraSupportLabel(), null);
  assert.equal(getSupplierIfraSupportLabel({}), null);
  assert.equal(getSupplierIfraSupportLabel({ ifraPercent: "not-a-number" }), null);
  assert.equal(
    getSupplierIfraSupportLabel({ ifraRestrictionState: "restricted" }),
    null
  );
});
