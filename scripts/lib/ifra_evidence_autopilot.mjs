import fs from "node:fs";
import path from "node:path";

import { buildHeroIfraSourceGapReport } from "../report_hero_ifra_source_gaps.mjs";
import {
  DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH,
  buildHeroIfraSourceAcquisitionQueue,
  loadExistingHeroIfraSourceQueue,
  summarizeHeroIfraSourceQueue,
  writeHeroIfraSourceAcquisitionQueue,
} from "./hero_ifra_source_acquisition_queue.mjs";
import {
  DEFAULT_INGREDIENT_SOURCE_HARVEST_REPORT_PATH,
  DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH,
  buildCandidateIfraSourceExtractions,
  buildIngredientSourceHarvestReport,
  downloadHarvestSources,
  writeCandidateIfraExtractions,
  writeIngredientSourceHarvestReport,
} from "./ifra_source_harvest.mjs";
import {
  DEFAULT_IFRA_SOURCE_DOCUMENT_DIR,
  DEFAULT_IFRA_SOURCE_DOCUMENT_INVENTORY_PATH,
  buildIfraSourceDocumentInventory,
  writeIfraSourceDocumentInventory,
} from "./ifra_source_document_review.mjs";
import {
  DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_PATH,
  buildCandidateIfraReviewQueue,
  loadExistingCandidateIfraReviewQueue,
  summarizeCandidateIfraReviewQueue,
  writeCandidateIfraReviewQueue,
} from "./candidate_ifra_review_queue.mjs";
import {
  DEFAULT_IFRA_EVIDENCE_RESOLUTION_PATH,
  buildIfraEvidenceResolution,
  writeIfraEvidenceResolution,
} from "./ifra_evidence_resolver.mjs";
import {
  DEFAULT_REVIEWED_IFRA_SOURCE_RECORDS_PATH,
  loadReviewedIfraSourceRecords,
} from "./reviewed_ifra_source_records.mjs";
import {
  DEFAULT_IFRA_AUTOPILOT_RECOMMENDATIONS_PATH,
  DEFAULT_PROPOSED_IFRA_STRUCTURED_RECORDS_PATH,
  buildIfraAutopilotRecommendations,
  buildProposedIfraStructuredRecordsFile,
  isAutoAcceptableNonLimitEvidence,
  writeIfraAutopilotRecommendations,
  writeProposedIfraStructuredRecords,
} from "./ifra_autopilot_recommendations.mjs";
import { DEFAULT_OFFICIAL_IFRA_SOURCE_CANDIDATES_PATH } from "./official_ifra_harvest.mjs";

const DEFAULT_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);

export const DEFAULT_IFRA_EVIDENCE_AUTOPILOT_REPORT_PATH = path.join(
  DEFAULT_ROOT,
  "data",
  "ifra_source_acquisition",
  "ifra_evidence_autopilot_report.json"
);

export const DEFAULT_IFRA_EVIDENCE_AUTOPILOT_MARKDOWN_PATH = path.join(
  DEFAULT_ROOT,
  "docs",
  "ifra",
  "ifra_evidence_autopilot_report.md"
);

export const IFRA_EVIDENCE_AUTOPILOT_COMMAND =
  'node scripts/run_ifra_evidence_autopilot.mjs --ingredient-reference "...Ingredient data - Ingredient Data.csv" --download --markdown --write docs/ifra/ifra_evidence_autopilot_report.md';

const AUTOPILOT_CLASS_ORDER = [
  "auto_review_ready",
  "auto_likely_fcf_evidence",
  "auto_needs_supplier_doc",
  "auto_needs_global_standard",
  "auto_identity_only",
  "auto_insufficient",
  "auto_already_reviewed",
  "auto_deferred",
];

const REVIEW_READY_STATUSES = new Set([
  "review_ready",
  "candidate_found_needs_review",
]);

const NEEDS_MORE_SOURCE_STATUSES = new Set([
  "insufficient_evidence",
  "needs_supplier_doc",
]);

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

function truncateText(value, maxLength = 300) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function compareResolutionPriority(left = {}, right = {}) {
  const confidenceRank = { high: 0, medium: 1, low: 2 };
  const classDelta =
    AUTOPILOT_CLASS_ORDER.indexOf(left.autopilotClass) -
    AUTOPILOT_CLASS_ORDER.indexOf(right.autopilotClass);
  if (classDelta) return classDelta;
  const confidenceDelta =
    (confidenceRank[left.confidence] ?? 9) - (confidenceRank[right.confidence] ?? 9);
  if (confidenceDelta) return confidenceDelta;
  if ((right.score || 0) !== (left.score || 0)) return (right.score || 0) - (left.score || 0);
  return String(left.materialName || "").localeCompare(String(right.materialName || ""));
}

