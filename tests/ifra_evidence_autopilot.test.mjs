import test from "node:test";
import assert from "node:assert/strict";

import {
  applyAutopilotReviewUpdates,
  buildIfraEvidenceAutopilotReport,
  classifyAutopilotResolutionItem,
  formatIfraEvidenceAutopilotMarkdown,
} from "../scripts/lib/ifra_evidence_autopilot.mjs";

function queueItem(overrides = {}) {
  return {
    id: "hero-ifra-source-ambroxan-global_ifra_standard_needed",
    materialName: "Ambroxan Crystals",
    formulasUsedIn: ["Skin-Air Bridge"],
    requiredSourceType: "global_ifra_standard_needed",
    priority: "high",
    status: "needed",
    reviewStatus: "not_started",
    sourceNotes: "",
    reviewNotes: "",
    ...overrides,
  };
}

function reviewItem(overrides = {}) {
  return {
    id: "candidate-ifra-review-ambroxan",
    queueItemId: "hero-ifra-source-ambroxan-global_ifra_standard_needed",
    materialName: "Ambroxan Crystals",
    reviewStatus: "not_started",
    acceptedCandidateIds: [],
    rejectedCandidateIds: [],
    reviewNotes: "",
    candidateIds: ["candidate-ambroxan-cat4"],
    ...overrides,
  };
}

function resolutionItem(overrides = {}) {
  return {
    queueItemId: "hero-ifra-source-ambroxan-global_ifra_standard_needed",
    materialName: "Ambroxan Crystals",
    formulasUsedIn: ["Skin-Air Bridge"],
    evidenceStatus: "review_ready",
    suggestedAction: "review_top_candidate",
    confidence: "high",
    score: 98,
    candidateReviewItemId: "candidate-ifra-review-ambroxan",
    reviewedSourceRecordIds: [],
    bestCandidates: [
      {
        id: "candidate-ambroxan-cat4",
        candidateLimitType: "ifra_category_limit",
        sourceType: "supplier_product_page",
        snippet: "IFRA Category 4 maximum use candidate.",
      },
    ],
    whySelected: "Strong material-linked source candidate.",
    limitations: ["Review candidate and mark accepted only."],
    ...overrides,
  };
}

test("IFRA evidence autopilot classifies resolver statuses into workflow buckets", () => {
  assert.equal(
    classifyAutopilotResolutionItem({ evidenceStatus: "review_ready" }),
    "auto_review_ready"
  );
  assert.equal(
    classifyAutopilotResolutionItem({ evidenceStatus: "likely_fcf_evidence" }),
    "auto_likely_fcf_evidence"
  );
  assert.equal(
    classifyAutopilotResolutionItem({ evidenceStatus: "needs_supplier_doc" }),
    "auto_needs_supplier_doc"
  );
  assert.equal(
    classifyAutopilotResolutionItem({
      evidenceStatus: "insufficient_evidence",
      suggestedAction: "find_global_ifra_standard",
    }),
    "auto_needs_global_standard"
  );
  assert.equal(
    classifyAutopilotResolutionItem({ evidenceStatus: "identity_only" }),
    "auto_identity_only"
  );
  assert.equal(
    classifyAutopilotResolutionItem({ evidenceStatus: "already_reviewed" }),
    "auto_already_reviewed"
  );
});

test("IFRA evidence autopilot moves high-confidence review-ready items into review without accepting category limits", () => {
  const sourceQueue = { items: [queueItem()] };
  const candidateReviewQueue = { items: [reviewItem()] };
  const before = JSON.stringify({ sourceQueue, candidateReviewQueue });
  const result = applyAutopilotReviewUpdates({
    sourceQueue,
    candidateReviewQueue,
    evidenceResolution: { items: [resolutionItem()] },
    candidateExtractions: {
      candidates: [
        {
          id: "candidate-ambroxan-cat4",
          candidateLimitType: "ifra_category_limit",
        },
      ],
    },
    reviewedSourceRecords: { records: [] },
    now: "2026-06-11T12:00:00.000Z",
  });
  const updatedReview = result.candidateReviewQueue.items[0];

  assert.equal(updatedReview.reviewStatus, "in_review");
  assert.deepEqual(updatedReview.acceptedCandidateIds, []);
  assert.equal(result.autoUpdatedCount, 1);
  assert.equal(JSON.stringify({ sourceQueue, candidateReviewQueue }), before);
});

