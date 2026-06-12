export const IFRA_SOURCE_ACQUISITION_REGENERATE_COMMAND =
  "node scripts/build_hero_ifra_source_acquisition_queue.mjs --markdown --write docs/ifra/hero_ifra_source_acquisition_queue.md";

export const IFRA_SOURCE_DOCUMENT_INVENTORY_COMMAND =
  "node scripts/inventory_ifra_source_documents.mjs --markdown --write docs/ifra/ifra_source_document_inventory.md";

export const CANDIDATE_IFRA_REVIEW_QUEUE_COMMAND =
  "node scripts/build_candidate_ifra_review_queue.mjs --markdown --write docs/ifra/candidate_ifra_review_queue.md";

export const IFRA_EVIDENCE_RESOLVER_COMMAND =
  "node scripts/resolve_ifra_evidence_candidates.mjs --markdown --write docs/ifra/ifra_evidence_resolution.md";

export const IFRA_EVIDENCE_AUTOPILOT_COMMAND =
  'node scripts/run_ifra_evidence_autopilot.mjs --ingredient-reference "...Ingredient data - Ingredient Data.csv" --download --markdown --write docs/ifra/ifra_evidence_autopilot_report.md';

export const IFRA_SOURCE_ACQUISITION_AUTOPILOT_COMMAND =
  'node scripts/run_ifra_source_acquisition_autopilot.mjs --ingredient-reference "...Ingredient data - Ingredient Data.csv" --download --markdown --write docs/ifra/ifra_source_acquisition_autopilot_report.md';

export const IFRA_AUTOPILOT_RECOMMENDATIONS_COMMAND =
  "node scripts/generate_ifra_autopilot_recommendations.mjs --markdown --write docs/ifra/ifra_autopilot_recommendations.md";

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

function isAvailableAutopilotReport(autopilotReport) {
  return Boolean(autopilotReport && autopilotReport.summary);
}

function buildTopAutopilotItems(autopilotReport) {
  if (!isAvailableAutopilotReport(autopilotReport)) return [];
  return (autopilotReport.topReviewReadyMaterials || [])
    .slice(0, 5)
    .map((item) => ({
      queueItemId: item.queueItemId,
      materialName: item.materialName,
      autopilotClass: item.autopilotClass,
      suggestedAction: item.suggestedAction,
      confidence: item.confidence,
      source: item.sourceUrl || item.sourceFile || "",
      whySelected: item.whySelected || "",
    }));
}

function buildAutopilotProgress(autopilotReport) {
  if (!isAvailableAutopilotReport(autopilotReport)) {
    return {
      isAvailable: false,
      missingMessage:
        "Run IFRA Evidence Autopilot to refresh harvest, extraction, resolver, and review-status recommendations in one pass.",
      regenerateCommand: IFRA_EVIDENCE_AUTOPILOT_COMMAND,
      guardrail: "Autopilot output does not promote IFRA limits.",
      lastRunAt: "",
      nextRecommendedAction: "Run autopilot before starting manual evidence review.",
      counts: {
        reviewReady: 0,
        likelyFcfEvidence: 0,
        unresolved: 0,
        autoUpdated: 0,
        alreadyReviewed: 0,
      },
      topReviewFirstMaterials: [],
    };
  }
  const summary = autopilotReport.summary || {};
  return {
    isAvailable: true,
    missingMessage: "",
    regenerateCommand:
      autopilotReport.metadata?.regenerateCommand || IFRA_EVIDENCE_AUTOPILOT_COMMAND,
    guardrail: "Autopilot ranks and updates review metadata only; it does not promote IFRA limits.",
    lastRunAt: autopilotReport.metadata?.generatedAt || "",
    nextRecommendedAction:
      summary.nextRecommendedAction || "Review the top evidence candidates.",
    counts: {
      reviewReady: summary.reviewReadyCount || 0,
      likelyFcfEvidence: summary.likelyFcfEvidenceCount || 0,
      unresolved: summary.unresolvedCount || 0,
      autoUpdated: summary.autoUpdatedReviewStatusCount || 0,
      alreadyReviewed: summary.alreadyReviewedCount || 0,
    },
    topReviewFirstMaterials: buildTopAutopilotItems(autopilotReport),
  };
}

function isAvailableSourceAcquisitionAutopilotReport(report) {
  return Boolean(report && report.summary);
}