export function classifyAutopilotResolutionItem(item = {}) {
  if (item.evidenceStatus === "already_reviewed") return "auto_already_reviewed";
  if (item.evidenceStatus === "not_applicable") return "auto_already_reviewed";
  if (item.evidenceStatus === "deferred") return "auto_deferred";
  if (item.evidenceStatus === "likely_fcf_evidence") return "auto_likely_fcf_evidence";
  if (REVIEW_READY_STATUSES.has(item.evidenceStatus)) return "auto_review_ready";
  if (item.evidenceStatus === "needs_supplier_doc") return "auto_needs_supplier_doc";
  if (item.evidenceStatus === "identity_only") return "auto_identity_only";
  if (
    item.evidenceStatus === "insufficient_evidence" &&
    item.suggestedAction === "find_global_ifra_standard"
  ) {
    return "auto_needs_global_standard";
  }
  return "auto_insufficient";
}

function getBestCandidate(item = {}) {
  return item.bestCandidates?.[0] || null;
}

function isCategoryLimitCandidate(candidate = {}) {
  return candidate.candidateLimitType === "ifra_category_limit";
}

function buildResolutionSummaryItem(item = {}) {
  const bestCandidate = getBestCandidate(item);
  return {
    queueItemId: item.queueItemId,
    materialName: item.materialName || "",
    sourceIdentityName: item.sourceIdentityName || "",
    formulasUsedIn: item.formulasUsedIn || [],
    requiredSourceType: item.requiredSourceType || "",
    evidenceStatus: item.evidenceStatus || "",
    suggestedAction: item.suggestedAction || "",
    autopilotClass: classifyAutopilotResolutionItem(item),
    confidence: item.confidence || "low",
    score: item.score || 0,
    candidateReviewItemId: item.candidateReviewItemId || "",
    candidateReviewStatus: item.candidateReviewStatus || "",
    bestCandidateId: bestCandidate?.id || "",
    bestCandidateType: bestCandidate?.candidateLimitType || "",
    sourceType: bestCandidate?.sourceType || "",
    sourceUrl: bestCandidate?.sourceUrl || "",
    sourceFile: bestCandidate?.sourceFile || "",
    snippet: truncateText(bestCandidate?.snippet || ""),
    whySelected: item.whySelected || "",
    limitations: item.limitations || [],
    generatedCommand: bestCandidate?.generatedCommand || "",
  };
}

function makeCandidateReviewLookup(candidateReviewQueue = {}) {
  return new Map((candidateReviewQueue.items || []).map((item) => [item.id, item]));
}

function makeCandidateExtractionLookup(candidateExtractions = {}) {
  return new Map((candidateExtractions.candidates || []).map((item) => [item.id, item]));
}

function makeReviewedRecordLookup(reviewedSourceRecords = {}) {
  const byQueueItemId = new Map();
  const records = Array.isArray(reviewedSourceRecords.records)
    ? reviewedSourceRecords.records
    : [];
  for (const record of records) {
    for (const candidateId of record.candidateIds || []) {
      byQueueItemId.set(candidateId, record);
    }
  }
  return { records, byCandidateId: byQueueItemId };
}

function canAutopilotTouchCandidateReviewItem(item = {}) {
  return ["not_started", "in_review", "accepted"].includes(item.reviewStatus || "not_started");
}

function shouldPreserveCandidateReviewStatus(item = {}) {
  return ["accepted", "rejected", "deferred", "needs_more_source"].includes(
    item.reviewStatus || ""
  );
}

function applyCandidateReviewAutopilotUpdate({
  item,
  nextReviewStatus,
  acceptedCandidateId = "",
  now,
}) {
  const acceptedCandidateIds = uniqueStrings([
    ...(item.acceptedCandidateIds || []),
    acceptedCandidateId,
  ]);
  const next = {
    ...item,
    reviewStatus: nextReviewStatus || item.reviewStatus,
    acceptedCandidateIds,
    rejectedCandidateIds: (item.rejectedCandidateIds || []).filter(
      (id) => id !== acceptedCandidateId
    ),
    lastUpdated: now,
  };
  if (!next.reviewNotes && nextReviewStatus === "accepted") {
    next.reviewNotes =
      "Autopilot linked an existing reviewed FCF source-evidence record. This is not an IFRA limit.";
  }
  return next;
}

