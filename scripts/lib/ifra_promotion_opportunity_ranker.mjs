import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_PROPOSED_IFRA_STRUCTURED_RECORDS_PATH,
  DEFAULT_IFRA_AUTOPILOT_RECOMMENDATIONS_PATH,
} from "./ifra_autopilot_recommendations.mjs";
import { DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH } from "./hero_ifra_source_acquisition_queue.mjs";
import { DEFAULT_OFFICIAL_IFRA_SOURCE_CANDIDATES_PATH } from "./official_ifra_harvest.mjs";
import { DEFAULT_REVIEWED_IFRA_STRUCTURED_OVERRIDES_PATH } from "./reviewed_ifra_structured_promotion.mjs";
import { DEFAULT_REVIEWED_IFRA_SOURCE_RECORDS_PATH } from "./reviewed_ifra_source_records.mjs";

const DEFAULT_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);

export const DEFAULT_IFRA_PROMOTION_OPPORTUNITIES_PATH = path.join(
  DEFAULT_ROOT,
  "data",
  "ifra_source_acquisition",
  "ifra_promotion_opportunities.json"
);

export const DEFAULT_IFRA_PROMOTION_OPPORTUNITIES_MARKDOWN_PATH = path.join(
  DEFAULT_ROOT,
  "docs",
  "ifra",
  "ifra_promotion_opportunities.md"
);

const OFFICIAL_SOURCE_TYPES = new Set([
  "official_ifra_standard_library",
  "official_ifra_standard_pdf",
]);

const SUPPLIER_ONLY_SOURCE_TYPES = new Set([
  "supplier_product_page",
  "supplier_ifra",
  "supplier_sds",
]);

const SOURCE_NEEDED_TYPES = new Set([
  "supplier_ifra_or_sds_needed",
  "specialty_supplier_document_needed",
  "natural_uvcb_supplier_document_needed",
]);

const SECTION_ORDER = [
  "promote_next",
  "good_candidate_after_review",
  "needs_better_source",
  "do_not_promote_yet",
  "already_promoted",
  "special_case_only",
];

const CLASSIFICATION_LABELS = {
  promote_next: "Recommended Next Promotions",
  good_candidate_after_review: "Good Candidates After Review",
  needs_better_source: "Needs Better Source",
  do_not_promote_yet: "Do Not Promote Yet",
  already_promoted: "Already Promoted",
  special_case_only: "Special Cases",
};

const IFRA_LIMIT_LANGUAGE_RE =
  /\b(?:IFRA|Cat(?:egory)?\.?\s*4|fine fragrance|max(?:imum)?\s*(?:use|concentration|level)|finished product|no restriction)\b/i;
const GHS_CATEGORY_4_RE =
  /\b(?:GHS|hazard|acute|toxicity|inhalation|oral|dermal|H\d{3}|category\s*4\s*(?:hazard|toxicity))\b/i;
const RIFM_USAGE_RE =
  /\b(?:RIFM|average\s+use|usual\s+use|reported\s+use|use\s+survey)\b/i;
const MARKETING_COPY_RE =
  /\b(?:best seller|customer reviews?|add to cart|shipping|newsletter|odour profile|longevity|appearance)\b/i;
const FCF_OR_PHOTOTOXIC_RE =
  /\b(?:FCF|furocoumarin|bergapten|phototoxic|bergamot|lemon)\b/i;
const DILUTION_RE = /\b(?:\d+(?:\.\d+)?\s*%|TEC|DPG|dilut(?:ed|ion))\b/i;

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

function recordsFromFile(file = {}) {
  if (Array.isArray(file)) return file;
  return file.records || file.candidates || file.items || file.recommendations || [];
}

function getQueueItems(sourceQueue = {}) {
  return recordsFromFile(sourceQueue);
}

function normalizeCategoryKey(category = "") {
  return String(category || "")
    .trim()
    .replace(/^cat(?:egory)?\.?\s*/i, "");
}

