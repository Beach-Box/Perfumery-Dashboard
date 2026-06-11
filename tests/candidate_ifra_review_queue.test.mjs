import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCandidateIfraReviewQueue,
  formatCandidateIfraReviewQueueMarkdown,
  summarizeCandidateIfraReviewQueue,
  updateCandidateIfraReviewStatus,
} from "../scripts/lib/candidate_ifra_review_queue.mjs";

function buildSyntheticSourceQueue() {
  return {
    metadata: { generatedAt: "2026-06-11T00:00:00.000Z" },
    items: [
      {
        id: "hero-ifra-source-octanal-global_ifra_standard_needed",
        materialName: "Aldehyde C-8",
        normalizedName: "Octanal",
        formulasUsedIn: ["Skin-Air Bridge"],
        requiredSourceType: "global_ifra_standard_needed",
      },
      {
        id: "hero-ifra-source-bergamot-fcf-fcf_special_case",
        materialName: "Bergamot EO FCF",
        normalizedName: "Bergamot FCF",
        formulasUsedIn: ["Damp Shoreline v2"],
        requiredSourceType: "fcf_special_case",
      },
      {
        id: "hero-ifra-source-calone-1951-global_ifra_standard_needed",
        materialName: "Calone 1951 20%",
        formulaMaterialName: "Calone 1951 20%",
        normalizedName: "Calone 1951",
        sourceIdentityName: "Calone 1951",
        activeMaterialName: "Calone 1951",
        dilutionLabel: "20%",
        formulasUsedIn: ["Damp Shoreline v2"],
        requiredSourceType: "global_ifra_standard_needed",
      },
    ],
  };
}

function candidate(overrides = {}) {
  return {
    id: overrides.id,
    materialName: overrides.materialName || "Aldehyde C-8",
    queueItemIds: overrides.queueItemIds || [
      "hero-ifra-source-octanal-global_ifra_standard_needed",
    ],
    sourceType: overrides.sourceType || "product_page",
    sourceUrl: overrides.sourceUrl || "https://example.test/source",
    sourceFile: overrides.sourceFile || "downloads/source.html",
    candidateLimitType: overrides.candidateLimitType || "identity",
    category: overrides.category || "",
    candidateValue: overrides.candidateValue || "",
    candidateUnit: overrides.candidateUnit || "",
    snippet: overrides.snippet || "Synthetic candidate snippet.",
    reviewPriority: overrides.reviewPriority || "low",
  };
}

function buildSyntheticExtractions() {
  return {
    metadata: { generatedAt: "2026-06-11T01:00:00.000Z" },
    candidates: [
      candidate({
        id: "c-identity",
        candidateLimitType: "identity",
        reviewPriority: "low",
        snippet: "Identity only.",
      }),
      candidate({
        id: "c-restriction",
        candidateLimitType: "allergen_or_restriction",
        reviewPriority: "medium",
        snippet: "SDS restriction language.",
      }),
      candidate({
        id: "c-c4",
        candidateLimitType: "ifra_category_limit",
        reviewPriority: "high",
        category: "4",
        candidateValue: "1.2",
        candidateUnit: "%",
        snippet: "IFRA 51: 1.2% in finished product (Cat. 4).",
      }),
      candidate({
        id: "c-phototoxic",
        materialName: "Bergamot EO FCF",
        queueItemIds: ["hero-ifra-source-bergamot-fcf-fcf_special_case"],
        candidateLimitType: "phototoxic_note",
        reviewPriority: "high",
        snippet: "FCF phototoxic note.",
      }),
      candidate({
        id: "c-unlinked",
        materialName: "Alcohol C8",
        queueItemIds: [],
        candidateLimitType: "identity",
        reviewPriority: "low",
        snippet: "Unlinked identity candidate.",
      }),
      candidate({
        id: "c-calone",
        materialName: "Calone 1951",
        sourceIdentityName: "Calone 1951",
        queueItemIds: ["hero-ifra-source-calone-1951-global_ifra_standard_needed"],
        candidateLimitType: "ifra_category_limit",
        reviewPriority: "high",
        snippet: "Calone 1951 IFRA Category 4 source candidate.",
      }),
    ],
  };
}

test("candidate IFRA review queue groups candidates by queue item and material", () => {
  const queue = buildCandidateIfraReviewQueue({
    candidateExtractions: buildSyntheticExtractions(),
    sourceQueue: buildSyntheticSourceQueue(),
    generatedAt: "2026-06-11T02:00:00.000Z",
  });

  assert.equal(queue.summary.itemCount, 4);
  assert.equal(queue.summary.linkedItemCount, 3);
  assert.equal(queue.summary.unlinkedItemCount, 1);
  assert.equal(queue.summary.candidateCount, 6);
  assert.equal(queue.summary.linkedCandidateCount, 5);
  assert.equal(queue.summary.unlinkedCandidateCount, 1);

  const octanal = queue.items.find((item) =>
    item.id.includes("octanal-global-ifra-standard-needed")
  );
  assert.equal(octanal.materialName, "Aldehyde C-8");
  assert.equal(octanal.candidateCount, 3);
  assert.equal(octanal.highestPriority, "high");
  assert.deepEqual(
    octanal.topCandidates.map((item) => item.id).slice(0, 3),
    ["c-c4", "c-restriction", "c-identity"]
  );

  const unlinked = queue.items.find((item) => !item.queueItemId);
  assert.equal(unlinked.materialName, "Alcohol C8");
  assert.equal(unlinked.requiredSourceType, "unlinked_candidate");

  const calone = queue.items.find((item) =>
    item.id.includes("calone-1951-global-ifra-standard-needed")
  );
  assert.equal(calone.materialName, "Calone 1951 20%");
  assert.equal(calone.sourceIdentityName, "Calone 1951");
  assert.equal(calone.dilutionLabel, "20%");
});