function applySourceQueueNeedsMoreSource({ item, now }) {
  return {
    ...item,
    reviewStatus: "needs_more_source",
    lastUpdated: now,
  };
}

export function applyAutopilotReviewUpdates({
  sourceQueue = {},
  candidateReviewQueue = {},
  evidenceResolution = {},
  candidateExtractions = {},
  reviewedSourceRecords = {},
  now = new Date().toISOString(),
} = {}) {
  const candidateReviewLookup = makeCandidateReviewLookup(candidateReviewQueue);
  const candidateLookup = makeCandidateExtractionLookup(candidateExtractions);
  const reviewedLookup = makeReviewedRecordLookup(reviewedSourceRecords);
  const sourceUpdates = [];
  const candidateReviewUpdates = [];
  const sourceQueueItems = (sourceQueue.items || []).map((item) => ({ ...item }));
  const candidateReviewItems = (candidateReviewQueue.items || []).map((item) => ({
    ...item,
  }));
  const sourceQueueIndex = new Map(sourceQueueItems.map((item, index) => [item.id, index]));
  const candidateReviewIndex = new Map(
    candidateReviewItems.map((item, index) => [item.id, index])
  );

  for (const item of evidenceResolution.items || []) {
    const autopilotClass = classifyAutopilotResolutionItem(item);
    const sourceIndex = sourceQueueIndex.get(item.queueItemId);
    if (
      sourceIndex != null &&
      ["auto_needs_supplier_doc", "auto_needs_global_standard", "auto_insufficient"].includes(
        autopilotClass
      )
    ) {
      const sourceItem = sourceQueueItems[sourceIndex];
      if (sourceItem.reviewStatus === "not_started" && !sourceItem.reviewNotes) {
        sourceQueueItems[sourceIndex] = applySourceQueueNeedsMoreSource({
          item: sourceItem,
          now,
        });
        sourceUpdates.push({
          queueItemId: sourceItem.id,
          materialName: sourceItem.materialName,
          field: "reviewStatus",
          from: sourceItem.reviewStatus,
          to: "needs_more_source",
          reason: `${item.evidenceStatus}: ${item.whySelected || "No strong evidence candidate."}`,
        });
      }
    }

    if (!item.candidateReviewItemId) continue;
    const reviewItem = candidateReviewLookup.get(item.candidateReviewItemId);
    const reviewIndex = candidateReviewIndex.get(item.candidateReviewItemId);
    if (!reviewItem || reviewIndex == null) continue;

    if (
      REVIEW_READY_STATUSES.has(item.evidenceStatus) &&
      item.confidence === "high" &&
      reviewItem.reviewStatus === "not_started"
    ) {
      candidateReviewItems[reviewIndex] = {
        ...reviewItem,
        reviewStatus: "in_review",
        lastUpdated: now,
      };
      candidateReviewUpdates.push({
        reviewItemId: reviewItem.id,
        queueItemId: reviewItem.queueItemId,
        materialName: reviewItem.materialName,
        field: "reviewStatus",
        from: reviewItem.reviewStatus,
        to: "in_review",
        reason: "High-confidence resolver candidate is ready for human review.",
      });
      continue;
    }

    const bestCandidate = getBestCandidate(item);
    if (
      isAutoAcceptableNonLimitEvidence({ item, candidate: bestCandidate }) &&
      !["accepted", "rejected", "deferred", "needs_more_source"].includes(
        reviewItem.reviewStatus || ""
      ) &&
      !reviewItem.reviewNotes
    ) {
      const acceptedCandidateId = bestCandidate.id;
      const nextItem = applyCandidateReviewAutopilotUpdate({
        item: reviewItem,
        nextReviewStatus: "accepted",
        acceptedCandidateId,
        now,
      });
      candidateReviewItems[reviewIndex] = nextItem;
      candidateReviewUpdates.push({
        reviewItemId: reviewItem.id,
        queueItemId: reviewItem.queueItemId,
        materialName: reviewItem.materialName,
        field: "reviewStatus",
        from: reviewItem.reviewStatus,
        to: "accepted",
        acceptedCandidateId,
        reason:
          "Autopilot accepted linked non-limit source evidence only; no IFRA category limit was created.",
      });
      continue;
    }

    if (item.evidenceStatus !== "already_reviewed") continue;
    if (!canAutopilotTouchCandidateReviewItem(reviewItem)) continue;
    if (shouldPreserveCandidateReviewStatus(reviewItem) && reviewItem.reviewStatus !== "accepted") {
      continue;
    }

    const acceptedCandidateIds = [];
    for (const recordId of item.reviewedSourceRecordIds || []) {
      const record = reviewedLookup.records.find((entry) => entry.id === recordId);
      for (const candidateId of record?.candidateIds || []) {
        const candidate = candidateLookup.get(candidateId);
        if (
          candidate &&
          candidate.candidateLimitType === "phototoxic_note" &&
          (reviewItem.candidateIds || []).includes(candidateId)
        ) {
          acceptedCandidateIds.push(candidateId);
        }
      }
    }
    if (!acceptedCandidateIds.length) continue;
    const acceptedCandidateId = acceptedCandidateIds[0];
    if (
      reviewItem.reviewStatus === "accepted" &&
      (reviewItem.acceptedCandidateIds || []).includes(acceptedCandidateId)
    ) {
      continue;
    }
    const previousStatus = reviewItem.reviewStatus;
    const nextItem = applyCandidateReviewAutopilotUpdate({
      item: reviewItem,
      nextReviewStatus: "accepted",
      acceptedCandidateId,
      now,
    });
    candidateReviewItems[reviewIndex] = nextItem;
    candidateReviewUpdates.push({
      reviewItemId: reviewItem.id,
      queueItemId: reviewItem.queueItemId,
      materialName: reviewItem.materialName,
      field: "reviewStatus",
      from: previousStatus,
      to: "accepted",
      acceptedCandidateId,
      reason:
        "Existing reviewed FCF source-evidence record supports accepting this non-limit candidate metadata.",
    });
  }

  const updatedSourceQueue = {
    ...sourceQueue,
    metadata: {
      ...(sourceQueue.metadata || {}),
      lastAutopilotReviewUpdateAt: sourceUpdates.length ? now : sourceQueue.metadata?.lastAutopilotReviewUpdateAt,
    },
    items: sourceQueueItems,
    summary: summarizeHeroIfraSourceQueue(sourceQueueItems),
  };
  const updatedCandidateReviewQueue = {
    ...candidateReviewQueue,
    metadata: {
      ...(candidateReviewQueue.metadata || {}),
      lastAutopilotReviewUpdateAt: candidateReviewUpdates.length
        ? now
        : candidateReviewQueue.metadata?.lastAutopilotReviewUpdateAt,
    },
    items: candidateReviewItems,
    summary: summarizeCandidateIfraReviewQueue(candidateReviewItems),
  };

  return {
    sourceQueue: updatedSourceQueue,
    candidateReviewQueue: updatedCandidateReviewQueue,
    sourceUpdates,
    candidateReviewUpdates,
    autoUpdatedCount: sourceUpdates.length + candidateReviewUpdates.length,
  };
}

