import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH,
} from "./ifra_source_harvest.mjs";
import {
  DEFAULT_IFRA_EVIDENCE_RESOLUTION_PATH,
  buildIfraEvidenceResolutionFromFiles,
} from "./ifra_evidence_resolver.mjs";
import {
  DEFAULT_REVIEWED_IFRA_SOURCE_RECORDS_PATH,
  loadReviewedIfraSourceRecords,
} from "./reviewed_ifra_source_records.mjs";

const DEFAULT_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);

export const DEFAULT_PROPOSED_IFRA_STRUCTURED_RECORDS_PATH = path.join(
  DEFAULT_ROOT,
  "data",
  "ifra_source_acquisition",
  "proposed_ifra_structured_records.json"
);

export const DEFAULT_IFRA_AUTOPILOT_RECOMMENDATIONS_PATH = path.join(
  DEFAULT_ROOT,
  "data",
  "ifra_source_acquisition",
  "ifra_autopilot_recommendations.json"
);

export const DEFAULT_IFRA_AUTOPILOT_RECOMMENDATIONS_MARKDOWN_PATH = path.join(
  DEFAULT_ROOT,
  "docs",
  "ifra",
  "ifra_autopilot_recommendations.md"
);

export const DEFAULT_IFRA_EVIDENCE_AUTOPILOT_REPORT_PATH = path.join(
  DEFAULT_ROOT,
  "data",
  "ifra_source_acquisition",
  "ifra_evidence_autopilot_report.json"
);

export const IFRA_AUTOPILOT_RECOMMENDATIONS_COMMAND =
  "node scripts/generate_ifra_autopilot_recommendations.mjs --markdown --write docs/ifra/ifra_autopilot_recommendations.md";

const STRONG_CATEGORY_SOURCE_TYPES = new Set([
  "official_ifra_standard_library",
  "official_ifra_standard_pdf",
  "supplier_product_page",
  "supplier_ifra",
  "supplier_sds",
]);

const NON_LIMIT_AUTO_ACCEPT_TYPES = new Set([
  "phototoxic_note",
  "identity",
]);

const IFRA_LIMIT_LANGUAGE_RE =
  /\b(?:IFRA|Cat(?:egory)?\.?\s*4|fine fragrance|max(?:imum)?\s*(?:use|concentration|level)|permitted amounts?|finished product|no restriction)\b/i;
const GHS_CATEGORY_4_RE =
  /\b(?:GHS|hazard|acute|toxicity|inhalation|oral|dermal|H\d{3}|category\s*4\s*(?:hazard|toxicity))\b/i;
const RIFM_USAGE_RE =
  /\b(?:RIFM|average\s+use|usual\s+use|reported\s+use|use\s+survey)\b/i;
const NAVIGATION_NOISE_RE =
  /\b(?:Twitter|Instagram|Linkedin|Pinterest|Customer Reviews|Write a review|Add to cart|Shipping Policy|Privacy Policy|Newsletter|Search|Supplier Sponsors|View full details|All News)\b/i;
const FCF_RE = /\b(?:FCF|furocoumarin[\s-]*free|bergapten[\s-]*free|phototoxic)\b/i;

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

function loadJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getBestCandidate(item = {}) {
  return item.bestCandidates?.[0] || null;
}

