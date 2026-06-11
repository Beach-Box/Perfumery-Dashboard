import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_PROPOSED_IFRA_STRUCTURED_RECORDS_PATH,
} from "./ifra_autopilot_recommendations.mjs";
import {
  DEFAULT_OFFICIAL_IFRA_SOURCE_CANDIDATES_PATH,
} from "./official_ifra_harvest.mjs";

const DEFAULT_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);

export const DEFAULT_REVIEWED_IFRA_STRUCTURED_OVERRIDES_PATH = path.join(
  DEFAULT_ROOT,
  "src",
  "data",
  "reviewed_ifra_structured_overrides.json"
);

const OFFICIAL_SOURCE_TYPES = new Set([
  "official_ifra_standard_library",
  "official_ifra_standard_pdf",
]);

function loadJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
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

function normalizeCategoryKey(category = "") {
  const text = String(category || "").trim().toLowerCase();
  if (!text) return "";
  return text.replace(/^cat(?:egory)?\.?\s*/i, "");
}

function numericCandidateValue(record = {}) {
  const value = record.normalizedCandidateValue ?? record.candidateValue;
  if (value == null || value === "") return null;
  if (/^no\s+restriction$/i.test(String(value))) return null;
  const numeric = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function findCandidateForProposedRecord(proposedRecord = {}, officialCandidatesFile = {}) {
  const candidateIds = new Set(proposedRecord.candidateIds || []);
  const candidates = officialCandidatesFile.candidates || [];
  return candidates.find((candidate) => candidateIds.has(candidate.id)) || null;
}

function inferSourceType(proposedRecord = {}, officialCandidate = null) {
  if (String(proposedRecord.sourceFile || "").toLowerCase().endsWith(".pdf")) {
    return "official_ifra_standard_pdf";
  }
  if (String(officialCandidate?.officialPdfLocalFile || "").toLowerCase().endsWith(".pdf")) {
    return "official_ifra_standard_pdf";
  }
  return proposedRecord.sourceType || officialCandidate?.sourceType || "";
}

export function buildReviewedIfraStructuredRecord({
  proposedRecord,
  officialCandidate = null,
  reviewStatus,
  reviewNotes = "",
  reviewedAt = new Date().toISOString(),
} = {}) {
  if (!proposedRecord?.id) throw new Error("A proposed record is required.");
  if (reviewStatus !== "reviewed_ok") {
    throw new Error("--review-status must be reviewed_ok for runtime promotion.");
  }
  if (proposedRecord.recordType !== "ifra_category_limit") {
    throw new Error("Only IFRA category-limit proposed records can use this promotion pilot.");
  }
  if (
    !OFFICIAL_SOURCE_TYPES.has(proposedRecord.sourceType) &&
    !OFFICIAL_SOURCE_TYPES.has(officialCandidate?.sourceType)
  ) {
    throw new Error("Promotion pilot only accepts official IFRA standard candidates.");
  }

  const sourceType = inferSourceType(proposedRecord, officialCandidate);
  if (!OFFICIAL_SOURCE_TYPES.has(sourceType)) {
    throw new Error("Promoted record must resolve to an official IFRA source type.");
  }

  const sourceFile =
    proposedRecord.sourceFile ||
    officialCandidate?.officialPdfLocalFile ||
    officialCandidate?.sourceFile ||
    "";
  const sourceUrl =
    proposedRecord.sourceUrl ||
    officialCandidate?.downloadUrl ||
    officialCandidate?.sourceUrl ||
    "";
  if (!sourceUrl || !sourceFile) {
    throw new Error("Promoted record requires source URL and source file provenance.");
  }

  const standardName =
    officialCandidate?.standardTitle ||
    proposedRecord.standardName ||
    proposedRecord.sourceIdentityName ||
    proposedRecord.materialName ||
    "";
  if (!standardName) throw new Error("Promoted record requires a standard/material name.");

  const category = normalizeCategoryKey(proposedRecord.category || "4");
  const value = numericCandidateValue(proposedRecord);
  const categoryLimits = category ? { [category]: value } : {};
  const sourceMaterialNames = uniqueStrings([
    proposedRecord.materialName,
    proposedRecord.sourceIdentityName,
    ...(proposedRecord.formulaMaterialNames || []),
    ...(officialCandidate?.materialNames || []),
    ...(officialCandidate?.sourceIdentityNames || []),
    standardName,
  ]);
  const recordId = `reviewed-ifra-structured-${slugify(
    proposedRecord.materialName || standardName
  )}-${slugify(standardName)}`;

  return {
    id: recordId,
    proposedRecordId: proposedRecord.id,
    standardName,
    materialNames: sourceMaterialNames,
    cas: uniqueStrings(officialCandidate?.cas || []),
    sourceType,
    sourceUrl,
    sourceFile,
    sourceCandidateFile: officialCandidate?.sourceFile || "",
    sourceCandidateIds: proposedRecord.candidateIds || [],
    ifraAmendment:
      String(officialCandidate?.amendment || proposedRecord.ifraAmendment || "").trim(),
    standardType: officialCandidate?.standardType || proposedRecord.standardType || "",
    categoryLimits,
    rawCandidateValue: proposedRecord.candidateValue ?? "",
    rawCandidateUnit: proposedRecord.candidateUnit ?? "",
    sourceSnippet: proposedRecord.sourceSnippet || "",
    reviewedAt,
    reviewedBy: "local_user",
    reviewStatus,
    reviewNotes,
    runtimeUse: "structured_ifra_standard",
    limitations: [
      "Source-backed structured IFRA record",
      "Not launch clearance",
      "Applies only to matched material identity and active load assumptions",
    ],
  };
}

function buildOverridesFile({ existingFile = {}, promotedRecord, reviewedAt }) {
  const existingRecords = Array.isArray(existingFile.records) ? existingFile.records : [];
  const records = [
    ...existingRecords.filter((record) => record.id !== promotedRecord.id),
    promotedRecord,
  ].sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return {
    metadata: {
      ...(existingFile.metadata || {}),
      generatedAt: reviewedAt,
      reportName:
        existingFile.metadata?.reportName || "Reviewed IFRA Structured Overrides",
      guardrails:
        existingFile.metadata?.guardrails || [
          "Reviewed records are runtime structured IFRA data, but not launch clearance.",
          "Promotion is one record at a time after source review.",
          "Do not commit downloaded PDFs or HTML source documents.",
        ],
    },
    summary: {
      recordCount: records.length,
      recordTypeCounts: countBy(records, "runtimeUse"),
      sourceTypeCounts: countBy(records, "sourceType"),
      reviewStatusCounts: countBy(records, "reviewStatus"),
    },
    records,
  };
}

function updateProposedRecordsFile({
  proposedFile = {},
  proposedRecordId,
  promotedRecord,
  reviewStatus,
  reviewNotes,
  reviewedAt,
}) {
  const records = (proposedFile.records || []).map((record) => {
    if (record.id !== proposedRecordId) return record;
    const priorLimitations = (record.limitations || []).filter(
      (limitation) =>
        !/not runtime-active/i.test(limitation) &&
        !/requires review before promotion/i.test(limitation)
    );
    return {
      ...record,
      promotionStatus: "promoted",
      promotedRecordId: promotedRecord.id,
      promotedAt: reviewedAt,
      reviewStatus,
      reviewNotes,
      runtimeUse: "structured_ifra_standard",
      limitations: uniqueStrings([
        ...priorLimitations,
        "Promoted as one reviewed runtime structured IFRA record",
        "Not launch clearance",
      ]),
    };
  });
  return {
    ...proposedFile,
    metadata: {
      ...(proposedFile.metadata || {}),
      lastPromotionAt: reviewedAt,
    },
    summary: {
      ...(proposedFile.summary || {}),
      recordCount: records.length,
      promotionStatusCounts: countBy(records, "promotionStatus"),
      reviewStatusCounts: countBy(records, "reviewStatus"),
    },
    records,
  };
}

export function promoteReviewedIfraStructuredRecord({
  proposedRecordId,
  reviewStatus,
  reviewNotes = "",
  proposedRecordsPath = DEFAULT_PROPOSED_IFRA_STRUCTURED_RECORDS_PATH,
  officialCandidatesPath = DEFAULT_OFFICIAL_IFRA_SOURCE_CANDIDATES_PATH,
  overridesPath = DEFAULT_REVIEWED_IFRA_STRUCTURED_OVERRIDES_PATH,
  reviewedAt = new Date().toISOString(),
  write = true,
} = {}) {
  if (!proposedRecordId) throw new Error("--proposed-record-id is required.");
  const proposedFile = loadJsonIfPresent(proposedRecordsPath);
  if (!proposedFile) throw new Error(`Proposed records file not found: ${proposedRecordsPath}`);
  const proposedRecord = (proposedFile.records || []).find(
    (record) => record.id === proposedRecordId
  );
  if (!proposedRecord) {
    throw new Error(`Proposed record not found: ${proposedRecordId}`);
  }
  const officialCandidatesFile = loadJsonIfPresent(officialCandidatesPath) || {};
  const officialCandidate = findCandidateForProposedRecord(
    proposedRecord,
    officialCandidatesFile
  );
  const promotedRecord = buildReviewedIfraStructuredRecord({
    proposedRecord,
    officialCandidate,
    reviewStatus,
    reviewNotes,
    reviewedAt,
  });
  const existingOverrides = loadJsonIfPresent(overridesPath) || {};
  const overridesFile = buildOverridesFile({
    existingFile: existingOverrides,
    promotedRecord,
    reviewedAt,
  });
  const updatedProposedFile = updateProposedRecordsFile({
    proposedFile,
    proposedRecordId,
    promotedRecord,
    reviewStatus,
    reviewNotes,
    reviewedAt,
  });

  if (write) {
    writeJson(overridesPath, overridesFile);
    writeJson(proposedRecordsPath, updatedProposedFile);
  }

  return {
    promotedRecord,
    overridesFile,
    proposedRecordsFile: updatedProposedFile,
    officialCandidate,
  };
}