function buildAutopilotSummary({
  evidenceResolution = {},
  harvestReport = {},
  documentInventory = {},
  autoUpdateResult = {},
}) {
  const resolutionItems = (evidenceResolution.items || []).map(buildResolutionSummaryItem);
  const classCounts = countBy(resolutionItems, "autopilotClass");
  const reviewReadyItems = resolutionItems.filter(
    (item) => item.autopilotClass === "auto_review_ready"
  );
  const unresolvedItems = resolutionItems.filter((item) =>
    [
      "auto_needs_supplier_doc",
      "auto_needs_global_standard",
      "auto_identity_only",
      "auto_insufficient",
    ].includes(item.autopilotClass)
  );
  const manualReviewItems = resolutionItems.filter((item) =>
    [
      "auto_review_ready",
      "auto_likely_fcf_evidence",
      "auto_needs_supplier_doc",
      "auto_needs_global_standard",
      "auto_identity_only",
      "auto_insufficient",
    ].includes(item.autopilotClass)
  );
  return {
    queueItemCount: evidenceResolution.summary?.queueItemCount || resolutionItems.length,
    candidatesConsidered:
      evidenceResolution.summary?.retainedCandidateCount ||
      evidenceResolution.summary?.candidateCount ||
      0,
    classCounts,
    reviewReadyCount: reviewReadyItems.length,
    likelyFcfEvidenceCount: classCounts.auto_likely_fcf_evidence || 0,
    alreadyReviewedCount: classCounts.auto_already_reviewed || 0,
    needsSupplierDocCount: classCounts.auto_needs_supplier_doc || 0,
    needsGlobalStandardCount: classCounts.auto_needs_global_standard || 0,
    identityOnlyCount: classCounts.auto_identity_only || 0,
    insufficientEvidenceCount: classCounts.auto_insufficient || 0,
    deferredCount: classCounts.auto_deferred || 0,
    unresolvedCount: unresolvedItems.length,
    manualReviewStillRequiredCount: manualReviewItems.length,
    autoUpdatedReviewStatusCount: autoUpdateResult.autoUpdatedCount || 0,
    sourceQueueAutoUpdateCount: autoUpdateResult.sourceUpdates?.length || 0,
    candidateReviewAutoUpdateCount:
      autoUpdateResult.candidateReviewUpdates?.length || 0,
    downloadedOrCachedSourceCount:
      harvestReport.summary?.downloadSuccessCount ||
      harvestReport.summary?.downloadedLinkCount ||
      documentInventory.summary?.documentCount ||
      0,
    failedDownloadCount:
      harvestReport.summary?.downloadFailureCount ||
      harvestReport.summary?.failedDownloadCount ||
      0,
    documentCount: documentInventory.summary?.documentCount || 0,
    matchedDocumentCount: documentInventory.summary?.matchedDocumentCount || 0,
  };
}

