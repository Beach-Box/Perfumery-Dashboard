import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH,
  loadExistingHeroIfraSourceQueue,
} from "./hero_ifra_source_acquisition_queue.mjs";
import {
  DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH,
  DEFAULT_INGREDIENT_SOURCE_HARVEST_REPORT_PATH,
} from "./ifra_source_harvest.mjs";
import {
  DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_PATH,
  loadExistingCandidateIfraReviewQueue,
} from "./candidate_ifra_review_queue.mjs";
import {
  DEFAULT_REVIEWED_IFRA_SOURCE_RECORDS_PATH,
  loadReviewedIfraSourceRecords,
} from "./reviewed_ifra_source_records.mjs";

const DEFAULT_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);

export const DEFAULT_IFRA_EVIDENCE_RESOLUTION_PATH = path.join(
  DEFAULT_ROOT,
  "data",
  "ifra_source_acquisition",
  "ifra_evidence_resolution.json"
);

export const DEFAULT_IFRA_EVIDENCE_RESOLUTION_MARKDOWN_PATH = path.join(
  DEFAULT_ROOT,
  "docs",
  "ifra",
  "ifra_evidence_resolution.md"
);

export const IFRA_EVIDENCE_RESOLVER_REGENERATE_COMMAND =
  "node scripts/resolve_ifra_evidence_candidates.mjs --markdown --write docs/ifra/ifra_evidence_resolution.md";

const PRIORITY_SCORE = { high: 30, medium: 18, low: 4 };
const SOURCE_TYPE_SCORE = {
  supplier_ifra: 34,
  supplier_sds: 28,
  supplier_product_page: 24,
  product_page: 22,
  safety_page: 20,
  global_ifra_standard: 20,
  identity_reference: -8,
  unknown: -6,
};
const CANDIDATE_TYPE_SCORE = {
  ifra_category_limit: 36,
  phototoxic_note: 28,
  allergen_or_restriction: 22,
  identity: 6,
  unknown: -10,
};
const HIGH_VALUE_CANDIDATE_TYPES = new Set([
  "ifra_category_limit",
  "phototoxic_note",
  "allergen_or_restriction",
]);
const SUPPLIER_DOC_SOURCE_TYPES = new Set([
  "supplier_ifra_or_sds_needed",
  "specialty_supplier_document_needed",
  "natural_uvcb_supplier_document_needed",
]);
const STATUS_ORDER = [
  "review_ready",
  "likely_fcf_evidence",
  "candidate_found_needs_review",
  "needs_supplier_doc",
  "insufficient_evidence",
  "identity_only",
  "already_reviewed",
  "not_applicable",
  "deferred",
];
const SUGGESTED_ACTION_ORDER = [
  "review_top_candidate",
  "promote_fcf_evidence_after_review",
  "request_supplier_ifra_or_sds",
  "find_global_ifra_standard",
  "defer",
  "already_reviewed",
  "ignore_not_relevant",
];

const CAS_RE = /\b\d{2,7}-\d{2}-\d\b/g;
const IFRA_RE = /\bIFRA\b/i;
const CATEGORY_4_RE = /\b(?:Cat(?:egory)?\.?\s*4|fine fragrance)\b/i;
const MAX_USE_RE =
  /\b(?:max(?:imum)?\s*(?:use|concentration|level)|use\s*level|limit|restriction)\b/i;
const FCF_RE = /\b(?:FCF|furocoumarin[\s-]*free|bergapten[\s-]*free|phototoxic)\b/i;
const SDS_RE = /\b(?:SDS|MSDS|Safety Data Sheet)\b/i;
const ALLERGEN_RE = /\b(?:allergen|restriction|restricted|EU\s*1223|conformity|compliance)\b/i;
const GHS_CATEGORY_4_RE =
  /\b(?:GHS|hazard|acute|toxicity|inhalation|oral|dermal|H\d{3}|category\s*4\s*(?:hazard|toxicity))\b/i;
const RIFM_USAGE_RE = /\b(?:RIFM|average\s+use|usual\s+use|reported\s+use|use\s+survey)\b/i;
const NAVIGATION_NOISE_RE =
  /\b(?:Twitter|Instagram|Linkedin|Pinterest|Customer Reviews|Write a review|Add to cart|Shipping Policy|Privacy Policy|Newsletter|Search|Supplier Sponsors|View full details|Product\(s\):)\b/i;

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