function parseCandidateValue(record = {}) {
  const value = record.normalizedCandidateValue ?? record.candidateValue;
  if (value == null || value === "") return { parseable: false, value: null };
  const text = String(value).trim();
  if (/^no\s+restriction$/i.test(text)) return { parseable: true, value: null };
  const numeric = Number(text.replace(/,/g, ""));
  return {
    parseable: Number.isFinite(numeric),
    value: Number.isFinite(numeric) ? numeric : null,
  };
}

function truncateText(value, maxLength = 260) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function asRelativePath(filePath) {
  if (!filePath) return "";
  return path.isAbsolute(filePath) ? path.relative(DEFAULT_ROOT, filePath) : filePath;
}

function sourceFileExists(sourceFile, fileExists) {
  if (!sourceFile) return false;
  const filePath = path.isAbsolute(sourceFile)
    ? sourceFile
    : path.join(DEFAULT_ROOT, sourceFile);
  return fileExists(filePath);
}

function sourceLooksCached(sourceFile, fileExists) {
  if (!sourceFile) return false;
  if (sourceFile.startsWith("src/data/")) return true;
  return sourceFileExists(sourceFile, fileExists);
}

function buildCandidateIndexes(officialCandidates = {}) {
  const byId = new Map();
  const byName = new Map();
  for (const candidate of recordsFromFile(officialCandidates)) {
    if (candidate.id) byId.set(candidate.id, candidate);
    for (const name of [
      candidate.materialName,
      candidate.formulaMaterialName,
      candidate.sourceIdentityName,
      candidate.standardTitle,
      ...(candidate.materialNames || []),
      ...(candidate.sourceIdentityNames || []),
    ]) {
      const normalized = normalizeText(name);
      if (!normalized || byName.has(normalized)) continue;
      byName.set(normalized, candidate);
    }
  }
  return { byId, byName };
}

function findOfficialCandidate(record = {}, indexes) {
  for (const candidateId of record.candidateIds || []) {
    const candidate = indexes.byId.get(candidateId);
    if (candidate) return candidate;
  }
  if (
    !OFFICIAL_SOURCE_TYPES.has(record.sourceType) &&
    (record.candidateIds || []).length > 0
  ) {
    return null;
  }
  for (const name of [record.sourceIdentityName, record.materialName]) {
    const candidate = indexes.byName.get(normalizeText(name));
    if (candidate) return candidate;
  }
  return null;
}

function buildQueueIndex(sourceQueue = {}) {
  const byId = new Map();
  const byName = new Map();
  for (const item of getQueueItems(sourceQueue)) {
    if (item.id) byId.set(item.id, item);
    for (const name of [
      item.materialName,
      item.sourceIdentityName,
      item.formulaMaterialName,
      item.activeMaterialName,
      item.normalizedName,
    ]) {
      const normalized = normalizeText(name);
      if (!normalized || byName.has(normalized)) continue;
      byName.set(normalized, item);
    }
  }
  return { byId, byName };
}

function findQueueItem(record = {}, queueIndex, officialCandidate = null) {
  for (const candidate of [officialCandidate]) {
    for (const itemId of candidate?.queueItemIds || []) {
      const item = queueIndex.byId.get(itemId);
      if (item) return item;
    }
    if (candidate?.queueItemId) {
      const item = queueIndex.byId.get(candidate.queueItemId);
      if (item) return item;
    }
  }
  for (const name of [
    record.sourceIdentityName,
    record.materialName,
    ...(record.formulaMaterialNames || []),
  ]) {
    const item = queueIndex.byName.get(normalizeText(name));
    if (item) return item;
  }
  return null;
}

function buildRecommendationIndex(recommendations = {}) {
  const byProposedId = new Map();
  for (const item of recordsFromFile(recommendations)) {
    if (item.proposedRecordId) byProposedId.set(item.proposedRecordId, item);
  }
  return byProposedId;
}

