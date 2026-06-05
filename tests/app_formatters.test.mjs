import test from "node:test";
import assert from "node:assert/strict";

import {
  compactRefreshFieldLabelList,
  formatHumanList,
  formatSupplierAvailabilityLabel,
  pluralizeLabel,
} from "../src/lib/app_formatters.js";

test("pluralizeLabel chooses singular only for one", () => {
  assert.equal(pluralizeLabel(1, "supplier"), "supplier");
  assert.equal(pluralizeLabel(0, "supplier"), "suppliers");
  assert.equal(pluralizeLabel(2, "area", "areas"), "areas");
});

test("formatHumanList formats empty, short, and comma-separated lists", () => {
  assert.equal(formatHumanList([]), "None");
  assert.equal(formatHumanList(["CAS"]), "CAS");
  assert.equal(formatHumanList(["CAS", "INCI"]), "CAS and INCI");
  assert.equal(formatHumanList(["CAS", "INCI", "SDS"]), "CAS, INCI, and SDS");
});

test("compactRefreshFieldLabelList keeps short lists explicit and compacts long lists", () => {
  assert.equal(compactRefreshFieldLabelList([]), "");
  assert.equal(compactRefreshFieldLabelList(["Price"]), "Price");
  assert.equal(
    compactRefreshFieldLabelList(["Price", "Availability"]),
    "Price + Availability"
  );
  assert.equal(
    compactRefreshFieldLabelList(["Price", "Availability", "SDS", "IFRA"]),
    "Price + Availability +2 more"
  );
});

test("formatSupplierAvailabilityLabel formats known statuses and preserves fallback behavior", () => {
  assert.equal(formatSupplierAvailabilityLabel("in stock"), "In stock");
  assert.equal(formatSupplierAvailabilityLabel("  LIMITED STOCK  "), "Limited stock");
  assert.equal(formatSupplierAvailabilityLabel("special order"), "special order");
  assert.equal(formatSupplierAvailabilityLabel(""), "Unknown");
});