function getNextRecommendedAction(summary = {}) {
  if (summary.likelyFcfEvidenceCount > 0) {
    return "Review likely FCF evidence first; promote only as non-limit FCF source evidence after review.";
  }
  if (summary.reviewReadyCount > 0) {
    return "Review the top category-limit or restriction candidate before any later structured promotion task.";
  }
  if (summary.needsSupplierDocCount > 0) {
    return "Request supplier IFRA/SDS documents for the highest-priority unresolved materials.";
  }
  if (summary.needsGlobalStandardCount > 0) {
    return "Locate source-backed global IFRA standards for the unresolved high-use synthetics.";
  }
  return "Keep the queue current; no automatic runtime IFRA promotion is available from autopilot.";
}

export function buildIfraEvidenceAutopilotReport({
  sourceQueue = {},
  harvestReport = {},
  documentInventory = {},
  candidateExtractions = {},
  candidateReviewQueue = {},
  evidenceResolution = {},
  reviewedSourceRecords = {},
  autoUpdateResult = {},
  generatedAt = new Date().toISOString(),
  downloadRequested = false,
} = {}) {
  const items = (evidenceResolution.items || [])
    .map(buildResolutionSummaryItem)
    .sort(compareResolutionPriority);
  const summary = buildAutopilotSummary({
    evidenceResolution,
    harvestReport,
    documentInventory,
    autoUpdateResult,
  });
  const topReviewReadyMaterials = items
    .filter((item) =>
      ["auto_review_ready", "auto_likely_fcf_evidence"].includes(item.autopilotClass)
    )
    .slice(0, 10);
  const topUnresolvedMaterials = items
    .filter((item) =>
      [
        "auto_needs_supplier_doc",
        "auto_needs_global_standard",
        "auto_identity_only",
        "auto_insufficient",
      ].includes(item.autopilotClass)
    )
    .slice(0, 10);
  return {
    metadata: {
      generatedAt,
      reportName: "IFRA Evidence Autopilot Report",
      regenerateCommand: IFRA_EVIDENCE_AUTOPILOT_COMMAND,
      mode: downloadRequested ? "download" : "dry_run",
      guardrails: [
        "Autopilot harvests, extracts, ranks, and updates review metadata only.",
        "No IFRA limits are promoted automatically.",
        "No runtime IFRA classification is changed.",
        "No launch clearance is claimed.",
      ],
    },
    pipeline: {
      stepsRun: [
        "build_source_acquisition_queue",
        "harvest_source_links",
        downloadRequested ? "download_or_reuse_cached_sources" : "dry_run_source_harvest",
        "inventory_local_source_documents",
        "extract_candidate_source_snippets",
        "build_candidate_review_queue",
        "resolve_best_evidence_candidates",
        "apply_safe_review_metadata_updates",
        "write_autopilot_report",
      ],
      sourceQueueGeneratedAt: sourceQueue.metadata?.generatedAt || null,
      harvestGeneratedAt: harvestReport.metadata?.generatedAt || null,
      documentInventoryGeneratedAt: documentInventory.metadata?.generatedAt || null,
      candidateExtractionGeneratedAt: candidateExtractions.metadata?.generatedAt || null,
      candidateReviewQueueGeneratedAt: candidateReviewQueue.metadata?.generatedAt || null,
      evidenceResolutionGeneratedAt: evidenceResolution.metadata?.generatedAt || null,
      reviewedSourceRecordCount: reviewedSourceRecords.records?.length || 0,
    },
    summary: {
      ...summary,
      nextRecommendedAction: getNextRecommendedAction(summary),
    },
    autoUpdates: {
      sourceQueue: autoUpdateResult.sourceUpdates || [],
      candidateReviewQueue: autoUpdateResult.candidateReviewUpdates || [],
    },
    topReviewReadyMaterials,
    topUnresolvedMaterials,
  };
}