test("IFRA evidence autopilot marks source queue needs-more-source only when no manual review state exists", () => {
  const result = applyAutopilotReviewUpdates({
    sourceQueue: {
      items: [
        queueItem({
          id: "needs-doc",
          materialName: "Oceanol 10%",
          requiredSourceType: "specialty_supplier_document_needed",
        }),
        queueItem({
          id: "manual-note",
          materialName: "Seaweed Absolute 10%",
          reviewNotes: "Already emailed supplier.",
        }),
      ],
    },
    candidateReviewQueue: { items: [] },
    evidenceResolution: {
      items: [
        resolutionItem({
          queueItemId: "needs-doc",
          materialName: "Oceanol 10%",
          evidenceStatus: "needs_supplier_doc",
          suggestedAction: "request_supplier_ifra_or_sds",
          candidateReviewItemId: "",
          bestCandidates: [],
        }),
        resolutionItem({
          queueItemId: "manual-note",
          materialName: "Seaweed Absolute 10%",
          evidenceStatus: "insufficient_evidence",
          suggestedAction: "request_supplier_ifra_or_sds",
          candidateReviewItemId: "",
          bestCandidates: [],
        }),
      ],
    },
    now: "2026-06-11T12:00:00.000Z",
  });

  assert.equal(result.sourceQueue.items[0].reviewStatus, "needs_more_source");
  assert.equal(result.sourceQueue.items[1].reviewStatus, "not_started");
  assert.equal(result.sourceQueue.items[1].reviewNotes, "Already emailed supplier.");
});

test("IFRA evidence autopilot accepts existing reviewed FCF non-limit evidence", () => {
  const result = applyAutopilotReviewUpdates({
    sourceQueue: {
      items: [
        queueItem({
          id: "hero-ifra-source-bergamot-fcf-fcf_special_case",
          materialName: "Bergamot EO FCF",
          requiredSourceType: "fcf_special_case",
        }),
      ],
    },
    candidateReviewQueue: {
      items: [
        reviewItem({
          id: "candidate-ifra-review-bergamot",
          queueItemId: "hero-ifra-source-bergamot-fcf-fcf_special_case",
          materialName: "Bergamot EO FCF",
          candidateIds: ["candidate-bergamot-fcf"],
        }),
      ],
    },
    evidenceResolution: {
      items: [
        resolutionItem({
          queueItemId: "hero-ifra-source-bergamot-fcf-fcf_special_case",
          materialName: "Bergamot EO FCF",
          evidenceStatus: "already_reviewed",
          suggestedAction: "already_reviewed",
          candidateReviewItemId: "candidate-ifra-review-bergamot",
          reviewedSourceRecordIds: ["reviewed-fcf"],
          bestCandidates: [],
        }),
      ],
    },
    candidateExtractions: {
      candidates: [
        {
          id: "candidate-bergamot-fcf",
          candidateLimitType: "phototoxic_note",
        },
      ],
    },
    reviewedSourceRecords: {
      records: [{ id: "reviewed-fcf", candidateIds: ["candidate-bergamot-fcf"] }],
    },
    now: "2026-06-11T12:00:00.000Z",
  });
  const updatedReview = result.candidateReviewQueue.items[0];

  assert.equal(updatedReview.reviewStatus, "accepted");
  assert.deepEqual(updatedReview.acceptedCandidateIds, ["candidate-bergamot-fcf"]);
  assert.match(updatedReview.reviewNotes, /not an IFRA limit/i);
});