function extractCasTerms(values = []) {
  return uniqueStrings(
    values.flatMap((value) => String(value || "").match(CAS_RE) || [])
  );
}

function getQueueNameTerms(queueItem = {}) {
  return uniqueStrings([
    queueItem.materialName,
    queueItem.normalizedName,
    ...(queueItem.sourceRowNames || []),
    ...(queueItem.candidateSearchTerms || []).filter((term) => !/^IFRA\b/i.test(term)),
  ]).map((term) => ({
    raw: term,
    normalized: normalizeText(term),
  }));
}

function getQueueCasTerms(queueItem = {}) {
  return extractCasTerms([
    queueItem.materialName,
    queueItem.normalizedName,
    ...(queueItem.sourceRowNames || []),
    ...(queueItem.candidateSearchTerms || []),
    ...(queueItem.knownReferenceLinks || []).flatMap((link) => [
      link.url,
      link.label,
      link.type,
    ]),
  ]);
}

function buildReviewQueueLookup(candidateReviewQueue = {}) {
  const byQueueItemId = new Map();
  const byCandidateId = new Map();
  for (const item of candidateReviewQueue?.items || []) {
    if (item.queueItemId) byQueueItemId.set(item.queueItemId, item);
    for (const candidateId of item.candidateIds || []) {
      if (!byCandidateId.has(candidateId)) byCandidateId.set(candidateId, []);
      byCandidateId.get(candidateId).push(item);
    }
  }
  return { byQueueItemId, byCandidateId };
}

function reviewedRecordMatchesQueue(record = {}, queueItem = {}) {
  const names = getQueueNameTerms(queueItem).map((term) => term.normalized);
  const recordNames = [
    normalizeText(record.materialName),
    normalizeText(record.normalizedName),
  ];
  return recordNames.some((name) => name && names.includes(name));
}

function buildReviewedRecordsLookup(reviewedRecordsFile = {}) {
  const records = Array.isArray(reviewedRecordsFile?.records)
    ? reviewedRecordsFile.records
    : [];
  return {
    records,
    forQueueItem(queueItem) {
      return records.filter((record) => reviewedRecordMatchesQueue(record, queueItem));
    },
  };
}

function isFcfQueueItem(queueItem = {}) {
  const haystack = normalizeText(
    [
      queueItem.requiredSourceType,
      queueItem.currentIfraCategory,
      queueItem.materialName,
      queueItem.normalizedName,
      queueItem.reason,
      ...(queueItem.candidateSearchTerms || []),
    ].join(" ")
  );
  return haystack.includes("fcf") || haystack.includes("furocoumarin");
}

function candidateText(candidate = {}) {
  return [
    candidate.materialName,
    ...(candidate.materialNames || []),
    candidate.sourceUrl,
    candidate.sourceFile,
    candidate.snippet,
    candidate.candidateValue,
    candidate.notes?.join(" "),
  ].join(" ");
}

function sourceMatchesKnownLink(candidate = {}, queueItem = {}) {
  const candidateUrl = String(candidate.sourceUrl || "").trim();
  if (!candidateUrl) return false;
  return (queueItem.knownReferenceLinks || []).some(
    (link) => String(link?.url || "").trim() === candidateUrl
  );
}

function candidateHasExactName(candidate = {}, queueItem = {}) {
  const materialNames = [
    candidate.materialName,
    ...(candidate.materialNames || []),
  ].map(normalizeText);
  const queueTerms = getQueueNameTerms(queueItem).map((term) => term.normalized);
  return materialNames.some((name) => name && queueTerms.includes(name));
}

function candidateCanBelongToQueue(candidate = {}, queueItem = {}) {
  if ((candidate.queueItemIds || []).includes(queueItem.id)) return true;
  return candidateHasExactName(candidate, queueItem);
}

