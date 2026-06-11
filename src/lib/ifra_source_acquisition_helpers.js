export const IFRA_SOURCE_ACQUISITION_REGENERATE_COMMAND =
  "node scripts/build_hero_ifra_source_acquisition_queue.mjs --markdown --write docs/ifra/hero_ifra_source_acquisition_queue.md";

export const IFRA_SOURCE_DOCUMENT_INVENTORY_COMMAND =
  "node scripts/inventory_ifra_source_documents.mjs --markdown --write docs/ifra/ifra_source_document_inventory.md";

export const IFRA_SOURCE_ACQUISITION_MISSING_MESSAGE =
  "Run the IFRA source acquisition queue script to generate the document checklist.";

export const IFRA_SOURCE_ACQUISITION_GUARDRAIL =
  "Not launch clearance - acquisition tracking only. Reviewed source documents still require a separate structured IFRA promotion task.";

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

export function buildIfraSourceAcquisitionPanel(queue, documentInventory = null) {
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
  };
}
