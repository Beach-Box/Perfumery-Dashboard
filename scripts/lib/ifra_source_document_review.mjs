import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH,
  loadExistingHeroIfraSourceQueue,
  summarizeHeroIfraSourceQueue,
  writeHeroIfraSourceAcquisitionQueue,
} from "./hero_ifra_source_acquisition_queue.mjs";

const DEFAULT_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);

export const DEFAULT_IFRA_SOURCE_DOCUMENT_DIR = path.join(
  DEFAULT_ROOT,
  "downloads",
  "source_documents",
  "ifra"
);

export const DEFAULT_IFRA_SOURCE_DOCUMENT_INVENTORY_PATH = path.join(
  DEFAULT_ROOT,
  "data",
  "ifra_source_acquisition",
  "ifra_source_document_inventory.json"
);

export const DEFAULT_IFRA_SOURCE_DOCUMENT_INVENTORY_MARKDOWN_PATH = path.join(
  DEFAULT_ROOT,
  "docs",
  "ifra",
  "ifra_source_document_inventory.md"
);

export const DEFAULT_IFRA_SOURCE_REVIEW_STATUS_MARKDOWN_PATH = path.join(
  DEFAULT_ROOT,
  "docs",
  "ifra",
  "hero_ifra_source_review_status.md"
);

export const IFRA_SOURCE_DOCUMENT_INVENTORY_COMMAND =
  "node scripts/inventory_ifra_source_documents.mjs --markdown --write docs/ifra/ifra_source_document_inventory.md";

export const VALID_QUEUE_STATUSES = [
  "needed",
  "searching",
  "acquired",
  "reviewed",
  "promoted",
  "deferred",
  "not_applicable",
];

export const VALID_REVIEW_STATUSES = [
  "not_started",
  "needs_review",
  "reviewed_ok",
  "rejected",
  "needs_more_source",
];

const DOCUMENT_EXTENSIONS = new Set([".pdf", ".docx", ".xlsx"]);

const GENERIC_MATCH_TOKENS = new Set([
  "51st",
  "acquisition",
  "amendment",
  "and",
  "certificate",
  "doc",
  "document",
  "documents",
  "global",
  "ifra",
  "needed",
  "product",
  "source",
  "standard",
  "supplier",
  "sds",
  "the",
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

export function normalizeReviewText(value) {
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

export function slugifyReviewText(value) {
  return normalizeReviewText(value).replace(/\s+/g, "-") || "unknown";
}

function toRepoRelative(filePath, root = DEFAULT_ROOT) {
  const relative = path.isAbsolute(filePath) ? path.relative(root, filePath) : filePath;
  return relative.split(path.sep).join("/");
}

function titleCase(value) {
  return normalizeReviewText(value)
    .split(" ")
    .filter(Boolean)
    .map((part) =>
      part.length <= 3 && /\d/.test(part)
        ? part.toUpperCase()
        : `${part.charAt(0).toUpperCase()}${part.slice(1)}`
    )
    .join(" ");
}

function stripDocumentWords(value) {
  return normalizeReviewText(value)
    .split(" ")
    .filter((part) => part && !GENERIC_MATCH_TOKENS.has(part))
    .join(" ");
}

function buildTitleGuess(filename) {
  return titleCase(path.basename(filename, path.extname(filename)));
}

function buildMaterialGuess(filename) {
  return titleCase(stripDocumentWords(path.basename(filename, path.extname(filename))));
}

function guessSourceType(filename) {
  const text = normalizeReviewText(filename);
  if (/\bsds\b/.test(text)) return "supplier_sds";
  if (/\bifra\b/.test(text) && /\b(cert|certificate|supplier)\b/.test(text)) {
    return "supplier_ifra";
  }
  if (/\b(51st|amendment|standard)\b/.test(text) && /\bifra\b/.test(text)) {
    return "global_ifra_standard";
  }
  if (/\bifra\b/.test(text)) return "global_ifra_standard";
  return "unknown";
}

function walkDocumentFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.name.startsWith(".")) return [];
    if (entry.isDirectory()) return walkDocumentFiles(filePath);
    if (!entry.isFile()) return [];
    const extension = path.extname(entry.name).toLowerCase();
    if (!DOCUMENT_EXTENSIONS.has(extension)) return [];
    return [filePath];
  });
}