function scoreCandidateForQueue(candidate = {}, queueItem = {}) {
  const text = candidateText(candidate);
  const normalizedSnippet = normalizeText(candidate.snippet);
  const queueCasTerms = getQueueCasTerms(queueItem);
  const linked = (candidate.queueItemIds || []).includes(queueItem.id);
  const exactName = candidateHasExactName(candidate, queueItem);
  const hasCasMatch =
    queueCasTerms.length > 0 &&
    queueCasTerms.some((cas) => text.includes(cas));
  const hasIfra = IFRA_RE.test(text);
  const hasGhsCategory4 = CATEGORY_4_RE.test(text) && GHS_CATEGORY_4_RE.test(text);
  const hasCategory4 = CATEGORY_4_RE.test(text) && !hasGhsCategory4;
  const hasMaxUse = MAX_USE_RE.test(text);
  const hasFcf = FCF_RE.test(text);
  const hasSds = SDS_RE.test(text);
  const hasAllergen = ALLERGEN_RE.test(text);
  const hasRifmUsage = RIFM_USAGE_RE.test(text);
  const hasNoise = NAVIGATION_NOISE_RE.test(text);
  const sourceType = candidate.sourceType || "unknown";
  const candidateLimitType = candidate.candidateLimitType || "unknown";
  const reasons = [];
  const warnings = [];
  let score = 0;

  if (linked) {
    score += 35;
    reasons.push("linked to this queue item");
  } else {
    score -= 8;
    warnings.push("not directly linked to this queue item");
  }
  if (exactName) {
    score += 18;
    reasons.push("exact material-name match");
  }
  if (hasCasMatch) {
    score += 22;
    reasons.push("CAS term matches queue identity");
  }
  score += PRIORITY_SCORE[candidate.reviewPriority] ?? 0;
  if (candidate.reviewPriority) reasons.push(`${candidate.reviewPriority} review priority`);
  score += SOURCE_TYPE_SCORE[sourceType] ?? SOURCE_TYPE_SCORE.unknown;
  reasons.push(`${sourceType} source`);
  score += CANDIDATE_TYPE_SCORE[candidateLimitType] ?? CANDIDATE_TYPE_SCORE.unknown;
  reasons.push(`${candidateLimitType} candidate`);

  if (sourceMatchesKnownLink(candidate, queueItem)) {
    score += 10;
    reasons.push("source URL came from matched ingredient reference");
  }
  if (hasIfra) {
    score += 10;
    reasons.push("IFRA language present");
  }
  if (hasCategory4) {
    score += 14;
    reasons.push("Cat 4/fine-fragrance language present");
  }
  if (hasMaxUse) {
    score += 10;
    reasons.push("maximum-use/restriction wording present");
  }
  if (hasFcf) {
    score += isFcfQueueItem(queueItem) ? 18 : 6;
    reasons.push("FCF/phototoxic wording present");
  }
  if (hasSds) {
    score += 8;
    reasons.push("SDS language present");
  }
  if (hasAllergen) {
    score += 8;
    reasons.push("allergen/restriction language present");
  }

  if (!linked && !exactName) {
    score -= 25;
    warnings.push("material match is not specific enough");
  }
  if (sourceType === "identity_reference" && !hasIfra && !hasFcf && !hasSds && !hasAllergen) {
    score = Math.min(score, 35);
    warnings.push("identity-reference evidence only");
  }
  if (sourceType === "identity_reference" && hasNoise) {
    score -= 16;
    warnings.push("identity page contains navigation or supplier-directory noise");
  }
  if (hasGhsCategory4) {
    score -= 45;
    warnings.push("GHS hazard Category 4 text is not IFRA Cat 4 evidence");
  }
  if (hasRifmUsage) {
    score -= 30;
    warnings.push("RIFM/average-use text is not an IFRA category limit");
  }
  if (candidateLimitType === "identity") {
    score = Math.min(score, 50);
  }

  return {
    id: candidate.id,
    materialName: candidate.materialName || "",
    score: Math.max(0, Math.round(score)),
    candidateLimitType,
    reviewPriority: candidate.reviewPriority || "low",
    sourceType,
    sourceUrl: candidate.sourceUrl || "",
    sourceFile: candidate.sourceFile || "",
    category: candidate.category || "",
    candidateValue: candidate.candidateValue || "",
    candidateUnit: candidate.candidateUnit || "",
    snippet: String(candidate.snippet || "").replace(/\s+/g, " ").trim(),
    queueItemIds: candidate.queueItemIds || [],
    queueLinkConfidence: candidate.queueLinkConfidence || "none",
    reasons: uniqueStrings(reasons).slice(0, 6),
    warnings: uniqueStrings(warnings).slice(0, 5),
    generatedCommand: "",
    signals: {
      linked,
      exactName,
      hasCasMatch,
      hasIfra,
      hasCategory4,
      hasMaxUse,
      hasFcf,
      hasSds,
      hasAllergen,
      hasGhsCategory4,
      hasRifmUsage,
      normalizedSnippet,
    },
  };
}