test("IFRA evidence autopilot can auto-accept linked likely FCF evidence without creating limits", () => {
  const result = applyAutopilotReviewUpdates({
    sourceQueue: {
      items: [
        queueItem({
          id: "hero-ifra-source-bergamot-fcf-fcf_special_case",
          materialName: "Bergamot EO FCF",
          requiredSourceType: "fcf_special_case",
        }),
      ],
    },
    candidateReviewQueue: {
      items: [
        reviewItem({
          id: "candidate-ifra-review-bergamot",
          queueItemId: "hero-ifra-source-bergamot-fcf-fcf_special_case",
          materialName: "Bergamot EO FCF",
          candidateIds: ["candidate-bergamot-fcf"],
        }),
      ],
    },
    evidenceResolution: {
      items: [
        resolutionItem({
          queueItemId: "hero-ifra-source-bergamot-fcf-fcf_special_case",
          materialName: "Bergamot EO FCF",
          sourceIdentityName: "Bergamot EO FCF",
          evidenceStatus: "likely_fcf_evidence",
          suggestedAction: "promote_fcf_evidence_after_review",
          candidateReviewItemId: "candidate-ifra-review-bergamot",
          bestCandidates: [
            {
              id: "candidate-bergamot-fcf",
              materialName: "Bergamot EO FCF",
              sourceIdentityName: "Bergamot EO FCF",
              candidateLimitType: "phototoxic_note",
              reviewPriority: "high",
              sourceType: "supplier_product_page",
              snippet: "Bergamot EO FCF is bergapten-free and furocoumarin-free.",
              queueItemIds: ["hero-ifra-source-bergamot-fcf-fcf_special_case"],
              signals: {
                linked: true,
                exactName: true,
                hasFcf: true,
                hasGhsCategory4: false,
                hasRifmUsage: false,
              },
            },
          ],
        }),
      ],
    },
    candidateExtractions: {
      candidates: [
        {
          id: "candidate-bergamot-fcf",
          candidateLimitType: "phototoxic_note",
        },
      ],
    },
    reviewedSourceRecords: { records: [] },
    now: "2026-06-11T12:00:00.000Z",
  });
  const updatedReview = result.candidateReviewQueue.items[0];

  assert.equal(updatedReview.reviewStatus, "accepted");
  assert.deepEqual(updatedReview.acceptedCandidateIds, ["candidate-bergamot-fcf"]);
  assert.match(result.candidateReviewUpdates[0].reason, /non-limit source evidence/i);
  assert.doesNotMatch(JSON.stringify(result), /categoryLimits/);
});

test("IFRA evidence autopilot does not auto-accept category-limit candidates even when a reviewed record is present", () => {
  const result = applyAutopilotReviewUpdates({
    sourceQueue: { items: [queueItem()] },
    candidateReviewQueue: { items: [reviewItem()] },
    evidenceResolution: {
      items: [
        resolutionItem({
          evidenceStatus: "already_reviewed",
          suggestedAction: "already_reviewed",
          reviewedSourceRecordIds: ["reviewed-cat4"],
        }),
      ],
    },
    candidateExtractions: {
      candidates: [
        {
          id: "candidate-ambroxan-cat4",
          candidateLimitType: "ifra_category_limit",
        },
      ],
    },
    reviewedSourceRecords: {
      records: [{ id: "reviewed-cat4", candidateIds: ["candidate-ambroxan-cat4"] }],
    },
  });

  assert.equal(result.candidateReviewQueue.items[0].reviewStatus, "not_started");
  assert.deepEqual(result.candidateReviewQueue.items[0].acceptedCandidateIds, []);
});

test("IFRA evidence autopilot report summarizes review burden without adding runtime limits", () => {
  const report = buildIfraEvidenceAutopilotReport({
    sourceQueue: { metadata: { generatedAt: "queue" }, items: [queueItem()] },
    harvestReport: {
      summary: { downloadSuccessCount: 3, downloadFailureCount: 1 },
    },
    documentInventory: { summary: { documentCount: 2, matchedDocumentCount: 1 } },
    candidateExtractions: { candidates: [] },
    candidateReviewQueue: { items: [] },
    evidenceResolution: {
      metadata: { generatedAt: "resolver" },
      summary: { queueItemCount: 2, retainedCandidateCount: 5 },
      items: [
        resolutionItem(),
        resolutionItem({
          queueItemId: "seaweed",
          materialName: "Seaweed Absolute 10%",
          evidenceStatus: "needs_supplier_doc",
          suggestedAction: "request_supplier_ifra_or_sds",
          confidence: "low",
          score: 0,
          bestCandidates: [],
          candidateReviewItemId: "",
        }),
      ],
    },
    reviewedSourceRecords: { records: [] },
    autoUpdateResult: { autoUpdatedCount: 1, sourceUpdates: [], candidateReviewUpdates: [] },
    generatedAt: "2026-06-11T12:00:00.000Z",
  });
  const markdown = formatIfraEvidenceAutopilotMarkdown(report);

  assert.equal(report.summary.queueItemCount, 2);
  assert.equal(report.summary.reviewReadyCount, 1);
  assert.equal(report.summary.needsSupplierDocCount, 1);
  assert.equal(report.summary.downloadedOrCachedSourceCount, 3);
  assert.match(markdown, /IFRA Evidence Autopilot Report/);
  assert.match(markdown, /Ambroxan Crystals/);
  assert.doesNotMatch(JSON.stringify(report), /categoryLimits/);
});
