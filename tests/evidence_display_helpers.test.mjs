import test from "node:test";
import assert from "node:assert/strict";

import {
  getEvidenceCandidateConfidenceLabel,
  getEvidenceCandidateDisplayValue,
} from "../src/lib/evidence_display_helpers.js";

test("getEvidenceCandidateDisplayValue falls back for missing or empty values", () => {
  assert.equal(getEvidenceCandidateDisplayValue(null), "—");
  assert.equal(getEvidenceCandidateDisplayValue(undefined), "—");
  assert.equal(getEvidenceCandidateDisplayValue({}), "—");
  assert.equal(getEvidenceCandidateDisplayValue({ candidateValue: "" }), "—");
  assert.equal(getEvidenceCandidateDisplayValue({ candidateValue: 0 }), "—");
});

test("getEvidenceCandidateDisplayValue preserves boolean and array behavior", () => {
  const candidateValue = ["CAS", "INCI"];

  assert.equal(
    getEvidenceCandidateDisplayValue({ candidateValue: true }),
    "true"
  );
  assert.equal(
    getEvidenceCandidateDisplayValue({ candidateValue: false }),
    "false"
  );
  assert.equal(
    getEvidenceCandidateDisplayValue({ candidateValue }),
    candidateValue
  );
});

test("getEvidenceCandidateDisplayValue prefers displayValue over candidateValue", () => {
  assert.equal(
    getEvidenceCandidateDisplayValue({
      displayValue: "Displayed CAS",
      candidateValue: "Raw CAS",
    }),
    "Displayed CAS"
  );
  assert.equal(
    getEvidenceCandidateDisplayValue({ candidateValue: "Raw scalar" }),
    "Raw scalar"
  );
});

test("getEvidenceCandidateConfidenceLabel prefers labels and falls back to unknown", () => {
  assert.equal(
    getEvidenceCandidateConfidenceLabel({
      confidenceLabel: "Likely",
      confidence: "high",
    }),
    "Likely"
  );
  assert.equal(
    getEvidenceCandidateConfidenceLabel({ confidence: "medium" }),
    "medium"
  );
  assert.equal(getEvidenceCandidateConfidenceLabel({}), "unknown");
  assert.equal(getEvidenceCandidateConfidenceLabel(null), "unknown");
});
