import fs from "node:fs";
import path from "node:path";

import { DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH } from "./ifra_source_harvest.mjs";
import {
  DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH,
  loadExistingHeroIfraSourceQueue,
} from "./hero_ifra_source_acquisition_queue.mjs";
import { buildIfraSourceIdentity } from "./ifra_source_identity.mjs";

const DEFAULT_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);

export const DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_PATH = path.join(
  DEFAULT_ROOT,
  "data",
  "ifra_source_acquisition",
  "candidate_ifra_review_queue.json"
);

export const DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_MARKDOWN_PATH = path.join(
  DEFAULT_ROOT,
  "docs",
  "ifra",
  "candidate_ifra_review_queue.md"
);

export const CANDIDATE_IFRA_REVIEW_QUEUE_REGENERATE_COMMAND =
  "node scripts/build_candidate_ifra_review_queue.mjs --markdown --write docs/ifra/candidate_ifra_review_queue.md";

export const VALID_CANDIDATE_IFRA_REVIEW_STATUSES = [
  "not_started",
  "in_review",
  "accepted",
  "rejected",
  "needs_more_source",
  "deferred",
];

const MANUAL_FIELDS = [
  "reviewStatus",
  "acceptedCandidateIds",
  "rejectedCandidateIds",
  "reviewNotes",
  "lastUpdated",
];

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const LIMIT_TYPE_RANK = {
  ifra_category_limit: 0,
  phototoxic_note: 1,
  allergen_or_restriction: 2,
  identity: 4,
  unknown: 6,
};
const SOURCE_TYPE_RANK = {
  supplier_ifra: 0,
  supplier_sds: 1,
  product_page: 2,
  supplier_product_page: 2,
  safety_page: 3,
  global_ifra_standard: 3,
  identity_reference: 7,
  unknown: 8,
};

const REVIEW_STATUS_ORDER = [
  "not_started",
  "in_review",
  "accepted",
  "rejected",
  "needs_more_source",
  "deferred",
];

function uniqueStrings(values = []) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
  }
  return output;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeText(value).replace(/\s+/g, "-") || "unknown";
}