function truncateText(value, maxLength = 360) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function normalizeCandidateValue(value) {
  const text = String(value || "").trim();
  if (!text || /^no\s+restriction$/i.test(text)) return null;
  const numeric = Number(text.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function candidateIsLinked(candidate = {}, item = {}) {
  return (
    candidate.signals?.linked === true ||
    (candidate.queueItemIds || []).includes(item.queueItemId)
  );
}

function candidateIdentityMatches(candidate = {}, item = {}) {
  if (candidate.signals?.exactName === true) return true;
  const itemNames = [
    item.materialName,
    item.sourceIdentityName,
    item.activeMaterialName,
    item.normalizedName,
  ].map(normalizeText);
  const candidateNames = [
    candidate.materialName,
    candidate.sourceIdentityName,
  ].map(normalizeText);
  return candidateNames.some((name) => name && itemNames.includes(name));
}

function candidateHasNoise(candidate = {}) {
  const text = [
    candidate.snippet,
    ...(candidate.warnings || []),
  ].join(" ");
  return (
    candidate.signals?.hasGhsCategory4 ||
    candidate.signals?.hasRifmUsage ||
    GHS_CATEGORY_4_RE.test(text) ||
    RIFM_USAGE_RE.test(text) ||
    NAVIGATION_NOISE_RE.test(text)
  );
}

export function isStrongCategoryLimitCandidate({ item = {}, candidate = {} } = {}) {
  if (!candidate || candidate.candidateLimitType !== "ifra_category_limit") return false;
  if (!candidateIsLinked(candidate, item)) return false;
  if (!candidateIdentityMatches(candidate, item)) return false;
  if (!STRONG_CATEGORY_SOURCE_TYPES.has(candidate.sourceType)) return false;
  if (candidate.sourceType === "identity_reference") return false;
  if (candidateHasNoise(candidate)) return false;
  if (!IFRA_LIMIT_LANGUAGE_RE.test(candidate.snippet || "")) return false;
  return Boolean(
    candidate.candidateValue ||
      /\bno\s+restriction\b/i.test(candidate.snippet || "") ||
      /\d+(?:\.\d+)?\s*(?:%|percent|ppm|mg\/kg)/i.test(candidate.snippet || "")
  );
}

export function isAutoAcceptableNonLimitEvidence({ item = {}, candidate = {} } = {}) {
  if (!candidate || !NON_LIMIT_AUTO_ACCEPT_TYPES.has(candidate.candidateLimitType)) {
    return false;
  }
  if (candidate.candidateLimitType === "ifra_category_limit") return false;
  if (!candidateIsLinked(candidate, item)) return false;
  if (!candidateIdentityMatches(candidate, item)) return false;
  if (candidateHasNoise(candidate)) return false;
  if (candidate.candidateLimitType === "phototoxic_note") {
    return (
      item.evidenceStatus === "likely_fcf_evidence" &&
      FCF_RE.test(candidate.snippet || "") &&
      ["high", "medium"].includes(candidate.reviewPriority || item.confidence)
    );
  }
  return (
    candidate.candidateLimitType === "identity" &&
    ["supplier_sds", "supplier_product_page", "supplier_ifra"].includes(
      candidate.sourceType || ""
    ) &&
    ["high", "medium"].includes(candidate.reviewPriority || item.confidence)
  );
}

function getSourceRequest(item = {}) {
  const identity = item.sourceIdentityName || item.materialName || "this material";
  if (item.requiredSourceType === "global_ifra_standard_needed") {
    return `Need source-backed global IFRA standard or Cat 4 record for source identity: ${identity}.`;
  }
  if (
    [
      "supplier_ifra_or_sds_needed",
      "specialty_supplier_document_needed",
      "natural_uvcb_supplier_document_needed",
    ].includes(item.requiredSourceType)
  ) {
    return `Need supplier IFRA certificate, SDS, or product-page IFRA limit for source identity: ${identity}.`;
  }
  if (item.requiredSourceType === "fcf_special_case") {
    return `Need supplier FCF/furocoumarin-free source evidence for source identity: ${identity}.`;
  }
  return `Need stronger source documentation for source identity: ${identity}.`;
}

function makeProposedRecordId({ materialName, recordType, candidateId }) {
  return [
    "proposed-ifra",
    slugify(materialName),
    slugify(recordType),
    slugify(candidateId).slice(0, 84),
  ].join("-");
}

function buildBaseRecord({ item = {}, candidate = {}, recordType, recommendation, status }) {
  return {
    id: makeProposedRecordId({
      materialName: item.materialName,
      recordType,
      candidateId: candidate.id || item.queueItemId,
    }),
    materialName: item.materialName || "",
    sourceIdentityName: item.sourceIdentityName || item.materialName || "",
    formulaMaterialNames: uniqueStrings([
      item.formulaMaterialName,
      item.materialName,
      ...(candidate.materialNames || []),
    ]),
    recordType,
    sourceType: candidate.sourceType || "",
    sourceUrl: candidate.sourceUrl || "",
    sourceFile: candidate.sourceFile || "",
    candidateIds: [candidate.id].filter(Boolean),
    category: candidate.category || "",
    candidateValue: candidate.candidateValue || "",
    candidateUnit: candidate.candidateUnit || "",
    normalizedCandidateValue: normalizeCandidateValue(candidate.candidateValue),
    sourceSnippet: truncateText(candidate.snippet || ""),
    evidenceConfidence: item.confidence || candidate.confidence || "low",
    autopilotRecommendation: recommendation,
    promotionStatus: status,
    limitations: [
      "Not runtime-active",
      "Requires review before promotion",
      "Not launch clearance",
    ],
    notes: [],
  };
}

function buildCategoryLimitRecord(item) {
  const candidate = getBestCandidate(item);
  const record = buildBaseRecord({
    item,
    candidate,
    recordType: "ifra_category_limit",
    recommendation: "propose_for_review",
    status: "proposed",
  });
  return {
    ...record,
    notes: [
      "Autopilot found linked supplier/product evidence with IFRA Cat 4 or fine-fragrance language.",
      "Final review must confirm source identity, category context, amendment/source date, and supplier wording.",
    ],
  };
}

function buildAutoAcceptedRecord(item) {
  const candidate = getBestCandidate(item);
  const recordType =
    candidate?.candidateLimitType === "phototoxic_note"
      ? "phototoxic_note"
      : "identity_support";
  const record = buildBaseRecord({
    item,
    candidate,
    recordType,
    recommendation: "auto_accept_non_limit",
    status: "reviewed_ok",
  });
  return {
    ...record,
    category: "",
    candidateValue: "",
    candidateUnit: "",
    normalizedCandidateValue: null,
    limitations: [
      "Not runtime-active",
      "Non-limit source evidence only",
      "Not launch clearance",
    ],
    notes: [
      "Autopilot accepted this as source evidence only because it does not create or modify IFRA category limits.",
    ],
  };
}

function buildReviewedSourceRecordRecommendation(record = {}) {
  const candidateId = record.candidateIds?.[0] || record.id;
  return {
    id: makeProposedRecordId({
      materialName: record.materialName,
      recordType: "phototoxic_note",
      candidateId,
    }),
    materialName: record.materialName || "",
    sourceIdentityName: record.sourceIdentityName || record.materialName || "",
    formulaMaterialNames: uniqueStrings([
      record.formulaMaterialName,
      record.materialName,
    ]),
    recordType: "phototoxic_note",
    sourceType: record.sourceType || "",
    sourceUrl: record.sourceUrl || "",
    sourceFile: record.sourceFile || "",
    candidateIds: record.candidateIds || [],
    category: "",
    candidateValue: "",
    candidateUnit: "",
    normalizedCandidateValue: null,
    sourceSnippet: truncateText(record.sourceSnippet || record.summary || ""),
    evidenceConfidence: "high",
    autopilotRecommendation: "auto_accept_non_limit",
    promotionStatus: "reviewed_ok",
    limitations: record.limitations || [
      "Not runtime-active",
      "Non-limit source evidence only",
      "Not launch clearance",
    ],
    notes: [
      "Existing reviewed FCF source-evidence record detected.",
      "Regular expressed citrus phototoxic limits are not applied as if furocoumarins are present.",
    ],
  };
}

function classifyRecommendationItem(item = {}, proposedRecord = null, autoAcceptedRecord = null) {
  if (proposedRecord) return "proposed_structured_record_ready_for_final_review";
  if (autoAcceptedRecord) return "auto_accepted_non_limit_evidence";
  if (item.evidenceStatus === "already_reviewed" || item.evidenceStatus === "not_applicable") {
    return "already_handled";
  }
  if (item.evidenceStatus === "deferred") return "deferred";
  if (["needs_supplier_doc", "identity_only"].includes(item.evidenceStatus)) {
    return "needs_better_source";
  }
  if (item.evidenceStatus === "insufficient_evidence") return "no_useful_evidence_found";
  return "needs_better_source";
}

function getRecommendationNextAction(item = {}, status) {
  if (status === "proposed_structured_record_ready_for_final_review") {
    return "Review proposed structured record; promotion remains a separate one-at-a-time task.";
  }
  if (status === "auto_accepted_non_limit_evidence") {
    return "Keep as non-limit source evidence; do not convert into a category limit.";
  }
  if (status === "already_handled") return "No immediate acquisition action needed.";
  if (status === "deferred") return "Leave deferred until a dedicated task.";
  return getSourceRequest(item);
}

function buildRecommendationItem({ item, proposedRecord, autoAcceptedRecord }) {
  const bestCandidate = getBestCandidate(item);
  const recommendationStatus = classifyRecommendationItem(
    item,
    proposedRecord,
    autoAcceptedRecord
  );
  return {
    queueItemId: item.queueItemId,
    materialName: item.materialName || "",
    sourceIdentityName: item.sourceIdentityName || item.materialName || "",
    formulasUsedIn: item.formulasUsedIn || [],
    evidenceStatus: item.evidenceStatus || "",
    recommendationStatus,
    suggestedAction: getRecommendationNextAction(item, recommendationStatus),
    confidence: item.confidence || "low",
    proposedRecordId: proposedRecord?.id || autoAcceptedRecord?.id || "",
    bestCandidateId: bestCandidate?.id || "",
    bestCandidateType: bestCandidate?.candidateLimitType || "",
    sourceType: bestCandidate?.sourceType || "",
    sourceUrl: bestCandidate?.sourceUrl || "",
    sourceFile: bestCandidate?.sourceFile || "",
    snippet: truncateText(bestCandidate?.snippet || ""),
    whySelected: item.whySelected || "",
    limitations: item.limitations || [],
  };
}

function buildRejectedNoiseFromCandidates(candidateExtractions = {}) {
  const retainedNoise = (candidateExtractions.candidates || [])
    .filter((candidate) => {
      if (candidate.candidateLimitType === "ifra_category_limit") return false;
      if (candidate.candidateLimitType === "phototoxic_note") return false;
      if (GHS_CATEGORY_4_RE.test(candidate.snippet || "")) return true;
      if (RIFM_USAGE_RE.test(candidate.snippet || "")) return true;
      if (NAVIGATION_NOISE_RE.test(candidate.snippet || "")) return true;
      return (
        candidate.sourceType === "identity_reference" &&
        candidate.candidateLimitType === "unknown"
      );
    })
    .map((candidate) => ({
      id: candidate.id,
      materialName: candidate.materialName || "",
      sourceType: candidate.sourceType || "",
      sourceFile: candidate.sourceFile || "",
      sourceUrl: candidate.sourceUrl || "",
      reason: "retained_candidate_noise",
      snippet: truncateText(candidate.snippet || "", 220),
    }));
  const suppressedNoise = (candidateExtractions.suppressedSnippets || []).map(
    (snippet, index) => ({
      id: `suppressed-noise-${index + 1}`,
      materialName: snippet.materialName || "",
      sourceType: snippet.sourceType || "",
      sourceFile: snippet.sourceFile || "",
      sourceUrl: "",
      reason: snippet.reason || "suppressed_noise",
      snippet: truncateText(snippet.snippet || "", 220),
    })
  );
  return [...retainedNoise, ...suppressedNoise];
}

function summarizeRecommendations({ items, proposedRecords, autoAcceptedRecords, rejectedNoise }) {
  const statusCounts = countBy(items, "recommendationStatus");
  return {
    queueItemCount: items.length,
    proposedStructuredRecordCount: proposedRecords.filter(
      (record) => record.autopilotRecommendation === "propose_for_review"
    ).length,
    autoAcceptedNonLimitEvidenceCount: autoAcceptedRecords.length,
    needsBetterSourceCount: statusCounts.needs_better_source || 0,
    noUsefulEvidenceCount: statusCounts.no_useful_evidence_found || 0,
    alreadyHandledCount: statusCounts.already_handled || 0,
    deferredCount: statusCounts.deferred || 0,
    rejectedNoiseCount: rejectedNoise.length,
    recommendationStatusCounts: statusCounts,
    proposedRecordTypeCounts: countBy(proposedRecords, "recordType"),
    nextRecommendedAction:
      proposedRecords.length > 0
        ? `${proposedRecords.filter((record) => record.autopilotRecommendation === "propose_for_review").length} proposed records can be reviewed for promotion. No runtime IFRA limits have been changed.`
        : "Autopilot did not find source-backed category-limit records strong enough to propose. Acquire better supplier/IFRA documents for unresolved materials.",
  };
}

export function buildProposedIfraStructuredRecordsFile({
  records = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  return {
    metadata: {
      generatedAt,
      reportName: "Proposed IFRA Structured Records",
      guardrails: [
        "Proposed records are not runtime-active.",
        "They require final review before promotion.",
        "They do not prove compliance or launch clearance.",
      ],
    },
    summary: {
      recordCount: records.length,
      proposedForReviewCount: records.filter(
        (record) => record.autopilotRecommendation === "propose_for_review"
      ).length,
      autoAcceptedNonLimitCount: records.filter(
        (record) => record.autopilotRecommendation === "auto_accept_non_limit"
      ).length,
      recordTypeCounts: countBy(records, "recordType"),
      promotionStatusCounts: countBy(records, "promotionStatus"),
    },
    records,
  };
}

export function buildIfraAutopilotRecommendations({
  evidenceResolution = {},
  candidateExtractions = {},
  reviewedSourceRecords = {},
  autopilotReport = {},
  generatedAt = new Date().toISOString(),
} = {}) {
  const proposedForReview = [];
  const autoAccepted = [];
  const items = [];

  for (const item of evidenceResolution.items || []) {
    const bestCandidate = getBestCandidate(item);
    const proposedRecord = isStrongCategoryLimitCandidate({ item, candidate: bestCandidate })
      ? buildCategoryLimitRecord(item)
      : null;
    const autoAcceptedRecord = !proposedRecord &&
      isAutoAcceptableNonLimitEvidence({ item, candidate: bestCandidate })
        ? buildAutoAcceptedRecord(item)
        : null;
    if (proposedRecord) proposedForReview.push(proposedRecord);
    if (autoAcceptedRecord) autoAccepted.push(autoAcceptedRecord);
    items.push(buildRecommendationItem({ item, proposedRecord, autoAcceptedRecord }));
  }

  const reviewedAutoAccepted = (reviewedSourceRecords.records || [])
    .map(buildReviewedSourceRecordRecommendation)
    .filter(
      (record) =>
        !autoAccepted.some((existing) => existing.id === record.id) &&
        !proposedForReview.some((existing) => existing.id === record.id)
    );
  autoAccepted.push(...reviewedAutoAccepted);

  const proposedRecords = [...proposedForReview, ...autoAccepted].sort((left, right) =>
    left.materialName.localeCompare(right.materialName)
  );
  const rejectedNoise = buildRejectedNoiseFromCandidates(candidateExtractions);
  const summary = summarizeRecommendations({
    items,
    proposedRecords,
    autoAcceptedRecords: autoAccepted,
    rejectedNoise,
  });

  return {
    metadata: {
      generatedAt,
      reportName: "IFRA Autopilot Recommendations",
      regenerateCommand: IFRA_AUTOPILOT_RECOMMENDATIONS_COMMAND,
      autopilotGeneratedAt: autopilotReport.metadata?.generatedAt || null,
      evidenceResolutionGeneratedAt: evidenceResolution.metadata?.generatedAt || null,
      guardrails: [
        "Recommendations are review workflow output only.",
        "Proposed structured records are not runtime IFRA standards.",
        "No category limits are promoted automatically.",
        "No launch clearance is claimed.",
      ],
    },
    summary,
    items,
    proposedStructuredRecords: proposedForReview,
    autoAcceptedNonLimitEvidence: autoAccepted,
    needsBetterSource: items.filter((item) =>
      ["needs_better_source", "no_useful_evidence_found"].includes(
        item.recommendationStatus
      )
    ),
    rejectedNoisyEvidence: rejectedNoise.slice(0, 60),
    alreadyHandled: items.filter((item) => item.recommendationStatus === "already_handled"),
    deferred: items.filter((item) => item.recommendationStatus === "deferred"),
  };
}

export function buildIfraAutopilotRecommendationsFromFiles({
  evidenceResolutionPath = DEFAULT_IFRA_EVIDENCE_RESOLUTION_PATH,
  candidateExtractionsPath = DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH,
  reviewedSourceRecordsPath = DEFAULT_REVIEWED_IFRA_SOURCE_RECORDS_PATH,
  autopilotReportPath = DEFAULT_IFRA_EVIDENCE_AUTOPILOT_REPORT_PATH,
  generatedAt = new Date().toISOString(),
} = {}) {
  return buildIfraAutopilotRecommendations({
    evidenceResolution:
      loadJsonIfPresent(evidenceResolutionPath) ||
      buildIfraEvidenceResolutionFromFiles({ generatedAt }),
    candidateExtractions: loadJsonIfPresent(candidateExtractionsPath) || {},
    reviewedSourceRecords: loadReviewedIfraSourceRecords(reviewedSourceRecordsPath),
    autopilotReport: loadJsonIfPresent(autopilotReportPath) || {},
    generatedAt,
  });
}

function formatCountLine(label, value) {
  return `- ${label}: ${Number(value || 0).toLocaleString()}`;
}

function escapeMarkdown(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function formatRecordMarkdown(record = {}) {
  const reviewCommand = `node scripts/review_proposed_ifra_record.mjs --id "${record.id}" --status reviewed_ok`;
  return [
    `### ${record.materialName}`,
    "",
    `- Source identity: ${record.sourceIdentityName || record.materialName}`,
    `- Proposed record: ${record.recordType}`,
    `- Proposed category/value: ${record.category || "n/a"} ${`${record.candidateValue || ""} ${record.candidateUnit || ""}`.trim() || "n/a"}`,
    `- Source: ${record.sourceUrl || record.sourceFile || "Unknown"}`,
    `- Evidence confidence: ${record.evidenceConfidence}`,
    `- Promotion status: ${record.promotionStatus}`,
    `- Why autopilot trusts it: ${(record.notes || []).join(" ") || "Source-backed candidate matched the queue item."}`,
    `- Limitations: ${(record.limitations || []).join("; ")}`,
    `- Source snippet: ${record.sourceSnippet || "No snippet."}`,
    "",
    "Final review command suggestion (future workflow; do not run until that script exists):",
    "",
    "```bash",
    reviewCommand,
    "```",
    "",
  ].join("\n");
}

function formatNeedSourceMarkdown(item = {}) {
  return [
    `### ${item.materialName}`,
    "",
    `- Source identity: ${item.sourceIdentityName || item.materialName}`,
    `- Status: ${item.recommendationStatus}`,
    `- Next action: ${item.suggestedAction}`,
    `- Current evidence: ${item.evidenceStatus || "none"}`,
    item.snippet ? `- Best current snippet: ${item.snippet}` : "- Best current snippet: None",
    "",
  ].join("\n");
}

export function formatIfraAutopilotRecommendationsMarkdown(report = {}) {
  const summary = report.summary || {};
  return [
    "# IFRA Autopilot Recommendations",
    "",
    `Generated: ${report.metadata?.generatedAt || ""}`,
    "",
    "Autopilot did the first-pass evidence review. Proposed structured records are staged for final review only; no runtime IFRA limits have been changed and this is not launch clearance.",
    "",
    "## Autopilot Summary",
    "",
    formatCountLine("Queue items", summary.queueItemCount),
    formatCountLine("Proposed structured records ready for final review", summary.proposedStructuredRecordCount),
    formatCountLine("Auto-accepted non-limit evidence", summary.autoAcceptedNonLimitEvidenceCount),
    formatCountLine("Needs better source", summary.needsBetterSourceCount),
    formatCountLine("No useful evidence found", summary.noUsefulEvidenceCount),
    formatCountLine("Rejected/noisy evidence", summary.rejectedNoiseCount),
    formatCountLine("Already handled", summary.alreadyHandledCount),
    formatCountLine("Deferred", summary.deferredCount),
    "",
    `Recommended next action: ${summary.nextRecommendedAction || "Review proposed records before any promotion."}`,
    "",
    "## Proposed Structured Records Ready For Final Review",
    "",
    report.proposedStructuredRecords?.length
      ? report.proposedStructuredRecords.map(formatRecordMarkdown).join("\n")
      : "_No proposed structured IFRA records were strong enough to stage._\n",
    "## Auto-Accepted Non-Limit Evidence",
    "",
    report.autoAcceptedNonLimitEvidence?.length
      ? report.autoAcceptedNonLimitEvidence.map(formatRecordMarkdown).join("\n")
      : "_No non-limit evidence was auto-accepted._\n",
    "## Needs Better Source",
    "",
    report.needsBetterSource?.length
      ? report.needsBetterSource.map(formatNeedSourceMarkdown).join("\n")
      : "_No unresolved source requests in this group._\n",
    "## Rejected / Noisy Evidence",
    "",
    report.rejectedNoisyEvidence?.length
      ? [
          "| Material | Reason | Source | Snippet |",
          "| --- | --- | --- | --- |",
          ...report.rejectedNoisyEvidence.slice(0, 25).map((item) =>
            `| ${[
              item.materialName,
              item.reason,
              item.sourceUrl || item.sourceFile,
              item.snippet,
            ]
              .map(escapeMarkdown)
              .join(" | ")} |`
          ),
        ].join("\n")
      : "_No rejected/noisy evidence examples._\n",
    "",
    "## Already Handled",
    "",
    report.alreadyHandled?.length
      ? report.alreadyHandled.map(formatNeedSourceMarkdown).join("\n")
      : "_No already-handled items._\n",
    "## Deferred",
    "",
    report.deferred?.length
      ? report.deferred.map(formatNeedSourceMarkdown).join("\n")
      : "_No deferred items._\n",
  ].join("\n");
}

export function formatIfraAutopilotRecommendationsText(report = {}) {
  const summary = report.summary || {};
  return [
    "IFRA Autopilot Recommendations",
    "",
    "Recommendation layer only. No runtime IFRA limits are changed.",
    "",
    `Queue items: ${summary.queueItemCount || 0}`,
    `Proposed records: ${summary.proposedStructuredRecordCount || 0}`,
    `Auto-accepted non-limit evidence: ${summary.autoAcceptedNonLimitEvidenceCount || 0}`,
    `Needs better source: ${summary.needsBetterSourceCount || 0}`,
    `No useful evidence: ${summary.noUsefulEvidenceCount || 0}`,
    `Rejected/noisy evidence: ${summary.rejectedNoiseCount || 0}`,
    "",
    `Next: ${summary.nextRecommendedAction || "Review proposed records."}`,
    "",
  ].join("\n");
}

export function writeIfraAutopilotRecommendations(filePath, report) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
}

export function writeProposedIfraStructuredRecords(filePath, recordsFile) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(recordsFile, null, 2)}\n`);
}
