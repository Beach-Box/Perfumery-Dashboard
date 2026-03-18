#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildLiveCatalogNamesFromAppSource,
  validateGeneratedCatalogRowDraftExport,
} from "../src/lib/catalog_row_draft_preflight.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const APP_SOURCE_PATH = path.join(ROOT, "src", "App.jsx");
const MATERIAL_NORMALIZATION_PATH = path.join(
  ROOT,
  "src",
  "data",
  "material_normalization.json"
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    dryRun: false,
    payloadPath: null,
  };

  args.forEach((arg) => {
    if (arg === "--dry-run") {
      options.dryRun = true;
      return;
    }
    if (!options.payloadPath) {
      options.payloadPath = path.resolve(process.cwd(), arg);
    }
  });

  return options;
}

function printUsage() {
  console.error(
    [
      "Usage:",
      "  node scripts/apply_catalog_row_drafts.mjs <catalog-row-drafts.json> [--dry-run]",
      "",
      "Applies only new live RAW_DB catalog row entries after preflight validation.",
    ].join("\n")
  );
}

function getRawDbBounds(appSourceText) {
  const rawDbStart = appSourceText.indexOf("const RAW_DB = {");
  const fieldsStart = appSourceText.indexOf("\n\nconst FIELDS = [", rawDbStart);
  if (rawDbStart === -1 || fieldsStart === -1 || fieldsStart <= rawDbStart) {
    throw new Error("Could not locate RAW_DB section in src/App.jsx.");
  }
  return {
    rawDbStart,
    fieldsStart,
    rawDbSection: appSourceText.slice(rawDbStart, fieldsStart),
  };
}

function getRawDbEntryMatches(rawDbSection) {
  const keyPattern = /^\s*(?:"([^"]+)"|([A-Za-z0-9_]+)):\s*\[/gm;
  const matches = [];
  let match = null;
  while ((match = keyPattern.exec(rawDbSection))) {
    matches.push({
      key: match[1] || match[2],
      index: match.index,
    });
  }
  return matches;
}

function getScalarHelperValue(value) {
  if (Array.isArray(value)) {
    if (value.length === 1) return value[0];
    return null;
  }
  return value ?? null;
}

function buildDraftRowArray(draft) {
  const helperSource = draft?.canonicalMaterial?.helperSource || {};
  const supplierProducts = Array.isArray(draft?.sourceSupplierProducts)
    ? draft.sourceSupplierProducts
    : [];
  const primarySupplier = draft?.primarySupplierDisplayName ||
    supplierProducts[0]?.supplierDisplayName ||
    null;
  const primaryProductTitle = supplierProducts[0]?.productTitle || null;
  const catalogName =
    draft?.catalogDisplayName || draft?.catalogRowDraft?.displayName || null;

  return [
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    helperSource?.note ?? null,
    helperSource?.type ?? null,
    false,
    primarySupplier,
    helperSource?.scentSummary || primaryProductTitle || catalogName,
    null,
    null,
    getScalarHelperValue(helperSource?.cas),
    getScalarHelperValue(helperSource?.inci),
    helperSource?.scentClass ?? null,
    helperSource?.scentSummary || catalogName,
    helperSource?.scentDesc ||
      `Supplier-product draft seeded from ${
        primarySupplier || "supplier"
      } mapping. Chemistry and IFRA remain manual review steps.`,
    null,
    null,
    null,
    helperSource?.isUVCB ?? null,
    Array.isArray(helperSource?.descriptorTags) &&
    helperSource.descriptorTags.length > 0
      ? helperSource.descriptorTags
      : null,
    null,
    null,
    null,
    null,
  ];
}

function renderRawDbEntry(catalogName, rowValues) {
  const renderedValues = rowValues.map((value, index) => {
    const rendered = JSON.stringify(value);
    return `    ${rendered}${index === rowValues.length - 1 ? "" : ","}`;
  });

  return `  ${JSON.stringify(catalogName)}: [\n${renderedValues.join(
    "\n"
  )}\n  ],\n`;
}

function insertRawDbEntry(rawDbSection, catalogName, entryText) {
  const matches = getRawDbEntryMatches(rawDbSection);
  const existing = matches.find(
    (match) => normalizeName(match.key) === normalizeName(catalogName)
  );
  if (existing) {
    return {
      rawDbSection,
      inserted: false,
      reason: "already_exists",
    };
  }

  const insertionTarget = matches.find(
    (match) => catalogName.localeCompare(match.key) < 0
  );
  const insertionIndex = insertionTarget
    ? insertionTarget.index
    : rawDbSection.lastIndexOf("\n};");

  if (insertionIndex === -1) {
    throw new Error("Could not locate RAW_DB insertion point.");
  }

  return {
    rawDbSection:
      rawDbSection.slice(0, insertionIndex) +
      entryText +
      rawDbSection.slice(insertionIndex),
    inserted: true,
    reason: insertionTarget ? "inserted_before_existing" : "appended_before_close",
  };
}