function compareCandidates(left = {}, right = {}) {
  if ((right.score || 0) !== (left.score || 0)) return (right.score || 0) - (left.score || 0);
  const typeDelta =
    (CANDIDATE_TYPE_SCORE[right.candidateLimitType] || 0) -
    (CANDIDATE_TYPE_SCORE[left.candidateLimitType] || 0);
  if (typeDelta) return typeDelta;
  return String(left.materialName || "").localeCompare(String(right.materialName || ""));
}

function getConfidence(score) {
  if (score >= 90) return "high";
  if (score >= 55) return "medium";
  return "low";
}

function isDeferredQueueItem(queueItem = {}) {
  return (
    queueItem.status === "deferred" ||
    queueItem.requiredSourceType === "accord_component_expansion_deferred" ||
    queueItem.requiredSourceType === "defer_low_priority"
  );
}

function getBestHighValueCandidate(scoredCandidates = []) {
  return scoredCandidates.find(
    (candidate) =>
      HIGH_VALUE_CANDIDATE_TYPES.has(candidate.candidateLimitType) &&
      !candidate.signals.hasGhsCategory4 &&
      !candidate.signals.hasRifmUsage
  );
}

function buildFcfPromotionCommand(queueItem = {}, candidate = {}) {
  if (!candidate?.id) return "";
  return [
    "node scripts/promote_reviewed_ifra_candidates.mjs \\",
    `  --candidate-id "${candidate.id}" \\`,
    `  --material "${queueItem.materialName}" \\`,
    "  --record-type fcf_phototoxic_note \\",
    "  --finding furocoumarin_free_or_bergapten_free \\",
    '  --summary "Reviewed source supports FCF/bergapten-free handling. Not launch clearance."',
  ].join("\n");
}