function buildPromotedIndexes({ reviewedStructuredOverrides = {}, proposedRecords = [] }) {
  const promotedProposedIds = new Set();
  const promotedRecordIds = new Set();
  const promotedNames = new Set();

  for (const record of recordsFromFile(reviewedStructuredOverrides)) {
    if (record.proposedRecordId) promotedProposedIds.add(record.proposedRecordId);
    if (record.id) promotedRecordIds.add(record.id);
    for (const name of [
      record.standardName,
      ...(record.materialNames || []),
    ]) {
      const normalized = normalizeText(name);
      if (normalized) promotedNames.add(normalized);
    }
  }

  for (const record of proposedRecords) {
    if (record.promotionStatus === "promoted") {
      if (record.id) promotedProposedIds.add(record.id);
      if (record.promotedRecordId) promotedRecordIds.add(record.promotedRecordId);
      for (const name of [
        record.materialName,
        record.sourceIdentityName,
        ...(record.formulaMaterialNames || []),
      ]) {
        const normalized = normalizeText(name);
        if (normalized) promotedNames.add(normalized);
      }
    }
  }

  return { promotedProposedIds, promotedRecordIds, promotedNames };
}

function isAlreadyPromoted(record = {}, promotedIndexes) {
  return (
    record.promotionStatus === "promoted" ||
    promotedIndexes.promotedProposedIds.has(record.id) ||
    promotedIndexes.promotedRecordIds.has(record.promotedRecordId)
  );
}

function isSpecialCaseOnly(record = {}, queueItem = null) {
  const joined = [
    record.recordType,
    record.materialName,
    record.sourceIdentityName,
    queueItem?.requiredSourceType,
    queueItem?.currentIfraCategory,
  ].join(" ");
  return (
    record.recordType !== "ifra_category_limit" ||
    queueItem?.requiredSourceType === "fcf_special_case" ||
    queueItem?.currentIfraCategory === "fcfSpecialCase" ||
    FCF_OR_PHOTOTOXIC_RE.test(joined) && record.recordType !== "ifra_category_limit"
  );
}

function hasIdentityMismatch(record = {}, officialCandidate = null) {
  if (!officialCandidate) return false;
  const recordNames = [
    record.materialName,
    record.sourceIdentityName,
    ...(record.formulaMaterialNames || []),
  ].map(normalizeText).filter(Boolean);
  const candidateNames = [
    officialCandidate.materialName,
    officialCandidate.sourceIdentityName,
    officialCandidate.standardTitle,
    ...(officialCandidate.materialNames || []),
    ...(officialCandidate.sourceIdentityNames || []),
  ].map(normalizeText).filter(Boolean);
  if (!recordNames.length || !candidateNames.length) return false;
  return !recordNames.some((name) => candidateNames.includes(name));
}

function sourceTypeFor(record = {}, officialCandidate = null) {
  if (String(record.sourceFile || "").toLowerCase().endsWith(".pdf")) {
    return "official_ifra_standard_pdf";
  }
  if (String(officialCandidate?.officialPdfLocalFile || "").toLowerCase().endsWith(".pdf")) {
    return "official_ifra_standard_pdf";
  }
  return record.sourceType || officialCandidate?.sourceType || "";
}

function classifyOpportunity({
  score,
  record,
  queueItem,
  officialCandidate,
  promoted,
  specialCase,
  hasOfficialSource,
  hasOfficialPdf,
  hasCachedSource,
  parseableCategoryValue,
  categoryClearlyIdentified,
  weakOrAmbiguous,
  sourceIdentityMismatch,
  sourceNeedsSupplierDocs,
  sourceType,
}) {
  if (promoted) return "already_promoted";
  if (specialCase) return "special_case_only";
  if (sourceIdentityMismatch) return "do_not_promote_yet";
  if (queueItem?.requiredSourceType === "already_structured") {
    return hasOfficialSource ? "good_candidate_after_review" : "do_not_promote_yet";
  }
  if (weakOrAmbiguous || !parseableCategoryValue || !categoryClearlyIdentified) {
    return "needs_better_source";
  }
  if (sourceNeedsSupplierDocs && !hasOfficialSource) return "needs_better_source";
  if (
    score >= 85 &&
    hasOfficialSource &&
    hasOfficialPdf &&
    hasCachedSource &&
    parseableCategoryValue &&
    categoryClearlyIdentified &&
    !sourceNeedsSupplierDocs
  ) {
    return "promote_next";
  }
  if (score >= 65 && hasOfficialSource) return "good_candidate_after_review";
  if (score >= 55 && !SUPPLIER_ONLY_SOURCE_TYPES.has(sourceType)) {
    return "good_candidate_after_review";
  }
  if (SUPPLIER_ONLY_SOURCE_TYPES.has(sourceType)) return "needs_better_source";
  return officialCandidate ? "good_candidate_after_review" : "do_not_promote_yet";
}

