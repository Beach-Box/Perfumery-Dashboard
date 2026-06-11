import fs from "node:fs";
import path from "node:path";

import {
  addSourceIdentityFields,
  stripSourceDilutionTerms,
} from "./ifra_source_identity.mjs";

const DEFAULT_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);

export const DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH = path.join(
  DEFAULT_ROOT,
  "data",
  "ifra_source_acquisition",
  "hero_ifra_source_queue.json"
);

export const DEFAULT_HERO_IFRA_SOURCE_QUEUE_MARKDOWN_PATH = path.join(
  DEFAULT_ROOT,
  "docs",
  "ifra",
  "hero_ifra_source_acquisition_queue.md"
);

export const HERO_IFRA_SOURCE_QUEUE_REGENERATE_COMMAND =
  "node scripts/build_hero_ifra_source_acquisition_queue.mjs --markdown --write docs/ifra/hero_ifra_source_acquisition_queue.md";

const MANUAL_FIELDS = [
  "status",
  "reviewStatus",
  "sourceFile",
  "sourceNotes",
  "reviewNotes",
  "lastUpdated",
];

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

const STATUS_ORDER = [
  "needed",
  "searching",
  "acquired",
  "reviewed",
  "promoted",
  "deferred",
  "not_applicable",
];

const REVIEW_STATUS_ORDER = [
  "not_started",
  "needs_review",
  "reviewed_ok",
  "rejected",
  "needs_more_source",
];

const REQUIRED_SOURCE_LABELS = {
  global_ifra_standard_needed: "Global IFRA standard needed",
  supplier_ifra_or_sds_needed: "Supplier IFRA/SDS needed",
  specialty_supplier_document_needed: "Specialty supplier document needed",
  natural_uvcb_supplier_document_needed: "Natural/UVCB supplier documentation needed",
  accord_component_expansion_deferred: "Accord component expansion deferred",
  already_structured: "Already structured",
  fcf_special_case: "FCF special case",
  defer_low_priority: "Deferred low priority",
};

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

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeName(value).replace(/\s+/g, "-") || "unknown-material";
}