function classifyResolution({ queueItem, scoredCandidates, reviewedRecords }) {
  if (reviewedRecords.length || ["reviewed", "promoted"].includes(queueItem.status)) {
    return {
      evidenceStatus: "already_reviewed",
      suggestedAction: "already_reviewed",
      confidence: "high",
      whySelected: reviewedRecords.length
        ? "A reviewed source-evidence record already exists for this material."
        : "The source queue item is already marked reviewed or promoted.",
      limitations: ["Reviewed evidence is not launch clearance."],
    };
  }

  if (isDeferredQueueItem(queueItem)) {
    return {
      evidenceStatus: "deferred",
      suggestedAction: "defer",
      confidence: "low",
      whySelected: "This queue item is intentionally deferred.",
      limitations: ["Deferred items still require a later dedicated review task."],
    };
  }

  if (queueItem.requiredSourceType === "already_structured") {
    return {
      evidenceStatus: "not_applicable",
      suggestedAction: "ignore_not_relevant",
      confidence: "high",
      whySelected: "Current structured IFRA coverage already exists.",
      limitations: ["Existing coverage is still not launch clearance."],
    };
  }

  const bestCandidate = scoredCandidates[0] || null;
  const bestHighValue = getBestHighValueCandidate(scoredCandidates);
  const hasOnlyIdentity =
    scoredCandidates.length > 0 &&
    scoredCandidates.every((candidate) => candidate.candidateLimitType === "identity");

  if (isFcfQueueItem(queueItem)) {
    const fcfCandidate = scoredCandidates.find(
      (candidate) =>
        candidate.candidateLimitType === "phototoxic_note" &&
        candidate.signals.hasFcf &&
        candidate.score >= 45
    );
    if (fcfCandidate) {
      return {
        evidenceStatus: "likely_fcf_evidence",
        suggestedAction: "promote_fcf_evidence_after_review",
        confidence: getConfidence(fcfCandidate.score),
        whySelected:
          "Top evidence contains FCF, furocoumarin, bergapten, or phototoxic wording for an FCF citrus special case.",
        limitations: [
          "FCF promotion supports special-case evidence only.",
          "It does not create or modify IFRA category limits.",
          "Supplier IFRA/SDS still required before launch clearance.",
        ],
      };
    }
  }

  if (bestHighValue && bestHighValue.score >= 75) {
    return {
      evidenceStatus: "review_ready",
      suggestedAction: "review_top_candidate",
      confidence: getConfidence(bestHighValue.score),
      whySelected:
        "A material-linked supplier/SDS/product-page candidate contains source-specific IFRA, restriction, or SDS language.",
      limitations: [
        "Review candidate and mark accepted only.",
        "Structured limit promotion is a later task.",
      ],
    };
  }

  if (bestHighValue && bestHighValue.score >= 45) {
    return {
      evidenceStatus: "candidate_found_needs_review",
      suggestedAction: "review_top_candidate",
      confidence: getConfidence(bestHighValue.score),
      whySelected:
        "A candidate has relevant source language, but identity/source strength is not enough for automatic confidence.",
      limitations: [
        "Human review required before accepting this candidate.",
        "Do not promote automatically.",
      ],
    };
  }

  if (hasOnlyIdentity || bestCandidate?.candidateLimitType === "identity") {
    return {
      evidenceStatus: "identity_only",
      suggestedAction: SUPPLIER_DOC_SOURCE_TYPES.has(queueItem.requiredSourceType)
        ? "request_supplier_ifra_or_sds"
        : "find_global_ifra_standard",
      confidence: "low",
      whySelected:
        "Available candidates are useful for identity/CAS/source targeting but are not compliance evidence.",
      limitations: ["Identity references do not prove IFRA compliance."],
    };
  }

  if (SUPPLIER_DOC_SOURCE_TYPES.has(queueItem.requiredSourceType)) {
    return {
      evidenceStatus: "needs_supplier_doc",
      suggestedAction: "request_supplier_ifra_or_sds",
      confidence: "low",
      whySelected:
        "No strong material-specific supplier IFRA/SDS candidate is available yet.",
      limitations: ["Supplier documentation is still needed before launch confidence."],
    };
  }

  if (queueItem.requiredSourceType === "global_ifra_standard_needed") {
    return {
      evidenceStatus: "insufficient_evidence",
      suggestedAction: "find_global_ifra_standard",
      confidence: "low",
      whySelected: "No strong source-backed global IFRA standard candidate is available yet.",
      limitations: ["Do not infer a limit from missing source data."],
    };
  }

  return {
    evidenceStatus: "insufficient_evidence",
    suggestedAction: "request_supplier_ifra_or_sds",
    confidence: "low",
    whySelected: "No material-specific evidence candidate was strong enough to review first.",
    limitations: ["Do not treat missing evidence as safe."],
  };
}

