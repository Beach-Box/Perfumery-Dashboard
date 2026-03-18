#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_DOCUMENT_REGISTRY_PATH = path.join(
  ROOT,
  "src",
  "data",
  "source_document_registry.json"
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
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function buildSourceDocumentKey(document) {
  if (document.sourceDocumentKey) {
    return document.sourceDocumentKey;
  }

  const identityBase =
    normalizeText(document.canonicalMaterialKey) ||
    normalizeText((document.relatedCatalogNames || [])[0]) ||
    normalizeText(document.supplier) ||
    "unlinked";
  const sourceType = normalizeText(document.sourceType);
  const sourceIdentity =
    normalizeText(document.sourceIdentifier) ||
    normalizeText(path.basename(String(document.sourcePath || "")));

  if (!sourceType || !sourceIdentity) {
    return null;
  }

  return `${identityBase}:${sourceType}:${sourceIdentity}`;
}

function buildDocumentRecord(document) {
  const relatedCatalogNames = uniqueStrings(document.relatedCatalogNames);

  return {
    sourceType: document.sourceType,
    supplier: document.supplier || null,
    sourceIdentifier: document.sourceIdentifier || null,
    sourcePath: document.sourcePath || null,
    canonicalMaterialKey: document.canonicalMaterialKey || null,
    relatedCatalogNames,
    documentStatus: document.documentStatus || "registered",
    reviewStatus: document.reviewStatus || "ingested_pending_extraction",
    notes: Array.isArray(document.notes) ? document.notes : [],
  };
}

function updateIntakeTarget(registry, documentKey, documentRecord) {
  const canonicalMaterialKey = documentRecord.canonicalMaterialKey;
  if (!canonicalMaterialKey) return false;

  const existingTarget = registry.intakeTargets?.[canonicalMaterialKey];
  if (!existingTarget) return false;

  const linkedSourceDocumentKeys = uniqueStrings([
    ...(existingTarget.linkedSourceDocumentKeys || []),
    documentKey,
  ]);

  const nextStatus =
    existingTarget.reviewStatus === "awaiting_source_document"
      ? "ingested_pending_extraction"
      : existingTarget.reviewStatus || "ingested_pending_extraction";

  const nextTarget = {
    ...existingTarget,
    reviewStatus: nextStatus,
    linkedSourceDocumentKeys,
  };

  const changed =
    JSON.stringify(existingTarget) !== JSON.stringify(nextTarget);
  if (changed) {
    registry.intakeTargets[canonicalMaterialKey] = nextTarget;
  }
  return changed;
}

function importSourceDocuments({ manifestPath, dryRun = false }) {
  const manifest = readJson(manifestPath);
  const registry = readJson(SOURCE_DOCUMENT_REGISTRY_PATH);
  const acceptedSourceTypes = new Set(registry.metadata?.acceptedSourceTypes || []);

  const plannedDocumentKeys = [];
  const skippedDocuments = [];
  let documentUpdates = 0;
  let intakeTargetUpdates = 0;

  for (const document of manifest.documents || []) {
    const sourceType = String(document.sourceType || "").trim();
    const hasSourceLocator =
      Boolean(String(document.sourceIdentifier || "").trim()) ||
      Boolean(String(document.sourcePath || "").trim());
    const hasRelatedTarget =
      Boolean(String(document.canonicalMaterialKey || "").trim()) ||
      uniqueStrings(document.relatedCatalogNames).length > 0;

    if (!sourceType || !acceptedSourceTypes.has(sourceType)) {
      skippedDocuments.push({
        sourceDocumentKey: document.sourceDocumentKey || null,
        reason: "invalid_source_type",
        sourceType,
      });
      continue;
    }

    if (!hasSourceLocator) {
      skippedDocuments.push({
        sourceDocumentKey: document.sourceDocumentKey || null,
        reason: "missing_source_locator",
      });
      continue;
    }

    if (!hasRelatedTarget) {
      skippedDocuments.push({
        sourceDocumentKey: document.sourceDocumentKey || null,
        reason: "missing_related_target",
      });
      continue;
    }

    const sourceDocumentKey = buildSourceDocumentKey(document);
    if (!sourceDocumentKey) {
      skippedDocuments.push({
        sourceDocumentKey: document.sourceDocumentKey || null,
        reason: "unable_to_build_source_document_key",
      });
      continue;
    }

    const documentRecord = buildDocumentRecord(document);
    const previousRecord = JSON.stringify(
      registry.documents?.[sourceDocumentKey] || null
    );

    if (!registry.documents) registry.documents = {};
    registry.documents[sourceDocumentKey] = documentRecord;
    plannedDocumentKeys.push(sourceDocumentKey);

    if (JSON.stringify(documentRecord) !== previousRecord) {
      documentUpdates += 1;
    }

    if (updateIntakeTarget(registry, sourceDocumentKey, documentRecord)) {
      intakeTargetUpdates += 1;
    }
  }

  if (!dryRun) {
    writeJson(SOURCE_DOCUMENT_REGISTRY_PATH, {
      metadata: registry.metadata,
      documents: sortObject(registry.documents || {}),
      intakeTargets: sortObject(registry.intakeTargets || {}),
    });
  }

  return {
    manifestPath: path.relative(ROOT, manifestPath),
    dryRun,
    importedDocuments: plannedDocumentKeys.length,
    documentUpdates,
    intakeTargetUpdates,
    plannedDocumentKeys,
    skippedDocuments,
  };
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const manifestArg = args.find((arg) => arg !== "--dry-run");
  const manifestPath = path.resolve(
    manifestArg || path.join(__dirname, "proof_source_document_import_manifest.json")
  );

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }

  const result = importSourceDocuments({ manifestPath, dryRun });
  console.log(JSON.stringify(result, null, 2));
}

main();
