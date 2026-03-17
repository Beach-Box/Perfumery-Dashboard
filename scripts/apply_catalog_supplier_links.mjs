#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildLiveCatalogNamesFromAppSource } from "../src/lib/catalog_row_draft_preflight.mjs";
import {
  extractPricingObjectFromAppSource,
  validateGeneratedCatalogSupplierLinkApply,
} from "../src/lib/catalog_supplier_link_preflight.mjs";

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
const SUPPLIER_PRODUCT_REGISTRY_PATH = path.join(
  ROOT,
  "src",
  "data",
  "supplier_product_registry.json"
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return raw.toLowerCase();
  }
}

function sortObjectKeys(objectValue) {
  return Object.fromEntries(
    Object.keys(objectValue || {})
      .sort((a, b) => a.localeCompare(b))
      .map((key) => [key, objectValue[key]])
  );
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
      "  node scripts/apply_catalog_supplier_links.mjs <catalog-row-drafts.json> [--dry-run]",
      "",
      "Applies only supplier pricing/link ownership for existing live catalog rows after preflight validation.",
    ].join("\n")
  );
}

function getPricingBounds(appSourceText) {
  const pricingStart = appSourceText.indexOf("const PRICING = {");
  if (pricingStart === -1) {
    throw new Error("Could not locate PRICING section in src/App.jsx.");
  }

  const braceStart = appSourceText.indexOf("{", pricingStart);
  const braceEnd = findMatchingBrace(appSourceText, braceStart);
  if (braceStart === -1 || braceEnd === -1 || braceEnd <= braceStart) {
    throw new Error("Could not determine PRICING object bounds in src/App.jsx.");
  }

  const sectionEnd =
    appSourceText[braceEnd + 1] === ";"
      ? braceEnd + 2
      : braceEnd + 1;

  return {
    pricingStart,
    sectionEnd,
    pricingSection: appSourceText.slice(pricingStart, sectionEnd),
  };
}

