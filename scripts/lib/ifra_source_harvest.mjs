import fs from "node:fs";
import path from "node:path";

import { parseIngredientReferenceCsv } from "../report_hero_ifra_source_gaps.mjs";
import {
  DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH,
  loadExistingHeroIfraSourceQueue,
} from "./hero_ifra_source_acquisition_queue.mjs";
import {
  DEFAULT_IFRA_SOURCE_DOCUMENT_DIR,
  normalizeReviewText,
  slugifyReviewText,
} from "./ifra_source_document_review.mjs";
import {
  buildIfraSourceIdentity,
  stripSourceDilutionTerms,
} from "./ifra_source_identity.mjs";

const DEFAULT_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);

export const EXPECTED_IFRA_51_PDF_PATH =
  "/Users/b.russmacbetch/Downloads/IFRA - 51st Amendment.pdf";

export const DEFAULT_IFRA_51_CACHE_PATH = path.join(
  DEFAULT_IFRA_SOURCE_DOCUMENT_DIR,
  "global",
  "IFRA - 51st Amendment.pdf"
);

export const DEFAULT_INGREDIENT_SOURCE_HARVEST_REPORT_PATH = path.join(
  DEFAULT_ROOT,
  "data",
  "ifra_source_acquisition",
  "ingredient_source_harvest_report.json"
);

export const DEFAULT_INGREDIENT_SOURCE_HARVEST_MARKDOWN_PATH = path.join(
  DEFAULT_ROOT,
  "docs",
  "ifra",
  "ingredient_source_harvest_report.md"
);

export const DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH = path.join(
  DEFAULT_ROOT,
  "data",
  "ifra_source_acquisition",
  "candidate_ifra_source_extractions.json"
);

export const DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_MARKDOWN_PATH = path.join(
  DEFAULT_ROOT,
  "docs",
  "ifra",
  "candidate_ifra_source_extractions.md"
);

export const SOURCE_CACHE_DIRS = {
  fromCsv: path.join(DEFAULT_IFRA_SOURCE_DOCUMENT_DIR, "from_csv"),
  productPages: path.join(DEFAULT_IFRA_SOURCE_DOCUMENT_DIR, "product_pages"),
  sds: path.join(DEFAULT_IFRA_SOURCE_DOCUMENT_DIR, "sds"),
  global: path.join(DEFAULT_IFRA_SOURCE_DOCUMENT_DIR, "global"),
};

const PLACEHOLDER_RE = /^(?:n\/a|na|none|null|not provided|request|-|--|unknown)$/i;
const DOWNLOADABLE_PAGE_TYPES = new Set([
  "product_page",
  "safety_page",
  "identity_reference",
  "unknown",
]);
const REVIEW_SOURCE_TYPES = new Set([
  "supplier_ifra",
  "supplier_sds",
  "supplier_product_page",
  "safety_page",
  "product_page",
]);
const IDENTITY_ONLY_SOURCE_TYPES = new Set(["identity_reference"]);
const SAFETY_SOURCE_KEYWORD_RE =
  /\b(IFRA|Category\s*4|Cat\s*4|Fine fragrance|Maximum use level|Max use|Restriction|SDS|MSDS|Safety Data Sheet|Allergen|Phototoxic|Furocoumarin|Bergapten|FCF|EU\s*1223|conformity|compliance)\b/i;
const STRONG_UNKNOWN_SOURCE_KEYWORD_RE =
  /\b(IFRA|Category\s*4|Cat\s*4|Maximum use level|Max use|Restriction|SDS|MSDS|Safety Data Sheet|Allergen|Phototoxic|Furocoumarin|Bergapten|FCF|EU\s*1223|conformity|compliance)\b/i;
