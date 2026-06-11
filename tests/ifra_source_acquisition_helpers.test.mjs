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
  assert.equal(panel.documentInventory.isAvailable, false);
  assert.equal(panel.candidateReview.isAvailable, false);
  assert.match(panel.candidateReview.regenerateCommand, /build_candidate_ifra_review_queue/);
  assert.equal(panel.evidenceResolver.isAvailable, false);
  assert.match(panel.evidenceResolver.regenerateCommand, /resolve_ifra_evidence_candidates/);
  assert.match(panel.guardrail, /Not launch clearance/i);
});

test("IFRA source acquisition panel summarizes counts, review status, and top gaps", () => {
  const panel = buildIfraSourceAcquisitionPanel(
    {
      summary: {
        itemCount: 4,
        statusCounts: { needed: 2, acquired: 1, deferred: 1 },
        reviewStatusCounts: { not_started: 2, needs_review: 1, reviewed_ok: 1 },
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
    },
    {
      summary: {
        documentCount: 2,
        matchedDocumentCount: 1,
        possibleMatchDocumentCount: 1,
        unmatchedDocumentCount: 0,
      },
      documents: [
        {
          id: "doc-iso",
          filename: "Iso_E_Super_IFRA.pdf",
          matchedQueueItemIds: ["iso-e"],
          matchConfidence: "high",
        },
        {
          id: "doc-ambiguous",
          filename: "Seaweed_IFRA.pdf",
          matchedQueueItemIds: [],
          matchConfidence: "low",
          materialGuess: "Seaweed",
          sourceTypeGuess: "supplier_ifra",
          possibleMatches: [{ materialName: "Seaweed Absolute 10%" }],
        },
      ],
    },
    {
      summary: {
        itemCount: 3,
        highPriorityItemCount: 2,
        notStartedCount: 1,
        inReviewCount: 1,
        acceptedCount: 1,
        rejectedCount: 0,
        needsMoreSourceCount: 1,
      },
      items: [
        {
          id: "review-iso",
          queueItemId: "iso-e",
          materialName: "Iso E Super",
          highestPriority: "high",
          candidateCount: 12,
          reviewStatus: "in_review",
          requiredSourceType: "global_ifra_standard_needed",
        },
        {
          id: "review-seaweed",
          queueItemId: "seaweed",
          materialName: "Seaweed Absolute 10%",
          highestPriority: "high",
          candidateCount: 4,
          reviewStatus: "not_started",
          requiredSourceType: "natural_uvcb_supplier_document_needed",
        },
        {
          id: "review-accepted",
          queueItemId: "hedione",
          materialName: "Hedione",
          highestPriority: "medium",
          candidateCount: 2,
          reviewStatus: "accepted",
          requiredSourceType: "already_structured",
        },
      ],
    },
    {
      summary: {
        reviewReadyCount: 2,
        likelyFcfEvidenceCount: 1,
        insufficientEvidenceCount: 4,
        needsSupplierDocCount: 3,
      },
      items: [
        {
          id: "resolution-iso",
          queueItemId: "iso-e",
          materialName: "Iso E Super",
          evidenceStatus: "review_ready",
          suggestedAction: "review_top_candidate",
          confidence: "high",
          score: 102,
          bestCandidates: [{ id: "candidate-iso", sourceUrl: "https://example.test/iso" }],
          whySelected: "Supplier evidence matched.",
        },
        {
          id: "resolution-bergamot",
          queueItemId: "bergamot-fcf",
          materialName: "Bergamot EO FCF",
          evidenceStatus: "likely_fcf_evidence",
          suggestedAction: "promote_fcf_evidence_after_review",
          confidence: "medium",
          score: 88,
          bestCandidates: [{ id: "candidate-bergamot" }],
          whySelected: "FCF wording matched.",
        },
      ],
    }
  );

  assert.equal(panel.isAvailable, true);
  assert.equal(panel.counts.total, 4);
  assert.equal(panel.counts.highPriorityRemaining, 2);
  assert.equal(panel.counts.acquired, 1);
  assert.equal(panel.counts.needsReview, 1);
  assert.equal(panel.counts.reviewedOk, 1);
  assert.equal(panel.counts.deferred, 1);
  assert.equal(panel.documentInventory.isAvailable, true);
  assert.equal(panel.documentInventory.counts.documentsFound, 2);
  assert.equal(panel.documentInventory.counts.matchedDocuments, 1);
  assert.deepEqual(
    panel.documentInventory.topUnmatchedDocuments.map((document) => document.filename),
    ["Seaweed_IFRA.pdf"]
  );
  assert.deepEqual(
    panel.documentInventory.topQueueItemsNeedingDocuments.map((item) => item.materialName),
    ["Seaweed Absolute 10%"]
  );
  assert.deepEqual(
    panel.topRemainingGaps.map((gap) => gap.materialName),
    ["Iso E Super", "Seaweed Absolute 10%"]
  );
  assert.equal(panel.topRemainingGaps[0].sourceTypeLabel, "global IFRA standard");
  assert.equal(panel.candidateReview.isAvailable, true);
  assert.equal(panel.candidateReview.counts.highPriorityReviewItems, 2);
  assert.equal(panel.candidateReview.counts.notStarted, 1);
  assert.equal(panel.candidateReview.counts.inReview, 1);
  assert.equal(panel.candidateReview.counts.accepted, 1);
  assert.equal(panel.candidateReview.counts.needsMoreSource, 1);
  assert.deepEqual(
    panel.candidateReview.topMaterialsAwaitingReview.map((item) => item.materialName),
    ["Iso E Super", "Seaweed Absolute 10%"]
  );
  assert.equal(panel.evidenceResolver.isAvailable, true);
  assert.equal(panel.evidenceResolver.counts.reviewReady, 2);
  assert.equal(panel.evidenceResolver.counts.likelyFcfEvidence, 1);
  assert.equal(panel.evidenceResolver.counts.insufficientEvidence, 4);
  assert.deepEqual(
    panel.evidenceResolver.topReviewFirstMaterials.map((item) => item.materialName),
    ["Iso E Super", "Bergamot EO FCF"]
  );
});
