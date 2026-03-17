#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const HELPER_SOURCE_PATH = path.join(
  ROOT,
  "src",
  "lib",
  "ifra_combined_package.js"
);
const CANONICAL_SOURCE_ANCHOR = "const CANONICAL_MATERIAL_SOURCE_DATA = {";
const ALLOWED_PROMOTION_FIELDS = new Set(["scentDesc", "isUVCB", "inci", "cas"]);
const FIELD_ORDER = [
  "canonicalMaterialKey",
  "canonicalName",
  "note",
  "type",
  "cas",
  "inci",
  "scentClass",
  "scentSummary",
  "scentDesc",
  "rep",
  "isUVCB",
  "descriptorTags",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    dryRun: false,
    payloadPath: null,
    helperSourcePath: HELPER_SOURCE_PATH,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--helper-source") {
      options.helperSourcePath = path.resolve(process.cwd(), args[i + 1]);
      i += 1;
      continue;
    }
    if (!options.payloadPath) {
      options.payloadPath = path.resolve(process.cwd(), arg);
    }
  }

  return options;
}

function printUsage() {
  console.error(
    [
      "Usage:",
      "  node scripts/promote_evidence_candidates.mjs <approved-evidence-candidates.json> [--dry-run] [--helper-source path]",
      "",
      "Promotes only approved low-risk evidence candidate fields into canonical helper seeds.",
    ].join("\n")
  );
}