function splitLinks(value) {
  return uniqueStrings(
    String(value || "")
      .split(/[;\s]+/)
      .map((part) => part.trim())
      .filter((part) => /^https?:\/\//i.test(part))
  );
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item?.[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function orderedCountEntries(counts, order) {
  const seen = new Set(order);
  return [
    ...order.filter((key) => counts[key] != null).map((key) => [key, counts[key]]),
    ...Object.entries(counts)
      .filter(([key]) => !seen.has(key))
      .sort(([left], [right]) => left.localeCompare(right)),
  ];
}

export function makeHeroIfraSourceQueueItemId(row = {}) {
  const sourceType = row.requiredSourceType || "source_needed";
  return `hero-ifra-source-${slugify(row.sourceIdentityName || row.normalizedName || row.materialName)}-${sourceType}`;
}

function makeExistingLookup(existingQueue = {}) {
  const queue = existingQueue || {};
  const byId = new Map();
  const byMaterialAndSource = new Map();
  for (const item of queue.items || []) {
    if (item?.id) byId.set(item.id, item);
    const key = `${normalizeName(item?.normalizedName || item?.materialName)}::${
      item?.requiredSourceType || ""
    }`;
    const sourceIdentityKey = `${normalizeName(item?.sourceIdentityName || item?.normalizedName || item?.materialName)}::${
      item?.requiredSourceType || ""
    }`;
    if (key !== "::") byMaterialAndSource.set(key, item);
    if (sourceIdentityKey !== "::") byMaterialAndSource.set(sourceIdentityKey, item);
  }
  return { byId, byMaterialAndSource };
}

function getExistingItem(row, existingLookup) {
  const id = makeHeroIfraSourceQueueItemId(row);
  const key = `${normalizeName(row.sourceIdentityName || row.normalizedName || row.materialName)}::${
    row.requiredSourceType || ""
  }`;
  return existingLookup.byId.get(id) || existingLookup.byMaterialAndSource.get(key) || null;
}

function getDefaultStatus(requiredSourceType) {
  if (requiredSourceType === "already_structured") return "not_applicable";
  if (requiredSourceType === "accord_component_expansion_deferred") return "deferred";
  return "needed";
}

function getDefaultReviewStatus(requiredSourceType) {
  if (requiredSourceType === "already_structured") return "reviewed_ok";
  return "not_started";
}

function getSuggestedSource(row) {
  switch (row.requiredSourceType) {
    case "global_ifra_standard_needed":
      return "IFRA Standards Library or committed IFRA standard source package";
    case "supplier_ifra_or_sds_needed":
      return "Supplier product page, supplier IFRA certificate, and SDS";
    case "specialty_supplier_document_needed":
      return "Supplier or manufacturer specialty-material IFRA certificate and SDS";
    case "natural_uvcb_supplier_document_needed":
      return "Supplier IFRA certificate, SDS, allergen declaration, and product identity/spec";
    case "accord_component_expansion_deferred":
      return "Internal accord recipe expansion review";
    case "already_structured":
      return "Current structured IFRA dataset";
    case "fcf_special_case":
      return "Supplier certificate confirming FCF/furocoumarin-free identity";
    default:
      return "Source document review";
  }
}

function buildKnownReferenceLinks(row = {}) {
  if (row.referenceMatchConfidence !== "confirmed") return [];
  const links = [];
  for (const url of splitLinks(row.referenceSdsLink)) {
    links.push({ type: "sds", label: "SDS", url });
  }
  for (const url of splitLinks(row.referenceProductPage)) {
    links.push({ type: "product_page", label: "Product page", url });
  }
  for (const url of splitLinks(row.referenceSupplierPage)) {
    links.push({ type: "supplier_page", label: "Supplier page", url });
  }
  for (const url of splitLinks(row.referenceGoodScentsUrl)) {
    links.push({ type: "identity_reference", label: "Identity reference", url });
  }
  return links;
}

function shouldTreatAsDeferred(item) {
  return (
    item.status === "deferred" ||
    item.requiredSourceType === "accord_component_expansion_deferred" ||
    item.requiredSourceType === "defer_low_priority"
  );
}

function shouldTreatAsStructuredOrSpecial(item) {
  return ["already_structured", "fcf_special_case"].includes(item.requiredSourceType);
}

function isRemainingGap(item) {
  return !["reviewed", "promoted", "not_applicable"].includes(item.status);
}

function compareQueueItems(left, right) {
  const priorityDelta =
    (PRIORITY_RANK[left.priority] ?? 99) - (PRIORITY_RANK[right.priority] ?? 99);
  if (priorityDelta) return priorityDelta;
  const statusDelta =
    STATUS_ORDER.indexOf(left.status) - STATUS_ORDER.indexOf(right.status);
  if (statusDelta) return statusDelta;
  const sourceDelta = left.requiredSourceType.localeCompare(right.requiredSourceType);
  if (sourceDelta) return sourceDelta;
  return left.materialName.localeCompare(right.materialName);
}

function getHigherPriority(left, right) {
  return (PRIORITY_RANK[left] ?? 99) <= (PRIORITY_RANK[right] ?? 99) ? left : right;
}

function mergeGapReportRows(materials = []) {
  const byId = new Map();
  for (const rawRow of materials) {
    const row = addSourceIdentityFields(rawRow, rawRow.materialName);
    const id = makeHeroIfraSourceQueueItemId(row);
    if (!byId.has(id)) {
      byId.set(id, {
        ...row,
        sourceRowNames: uniqueStrings([row.materialName]),
      });
      continue;
    }
    const existing = byId.get(id);
    const sourceRowNames = uniqueStrings([
      ...(existing.sourceRowNames || []),
      row.materialName,
    ]);
    existing.materialName =
      sourceRowNames.length > 1
        ? existing.normalizedName || existing.materialName
        : existing.materialName;
    existing.formulasUsedIn = uniqueStrings([
      ...(existing.formulasUsedIn || []),
      ...(row.formulasUsedIn || []),
    ]);
    existing.candidateSearchTerms = uniqueStrings(
      uniqueStrings([
        ...(existing.candidateSearchTerms || []),
        ...(row.candidateSearchTerms || []),
      ]).map(stripSourceDilutionTerms)
    );
    existing.sourceSearchTerms = uniqueStrings(
      uniqueStrings([
        ...(existing.sourceSearchTerms || []),
        ...(row.sourceSearchTerms || []),
      ]).map(stripSourceDilutionTerms)
    );
    existing.reason = uniqueStrings([existing.reason, row.reason]).join(" ");
    existing.currentIfraCategory = uniqueStrings([
      existing.currentIfraCategory,
      row.currentIfraCategory,
    ]).join(", ");
    existing.priority = getHigherPriority(existing.priority, row.priority);
    existing.sourceRowNames = sourceRowNames;
  }
  return [...byId.values()];
}

export function buildQueueItemsFromGapReport({
  gapReport = {},
  existingQueue = {},
  generatedAt = new Date().toISOString(),
} = {}) {
  const existingLookup = makeExistingLookup(existingQueue);
  return mergeGapReportRows(gapReport.materials || [])
    .map((rawRow) => {
      const row = addSourceIdentityFields(rawRow, rawRow.materialName);
      const id = makeHeroIfraSourceQueueItemId(row);
      const existing = getExistingItem(row, existingLookup);
      const candidateSearchTerms = uniqueStrings(
        [
        ...(row.sourceSearchTerms || []),
        ...(row.candidateSearchTerms || []),
        ].map(stripSourceDilutionTerms)
      );
      const base = {
        id,
        materialName: row.materialName || "",
        normalizedName: row.normalizedName || row.materialName || "",
        formulaMaterialName: row.formulaMaterialName || row.materialName || "",
        sourceIdentityName:
          row.sourceIdentityName || row.normalizedName || row.materialName || "",
        activeMaterialName:
          row.activeMaterialName || row.sourceIdentityName || row.normalizedName || "",
        dilutionLabel: row.dilutionLabel || "",
        carrierLabel: row.carrierLabel || "",
        formulasUsedIn: row.formulasUsedIn || [],
        priority: row.priority || "medium",
        requiredSourceType: row.requiredSourceType || "global_ifra_standard_needed",
        suggestedDocumentName: row.suggestedDocumentName || "",
        suggestedSource: getSuggestedSource(row),
        candidateSearchTerms: uniqueStrings(candidateSearchTerms),
        sourceSearchTerms: uniqueStrings(
          (row.sourceSearchTerms || []).map(stripSourceDilutionTerms)
        ),
        knownReferenceLinks: buildKnownReferenceLinks(row),
        currentIfraCategory: row.currentIfraCategory || "unknown",
        reason: row.reason || "",
        sourceRowNames: row.sourceRowNames || [row.materialName].filter(Boolean),
        status: getDefaultStatus(row.requiredSourceType),
        reviewStatus: getDefaultReviewStatus(row.requiredSourceType),
        sourceFile: "",
        sourceNotes: "",
        reviewNotes: "",
        lastUpdated: generatedAt,
      };

      for (const field of MANUAL_FIELDS) {
        if (existing && existing[field] != null) {
          base[field] = existing[field];
        }
      }
      if (!base.lastUpdated) base.lastUpdated = generatedAt;
      return base;
    })
    .sort(compareQueueItems);
}

export function summarizeHeroIfraSourceQueue(items = []) {
  const statusCounts = countBy(items, "status");
  const reviewStatusCounts = countBy(items, "reviewStatus");
  const priorityCounts = countBy(items, "priority");
  const requiredSourceTypeCounts = countBy(items, "requiredSourceType");
  const highPriorityRemainingCount = items.filter(
    (item) => item.priority === "high" && isRemainingGap(item) && !shouldTreatAsDeferred(item)
  ).length;

  return {
    itemCount: items.length,
    statusCounts,
    reviewStatusCounts,
    priorityCounts,
    requiredSourceTypeCounts,
    highPriorityCount: priorityCounts.high || 0,
    mediumPriorityCount: priorityCounts.medium || 0,
    lowPriorityCount: priorityCounts.low || 0,
    highPriorityRemainingCount,
    neededCount: statusCounts.needed || 0,
    searchingCount: statusCounts.searching || 0,
    acquiredCount: statusCounts.acquired || 0,
    reviewedCount: statusCounts.reviewed || 0,
    promotedCount: statusCounts.promoted || 0,
    deferredCount: statusCounts.deferred || 0,
    supplierDocsNeededCount:
      (requiredSourceTypeCounts.supplier_ifra_or_sds_needed || 0) +
      (requiredSourceTypeCounts.specialty_supplier_document_needed || 0),
    globalStandardsNeededCount:
      requiredSourceTypeCounts.global_ifra_standard_needed || 0,
    naturalUvcbDocsNeededCount:
      requiredSourceTypeCounts.natural_uvcb_supplier_document_needed || 0,
  };
}

export function buildHeroIfraSourceAcquisitionQueue({
  gapReport = {},
  existingQueue = {},
  generatedAt = new Date().toISOString(),
} = {}) {
  const items = buildQueueItemsFromGapReport({ gapReport, existingQueue, generatedAt });
  return {
    metadata: {
      generatedAt,
      reportName: "Hero IFRA Source Acquisition Queue",
      sourceGapReportGeneratedAt: gapReport.metadata?.generatedAt || null,
      sourceGapReportName: gapReport.metadata?.reportName || "Hero IFRA Source Gap Report",
      regenerateCommand: HERO_IFRA_SOURCE_QUEUE_REGENERATE_COMMAND,
      guardrails: [
        "This queue tracks source acquisition and review progress only.",
        "It does not add IFRA limits, parse PDFs, promote structured IFRA data, or prove launch clearance.",
        "Promotion of reviewed source documents into structured IFRA records is a separate reviewed task.",
      ],
    },
    summary: summarizeHeroIfraSourceQueue(items),
    items,
  };
}

export function loadExistingHeroIfraSourceQueue(filePath = DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function formatCountLine(label, value) {
  return `- ${label}: ${Number(value || 0).toLocaleString()}`;
}

function formatLinkList(links = []) {
  if (!links.length) return "None yet";
  return links.map((link) => `${link.label}: ${link.url}`).join("; ");
}

function formatItemForMarkdown(item) {
  return [
    `### ${item.materialName}`,
    "",
    item.sourceIdentityName && item.sourceIdentityName !== item.materialName
      ? `- Source identity: ${item.sourceIdentityName}`
      : null,
    item.dilutionLabel ? `- Dilution: ${item.dilutionLabel}` : null,
    `- Formulas used in: ${item.formulasUsedIn.join(", ") || "Unknown"}`,
    `- Required source type: ${REQUIRED_SOURCE_LABELS[item.requiredSourceType] || item.requiredSourceType}`,
    `- Current status: ${item.status}`,
    `- Review status: ${item.reviewStatus}`,
    `- Suggested source: ${item.suggestedSource}`,
    `- Suggested document: ${item.suggestedDocumentName}`,
    `- Search terms: ${item.candidateSearchTerms.slice(0, 10).join("; ") || "None"}`,
    `- Known reference links: ${formatLinkList(item.knownReferenceLinks)}`,
    `- Why it matters: ${item.reason || "Source review needed."}`,
    item.sourceFile ? `- Source file: ${item.sourceFile}` : null,
    item.sourceNotes ? `- Source notes: ${item.sourceNotes}` : null,
    item.reviewNotes ? `- Review notes: ${item.reviewNotes}` : null,
    "",
  ]
    .filter((line) => line != null)
    .join("\n");
}

function groupQueueItems(items = []) {
  return {
    "High Priority": items.filter(
      (item) =>
        item.priority === "high" &&
        !shouldTreatAsDeferred(item) &&
        !shouldTreatAsStructuredOrSpecial(item)
    ),
    "Medium Priority": items.filter(
      (item) =>
        item.priority === "medium" &&
        !shouldTreatAsDeferred(item) &&
        !shouldTreatAsStructuredOrSpecial(item)
    ),
    "Low Priority": items.filter(
      (item) =>
        item.priority === "low" &&
        !shouldTreatAsDeferred(item) &&
        !shouldTreatAsStructuredOrSpecial(item)
    ),
    Deferred: items.filter((item) => shouldTreatAsDeferred(item)),
    "Already Structured / Special Case": items.filter((item) =>
      shouldTreatAsStructuredOrSpecial(item)
    ),
  };
}

export function formatHeroIfraSourceAcquisitionQueueMarkdown(queue = {}) {
  const items = queue.items || [];
  const summary = queue.summary || summarizeHeroIfraSourceQueue(items);
  const groups = groupQueueItems(items);
  const groupSections = Object.entries(groups).flatMap(([label, groupItems]) => [
    `## ${label}`,
    "",
    groupItems.length
      ? groupItems.map(formatItemForMarkdown).join("\n")
      : "_No items in this group._\n",
  ]);

  return [
    "# Hero IFRA Source Acquisition Queue",
    "",
    `Generated: ${queue.metadata?.generatedAt || ""}`,
    "",
    "This is an acquisition and review tracker. It is not launch clearance, does not add IFRA limits, and does not promote structured IFRA records.",
    "",
    "## Summary",
    "",
    formatCountLine("Queue items", summary.itemCount),
    formatCountLine("Needed", summary.neededCount),
    formatCountLine("Searching", summary.searchingCount),
    formatCountLine("Acquired", summary.acquiredCount),
    formatCountLine("Reviewed", summary.reviewedCount),
    formatCountLine("Promoted", summary.promotedCount),
    formatCountLine("Deferred", summary.deferredCount),
    formatCountLine("Supplier docs needed", summary.supplierDocsNeededCount),
    formatCountLine("Global standards needed", summary.globalStandardsNeededCount),
    formatCountLine("Natural/UVCB docs needed", summary.naturalUvcbDocsNeededCount),
    "",
    "Status counts:",
    ...orderedCountEntries(summary.statusCounts || {}, STATUS_ORDER).map(
      ([key, value]) => `- ${key}: ${value}`
    ),
    "",
    "Review status counts:",
    ...orderedCountEntries(summary.reviewStatusCounts || {}, REVIEW_STATUS_ORDER).map(
      ([key, value]) => `- ${key}: ${value}`
    ),
    "",
    ...groupSections,
  ].join("\n");
}

export function formatHeroIfraSourceAcquisitionQueueText(queue = {}) {
  const items = queue.items || [];
  const summary = queue.summary || summarizeHeroIfraSourceQueue(items);
  const topGaps = items
    .filter((item) => item.priority === "high" && isRemainingGap(item))
    .slice(0, 8);
  return [
    "Hero IFRA Source Acquisition Queue",
    "",
    "This queue tracks source acquisition only. It is not launch clearance and adds no IFRA limits.",
    "",
    `Queue items: ${summary.itemCount}`,
    `High priority: ${summary.highPriorityCount}`,
    `Medium priority: ${summary.mediumPriorityCount}`,
    `Low priority: ${summary.lowPriorityCount}`,
    `Needed: ${summary.neededCount}`,
    `Searching: ${summary.searchingCount}`,
    `Acquired: ${summary.acquiredCount}`,
    `Reviewed: ${summary.reviewedCount}`,
    `Promoted: ${summary.promotedCount}`,
    `Deferred: ${summary.deferredCount}`,
    "",
    "Top high-priority source gaps:",
    ...(topGaps.length
      ? topGaps.map(
          (item) =>
            `- ${item.materialName}: ${item.requiredSourceType}; status=${item.status}; review=${item.reviewStatus}`
        )
      : ["- None."]),
    "",
  ].join("\n");
}

export function writeHeroIfraSourceAcquisitionQueue(filePath, queue) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(queue, null, 2)}\n`);
}
