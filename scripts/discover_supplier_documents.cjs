#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { pathToFileURL, fileURLToPath } = require("url");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_REGISTRY_PATH = path.join(
  ROOT,
  "src",
  "data",
  "source_document_registry.json"
);
const DEFAULT_DOWNLOAD_DIR = path.join(
  ROOT,
  "downloads",
  "source_documents"
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    manifestPath: null,
    dryRun: false,
    updateRegistry: false,
    download: false,
    delayMs: 250,
    registryPath: DEFAULT_REGISTRY_PATH,
    downloadDir: DEFAULT_DOWNLOAD_DIR,
    reportPath: null,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--update-registry") {
      options.updateRegistry = true;
      continue;
    }
    if (arg === "--download") {
      options.download = true;
      continue;
    }
    if (arg === "--delay-ms") {
      options.delayMs = Number.parseInt(args[i + 1], 10) || 250;
      i += 1;
      continue;
    }
    if (arg === "--registry") {
      options.registryPath = path.resolve(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--download-dir") {
      options.downloadDir = path.resolve(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--report-path") {
      options.reportPath = path.resolve(args[i + 1]);
      i += 1;
      continue;
    }
    if (!options.manifestPath) {
      options.manifestPath = path.resolve(arg);
    }
  }

  if (!options.manifestPath) {
    options.manifestPath = path.join(
      __dirname,
      "proof_supplier_document_discovery_manifest.json"
    );
  }

  return options;
}

function printUsage() {
  console.error(
    [
      "Usage:",
      "  node scripts/discover_supplier_documents.cjs <manifest.json|manifest.csv> [--dry-run] [--update-registry] [--download] [--delay-ms 250] [--registry path] [--download-dir path] [--report-path path]",
      "",
      "Discovers likely SDS/TDS/COA/spec PDF links from supplier product pages and optionally downloads them.",
    ].join("\n")
  );
}

function parseCsv(text) {
  const rows = [];
  let currentField = "";
  let currentRow = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }
      currentRow.push(currentField);
      if (currentRow.some((field) => String(field).trim() !== "")) {
        rows.push(currentRow);
      }
      currentField = "";
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((field) => String(field).trim() !== "")) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function parsePipeList(value) {
  if (Array.isArray(value)) {
    return uniqueStrings(value);
  }
  return uniqueStrings(String(value || "").split("|"));
}

function loadManifest(manifestPath) {
  const ext = path.extname(manifestPath).toLowerCase();
  const manifestDir = path.dirname(manifestPath);

  if (ext === ".csv") {
    const text = fs.readFileSync(manifestPath, "utf8");
    const rows = parseCsv(text);
    const header = rows.shift() || [];
    const products = rows.map((row) => {
      const raw = Object.fromEntries(
        header.map((key, index) => [String(key || "").trim(), row[index] || ""])
      );
      return normalizeManifestProduct(raw, manifestDir);
    });
    return { products };
  }

  const manifest = readJson(manifestPath);
  const products = Array.isArray(manifest)
    ? manifest
    : Array.isArray(manifest.products)
      ? manifest.products
      : [];

  return {
    products: products.map((product) =>
      normalizeManifestProduct(product, manifestDir)
    ),
  };
}

function normalizeManifestProduct(product, manifestDir) {
  const productHtmlPath = String(product.productHtmlPath || "").trim();
  const relatedCatalogNames = parsePipeList(product.relatedCatalogNames);
  const notes = parsePipeList(product.notes);

  return {
    productUrl: String(product.productUrl || "").trim() || null,
    productHtmlPath: productHtmlPath
      ? path.resolve(manifestDir, productHtmlPath)
      : null,
    supplier: String(product.supplier || "").trim() || null,
    canonicalMaterialKey:
      String(product.canonicalMaterialKey || "").trim() || null,
    relatedCatalogNames,
    notes,
  };
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, dec) =>
      String.fromCodePoint(Number.parseInt(dec, 10))
    )
    .replace(/&#x([a-f0-9]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    );
}