function main() {
  const { payloadPath, dryRun } = parseArgs(process.argv);
  if (!payloadPath) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const payload = readJson(payloadPath);
  const catalogRowDrafts = Array.isArray(payload?.catalogRowDrafts)
    ? payload.catalogRowDrafts
    : [];
  const appSourceText = fs.readFileSync(APP_SOURCE_PATH, "utf8");
  const materialNormalization = readJson(MATERIAL_NORMALIZATION_PATH);
  const liveCatalogNames = buildLiveCatalogNamesFromAppSource(appSourceText);

  const preflightReport = validateGeneratedCatalogRowDraftExport(payload, {
    liveCatalogNames,
    materialNormalization,
  });

  const summary = {
    mode: dryRun ? "dry_run" : "apply",
    payloadPath,
    files: {
      appSource: APP_SOURCE_PATH,
    },
    preflight: preflightReport.summary,
    validationResults: preflightReport.drafts,
    plannedItems: [],
    appliedItems: [],
    skippedItems: [],
    warnings: preflightReport.drafts.flatMap((draft) =>
      draft.warnings.map((issue) => ({
        catalogDisplayName: draft.catalogDisplayName,
        ...issue,
      }))
    ),
    blockingConflicts: preflightReport.drafts.flatMap((draft) =>
      draft.blockingConflicts.map((issue) => ({
        catalogDisplayName: draft.catalogDisplayName,
        ...issue,
      }))
    ),
  };

  if (preflightReport.summary.blockingConflictCount > 0) {
    summary.skippedItems = catalogRowDrafts.map((draft) => ({
      catalogDisplayName:
        draft?.catalogDisplayName || draft?.catalogRowDraft?.displayName || null,
      reason: "blocking_conflicts",
    }));
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = 1;
    return;
  }

  const validationByName = Object.fromEntries(
    preflightReport.drafts.map((draft) => [draft.catalogDisplayName, draft])
  );

  const { rawDbStart, fieldsStart, rawDbSection: initialRawDbSection } =
    getRawDbBounds(appSourceText);
  let nextRawDbSection = initialRawDbSection;

  const draftsToApply = [...catalogRowDrafts].sort((a, b) =>
    String(a?.catalogDisplayName || "").localeCompare(
      String(b?.catalogDisplayName || "")
    )
  );

  draftsToApply.forEach((draft) => {
    const catalogDisplayName =
      draft?.catalogDisplayName || draft?.catalogRowDraft?.displayName || null;
    const validation = validationByName[catalogDisplayName] || null;
    const rowValues = buildDraftRowArray(draft);
    const entryText = renderRawDbEntry(catalogDisplayName, rowValues);
    const insertion = insertRawDbEntry(
      nextRawDbSection,
      catalogDisplayName,
      entryText
    );

    const itemSummary = {
      catalogDisplayName,
      entryKind: draft?.entryKind || draft?.catalogRowDraft?.entryKind || null,
      canonicalMaterialKey:
        draft?.canonicalMaterialKey ||
        draft?.catalogRowDraft?.canonicalMaterialKey ||
        null,
      sourceSupplierProductKeys: Array.isArray(draft?.sourceSupplierProducts)
        ? draft.sourceSupplierProducts.map((item) => item?.supplierProductKey).filter(Boolean)
        : [],
      warnings: validation?.warnings || [],
      blockingConflicts: validation?.blockingConflicts || [],
    };

    if (!insertion.inserted) {
      summary.skippedItems.push({
        ...itemSummary,
        reason: insertion.reason,
      });
      return;
    }

    nextRawDbSection = insertion.rawDbSection;

    if (dryRun) {
      summary.plannedItems.push(itemSummary);
    } else {
      summary.appliedItems.push(itemSummary);
    }
  });

  if (!dryRun) {
    const nextAppSource =
      appSourceText.slice(0, rawDbStart) +
      nextRawDbSection +
      appSourceText.slice(fieldsStart);
    fs.writeFileSync(APP_SOURCE_PATH, nextAppSource);
  }

  console.log(JSON.stringify(summary, null, 2));
}

main();