function scoreRecord({
  record,
  officialCandidate,
  queueItem,
  recommendation,
  promoted,
  specialCase,
  fileExists,
}) {
  const reasons = [];
  const risks = [];
  let score = 0;

  const sourceType = sourceTypeFor(record, officialCandidate);
  const hasOfficialSource =
    OFFICIAL_SOURCE_TYPES.has(record.sourceType) ||
    OFFICIAL_SOURCE_TYPES.has(officialCandidate?.sourceType);
  const hasOfficialPdf = sourceType === "official_ifra_standard_pdf";
  const hasCachedSource = sourceLooksCached(
    record.sourceFile || officialCandidate?.officialPdfLocalFile || officialCandidate?.sourceFile,
    fileExists
  );
  const hasExactCas =
    officialCandidate?.matchType === "cas" &&
    officialCandidate?.matchConfidence === "high";
  const hasExactSourceIdentity =
    normalizeText(record.sourceIdentityName) &&
    [
      officialCandidate?.sourceIdentityName,
      officialCandidate?.materialName,
      ...(officialCandidate?.sourceIdentityNames || []),
      ...(officialCandidate?.materialNames || []),
    ].some((name) => normalizeText(name) === normalizeText(record.sourceIdentityName));
  const { parseable } = parseCandidateValue(record);
  const categoryClearlyIdentified =
    normalizeCategoryKey(record.category) === "4" ||
    /\b(?:Cat(?:egory)?\.?\s*4|fine fragrance)\b/i.test(record.sourceSnippet || "");
  const snippetHasLimitLanguage = IFRA_LIMIT_LANGUAGE_RE.test(record.sourceSnippet || "");
  const sourceIdentityMismatch = hasIdentityMismatch(record, officialCandidate);
  const sourceNeedsSupplierDocs = SOURCE_NEEDED_TYPES.has(queueItem?.requiredSourceType);
  const dilutedStockConfusion =
    DILUTION_RE.test(record.materialName || "") &&
    normalizeText(record.materialName) === normalizeText(record.sourceIdentityName);
  const noisySnippet =
    GHS_CATEGORY_4_RE.test(record.sourceSnippet || "") ||
    RIFM_USAGE_RE.test(record.sourceSnippet || "") ||
    MARKETING_COPY_RE.test(record.sourceSnippet || "");
  const weakOrAmbiguous =
    ["low", "weak", "ambiguous"].includes(record.evidenceConfidence) ||
    ["low", "weak", "ambiguous"].includes(officialCandidate?.matchConfidence) ||
    /ambiguous|weak/i.test((record.notes || []).join(" "));

  if (hasOfficialSource) {
    score += 35;
    reasons.push("official IFRA source candidate");
  }
  if (hasOfficialPdf) {
    score += 20;
    reasons.push("official IFRA PDF/source file present");
  }
  if (hasExactCas) {
    score += 16;
    reasons.push("exact high-confidence CAS match");
  }
  if (hasExactSourceIdentity) {
    score += 12;
    reasons.push("exact source identity match");
  }
  if (parseable) {
    score += 14;
    reasons.push("category value is parseable or explicitly no restriction");
  } else {
    score -= 18;
    risks.push("candidate category value is not parseable");
  }
  if (categoryClearlyIdentified) {
    score += 12;
    reasons.push("Cat 4 / fine-fragrance context is explicit");
  } else {
    score -= 16;
    risks.push("Cat 4 / fine-fragrance context is not explicit");
  }
  if (snippetHasLimitLanguage) {
    score += 10;
    reasons.push("source snippet contains IFRA category/max-use language");
  }
  if (hasCachedSource) {
    score += 8;
    reasons.push("source artifact is cached locally or committed");
  } else {
    score -= 12;
    risks.push("source artifact is not cached locally");
  }
  if ((record.formulaMaterialNames || []).length || (queueItem?.formulasUsedIn || []).length) {
    score += 8;
    reasons.push("material appears in an active hero formula");
  }
  if (queueItem?.priority === "high") {
    score += 8;
    reasons.push("high-priority hero IFRA queue item");
  }
  if (recommendation?.confidence === "high" || record.evidenceConfidence === "high") {
    score += 6;
    reasons.push("autopilot confidence is high");
  }

  if (SUPPLIER_ONLY_SOURCE_TYPES.has(sourceType)) {
    score -= 28;
    risks.push("supplier/product-page-only source needs human review before any runtime use");
  }
  if (weakOrAmbiguous) {
    score -= 26;
    risks.push("source match is weak or ambiguous");
  }
  if (sourceIdentityMismatch) {
    score -= 36;
    risks.push("source identity does not safely match the proposed material");
  }
  if (dilutedStockConfusion) {
    score -= 10;
    risks.push("dilution label may obscure parent source identity");
  }
  if (sourceNeedsSupplierDocs && !hasOfficialSource) {
    score -= 20;
    risks.push("material still needs supplier-specific IFRA/SDS documentation");
  }
  if (queueItem?.requiredSourceType === "natural_uvcb_supplier_document_needed") {
    score -= 24;
    risks.push("natural/UVCB material needs supplier-specific documentation");
  }
  if (noisySnippet) {
    score -= 16;
    risks.push("snippet may include marketing, GHS, RIFM, or navigation noise");
  }
  if (queueItem?.requiredSourceType === "already_structured") {
    score -= 12;
    risks.push("material already has structured IFRA coverage; overlay promotion may be redundant");
  }
  if (promoted) {
    score = 0;
    reasons.push("record has already been promoted into runtime structured overlay");
  }
  if (specialCase) {
    score = Math.min(score, 20);
    risks.push("special-case evidence is not a regular category-limit promotion");
  }

  const classification = classifyOpportunity({
    score,
    record,
    queueItem,
    officialCandidate,
    promoted,
    specialCase,
    hasOfficialSource,
    hasOfficialPdf,
    hasCachedSource,
    parseableCategoryValue: parseable,
    categoryClearlyIdentified,
    weakOrAmbiguous,
    sourceIdentityMismatch,
    sourceNeedsSupplierDocs,
    sourceType,
  });

  return {
    score,
    confidenceLabel:
      score >= 85 ? "high" : score >= 65 ? "medium-high" : score >= 45 ? "medium" : "low",
    classification,
    reasons: uniqueStrings(reasons),
    risks: uniqueStrings(risks),
    sourceType,
    hasOfficialSource,
    hasOfficialPdf,
    hasCachedSource,
    hasExactCas,
    hasExactSourceIdentity,
    parseableCategoryValue: parseable,
    categoryClearlyIdentified,
    snippetHasLimitLanguage,
  };
}

