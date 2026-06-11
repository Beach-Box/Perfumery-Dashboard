import fs from "node:fs";
import path from "node:path";

import { DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH } from "./ifra_source_harvest.mjs";
import {
  DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_PATH,
  loadExistingCandidateIfraReviewQueue,
  updateCandidateIfraReviewStatus,
  writeCandidateIfraReviewQueue,
} from "./candidate_ifra_review_queue.mjs";

const DEFAULT_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);

export const DEFAULT_REVIEWED_IFRA_SOURCE_RECORDS_PATH = path.join(
  DEFAULT_ROOT,
  "data",
  "ifra_source_acquisition",
  "reviewed_ifra_source_records.json"
);

export const PILOT_FCF_MATERIALS = [
  "Bergamot EO FCF",
  "Bergamot FCF",
  "Lemon FCF",
];

export const REVIEWED_IFRA_SOURCE_RECORD_TYPES = ["fcf_phototoxic_note"];

export const REVIEWED_IFRA_FINDINGS = [
  "furocoumarin_free_or_bergapten_free",
];

const COMPATIBLE_CANDIDATE_TYPES_BY_RECORD_TYPE = {
  fcf_phototoxic_note: new Set(["phototoxic_note"]),
};

const HIGH_CONFIDENCE_REVIEW_PRIORITIES = new Set(["high", "medium"]);

const DEFAULT_FCF_LIMITATIONS = [
  "Not launch clearance",
  "Does not create or modify IFRA category limits",
  "Supplier IFRA/SDS still required for final compliance",
];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
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

function loadJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isPilotMaterial(materialName) {
  const normalized = normalizeText(materialName);
  return PILOT_FCF_MATERIALS.some((material) => normalizeText(material) === normalized);
}

function validateRecordType(recordType) {
  if (!REVIEWED_IFRA_SOURCE_RECORD_TYPES.includes(recordType)) {
    throw new Error(
      `Unsupported record type for reviewed promotion pilot: ${recordType}`
    );
  }
}

function validateFinding(finding) {
  if (!REVIEWED_IFRA_FINDINGS.includes(finding)) {
    throw new Error(`Unsupported reviewed finding: ${finding}`);
  }
}

function findCandidate(candidates = [], candidateId) {
  const candidate = candidates.find((item) => item?.id === candidateId);
  if (!candidate) throw new Error(`Candidate not found: ${candidateId}`);
  return candidate;
}

function assertCandidateCompatible(candidate = {}, recordType, allowLowPriority) {
  const compatibleTypes =
    COMPATIBLE_CANDIDATE_TYPES_BY_RECORD_TYPE[recordType] || new Set();
  if (!compatibleTypes.has(candidate.candidateLimitType)) {
    throw new Error(
      `Candidate type ${candidate.candidateLimitType || "unknown"} is not compatible with ${recordType}.`
    );
  }
  if (
    !allowLowPriority &&
    !HIGH_CONFIDENCE_REVIEW_PRIORITIES.has(candidate.reviewPriority)
  ) {
    throw new Error(
      `Candidate reviewPriority ${candidate.reviewPriority || "unknown"} requires --allow-low-priority.`
    );
  }
}

function assertMaterialCompatible({ requestedMaterial, candidate }) {
  if (!isPilotMaterial(requestedMaterial)) {
    throw new Error(
      `Material is outside the FCF promotion pilot: ${requestedMaterial}`
    );
  }

  const requested = normalizeText(requestedMaterial);
  const candidateMaterial = normalizeText(candidate.materialName);
  if (candidateMaterial && requested !== candidateMaterial) {
    const bothBergamotFcf =
      requested.includes("bergamot") &&
      requested.includes("fcf") &&
      candidateMaterial.includes("bergamot") &&
      candidateMaterial.includes("fcf");
    if (!bothBergamotFcf) {
      throw new Error(
        `Candidate material ${candidate.materialName || "unknown"} does not match requested pilot material ${requestedMaterial}.`
      );
    }
  }
}

