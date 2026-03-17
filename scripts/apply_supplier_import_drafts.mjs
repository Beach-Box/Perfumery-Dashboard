#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateApprovedSupplierDraftExport } from "../src/lib/supplier_import_preflight.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const MATERIAL_NORMALIZATION_PATH = path.join(
  ROOT,
  "src",
  "data",
  "material_normalization.json"
);
const SUPPLIER_PRODUCT_REGISTRY_PATH = path.join(
  ROOT,
  "src",
  "data",
  "supplier_product_registry.json"
);
const APP_SOURCE_PATH = path.join(ROOT, "src", "App.jsx");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function getUrlSlug(value) {
  try {
    return new URL(String(value || ""))
      .pathname.replace(/^\/+|\/+$/g, "")
      .replace(/\.html?$/i, "")
      .trim()
      .toLowerCase();
  } catch {
    return null;
  }
}

function humanizeSupplierKey(value) {
  return String(value || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dedupeNotes(notes) {
  return [...new Set((notes || []).filter(Boolean))];
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sortTopLevelObject(objectValue) {
  return Object.fromEntries(
    Object.keys(objectValue || {})
      .sort((a, b) => a.localeCompare(b))
      .map((key) => [key, objectValue[key]])
  );
}

function buildCatalogNamesFromRepo({
  appSourceText,
  materialNormalization,
  supplierProductRegistry,
}) {
  const catalogNames = new Set([
    ...Object.keys(materialNormalization || {}),
    ...Object.values(supplierProductRegistry || {})
      .map((record) => record?.mappedCatalogName)
      .filter(Boolean),
  ]);

  const rawDbStart = appSourceText.indexOf("const RAW_DB = {");
  const rawDbEnd = appSourceText.indexOf("const PRICING = {");
  if (rawDbStart !== -1 && rawDbEnd > rawDbStart) {
    const rawDbSection = appSourceText.slice(rawDbStart, rawDbEnd);
    const keyPattern = /^\s*(?:"([^"]+)"|([A-Za-z0-9_]+)):\s*\[/gm;
    let match = null;
    while ((match = keyPattern.exec(rawDbSection))) {
      const key = match[1] || match[2];
      if (key) catalogNames.add(key);
    }
  }

  return [...catalogNames];
}

function getSingleNormalizationDraft(draft) {
  const normalizationEntryDraft = draft?.normalizationEntryDraft || null;
  if (!normalizationEntryDraft) return { key: null, value: null };
  const keys = Object.keys(normalizationEntryDraft);
  if (keys.length !== 1) return { key: null, value: null };
  return {
    key: keys[0],
    value: normalizationEntryDraft[keys[0]],
  };
}

function buildAppliedRegistryRecord(existingRecord, draft, appliedAt) {
  const sourceSnapshot = draft?.sourceSnapshot || {};
  const rowDraft = draft?.supplierProductRowDraft || {};
  const supplierProductKey =
    draft?.supplierProductKey || sourceSnapshot?.supplierProductKey || null;
  const supplierKey =
    existingRecord?.supplierKey ||
    String(supplierProductKey || "").split(":")[0] ||
    null;

  return {
    supplierKey,
    supplierDisplayName:
      existingRecord?.supplierDisplayName ||
      rowDraft?.supplierDisplayName ||
      sourceSnapshot?.supplier ||
      humanizeSupplierKey(supplierKey),
    productTitle:
      existingRecord?.productTitle ||
      rowDraft?.productTitle ||
      sourceSnapshot?.productTitle ||
      null,
    url: existingRecord?.url || rowDraft?.url || sourceSnapshot?.url || null,
    urlSlug:
      existingRecord?.urlSlug ||
      getUrlSlug(existingRecord?.url || rowDraft?.url || sourceSnapshot?.url),
    sku: existingRecord?.sku ?? null,
    registryStatus:
      existingRecord?.registryStatus === "mapped_to_catalog"
        ? existingRecord.registryStatus
        : "approved_draft_applied",
    mappedCatalogName:
      rowDraft?.catalogName ||
      sourceSnapshot?.proposedCatalogName ||
      existingRecord?.mappedCatalogName ||
      null,
    mappedCanonicalMaterialKey:
      rowDraft?.canonicalMaterialKey ??
      sourceSnapshot?.proposedCanonicalMaterialKey ??
      existingRecord?.mappedCanonicalMaterialKey ??
      null,
    mappedEntryKind:
      rowDraft?.entryKind ??
      sourceSnapshot?.proposedEntryKind ??
      existingRecord?.mappedEntryKind ??
      null,
    normalizationStatus:
      existingRecord?.normalizationStatus === "mapped"
        ? existingRecord.normalizationStatus
        : "draft_applied_pending_catalog_row",
    approvalState:
      existingRecord?.approvalState || "approved_draft_applied",
    approvalAppliedAt: existingRecord?.approvalAppliedAt || appliedAt,
    notes: dedupeNotes([
      ...(existingRecord?.notes || []),
      "Applied from approved supplier discovery draft export. Mapping only; canonical chemistry and IFRA remain manual review steps.",
    ]),
  };
}

function buildAppliedNormalizationEntry(existingEntry, draft, appliedAt) {
  const { value: draftEntry } = getSingleNormalizationDraft(draft);
  if (!draftEntry) return null;
  if (existingEntry) return existingEntry;

  return {
    ...draftEntry,
    approvalState: "approved_draft_applied",
    approvalAppliedAt: appliedAt,
  };
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
      "  node scripts/apply_supplier_import_drafts.mjs <approved-drafts.json> [--dry-run]",
      "",
      "Applies only supplier registry and normalization-layer updates after preflight validation.",
    ].join("\n")
  );
}