function buildResolutionItem({
  queueItem,
  candidates,
  reviewQueueLookup,
  reviewedLookup,
  top = 1,
}) {
  const reviewedRecords = reviewedLookup.forQueueItem(queueItem);
  const scoredCandidates = candidates
    .filter((candidate) => candidateCanBelongToQueue(candidate, queueItem))
    .map((candidate) => scoreCandidateForQueue(candidate, queueItem))
    .sort(compareCandidates);
  const classification = classifyResolution({
    queueItem,
    scoredCandidates,
    reviewedRecords,
  });
  const bestCandidates = scoredCandidates
    .filter((candidate) => candidate.score > 0)
    .slice(0, Math.max(1, Number(top) || 1))
    .map((candidate) => ({
      ...candidate,
      generatedCommand:
        classification.suggestedAction === "promote_fcf_evidence_after_review" &&
        candidate.candidateLimitType === "phototoxic_note"
          ? buildFcfPromotionCommand(queueItem, candidate)
          : "",
    }));
  const reviewItem = reviewQueueLookup.byQueueItemId.get(queueItem.id) || null;
  return {
    id: `ifra-evidence-resolution-${slugify(queueItem.id)}`,
    queueItemId: queueItem.id,
    materialName: queueItem.materialName || "",
    normalizedName: queueItem.normalizedName || "",
    formulasUsedIn: queueItem.formulasUsedIn || [],
    priority: queueItem.priority || "medium",
    requiredSourceType: queueItem.requiredSourceType || "",
    currentIfraCategory: queueItem.currentIfraCategory || "",
    queueStatus: queueItem.status || "needed",
    queueReviewStatus: queueItem.reviewStatus || "not_started",
    evidenceStatus: classification.evidenceStatus,
    suggestedAction: classification.suggestedAction,
    confidence: classification.confidence,
    score: bestCandidates[0]?.score || 0,
    whySelected: classification.whySelected,
    limitations: classification.limitations,
    candidateCounts: {
      totalMatched: scoredCandidates.length,
      linked: scoredCandidates.filter((candidate) => candidate.signals.linked).length,
      highValue: scoredCandidates.filter((candidate) =>
        HIGH_VALUE_CANDIDATE_TYPES.has(candidate.candidateLimitType)
      ).length,
      identityOnly: scoredCandidates.filter(
        (candidate) => candidate.candidateLimitType === "identity"
      ).length,
      suppressedWeak: Math.max(0, scoredCandidates.length - bestCandidates.length),
    },
    candidateReviewItemId: reviewItem?.id || "",
    candidateReviewStatus: reviewItem?.reviewStatus || "",
    reviewedSourceRecordIds: reviewedRecords.map((record) => record.id),
    bestCandidates,
  };
}

function compareResolutionItems(left = {}, right = {}) {
  const statusDelta =
    STATUS_ORDER.indexOf(left.evidenceStatus) -
    STATUS_ORDER.indexOf(right.evidenceStatus);
  if (statusDelta) return statusDelta;
  if ((right.score || 0) !== (left.score || 0)) return (right.score || 0) - (left.score || 0);
  return String(left.materialName || "").localeCompare(String(right.materialName || ""));
}

function summarizeResolution(items = [], candidateExtractions = {}, reviewedRecordsFile = {}) {
  const evidenceStatusCounts = countBy(items, "evidenceStatus");
  const suggestedActionCounts = countBy(items, "suggestedAction");
  const confidenceCounts = countBy(items, "confidence");
  return {
    queueItemCount: items.length,
    candidateCount: candidateExtractions?.summary?.candidateCount ??
      (candidateExtractions?.candidates || []).length,
    retainedCandidateCount: (candidateExtractions?.candidates || []).length,
    reviewedSourceRecordCount: (reviewedRecordsFile?.records || []).length,
    evidenceStatusCounts,
    suggestedActionCounts,
    confidenceCounts,
    reviewReadyCount:
      (evidenceStatusCounts.review_ready || 0) +
      (evidenceStatusCounts.candidate_found_needs_review || 0),
    likelyFcfEvidenceCount: evidenceStatusCounts.likely_fcf_evidence || 0,
    insufficientEvidenceCount:
      (evidenceStatusCounts.insufficient_evidence || 0) +
      (evidenceStatusCounts.identity_only || 0),
    needsSupplierDocCount: evidenceStatusCounts.needs_supplier_doc || 0,
    alreadyReviewedCount: evidenceStatusCounts.already_reviewed || 0,
    deferredCount: evidenceStatusCounts.deferred || 0,
    topReviewFirstMaterials: items
      .filter((item) =>
        ["review_ready", "candidate_found_needs_review"].includes(
          item.evidenceStatus
        )
      )
      .slice(0, 5)
      .map((item) => item.materialName),
  };
}