function makeReviewedSourceRecordId({
  materialName,
  recordType,
  finding,
  candidateId,
} = {}) {
  return [
    "reviewed-ifra-source",
    slugify(materialName),
    slugify(recordType),
    slugify(finding),
    slugify(candidateId).slice(0, 80),
  ].join("-");
}

function normalizeReviewedRecordsFile(recordsFile = {}) {
  const records = Array.isArray(recordsFile?.records) ? recordsFile.records : [];
  return {
    metadata: {
      generatedAt: recordsFile?.metadata?.generatedAt || null,
      reportName:
        recordsFile?.metadata?.reportName || "Reviewed IFRA Source Records",
      scope:
        recordsFile?.metadata?.scope ||
        "Reviewed source-evidence metadata for narrow promotion pilots.",
      guardrails: uniqueStrings([
        ...(recordsFile?.metadata?.guardrails || []),
        "Reviewed source records are evidence metadata only.",
        "They do not add or modify IFRA category limits.",
        "They are not launch clearance.",
      ]),
    },
    records,
  };
}

function buildReviewedSourceRecord({
  candidate,
  materialName,
  recordType,
  finding,
  summary,
  reviewedAt,
  reviewedBy = "local_user",
} = {}) {
  const id = makeReviewedSourceRecordId({
    materialName,
    recordType,
    finding,
    candidateId: candidate.id,
  });
  return {
    id,
    materialName,
    normalizedName: normalizeText(materialName),
    recordType,
    sourceType: candidate.sourceType || "unknown",
    sourceUrl: candidate.sourceUrl || "",
    sourceFile: candidate.sourceFile || "",
    candidateIds: [candidate.id],
    reviewedAt,
    reviewedBy,
    reviewStatus: "reviewed_ok",
    finding,
    summary: summary || "",
    sourceSnippet: candidate.snippet || "",
    runtimeUse: "support_special_case_only",
    limitations: DEFAULT_FCF_LIMITATIONS,
  };
}

function mergeReviewedRecord(records = [], nextRecord) {
  const nextRecords = [...records];
  const existingIndex = nextRecords.findIndex(
    (record) => record.id === nextRecord.id
  );
  if (existingIndex === -1) return [...nextRecords, nextRecord];
  nextRecords[existingIndex] = {
    ...nextRecords[existingIndex],
    ...nextRecord,
    candidateIds: uniqueStrings([
      ...(nextRecords[existingIndex].candidateIds || []),
      ...(nextRecord.candidateIds || []),
    ]),
    limitations: uniqueStrings([
      ...(nextRecords[existingIndex].limitations || []),
      ...DEFAULT_FCF_LIMITATIONS,
    ]),
  };
  return nextRecords;
}

function findExactReviewQueueItem(queue = {}, candidateId) {
  const matches = (queue.items || []).filter((item) =>
    (item.candidateIds || []).includes(candidateId)
  );
  return matches.length === 1 ? matches[0] : null;
}

export function loadReviewedIfraSourceRecords(
  filePath = DEFAULT_REVIEWED_IFRA_SOURCE_RECORDS_PATH
) {
  return normalizeReviewedRecordsFile(loadJsonIfPresent(filePath) || {});
}