function formatCountLine(label, value) {
  return `- ${label}: ${Number(value || 0).toLocaleString()}`;
}

function escapeMarkdown(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function formatAutopilotItemMarkdown(item = {}) {
  return [
    `### ${item.materialName}`,
    "",
    item.sourceIdentityName && item.sourceIdentityName !== item.materialName
      ? `- Source identity: ${item.sourceIdentityName}`
      : "",
    `- Formulas used in: ${(item.formulasUsedIn || []).join(", ") || "Unknown"}`,
    `- Autopilot class: ${item.autopilotClass}`,
    `- Evidence status: ${item.evidenceStatus}`,
    `- Suggested action: ${item.suggestedAction}`,
    `- Confidence: ${item.confidence}`,
    `- Source identity: ${item.sourceType || "unknown source"}`,
    `- Source: ${item.sourceUrl || item.sourceFile || "No source candidate"}`,
    `- Best candidate: ${item.bestCandidateId || "None"}`,
    `- Snippet: ${item.snippet || "No snippet."}`,
    `- Why selected: ${item.whySelected || "Autopilot resolver classification."}`,
    `- Limitation: ${(item.limitations || []).join("; ") || "Review before use."}`,
    item.generatedCommand
      ? ["", "Suggested command:", "", "```bash", item.generatedCommand, "```"].join("\n")
      : "",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatIfraEvidenceAutopilotMarkdown(report = {}) {
  const summary = report.summary || {};
  const classCounts = summary.classCounts || {};
  return [
    "# IFRA Evidence Autopilot Report",
    "",
    `Generated: ${report.metadata?.generatedAt || ""}`,
    "",
    "Autopilot runs the source-acquisition workflow end to end, ranks evidence, and applies only conservative review metadata updates. It does not promote IFRA limits, change runtime IFRA classification, or prove launch clearance.",
    "",
    "## Summary",
    "",
    formatCountLine("Total queue items", summary.queueItemCount),
    formatCountLine("Candidates considered", summary.candidatesConsidered),
    formatCountLine("Review-ready items", summary.reviewReadyCount),
    formatCountLine("Likely FCF evidence", summary.likelyFcfEvidenceCount),
    formatCountLine("Already reviewed items", summary.alreadyReviewedCount),
    formatCountLine("Needs supplier docs", summary.needsSupplierDocCount),
    formatCountLine("Needs global standards", summary.needsGlobalStandardCount),
    formatCountLine("Insufficient / identity-only evidence", summary.insufficientEvidenceCount + summary.identityOnlyCount),
    formatCountLine("Manual review still required", summary.manualReviewStillRequiredCount),
    formatCountLine("Auto-updated review statuses", summary.autoUpdatedReviewStatusCount),
    formatCountLine("Downloaded/cached source count", summary.downloadedOrCachedSourceCount),
    formatCountLine("Failed download count", summary.failedDownloadCount),
    "",
    `Next recommended action: ${summary.nextRecommendedAction || "Review the top evidence candidates."}`,
    "",
    "Autopilot class counts:",
    ...orderedCountEntries(classCounts, AUTOPILOT_CLASS_ORDER).map(
      ([key, value]) => `- ${key}: ${value}`
    ),
    "",
    "## Auto-Updated Review Statuses",
    "",
    report.autoUpdates?.sourceQueue?.length || report.autoUpdates?.candidateReviewQueue?.length
      ? [
          "| Scope | Material | From | To | Reason |",
          "| --- | --- | --- | --- | --- |",
          ...(report.autoUpdates?.sourceQueue || []).map((update) =>
            `| ${["source queue", update.materialName, update.from, update.to, update.reason]
              .map(escapeMarkdown)
              .join(" | ")} |`
          ),
          ...(report.autoUpdates?.candidateReviewQueue || []).map((update) =>
            `| ${["candidate review", update.materialName, update.from, update.to, update.reason]
              .map(escapeMarkdown)
              .join(" | ")} |`
          ),
        ].join("\n")
      : "No review statuses were auto-updated.",
    "",
    "## Top Review-Ready Materials",
    "",
    report.topReviewReadyMaterials?.length
      ? report.topReviewReadyMaterials.map(formatAutopilotItemMarkdown).join("\n")
      : "_No review-ready materials._\n",
    "## Top Unresolved Materials",
    "",
    report.topUnresolvedMaterials?.length
      ? report.topUnresolvedMaterials.map(formatAutopilotItemMarkdown).join("\n")
      : "_No unresolved materials in the top list._\n",
  ].join("\n");
}

export function formatIfraEvidenceAutopilotText(report = {}) {
  const summary = report.summary || {};
  return [
    "IFRA Evidence Autopilot",
    "",
    "Runs harvest/extract/resolve/review-metadata workflow. Does not promote IFRA limits.",
    "",
    `Queue items: ${summary.queueItemCount || 0}`,
    `Candidates considered: ${summary.candidatesConsidered || 0}`,
    `Review-ready: ${summary.reviewReadyCount || 0}`,
    `Likely FCF evidence: ${summary.likelyFcfEvidenceCount || 0}`,
    `Needs supplier docs: ${summary.needsSupplierDocCount || 0}`,
    `Needs global standards: ${summary.needsGlobalStandardCount || 0}`,
    `Unresolved: ${summary.unresolvedCount || 0}`,
    `Auto-updated review statuses: ${summary.autoUpdatedReviewStatusCount || 0}`,
    `Downloaded/cached source count: ${summary.downloadedOrCachedSourceCount || 0}`,
    `Failed download count: ${summary.failedDownloadCount || 0}`,
    "",
    `Next: ${summary.nextRecommendedAction || "Review top candidates."}`,
    "",
    "Top review-ready materials:",
    ...(report.topReviewReadyMaterials?.length
      ? report.topReviewReadyMaterials
          .slice(0, 8)
          .map(
            (item) =>
              `- ${item.materialName}: ${item.autopilotClass}, ${item.confidence}, ${item.suggestedAction}`
          )
      : ["- None."]),
    "",
  ].join("\n");
}

export function writeIfraEvidenceAutopilotReport(filePath, report) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
}

export async function runIfraEvidenceAutopilot({
  ingredientReferencePath,
  download = false,
  rateLimitMs = 350,
  generatedAt = new Date().toISOString(),
  sourceDocumentDir = DEFAULT_IFRA_SOURCE_DOCUMENT_DIR,
  sourceQueuePath = DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH,
  harvestReportPath = DEFAULT_INGREDIENT_SOURCE_HARVEST_REPORT_PATH,
  documentInventoryPath = DEFAULT_IFRA_SOURCE_DOCUMENT_INVENTORY_PATH,
  candidateExtractionsPath = DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH,
  candidateReviewQueuePath = DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_PATH,
  evidenceResolutionPath = DEFAULT_IFRA_EVIDENCE_RESOLUTION_PATH,
  officialIfraSourceCandidatesPath = DEFAULT_OFFICIAL_IFRA_SOURCE_CANDIDATES_PATH,
  reviewedSourceRecordsPath = DEFAULT_REVIEWED_IFRA_SOURCE_RECORDS_PATH,
  proposedRecordsPath = DEFAULT_PROPOSED_IFRA_STRUCTURED_RECORDS_PATH,
  recommendationsPath = DEFAULT_IFRA_AUTOPILOT_RECOMMENDATIONS_PATH,
  outputPath = DEFAULT_IFRA_EVIDENCE_AUTOPILOT_REPORT_PATH,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!ingredientReferencePath) {
    throw new Error("--ingredient-reference is required");
  }

  const existingSourceQueue = loadExistingHeroIfraSourceQueue(sourceQueuePath);
  const gapReport = buildHeroIfraSourceGapReport({
    ingredientReferencePath,
  });
  let sourceQueue = buildHeroIfraSourceAcquisitionQueue({
    gapReport,
    existingQueue: existingSourceQueue,
    generatedAt,
  });
  writeHeroIfraSourceAcquisitionQueue(sourceQueuePath, sourceQueue);

  let harvestReport = buildIngredientSourceHarvestReport({
    ingredientReferencePath,
    queue: sourceQueue,
    generatedAt,
    download,
  });
  if (download) {
    harvestReport = await downloadHarvestSources({
      report: harvestReport,
      fetchImpl,
      rateLimitMs,
      sourceDir: sourceDocumentDir,
    });
  }
  writeIngredientSourceHarvestReport(harvestReportPath, harvestReport);

  const documentInventory = buildIfraSourceDocumentInventory({
    sourceDir: sourceDocumentDir,
    queue: sourceQueue,
    generatedAt,
  });
  writeIfraSourceDocumentInventory(documentInventoryPath, documentInventory);

  const candidateExtractions = buildCandidateIfraSourceExtractions({
    sourceDir: sourceDocumentDir,
    queue: sourceQueue,
    harvestReport,
    generatedAt,
  });
  writeCandidateIfraExtractions(candidateExtractionsPath, candidateExtractions);

  const existingCandidateReviewQueue =
    loadExistingCandidateIfraReviewQueue(candidateReviewQueuePath) || {};
  let candidateReviewQueue = buildCandidateIfraReviewQueue({
    candidateExtractions,
    sourceQueue,
    existingQueue: existingCandidateReviewQueue,
    generatedAt,
  });

  const reviewedSourceRecords =
    loadReviewedIfraSourceRecords(reviewedSourceRecordsPath) ||
    loadJsonIfPresent(reviewedSourceRecordsPath) ||
    {};
  const officialIfraSourceCandidates =
    loadJsonIfPresent(officialIfraSourceCandidatesPath) || {};
  let evidenceResolution = buildIfraEvidenceResolution({
    sourceQueue,
    candidateExtractions,
    officialIfraSourceCandidates,
    candidateReviewQueue,
    reviewedSourceRecords,
    ingredientSourceHarvestReport: harvestReport,
    generatedAt,
  });

  const autoUpdateResult = applyAutopilotReviewUpdates({
    sourceQueue,
    candidateReviewQueue,
    evidenceResolution,
    candidateExtractions,
    reviewedSourceRecords,
    now: generatedAt,
  });
  sourceQueue = autoUpdateResult.sourceQueue;
  candidateReviewQueue = autoUpdateResult.candidateReviewQueue;
  writeHeroIfraSourceAcquisitionQueue(sourceQueuePath, sourceQueue);
  writeCandidateIfraReviewQueue(candidateReviewQueuePath, candidateReviewQueue);

  evidenceResolution = buildIfraEvidenceResolution({
    sourceQueue,
    candidateExtractions,
    officialIfraSourceCandidates,
    candidateReviewQueue,
    reviewedSourceRecords,
    ingredientSourceHarvestReport: harvestReport,
    generatedAt,
  });
  writeIfraEvidenceResolution(evidenceResolutionPath, evidenceResolution);

  const report = buildIfraEvidenceAutopilotReport({
    sourceQueue,
    harvestReport,
    documentInventory,
    candidateExtractions,
    candidateReviewQueue,
    evidenceResolution,
    reviewedSourceRecords,
    autoUpdateResult,
    generatedAt,
    downloadRequested: download,
  });
  writeIfraEvidenceAutopilotReport(outputPath, report);

  const recommendations = buildIfraAutopilotRecommendations({
    evidenceResolution,
    candidateExtractions,
    reviewedSourceRecords,
    autopilotReport: report,
    generatedAt,
  });
  const proposedRecordsFile = buildProposedIfraStructuredRecordsFile({
    records: [
      ...(recommendations.proposedStructuredRecords || []),
      ...(recommendations.autoAcceptedNonLimitEvidence || []),
    ],
    generatedAt,
  });
  writeIfraAutopilotRecommendations(recommendationsPath, recommendations);
  writeProposedIfraStructuredRecords(proposedRecordsPath, proposedRecordsFile);

  return {
    report,
    recommendations,
    proposedRecordsFile,
    sourceQueue,
    harvestReport,
    documentInventory,
    candidateExtractions,
    candidateReviewQueue,
    evidenceResolution,
    reviewedSourceRecords,
    autoUpdateResult,
  };
}