function findMatchingBrace(text, startIndex) {
  let depth = 0;
  let inString = false;
  let quoteChar = null;
  let escaping = false;

  for (let i = startIndex; i < text.length; i += 1) {
    const char = text[i];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (inString) {
      if (char === "\\") {
        escaping = true;
      } else if (char === quoteChar) {
        inString = false;
        quoteChar = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quoteChar = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function getBraceDepthAt(text, targetIndex) {
  let depth = 0;
  let inString = false;
  let quoteChar = null;
  let escaping = false;

  for (let i = 0; i < targetIndex; i += 1) {
    const char = text[i];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (inString) {
      if (char === "\\") {
        escaping = true;
      } else if (char === quoteChar) {
        inString = false;
        quoteChar = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quoteChar = char;
      continue;
    }

    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
  }

  return depth;
}

function getTopLevelObjectEntryMatches(objectText) {
  const matches = [];
  const keyPattern = /^\s*(?:"([^"]+)"|([A-Za-z0-9_]+)):\s*\{/gm;
  let match = null;

  while ((match = keyPattern.exec(objectText))) {
    if (getBraceDepthAt(objectText, match.index) !== 1) continue;
    const braceIndex = objectText.indexOf("{", match.index);
    const closingBraceIndex = findMatchingBrace(objectText, braceIndex);
    if (closingBraceIndex === -1) continue;
    matches.push({
      key: match[1] || match[2],
      keyStart: match.index,
      braceIndex,
      closingBraceIndex,
    });
  }

  return matches;
}

function renderSupplierPricingEntry(supplierName, url) {
  return [
    `    ${JSON.stringify(supplierName)}: {`,
    `      url: ${JSON.stringify(url)},`,
    `      S: [],`,
    `    },`,
  ].join("\n");
}

function renderPricingRow(catalogName, supplierEntries) {
  const renderedSuppliers = supplierEntries
    .sort((a, b) => a.supplierName.localeCompare(b.supplierName))
    .map((entry) => renderSupplierPricingEntry(entry.supplierName, entry.url))
    .join("\n");

  return [
    `  ${JSON.stringify(catalogName)}: {`,
    renderedSuppliers,
    `  },`,
  ].join("\n");
}

function insertPricingRow(pricingSection, catalogName, supplierEntries) {
  const objectText = pricingSection.slice("const PRICING = ".length);
  const matches = getTopLevelObjectEntryMatches(objectText);
  const existing = matches.find(
    (match) => normalizeName(match.key) === normalizeName(catalogName)
  );
  if (existing) {
    return {
      pricingSection,
      inserted: false,
      reason: "pricing_row_already_exists",
    };
  }

  const insertionTarget = matches.find(
    (match) => catalogName.localeCompare(match.key) < 0
  );
  const entryText = `${renderPricingRow(catalogName, supplierEntries)}\n`;
  const insertionIndex = insertionTarget
    ? "const PRICING = ".length + insertionTarget.keyStart
    : pricingSection.lastIndexOf("\n};");

  return {
    pricingSection:
      pricingSection.slice(0, insertionIndex) +
      entryText +
      pricingSection.slice(insertionIndex),
    inserted: true,
    reason: insertionTarget ? "inserted_new_pricing_row" : "appended_new_pricing_row",
  };
}

function insertSupplierIntoExistingPricingRow(
  pricingSection,
  catalogName,
  supplierEntry
) {
  const objectText = pricingSection.slice("const PRICING = ".length);
  const matches = getTopLevelObjectEntryMatches(objectText);
  const existing = matches.find(
    (match) => normalizeName(match.key) === normalizeName(catalogName)
  );
  if (!existing) {
    return {
      pricingSection,
      inserted: false,
      reason: "pricing_row_missing",
    };
  }

  const rowText = objectText.slice(existing.keyStart, existing.closingBraceIndex + 1);
  const rowObjectStart = rowText.indexOf("{");
  const innerObjectText = rowText.slice(rowObjectStart + 1, -1);
  const supplierMatches = getTopLevelObjectEntryMatches(`{${innerObjectText}}`).map(
    (match) => ({
      ...match,
      keyStart: match.keyStart - 1,
    })
  );

  const existingSupplier = supplierMatches.find(
    (match) => normalizeName(match.key) === normalizeName(supplierEntry.supplierName)
  );
  if (existingSupplier) {
    return {
      pricingSection,
      inserted: false,
      reason: "supplier_already_exists",
    };
  }

  const supplierInsertionTarget = supplierMatches.find(
    (match) => supplierEntry.supplierName.localeCompare(match.key) < 0
  );
  const supplierText = `${renderSupplierPricingEntry(
    supplierEntry.supplierName,
    supplierEntry.url
  )}\n`;
  const insertionIndex = supplierInsertionTarget
    ? "const PRICING = ".length +
      existing.keyStart +
      rowObjectStart +
      1 +
      supplierInsertionTarget.keyStart
    : "const PRICING = ".length + existing.closingBraceIndex;

  return {
    pricingSection:
      pricingSection.slice(0, insertionIndex) +
      supplierText +
      pricingSection.slice(insertionIndex),
    inserted: true,
    reason: "inserted_supplier_into_existing_row",
  };
}

function buildNormalizationSupplierLinkEntry(registryRecord) {
  return {
    status: "primary_listing",
    note: registryRecord?.url
      ? `Applied from supplier registry ownership for the live catalog row: ${registryRecord.url}`
      : "Applied from supplier registry ownership for the live catalog row.",
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
  const supplierRegistryFile = readJson(SUPPLIER_PRODUCT_REGISTRY_PATH);
  const supplierProductRegistry = supplierRegistryFile.products || {};
  const liveCatalogNames = buildLiveCatalogNamesFromAppSource(appSourceText);
  const pricingData = extractPricingObjectFromAppSource(appSourceText);

  const preflightReport = validateGeneratedCatalogSupplierLinkApply(payload, {
    liveCatalogNames,
    pricingData,
    materialNormalization,
    supplierProductRegistry,
  });

  const summary = {
    mode: dryRun ? "dry_run" : "apply",
    payloadPath,
    files: {
      appSource: APP_SOURCE_PATH,
      materialNormalization: MATERIAL_NORMALIZATION_PATH,
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

  const nextMaterialNormalization = JSON.parse(
    JSON.stringify(materialNormalization)
  );
  const nextPricingData = JSON.parse(JSON.stringify(pricingData));
  const { pricingStart, sectionEnd, pricingSection: initialPricingSection } =
    getPricingBounds(appSourceText);
  let nextPricingSection = initialPricingSection;

  [...catalogRowDrafts]
    .sort((a, b) =>
      String(a?.catalogDisplayName || "").localeCompare(
        String(b?.catalogDisplayName || "")
      )
    )
    .forEach((draft) => {
      const catalogDisplayName =
        draft?.catalogDisplayName || draft?.catalogRowDraft?.displayName || null;
      const validation = validationByName[catalogDisplayName] || null;
      const sourceSupplierProducts = Array.isArray(draft?.sourceSupplierProducts)
        ? draft.sourceSupplierProducts
        : [];

      const itemSummary = {
        catalogDisplayName,
        canonicalMaterialKey:
          draft?.canonicalMaterialKey ||
          draft?.catalogRowDraft?.canonicalMaterialKey ||
          null,
        sourceSupplierProductKeys: sourceSupplierProducts
          .map((item) => item?.supplierProductKey)
          .filter(Boolean),
        warnings: validation?.warnings || [],
        blockingConflicts: validation?.blockingConflicts || [],
      };

      let draftChanged = false;

      sourceSupplierProducts.forEach((product) => {
        const supplierProductKey = product?.supplierProductKey;
        const registryRecord = supplierProductRegistry[supplierProductKey] || null;
        const supplierName =
          registryRecord?.supplierDisplayName || product?.supplierDisplayName;
        const supplierUrl = registryRecord?.url || product?.url || null;

        if (!nextMaterialNormalization[catalogDisplayName]) {
          nextMaterialNormalization[catalogDisplayName] = {};
        }
        if (!nextMaterialNormalization[catalogDisplayName].supplierLinks) {
          nextMaterialNormalization[catalogDisplayName].supplierLinks = {};
        }
        if (!nextMaterialNormalization[catalogDisplayName].supplierLinks[supplierName]) {
          nextMaterialNormalization[catalogDisplayName].supplierLinks[supplierName] =
            buildNormalizationSupplierLinkEntry(registryRecord);
          draftChanged = true;
        }

        if (!nextPricingData[catalogDisplayName]) {
          const insertion = insertPricingRow(nextPricingSection, catalogDisplayName, [
            { supplierName, url: supplierUrl },
          ]);
          nextPricingSection = insertion.pricingSection;
          if (insertion.inserted) {
            if (!nextPricingData[catalogDisplayName]) {
              nextPricingData[catalogDisplayName] = {};
            }
            nextPricingData[catalogDisplayName][supplierName] = {
              url: supplierUrl,
              S: [],
            };
            draftChanged = true;
          }
          return;
        }

        if (!nextPricingData[catalogDisplayName][supplierName]) {
          const insertion = insertSupplierIntoExistingPricingRow(nextPricingSection, catalogDisplayName, {
            supplierName,
            url: supplierUrl,
          });
          nextPricingSection = insertion.pricingSection;
          if (insertion.inserted) {
            nextPricingData[catalogDisplayName][supplierName] = {
              url: supplierUrl,
              S: [],
            };
            draftChanged = true;
          }
        }
      });

      if (!nextMaterialNormalization[catalogDisplayName]) {
        summary.skippedItems.push({
          ...itemSummary,
          reason: "normalization_entry_missing",
        });
        return;
      }

      if (draftChanged) {
        if (dryRun) {
          summary.plannedItems.push(itemSummary);
        } else {
          summary.appliedItems.push(itemSummary);
        }
      } else {
        summary.skippedItems.push({
          ...itemSummary,
          reason: "already_applied_same_way",
        });
      }
    });

  if (!dryRun) {
    const nextAppSource =
      appSourceText.slice(0, pricingStart) +
      nextPricingSection +
      appSourceText.slice(sectionEnd);
    fs.writeFileSync(APP_SOURCE_PATH, nextAppSource);
    writeJson(MATERIAL_NORMALIZATION_PATH, sortObjectKeys(nextMaterialNormalization));
  }

  console.log(JSON.stringify(summary, null, 2));
}

main();
