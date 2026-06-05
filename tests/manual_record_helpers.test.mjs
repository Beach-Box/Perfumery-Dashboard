import test from "node:test";
import assert from "node:assert/strict";

import {
  getChangedManualFieldKeys,
  normalizeManualComparableValue,
  normalizeManualRecordText,
} from "../src/lib/manual_record_helpers.js";

test("normalizeManualRecordText turns missing and blank values into null", () => {
  assert.equal(normalizeManualRecordText(null), null);
  assert.equal(normalizeManualRecordText(undefined), null);
  assert.equal(normalizeManualRecordText(""), null);
  assert.equal(normalizeManualRecordText("   "), null);
});

test("normalizeManualRecordText trims strings and stringifies scalars", () => {
  assert.equal(normalizeManualRecordText("  CAS value  "), "CAS value");
  assert.equal(normalizeManualRecordText(42), "42");
  assert.equal(normalizeManualRecordText(0), "0");
  assert.equal(normalizeManualRecordText(true), "true");
  assert.equal(normalizeManualRecordText(false), "false");
});

test("normalizeManualComparableValue normalizes missing and blank values", () => {
  assert.equal(normalizeManualComparableValue(null), "");
  assert.equal(normalizeManualComparableValue(undefined), "");
  assert.equal(normalizeManualComparableValue(""), "");
  assert.equal(normalizeManualComparableValue("   "), "");
});

test("normalizeManualComparableValue trims strings and stringifies scalars", () => {
  assert.equal(normalizeManualComparableValue("  CAS value  "), "CAS value");
  assert.equal(normalizeManualComparableValue(42), "42");
  assert.equal(normalizeManualComparableValue(0), "0");
  assert.equal(normalizeManualComparableValue(true), "true");
  assert.equal(normalizeManualComparableValue(false), "false");
});

test("normalizeManualComparableValue stringifies arrays and keeps order-sensitive output", () => {
  assert.equal(normalizeManualComparableValue(["a", "b"]), '["a","b"]');
  assert.notEqual(
    normalizeManualComparableValue(["a", "b"]),
    normalizeManualComparableValue(["b", "a"])
  );
});

test("normalizeManualComparableValue stringifies objects and keeps key-order-sensitive output", () => {
  assert.equal(
    normalizeManualComparableValue({ first: 1, second: 2 }),
    '{"first":1,"second":2}'
  );
  assert.notEqual(
    normalizeManualComparableValue({ first: 1, second: 2 }),
    normalizeManualComparableValue({ second: 2, first: 1 })
  );
});

test("getChangedManualFieldKeys ignores null, empty string, and whitespace equivalents", () => {
  assert.deepEqual(
    getChangedManualFieldKeys(
      { missing: null, empty: "", whitespace: "   " },
      { missing: "", empty: "   ", whitespace: null }
    ),
    []
  );
});

test("getChangedManualFieldKeys detects changed trimmed strings", () => {
  assert.deepEqual(
    getChangedManualFieldKeys(
      { cas: "123-45-6", note: " top " },
      { cas: " 123-45-6 ", note: "mid" }
    ),
    ["note"]
  );
});

test("getChangedManualFieldKeys preserves numeric string comparison quirks", () => {
  assert.deepEqual(
    getChangedManualFieldKeys({ amount: 1 }, { amount: "1" }),
    []
  );
  assert.deepEqual(
    getChangedManualFieldKeys({ amount: 1 }, { amount: "1.0" }),
    ["amount"]
  );
});

test("getChangedManualFieldKeys compares arrays and objects by JSON string", () => {
  assert.deepEqual(
    getChangedManualFieldKeys(
      {
        pricePoints: [[10, "g", 12.5]],
        attachment: { fileName: "sds.pdf", mimeType: "application/pdf" },
      },
      {
        pricePoints: [[10, "g", 12.5]],
        attachment: { fileName: "sds.pdf", mimeType: "application/pdf" },
      }
    ),
    []
  );
  assert.deepEqual(
    getChangedManualFieldKeys(
      {
        pricePoints: [[10, "g", 12.5]],
        attachment: { fileName: "sds.pdf", mimeType: "application/pdf" },
      },
      {
        pricePoints: [[12.5, "g", 10]],
        attachment: { mimeType: "application/pdf", fileName: "sds.pdf" },
      }
    ),
    ["pricePoints", "attachment"]
  );
});

test("getChangedManualFieldKeys only considers keys present in nextValues", () => {
  assert.deepEqual(
    getChangedManualFieldKeys({ removedOnly: "current", kept: "same" }, { kept: "same" }),
    []
  );
  assert.deepEqual(
    getChangedManualFieldKeys({ kept: "same" }, { kept: "same", added: "next" }),
    ["added"]
  );
});
