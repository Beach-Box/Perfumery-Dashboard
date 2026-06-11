export const IFRA_SOURCE_ACQUISITION_REGENERATE_COMMAND =
  "node scripts/build_hero_ifra_source_acquisition_queue.mjs --markdown --write docs/ifra/hero_ifra_source_acquisition_queue.md";

export const IFRA_SOURCE_DOCUMENT_INVENTORY_COMMAND =
  "node scripts/inventory_ifra_source_documents.mjs --markdown --write docs/ifra/ifra_source_document_inventory.md";

export const CANDIDATE_IFRA_REVIEW_QUEUE_COMMAND =
  "node scripts/build_candidate_ifra_review_queue.mjs --markdown --write docs/ifra/candidate_ifra_review_queue.md";

export const IFRA_EVIDENCE_RESOLVER_COMMAND =
  "node scripts/resolve_ifra_evidence_candidates.mjs --markdown --write docs/ifra/ifra_evidence_resolution.md";

export const IFRA_SOURCE_ACQUISITION_MISSING_MESSAGE =
  "Run the IFRA source acquisition queue script to generate the document checklist.";

export const IFRA_SOURCE_ACQUISITION_GUARDRAIL =
  "Not launch clearance - acquisition tracking only. Reviewed source documents and accepted candidates still require a separate structured IFRA promotion task.";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

const SOURCE_TYPE_LABELS = {
  global_ifra_standard_needed: "global IFRA standard",
  supplier_ifra_or_sds_needed: "supplier IFRA/SDS",
  specialty_supplier_document_needed: "specialty supplier document",
  natural_uvcb_supplier_document_needed: "natural/UVCB supplier documentation",
  accord_component_expansion_deferred: "accord expansion deferred",
  already_structured: "already structured",
  fcf_special_case: "FCF special case",
  defer_low_priority: "deferred low priority",
};

function countBy(items = [], key) {
  return items.reduce((acc, item) => {
    const value = item?.[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function isAvailableQueue(queue) {
  return Boolean(queue && Array.isArray(queue.items));
}

function isRemainingGap(item = {}) {
  return !["reviewed", "promoted", "not_applicable"].includes(item.status);
}

function isActionableSourceGap(item = {}) {
  return ![
    "already_structured",
    "accord_component_expansion_deferred",
    "defer_low_priority",
  ].includes(item.requiredSourceType);
}

function compareTopGaps(left, right) {
  const priorityDelta =
    (PRIORITY_RANK[left.priority] ?? 99) - (PRIORITY_RANK[right.priority] ?? 99);
  if (priorityDelta) return priorityDelta;
  const sourceDelta = String(left.requiredSourceType || "").localeCompare(
    String(right.requiredSourceType || "")
  );
  if (sourceDelta) return sourceDelta;
  return String(left.materialName || "").localeCompare(String(right.materialName || ""));
}

function formatSourceType(value) {
  return SOURCE_TYPE_LABELS[value] || value || "source document";
}

function buildTopRemainingGaps(items = []) {
  return items
    .filter((item) => isRemainingGap(item) && isActionableSourceGap(item))
    .sort(compareTopGaps)
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      materialName: item.materialName,
      priority: item.priority || "medium",
      requiredSourceType: item.requiredSourceType || "",
      sourceTypeLabel: formatSourceType(item.requiredSourceType),
      status: item.status || "needed",
      reviewStatus: item.reviewStatus || "not_started",
      formulasUsedIn: item.formulasUsedIn || [],
      reason: item.reason || "",
      suggestedDocumentName: item.suggestedDocumentName || "",
    }));
}

function isAvailableInventory(inventory) {
  return Boolean(inventory && Array.isArray(inventory.documents));
}

function isAvailableCandidateReviewQueue(candidateReviewQueue) {
  return Boolean(candidateReviewQueue && Array.isArray(candidateReviewQueue.items));
}

function buildTopUnmatchedDocuments(inventory) {
  if (!isAvailableInventory(inventory)) return [];
  return (inventory.documents || [])
    .filter((document) => !document.matchedQueueItemIds?.length)
    .slice(0, 5)
    .map((document) => ({
      id: document.id,
      filename: document.filename,
      materialGuess: document.materialGuess || "",
      sourceTypeGuess: document.sourceTypeGuess || "unknown",
      matchConfidence: document.matchConfidence || "none",
      possibleMatches: document.possibleMatches || [],
    }));
}

function buildDocumentReviewProgress({ queue, items, reviewStatusCounts }) {
  const needingDocuments = items
    .filter(
      (item) =>
        ["needed", "searching"].includes(item.status) &&
        isRemainingGap(item) &&
        isActionableSourceGap(item)
    )
    .sort(compareTopGaps)
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      materialName: item.materialName,
      requiredSourceType: item.requiredSourceType || "",
      sourceTypeLabel: formatSourceType(item.requiredSourceType),
      status: item.status || "needed",
      reviewStatus: item.reviewStatus || "not_started",
      formulasUsedIn: item.formulasUsedIn || [],
    }));
  return {
    acquired: queue?.summary?.statusCounts?.acquired || 0,
    needsReview: reviewStatusCounts.needs_review || 0,
    reviewedOk: reviewStatusCounts.reviewed_ok || 0,
    topQueueItemsNeedingDocuments: needingDocuments,
  };
}