const IDENTITY_KEYWORD_RE =
  /\b(CAS|CAS\s*(?:no|number|#)|Synonym|Synonyms|Chemical Name|Manufacturer|Supplier|FEMA|EINECS|REACH|Product(?:\(s\))?)\b/i;
const NAVIGATION_OR_DIRECTORY_NOISE_RE =
  /\b(Twitter|Instagram|Linkedin|Pinterest|Upcoming Events|Customer Reviews|Write a review|Share Link|Copy link|Add to cart|Customer Service|Shipping Policy|Privacy Policy|Demo Formulas|Blog|Newsletter|View full details|All News|Search Demo Formulas|All Formulas|Navigating IFRA Limits|How to Weigh A Powder|Zero Tariffs)\b/i;

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

function uniqueObjectsBy(items = [], keyFn) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function toRepoRelative(filePath, root = DEFAULT_ROOT) {
  const relative = path.isAbsolute(filePath) ? path.relative(root, filePath) : filePath;
  return relative.split(path.sep).join("/");
}

function isPlaceholder(value) {
  return PLACEHOLDER_RE.test(String(value || "").trim());
}

export function splitSourceUrls(value) {
  if (!value || isPlaceholder(value)) return [];
  return uniqueStrings(
    String(value)
      .split(/[\s;]+/)
      .map((part) => part.trim().replace(/^"|"$/g, ""))
      .filter((part) => /^https?:\/\//i.test(part))
  );
}

export function classifySourceLink({ url = "", sourceField = "" } = {}) {
  const haystack = normalizeReviewText(`${sourceField} ${url}`);
  if (/\bifra\b/.test(haystack) && /\b(cert|certificate|statement|declaration)\b/.test(haystack)) {
    return "supplier_ifra";
  }
  if (/\bsds\b|\bmsds\b|\bsafety data sheet\b/.test(haystack)) {
    return "supplier_sds";
  }
  if (/\bsafety\b|\ballergen\b|\bcompliance\b|\bregulatory\b/.test(haystack)) {
    return "safety_page";
  }
  if (/\b(product|shop|item|sku|catalog|supplier page)\b/.test(haystack)) {
    return "product_page";
  }
  if (/\bgoodscents\b|\bthegoodscentscompany\b|\bidentity\b|\burl\b/.test(haystack)) {
    return "identity_reference";
  }
  return "unknown";
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item?.[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function normalizeCandidateTerms(values = []) {
  return uniqueStrings(values)
    .flatMap((value) => {
      const stripped = stripSourceDilutionTerms(value);
      return [
        stripped,
        String(stripped || "").replace(/^IFRA\s+/i, ""),
        String(stripped || "").replace(/\bSDS\b/gi, ""),
        String(stripped || "").replace(/\bCAS\s+/gi, ""),
        ...buildIfraSourceIdentity(stripped).sourceSearchTerms,
      ];
    })
    .map(normalizeReviewText)
    .filter(Boolean);
}

function buildQueueLookup(queue = {}) {
  return (queue.items || []).map((item) => ({
    item,
    terms: normalizeCandidateTerms([
      item.materialName,
      item.normalizedName,
      item.sourceIdentityName,
      item.activeMaterialName,
      ...(item.sourceSearchTerms || []),
      item.suggestedDocumentName,
      ...(item.sourceRowNames || []),
      ...(item.candidateSearchTerms || []),
    ]),
  }));
}

function buildReferenceRowTerms(row = {}) {
  return normalizeCandidateTerms([
    row.neatIngredients,
    row.ingredient,
    row.name,
    row.cas,
    ...(row.aliases || []),
    ...(row.casNumbers || []),
  ]);
}

function matchCsvRowToQueueItems(row, queueLookup = []) {
  const rowTerms = new Set(buildReferenceRowTerms(row));
  if (!rowTerms.size) return [];
  return queueLookup
    .map(({ item, terms }) => {
      const matchedTerms = terms.filter((term) => rowTerms.has(term));
      return matchedTerms.length
        ? {
            queueItemId: item.id,
            materialName: item.materialName,
            normalizedName: item.normalizedName,
            formulaMaterialName: item.formulaMaterialName || item.materialName,
            sourceIdentityName: item.sourceIdentityName || item.normalizedName || item.materialName,
            activeMaterialName: item.activeMaterialName || item.sourceIdentityName || item.normalizedName,
            dilutionLabel: item.dilutionLabel || "",
            carrierLabel: item.carrierLabel || "",
            requiredSourceType: item.requiredSourceType,
            matchedTerms,
          }
        : null;
    })
    .filter(Boolean);
}

function buildRowLinks(row) {
  const fields = [
    ["SDS Link", row.sdsLink],
    ["Product Page", row.productPage],
    ["Supplier Page", row.supplierPage],
    ["URL", row.goodScentsUrl],
  ];
  return fields.flatMap(([sourceField, value]) =>
    splitSourceUrls(value).map((url) => ({
      sourceField,
      sourceUrl: url,
      sourceType: classifySourceLink({ url, sourceField }),
    }))
  );
}

export function inspectIfra51Pdf({
  expectedPath = EXPECTED_IFRA_51_PDF_PATH,
  cachePath = DEFAULT_IFRA_51_CACHE_PATH,
  copy = false,
  root = DEFAULT_ROOT,
} = {}) {
  const found = fs.existsSync(expectedPath);
  let copied = false;
  if (found && copy) {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.copyFileSync(expectedPath, cachePath);
    copied = true;
  }
  return {
    expectedPath,
    found,
    cachePath: toRepoRelative(cachePath, root),
    copied,
    message: found
      ? copy
        ? "IFRA 51 PDF copied into ignored local source folder."
        : "IFRA 51 PDF found at expected path; run with --download to copy it into the ignored local source folder."
      : "IFRA 51 PDF not found at expected path. User needs to place it in downloads/source_documents/ifra/global/.",
  };
}

function summarizeHarvest({ rows, matchedRows, uniqueLinks, ifra51Pdf }) {
  const activeHeroQueueItemIds = new Set(
    matchedRows.flatMap((row) => row.queueMatches.map((match) => match.queueItemId))
  );
  return {
    csvRowCount: rows.length,
    rowsWithSourceLinks: rows.filter((row) => buildRowLinks(row).length).length,
    matchedCsvRowCount: matchedRows.length,
    activeHeroMatchedQueueItemCount: activeHeroQueueItemIds.size,
    sourceLinkCount: uniqueLinks.length,
    sourceLinkTypeCounts: countBy(uniqueLinks, "sourceType"),
    duplicateUrlCount: matchedRows.reduce(
      (total, row) => total + row.links.length,
      0
    ) - uniqueLinks.length,
    ifra51PdfFound: ifra51Pdf.found,
  };
}

function buildSourceLinkId(url) {
  return `ifra-source-link-${slugifyReviewText(url).slice(0, 96)}`;
}

export function buildIngredientSourceHarvestReport({
  ingredientReferencePath,
  queue = loadExistingHeroIfraSourceQueue(DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH),
  generatedAt = new Date().toISOString(),
  download = false,
  copyIfra51 = false,
  root = DEFAULT_ROOT,
  ifra51ExpectedPath = EXPECTED_IFRA_51_PDF_PATH,
} = {}) {
  if (!ingredientReferencePath) {
    throw new Error("--ingredient-reference is required");
  }
  if (!fs.existsSync(ingredientReferencePath)) {
    throw new Error(`Ingredient reference CSV not found: ${ingredientReferencePath}`);
  }
  const rows = parseIngredientReferenceCsv(
    fs.readFileSync(ingredientReferencePath, "utf8")
  );
  const queueLookup = buildQueueLookup(queue || {});
  const matchedRows = rows
    .map((row) => {
      const queueMatches = matchCsvRowToQueueItems(row, queueLookup);
      const links = buildRowLinks(row);
      return {
        rowNumber: row.rowNumber,
        ingredient: row.ingredient || row.name || row.neatIngredients || "",
        name: row.name || "",
        cas: row.cas || "",
        supplier: row.supplier || "",
        queueMatches,
        links,
      };
    })
    .filter((row) => row.queueMatches.length || row.links.length);

  const uniqueLinks = uniqueObjectsBy(
    matchedRows.flatMap((row) =>
      row.links.map((link) => ({
        id: buildSourceLinkId(link.sourceUrl),
        ...link,
        csvRowNumbers: [row.rowNumber],
        ingredients: [row.ingredient].filter(Boolean),
        suppliers: [row.supplier].filter(Boolean),
        queueItemIds: row.queueMatches.map((match) => match.queueItemId),
        materialNames: row.queueMatches.map((match) => match.materialName),
        sourceIdentityNames: row.queueMatches.map((match) => match.sourceIdentityName),
        downloadStatus: download ? "pending" : "not_requested",
        localPath: "",
        metadataPath: "",
        httpStatus: null,
        contentType: "",
        error: "",
      }))
    ),
    (link) => link.sourceUrl
  ).map((link) => {
    const relatedRows = matchedRows.filter((row) =>
      row.links.some((rowLink) => rowLink.sourceUrl === link.sourceUrl)
    );
    return {
      ...link,
      csvRowNumbers: uniqueStrings(relatedRows.map((row) => row.rowNumber)),
      ingredients: uniqueStrings(relatedRows.map((row) => row.ingredient)),
      suppliers: uniqueStrings(relatedRows.map((row) => row.supplier)),
      queueItemIds: uniqueStrings(
        relatedRows.flatMap((row) => row.queueMatches.map((match) => match.queueItemId))
      ),
      materialNames: uniqueStrings(
        relatedRows.flatMap((row) => row.queueMatches.map((match) => match.materialName))
      ),
      sourceIdentityNames: uniqueStrings(
        relatedRows.flatMap((row) =>
          row.queueMatches.map((match) => match.sourceIdentityName)
        )
      ),
    };
  });

  const ifra51Pdf = inspectIfra51Pdf({
    expectedPath: ifra51ExpectedPath,
    copy: download || copyIfra51,
    root,
  });

  return {
    metadata: {
      generatedAt,
      reportName: "Ingredient Source Harvest Report",
      ingredientReferencePath,
      mode: download ? "download" : copyIfra51 ? "copy_ifra_51" : "dry_run",
      queueItemCount: queue?.items?.length || 0,
      guardrails: [
        "CSV links are source-acquisition aids only.",
        "Downloaded pages/documents and extracted values require human review before structured IFRA promotion.",
        "This report does not update runtime IFRA limits or prove launch clearance.",
      ],
    },
    ifra51Pdf,
    summary: summarizeHarvest({ rows, matchedRows, uniqueLinks, ifra51Pdf }),
    matchedRows,
    sourceLinks: uniqueLinks,
  };
}

function getCacheDirectoryForSourceType(sourceType, sourceDir = DEFAULT_IFRA_SOURCE_DOCUMENT_DIR) {
  if (sourceType === "supplier_sds") return path.join(sourceDir, "sds");
  if (sourceType === "product_page" || sourceType === "safety_page") {
    return path.join(sourceDir, "product_pages");
  }
  return path.join(sourceDir, "from_csv");
}

function chooseCacheExtension({ url, contentType, sourceType }) {
  const pathname = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return "";
    }
  })();
  const urlExtension = path.extname(pathname).toLowerCase();
  if ([".pdf", ".docx", ".xlsx"].includes(urlExtension)) return urlExtension;
  if (/pdf/i.test(contentType)) return ".pdf";
  if (DOWNLOADABLE_PAGE_TYPES.has(sourceType)) return ".html";
  if (/html/i.test(contentType)) return ".html";
  return urlExtension || ".html";
}

function buildCachePathForLink(
  link,
  contentType = "",
  sourceDir = DEFAULT_IFRA_SOURCE_DOCUMENT_DIR
) {
  const directory = getCacheDirectoryForSourceType(link.sourceType, sourceDir);
  const material =
    link.sourceIdentityNames?.[0] ||
    link.materialNames?.[0] ||
    link.ingredients?.[0] ||
    "source";
  const extension = chooseCacheExtension({
    url: link.sourceUrl,
    contentType,
    sourceType: link.sourceType,
  });
  return path.join(
    directory,
    `${slugifyReviewText(`${material}-${link.sourceType}-${link.sourceUrl}`).slice(0, 130)}${extension}`
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildCachedSourceIndex({ sourceDir = DEFAULT_IFRA_SOURCE_DOCUMENT_DIR, root = DEFAULT_ROOT } = {}) {
  const index = new Map();
  for (const metadataPath of walkFiles(sourceDir).filter((filePath) =>
    filePath.endsWith(".metadata.json")
  )) {
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
      if (!metadata.sourceUrl) continue;
      const localPath = (() => {
        if (metadata.localPath && path.isAbsolute(metadata.localPath)) {
          return metadata.localPath;
        }
        if (metadata.localPath) {
          const fromRoot = path.resolve(root, metadata.localPath);
          if (fs.existsSync(fromRoot)) return fromRoot;
        }
        return metadataPath.replace(/\.metadata\.json$/, "");
      })();
      if (!fs.existsSync(localPath)) continue;
      index.set(metadata.sourceUrl, {
        metadata,
        localPath,
        metadataPath,
      });
    } catch {
      // Ignore malformed cache metadata; failed cache inspection should not stop harvesting.
    }
  }
  return index;
}

function buildDownloadFailure(link, reason, httpStatus = null, notes = []) {
  return {
    sourceUrl: link.sourceUrl || "",
    materialName:
      link.materialNames?.[0] || link.ingredients?.[0] || link.materialName || "",
    sourceType: link.sourceType || "unknown",
    reason,
    httpStatus,
    notes,
  };
}

function summarizeDownloadLinks(updatedLinks = [], duplicateUrlCount = 0, downloadFailures = []) {
  const successfulLinks = updatedLinks.filter((link) =>
    ["downloaded", "skipped_cached"].includes(link.downloadStatus)
  );
  return {
    downloadAttemptCount: updatedLinks.length,
    downloadSuccessCount: successfulLinks.length,
    downloadFetchedCount: updatedLinks.filter((link) => link.downloadStatus === "downloaded")
      .length,
    downloadSkippedCachedCount: updatedLinks.filter(
      (link) => link.downloadStatus === "skipped_cached"
    ).length,
    downloadSkippedDuplicateCount:
      duplicateUrlCount +
      updatedLinks.filter((link) => link.downloadStatus === "skipped_duplicate").length,
    downloadFailureCount: downloadFailures.length,
    downloadedByType: countBy(successfulLinks, "sourceType"),
    downloadFailures,
    // Backward-compatible summary fields retained for older reports/readers.
    downloadedLinkCount: successfulLinks.length,
    failedDownloadCount: downloadFailures.length,
  };
}

export async function downloadHarvestSources({
  report,
  fetchImpl = globalThis.fetch,
  rateLimitMs = 350,
  root = DEFAULT_ROOT,
  sourceDir = DEFAULT_IFRA_SOURCE_DOCUMENT_DIR,
} = {}) {
  if (!fetchImpl) throw new Error("No fetch implementation is available.");
  const updatedLinks = [];
  const downloadFailures = [];
  const seenUrls = new Set();
  const cachedSources = buildCachedSourceIndex({ sourceDir, root });
  for (const link of report.sourceLinks || []) {
    if (seenUrls.has(link.sourceUrl)) {
      updatedLinks.push({
        ...link,
        downloadStatus: "skipped_duplicate",
        error: "Duplicate URL already processed in this run.",
      });
      continue;
    }
    seenUrls.add(link.sourceUrl);

    const cached = cachedSources.get(link.sourceUrl);
    if (cached) {
      updatedLinks.push({
        ...link,
        downloadStatus: "skipped_cached",
        httpStatus: cached.metadata.httpStatus ?? null,
        contentType: cached.metadata.contentType || "",
        localPath: toRepoRelative(cached.localPath, root),
        metadataPath: toRepoRelative(cached.metadataPath, root),
        error: "",
      });
      continue;
    }

    try {
      const response = await fetchImpl(link.sourceUrl, {
        headers: {
          "user-agent": "Perfumery-Dashboard source acquisition review bot",
        },
      });
      const contentType = response.headers?.get?.("content-type") || "";
      if (!response.ok) {
        const reason = `HTTP ${response.status}`;
        downloadFailures.push(buildDownloadFailure(link, reason, response.status));
        updatedLinks.push({
          ...link,
          downloadStatus: "failed",
          httpStatus: response.status,
          contentType,
          localPath: "",
          metadataPath: "",
          error: reason,
        });
        if (rateLimitMs > 0) await sleep(rateLimitMs);
        continue;
      }
      const localPath = buildCachePathForLink(link, contentType, sourceDir);
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      const arrayBuffer = await response.arrayBuffer();
      fs.writeFileSync(localPath, Buffer.from(arrayBuffer));
      const metadata = {
        sourceUrl: link.sourceUrl,
        materialName: link.materialNames?.[0] || link.ingredients?.[0] || "",
        materialNames: link.materialNames || [],
        sourceIdentityName:
          link.sourceIdentityNames?.[0] ||
          buildIfraSourceIdentity(link.materialNames?.[0] || link.ingredients?.[0] || "")
            .sourceIdentityName,
        sourceIdentityNames: link.sourceIdentityNames || [],
        queueItemIds: link.queueItemIds || [],
        supplier: link.suppliers?.[0] || "",
        suppliers: link.suppliers || [],
        fetchedAt: new Date().toISOString(),
        httpStatus: response.status,
        contentType,
        localPath: toRepoRelative(localPath, root),
        sourceType: link.sourceType,
      };
      const metadataPath = `${localPath}.metadata.json`;
      fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
      updatedLinks.push({
        ...link,
        downloadStatus: "downloaded",
        httpStatus: response.status,
        contentType,
        localPath: metadata.localPath,
        metadataPath: toRepoRelative(metadataPath, root),
        error: "",
      });
    } catch (error) {
      const reason = error?.message || String(error);
      downloadFailures.push(buildDownloadFailure(link, reason, null, ["Fetch failed; other links continue."]));
      updatedLinks.push({
        ...link,
        downloadStatus: "failed",
        error: reason,
      });
    }
    if (rateLimitMs > 0) await sleep(rateLimitMs);
  }
  const downloadSummary = summarizeDownloadLinks(
    updatedLinks,
    report.summary?.duplicateUrlCount || 0,
    downloadFailures
  );
  return {
    ...report,
    metadata: {
      ...(report.metadata || {}),
      mode: "download",
      downloadedAt: new Date().toISOString(),
    },
    sourceLinks: updatedLinks,
    summary: {
      ...(report.summary || {}),
      ...downloadSummary,
    },
  };
}

function escapeMarkdown(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function formatIngredientSourceHarvestMarkdown(report = {}) {
  const summary = report.summary || {};
  return [
    "# Ingredient Source Harvest Report",
    "",
    `Generated: ${report.metadata?.generatedAt || ""}`,
    "",
    "This is a source-acquisition report only. It does not add IFRA limits, promote data, or prove launch clearance.",
    "",
    "## IFRA 51 PDF",
    "",
    `- Expected path: ${report.ifra51Pdf?.expectedPath || EXPECTED_IFRA_51_PDF_PATH}`,
    `- Found: ${report.ifra51Pdf?.found ? "yes" : "no"}`,
    `- Local ignored cache path: ${report.ifra51Pdf?.cachePath || ""}`,
    `- Note: ${report.ifra51Pdf?.message || ""}`,
    "",
    "## Summary",
    "",
    `- Mode: ${report.metadata?.mode || "dry_run"}`,
    `- CSV rows read: ${summary.csvRowCount || 0}`,
    `- Rows with source links: ${summary.rowsWithSourceLinks || 0}`,
    `- CSV rows matched or carrying links: ${summary.matchedCsvRowCount || 0}`,
    `- Active hero queue items matched: ${summary.activeHeroMatchedQueueItemCount || 0}`,
    `- Unique source links found: ${summary.sourceLinkCount || 0}`,
    `- Duplicate URL references skipped: ${summary.duplicateUrlCount || 0}`,
    `- Download attempts: ${summary.downloadAttemptCount || 0}`,
    `- Download successes or cached hits: ${summary.downloadSuccessCount || summary.downloadedLinkCount || 0}`,
    `- Newly fetched links: ${summary.downloadFetchedCount || 0}`,
    `- Cached links reused: ${summary.downloadSkippedCachedCount || 0}`,
    `- Failed downloads: ${summary.downloadFailureCount || summary.failedDownloadCount || 0}`,
    "",
    "Source link type counts:",
    ...Object.entries(summary.sourceLinkTypeCounts || {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `- ${key}: ${value}`),
    "",
    "Downloaded/cached by source type:",
    ...Object.entries(summary.downloadedByType || {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Download Failures",
    "",
    ...((summary.downloadFailures || []).length
      ? [
          "| Material | Type | HTTP | Reason | URL |",
          "| --- | --- | --- | --- | --- |",
          ...(summary.downloadFailures || []).map((failure) =>
            `| ${[
              failure.materialName,
              failure.sourceType,
              failure.httpStatus ?? "",
              failure.reason,
              failure.sourceUrl,
            ]
              .map(escapeMarkdown)
              .join(" | ")} |`
          ),
        ]
      : ["No download failures recorded."]),
    "",
    "## Source Links",
    "",
    "| Type | Materials | Supplier | URL | Download | Queue items |",
    "| --- | --- | --- | --- | --- | --- |",
    ...(report.sourceLinks || []).map((link) =>
      `| ${[
        link.sourceType,
        (link.materialNames?.length ? link.materialNames : link.ingredients || []).join(", "),
        (link.suppliers || []).join(", "),
        link.sourceUrl,
        link.downloadStatus || "not_requested",
        (link.queueItemIds || []).join(", "),
      ]
        .map(escapeMarkdown)
        .join(" | ")} |`
    ),
  ].join("\n");
}

export function formatIngredientSourceHarvestText(report = {}) {
  const summary = report.summary || {};
  return [
    "Ingredient Source Harvest Report",
    "",
    "This is source acquisition only. It does not add IFRA limits or prove launch clearance.",
    "",
    `IFRA 51 PDF found: ${report.ifra51Pdf?.found ? "yes" : "no"}`,
    `Mode: ${report.metadata?.mode || "dry_run"}`,
    `CSV rows read: ${summary.csvRowCount || 0}`,
    `Active hero queue items matched: ${summary.activeHeroMatchedQueueItemCount || 0}`,
    `Unique source links found: ${summary.sourceLinkCount || 0}`,
    `Download successes or cached hits: ${summary.downloadSuccessCount || summary.downloadedLinkCount || 0}`,
    `Failed downloads: ${summary.downloadFailureCount || summary.failedDownloadCount || 0}`,
    "",
  ].join("\n");
}

export function writeIngredientSourceHarvestReport(filePath, report) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.name.startsWith(".")) return [];
    if (entry.isDirectory()) return walkFiles(filePath);
    if (!entry.isFile()) return [];
    return [filePath];
  });
}

function readMetadataForSource(filePath) {
  const metadataPath = `${filePath}.metadata.json`;
  if (!fs.existsSync(metadataPath)) return null;
  return JSON.parse(fs.readFileSync(metadataPath, "utf8"));
}

function htmlToText(source) {
  return String(source || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function getTextForCandidateExtraction(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (![".html", ".htm", ".txt", ".json"].includes(extension)) return "";
  const source = fs.readFileSync(filePath, "utf8");
  return extension === ".html" || extension === ".htm" ? htmlToText(source) : source;
}

function loadHarvestReportForCandidateLinking(reportPath = DEFAULT_INGREDIENT_SOURCE_HARVEST_REPORT_PATH) {
  if (!fs.existsSync(reportPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch {
    return null;
  }
}

function buildHarvestSourceIndex(harvestReport = null) {
  const index = new Map();
  for (const link of harvestReport?.sourceLinks || []) {
    if (!link.sourceUrl) continue;
    index.set(link.sourceUrl, {
      queueItemIds: uniqueStrings(link.queueItemIds || []),
      materialNames: uniqueStrings(link.materialNames || []),
      sourceIdentityNames: uniqueStrings(link.sourceIdentityNames || []),
    });
  }
  return index;
}

function resolveQueueLinksForMetadata(metadata = {}, { queueLookup = [], harvestSourceIndex = new Map() } = {}) {
  const harvestLink = metadata.sourceUrl ? harvestSourceIndex.get(metadata.sourceUrl) : null;
  const directIds = uniqueStrings([
    ...(metadata.queueItemIds || []),
    ...(harvestLink?.queueItemIds || []),
  ]);
  if (directIds.length) {
    return {
      queueItemIds: directIds,
      ambiguousQueueItemIds: [],
      queueLinkConfidence: "source_metadata",
    };
  }

  const metadataTerms = new Set(
    normalizeCandidateTerms([
      metadata.materialName,
    ...(metadata.materialNames || []),
    metadata.sourceIdentityName,
    ...(metadata.sourceIdentityNames || []),
    ...(harvestLink?.materialNames || []),
    ...(harvestLink?.sourceIdentityNames || []),
  ])
  );
  if (!metadataTerms.size) {
    return {
      queueItemIds: [],
      ambiguousQueueItemIds: [],
      queueLinkConfidence: "none",
    };
  }

  const matches = queueLookup.filter(({ terms }) =>
    terms.some((term) => metadataTerms.has(term))
  );
  if (matches.length === 1) {
    return {
      queueItemIds: [matches[0].item.id],
      ambiguousQueueItemIds: [],
      queueLinkConfidence: "material_exact",
    };
  }
  if (matches.length > 1) {
    return {
      queueItemIds: [],
      ambiguousQueueItemIds: uniqueStrings(matches.map(({ item }) => item.id)),
      queueLinkConfidence: "ambiguous",
    };
  }
  return {
    queueItemIds: [],
    ambiguousQueueItemIds: [],
    queueLinkConfidence: "none",
  };
}

function findKeywordSnippets(text) {
  const keyword =
    /\b(IFRA|IFRA\s*51|IFRA\s*50|Category\s*4|Cat\s*4|Fine fragrance|Maximum use level|Max use|Limit|Restriction|SDS|MSDS|Safety Data Sheet|CAS|Allergen|Phototoxic|Furocoumarin|Bergapten-free|Bergapten|FCF|Synonym|Synonyms|Chemical Name|Manufacturer|Supplier)\b/gi;
  const snippets = [];
  let match;
  let lastSnippetEnd = -1;
  while ((match = keyword.exec(text))) {
    const start = Math.max(0, match.index - 140);
    const end = Math.min(text.length, match.index + 220);
    if (start <= lastSnippetEnd) continue;
    snippets.push(text.slice(start, end).replace(/\s+/g, " ").trim());
    lastSnippetEnd = end;
    if (snippets.length >= 20) break;
  }
  return uniqueStrings(snippets);
}

function classifyCandidateSnippet(snippet) {
  const hasIfraContext = /\bIFRA\b/i.test(snippet);
  const hasCat4StandardContext =
    /\bCategory\s*4:\s*Products related to fine fragrance\b/i.test(snippet);
  const hasUseLimitContext =
    /\b(maximum use level|max use|permitted amounts?|finished product)\b/i.test(snippet);
  const hasIfraFinishedProductContext =
    /\b(cat(?:egory)?\.?\s*4|fine fragrance|permitted amounts?|finished product)\b/i.test(
      snippet
    );
  const hasGhsHazardContext =
    /\b(GHS Classification|Flammable liquids|Acute toxicity|Skin irritation|Eye irritation|H\d{3})\b/i.test(
      snippet
    );
  const noRestrictionCat4 =
    hasIfraContext &&
    (/\bIFRA\b.{0,80}\bno restriction\b.{0,80}\b(?:cat(?:egory)?\.?\s*4|fine fragrance)\b/i.exec(
      snippet
    ) ||
    /\b(?:cat(?:egory)?\.?\s*4|fine fragrance)\b.{0,80}\bno restriction\b/i.exec(
      snippet
    ));
  if (noRestrictionCat4) {
    return {
      candidateLimitType: "ifra_category_limit",
      category: "4",
      candidateValue: "No restriction",
      candidateUnit: "",
      confidence: "high",
    };
  }
  const ifraValue =
    hasIfraContext &&
    hasIfraFinishedProductContext &&
    /\bIFRA(?:\s*\d+)?\b.{0,80}?(\d+(?:\.\d+)?)\s*(%|percent|ppm|mg\/kg)/i.exec(
      snippet
    );
  if (ifraValue) {
    return {
      candidateLimitType: "ifra_category_limit",
      category: /\bcat(?:egory)?\.?\s*4\b|\bfine fragrance\b/i.test(snippet) ? "4" : "",
      candidateValue: ifraValue[1],
      candidateUnit: ifraValue[2] || "",
      confidence: /\bcat(?:egory)?\.?\s*4\b|\bfine fragrance\b/i.test(snippet)
        ? "high"
        : "medium",
    };
  }
  const canTreatCat4AsIfra =
    !hasGhsHazardContext && (hasIfraContext || hasCat4StandardContext || hasUseLimitContext);
  const cat4 =
    canTreatCat4AsIfra &&
    (/\b(?:cat(?:egory)?\.?\s*4|fine fragrance)\b.{0,100}?(\d+(?:\.\d+)?)\s*(%|percent|ppm|mg\/kg)?/i.exec(
      snippet
    ) ||
      /(\d+(?:\.\d+)?)\s*(%|percent|ppm|mg\/kg).{0,100}\b(?:cat(?:egory)?\.?\s*4|fine fragrance)\b/i.exec(
        snippet
      ));
  if (cat4) {
    return {
      candidateLimitType: "ifra_category_limit",
      category: "4",
      candidateValue: cat4[1],
      candidateUnit: cat4[2] || "",
      confidence: "high",
    };
  }
  if (/\b(phototoxic|furocoumarin|bergapten-free|bergapten|fcf)\b/i.test(snippet)) {
    return {
      candidateLimitType: "phototoxic_note",
      category: "",
      candidateValue: "",
      candidateUnit: "",
      confidence: "high",
    };
  }
  const hasIdentityEvidence =
    IDENTITY_KEYWORD_RE.test(snippet) || /\b\d{2,7}-\d{2}-\d\b/i.test(snippet);
  const hasRestrictionEvidence =
    /\b(allergen|restriction|maximum use level|max use|limit|usage levels?|recommendation|code of practice|conformity|compliance|EU\s*1223)\b/i.test(
      snippet
    );
  if (hasIdentityEvidence && !hasRestrictionEvidence) {
    return {
      candidateLimitType: "identity",
      category: "",
      candidateValue: "",
      candidateUnit: "",
      confidence: "medium",
    };
  }
  if (/\b(allergen|restriction|maximum use level|max use|limit|usage levels?|recommendation|code of practice|SDS|MSDS|safety data sheet|conformity|compliance|EU\s*1223)\b/i.test(snippet)) {
    return {
      candidateLimitType: "allergen_or_restriction",
      category: "",
      candidateValue: "",
      candidateUnit: "",
      confidence: "medium",
    };
  }
  if (hasIdentityEvidence) {
    return {
      candidateLimitType: "identity",
      category: "",
      candidateValue: "",
      candidateUnit: "",
      confidence: "medium",
    };
  }
  return {
    candidateLimitType: "unknown",
    category: "",
    candidateValue: "",
    candidateUnit: "",
    confidence: "low",
  };
}

function getSuppressionReason({ snippet, classification, sourceType, identityCandidateCount }) {
  if (
    NAVIGATION_OR_DIRECTORY_NOISE_RE.test(snippet) &&
    !["ifra_category_limit", "phototoxic_note"].includes(classification.candidateLimitType)
  ) {
    return "navigation_or_directory_noise";
  }
  if (
    IDENTITY_ONLY_SOURCE_TYPES.has(sourceType) &&
    classification.candidateLimitType === "allergen_or_restriction" &&
    !/\b(IFRA|Category\s*4|Cat\s*4|Fine fragrance|Maximum use level|Max use|Limit|Restriction|Allergen|Phototoxic|Furocoumarin|Bergapten|FCF)\b/i.test(
      snippet
    )
  ) {
    return "identity_reference_sds_directory_noise";
  }
  if (
    IDENTITY_ONLY_SOURCE_TYPES.has(sourceType) &&
    classification.candidateLimitType === "unknown"
  ) {
    return SAFETY_SOURCE_KEYWORD_RE.test(snippet)
      ? "identity_reference_unresolved_safety_context"
      : "identity_reference_unknown_noise";
  }
  if (
    IDENTITY_ONLY_SOURCE_TYPES.has(sourceType) &&
    classification.candidateLimitType === "identity" &&
    identityCandidateCount >= 3
  ) {
    return "identity_reference_identity_cap";
  }
  if (
    classification.candidateLimitType === "unknown" &&
    !STRONG_UNKNOWN_SOURCE_KEYWORD_RE.test(snippet)
  ) {
    return "unknown_without_safety_keywords";
  }
  return "";
}

function assignReviewPriority({ candidateLimitType, sourceType, queueItemIds = [] }) {
  if (candidateLimitType === "ifra_category_limit" || candidateLimitType === "phototoxic_note") {
    return "high";
  }
  if (candidateLimitType === "allergen_or_restriction") {
    if (sourceType === "identity_reference") return "low";
    return REVIEW_SOURCE_TYPES.has(sourceType) && queueItemIds.length ? "high" : "medium";
  }
  if (candidateLimitType === "identity") {
    return sourceType === "supplier_sds" || sourceType === "supplier_product_page"
      ? "medium"
      : "low";
  }
  return "low";
}

function makeCandidateId(filePath, index, snippet) {
  return `candidate-ifra-${slugifyReviewText(`${filePath}-${index}-${snippet.slice(0, 48)}`)}`;
}

function normalizeCandidateSourceType(sourceType) {
  if (sourceType === "product_page") return "supplier_product_page";
  return sourceType || "unknown";
}

function buildCandidateRecordsForFile(filePath, root = DEFAULT_ROOT, context = {}) {
  const metadata = readMetadataForSource(filePath);
  const text = getTextForCandidateExtraction(filePath);
  if (!metadata || !text) return { candidates: [], suppressed: [] };
  const normalizedSourceType = normalizeCandidateSourceType(metadata.sourceType);
  const queueLinks = resolveQueueLinksForMetadata(metadata, context);
  const candidates = [];
  const suppressed = [];
  let identityCandidateCount = 0;
  findKeywordSnippets(text).forEach((snippet, index) => {
    const classification = classifyCandidateSnippet(snippet);
    const suppressionReason = getSuppressionReason({
      snippet,
      classification,
      sourceType: metadata.sourceType || "unknown",
      identityCandidateCount,
    });
    if (suppressionReason) {
      suppressed.push({
        sourceFile: toRepoRelative(filePath, root),
        sourceType: normalizedSourceType,
        materialName: metadata.materialName || "",
        reason: suppressionReason,
        snippet,
      });
      return;
    }
    if (classification.candidateLimitType === "identity") identityCandidateCount += 1;
    const reviewPriority = assignReviewPriority({
      candidateLimitType: classification.candidateLimitType,
      sourceType: normalizedSourceType,
      queueItemIds: queueLinks.queueItemIds,
    });
    candidates.push({
      id: makeCandidateId(filePath, index, snippet),
      materialName: metadata.materialName || "",
      materialNames: metadata.materialNames || [],
      formulaMaterialName: metadata.materialName || "",
      sourceIdentityName:
        metadata.sourceIdentityName ||
        buildIfraSourceIdentity(metadata.materialName || "").sourceIdentityName,
      sourceIdentityNames: uniqueStrings([
        metadata.sourceIdentityName,
        ...(metadata.sourceIdentityNames || []),
      ]),
      queueItemIds: queueLinks.queueItemIds,
      ambiguousQueueItemIds: queueLinks.ambiguousQueueItemIds,
      queueLinkConfidence: queueLinks.queueLinkConfidence,
      sourceType: normalizedSourceType,
      sourceUrl: metadata.sourceUrl || "",
      sourceFile: toRepoRelative(filePath, root),
      candidateLimitType: classification.candidateLimitType,
      category: classification.category,
      candidateValue: classification.candidateValue,
      candidateUnit: classification.candidateUnit,
      snippet,
      confidence: classification.confidence,
      reviewPriority,
      reviewStatus: "needs_review",
      notes: [
        "Candidate extraction only. Requires human review before any structured IFRA promotion.",
      ],
    });
  });
  return { candidates, suppressed };
}

export function buildCandidateIfraSourceExtractions({
  sourceDir = DEFAULT_IFRA_SOURCE_DOCUMENT_DIR,
  generatedAt = new Date().toISOString(),
  root = DEFAULT_ROOT,
  queue = loadExistingHeroIfraSourceQueue(DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH),
  harvestReport = loadHarvestReportForCandidateLinking(),
} = {}) {
  const files = walkFiles(sourceDir).filter(
    (filePath) => !filePath.endsWith(".metadata.json")
  );
  const context = {
    queueLookup: buildQueueLookup(queue || {}),
    harvestSourceIndex: buildHarvestSourceIndex(harvestReport),
  };
  const extractionResults = files.map((filePath) =>
    buildCandidateRecordsForFile(filePath, root, context)
  );
  const candidates = extractionResults.flatMap((result) => result.candidates);
  const suppressed = extractionResults.flatMap((result) => result.suppressed);
  const linkedCandidateCount = candidates.filter(
    (candidate) => (candidate.queueItemIds || []).length
  ).length;
  const ambiguousCandidateCount = candidates.filter(
    (candidate) => (candidate.ambiguousQueueItemIds || []).length
  ).length;
  const unlinkedCandidateCount =
    candidates.length - linkedCandidateCount - ambiguousCandidateCount;
  return {
    metadata: {
      generatedAt,
      reportName: "Candidate IFRA Source Extractions",
      sourceDirectory: toRepoRelative(sourceDir, root),
      guardrails: [
        "Candidate snippets are review aids only.",
        "This extractor does not promote IFRA limits or update runtime compliance logic.",
      ],
    },
    summary: {
      sourceFileCount: files.length,
      candidateCount: candidates.length,
      candidateTypeCounts: countBy(candidates, "candidateLimitType"),
      reviewPriorityCounts: countBy(candidates, "reviewPriority"),
      queueItemIdsWithCandidates: uniqueStrings(
        candidates.flatMap((candidate) => candidate.queueItemIds || [])
      ).length,
      linkedCandidateCount,
      unlinkedCandidateCount,
      ambiguousCandidateCount,
      suppressedSnippetCount: suppressed.length,
      suppressedReasonCounts: countBy(suppressed, "reason"),
    },
    candidates,
    suppressedSnippets: suppressed.slice(0, 50),
  };
}

export function formatCandidateIfraExtractionsMarkdown(report = {}) {
  const summary = report.summary || {};
  const candidates = report.candidates || [];
  const highPriority = candidates.filter(
    (candidate) =>
      candidate.reviewPriority === "high" &&
      candidate.candidateLimitType !== "phototoxic_note"
  );
  const phototoxic = candidates.filter(
    (candidate) => candidate.candidateLimitType === "phototoxic_note"
  );
  const sdsRestriction = candidates.filter(
    (candidate) => candidate.candidateLimitType === "allergen_or_restriction"
  );
  const identityOnly = candidates.filter(
    (candidate) => candidate.candidateLimitType === "identity"
  );
  const usefulReviewCandidates =
    (summary.reviewPriorityCounts?.high || 0) + (summary.reviewPriorityCounts?.medium || 0);

  const tableForCandidates = (rows) =>
    rows.length
      ? [
          "| Priority | Material | Type | Queue link | Category | Value | Source | Snippet |",
          "| --- | --- | --- | --- | --- | --- | --- | --- |",
          ...rows.map((candidate) =>
            `| ${[
              candidate.reviewPriority,
              candidate.materialName || (candidate.materialNames || []).join(", "),
              candidate.candidateLimitType,
              candidate.queueItemIds?.length
                ? candidate.queueItemIds.join(", ")
                : candidate.ambiguousQueueItemIds?.length
                  ? `ambiguous: ${candidate.ambiguousQueueItemIds.join(", ")}`
                  : "",
              candidate.category,
              `${candidate.candidateValue || ""} ${candidate.candidateUnit || ""}`.trim(),
              candidate.sourceFile,
              candidate.snippet,
            ]
              .map(escapeMarkdown)
              .join(" | ")} |`
          ),
        ]
      : ["No candidates in this group."];

  return [
    "# Candidate IFRA Source Extractions",
    "",
    `Generated: ${report.metadata?.generatedAt || ""}`,
    "",
    "These are candidate snippets for review only. They do not update runtime IFRA data, add limits, or prove launch clearance.",
    "",
    "## Summary",
    "",
    `- Source files scanned: ${summary.sourceFileCount || 0}`,
    `- Candidate snippets extracted: ${summary.candidateCount || 0}`,
    `- Useful review candidates: ${usefulReviewCandidates}`,
    `- Suppressed noisy snippets: ${summary.suppressedSnippetCount || 0}`,
    `- Queue items with candidates: ${summary.queueItemIdsWithCandidates || 0}`,
    `- Linked candidates: ${summary.linkedCandidateCount || 0}`,
    `- Unlinked candidates: ${summary.unlinkedCandidateCount || 0}`,
    `- Ambiguous candidates: ${summary.ambiguousCandidateCount || 0}`,
    "",
    "Candidate type counts:",
    ...Object.entries(summary.candidateTypeCounts || {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `- ${key}: ${value}`),
    "",
    "Review priority counts:",
    ...Object.entries(summary.reviewPriorityCounts || {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## High-Priority IFRA/Product Candidates",
    "",
    ...tableForCandidates(highPriority),
    "",
    "## Phototoxic/FCF Candidates",
    "",
    ...tableForCandidates(phototoxic),
    "",
    "## SDS / Restriction Candidates",
    "",
    ...tableForCandidates(sdsRestriction),
    "",
    "## Identity-Only References",
    "",
    ...tableForCandidates(identityOnly),
    "",
    "## Suppressed/Noisy Candidates Summary",
    "",
    "Suppressed snippets are retained only as counts/examples so identity-reference pages do not create broad review spam.",
    "",
    "Suppression reason counts:",
    ...Object.entries(summary.suppressedReasonCounts || {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `- ${key}: ${value}`),
    "",
    "| Material | Source type | Reason | Source | Example snippet |",
    "| --- | --- | --- | --- | --- |",
    ...(report.suppressedSnippets || []).slice(0, 15).map((suppressed) =>
      `| ${[
        suppressed.materialName,
        suppressed.sourceType,
        suppressed.reason,
        suppressed.sourceFile,
        suppressed.snippet,
      ]
        .map(escapeMarkdown)
        .join(" | ")} |`
    ),
  ].join("\n");
}

export function formatCandidateIfraExtractionsText(report = {}) {
  const summary = report.summary || {};
  return [
    "Candidate IFRA Source Extractions",
    "",
    "Candidate snippets are review aids only. No runtime IFRA data is updated.",
    "",
    `Source files scanned: ${summary.sourceFileCount || 0}`,
    `Candidate snippets extracted: ${summary.candidateCount || 0}`,
    `Useful review candidates: ${(summary.reviewPriorityCounts?.high || 0) + (summary.reviewPriorityCounts?.medium || 0)}`,
    `Suppressed noisy snippets: ${summary.suppressedSnippetCount || 0}`,
    `Queue items with candidates: ${summary.queueItemIdsWithCandidates || 0}`,
    `Linked candidates: ${summary.linkedCandidateCount || 0}`,
    `Unlinked candidates: ${summary.unlinkedCandidateCount || 0}`,
    `Ambiguous candidates: ${summary.ambiguousCandidateCount || 0}`,
    "",
  ].join("\n");
}

export function writeCandidateIfraExtractions(filePath, report) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
}
