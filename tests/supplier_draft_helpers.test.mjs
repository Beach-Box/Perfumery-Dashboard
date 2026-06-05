import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeSupplierDraftPricePoint,
  normalizeSupplierDraftUrl,
} from "../src/lib/supplier_draft_helpers.js";

test("normalizeSupplierDraftUrl returns null for missing or blank values", () => {
  assert.equal(normalizeSupplierDraftUrl(null), null);
  assert.equal(normalizeSupplierDraftUrl(undefined), null);
  assert.equal(normalizeSupplierDraftUrl(""), null);
  assert.equal(normalizeSupplierDraftUrl("   "), null);
});

test("normalizeSupplierDraftUrl preserves URL canonicalization, removes hashes, and trims trailing slash", () => {
  assert.equal(
    normalizeSupplierDraftUrl("  https://example.com/Product Path/?q=1#details  "),
    "https://example.com/Product%20Path/?q=1"
  );
  assert.equal(
    normalizeSupplierDraftUrl("https://example.com/products/material/"),
    "https://example.com/products/material"
  );
  assert.equal(
    normalizeSupplierDraftUrl("https://example.com/"),
    "https://example.com"
  );
});

test("normalizeSupplierDraftUrl lowercases invalid raw text after trimming", () => {
  assert.equal(normalizeSupplierDraftUrl("  NOT A URL  "), "not a url");
  assert.equal(normalizeSupplierDraftUrl("Product Handle"), "product handle");
});

test("normalizeSupplierDraftPricePoint rejects non-array and wrong-length values", () => {
  assert.equal(normalizeSupplierDraftPricePoint(null), null);
  assert.equal(normalizeSupplierDraftPricePoint({}), null);
  assert.equal(normalizeSupplierDraftPricePoint([10, "g"]), null);
  assert.equal(normalizeSupplierDraftPricePoint([10, "g", 12, "extra"]), null);
});

test("normalizeSupplierDraftPricePoint enforces quantity, unit, and price rules", () => {
  assert.equal(normalizeSupplierDraftPricePoint([0, "g", 12]), null);
  assert.equal(normalizeSupplierDraftPricePoint([-1, "g", 12]), null);
  assert.equal(normalizeSupplierDraftPricePoint([Number.NaN, "g", 12]), null);
  assert.equal(normalizeSupplierDraftPricePoint([10, "   ", 12]), null);
  assert.equal(normalizeSupplierDraftPricePoint([10, "g", -1]), null);
  assert.equal(normalizeSupplierDraftPricePoint([10, "g", Number.NaN]), null);
});

test("normalizeSupplierDraftPricePoint parses numeric strings and preserves tuple shape", () => {
  assert.deepEqual(
    normalizeSupplierDraftPricePoint(["10", " g ", "12.5"]),
    [10, "g", 12.5]
  );
  assert.deepEqual(
    normalizeSupplierDraftPricePoint([1, "ml", 0]),
    [1, "ml", 0]
  );
});