function compareCandidateReviewItems(left, right) {
  const priorityDelta =
    (PRIORITY_RANK[left.highestPriority] ?? 99) -
    (PRIORITY_RANK[right.highestPriority] ?? 99);
  if (priorityDelta) return priorityDelta;
  return String(left.materialName || "").localeCompare(String(right.materialName || ""));
}

function buildTopCandidateReviewItems(candidateReviewQueue) {
  if (!isAvailableCandidateReviewQueue(candidateReviewQueue)) return [];
  return (candidateReviewQueue.items || [])
    .filter(
      (item) =>
        item.queueItemId &&
        !["accepted", "rejected", "deferred"].includes(item.reviewStatus)
    )
    .sort(compareCandidateReviewItems)
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      queueItemId: item.queueItemId,
      materialName: item.materialName,
      highestPriority: item.highestPriority || "low",
      candidateCount: item.candidateCount || 0,
      reviewStatus: item.reviewStatus || "not_started",
      requiredSourceType: item.requiredSourceType || "",
      suggestedReviewAction: item.suggestedReviewAction || "",
    }));
}

function buildCandidateReviewProgress(candidateReviewQueue) {
  if (!isAvailableCandidateReviewQueue(candidateReviewQueue)) {
    return {
      isAvailable: false,
      missingMessage:
        "Run the candidate IFRA review queue script to group extracted snippets for review.",
      regenerateCommand: CANDIDATE_IFRA_REVIEW_QUEUE_COMMAND,
      counts: {
        reviewItems: 0,
        highPriorityReviewItems: 0,
        notStarted: 0,
        inReview: 0,
        accepted: 0,
        rejected: 0,
        needsMoreSource: 0,
      },
      topMaterialsAwaitingReview: [],
    };
  }
  const summary = candidateReviewQueue.summary || {};
  const reviewStatusCounts =
    summary.reviewStatusCounts || countBy(candidateReviewQueue.items, "reviewStatus");
  return {
    isAvailable: true,
    missingMessage: "",
    regenerateCommand:
      candidateReviewQueue.metadata?.regenerateCommand ||
      CANDIDATE_IFRA_REVIEW_QUEUE_COMMAND,
    counts: {
      reviewItems: summary.itemCount || candidateReviewQueue.items.length || 0,
      highPriorityReviewItems: summary.highPriorityItemCount || 0,
      notStarted: summary.notStartedCount ?? reviewStatusCounts.not_started ?? 0,
      inReview: summary.inReviewCount ?? reviewStatusCounts.in_review ?? 0,
      accepted: summary.acceptedCount ?? reviewStatusCounts.accepted ?? 0,
      rejected: summary.rejectedCount ?? reviewStatusCounts.rejected ?? 0,
      needsMoreSource:
        summary.needsMoreSourceCount ?? reviewStatusCounts.needs_more_source ?? 0,
    },
    topMaterialsAwaitingReview: buildTopCandidateReviewItems(candidateReviewQueue),
  };
}