export function writeReviewedIfraSourceRecords(filePath, recordsFile) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(recordsFile, null, 2)}\n`);
}

export function promoteReviewedIfraCandidate({
  candidateExtractions,
  reviewedRecordsFile,
  candidateId,
  materialName,
  recordType,
  finding,
  summary,
  allowLowPriority = false,
  reviewedAt = new Date().toISOString(),
  reviewedBy = "local_user",
  candidateReviewQueue = null,
  updateCandidateReviewQueue = true,
} = {}) {
  if (!candidateId) throw new Error("--candidate-id is required.");
  if (!materialName) throw new Error("--material is required.");
  if (!summary) throw new Error("--summary is required.");
  validateRecordType(recordType);
  validateFinding(finding);

  const candidates = Array.isArray(candidateExtractions?.candidates)
    ? candidateExtractions.candidates
    : [];
  const candidate = findCandidate(candidates, candidateId);
  assertCandidateCompatible(candidate, recordType, allowLowPriority);
  assertMaterialCompatible({ requestedMaterial: materialName, candidate });

  const reviewedRecords = normalizeReviewedRecordsFile(reviewedRecordsFile || {});
  const nextRecord = buildReviewedSourceRecord({
    candidate,
    materialName,
    recordType,
    finding,
    summary,
    reviewedAt,
    reviewedBy,
  });
  const nextRecordsFile = {
    ...reviewedRecords,
    metadata: {
      ...reviewedRecords.metadata,
      generatedAt: reviewedRecords.metadata.generatedAt || reviewedAt,
      lastPromotedAt: reviewedAt,
      pilotScope: "fcf_citrus_phototoxic_source_evidence",
    },
    records: mergeReviewedRecord(reviewedRecords.records, nextRecord),
  };

  let nextCandidateReviewQueue = candidateReviewQueue;
  let candidateReviewQueueUpdate = {
    updated: false,
    reason: "Candidate review queue was not supplied.",
    itemId: "",
  };
  if (updateCandidateReviewQueue && candidateReviewQueue) {
    const reviewItem = findExactReviewQueueItem(candidateReviewQueue, candidateId);
    if (reviewItem) {
      const updateResult = updateCandidateIfraReviewStatus({
        queue: candidateReviewQueue,
        id: reviewItem.id,
        reviewStatus: "accepted",
        acceptCandidateIds: [candidateId],
        notes: summary,
        now: reviewedAt,
      });
      nextCandidateReviewQueue = updateResult.queue;
      candidateReviewQueueUpdate = {
        updated: true,
        reason: "Exact candidate review queue item marked accepted.",
        itemId: updateResult.item.id,
      };
    } else {
      candidateReviewQueueUpdate = {
        updated: false,
        reason:
          "No exact single candidate review queue item was found; queue status left unchanged.",
        itemId: "",
      };
    }
  }

  return {
    record: nextRecord,
    recordsFile: nextRecordsFile,
    candidate,
    candidateReviewQueue: nextCandidateReviewQueue,
    candidateReviewQueueUpdate,
    guardrails: [
      "No IFRA category limits were created or modified.",
      "The reviewed record supports FCF special-case evidence only.",
      "This is not launch clearance.",
    ],
  };
}

export function promoteReviewedIfraCandidateFromFiles({
  candidateExtractionsPath = DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH,
  reviewedRecordsPath = DEFAULT_REVIEWED_IFRA_SOURCE_RECORDS_PATH,
  candidateReviewQueuePath = DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_PATH,
  updateReviewQueue = true,
  ...promotionInput
} = {}) {
  const candidateExtractions = loadJsonIfPresent(candidateExtractionsPath);
  if (!candidateExtractions) {
    throw new Error(`Candidate extraction file not found: ${candidateExtractionsPath}`);
  }
  const reviewedRecordsFile = loadReviewedIfraSourceRecords(reviewedRecordsPath);
  const candidateReviewQueue = updateReviewQueue
    ? loadExistingCandidateIfraReviewQueue(candidateReviewQueuePath)
    : null;
  const result = promoteReviewedIfraCandidate({
    candidateExtractions,
    reviewedRecordsFile,
    candidateReviewQueue,
    updateCandidateReviewQueue: updateReviewQueue,
    ...promotionInput,
  });
  writeReviewedIfraSourceRecords(reviewedRecordsPath, result.recordsFile);
  if (updateReviewQueue && result.candidateReviewQueue) {
    writeCandidateIfraReviewQueue(candidateReviewQueuePath, result.candidateReviewQueue);
  }
  return result;
}
