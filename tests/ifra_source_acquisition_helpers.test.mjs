import test from "node:test";
import assert from "node:assert/strict";

import {
  IFRA_SOURCE_ACQUISITION_MISSING_MESSAGE,
  buildIfraSourceAcquisitionPanel,
} from "../src/lib/ifra_source_acquisition_helpers.js";

test("IFRA source acquisition panel returns a missing queue fallback", () => {
  const panel = buildIfraSourceAcquisitionPanel(null);

  assert.equal(panel.isAvailable, false);
  assert.equal(panel.missingMessage, IFRA_SOURCE_ACQUISITION_MISSING_MESSAGE);
  assert.equal(panel.counts.highPriorityRemaining, 0);
  assert.deepEqual(panel.topRemainingGaps, []);
  assert.match(panel.guardrail, /Not launch clearance/i);
});

test("IFRA source acquisition panel summarizes counts and top remaining gaps", () => {
  const panel = buildIfraSourceAcquisitionPanel({
    summary: {
      itemCount: 4,
      statusCounts: { needed: 2, acquired: 1, deferred: 1 },
      priorityCounts: { high: 3, low: 1 },
      requiredSourceTypeCounts: {
        natural_uvcb_supplier_document_needed: 1,
        global_ifra_standard_needed: 1,
        already_structured: 1,
        accord_component_expansion_deferred: 1,
      },
      highPriorityRemainingCount: 2,
    },
    items: [
      {
        id: "seaweed",
        materialName: "Seaweed Absolute 10%",
        priority: "high",
        requiredSourceType: "natural_uvcb_supplier_document_needed",
        status: "needed",
        reviewStatus: "not_started",
        formulasUsedIn: ["Skin-Air Bridge"],
      },
      {
        id: "iso-e",
        materialName: "Iso E Super",
        priority: "high",
        requiredSourceType: "global_ifra_standard_needed",
        status: "acquired",
        reviewStatus: "needs_review",
        formulasUsedIn: ["Damp Shoreline v1"],
      },
      {
        id: "hedione",
        materialName: "Hedione",
        priority: "high",
        requiredSourceType: "already_structured",
        status: "not_applicable",
        reviewStatus: "reviewed_ok",
      },
      {
        id: "accord",
        materialName: "Driftwood Accord",
        priority: "low",
        requiredSourceType: "accord_component_expansion_deferred",
        status: "deferred",
        reviewStatus: "not_started",
      },
    ],
  });

  assert.equal(panel.isAvailable, true);
  assert.equal(panel.counts.total, 4);
  assert.equal(panel.counts.highPriorityRemaining, 2);
  assert.equal(panel.counts.acquired, 1);
  assert.equal(panel.counts.deferred, 1);
  assert.deepEqual(
    panel.topRemainingGaps.map((gap) => gap.materialName),
    ["Iso E Super", "Seaweed Absolute 10%"]
  );
  assert.equal(panel.topRemainingGaps[0].sourceTypeLabel, "global IFRA standard");
});