test("candidate IFRA review queue preserves manual review state on regeneration", () => {
  const existingQueue = {
    items: [
      {
        id: "candidate-ifra-review-hero-ifra-source-octanal-global-ifra-standard-needed",
        reviewStatus: "needs_more_source",
        acceptedCandidateIds: ["c-c4"],
        rejectedCandidateIds: ["c-identity"],
        reviewNotes: "Need original source before promotion.",
        lastUpdated: "2026-06-11T03:00:00.000Z",
      },
    ],
  };
  const queue = buildCandidateIfraReviewQueue({
    candidateExtractions: buildSyntheticExtractions(),
    sourceQueue: buildSyntheticSourceQueue(),
    existingQueue,
    generatedAt: "2026-06-11T04:00:00.000Z",
  });
  const octanal = queue.items.find((item) =>
    item.id.includes("octanal-global-ifra-standard-needed")
  );

  assert.equal(octanal.reviewStatus, "needs_more_source");
  assert.deepEqual(octanal.acceptedCandidateIds, ["c-c4"]);
  assert.deepEqual(octanal.rejectedCandidateIds, ["c-identity"]);
  assert.equal(octanal.reviewNotes, "Need original source before promotion.");
  assert.equal(octanal.lastUpdated, "2026-06-11T03:00:00.000Z");
});

test("candidate IFRA review status update only changes review fields", () => {
  const sourceQueue = buildSyntheticSourceQueue();
  const sourceQueueBefore = structuredClone(sourceQueue);
  const reviewQueue = buildCandidateIfraReviewQueue({
    candidateExtractions: buildSyntheticExtractions(),
    sourceQueue,
    generatedAt: "2026-06-11T02:00:00.000Z",
  });
  const target = reviewQueue.items.find((item) =>
    item.id.includes("octanal-global-ifra-standard-needed")
  );
  const result = updateCandidateIfraReviewStatus({
    queue: reviewQueue,
    id: target.id,
    reviewStatus: "accepted",
    acceptCandidateIds: ["c-c4"],
    rejectCandidateIds: ["c-identity"],
    notes: "Source-backed enough for later promotion review.",
    now: "2026-06-11T05:00:00.000Z",
  });
  const updated = result.item;

  assert.equal(updated.materialName, "Aldehyde C-8");
  assert.equal(updated.requiredSourceType, "global_ifra_standard_needed");
  assert.equal(updated.reviewStatus, "accepted");
  assert.deepEqual(updated.acceptedCandidateIds, ["c-c4"]);
  assert.deepEqual(updated.rejectedCandidateIds, ["c-identity"]);
  assert.equal(updated.lastUpdated, "2026-06-11T05:00:00.000Z");
  assert.deepEqual(sourceQueue, sourceQueueBefore);
  assert.deepEqual(result.changedFields, [
    "reviewStatus",
    "acceptedCandidateIds",
    "rejectedCandidateIds",
    "reviewNotes",
  ]);
});

test("candidate IFRA review markdown limits snippet spam", () => {
  const manyCandidates = Array.from({ length: 7 }, (_, index) =>
    candidate({
      id: `c-${index}`,
      candidateLimitType: index === 0 ? "ifra_category_limit" : "identity",
      reviewPriority: index === 0 ? "high" : "low",
      snippet: `Snippet ${index}`,
    })
  );
  const queue = buildCandidateIfraReviewQueue({
    candidateExtractions: { candidates: manyCandidates },
    sourceQueue: buildSyntheticSourceQueue(),
    generatedAt: "2026-06-11T02:00:00.000Z",
  });
  const markdown = formatCandidateIfraReviewQueueMarkdown(queue);

  assert.match(markdown, /Top candidate snippets/);
  assert.match(markdown, /Snippet 0/);
  assert.match(markdown, /Snippet 4/);
  assert.doesNotMatch(markdown, /Snippet 5/);
  assert.doesNotMatch(markdown, /Snippet 6/);
  assert.doesNotMatch(markdown, /categoryLimits/i);
});

test("candidate IFRA review queue handles missing candidate extraction data", () => {
  const queue = buildCandidateIfraReviewQueue({
    candidateExtractions: {},
    sourceQueue: buildSyntheticSourceQueue(),
    generatedAt: "2026-06-11T02:00:00.000Z",
  });
  const summary = summarizeCandidateIfraReviewQueue(queue.items);

  assert.equal(queue.metadata.missingCandidateExtractions, true);
  assert.equal(summary.itemCount, 0);
  assert.deepEqual(queue.items, []);
});