function stripTags(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function isPdfLikeUrl(value) {
  return /\.pdf(?:$|[?#])/i.test(String(value || ""));
}

function classifyDocument(anchorText, urlValue) {
  const haystack = `${anchorText || ""} ${urlValue || ""}`.toLowerCase();

  if (/(?:\bsds\b|safety\s+data\s+sheet)/i.test(haystack)) {
    return "sds";
  }
  if (/(?:\btds\b|technical\s+data\s+sheet)/i.test(haystack)) {
    return "tds";
  }
  if (/(?:\bcoa\b|certificate\s+of\s+analysis)/i.test(haystack)) {
    return "coa";
  }
  if (
    /(?:\bspec\b|\bspecification\b|spec\s+sheet|product\s+spec)/i.test(haystack)
  ) {
    return "spec_sheet";
  }
  if (isPdfLikeUrl(urlValue)) {
    return "unknown_pdf";
  }
  return null;
}

const DOC_TYPE_PRIORITY = {
  sds: 5,
  tds: 4,
  coa: 3,
  spec_sheet: 2,
  unknown_pdf: 1,
};

function inferSupplier(productUrl) {
  if (!productUrl) return null;
  try {
    const url = new URL(productUrl);
    return url.hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

function resolveAbsoluteUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

function extractDocumentLinks(html, baseUrl) {
  const anchorPattern =
    /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  const found = new Map();

  let match;
  while ((match = anchorPattern.exec(html))) {
    const href = match[1] || match[2] || match[3] || "";
    if (!href || href.startsWith("#")) continue;
    if (/^(javascript:|mailto:|tel:)/i.test(href)) continue;

    const absoluteUrl = resolveAbsoluteUrl(href, baseUrl);
    if (!absoluteUrl) continue;

    const anchorText = stripTags(match[4] || "");
    const docType = classifyDocument(anchorText, absoluteUrl);
    if (!docType) continue;

    const existing = found.get(absoluteUrl);
    const nextPriority = DOC_TYPE_PRIORITY[docType] || 0;

    if (!existing) {
      found.set(absoluteUrl, {
        absoluteUrl,
        href,
        anchorTexts: anchorText ? [anchorText] : [],
        docType,
      });
      continue;
    }

    existing.anchorTexts = uniqueStrings([
      ...existing.anchorTexts,
      ...(anchorText ? [anchorText] : []),
    ]);

    if ((DOC_TYPE_PRIORITY[existing.docType] || 0) < nextPriority) {
      existing.docType = docType;
    }
  }

  return [...found.values()].sort((a, b) =>
    a.absoluteUrl.localeCompare(b.absoluteUrl)
  );
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "PerfumeryDashboard/1.0 source-document-discovery",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.text();
}

async function loadProductPage(product) {
  if (product.productHtmlPath) {
    if (!fs.existsSync(product.productHtmlPath)) {
      throw new Error(`Local productHtmlPath not found: ${product.productHtmlPath}`);
    }

    const html = fs.readFileSync(product.productHtmlPath, "utf8");
    const baseUrl =
      product.productUrl || pathToFileURL(product.productHtmlPath).href;

    return {
      html,
      baseUrl,
      fetchMode: "local_html_fixture",
    };
  }

  if (!product.productUrl) {
    throw new Error("Missing productUrl");
  }

  return {
    html: await fetchText(product.productUrl),
    baseUrl: product.productUrl,
    fetchMode: "network",
  };
}

function buildSourceDocumentKey(product, doc) {
  const identityBase =
    normalizeText(product.canonicalMaterialKey) ||
    normalizeText(product.relatedCatalogNames[0]) ||
    normalizeText(product.supplier) ||
    normalizeText(product.productUrl) ||
    "unlinked";

  let docIdentity = "";
  try {
    const url = new URL(doc.absoluteUrl);
    docIdentity = normalizeText(`${url.hostname}${url.pathname}`);
  } catch {
    docIdentity = normalizeText(doc.absoluteUrl);
  }

  return `${identityBase}:${doc.docType}:${docIdentity || "document"}`;
}

function buildRegistryDocumentRecord(product, doc, existingRecord, sourcePath) {
  const supplier = product.supplier || inferSupplier(product.productUrl) || null;
  const notes = uniqueStrings([
    ...(existingRecord?.notes || []),
    ...(product.notes || []),
    `Discovered from product page: ${
      product.productUrl || product.productHtmlPath || "unknown_source"
    }`,
    ...(doc.anchorTexts.length
      ? [`Matched anchor text: ${doc.anchorTexts.join(" | ")}`]
      : []),
  ]);

  return {
    sourceType: doc.docType,
    supplier,
    sourceIdentifier: doc.absoluteUrl,
    sourcePath: sourcePath || existingRecord?.sourcePath || null,
    canonicalMaterialKey: product.canonicalMaterialKey || null,
    relatedCatalogNames: uniqueStrings([
      ...(existingRecord?.relatedCatalogNames || []),
      ...(product.relatedCatalogNames || []),
    ]),
    documentStatus: sourcePath
      ? "downloaded_local_pdf"
      : existingRecord?.documentStatus || "discovered_from_product_page",
    reviewStatus:
      existingRecord?.reviewStatus || "ingested_pending_extraction",
    notes,
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

function getDocumentExtension(docUrl) {
  try {
    const url = new URL(docUrl);
    const ext = path.extname(url.pathname || "").toLowerCase();
    return ext || ".pdf";
  } catch {
    return ".pdf";
  }
}

async function copyOrDownloadDocument(docUrl, outputPath) {
  if (/^file:/i.test(docUrl)) {
    const sourcePath = fileURLToPath(docUrl);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.copyFileSync(sourcePath, outputPath);
    return {
      mode: "file_copy",
      contentType: "application/pdf",
    };
  }

  const response = await fetch(docUrl, {
    headers: {
      "user-agent": "PerfumeryDashboard/1.0 source-document-discovery",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
  return {
    mode: "http_download",
    contentType: response.headers.get("content-type") || null,
  };
}

async function discoverSupplierDocuments(options) {
  const manifest = loadManifest(options.manifestPath);
  const registry = readJson(options.registryPath);
  const acceptedSourceTypes = new Set(registry.metadata?.acceptedSourceTypes || []);

  if (options.download && !options.dryRun) {
    fs.mkdirSync(options.downloadDir, { recursive: true });
  }

  const results = [];
  let registryDocumentUpdates = 0;
  let intakeTargetUpdates = 0;
  let downloadedDocumentCount = 0;

  for (let index = 0; index < manifest.products.length; index += 1) {
    const product = manifest.products[index];
    const productLabel =
      product.productUrl ||
      product.productHtmlPath ||
      `product_${index + 1}`;

    if (!product.productUrl && !product.productHtmlPath) {
      results.push({
        productUrl: null,
        productHtmlPath: product.productHtmlPath || null,
        status: "fetch_failed",
        error: "missing_product_url_or_product_html_path",
        discoveredDocuments: [],
      });
      continue;
    }

    try {
      const page = await loadProductPage(product);
      const discoveredDocuments = extractDocumentLinks(page.html, page.baseUrl);
      const status =
        discoveredDocuments.length === 0
          ? "no_doc_found"
          : discoveredDocuments.length === 1
            ? "doc_found"
            : "multiple_docs_found";

      const plannedRegistryWrites = [];

      for (const doc of discoveredDocuments) {
        if (!acceptedSourceTypes.has(doc.docType)) {
          plannedRegistryWrites.push({
            absoluteUrl: doc.absoluteUrl,
            sourceType: doc.docType,
            skipped: true,
            reason: "unaccepted_source_type",
          });
          continue;
        }

        const sourceDocumentKey = buildSourceDocumentKey(product, doc);
        const existingRecord = registry.documents?.[sourceDocumentKey] || null;
        const extension = getDocumentExtension(doc.absoluteUrl);
        const downloadFileName = `${sourceDocumentKey}${extension}`;
        const outputPath = path.join(options.downloadDir, downloadFileName);
        let sourcePath = existingRecord?.sourcePath || null;
        let downloadStatus = options.download ? "download_skipped_dry_run" : null;
        let downloadError = null;

        if (options.download) {
          if (options.dryRun) {
            sourcePath = path.relative(ROOT, outputPath);
          } else {
            try {
              await copyOrDownloadDocument(doc.absoluteUrl, outputPath);
              sourcePath = path.relative(ROOT, outputPath);
              downloadStatus = "downloaded";
              downloadedDocumentCount += 1;
            } catch (error) {
              downloadStatus = "download_failed";
              downloadError = String(error.message || error);
            }
          }
        }

        const documentRecord = buildRegistryDocumentRecord(
          product,
          doc,
          existingRecord,
          sourcePath
        );
        const recordChanged =
          JSON.stringify(existingRecord || null) !== JSON.stringify(documentRecord);

        if (recordChanged) {
          registryDocumentUpdates += 1;
        }

        if (options.updateRegistry) {
          if (!registry.documents) registry.documents = {};
          registry.documents[sourceDocumentKey] = documentRecord;
          if (updateIntakeTarget(registry, sourceDocumentKey, documentRecord)) {
            intakeTargetUpdates += 1;
          }
        }

        plannedRegistryWrites.push({
          sourceDocumentKey,
          sourceType: doc.docType,
          absoluteUrl: doc.absoluteUrl,
          sourcePath: sourcePath || null,
          anchorTexts: doc.anchorTexts,
          recordChanged,
          downloadStatus,
          downloadError,
        });

        if (options.delayMs > 0 && options.download && !options.dryRun) {
          await sleep(options.delayMs);
        }
      }

      results.push({
        productUrl: product.productUrl,
        productHtmlPath: product.productHtmlPath
          ? path.relative(ROOT, product.productHtmlPath)
          : null,
        supplier: product.supplier || inferSupplier(product.productUrl),
        canonicalMaterialKey: product.canonicalMaterialKey,
        relatedCatalogNames: product.relatedCatalogNames,
        fetchMode: page.fetchMode,
        status,
        discoveredDocumentCount: discoveredDocuments.length,
        discoveredDocuments: discoveredDocuments.map((doc) => ({
          sourceType: doc.docType,
          absoluteUrl: doc.absoluteUrl,
          anchorTexts: doc.anchorTexts,
        })),
        plannedRegistryWrites,
      });
    } catch (error) {
      results.push({
        productUrl: product.productUrl,
        productHtmlPath: product.productHtmlPath
          ? path.relative(ROOT, product.productHtmlPath)
          : null,
        supplier: product.supplier || inferSupplier(product.productUrl),
        canonicalMaterialKey: product.canonicalMaterialKey,
        relatedCatalogNames: product.relatedCatalogNames,
        status: "fetch_failed",
        error: String(error.message || error),
        discoveredDocuments: [],
      });
    }

    if (options.delayMs > 0 && index < manifest.products.length - 1) {
      await sleep(options.delayMs);
    }
  }

  if (options.updateRegistry && !options.dryRun) {
    writeJson(options.registryPath, {
      metadata: registry.metadata,
      documents: sortObject(registry.documents || {}),
      intakeTargets: sortObject(registry.intakeTargets || {}),
    });
  }

  const summary = {
    manifestPath: path.relative(ROOT, options.manifestPath),
    registryPath: path.relative(ROOT, options.registryPath),
    dryRun: options.dryRun,
    updateRegistry: options.updateRegistry,
    download: options.download,
    delayMs: options.delayMs,
    productCount: manifest.products.length,
    docFoundCount: results.filter((result) => result.status === "doc_found").length,
    multipleDocsFoundCount: results.filter(
      (result) => result.status === "multiple_docs_found"
    ).length,
    noDocFoundCount: results.filter((result) => result.status === "no_doc_found").length,
    fetchFailedCount: results.filter((result) => result.status === "fetch_failed").length,
    discoveredDocumentCount: results.reduce(
      (sum, result) => sum + (result.discoveredDocumentCount || 0),
      0
    ),
    registryDocumentUpdates,
    intakeTargetUpdates,
    downloadedDocumentCount,
  };

  const report = {
    metadata: {
      version: 1,
      generatedAt: new Date().toISOString(),
      note:
        "Review-only supplier document discovery report. No evidence candidates, helper chemistry, IFRA linkage, or live catalog rows are created automatically.",
    },
    summary,
    results,
  };

  if (options.reportPath) {
    fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
    fs.writeFileSync(options.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  return report;
}

async function main() {
  const options = parseArgs(process.argv);
  if (!fs.existsSync(options.manifestPath)) {
    printUsage();
    throw new Error(`Manifest not found: ${options.manifestPath}`);
  }

  const report = await discoverSupplierDocuments(options);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(String(error.stack || error.message || error));
  process.exitCode = 1;
});
