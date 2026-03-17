#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildLiveCatalogNamesFromAppSource } from "../src/lib/catalog_row_draft_preflight.mjs";
import { extractPricingObjectFromAppSource } from "../src/lib/catalog_supplier_link_preflight.mjs";
import { validateCatalogSupplierPricePayload } from "../src/lib/catalog_supplier_price_preflight.mjs";

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

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUnit(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.toLowerCase() === "ml") return "mL";
  return raw;
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
      "  node scripts/apply_catalog_supplier_prices.mjs <supplier-price-drafts.json> [--dry-run]",
      "",
      "Applies only supplier size/price points for existing supplier-owned live catalog rows after preflight validation.",
    ].join("\n")
  );
}

function findMatchingToken(text, startIndex, openChar, closeChar) {
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

    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function getPricingBounds(appSourceText) {
  const pricingStart = appSourceText.indexOf("const PRICING = {");
  if (pricingStart === -1) {
    throw new Error("Could not locate PRICING section in src/App.jsx.");
  }

  const braceStart = appSourceText.indexOf("{", pricingStart);
  const braceEnd = findMatchingToken(appSourceText, braceStart, "{", "}");
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
    const closingBraceIndex = findMatchingToken(objectText, braceIndex, "{", "}");
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

function findSupplierSArrayBounds(pricingSection, catalogDisplayName, supplierName) {
  const objectText = pricingSection.slice("const PRICING = ".length);
  const rowMatches = getTopLevelObjectEntryMatches(objectText);
  const rowMatch = rowMatches.find(
    (match) => normalizeName(match.key) === normalizeName(catalogDisplayName)
  );
  if (!rowMatch) {
    throw new Error(`Could not locate PRICING row for "${catalogDisplayName}".`);
  }

  const rowText = objectText.slice(rowMatch.keyStart, rowMatch.closingBraceIndex + 1);
  const rowObjectStart = rowText.indexOf("{");
  const rowInnerText = rowText.slice(rowObjectStart + 1, -1);
  const supplierMatches = getTopLevelObjectEntryMatches(`{${rowInnerText}}`).map(
    (match) => ({
      ...match,
      keyStart: match.keyStart - 1,
      closingBraceIndex: match.closingBraceIndex - 1,
    })
  );
  const supplierMatch = supplierMatches.find(
    (match) => normalizeName(match.key) === normalizeName(supplierName)
  );
  if (!supplierMatch) {
    throw new Error(
      `Could not locate supplier "${supplierName}" inside PRICING row "${catalogDisplayName}".`
    );
  }

  const supplierAbsoluteStart =
    "const PRICING = ".length + rowMatch.keyStart + rowObjectStart + 1 + supplierMatch.keyStart;
  const supplierAbsoluteEnd =
    "const PRICING = ".length +
    rowMatch.keyStart +
    rowObjectStart +
    1 +
    supplierMatch.closingBraceIndex;
  const supplierText = objectText.slice(supplierAbsoluteStart, supplierAbsoluteEnd + 1);
  const sFieldIndex = supplierText.indexOf("S:");
  if (sFieldIndex === -1) {
    throw new Error(
      `Could not locate S array for supplier "${supplierName}" on "${catalogDisplayName}".`
    );
  }

  const arrayStart = supplierText.indexOf("[", sFieldIndex);
  const arrayEnd = findMatchingToken(supplierText, arrayStart, "[", "]");
  if (arrayStart === -1 || arrayEnd === -1 || arrayEnd <= arrayStart) {
    throw new Error(
      `Could not determine S array bounds for supplier "${supplierName}" on "${catalogDisplayName}".`
    );
  }

  return {
    absoluteArrayStart: supplierAbsoluteStart + arrayStart,
    absoluteArrayEnd: supplierAbsoluteStart + arrayEnd,
  };
}

function sortPricePoints(points) {
  return [...points].sort((a, b) => {
    const unitA = normalizeUnit(a[1]) || "";
    const unitB = normalizeUnit(b[1]) || "";
    if (unitA !== unitB) return unitA.localeCompare(unitB);
    if (a[0] !== b[0]) return a[0] - b[0];
    return a[2] - b[2];
  });
}

function renderPricePointValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return JSON.stringify(value);
}

function renderPricePointArray(points) {
  if (!points.length) return "[]";
  return [
    "[",
    ...sortPricePoints(points).map(
      (point) =>
        `        [${renderPricePointValue(point[0])}, ${JSON.stringify(
          point[1]
        )}, ${renderPricePointValue(point[2])}],`
    ),
    "      ]",
  ].join("\n");
}

function mergePricePoints(existingPoints, incomingPoints) {
  const merged = [...existingPoints];
  const identityKeys = new Set(
    merged.map((point) => `${point[0]}|${normalizeUnit(point[1])}|${point[2]}`)
  );

  incomingPoints.forEach((point) => {
    const key = `${point[0]}|${normalizeUnit(point[1])}|${point[2]}`;
    if (identityKeys.has(key)) return;
    identityKeys.add(key);
    merged.push([point[0], normalizeUnit(point[1]), point[2]]);
  });

  return sortPricePoints(merged);
}

function main() {
  const { payloadPath, dryRun } = parseArgs(process.argv);
  if (!payloadPath) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const payload = readJson(payloadPath);
  const supplierPriceDrafts = Array.isArray(payload?.supplierPriceDrafts)
    ? payload.supplierPriceDrafts
    : [];
  const appSourceText = fs.readFileSync(APP_SOURCE_PATH, "utf8");
  const materialNormalization = readJson(MATERIAL_NORMALIZATION_PATH);
  const supplierRegistryFile = readJson(SUPPLIER_PRODUCT_REGISTRY_PATH);
  const supplierProductRegistry = supplierRegistryFile.products || {};
  const liveCatalogNames = buildLiveCatalogNamesFromAppSource(appSourceText);
  const pricingData = extractPricingObjectFromAppSource(appSourceText);

  const preflightReport = validateCatalogSupplierPricePayload(payload, {
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
    },
    preflight: preflightReport.summary,
    validationResults: preflightReport.drafts,
    plannedItems: [],
    appliedItems: [],
    skippedItems: [],
    warnings: preflightReport.drafts.flatMap((draft) =>
      draft.warnings.map((issue) => ({
        catalogDisplayName: draft.catalogDisplayName,
        supplierName: draft.supplierName,
        ...issue,
      }))
    ),
    blockingConflicts: preflightReport.drafts.flatMap((draft) =>
      draft.blockingConflicts.map((issue) => ({
        catalogDisplayName: draft.catalogDisplayName,
        supplierName: draft.supplierName,
        ...issue,
      }))
    ),
  };

  if (preflightReport.summary.blockingConflictCount > 0) {
    summary.skippedItems = supplierPriceDrafts.map((draft) => ({
      catalogDisplayName: draft?.catalogDisplayName || null,
      supplierName: draft?.supplierName || null,
      reason: "blocking_conflicts",
    }));
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = 1;
    return;
  }

  const validationByKey = Object.fromEntries(
    preflightReport.drafts.map((draft) => [
      `${draft.catalogDisplayName}||${draft.supplierName}`,
      draft,
    ])
  );

  const nextPricingData = JSON.parse(JSON.stringify(pricingData));
  const { pricingStart, sectionEnd, pricingSection: initialPricingSection } =
    getPricingBounds(appSourceText);
  let nextPricingSection = initialPricingSection;

  [...supplierPriceDrafts]
    .sort((a, b) =>
      String(a?.catalogDisplayName || "").localeCompare(
        String(b?.catalogDisplayName || "")
      ) ||
      String(a?.supplierName || "").localeCompare(String(b?.supplierName || ""))
    )
    .forEach((draft) => {
      const catalogDisplayName = draft?.catalogDisplayName || null;
      const supplierName = draft?.supplierName || null;
      const validation =
        validationByKey[`${catalogDisplayName}||${supplierName}`] || null;
      const normalizedIncomingPoints = validation?.normalizedIncomingPoints || [];
      const existingPoints = Array.isArray(
        nextPricingData?.[catalogDisplayName]?.[supplierName]?.S
      )
        ? nextPricingData[catalogDisplayName][supplierName].S
        : [];
      const mergedPoints = mergePricePoints(existingPoints, normalizedIncomingPoints);

      const itemSummary = {
        catalogDisplayName,
        supplierName,
        supplierProductKey: draft?.supplierProductKey || null,
        addedPricePointCount: Math.max(
          0,
          mergedPoints.length - existingPoints.length
        ),
        warnings: validation?.warnings || [],
        blockingConflicts: validation?.blockingConflicts || [],
      };

      if (normalizedIncomingPoints.length === 0) {
        summary.skippedItems.push({
          ...itemSummary,
          reason: "no_new_price_points",
        });
        return;
      }

      const bounds = findSupplierSArrayBounds(
        nextPricingSection,
        catalogDisplayName,
        supplierName
      );
      const renderedArray = renderPricePointArray(mergedPoints);
      nextPricingSection =
        nextPricingSection.slice(0, bounds.absoluteArrayStart) +
        renderedArray +
        nextPricingSection.slice(bounds.absoluteArrayEnd + 1);
      nextPricingData[catalogDisplayName][supplierName].S = mergedPoints;

      if (dryRun) {
        summary.plannedItems.push(itemSummary);
      } else {
        summary.appliedItems.push(itemSummary);
      }
    });

  if (!dryRun) {
    const nextAppSource =
      appSourceText.slice(0, pricingStart) +
      nextPricingSection +
      appSourceText.slice(sectionEnd);
    fs.writeFileSync(APP_SOURCE_PATH, nextAppSource);
  }

  console.log(JSON.stringify(summary, null, 2));
}

main();