function promotionCommand(record) {
  return [
    "node scripts/promote_reviewed_ifra_structured_record.mjs \\",
    `  --proposed-record-id "${record.id}" \\`,
    "  --review-status reviewed_ok \\",
    '  --notes "Reviewed official/source-backed proposed record. Promote one structured IFRA record with provenance."',
  ].join("\n");
}

export function rankIfraPromotionOpportunity({
  record,
  officialCandidate = null,
  queueItem = null,
  recommendation = null,
  promotedIndexes,
  reviewedSourceRecords = {},
  fileExists = fs.existsSync,
} = {}) {
  const promoted = isAlreadyPromoted(record, promotedIndexes);
  const specialCase = isSpecialCaseOnly(record, queueItem);
  const scoreDetails = scoreRecord({
    record,
    officialCandidate,
    queueItem,
    recommendation,
    promoted,
    specialCase,
    fileExists,
  });
  const reviewedEvidence = recordsFromFile(reviewedSourceRecords).filter((sourceRecord) =>
    (sourceRecord.candidateIds || []).some((candidateId) =>
      (record.candidateIds || []).includes(candidateId)
    )
  );
  const actionByClassification = {
    promote_next:
      "Review the source one final time, then run the one-record promotion command if still correct.",
    good_candidate_after_review:
      "Review source identity/provenance; promote later only if the source review is clean and value context is unambiguous.",
    needs_better_source:
      "Acquire or review a stronger official IFRA standard or supplier IFRA/SDS before promotion.",
    do_not_promote_yet:
      "Do not promote until source identity and limit context are resolved.",
    already_promoted:
      "No action. This record is already represented in the reviewed runtime overlay.",
    special_case_only:
      "Keep as non-limit evidence or special-case support; do not promote as a regular Cat 4 IFRA limit.",
  };

  return {
    proposedRecordId: record.id,
    materialName: record.materialName || "",
    sourceIdentityName: record.sourceIdentityName || record.materialName || "",
    formulaMaterialNames: record.formulaMaterialNames || [],
    recordType: record.recordType || "",
    sourceType: scoreDetails.sourceType,
    sourceUrl: record.sourceUrl || officialCandidate?.downloadUrl || officialCandidate?.sourceUrl || "",
    sourceFile: asRelativePath(
      record.sourceFile ||
        officialCandidate?.officialPdfLocalFile ||
        officialCandidate?.sourceFile ||
        ""
    ),
    category: record.category || "",
    candidateValue: record.candidateValue ?? "",
    candidateUnit: record.candidateUnit ?? "",
    normalizedCandidateValue: record.normalizedCandidateValue ?? null,
    sourceSnippet: truncateText(record.sourceSnippet || ""),
    officialCandidateId: officialCandidate?.id || "",
    officialStandardTitle: officialCandidate?.standardTitle || "",
    officialMatchType: officialCandidate?.matchType || "",
    officialMatchConfidence: officialCandidate?.matchConfidence || "",
    queueItemId: queueItem?.id || officialCandidate?.queueItemId || "",
    queuePriority: queueItem?.priority || "",
    requiredSourceType: queueItem?.requiredSourceType || "",
    currentIfraCategory: queueItem?.currentIfraCategory || "",
    formulasUsedIn: queueItem?.formulasUsedIn || [],
    promotionStatus: record.promotionStatus || "",
    reviewedSourceRecordIds: reviewedEvidence.map((item) => item.id),
    score: scoreDetails.score,
    confidenceLabel: scoreDetails.confidenceLabel,
    classification: scoreDetails.classification,
    why: scoreDetails.reasons,
    risk: scoreDetails.risks.length
      ? scoreDetails.risks
      : ["No major ranking risk detected, but source review is still required."],
    recommendedAction: actionByClassification[scoreDetails.classification],
    promotionCommand:
      scoreDetails.classification === "promote_next" ? promotionCommand(record) : "",
    guardrails: [
      "Do not bulk promote.",
      "Do not claim launch clearance.",
      "Review source identity, category, and value context before promotion.",
    ],
  };
}

