#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const REGISTRY_PATH = path.join(
  ROOT,
  "src",
  "data",
  "supplier_product_registry.json"
);
const REVIEW_QUEUE_PATH = path.join(
  ROOT,
  "src",
  "data",
  "supplier_import_review_queue.json"
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

function getUrlSlug(url) {
  try {
    return new URL(String(url || ""))
      .pathname.replace(/^\/+|\/+$/g, "")
      .replace(/\.html?$/i, "");
  } catch {
    return "";
  }
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

function buildSupplierKey({ supplierKey, supplierName }, registryMetadata) {
  if (supplierKey && registryMetadata.suppliers?.[supplierKey]) {
    return supplierKey;
  }

  const match = Object.entries(registryMetadata.suppliers || {}).find(
    ([, supplier]) => supplier?.displayName === supplierName
  );
  if (match) return match[0];

  return normalizeText(supplierKey || supplierName);
}

function buildSupplierProductKey(product, registryMetadata) {
  const supplierKey = buildSupplierKey(product, registryMetadata);
  const stableIdentifier = normalizeText(product.sku) || getUrlSlug(product.url);
  if (!supplierKey || !stableIdentifier) {
    throw new Error(
      `Unable to build supplier product key for ${product.productTitle || product.url}`
    );
  }
  return `${supplierKey}:${stableIdentifier}`;
}

function upsertProofImport({ manifestPath }) {
  const manifest = readJson(manifestPath);
  const registry = readJson(REGISTRY_PATH);
  const reviewQueue = readJson(REVIEW_QUEUE_PATH);

  let registryUpdates = 0;
  let queueUpdates = 0;

  for (const product of manifest.products || []) {
    const supplierProductKey = buildSupplierProductKey(product, registry.metadata);
    const supplierKey = buildSupplierKey(product, registry.metadata);
    const supplierDisplayName =
      product.supplierName ||
      registry.metadata.suppliers?.[supplierKey]?.displayName ||
      supplierKey;

    const registryRecord = {
      supplierKey,
      supplierDisplayName,
      productTitle: product.productTitle,
      url: product.url,
      urlSlug: getUrlSlug(product.url) || null,
      sku: product.sku || null,
      registryStatus: product.registryStatus || "pending_review",
      mappedCatalogName: product.mappedCatalogName || null,
      mappedCanonicalMaterialKey: product.mappedCanonicalMaterialKey || null,
      mappedEntryKind: product.mappedEntryKind || null,
      normalizationStatus: product.normalizationStatus || "unmapped",
      notes: product.notes || [],
    };

    const previousRegistry = JSON.stringify(registry.products?.[supplierProductKey] || null);
    if (!registry.products) registry.products = {};
    registry.products[supplierProductKey] = registryRecord;
    if (JSON.stringify(registryRecord) !== previousRegistry) {
      registryUpdates += 1;
    }

    if (product.queueItem) {
      const queueRecord = {
        supplierProductKey,
        ...product.queueItem,
      };
      const previousQueue = JSON.stringify(
        reviewQueue.items?.[supplierProductKey] || null
      );
      if (!reviewQueue.items) reviewQueue.items = {};
      reviewQueue.items[supplierProductKey] = queueRecord;
      if (JSON.stringify(queueRecord) !== previousQueue) {
        queueUpdates += 1;
      }
    }
  }

  writeJson(REGISTRY_PATH, {
    metadata: registry.metadata,
    products: sortObject(registry.products || {}),
  });
  writeJson(REVIEW_QUEUE_PATH, {
    metadata: reviewQueue.metadata,
    items: sortObject(reviewQueue.items || {}),
  });

  return {
    manifestPath: path.relative(ROOT, manifestPath),
    importedProducts: (manifest.products || []).length,
    registryUpdates,
    queueUpdates,
  };
}

function main() {
  const manifestPath = path.resolve(
    process.argv[2] || path.join(__dirname, "proof_supplier_import_eden_ylang.json")
  );

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }

  const result = upsertProofImport({ manifestPath });
  console.log(JSON.stringify(result, null, 2));
}

main();