function isAvailableEvidenceResolution(evidenceResolution) {
  return Boolean(evidenceResolution && Array.isArray(evidenceResolution.items));
}

function compareResolverItems(left, right) {
  const scoreDelta = (right.score || 0) - (left.score || 0);
  if (scoreDelta) return scoreDelta;
  return String(left.materialName || "").localeCompare(String(right.materialName || ""));
}

function buildTopResolverItems(evidenceResolution) {
  if (!isAvailableEvidenceResolution(evidenceResolution)) return [];
  return (evidenceResolution.items || [])
    .filter((item) =>
      [
        "review_ready",
        "candidate_found_needs_review",
        "likely_fcf_evidence",
      ].includes(item.evidenceStatus)
    )
    .sort(compareResolverItems)
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      queueItemId: item.queueItemId,
      materialName: item.materialName,
      evidenceStatus: item.evidenceStatus,
      suggestedAction: item.suggestedAction,
      confidence: item.confidence,
      score: item.score || 0,
      bestCandidateId: item.bestCandidates?.[0]?.id || "",
      source: item.bestCandidates?.[0]?.sourceUrl || item.bestCandidates?.[0]?.sourceFile || "",
      whySelected: item.whySelected || "",
    }));
}

function buildEvidenceResolverProgress(evidenceResolution) {
  if (!isAvailableEvidenceResolution(evidenceResolution)) {
    return {
      isAvailable: false,
      missingMessage:
        "Run the IFRA evidence resolver to rank extracted candidates into a short review list.",
      regenerateCommand: IFRA_EVIDENCE_RESOLVER_COMMAND,
      guardrail: "Evidence resolver output does not promote IFRA limits.",
      counts: {
        reviewReady: 0,
        likelyFcfEvidence: 0,
        insufficientEvidence: 0,
        needsSupplierDoc: 0,
      },
      topReviewFirstMaterials: [],
    };
  }
  const summary = evidenceResolution.summary || {};
  return {
    isAvailable: true,
    missingMessage: "",
    regenerateCommand:
      evidenceResolution.metadata?.regenerateCommand ||
      IFRA_EVIDENCE_RESOLVER_COMMAND,
    guardrail: "Evidence resolver output does not promote IFRA limits.",
    counts: {
      reviewReady: summary.reviewReadyCount || 0,
      likelyFcfEvidence: summary.likelyFcfEvidenceCount || 0,
      insufficientEvidence: summary.insufficientEvidenceCount || 0,
      needsSupplierDoc: summary.needsSupplierDocCount || 0,
    },
    topReviewFirstMaterials: buildTopResolverItems(evidenceResolution),
  };
}