function findMatchingBrace(text, openIndex) {
  let depth = 0;
  let inString = false;
  let stringChar = "";
  let escaping = false;

  for (let i = openIndex; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === "\\") {
        escaping = true;
        continue;
      }
      if (char === stringChar) {
        inString = false;
        stringChar = "";
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      inString = true;
      stringChar = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  throw new Error("Unbalanced braces while parsing helper source.");
}

function extractCanonicalSourceObject(helperSourceText) {
  const anchorIndex = helperSourceText.indexOf(CANONICAL_SOURCE_ANCHOR);
  if (anchorIndex === -1) {
    throw new Error("Could not locate CANONICAL_MATERIAL_SOURCE_DATA.");
  }
  const objectStart = helperSourceText.indexOf("{", anchorIndex);
  const objectEnd = findMatchingBrace(helperSourceText, objectStart);
  const objectText = helperSourceText.slice(objectStart, objectEnd + 1);
  return {
    objectStart,
    objectEnd,
    objectText,
    parsedValue: vm.runInNewContext(`(${objectText})`),
  };
}

function normalizePromotedValue(fieldName, value) {
  if (fieldName === "isUVCB") {
    return typeof value === "boolean" ? value : null;
  }
  const stringValue = String(value ?? "").trim();
  return stringValue || null;
}

function getComparableFieldValue(fieldName, value) {
  if (Array.isArray(value) && value.length === 1) {
    return getComparableFieldValue(fieldName, value[0]);
  }
  if (fieldName === "isUVCB") {
    return typeof value === "boolean" ? value : null;
  }
  if (value == null) return null;
  return String(value).trim();
}

function valuesMatch(fieldName, a, b) {
  return getComparableFieldValue(fieldName, a) === getComparableFieldValue(fieldName, b);
}

function normalizeApprovedEvidenceCandidates(payload) {
  return Array.isArray(payload?.approvedEvidenceCandidates)
    ? payload.approvedEvidenceCandidates
    : [];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findCanonicalMaterialBlock(helperSourceText, canonicalMaterialKey) {
  const pattern = new RegExp(`^  ${escapeRegExp(canonicalMaterialKey)}: \\{`, "m");
  const match = pattern.exec(helperSourceText);
  if (!match) return null;

  const blockStart = match.index;
  const braceStart = helperSourceText.indexOf("{", blockStart);
  const braceEnd = findMatchingBrace(helperSourceText, braceStart);
  const lineEnd = helperSourceText.indexOf("\n", braceEnd);
  const blockEnd = lineEnd === -1 ? helperSourceText.length : lineEnd + 1;

  return {
    blockStart,
    blockEnd,
    blockText: helperSourceText.slice(blockStart, blockEnd),
  };
}

function getTopLevelFieldEntries(blockLines) {
  return blockLines
    .map((line, lineIndex) => {
      const match = line.match(/^    ([A-Za-z0-9_]+):/);
      if (!match) return null;
      return {
        fieldName: match[1],
        lineIndex,
      };
    })
    .filter(Boolean);
}

function renderFieldLines(fieldName, value) {
  if (fieldName === "scentDesc") {
    return [`    ${fieldName}:`, `      ${JSON.stringify(value)},`];
  }
  return [`    ${fieldName}: ${JSON.stringify(value)},`];
}

function upsertFieldInMaterialBlock(blockText, fieldName, candidateValue) {
  const lines = blockText.replace(/\n$/, "").split("\n");
  const fieldEntries = getTopLevelFieldEntries(lines);
  const renderedLines = renderFieldLines(fieldName, candidateValue);
  const existingEntry = fieldEntries.find((entry) => entry.fieldName === fieldName);

  if (existingEntry) {
    const nextEntry = fieldEntries.find(
      (entry) => entry.lineIndex > existingEntry.lineIndex
    );
    const replaceUntil = nextEntry ? nextEntry.lineIndex : lines.length - 1;
    lines.splice(
      existingEntry.lineIndex,
      replaceUntil - existingEntry.lineIndex,
      ...renderedLines
    );
    return `${lines.join("\n")}\n`;
  }

  const targetFieldOrderIndex = FIELD_ORDER.indexOf(fieldName);
  let insertAt = lines.length - 1;
  if (targetFieldOrderIndex !== -1) {
    const nextFieldEntry = fieldEntries.find((entry) => {
      const entryOrderIndex = FIELD_ORDER.indexOf(entry.fieldName);
      return (
        entryOrderIndex !== -1 && entryOrderIndex > targetFieldOrderIndex
      );
    });
    if (nextFieldEntry) {
      insertAt = nextFieldEntry.lineIndex;
    }
  }

  lines.splice(insertAt, 0, ...renderedLines);
  return `${lines.join("\n")}\n`;
}

function buildPreflight(payload, helperSourceText) {
  const canonicalSourceObject = extractCanonicalSourceObject(helperSourceText);
  const helperCanonicalSeeds = canonicalSourceObject.parsedValue || {};
  const approvedRecords = normalizeApprovedEvidenceCandidates(payload);

  const reviewedCandidates = approvedRecords.length;
  const warnings = [];
  const blockingConflicts = [];
  const skippedItems = [];
  const candidateTargets = new Map();

  approvedRecords.forEach((record) => {
    const candidate =
      record?.promotionCandidate || record?.sourceSnapshot || record || {};
    const approvalStatus =
      record?.approvalStatus || candidate?.reviewStatus || "pending_review";
    const evidenceCandidateKey =
      candidate?.evidenceCandidateKey ||
      record?.evidenceCandidateKey ||
      null;
    const candidateFieldName = String(candidate?.candidateFieldName || "").trim();
    const canonicalMaterialKey = String(
      candidate?.canonicalMaterialKey || ""
    ).trim();
    const candidateValue = normalizePromotedValue(
      candidateFieldName,
      candidate?.candidateValue
    );

    if (approvalStatus !== "approved_for_promotion") {
      skippedItems.push({
        evidenceCandidateKey,
        reason: "not_approved_for_promotion",
      });
      return;
    }

    if (!canonicalMaterialKey) {
      blockingConflicts.push({
        evidenceCandidateKey,
        reason: "missing_canonical_material_key",
      });
      return;
    }

    if (!ALLOWED_PROMOTION_FIELDS.has(candidateFieldName)) {
      skippedItems.push({
        evidenceCandidateKey,
        canonicalMaterialKey,
        candidateFieldName,
        reason: "unsupported_field_for_first_promotion_pass",
      });
      return;
    }

    if (candidateValue == null) {
      skippedItems.push({
        evidenceCandidateKey,
        canonicalMaterialKey,
        candidateFieldName,
        reason: "invalid_or_empty_candidate_value",
      });
      return;
    }

    if (!helperCanonicalSeeds[canonicalMaterialKey]) {
      blockingConflicts.push({
        evidenceCandidateKey,
        canonicalMaterialKey,
        candidateFieldName,
        reason: "canonical_material_key_not_found_in_helper_seed_layer",
      });
      return;
    }

    const targetKey = `${canonicalMaterialKey}::${candidateFieldName}`;
    const existingTarget = candidateTargets.get(targetKey);
    const candidateDescriptor = {
      evidenceCandidateKey,
      sourceDocumentKey: candidate?.sourceDocumentKey || null,
      canonicalMaterialKey,
      candidateFieldName,
      candidateValue,
      confidence: candidate?.confidence || null,
      supplier: candidate?.supplier || null,
      sourceType: candidate?.sourceType || null,
      notes: Array.isArray(candidate?.notes) ? [...candidate.notes] : [],
    };

    if (existingTarget) {
      if (!valuesMatch(candidateFieldName, existingTarget.candidateValue, candidateValue)) {
        blockingConflicts.push({
          evidenceCandidateKey,
          canonicalMaterialKey,
          candidateFieldName,
          reason: "conflicting_approved_candidate_values",
          existingEvidenceCandidateKey: existingTarget.evidenceCandidateKey,
        });
        return;
      }
      warnings.push({
        evidenceCandidateKey,
        canonicalMaterialKey,
        candidateFieldName,
        reason: "duplicate_approved_candidate_value",
      });
      return;
    }

    candidateTargets.set(targetKey, candidateDescriptor);
  });

  const plannedItems = [];
  for (const item of candidateTargets.values()) {
    const existingSeed = helperCanonicalSeeds[item.canonicalMaterialKey];
    const currentFieldValue = existingSeed?.[item.candidateFieldName];
    if (valuesMatch(item.candidateFieldName, currentFieldValue, item.candidateValue)) {
      skippedItems.push({
        evidenceCandidateKey: item.evidenceCandidateKey,
        canonicalMaterialKey: item.canonicalMaterialKey,
        candidateFieldName: item.candidateFieldName,
        reason: "helper_seed_already_matches_candidate_value",
      });
      continue;
    }

    if (
      currentFieldValue !== undefined &&
      currentFieldValue !== null &&
      !valuesMatch(item.candidateFieldName, currentFieldValue, item.candidateValue)
    ) {
      blockingConflicts.push({
        evidenceCandidateKey: item.evidenceCandidateKey,
        canonicalMaterialKey: item.canonicalMaterialKey,
        candidateFieldName: item.candidateFieldName,
        reason: "existing_helper_seed_value_conflicts_with_candidate",
        existingValue: currentFieldValue,
      });
      continue;
    }

    plannedItems.push(item);
  }

  return {
    reviewedCandidates,
    promotableCandidates: plannedItems.length,
    canonicalSourceObject,
    plannedItems,
    skippedItems,
    warnings,
    blockingConflicts,
  };
}

function applyPlannedItems(helperSourceText, plannedItems) {
  const groupedByCanonicalKey = plannedItems.reduce((acc, item) => {
    if (!acc[item.canonicalMaterialKey]) acc[item.canonicalMaterialKey] = [];
    acc[item.canonicalMaterialKey].push(item);
    return acc;
  }, {});

  let nextHelperSourceText = helperSourceText;
  const appliedItems = [];

  const blockOrder = Object.keys(groupedByCanonicalKey)
    .map((canonicalMaterialKey) => {
      const block = findCanonicalMaterialBlock(nextHelperSourceText, canonicalMaterialKey);
      if (!block) {
        return null;
      }
      return {
        canonicalMaterialKey,
        blockStart: block.blockStart,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.blockStart - a.blockStart);

  blockOrder.forEach(({ canonicalMaterialKey }) => {
    const block = findCanonicalMaterialBlock(nextHelperSourceText, canonicalMaterialKey);
    if (!block) {
      return;
    }

    let nextBlockText = block.blockText;
    const materialItems = [...groupedByCanonicalKey[canonicalMaterialKey]].sort(
      (a, b) =>
        FIELD_ORDER.indexOf(a.candidateFieldName) -
        FIELD_ORDER.indexOf(b.candidateFieldName)
    );

    materialItems.forEach((item) => {
      nextBlockText = upsertFieldInMaterialBlock(
        nextBlockText,
        item.candidateFieldName,
        item.candidateValue
      );
      appliedItems.push(item);
    });

    nextHelperSourceText =
      nextHelperSourceText.slice(0, block.blockStart) +
      nextBlockText +
      nextHelperSourceText.slice(block.blockEnd);
  });

  return {
    helperSourceText: nextHelperSourceText,
    appliedItems,
  };
}

function main() {
  const { payloadPath, dryRun, helperSourcePath } = parseArgs(process.argv);
  if (!payloadPath) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const payload = readJson(payloadPath);
  const helperSourceText = fs.readFileSync(helperSourcePath, "utf8");
  const preflight = buildPreflight(payload, helperSourceText);

  const summary = {
    mode: dryRun ? "dry_run" : "apply",
    payloadPath,
    helperSourcePath,
    reviewedCandidates: preflight.reviewedCandidates,
    promotableCandidates: preflight.promotableCandidates,
    preflight: {
      safeToApply: preflight.blockingConflicts.length === 0,
      warningCount: preflight.warnings.length,
      blockingConflictCount: preflight.blockingConflicts.length,
    },
    plannedItems: preflight.plannedItems,
    appliedItems: [],
    skippedItems: preflight.skippedItems,
    warnings: preflight.warnings,
    blockingConflicts: preflight.blockingConflicts,
  };

  if (preflight.blockingConflicts.length > 0) {
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = 1;
    return;
  }

  if (dryRun || preflight.plannedItems.length === 0) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const applied = applyPlannedItems(helperSourceText, preflight.plannedItems);
  fs.writeFileSync(helperSourcePath, applied.helperSourceText);
  summary.appliedItems = applied.appliedItems;
  console.log(JSON.stringify(summary, null, 2));
}

main();