function getQueueSourceCompatibility(requiredSourceType, sourceTypeGuess) {
  if (!sourceTypeGuess || sourceTypeGuess === "unknown") return 0;
  if (
    requiredSourceType === "global_ifra_standard_needed" &&
    sourceTypeGuess === "global_ifra_standard"
  ) {
    return 1;
  }
  if (
    [
      "supplier_ifra_or_sds_needed",
      "specialty_supplier_document_needed",
      "natural_uvcb_supplier_document_needed",
      "fcf_special_case",
    ].includes(requiredSourceType) &&
    ["supplier_ifra", "supplier_sds"].includes(sourceTypeGuess)
  ) {
    return 1;
  }
  return -1;
}

function isCasTerm(term) {
  return /\bcas\s+\d{2,7}\s+\d{2}\s+\d\b/.test(term) || /\b\d{2,7}\s+\d{2}\s+\d\b/.test(term);
}

function isSafeMatchTerm(term) {
  const normalized = normalizeReviewText(term);
  if (!normalized) return false;
  if (isCasTerm(normalized)) return true;
  const usefulTokens = normalized
    .split(" ")
    .filter((token) => token && !GENERIC_MATCH_TOKENS.has(token));
  if (usefulTokens.length >= 2) return true;
  return usefulTokens.length === 1 && /\d/.test(usefulTokens[0]) && /[a-z]/.test(usefulTokens[0]);
}

function buildQueueItemMatchTerms(item = {}) {
  const values = [
    item.materialName,
    item.normalizedName,
    item.suggestedDocumentName,
    ...(item.sourceRowNames || []),
    ...(item.candidateSearchTerms || []),
  ];
  return uniqueStrings(
    values
      .map((value) => {
        const text = String(value || "").replace(/^IFRA\s+/i, "").replace(/\bSDS\b/gi, "");
        return text.trim();
      })
      .filter(isSafeMatchTerm)
      .map(normalizeReviewText)
  );
}

function scoreQueueItemForDocument(item, documentRecord) {
  const fileText = normalizeReviewText(
    [
      documentRecord.filename,
      documentRecord.titleGuess,
      documentRecord.materialGuess,
    ].join(" ")
  );
  const terms = buildQueueItemMatchTerms(item);
  const matchedTerms = [];
  let score = 0;

  for (const term of terms) {
    if (!term) continue;
    const termTokens = term.split(" ").filter(Boolean);
    const isCas = isCasTerm(term);
    const matched = isCas
      ? fileText.includes(term.replace(/\s+/g, " ")) ||
        fileText.replace(/\s+/g, "").includes(term.replace(/\s+/g, ""))
      : fileText.includes(term);
    if (!matched) continue;
    matchedTerms.push(term);
    const baseScore = isCas ? 4 : Math.min(4, Math.max(2, termTokens.length));
    score = Math.max(score, baseScore);
  }

  if (!score) return null;

  const sourceCompatibility = getQueueSourceCompatibility(
    item.requiredSourceType,
    documentRecord.sourceTypeGuess
  );
  const adjustedScore = sourceCompatibility > 0 ? score + 1 : score;

  return {
    queueItemId: item.id,
    materialName: item.materialName,
    requiredSourceType: item.requiredSourceType,
    score: adjustedScore,
    sourceTypeCompatible: sourceCompatibility >= 0,
    matchedTerms,
  };
}

function classifyDocumentMatch(documentRecord, queueItems = []) {
  const candidates = queueItems
    .map((item) => scoreQueueItemForDocument(item, documentRecord))
    .filter(Boolean)
    .sort(
      (left, right) =>
        right.score - left.score || left.materialName.localeCompare(right.materialName)
    );

  if (!candidates.length) {
    return {
      matchedQueueItemIds: [],
      matchConfidence: "none",
      possibleMatches: [],
    };
  }

  const top = candidates[0];
  const tiedTop = candidates.filter((candidate) => candidate.score === top.score);
  if (tiedTop.length > 1) {
    return {
      matchedQueueItemIds: [],
      matchConfidence: "low",
      possibleMatches: tiedTop.slice(0, 5),
    };
  }

  const confidence = top.score >= 4 ? "high" : "medium";
  return {
    matchedQueueItemIds: [top.queueItemId],
    matchConfidence: confidence,
    possibleMatches: candidates.slice(0, 5),
  };
}