function main() {
  const { payloadPath, dryRun } = parseArgs(process.argv);
  if (!payloadPath) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const payload = readJson(payloadPath);
  const approvedDrafts = payload?.approvedDrafts || [];
  const materialNormalization = readJson(MATERIAL_NORMALIZATION_PATH);
  const supplierProductRegistryFile = readJson(SUPPLIER_PRODUCT_REGISTRY_PATH);
  const supplierProductRegistry = supplierProductRegistryFile.products || {};
  const appSourceText = fs.readFileSync(APP_SOURCE_PATH, "utf8");
  const catalogNames = buildCatalogNamesFromRepo({
    appSourceText,
    materialNormalization,
    supplierProductRegistry,
  });

  const preflightReport = validateApprovedSupplierDraftExport(payload, {
    catalogNames,
    materialNormalization,
    supplierProductRegistry,
  });

  const summary = {
    mode: dryRun ? "dry_run" : "apply",
    payloadPath,
    files: {
      materialNormalization: MATERIAL_NORMALIZATION_PATH,
      supplierProductRegistry: SUPPLIER_PRODUCT_REGISTRY_PATH,
    },
    preflight: preflightReport.summary,
    validationResults: preflightReport.drafts,
    appliedItems: [],
    plannedItems: [],
    skippedItems: [],
  };

  if (preflightReport.summary.blockingConflictCount > 0) {
    summary.skippedItems = approvedDrafts.map((draft) => ({
      supplierProductKey: draft?.supplierProductKey || null,
      reason: "blocking_conflicts",
    }));
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = 1;
    return;
  }

  const nextMaterialNormalization = { ...materialNormalization };
  const nextSupplierRegistryProducts = {
    ...supplierProductRegistry,
  };
  const appliedAt = new Date().toISOString();

  approvedDrafts.forEach((draft) => {
    const draftReport = preflightReport.drafts.find(
      (item) => item.supplierProductKey === draft?.supplierProductKey
    );
    const { key: normalizationKey, value: normalizationDraftValue } =
      getSingleNormalizationDraft(draft);

    if (!draft?.supplierProductRowDraft || !normalizationKey || !normalizationDraftValue) {
      summary.skippedItems.push({
        supplierProductKey: draft?.supplierProductKey || null,
        reason: "missing_applyable_draft_data",
      });
      return;
    }

    const currentRegistryRecord =
      nextSupplierRegistryProducts[draft.supplierProductKey] || null;
    const nextRegistryRecord = buildAppliedRegistryRecord(
      currentRegistryRecord,
      draft,
      appliedAt
    );

    const currentNormalizationEntry =
      nextMaterialNormalization[normalizationKey] || null;
    const nextNormalizationEntry = buildAppliedNormalizationEntry(
      currentNormalizationEntry,
      draft,
      appliedAt
    );

    const registryWillChange = !deepEqual(currentRegistryRecord, nextRegistryRecord);
    const normalizationWillChange = !deepEqual(
      currentNormalizationEntry,
      nextNormalizationEntry
    );

    const resultItem = {
      supplierProductKey: draft?.supplierProductKey || null,
      proposedCatalogName: draftReport?.proposedCatalogName || normalizationKey,
      status: draftReport?.status || "safe_to_apply",
      warningCount: draftReport?.warnings?.length || 0,
      blockingConflictCount: draftReport?.blockingConflicts?.length || 0,
      registryUpdate: registryWillChange,
      normalizationUpdate: normalizationWillChange,
    };

    if (!registryWillChange && !normalizationWillChange) {
      summary.skippedItems.push({
        supplierProductKey: draft?.supplierProductKey || null,
        reason: "no_changes_needed",
      });
      return;
    }

    if (dryRun) {
      summary.plannedItems.push(resultItem);
      return;
    }

    if (registryWillChange) {
      nextSupplierRegistryProducts[draft.supplierProductKey] = nextRegistryRecord;
    }
    if (normalizationWillChange && nextNormalizationEntry) {
      nextMaterialNormalization[normalizationKey] = nextNormalizationEntry;
    }
    summary.appliedItems.push(resultItem);
  });

  if (!dryRun) {
    writeJson(MATERIAL_NORMALIZATION_PATH, sortTopLevelObject(nextMaterialNormalization));
    writeJson(SUPPLIER_PRODUCT_REGISTRY_PATH, {
      ...supplierProductRegistryFile,
      products: sortTopLevelObject(nextSupplierRegistryProducts),
    });
  }

  console.log(JSON.stringify(summary, null, 2));
}

main();