export function buildIfraPromotionOpportunityReport({
  proposedRecordsFile = {},
  reviewedSourceRecords = {},
  reviewedStructuredOverrides = {},
  officialIfraSourceCandidates = {},
  autopilotRecommendations = {},
  heroIfraSourceQueue = {},
  generatedAt = new Date().toISOString(),
  fileExists = fs.existsSync,
} = {}) {
  const proposedRecords = recordsFromFile(proposedRecordsFile);
  const officialIndexes = buildCandidateIndexes(officialIfraSourceCandidates);
  const queueIndex = buildQueueIndex(heroIfraSourceQueue);
  const recommendationIndex = buildRecommendationIndex(autopilotRecommendations);
  const promotedIndexes = buildPromotedIndexes({
    reviewedStructuredOverrides,
    proposedRecords,
  });

  const opportunities = proposedRecords
    .map((record) => {
      const officialCandidate = findOfficialCandidate(record, officialIndexes);
      const queueItem = findQueueItem(record, queueIndex, officialCandidate);
      return rankIfraPromotionOpportunity({
        record,
        officialCandidate,
        queueItem,
        recommendation: recommendationIndex.get(record.id) || null,
        promotedIndexes,
        reviewedSourceRecords,
        fileExists,
      });
    })
    .sort((left, right) => {
      const classDelta =
        SECTION_ORDER.indexOf(left.classification) -
        SECTION_ORDER.indexOf(right.classification);
      if (classDelta !== 0) return classDelta;
      return right.score - left.score || left.materialName.localeCompare(right.materialName);
    });

  const grouped = {};
  for (const key of SECTION_ORDER) {
    grouped[key] = opportunities.filter((item) => item.classification === key);
  }

  const summary = {
    proposedRecordCount: proposedRecords.length,
    auditedRecordCount: opportunities.length,
    remainingUnpromotedProposedCount: opportunities.filter(
      (item) => item.classification !== "already_promoted"
    ).length,
    recommendedNextPromotionCount: grouped.promote_next.length,
    goodCandidateAfterReviewCount: grouped.good_candidate_after_review.length,
    needsBetterSourceCount: grouped.needs_better_source.length,
    doNotPromoteYetCount: grouped.do_not_promote_yet.length,
    alreadyPromotedCount: grouped.already_promoted.length,
    specialCaseOnlyCount: grouped.special_case_only.length,
    sourceTypeCounts: countBy(opportunities, "sourceType"),
    classificationCounts: countBy(opportunities, "classification"),
  };

  return {
    metadata: {
      generatedAt,
      reportName: "IFRA Promotion Opportunities",
      guardrails: [
        "This report ranks review opportunities only.",
        "No IFRA limits are promoted by this report.",
        "Promotion remains one reviewed record at a time.",
        "This is not launch clearance.",
      ],
    },
    summary,
    opportunities,
    grouped,
  };
}