function countBy(items = [], key) {
  return items.reduce((acc, item) => {
    const value = item?.[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function orderedCountEntries(counts = {}, order = []) {
  const seen = new Set(order);
  return [
    ...order.filter((key) => counts[key] != null).map((key) => [key, counts[key]]),
    ...Object.entries(counts)
      .filter(([key]) => !seen.has(key))
      .sort(([left], [right]) => left.localeCompare(right)),
  ];
}

function loadJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildQueueItemLookup(sourceQueue = {}) {
  return new Map((sourceQueue.items || []).map((item) => [item.id, item]));
}

function getCandidatePriority(candidate = {}) {
  return candidate.reviewPriority || "low";
}

function compareCandidates(left = {}, right = {}) {
  const priorityDelta =
    (PRIORITY_RANK[getCandidatePriority(left)] ?? 99) -
    (PRIORITY_RANK[getCandidatePriority(right)] ?? 99);
  if (priorityDelta) return priorityDelta;
  const typeDelta =
    (LIMIT_TYPE_RANK[left.candidateLimitType] ?? 9) -
    (LIMIT_TYPE_RANK[right.candidateLimitType] ?? 9);
  if (typeDelta) return typeDelta;
  const sourceDelta =
    (SOURCE_TYPE_RANK[left.sourceType] ?? 9) -
    (SOURCE_TYPE_RANK[right.sourceType] ?? 9);
  if (sourceDelta) return sourceDelta;
  return String(left.materialName || "").localeCompare(String(right.materialName || ""));
}

function getHighestPriority(candidates = []) {
  return candidates.reduce((best, candidate) => {
    const priority = getCandidatePriority(candidate);
    return (PRIORITY_RANK[priority] ?? 99) < (PRIORITY_RANK[best] ?? 99)
      ? priority
      : best;
  }, "low");
}

function buildCandidateSummary(candidate = {}) {
  return {
    id: candidate.id,
    materialName: candidate.materialName || "",
    formulaMaterialName: candidate.formulaMaterialName || candidate.materialName || "",
    sourceIdentityName:
      candidate.sourceIdentityName ||
      buildIfraSourceIdentity(candidate.materialName || "").sourceIdentityName,
    candidateLimitType: candidate.candidateLimitType || "unknown",
    reviewPriority: getCandidatePriority(candidate),
    sourceType: candidate.sourceType || "unknown",
    sourceUrl: candidate.sourceUrl || "",
    sourceFile: candidate.sourceFile || "",
    category: candidate.category || "",
    candidateValue: candidate.candidateValue || "",
    candidateUnit: candidate.candidateUnit || "",
    snippet: candidate.snippet || "",
  };
}

function makeLinkedReviewItemId(queueItemId) {
  return `candidate-ifra-review-${slugify(queueItemId)}`;
}

function makeUnlinkedReviewItemId(materialName) {
  return `candidate-ifra-review-unlinked-${slugify(materialName)}`;
}

function buildSuggestedReviewAction({ candidates = [], queueItem = null, linked = true } = {}) {
  const sorted = [...candidates].sort(compareCandidates);
  const types = new Set(sorted.map((candidate) => candidate.candidateLimitType));
  if (!linked) {
    return "Confirm the material/source match before accepting any candidate for later promotion review.";
  }
  if (types.has("ifra_category_limit")) {
    return "Review the source, material identity, amendment/category context, and supplier wording before accepting any Cat 4/fine-fragrance candidate for a later promotion task.";
  }
  if (types.has("phototoxic_note")) {
    return "Review FCF, furocoumarin, bergapten, or phototoxic wording against the exact supplied material identity before accepting.";
  }
  if (types.has("allergen_or_restriction")) {
    return "Review the SDS/product-page restriction or allergen language, then decide whether more source is needed.";
  }
  if (queueItem?.requiredSourceType === "already_structured") {
    return "Treat as supporting evidence only. Runtime structured IFRA data is already present and should not be overwritten automatically.";
  }
  return "Use identity-only snippets for CAS/name/source targeting. Do not accept as IFRA compliance evidence.";
}

function buildLinkedReviewItem({
  queueItemId,
  candidates,
  queueItem,
  existingItem,
  generatedAt,
}) {
  const sortedCandidates = [...candidates].sort(compareCandidates);
  const topCandidates = sortedCandidates.slice(0, 5).map(buildCandidateSummary);
  const base = {
    id: makeLinkedReviewItemId(queueItemId),
    queueItemId,
    materialName: queueItem?.materialName || sortedCandidates[0]?.materialName || "",
    formulaMaterialName:
      queueItem?.formulaMaterialName ||
      queueItem?.materialName ||
      sortedCandidates[0]?.formulaMaterialName ||
      sortedCandidates[0]?.materialName ||
      "",
    sourceIdentityName:
      queueItem?.sourceIdentityName ||
      queueItem?.normalizedName ||
      sortedCandidates[0]?.sourceIdentityName ||
      buildIfraSourceIdentity(sortedCandidates[0]?.materialName || "").sourceIdentityName,
    activeMaterialName:
      queueItem?.activeMaterialName ||
      queueItem?.sourceIdentityName ||
      sortedCandidates[0]?.sourceIdentityName ||
      "",
    dilutionLabel: queueItem?.dilutionLabel || "",
    carrierLabel: queueItem?.carrierLabel || "",
    requiredSourceType: queueItem?.requiredSourceType || "",
    formulasUsedIn: queueItem?.formulasUsedIn || [],
    candidateIds: sortedCandidates.map((candidate) => candidate.id),
    highestPriority: getHighestPriority(sortedCandidates),
    candidateCount: sortedCandidates.length,
    sourceFiles: uniqueStrings(sortedCandidates.map((candidate) => candidate.sourceFile)),
    sourceUrls: uniqueStrings(sortedCandidates.map((candidate) => candidate.sourceUrl)),
    suggestedReviewAction: buildSuggestedReviewAction({
      candidates: sortedCandidates,
      queueItem,
      linked: true,
    }),
    reviewStatus: "not_started",
    acceptedCandidateIds: [],
    rejectedCandidateIds: [],
    reviewNotes: "",
    lastUpdated: generatedAt,
    topCandidates,
  };
  return preserveManualReviewFields(base, existingItem, generatedAt);
}

function buildUnlinkedReviewItem({ materialName, candidates, existingItem, generatedAt }) {
  const sortedCandidates = [...candidates].sort(compareCandidates);
  const topCandidates = sortedCandidates.slice(0, 5).map(buildCandidateSummary);
  const sourceIdentity = buildIfraSourceIdentity(materialName);
  const base = {
    id: makeUnlinkedReviewItemId(materialName),
    queueItemId: "",
    materialName: materialName || "Unlinked candidates",
    formulaMaterialName: materialName || "Unlinked candidates",
    sourceIdentityName: sourceIdentity.sourceIdentityName || materialName || "",
    activeMaterialName: sourceIdentity.activeMaterialName || "",
    dilutionLabel: sourceIdentity.dilutionLabel || "",
    carrierLabel: sourceIdentity.carrierLabel || "",
    requiredSourceType: "unlinked_candidate",
    formulasUsedIn: [],
    candidateIds: sortedCandidates.map((candidate) => candidate.id),
    highestPriority: getHighestPriority(sortedCandidates),
    candidateCount: sortedCandidates.length,
    sourceFiles: uniqueStrings(sortedCandidates.map((candidate) => candidate.sourceFile)),
    sourceUrls: uniqueStrings(sortedCandidates.map((candidate) => candidate.sourceUrl)),
    suggestedReviewAction: buildSuggestedReviewAction({
      candidates: sortedCandidates,
      linked: false,
    }),
    reviewStatus: "not_started",
    acceptedCandidateIds: [],
    rejectedCandidateIds: [],
    reviewNotes: "",
    lastUpdated: generatedAt,
    topCandidates,
  };
  return preserveManualReviewFields(base, existingItem, generatedAt);
}

function makeExistingLookup(existingQueue = {}) {
  return new Map((existingQueue.items || []).map((item) => [item.id, item]));
}

function preserveManualReviewFields(base, existingItem, generatedAt) {
  if (!existingItem) return base;
  const next = { ...base };
  for (const field of MANUAL_FIELDS) {
    if (existingItem[field] != null) next[field] = existingItem[field];
  }
  next.acceptedCandidateIds = uniqueStrings(
    next.acceptedCandidateIds.filter((id) => base.candidateIds.includes(id))
  );
  next.rejectedCandidateIds = uniqueStrings(
    next.rejectedCandidateIds.filter((id) => base.candidateIds.includes(id))
  );
  if (!next.lastUpdated) next.lastUpdated = generatedAt;
  return next;
}

function groupCandidatesByQueueItem(candidates = []) {
  const linked = new Map();
  const unlinked = new Map();
  for (const candidate of candidates) {
    const queueItemIds = candidate.queueItemIds || [];
    if (queueItemIds.length) {
      for (const queueItemId of queueItemIds) {
        if (!linked.has(queueItemId)) linked.set(queueItemId, []);
        linked.get(queueItemId).push(candidate);
      }
      continue;
    }
    const sourceIdentity = buildIfraSourceIdentity(candidate.sourceIdentityName || candidate.materialName);
    const key = normalizeText(sourceIdentity.sourceIdentityName) || "unlinked candidates";
    if (!unlinked.has(key)) {
      unlinked.set(key, {
        materialName: candidate.materialName || "Unlinked candidates",
        candidates: [],
      });
    }
    unlinked.get(key).candidates.push(candidate);
  }
  return { linked, unlinked };
}

function compareReviewItems(left = {}, right = {}) {
  if (!left.queueItemId && right.queueItemId) return 1;
  if (left.queueItemId && !right.queueItemId) return -1;
  const statusDelta =
    REVIEW_STATUS_ORDER.indexOf(left.reviewStatus) -
    REVIEW_STATUS_ORDER.indexOf(right.reviewStatus);
  if (statusDelta) return statusDelta;
  const priorityDelta =
    (PRIORITY_RANK[left.highestPriority] ?? 99) -
    (PRIORITY_RANK[right.highestPriority] ?? 99);
  if (priorityDelta) return priorityDelta;
  return String(left.materialName || "").localeCompare(String(right.materialName || ""));
}

export function summarizeCandidateIfraReviewQueue(items = []) {
  const reviewStatusCounts = countBy(items, "reviewStatus");
  const highestPriorityCounts = countBy(items, "highestPriority");
  const linkedItems = items.filter((item) => item.queueItemId);
  const unlinkedItems = items.filter((item) => !item.queueItemId);
  const candidateAssignmentCount = items.reduce(
    (sum, item) => sum + (item.candidateCount || 0),
    0
  );
  const allCandidateIds = new Set(items.flatMap((item) => item.candidateIds || []));
  const linkedCandidateIds = new Set(
    linkedItems.flatMap((item) => item.candidateIds || [])
  );
  const unlinkedCandidateIds = new Set(
    unlinkedItems.flatMap((item) => item.candidateIds || [])
  );
  return {
    itemCount: items.length,
    linkedItemCount: linkedItems.length,
    unlinkedItemCount: unlinkedItems.length,
    candidateCount: allCandidateIds.size,
    candidateAssignmentCount,
    linkedCandidateCount: linkedCandidateIds.size,
    unlinkedCandidateCount: unlinkedCandidateIds.size,
    highestPriorityCounts,
    reviewStatusCounts,
    highPriorityItemCount: highestPriorityCounts.high || 0,
    mediumPriorityItemCount: highestPriorityCounts.medium || 0,
    lowPriorityItemCount: highestPriorityCounts.low || 0,
    notStartedCount: reviewStatusCounts.not_started || 0,
    inReviewCount: reviewStatusCounts.in_review || 0,
    acceptedCount: reviewStatusCounts.accepted || 0,
    rejectedCount: reviewStatusCounts.rejected || 0,
    needsMoreSourceCount: reviewStatusCounts.needs_more_source || 0,
    deferredCount: reviewStatusCounts.deferred || 0,
  };
}

export function buildCandidateIfraReviewQueue({
  candidateExtractions = {},
  sourceQueue = {},
  existingQueue = {},
  generatedAt = new Date().toISOString(),
} = {}) {
  const candidates = candidateExtractions?.candidates || [];
  const sourceQueueLookup = buildQueueItemLookup(sourceQueue || {});
  const existingLookup = makeExistingLookup(existingQueue || {});
  const { linked, unlinked } = groupCandidatesByQueueItem(candidates);
  const items = [];

  for (const [queueItemId, groupCandidates] of linked.entries()) {
    const id = makeLinkedReviewItemId(queueItemId);
    items.push(
      buildLinkedReviewItem({
        queueItemId,
        candidates: groupCandidates,
        queueItem: sourceQueueLookup.get(queueItemId),
        existingItem: existingLookup.get(id),
        generatedAt,
      })
    );
  }

  for (const { materialName, candidates: groupCandidates } of unlinked.values()) {
    const id = makeUnlinkedReviewItemId(materialName);
    items.push(
      buildUnlinkedReviewItem({
        materialName,
        candidates: groupCandidates,
        existingItem: existingLookup.get(id),
        generatedAt,
      })
    );
  }

  const sortedItems = items.sort(compareReviewItems);
  return {
    metadata: {
      generatedAt,
      reportName: "Candidate IFRA Review Queue",
      candidateExtractionGeneratedAt:
        candidateExtractions?.metadata?.generatedAt || null,
      sourceQueueGeneratedAt: sourceQueue?.metadata?.generatedAt || null,
      regenerateCommand: CANDIDATE_IFRA_REVIEW_QUEUE_REGENERATE_COMMAND,
      guardrails: [
        "This queue organizes candidate IFRA/SDS/source snippets for human review only.",
        "Accepted candidates are not runtime IFRA data and do not prove launch clearance.",
        "Promotion into structured IFRA records is a separate reviewed task.",
      ],
      missingCandidateExtractions: !Array.isArray(candidateExtractions?.candidates),
    },
    summary: summarizeCandidateIfraReviewQueue(sortedItems),
    items: sortedItems,
  };
}

export function buildCandidateIfraReviewQueueFromFiles({
  candidateExtractionsPath = DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH,
  sourceQueuePath = DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH,
  existingQueuePath = DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_PATH,
  generatedAt = new Date().toISOString(),
} = {}) {
  return buildCandidateIfraReviewQueue({
    candidateExtractions: loadJsonIfPresent(candidateExtractionsPath) || {},
    sourceQueue: loadExistingHeroIfraSourceQueue(sourceQueuePath) || {},
    existingQueue: loadExistingCandidateIfraReviewQueue(existingQueuePath) || {},
    generatedAt,
  });
}

export function loadExistingCandidateIfraReviewQueue(
  filePath = DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_PATH
) {
  return loadJsonIfPresent(filePath);
}

function formatCountLine(label, value) {
  return `- ${label}: ${Number(value || 0).toLocaleString()}`;
}

function formatSourceList(values = []) {
  if (!values.length) return "None";
  return values.slice(0, 4).join("; ");
}

function formatCandidateLine(candidate = {}) {
  const value = candidate.candidateValue
    ? `; value: ${candidate.candidateValue}${candidate.candidateUnit ? ` ${candidate.candidateUnit}` : ""}`
    : "";
  const category = candidate.category ? `; category: ${candidate.category}` : "";
  return [
    `- ${candidate.reviewPriority} ${candidate.candidateLimitType}${category}${value}`,
    `  - Candidate: ${candidate.id}`,
    `  - Source: ${candidate.sourceFile || candidate.sourceUrl || "Unknown"}`,
    `  - Snippet: ${candidate.snippet || "No snippet."}`,
  ].join("\n");
}

function formatReviewItemMarkdown(item = {}) {
  return [
    `### ${item.materialName}`,
    "",
    item.sourceIdentityName && item.sourceIdentityName !== item.materialName
      ? `- Source identity: ${item.sourceIdentityName}`
      : null,
    item.dilutionLabel ? `- Dilution: ${item.dilutionLabel}` : null,
    `- Review item: ${item.id}`,
    `- Queue item: ${item.queueItemId || "Unlinked"}`,
    `- Required source type: ${item.requiredSourceType || "Unlinked candidate"}`,
    `- Formulas used in: ${(item.formulasUsedIn || []).join(", ") || "Unknown"}`,
    `- Review status: ${item.reviewStatus}`,
    `- Highest priority: ${item.highestPriority}`,
    `- Candidate count: ${item.candidateCount}`,
    `- Accepted candidates: ${(item.acceptedCandidateIds || []).join(", ") || "None"}`,
    `- Rejected candidates: ${(item.rejectedCandidateIds || []).join(", ") || "None"}`,
    `- Source files: ${formatSourceList(item.sourceFiles || [])}`,
    `- Source URLs: ${formatSourceList(item.sourceUrls || [])}`,
    `- Suggested review action: ${item.suggestedReviewAction}`,
    `- Review notes: ${item.reviewNotes || "None"}`,
    "",
    "Top candidate snippets:",
    ...(item.topCandidates || []).slice(0, 5).map(formatCandidateLine),
    "",
  ]
    .filter((line) => line != null)
    .join("\n");
}

function classifyMarkdownGroup(item = {}) {
  if (item.reviewStatus === "accepted") return "Accepted";
  if (item.reviewStatus === "rejected") return "Rejected";
  if (item.reviewStatus === "needs_more_source") return "Needs More Source";
  if (item.reviewStatus === "deferred") return "Deferred";
  if (!item.queueItemId) return "Unlinked Candidates";
  if (item.highestPriority === "high") return "High Priority Linked Candidates";
  if (item.highestPriority === "medium") return "Medium Priority Linked Candidates";
  return "Low Priority / Identity-Only Candidates";
}

function groupReviewItemsForMarkdown(items = []) {
  const groups = new Map([
    ["High Priority Linked Candidates", []],
    ["Medium Priority Linked Candidates", []],
    ["Low Priority / Identity-Only Candidates", []],
    ["Unlinked Candidates", []],
    ["Needs More Source", []],
    ["Accepted", []],
    ["Rejected", []],
    ["Deferred", []],
  ]);
  for (const item of items) {
    groups.get(classifyMarkdownGroup(item)).push(item);
  }
  return groups;
}

export function formatCandidateIfraReviewQueueMarkdown(queue = {}) {
  const items = queue.items || [];
  const summary = queue.summary || summarizeCandidateIfraReviewQueue(items);
  const groups = groupReviewItemsForMarkdown(items);
  const groupSections = [...groups.entries()].flatMap(([label, groupItems]) => [
    `## ${label}`,
    "",
    groupItems.length
      ? groupItems.map(formatReviewItemMarkdown).join("\n")
      : "_No items in this group._\n",
  ]);

  return [
    "# Candidate IFRA Review Queue",
    "",
    `Generated: ${queue.metadata?.generatedAt || ""}`,
    "",
    "This queue organizes candidate snippets for human review only. Accepted candidates are not runtime IFRA data, do not add IFRA limits, and do not prove launch clearance.",
    "",
    "## Summary",
    "",
    formatCountLine("Review items", summary.itemCount),
    formatCountLine("Linked review items", summary.linkedItemCount),
    formatCountLine("Unlinked review items", summary.unlinkedItemCount),
    formatCountLine("Unique candidate snippets represented", summary.candidateCount),
    formatCountLine("Candidate assignments across review items", summary.candidateAssignmentCount),
    formatCountLine("Linked candidate snippets", summary.linkedCandidateCount),
    formatCountLine("Unlinked candidate snippets", summary.unlinkedCandidateCount),
    formatCountLine("High-priority review items", summary.highPriorityItemCount),
    formatCountLine("Medium-priority review items", summary.mediumPriorityItemCount),
    formatCountLine("Low-priority review items", summary.lowPriorityItemCount),
    formatCountLine("Accepted", summary.acceptedCount),
    formatCountLine("Rejected", summary.rejectedCount),
    formatCountLine("Needs more source", summary.needsMoreSourceCount),
    "",
    "Review status counts:",
    ...orderedCountEntries(summary.reviewStatusCounts || {}, REVIEW_STATUS_ORDER).map(
      ([key, value]) => `- ${key}: ${value}`
    ),
    "",
    ...groupSections,
  ].join("\n");
}

export function formatCandidateIfraReviewQueueText(queue = {}) {
  const items = queue.items || [];
  const summary = queue.summary || summarizeCandidateIfraReviewQueue(items);
  const topItems = items
    .filter((item) => item.queueItemId && item.reviewStatus === "not_started")
    .sort(compareReviewItems)
    .slice(0, 8);
  return [
    "Candidate IFRA Review Queue",
    "",
    "This queue organizes candidate snippets for review only. It does not promote IFRA data.",
    "",
    `Review items: ${summary.itemCount || 0}`,
    `Unique candidate snippets represented: ${summary.candidateCount || 0}`,
    `Candidate assignments across review items: ${summary.candidateAssignmentCount || 0}`,
    `High priority review items: ${summary.highPriorityItemCount || 0}`,
    `Medium priority review items: ${summary.mediumPriorityItemCount || 0}`,
    `Low priority review items: ${summary.lowPriorityItemCount || 0}`,
    `Accepted: ${summary.acceptedCount || 0}`,
    `Rejected: ${summary.rejectedCount || 0}`,
    `Needs more source: ${summary.needsMoreSourceCount || 0}`,
    "",
    "Top linked items awaiting review:",
    ...(topItems.length
      ? topItems.map(
          (item) =>
            `- ${item.materialName}: ${item.candidateCount} candidates; highest=${item.highestPriority}`
        )
      : ["- None."]),
    "",
  ].join("\n");
}

export function writeCandidateIfraReviewQueue(filePath, queue) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(queue, null, 2)}\n`);
}

function findReviewItem(items = [], requestedId) {
  const normalizedRequested = slugify(requestedId);
  const matches = items.filter((item) =>
    uniqueStrings([item.id, String(item.id || "").replace(/^candidate-ifra-review-/, "")])
      .map(slugify)
      .includes(normalizedRequested)
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(`Review item ID is ambiguous: ${requestedId}. Use the full id.`);
  }
  throw new Error(`Review item not found: ${requestedId}`);
}

function validateReviewStatus(value) {
  if (value && !VALID_CANDIDATE_IFRA_REVIEW_STATUSES.includes(value)) {
    throw new Error(`Invalid reviewStatus: ${value}`);
  }
}

function assertCandidateBelongsToItem(item, candidateId) {
  if (!candidateId) return;
  if (!item.candidateIds.includes(candidateId)) {
    throw new Error(`Candidate does not belong to review item: ${candidateId}`);
  }
}

function updateCandidateIdList(values = [], addValue = "", removeValue = "") {
  return uniqueStrings([
    ...values.filter((value) => value !== removeValue),
    addValue,
  ]);
}

export function updateCandidateIfraReviewStatus({
  queue,
  id,
  reviewStatus,
  acceptCandidateIds = [],
  rejectCandidateIds = [],
  notes,
  now = new Date().toISOString(),
} = {}) {
  if (!queue || !Array.isArray(queue.items)) {
    throw new Error("A valid candidate review queue with items is required.");
  }
  if (!id) throw new Error("--id is required for review updates.");
  validateReviewStatus(reviewStatus);
  const target = findReviewItem(queue.items, id);
  for (const candidateId of acceptCandidateIds) {
    assertCandidateBelongsToItem(target, candidateId);
  }
  for (const candidateId of rejectCandidateIds) {
    assertCandidateBelongsToItem(target, candidateId);
  }
  if (
    !reviewStatus &&
    !acceptCandidateIds.length &&
    !rejectCandidateIds.length &&
    notes == null
  ) {
    throw new Error("No supported review fields were provided.");
  }

  const updatedItems = queue.items.map((item) => {
    if (item.id !== target.id) return item;
    let acceptedCandidateIds = [...(item.acceptedCandidateIds || [])];
    let rejectedCandidateIds = [...(item.rejectedCandidateIds || [])];
    for (const candidateId of acceptCandidateIds) {
      acceptedCandidateIds = updateCandidateIdList(
        acceptedCandidateIds,
        candidateId,
        ""
      );
      rejectedCandidateIds = rejectedCandidateIds.filter((idValue) => idValue !== candidateId);
    }
    for (const candidateId of rejectCandidateIds) {
      rejectedCandidateIds = updateCandidateIdList(
        rejectedCandidateIds,
        candidateId,
        ""
      );
      acceptedCandidateIds = acceptedCandidateIds.filter((idValue) => idValue !== candidateId);
    }
    return {
      ...item,
      reviewStatus: reviewStatus || item.reviewStatus,
      acceptedCandidateIds,
      rejectedCandidateIds,
      reviewNotes: notes != null ? notes : item.reviewNotes,
      lastUpdated: now,
    };
  });
  const updatedItem = updatedItems.find((item) => item.id === target.id);
  const updatedQueue = {
    ...queue,
    metadata: {
      ...(queue.metadata || {}),
      generatedAt: queue.metadata?.generatedAt || now,
      lastReviewStatusUpdateAt: now,
    },
    summary: summarizeCandidateIfraReviewQueue(updatedItems),
    items: updatedItems,
  };
  return {
    queue: updatedQueue,
    item: updatedItem,
    changedFields: uniqueStrings([
      reviewStatus ? "reviewStatus" : "",
      acceptCandidateIds.length ? "acceptedCandidateIds" : "",
      rejectCandidateIds.length ? "rejectedCandidateIds" : "",
      notes != null ? "reviewNotes" : "",
    ]),
  };
}
