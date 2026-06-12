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
  assert.equal(panel.sourceAcquisitionAutopilot.isAvailable, false);
  assert.match(
    panel.sourceAcquisitionAutopilot.regenerateCommand,
    /run_ifra_source_acquisition_autopilot/
  );
  assert.equal(panel.launchCriticalExceptions.isAvailable, false);
  assert.match(
    panel.launchCriticalExceptions.regenerateCommand,
    /generate_launch_critical_ifra_exception_pack/
  );
  assert.equal(panel.autopilot.isAvailable, false);
  assert.match(panel.autopilot.regenerateCommand, /run_ifra_evidence_autopilot/);
  assert.equal(panel.recommendations.isAvailable, false);
  assert.match(
    panel.recommendations.regenerateCommand,
    /generate_ifra_autopilot_recommendations/
  );
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
    },
    {
      metadata: {
        generatedAt: "2026-06-11T12:00:00.000Z",
        regenerateCommand:
          "node scripts/run_ifra_evidence_autopilot.mjs --markdown --write docs/ifra/ifra_evidence_autopilot_report.md",
      },
      summary: {
        reviewReadyCount: 2,
        likelyFcfEvidenceCount: 1,
        unresolvedCount: 5,
        autoUpdatedReviewStatusCount: 3,
        alreadyReviewedCount: 1,
        nextRecommendedAction:
          "Review the top category-limit candidate before promotion.",
      },
      topReviewReadyMaterials: [
        {
          queueItemId: "iso-e",
          materialName: "Iso E Super",
          autopilotClass: "auto_review_ready",
          suggestedAction: "review_top_candidate",
          confidence: "high",
          sourceUrl: "https://example.test/iso",
          whySelected: "Strong source.",
        },
      ],
    },
    {
      metadata: {
        regenerateCommand:
          "node scripts/generate_ifra_autopilot_recommendations.mjs --markdown --write docs/ifra/ifra_autopilot_recommendations.md",
      },
      summary: {
        proposedStructuredRecordCount: 12,
        autoAcceptedNonLimitEvidenceCount: 2,
        needsBetterSourceCount: 4,
        noUsefulEvidenceCount: 1,
        rejectedNoiseCount: 18,
        alreadyHandledCount: 5,
        nextRecommendedAction:
          "12 proposed records can be reviewed for promotion. No runtime IFRA limits have been changed.",
      },
      proposedStructuredRecords: [
        {
          id: "proposed-iso",
          materialName: "Iso E Super",
          sourceIdentityName: "Iso E Super",
          recordType: "ifra_category_limit",
          category: "4",
          candidateValue: "100",
          candidateUnit: "%",
          evidenceConfidence: "high",
          sourceUrl: "https://example.test/iso",
        },
      ],
      needsBetterSource: [
        {
          queueItemId: "seaweed",
          materialName: "Seaweed Absolute 10%",
          sourceIdentityName: "Seaweed Absolute",
          recommendationStatus: "needs_better_source",
          suggestedAction: "Need supplier IFRA/SDS.",
          evidenceStatus: "needs_supplier_doc",
        },
      ],
    },
    {
      metadata: {
        generatedAt: "2026-06-11T13:00:00.000Z",
        regenerateCommand:
          "node scripts/run_ifra_source_acquisition_autopilot.mjs --markdown --write docs/ifra/ifra_source_acquisition_autopilot_report.md",
      },
      summary: {
        materialsTargeted: 11,
        newSourcesFound: 3,
        newOfficialMatchesFound: 1,
        newSupplierIfraSdsSpecDocsFound: 2,
        newProposedStructuredRecords: 2,
        remainingNeedsBetterSource: 7,
        newLinksDiscovered: 4,
        downloadsSucceeded: 3,
        nextAutomatedAction:
          "Inspect newly cached supplier documents before promotion.",
      },
    },
    {
      metadata: {
        generatedAt: "2026-06-11T14:00:00.000Z",
        regenerateCommand:
          "node scripts/generate_launch_critical_ifra_exception_pack.mjs --markdown --write docs/ifra/launch_critical_ifra_exception_pack.md",
      },
      summary: {
        launchCriticalExceptionCount: 4,
        alreadyHandledCount: 2,
        deferUntilFinalistCount: 3,
        blockedBySourceAvailabilityCount: 1,
        nextRecommendedAction:
          "Use this pack as the daily IFRA view and resolve launch-critical exceptions first.",
      },
      groups: {
        launchCriticalAcrossAllActiveFormulas: [
          {
            queueItemId: "iso-e",
            material: "Iso E Super",
            sourceIdentity: "Iso E Super",
            currentFormulaRelevance: "Used in all active hero formulas",
            evidenceQuality: "supplier_product_page_only",
            launchConfidenceImpact:
              "High. It appears across all active hero formulas.",
            recommendedNextAction:
              "Seek official/global support before promotion.",
          },
        ],
      },
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
  assert.equal(panel.sourceAcquisitionAutopilot.isAvailable, true);
  assert.equal(panel.sourceAcquisitionAutopilot.counts.materialsTargeted, 11);
  assert.equal(panel.sourceAcquisitionAutopilot.counts.newSourcesFound, 3);
  assert.equal(
    panel.sourceAcquisitionAutopilot.counts.newProposedStructuredRecords,
    2
  );
  assert.equal(panel.sourceAcquisitionAutopilot.counts.remainingNeedsBetterSource, 7);
  assert.match(
    panel.sourceAcquisitionAutopilot.regenerateCommand,
    /run_ifra_source_acquisition_autopilot/
  );
  assert.equal(panel.launchCriticalExceptions.isAvailable, true);
  assert.equal(
    panel.launchCriticalExceptions.counts.launchCriticalExceptions,
    4
  );
  assert.equal(panel.launchCriticalExceptions.counts.alreadyHandled, 2);
  assert.equal(panel.launchCriticalExceptions.counts.deferUntilFinalist, 3);
  assert.equal(
    panel.launchCriticalExceptions.counts.blockedBySourceAvailability,
    1
  );
  assert.deepEqual(
    panel.launchCriticalExceptions.topLaunchCriticalExceptions.map(
      (item) => item.materialName
    ),
    ["Iso E Super"]
  );
  assert.match(
    panel.launchCriticalExceptions.regenerateCommand,
    /generate_launch_critical_ifra_exception_pack/
  );
  assert.equal(panel.autopilot.isAvailable, true);
  assert.equal(panel.autopilot.counts.reviewReady, 2);
  assert.equal(panel.autopilot.counts.likelyFcfEvidence, 1);
  assert.equal(panel.autopilot.counts.unresolved, 5);
  assert.equal(panel.autopilot.counts.autoUpdated, 3);
  assert.equal(panel.autopilot.counts.alreadyReviewed, 1);
  assert.match(panel.autopilot.regenerateCommand, /run_ifra_evidence_autopilot/);
  assert.deepEqual(
    panel.autopilot.topReviewFirstMaterials.map((item) => item.materialName),
    ["Iso E Super"]
  );
  assert.equal(panel.recommendations.isAvailable, true);
  assert.equal(panel.recommendations.counts.proposedStructuredRecords, 12);
  assert.equal(panel.recommendations.counts.autoAcceptedNonLimitEvidence, 2);
  assert.equal(panel.recommendations.counts.needsBetterSource, 5);
  assert.equal(panel.recommendations.counts.rejectedNoise, 18);
  assert.deepEqual(
    panel.recommendations.topProposedRecords.map((record) => record.materialName),
    ["Iso E Super"]
  );
  assert.deepEqual(
    panel.recommendations.topNeedsBetterSource.map((item) => item.materialName),
    ["Seaweed Absolute 10%"]
  );
  assert.match(panel.recommendations.guardrail, /no runtime IFRA limits/i);
});