export function buildIfraPromotionOpportunityReportFromFiles({
  proposedRecordsPath = DEFAULT_PROPOSED_IFRA_STRUCTURED_RECORDS_PATH,
  reviewedSourceRecordsPath = DEFAULT_REVIEWED_IFRA_SOURCE_RECORDS_PATH,
  reviewedStructuredOverridesPath = DEFAULT_REVIEWED_IFRA_STRUCTURED_OVERRIDES_PATH,
  officialIfraSourceCandidatesPath = DEFAULT_OFFICIAL_IFRA_SOURCE_CANDIDATES_PATH,
  autopilotRecommendationsPath = DEFAULT_IFRA_AUTOPILOT_RECOMMENDATIONS_PATH,
  heroIfraSourceQueuePath = DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH,
  generatedAt = new Date().toISOString(),
  fileExists = fs.existsSync,
} = {}) {
  return buildIfraPromotionOpportunityReport({
    proposedRecordsFile: loadJsonIfPresent(proposedRecordsPath) || {},
    reviewedSourceRecords: loadJsonIfPresent(reviewedSourceRecordsPath) || {},
    reviewedStructuredOverrides: loadJsonIfPresent(reviewedStructuredOverridesPath) || {},
    officialIfraSourceCandidates: loadJsonIfPresent(officialIfraSourceCandidatesPath) || {},
    autopilotRecommendations: loadJsonIfPresent(autopilotRecommendationsPath) || {},
    heroIfraSourceQueue: loadJsonIfPresent(heroIfraSourceQueuePath) || {},
    generatedAt,
    fileExists,
  });
}