export function buildIfraEvidenceResolution({
  sourceQueue = {},
  candidateExtractions = {},
  candidateReviewQueue = {},
  reviewedSourceRecords = {},
  ingredientSourceHarvestReport = {},
  generatedAt = new Date().toISOString(),
  top = 1,
} = {}) {
  const queueItems = Array.isArray(sourceQueue?.items) ? sourceQueue.items : [];
  const candidates = Array.isArray(candidateExtractions?.candidates)
    ? candidateExtractions.candidates
    : [];
  const reviewQueueLookup = buildReviewQueueLookup(candidateReviewQueue);
  const reviewedLookup = buildReviewedRecordsLookup(reviewedSourceRecords);
  const items = queueItems
    .map((queueItem) =>
      buildResolutionItem({
        queueItem,
        candidates,
        reviewQueueLookup,
        reviewedLookup,
        top,
      })
    )
    .sort(compareResolutionItems);
  return {
    metadata: {
      generatedAt,
      reportName: "IFRA Evidence Resolution",
      regenerateCommand: IFRA_EVIDENCE_RESOLVER_REGENERATE_COMMAND,
      sourceQueueGeneratedAt: sourceQueue?.metadata?.generatedAt || null,
      candidateExtractionGeneratedAt:
        candidateExtractions?.metadata?.generatedAt || null,
      candidateReviewQueueGeneratedAt:
        candidateReviewQueue?.metadata?.generatedAt || null,
      ingredientSourceHarvestGeneratedAt:
        ingredientSourceHarvestReport?.metadata?.generatedAt || null,
      topCandidatesPerMaterial: Math.max(1, Number(top) || 1),
      guardrails: [
        "Evidence resolver output is review triage only.",
        "No IFRA limits are promoted automatically.",
        "No launch clearance is claimed.",
      ],
    },
    summary: summarizeResolution(items, candidateExtractions, reviewedSourceRecords),
    items,
  };
}

export function buildIfraEvidenceResolutionFromFiles({
  sourceQueuePath = DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH,
  candidateExtractionsPath = DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH,
  candidateReviewQueuePath = DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_PATH,
  reviewedSourceRecordsPath = DEFAULT_REVIEWED_IFRA_SOURCE_RECORDS_PATH,
  ingredientSourceHarvestReportPath = DEFAULT_INGREDIENT_SOURCE_HARVEST_REPORT_PATH,
  generatedAt = new Date().toISOString(),
  top = 1,
} = {}) {
  return buildIfraEvidenceResolution({
    sourceQueue: loadExistingHeroIfraSourceQueue(sourceQueuePath) || {},
    candidateExtractions: loadJsonIfPresent(candidateExtractionsPath) || {},
    candidateReviewQueue:
      loadExistingCandidateIfraReviewQueue(candidateReviewQueuePath) || {},
    reviewedSourceRecords:
      loadReviewedIfraSourceRecords(reviewedSourceRecordsPath) || {},
    ingredientSourceHarvestReport:
      loadJsonIfPresent(ingredientSourceHarvestReportPath) || {},
    generatedAt,
    top,
  });
}

function formatCountLine(label, value) {
  return `- ${label}: ${Number(value || 0).toLocaleString()}`;
}