export function buildIfraSourceAcquisitionPanel(
  queue,
  documentInventory = null,
  candidateReviewQueue = null,
  evidenceResolution = null
) {
  if (!isAvailableQueue(queue)) {
    return {
      isAvailable: false,
      missingMessage: IFRA_SOURCE_ACQUISITION_MISSING_MESSAGE,
      guardrail: IFRA_SOURCE_ACQUISITION_GUARDRAIL,
      regenerateCommand: IFRA_SOURCE_ACQUISITION_REGENERATE_COMMAND,
      inventoryCommand: IFRA_SOURCE_DOCUMENT_INVENTORY_COMMAND,
      counts: {
        total: 0,
        highPriority: 0,
        highPriorityRemaining: 0,
        needed: 0,
        searching: 0,
        acquired: 0,
        reviewed: 0,
        promoted: 0,
        deferred: 0,
        needsReview: 0,
        reviewedOk: 0,
      },
      sourceTypeCounts: {},
      topRemainingGaps: [],
      documentInventory: {
        isAvailable: false,
        missingMessage: "Run the IFRA source document inventory script after placing acquired documents in downloads/source_documents/ifra/.",
        counts: {
          documentsFound: 0,
          matchedDocuments: 0,
          possibleMatches: 0,
          unmatchedDocuments: 0,
        },
        topUnmatchedDocuments: [],
        topQueueItemsNeedingDocuments: [],
      },
      candidateReview: buildCandidateReviewProgress(candidateReviewQueue),
      evidenceResolver: buildEvidenceResolverProgress(evidenceResolution),
    };
  }

  const items = queue.items || [];
  const statusCounts = queue.summary?.statusCounts || countBy(items, "status");
  const reviewStatusCounts =
    queue.summary?.reviewStatusCounts || countBy(items, "reviewStatus");
  const priorityCounts = queue.summary?.priorityCounts || countBy(items, "priority");
  const sourceTypeCounts =
    queue.summary?.requiredSourceTypeCounts || countBy(items, "requiredSourceType");
  const highPriorityRemaining =
    queue.summary?.highPriorityRemainingCount ??
    items.filter(
      (item) =>
        item.priority === "high" &&
        isRemainingGap(item) &&
        isActionableSourceGap(item)
    ).length;

  const inventoryAvailable = isAvailableInventory(documentInventory);
  const inventorySummary = documentInventory?.summary || {};
  const documentReviewProgress = buildDocumentReviewProgress({
    queue,
    items,
    reviewStatusCounts,
  });
  const candidateReviewProgress = buildCandidateReviewProgress(candidateReviewQueue);
  const evidenceResolverProgress = buildEvidenceResolverProgress(evidenceResolution);

  return {
    isAvailable: true,
    missingMessage: "",
    guardrail: IFRA_SOURCE_ACQUISITION_GUARDRAIL,
    regenerateCommand:
      queue.metadata?.regenerateCommand || IFRA_SOURCE_ACQUISITION_REGENERATE_COMMAND,
    inventoryCommand: IFRA_SOURCE_DOCUMENT_INVENTORY_COMMAND,
    counts: {
      total: queue.summary?.itemCount ?? items.length,
      highPriority: queue.summary?.highPriorityCount ?? priorityCounts.high ?? 0,
      highPriorityRemaining,
      needed: statusCounts.needed || 0,
      searching: statusCounts.searching || 0,
      acquired: statusCounts.acquired || 0,
      reviewed: statusCounts.reviewed || 0,
      promoted: statusCounts.promoted || 0,
      deferred: statusCounts.deferred || 0,
      needsReview: documentReviewProgress.needsReview,
      reviewedOk: documentReviewProgress.reviewedOk,
    },
    sourceTypeCounts,
    topRemainingGaps: buildTopRemainingGaps(items),
    documentInventory: {
      isAvailable: inventoryAvailable,
      missingMessage: "Run the IFRA source document inventory script after placing acquired documents in downloads/source_documents/ifra/.",
      counts: {
        documentsFound: inventorySummary.documentCount || 0,
        matchedDocuments: inventorySummary.matchedDocumentCount || 0,
        possibleMatches: inventorySummary.possibleMatchDocumentCount || 0,
        unmatchedDocuments: inventorySummary.unmatchedDocumentCount || 0,
        acquired: documentReviewProgress.acquired,
        needsReview: documentReviewProgress.needsReview,
        reviewedOk: documentReviewProgress.reviewedOk,
      },
      topUnmatchedDocuments: buildTopUnmatchedDocuments(documentInventory),
      topQueueItemsNeedingDocuments:
        documentReviewProgress.topQueueItemsNeedingDocuments,
    },
    candidateReview: candidateReviewProgress,
    evidenceResolver: evidenceResolverProgress,
  };
}