function markdownList(values = []) {
  if (!values.length) return "- None";
  return values.map((value) => `- ${value}`).join("\n");
}

function formatOpportunityMarkdown(item) {
  const parts = [
    `### ${item.materialName}`,
    "",
    `- Source identity: ${item.sourceIdentityName || "unknown"}`,
    `- Proposed record ID: \`${item.proposedRecordId}\``,
    `- Source type: ${item.sourceType || "unknown"}`,
    `- Source URL/file: ${[item.sourceUrl, item.sourceFile].filter(Boolean).join(" | ") || "none"}`,
    `- Proposed category/value: Cat ${item.category || "unknown"} ${String(
      item.candidateValue || ""
    )}${item.candidateUnit || ""}`.trim(),
    `- Confidence: ${item.confidenceLabel} (${item.score})`,
    `- Recommended action: ${item.recommendedAction}`,
    "- Why it ranks here:",
    markdownList(item.why),
    "- Risk/caveat:",
    markdownList(item.risk),
  ];
  if (item.sourceSnippet) {
    parts.push("- Best source snippet:", `  > ${item.sourceSnippet}`);
  }
  if (item.promotionCommand) {
    parts.push(
      "- Promotion command:",
      "",
      "```bash",
      item.promotionCommand,
      "```"
    );
  }
  return parts.join("\n");
}

export function formatIfraPromotionOpportunitiesMarkdown(report = {}) {
  const summary = report.summary || {};
  const lines = [
    "# IFRA Promotion Opportunities",
    "",
    "Review-only ranking for proposed structured IFRA records. This report does not promote IFRA limits and is not launch clearance.",
    "",
    "## Summary",
    "",
    `- Proposed records audited: ${summary.auditedRecordCount || 0}`,
    `- Recommended next promotions: ${summary.recommendedNextPromotionCount || 0}`,
    `- Good candidates after review: ${summary.goodCandidateAfterReviewCount || 0}`,
    `- Needs better source: ${summary.needsBetterSourceCount || 0}`,
    `- Do not promote yet: ${summary.doNotPromoteYetCount || 0}`,
    `- Already promoted: ${summary.alreadyPromotedCount || 0}`,
    `- Special cases: ${summary.specialCaseOnlyCount || 0}`,
    "",
  ];

  for (const section of SECTION_ORDER) {
    const items = report.grouped?.[section] || [];
    lines.push(`## ${CLASSIFICATION_LABELS[section]}`, "");
    if (!items.length) {
      lines.push("_None._", "");
      continue;
    }
    for (const item of items) {
      lines.push(formatOpportunityMarkdown(item), "");
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

export function formatIfraPromotionOpportunitiesText(report = {}) {
  const summary = report.summary || {};
  const top = report.grouped?.promote_next?.[0] || report.grouped?.good_candidate_after_review?.[0];
  const lines = [
    "IFRA Promotion Opportunities",
    `Proposed records audited: ${summary.auditedRecordCount || 0}`,
    `Recommended next promotions: ${summary.recommendedNextPromotionCount || 0}`,
    `Good candidates after review: ${summary.goodCandidateAfterReviewCount || 0}`,
    `Needs better source: ${summary.needsBetterSourceCount || 0}`,
    `Do not promote yet: ${summary.doNotPromoteYetCount || 0}`,
    `Already promoted: ${summary.alreadyPromotedCount || 0}`,
    `Special cases: ${summary.specialCaseOnlyCount || 0}`,
  ];
  if (top) {
    lines.push(
      "",
      `Top review target: ${top.materialName}`,
      `Classification: ${top.classification}`,
      `Source: ${top.sourceType || "unknown"}`,
      `Action: ${top.recommendedAction}`
    );
  }
  lines.push("", "No records were promoted. This report is not launch clearance.");
  return `${lines.join("\n")}\n`;
}

export function writeIfraPromotionOpportunityReport(filePath, report) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
}
