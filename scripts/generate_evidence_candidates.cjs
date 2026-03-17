#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_SOURCE_DOCUMENT_REGISTRY_PATH = path.join(
  ROOT,
  "src",
  "data",
  "source_document_registry.json"
);
const DEFAULT_EVIDENCE_CANDIDATE_REGISTRY_PATH = path.join(
  ROOT,
  "src",
  "data",
  "evidence_candidate_registry.json"
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => [key, sortObject(value[key])])
  );
}

function uniqueStrings(values) {
  return [
    ...new Set(
      (values || [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    ),
  ];
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let manifestPath = null;
  let dryRun = false;
  let sourceDocumentRegistryPath = DEFAULT_SOURCE_DOCUMENT_REGISTRY_PATH;
  let evidenceCandidateRegistryPath = DEFAULT_EVIDENCE_CANDIDATE_REGISTRY_PATH;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--source-document-registry") {
      sourceDocumentRegistryPath = path.resolve(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--evidence-registry") {
      evidenceCandidateRegistryPath = path.resolve(args[i + 1]);
      i += 1;
      continue;
    }
    if (!manifestPath) {
      manifestPath = path.resolve(arg);
    }
  }

  return {
    manifestPath:
      manifestPath ||
      path.join(__dirname, "proof_evidence_candidate_generation_manifest.json"),
    dryRun,
    sourceDocumentRegistryPath,
    evidenceCandidateRegistryPath,
  };
}

function buildEvidenceCandidateKey(candidate, sourceDocumentRecord) {
  if (candidate.evidenceCandidateKey) {
    return candidate.evidenceCandidateKey;
  }

  const canonicalMaterialKey =
    normalizeText(candidate.canonicalMaterialKey) ||
    normalizeText(sourceDocumentRecord?.canonicalMaterialKey);
  const fieldName = normalizeText(candidate.candidateFieldName);
  const sourceDocumentKey = normalizeText(candidate.sourceDocumentKey);

  if (!canonicalMaterialKey || !fieldName || !sourceDocumentKey) {
    return null;
  }

  return `${canonicalMaterialKey}:${fieldName}:${sourceDocumentKey}`;
}

function updateCandidateTarget(evidenceRegistry, candidateRecord) {
  const canonicalMaterialKey = candidateRecord.canonicalMaterialKey;
  if (!canonicalMaterialKey) return false;

  const existingTarget = evidenceRegistry.candidateTargets?.[canonicalMaterialKey];
  if (!existingTarget) return false;

  const linkedEvidenceCandidateKeys = uniqueStrings([
    ...(existingTarget.linkedEvidenceCandidateKeys || []),
    candidateRecord.evidenceCandidateKey,
  ]);
  const linkedSourceDocumentKeys = uniqueStrings([
    ...(existingTarget.linkedSourceDocumentKeys || []),
    candidateRecord.sourceDocumentKey,
  ]);

  const nextTarget = {
    ...existingTarget,
    reviewStatus:
      existingTarget.reviewStatus === "awaiting_source_document"
        ? "candidate_pending_review"
        : existingTarget.reviewStatus || "candidate_pending_review",
    linkedEvidenceCandidateKeys,
    linkedSourceDocumentKeys,
  };

  const changed =
    JSON.stringify(existingTarget) !== JSON.stringify(nextTarget);
  if (changed) {
    evidenceRegistry.candidateTargets[canonicalMaterialKey] = nextTarget;
  }
  return changed;
}

function buildCandidateRecord(candidate, sourceDocumentRecord, evidenceCandidateKey) {
  return {
    sourceDocumentKey: candidate.sourceDocumentKey,
    canonicalMaterialKey:
      candidate.canonicalMaterialKey ||
      sourceDocumentRecord?.canonicalMaterialKey ||
      null,
    relatedCatalogNames: uniqueStrings([
      ...(sourceDocumentRecord?.relatedCatalogNames || []),
      ...(candidate.relatedCatalogNames || []),
    ]),
    candidateFieldName: candidate.candidateFieldName,
    candidateValue:
      Object.prototype.hasOwnProperty.call(candidate, "candidateValue")
        ? candidate.candidateValue
        : null,
    confidence: candidate.confidence || "medium",
    reviewStatus: candidate.reviewStatus || "candidate_pending_review",
    supplier:
      candidate.supplier ||
      sourceDocumentRecord?.supplier ||
      null,
    sourceType:
      candidate.sourceType ||
      sourceDocumentRecord?.sourceType ||
      null,
    notes: Array.isArray(candidate.notes) ? candidate.notes : [],
    evidenceCandidateKey,
  };
}

function generateEvidenceCandidates({
  manifestPath,
  dryRun = false,
  sourceDocumentRegistryPath = DEFAULT_SOURCE_DOCUMENT_REGISTRY_PATH,
  evidenceCandidateRegistryPath = DEFAULT_EVIDENCE_CANDIDATE_REGISTRY_PATH,
}) {
  const manifest = readJson(manifestPath);
  const sourceDocumentRegistry = readJson(sourceDocumentRegistryPath);
  const evidenceRegistry = readJson(evidenceCandidateRegistryPath);
  const allowedFieldKeys = new Set(
    evidenceRegistry.metadata?.candidateFieldKeys || []
  );

  const plannedCandidateKeys = [];
  const skippedCandidates = [];
  let candidateUpdates = 0;
  let candidateTargetUpdates = 0;

  for (const candidate of manifest.candidates || []) {
    const sourceDocumentKey = String(candidate.sourceDocumentKey || "").trim();
    const candidateFieldName = String(candidate.candidateFieldName || "").trim();

    if (!sourceDocumentKey) {
      skippedCandidates.push({
        evidenceCandidateKey: candidate.evidenceCandidateKey || null,
        reason: "missing_source_document_key",
      });
      continue;
    }

    const sourceDocumentRecord =
      sourceDocumentRegistry.documents?.[sourceDocumentKey] || null;
    if (!sourceDocumentRecord) {
      skippedCandidates.push({
        evidenceCandidateKey: candidate.evidenceCandidateKey || null,
        sourceDocumentKey,
        reason: "source_document_not_found",
      });
      continue;
    }

    if (!candidateFieldName || !allowedFieldKeys.has(candidateFieldName)) {
      skippedCandidates.push({
        evidenceCandidateKey: candidate.evidenceCandidateKey || null,
        sourceDocumentKey,
        candidateFieldName,
        reason: "invalid_candidate_field_name",
      });
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(candidate, "candidateValue")) {
      skippedCandidates.push({
        evidenceCandidateKey: candidate.evidenceCandidateKey || null,
        sourceDocumentKey,
        candidateFieldName,
        reason: "missing_candidate_value",
      });
      continue;
    }

    const manifestCanonicalKey = String(candidate.canonicalMaterialKey || "").trim();
    if (
      manifestCanonicalKey &&
      sourceDocumentRecord?.canonicalMaterialKey &&
      manifestCanonicalKey !== sourceDocumentRecord.canonicalMaterialKey
    ) {
      skippedCandidates.push({
        evidenceCandidateKey: candidate.evidenceCandidateKey || null,
        sourceDocumentKey,
        candidateFieldName,
        reason: "canonical_material_key_mismatch",
      });
      continue;
    }

    const evidenceCandidateKey = buildEvidenceCandidateKey(
      candidate,
      sourceDocumentRecord
    );
    if (!evidenceCandidateKey) {
      skippedCandidates.push({
        evidenceCandidateKey: candidate.evidenceCandidateKey || null,
        sourceDocumentKey,
        candidateFieldName,
        reason: "unable_to_build_evidence_candidate_key",
      });
      continue;
    }

    const candidateRecord = buildCandidateRecord(
      candidate,
      sourceDocumentRecord,
      evidenceCandidateKey
    );
    const previousRecord = JSON.stringify(
      evidenceRegistry.candidates?.[evidenceCandidateKey] || null
    );

    if (!evidenceRegistry.candidates) evidenceRegistry.candidates = {};
    evidenceRegistry.candidates[evidenceCandidateKey] = candidateRecord;
    plannedCandidateKeys.push(evidenceCandidateKey);

    if (JSON.stringify(candidateRecord) !== previousRecord) {
      candidateUpdates += 1;
    }

    if (updateCandidateTarget(evidenceRegistry, candidateRecord)) {
      candidateTargetUpdates += 1;
    }
  }

  if (!dryRun) {
    writeJson(evidenceCandidateRegistryPath, {
      metadata: evidenceRegistry.metadata,
      candidates: sortObject(evidenceRegistry.candidates || {}),
      candidateTargets: sortObject(evidenceRegistry.candidateTargets || {}),
    });
  }

  return {
    manifestPath: path.relative(ROOT, manifestPath),
    dryRun,
    sourceDocumentRegistryPath: path.relative(ROOT, sourceDocumentRegistryPath),
    evidenceCandidateRegistryPath: path.relative(ROOT, evidenceCandidateRegistryPath),
    generatedCandidates: plannedCandidateKeys.length,
    candidateUpdates,
    candidateTargetUpdates,
    plannedCandidateKeys,
    skippedCandidates,
  };
}

function main() {
  const options = parseArgs(process.argv);
  if (!fs.existsSync(options.manifestPath)) {
    throw new Error(`Manifest not found: ${options.manifestPath}`);
  }
  if (!fs.existsSync(options.sourceDocumentRegistryPath)) {
    throw new Error(
      `Source document registry not found: ${options.sourceDocumentRegistryPath}`
    );
  }
  if (!fs.existsSync(options.evidenceCandidateRegistryPath)) {
    throw new Error(
      `Evidence candidate registry not found: ${options.evidenceCandidateRegistryPath}`
    );
  }

  const result = generateEvidenceCandidates(options);
  console.log(JSON.stringify(result, null, 2));
}

main();