function buildDocumentRecord(filePath, { sourceDir, queueItems, root }) {
  const stats = fs.statSync(filePath);
  const filename = path.basename(filePath);
  const relativePath = toRepoRelative(filePath, root);
  const base = {
    id: `ifra-source-document-${slugifyReviewText(relativePath)}`,
    filename,
    relativePath,
    sizeBytes: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    extension: path.extname(filename).toLowerCase().replace(/^\./, ""),
    titleGuess: buildTitleGuess(filename),
    materialGuess: buildMaterialGuess(filename),
    sourceTypeGuess: guessSourceType(filename),
    matchedQueueItemIds: [],
    matchConfidence: "none",
    possibleMatches: [],
    status: "available_for_review",
  };
  return {
    ...base,
    ...classifyDocumentMatch(base, queueItems),
  };
}

function summarizeDocumentInventory(documents = []) {
  const matchedDocuments = documents.filter(
    (document) => document.matchedQueueItemIds.length > 0
  );
  const possibleMatchDocuments = documents.filter(
    (document) =>
      !document.matchedQueueItemIds.length && document.matchConfidence === "low"
  );
  const unmatchedDocuments = documents.filter(
    (document) => document.matchConfidence === "none"
  );
  return {
    documentCount: documents.length,
    matchedDocumentCount: matchedDocuments.length,
    possibleMatchDocumentCount: possibleMatchDocuments.length,
    unmatchedDocumentCount: unmatchedDocuments.length,
    sourceTypeGuessCounts: documents.reduce((acc, document) => {
      const key = document.sourceTypeGuess || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  };
}

export function buildIfraSourceDocumentInventory({
  sourceDir = DEFAULT_IFRA_SOURCE_DOCUMENT_DIR,
  queue = loadExistingHeroIfraSourceQueue(DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH),
  generatedAt = new Date().toISOString(),
  root = DEFAULT_ROOT,
} = {}) {
  fs.mkdirSync(sourceDir, { recursive: true });
  const queueItems = queue?.items || [];
  const documents = walkDocumentFiles(sourceDir)
    .map((filePath) => buildDocumentRecord(filePath, { sourceDir, queueItems, root }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  return {
    metadata: {
      generatedAt,
      reportName: "IFRA Source Document Inventory",
      sourceDirectory: toRepoRelative(sourceDir, root),
      queueItemCount: queueItems.length,
      guardrails: [
        "This inventory links local documents to acquisition queue items for review only.",
        "It does not parse documents, add IFRA limits, promote records, or prove launch clearance.",
      ],
    },
    summary: summarizeDocumentInventory(documents),
    documents,
  };
}

function formatCountLine(label, value) {
  return `- ${label}: ${Number(value || 0).toLocaleString()}`;
}

function formatDocumentMarkdown(document) {
  const matched = document.matchedQueueItemIds.length
    ? document.matchedQueueItemIds.join(", ")
    : "None";
  const possible = document.possibleMatches?.length
    ? document.possibleMatches
        .map((match) => `${match.materialName} (${match.queueItemId})`)
        .join("; ")
    : "None";
  return [
    `### ${document.filename}`,
    "",
    `- Path: ${document.relativePath}`,
    `- Size: ${document.sizeBytes} bytes`,
    `- Modified: ${document.modifiedAt}`,
    `- Source type guess: ${document.sourceTypeGuess}`,
    `- Material guess: ${document.materialGuess || "Unknown"}`,
    `- Match confidence: ${document.matchConfidence}`,
    `- Matched queue item IDs: ${matched}`,
    `- Possible matches: ${possible}`,
    `- Status: ${document.status}`,
    "",
  ].join("\n");
}

export function formatIfraSourceDocumentInventoryMarkdown(inventory = {}) {
  const documents = inventory.documents || [];
  const summary = inventory.summary || summarizeDocumentInventory(documents);
  const matched = documents.filter((document) => document.matchedQueueItemIds.length);
  const possible = documents.filter(
    (document) => !document.matchedQueueItemIds.length && document.matchConfidence === "low"
  );
  const unmatched = documents.filter((document) => document.matchConfidence === "none");

  return [
    "# IFRA Source Document Inventory",
    "",
    `Generated: ${inventory.metadata?.generatedAt || ""}`,
    "",
    "This is a local document inventory for review support only. It does not parse PDFs, add IFRA limits, promote records, or prove launch clearance.",
    "",
    "## Summary",
    "",
    formatCountLine("Documents found", summary.documentCount),
    formatCountLine("Matched documents", summary.matchedDocumentCount),
    formatCountLine("Possible/ambiguous matches", summary.possibleMatchDocumentCount),
    formatCountLine("Unmatched documents", summary.unmatchedDocumentCount),
    "",
    "## Matched Documents",
    "",
    matched.length ? matched.map(formatDocumentMarkdown).join("\n") : "_No matched documents._\n",
    "## Possible / Ambiguous Matches",
    "",
    possible.length
      ? possible.map(formatDocumentMarkdown).join("\n")
      : "_No ambiguous documents._\n",
    "## Unmatched Documents",
    "",
    unmatched.length
      ? unmatched.map(formatDocumentMarkdown).join("\n")
      : "_No unmatched documents._\n",
  ].join("\n");
}

export function formatIfraSourceDocumentInventoryText(inventory = {}) {
  const summary = inventory.summary || {};
  return [
    "IFRA Source Document Inventory",
    "",
    "This inventory is review support only. It does not parse PDFs or add IFRA limits.",
    "",
    `Documents found: ${summary.documentCount || 0}`,
    `Matched documents: ${summary.matchedDocumentCount || 0}`,
    `Possible/ambiguous matches: ${summary.possibleMatchDocumentCount || 0}`,
    `Unmatched documents: ${summary.unmatchedDocumentCount || 0}`,
    "",
  ].join("\n");
}

export function writeIfraSourceDocumentInventory(filePath, inventory) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(inventory, null, 2)}\n`);
}

function normalizeQueueLookupId(value) {
  return slugifyReviewText(value);
}

function getQueueItemLookupValues(item = {}) {
  const sourceTypeSlug = slugifyReviewText(item.requiredSourceType || "");
  return uniqueStrings([
    item.id,
    String(item.id || "").replace(/^hero-ifra-source-/, ""),
    `${slugifyReviewText(item.materialName)}-${sourceTypeSlug}`,
    `${slugifyReviewText(item.normalizedName)}-${sourceTypeSlug}`,
  ]).map(normalizeQueueLookupId);
}

export function findQueueItemForReviewUpdate(items = [], requestedId) {
  const normalizedRequested = normalizeQueueLookupId(requestedId);
  const matches = items.filter((item) =>
    getQueueItemLookupValues(item).includes(normalizedRequested)
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(
      `Queue item ID is ambiguous: ${requestedId}. Use the full queue item id.`
    );
  }
  throw new Error(`Queue item not found: ${requestedId}`);
}

function validateQueueStatusUpdates(updates = {}) {
  if (updates.status && !VALID_QUEUE_STATUSES.includes(updates.status)) {
    throw new Error(`Invalid status: ${updates.status}`);
  }
  if (
    updates.reviewStatus &&
    !VALID_REVIEW_STATUSES.includes(updates.reviewStatus)
  ) {
    throw new Error(`Invalid reviewStatus: ${updates.reviewStatus}`);
  }
}

export function updateHeroIfraSourceQueueStatus({
  queue,
  id,
  updates = {},
  now = new Date().toISOString(),
  root = DEFAULT_ROOT,
} = {}) {
  if (!queue || !Array.isArray(queue.items)) {
    throw new Error("A valid queue with items is required.");
  }
  if (!id) throw new Error("--id is required for status updates.");
  validateQueueStatusUpdates(updates);

  const allowedUpdates = {};
  for (const field of [
    "status",
    "reviewStatus",
    "sourceFile",
    "sourceNotes",
    "reviewNotes",
  ]) {
    if (updates[field] != null) allowedUpdates[field] = updates[field];
  }
  if (!Object.keys(allowedUpdates).length) {
    throw new Error("No supported status/review fields were provided.");
  }
  if (allowedUpdates.sourceFile) {
    allowedUpdates.sourceFile = toRepoRelative(allowedUpdates.sourceFile, root);
  }

  const target = findQueueItemForReviewUpdate(queue.items, id);
  const updatedItems = queue.items.map((item) =>
    item.id === target.id
      ? {
          ...item,
          ...allowedUpdates,
          lastUpdated: now,
        }
      : item
  );
  const updatedItem = updatedItems.find((item) => item.id === target.id);
  const updatedQueue = {
    ...queue,
    metadata: {
      ...(queue.metadata || {}),
      generatedAt: queue.metadata?.generatedAt || now,
      lastReviewStatusUpdateAt: now,
    },
    summary: summarizeHeroIfraSourceQueue(updatedItems),
    items: updatedItems,
  };

  return {
    queue: updatedQueue,
    item: updatedItem,
    changedFields: Object.keys(allowedUpdates),
  };
}

function classifyReviewGroup(item = {}) {
  if (item.status === "promoted") return "Promoted";
  if (item.status === "deferred") return "Deferred";
  if (item.reviewStatus === "rejected") return "Rejected";
  if (item.reviewStatus === "needs_more_source") return "Needs More Source";
  if (item.reviewStatus === "reviewed_ok" || item.status === "reviewed") {
    return "Reviewed OK";
  }
  if (item.status === "acquired" || item.reviewStatus === "needs_review") {
    return "Acquired / Needs Review";
  }
  if (item.status === "searching") return "Searching";
  return "Needed";
}

function formatReviewItemMarkdown(item, inventory = {}) {
  const linkedDocs = (inventory.documents || []).filter((document) =>
    document.matchedQueueItemIds.includes(item.id)
  );
  const linkedDocText = linkedDocs.length
    ? linkedDocs.map((document) => document.relativePath).join("; ")
    : item.sourceFile || "None";
  return [
    `### ${item.materialName}`,
    "",
    `- Required source type: ${item.requiredSourceType}`,
    `- Status: ${item.status}`,
    `- Review status: ${item.reviewStatus}`,
    `- Source file: ${linkedDocText}`,
    `- Source notes: ${item.sourceNotes || "None"}`,
    `- Review notes: ${item.reviewNotes || "None"}`,
    `- Formulas used in: ${(item.formulasUsedIn || []).join(", ") || "Unknown"}`,
    "",
  ].join("\n");
}

export function formatHeroIfraSourceReviewStatusMarkdown({
  queue = {},
  inventory = null,
} = {}) {
  const items = queue.items || [];
  const groups = [
    "Needed",
    "Searching",
    "Acquired / Needs Review",
    "Reviewed OK",
    "Rejected",
    "Needs More Source",
    "Deferred",
    "Promoted",
  ];
  const groupedItems = groups.reduce((acc, group) => {
    acc[group] = [];
    return acc;
  }, {});
  for (const item of items) {
    groupedItems[classifyReviewGroup(item)].push(item);
  }

  return [
    "# Hero IFRA Source Review Status",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This review report tracks acquired source-document review state only. Reviewed OK is not promotion, does not add IFRA limits, and is not launch clearance.",
    "",
    "## Summary",
    "",
    formatCountLine("Queue items", items.length),
    formatCountLine("Documents found", inventory?.summary?.documentCount || 0),
    formatCountLine("Matched documents", inventory?.summary?.matchedDocumentCount || 0),
    ...VALID_QUEUE_STATUSES.map((status) =>
      formatCountLine(status, queue.summary?.statusCounts?.[status] || 0)
    ),
    "",
    ...groups.flatMap((group) => [
      `## ${group}`,
      "",
      groupedItems[group].length
        ? groupedItems[group]
            .map((item) => formatReviewItemMarkdown(item, inventory))
            .join("\n")
        : "_No items in this group._\n",
    ]),
  ].join("\n");
}

export function writeHeroIfraSourceReviewStatusMarkdown(filePath, queue, inventory) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `${formatHeroIfraSourceReviewStatusMarkdown({ queue, inventory })}\n`
  );
}

export function saveUpdatedHeroIfraSourceQueue(filePath, queue) {
  writeHeroIfraSourceAcquisitionQueue(filePath, queue);
}