function buildSourceAcquisitionAutopilotProgress(report) {
  if (!isAvailableSourceAcquisitionAutopilotReport(report)) {
    return {
      isAvailable: false,
      missingMessage:
        "Run Source Acquisition Autopilot v2 to target unresolved materials, acquire allowed sources, and refresh the review pipeline.",
      regenerateCommand: IFRA_SOURCE_ACQUISITION_AUTOPILOT_COMMAND,
      guardrail:
        "Source acquisition autopilot does not promote runtime IFRA limits or claim launch clearance.",
      lastRunAt: "",
      nextAutomatedAction:
        "Run source acquisition autopilot after adding or updating ingredient reference links.",
      counts: {
        materialsTargeted: 0,
        newSourcesFound: 0,
        newProposedStructuredRecords: 0,
        remainingNeedsBetterSource: 0,
        newLinksDiscovered: 0,
        downloadsSucceeded: 0,
      },
    };
  }
  const summary = report.summary || {};
  return {
    isAvailable: true,
    missingMessage: "",
    regenerateCommand:
      report.metadata?.regenerateCommand ||
      IFRA_SOURCE_ACQUISITION_AUTOPILOT_COMMAND,
    guardrail:
      "Source acquisition autopilot only caches candidates and refreshes review outputs; no runtime IFRA limits are promoted.",
    lastRunAt: report.metadata?.generatedAt || "",
    nextAutomatedAction:
      summary.nextAutomatedAction ||
      "Review newly acquired sources before any separate promotion task.",
    counts: {
      materialsTargeted: summary.materialsTargeted || 0,
      newSourcesFound:
        summary.newSourcesFound ||
        (summary.newOfficialMatchesFound || 0) +
          (summary.newSupplierIfraSdsSpecDocsFound || 0),
      newProposedStructuredRecords:
        summary.newProposedStructuredRecords || 0,
      remainingNeedsBetterSource: summary.remainingNeedsBetterSource || 0,
      newLinksDiscovered: summary.newLinksDiscovered || 0,
      downloadsSucceeded: summary.downloadsSucceeded || 0,
    },
  };
}

function isAvailableRecommendationReport(recommendations) {
  return Boolean(recommendations && recommendations.summary);
}

function buildTopProposedRecords(recommendations) {
  if (!isAvailableRecommendationReport(recommendations)) return [];
  return (recommendations.proposedStructuredRecords || []).slice(0, 5).map((record) => ({
    id: record.id,
    materialName: record.materialName,
    sourceIdentityName: record.sourceIdentityName,
    recordType: record.recordType,
    category: record.category,
    candidateValue: record.candidateValue,
    candidateUnit: record.candidateUnit,
    evidenceConfidence: record.evidenceConfidence,
    source: record.sourceUrl || record.sourceFile || "",
  }));
}

function buildTopRecommendationNeedsSource(recommendations) {
  if (!isAvailableRecommendationReport(recommendations)) return [];
  return (recommendations.needsBetterSource || []).slice(0, 5).map((item) => ({
    queueItemId: item.queueItemId,
    materialName: item.materialName,
    sourceIdentityName: item.sourceIdentityName,
    recommendationStatus: item.recommendationStatus,
    suggestedAction: item.suggestedAction,
    evidenceStatus: item.evidenceStatus,
  }));
}

function buildRecommendationProgress(recommendations) {
  if (!isAvailableRecommendationReport(recommendations)) {
    return {
      isAvailable: false,
      missingMessage:
        "Run IFRA autopilot recommendations to stage proposed records and reduce manual review to concrete next actions.",
      regenerateCommand: IFRA_AUTOPILOT_RECOMMENDATIONS_COMMAND,
      guardrail: "Recommendations do not promote runtime IFRA limits.",
      counts: {
        proposedStructuredRecords: 0,
        autoAcceptedNonLimitEvidence: 0,
        needsBetterSource: 0,
        rejectedNoise: 0,
        alreadyHandled: 0,
      },
      nextRecommendedAction:
        "Generate recommendations after autopilot evidence resolution.",
      topProposedRecords: [],
      topNeedsBetterSource: [],
    };
  }
  const summary = recommendations.summary || {};
  return {
    isAvailable: true,
    missingMessage: "",
    regenerateCommand:
      recommendations.metadata?.regenerateCommand ||
      IFRA_AUTOPILOT_RECOMMENDATIONS_COMMAND,
    guardrail:
      "Proposed records are staged for review only; no runtime IFRA limits have been changed.",
    counts: {
      proposedStructuredRecords: summary.proposedStructuredRecordCount || 0,
      autoAcceptedNonLimitEvidence:
        summary.autoAcceptedNonLimitEvidenceCount || 0,
      needsBetterSource:
        (summary.needsBetterSourceCount || 0) +
        (summary.noUsefulEvidenceCount || 0),
      rejectedNoise: summary.rejectedNoiseCount || 0,
      alreadyHandled: summary.alreadyHandledCount || 0,
    },
    nextRecommendedAction:
      summary.nextRecommendedAction ||
      "Review proposed records before any promotion task.",
    topProposedRecords: buildTopProposedRecords(recommendations),
    topNeedsBetterSource: buildTopRecommendationNeedsSource(recommendations),
  };
}

export function buildIfraSourceAcquisitionPanel(
  queue,
  documentInventory = null,
  candidateReviewQueue = null,
  evidenceResolution = null,
  autopilotReport = null,
  autopilotRecommendations = null,
  sourceAcquisitionAutopilotReport = null
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
      sourceAcquisitionAutopilot:
        buildSourceAcquisitionAutopilotProgress(sourceAcquisitionAutopilotReport),
      autopilot: buildAutopilotProgress(autopilotReport),
      recommendations: buildRecommendationProgress(autopilotRecommendations),
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
  const sourceAcquisitionAutopilotProgress =
    buildSourceAcquisitionAutopilotProgress(sourceAcquisitionAutopilotReport);
  const autopilotProgress = buildAutopilotProgress(autopilotReport);
  const recommendationProgress = buildRecommendationProgress(autopilotRecommendations);

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
    sourceAcquisitionAutopilot: sourceAcquisitionAutopilotProgress,
    autopilot: autopilotProgress,
    recommendations: recommendationProgress,
  };
}