function truncateText(value, maxLength = 320) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function formatCandidateMarkdown(candidate = {}) {
  if (!candidate.id) return "- Best candidate: None";
  const source = candidate.sourceUrl || candidate.sourceFile || "Unknown source";
  return [
    `- Best candidate: ${candidate.candidateLimitType} (${candidate.sourceType}, score ${candidate.score})`,
    `- Candidate ID: ${candidate.id}`,
    `- Source: ${source}`,
    `- Snippet: ${truncateText(candidate.snippet) || "No snippet."}`,
    `- Why selected: ${(candidate.reasons || []).join("; ") || "Highest-ranked available candidate."}`,
    candidate.warnings?.length
      ? `- Cautions: ${candidate.warnings.join("; ")}`
      : "",
    candidate.generatedCommand
      ? ["- Suggested command:", "", "```bash", candidate.generatedCommand, "```"].join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatResolutionItemMarkdown(item = {}) {
  const candidateBlocks = (item.bestCandidates || [])
    .slice(0, 3)
    .map(formatCandidateMarkdown);
  return [
    `### ${item.materialName}`,
    "",
    `- Queue item: ${item.queueItemId}`,
    `- Formulas used in: ${(item.formulasUsedIn || []).join(", ") || "Unknown"}`,
    `- Evidence status: ${item.evidenceStatus}`,
    `- Suggested action: ${item.suggestedAction}`,
    `- Confidence: ${item.confidence}`,
    `- Why: ${item.whySelected}`,
    `- Limitations: ${(item.limitations || []).join("; ") || "Review before use."}`,
    "",
    ...(candidateBlocks.length ? candidateBlocks : ["- Best candidate: None"]),
    "",
  ].join("\n");
}

function groupItemsForMarkdown(items = []) {
  const groups = new Map([
    ["Review first", []],
    ["Likely FCF evidence", []],
    ["Needs supplier document", []],
    ["Needs global IFRA standard", []],
    ["Identity only / insufficient", []],
    ["Already reviewed / deferred", []],
  ]);
  for (const item of items) {
    if (["review_ready", "candidate_found_needs_review"].includes(item.evidenceStatus)) {
      groups.get("Review first").push(item);
    } else if (item.evidenceStatus === "likely_fcf_evidence") {
      groups.get("Likely FCF evidence").push(item);
    } else if (item.evidenceStatus === "needs_supplier_doc") {
      groups.get("Needs supplier document").push(item);
    } else if (
      item.suggestedAction === "find_global_ifra_standard" &&
      item.evidenceStatus !== "identity_only"
    ) {
      groups.get("Needs global IFRA standard").push(item);
    } else if (["already_reviewed", "not_applicable", "deferred"].includes(item.evidenceStatus)) {
      groups.get("Already reviewed / deferred").push(item);
    } else {
      groups.get("Identity only / insufficient").push(item);
    }
  }
  return groups;
}

export function formatIfraEvidenceResolutionMarkdown(report = {}) {
  const summary = report.summary || {};
  const groups = groupItemsForMarkdown(report.items || []);
  const groupSections = [...groups.entries()].flatMap(([label, items]) => [
    `## ${label}`,
    "",
    items.length
      ? items.map(formatResolutionItemMarkdown).join("\n")
      : "_No items in this group._\n",
  ]);
  return [
    "# IFRA Evidence Resolution",
    "",
    `Generated: ${report.metadata?.generatedAt || ""}`,
    "",
    "This report ranks already harvested IFRA/SDS/product-page candidates for review. It does not scrape new pages, promote IFRA limits, or prove launch clearance.",
    "",
    "## Summary",
    "",
    formatCountLine("Queue items", summary.queueItemCount),
    formatCountLine("Retained candidates considered", summary.retainedCandidateCount),
    formatCountLine("Review-ready or candidate-found items", summary.reviewReadyCount),
    formatCountLine("Likely FCF evidence items", summary.likelyFcfEvidenceCount),
    formatCountLine("Needs supplier document items", summary.needsSupplierDocCount),
    formatCountLine("Identity-only or insufficient items", summary.insufficientEvidenceCount),
    formatCountLine("Already reviewed items", summary.alreadyReviewedCount),
    "",
    "Evidence status counts:",
    ...orderedCountEntries(summary.evidenceStatusCounts || {}, STATUS_ORDER).map(
      ([key, value]) => `- ${key}: ${value}`
    ),
    "",
    "Suggested action counts:",
    ...orderedCountEntries(summary.suggestedActionCounts || {}, SUGGESTED_ACTION_ORDER).map(
      ([key, value]) => `- ${key}: ${value}`
    ),
    "",
    ...groupSections,
  ].join("\n");
}

export function formatIfraEvidenceResolutionText(report = {}) {
  const summary = report.summary || {};
  const topItems = (report.items || [])
    .filter((item) =>
      ["review_ready", "candidate_found_needs_review", "likely_fcf_evidence"].includes(
        item.evidenceStatus
      )
    )
    .slice(0, 8);
  return [
    "IFRA Evidence Resolution",
    "",
    "Ranks already harvested source candidates for review. Does not promote IFRA limits.",
    "",
    `Queue items: ${summary.queueItemCount || 0}`,
    `Retained candidates considered: ${summary.retainedCandidateCount || 0}`,
    `Review-ready/candidate-found: ${summary.reviewReadyCount || 0}`,
    `Likely FCF evidence: ${summary.likelyFcfEvidenceCount || 0}`,
    `Needs supplier document: ${summary.needsSupplierDocCount || 0}`,
    `Identity-only/insufficient: ${summary.insufficientEvidenceCount || 0}`,
    "",
    "Top review-first materials:",
    ...(topItems.length
      ? topItems.map(
          (item) =>
            `- ${item.materialName}: ${item.evidenceStatus}, ${item.suggestedAction}, confidence=${item.confidence}`
        )
      : ["- None."]),
    "",
  ].join("\n");
}

export function writeIfraEvidenceResolution(filePath, report) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
}
