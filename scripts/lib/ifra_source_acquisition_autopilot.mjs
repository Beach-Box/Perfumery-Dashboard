import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH,
  DEFAULT_INGREDIENT_SOURCE_HARVEST_REPORT_PATH,
  buildIngredientSourceHarvestReport,
  downloadHarvestSources,
  writeIngredientSourceHarvestReport,
} from "./ifra_source_harvest.mjs";
import {
  DEFAULT_IFRA_SOURCE_DOCUMENT_DIR,
  normalizeReviewText,
  slugifyReviewText,
} from "./ifra_source_document_review.mjs";
import {
  DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH,
  loadExistingHeroIfraSourceQueue,
} from "./hero_ifra_source_acquisition_queue.mjs";
import {
  DEFAULT_IFRA_EVIDENCE_RESOLUTION_PATH,
} from "./ifra_evidence_resolver.mjs";
import {
  DEFAULT_IFRA_EVIDENCE_AUTOPILOT_REPORT_PATH,
  runIfraEvidenceAutopilot,
} from "./ifra_evidence_autopilot.mjs";
import {
  DEFAULT_IFRA_AUTOPILOT_RECOMMENDATIONS_PATH,
  DEFAULT_PROPOSED_IFRA_STRUCTURED_RECORDS_PATH,
} from "./ifra_autopilot_recommendations.mjs";
import {
  DEFAULT_OFFICIAL_IFRA_HARVEST_REPORT_MARKDOWN_PATH,
  DEFAULT_OFFICIAL_IFRA_SOURCE_CANDIDATES_MARKDOWN_PATH,
  DEFAULT_OFFICIAL_IFRA_SOURCE_CANDIDATES_PATH,
  buildOfficialIfraHarvestReport,
  buildOfficialIfraSourceCandidatesFile,
  cacheOfficialIfraIndexPages,
  downloadOfficialStandardPdfs,
  formatOfficialIfraHarvestMarkdown,
  writeOfficialIfraHarvestReport,
  writeOfficialIfraMarkdown,
  writeOfficialIfraSourceCandidates,
} from "./official_ifra_harvest.mjs";
import {
  DEFAULT_IFRA_PROMOTION_OPPORTUNITIES_PATH,
  buildIfraPromotionOpportunityReportFromFiles,
  writeIfraPromotionOpportunityReport,
} from "./ifra_promotion_opportunity_ranker.mjs";

const DEFAULT_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);

export const DEFAULT_IFRA_SOURCE_ACQUISITION_AUTOPILOT_REPORT_PATH = path.join(
  DEFAULT_ROOT,
  "data",
  "ifra_source_acquisition",
  "ifra_source_acquisition_autopilot_report.json"
);

export const DEFAULT_IFRA_SOURCE_ACQUISITION_AUTOPILOT_MARKDOWN_PATH = path.join(
  DEFAULT_ROOT,
  "docs",
  "ifra",
  "ifra_source_acquisition_autopilot_report.md"
);

export const IFRA_SOURCE_ACQUISITION_AUTOPILOT_COMMAND =
  'node scripts/run_ifra_source_acquisition_autopilot.mjs --ingredient-reference "...Ingredient data - Ingredient Data.csv" --download --markdown --write docs/ifra/ifra_source_acquisition_autopilot_report.md';

export const DEFAULT_AUTOPILOT_CACHE_DIR = path.join(
  DEFAULT_IFRA_SOURCE_DOCUMENT_DIR,
  "autopilot"
);

const DEFAULT_OFFICIAL_IFRA_HARVEST_REPORT_PATH = path.join(
  DEFAULT_ROOT,
  "data",
  "ifra_source_acquisition",
  "official_ifra_harvest_report.json"
);

const TARGETABLE_SOURCE_TYPES = new Set([
  "global_ifra_standard_needed",
  "supplier_ifra_or_sds_needed",
  "specialty_supplier_document_needed",
  "natural_uvcb_supplier_document_needed",
  "fcf_special_case",
]);

const TARGET_EVIDENCE_STATUSES = new Set([
  "needs_supplier_doc",
  "insufficient_evidence",
  "identity_only",
]);

const TARGET_RECOMMENDATION_STATUSES = new Set([
  "needs_better_source",
  "no_useful_evidence_found",
]);

const TARGET_PROMOTION_CLASSIFICATIONS = new Set(["needs_better_source"]);

const REVIEW_READY_EVIDENCE_STATUSES = new Set([
  "review_ready",
  "candidate_found_needs_review",
  "likely_fcf_evidence",
]);

const DOC_DOWNLOAD_TYPES = new Set([
  "supplier_ifra",
  "supplier_sds",
  "supplier_specification",
]);

const PRODUCT_PAGE_TYPES = new Set([
  "product_page",
  "supplier_product_page",
  "safety_page",
  "unknown",
]);

const LINK_DISCOVERY_RE =
  /\b(IFRA|Certificate|SDS|MSDS|Safety Data Sheet|GHS|Downloads?|Documentation|Specification|Spec Sheet|Allergen)\b/i;

const FOCUS_MATERIALS = [
  "Calone",
  "Calone 1951",
  "Cetalox",
  "Clearwood",
  "Celestafleur",
  "Timbersilk",
  "Methyl Ionone Alpha Extra",
  "Geosmin",
  "Iso E Super",
  "OTNE",
  "Ambroxan",
  "Ambroxide",
  "Ambrofix",
  "Cypriol",
  "Seaweed Absolute",
];

function loadJsonIfPresent(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

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

function countBy(items = [], key) {
  return items.reduce((acc, item) => {
    const value = item?.[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function toRepoRelative(filePath, root = DEFAULT_ROOT) {
  const relative = path.isAbsolute(filePath) ? path.relative(root, filePath) : filePath;
  return relative.split(path.sep).join("/");
}

function resolveRepoPath(filePath, root = DEFAULT_ROOT) {
  if (!filePath) return "";
  return path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
}

function normalizeText(value) {
  return normalizeReviewText(value);
}

function materialHaystack(item = {}) {
  return [
    item.materialName,
    item.formulaMaterialName,
    item.sourceIdentityName,
    item.activeMaterialName,
    item.normalizedName,
    ...(item.formulaMaterialNames || []),
    ...(item.materialNames || []),
    ...(item.sourceIdentityNames || []),
    ...(item.candidateSearchTerms || []),
    ...(item.sourceSearchTerms || []),
  ].join(" ");
}

function focusRank(item = {}) {
  const haystack = normalizeText(materialHaystack(item));
  const index = FOCUS_MATERIALS.findIndex((term) =>
    haystack.includes(normalizeText(term))
  );
  return index === -1 ? 999 : index;
}

function isFocusMaterial(item = {}) {
  return focusRank(item) !== 999;
}

function priorityRank(value = "") {
  return { high: 0, medium: 1, low: 2 }[value] ?? 9;
}

function recordsFromFile(file = {}) {
  if (Array.isArray(file)) return file;
  return file.records || file.candidates || file.items || file.recommendations || [];
}

function buildQueueLookup(sourceQueue = {}) {
  const byId = new Map();
  const byName = new Map();
  for (const item of sourceQueue.items || []) {
    if (item.id) byId.set(item.id, item);
    for (const name of [
      item.materialName,
      item.sourceIdentityName,
      item.normalizedName,
      item.activeMaterialName,
      ...(item.sourceRowNames || []),
      ...(item.candidateSearchTerms || []),
    ]) {
      const normalized = normalizeText(name);
      if (!normalized || byName.has(normalized)) continue;
      byName.set(normalized, item);
    }
  }
  return { byId, byName };
}

function findQueueItemForRecord(record = {}, queueLookup) {
  for (const id of [
    record.queueItemId,
    ...(record.queueItemIds || []),
  ]) {
    if (id && queueLookup.byId.has(id)) return queueLookup.byId.get(id);
  }
  for (const name of [
    record.materialName,
    record.sourceIdentityName,
    record.formulaMaterialName,
    ...(record.formulaMaterialNames || []),
  ]) {
    const item = queueLookup.byName.get(normalizeText(name));
    if (item) return item;
  }
  return null;
}

function addTargetReason(targetMap, queueItem, reason, record = {}) {
  if (!queueItem?.id) return;
  if (!targetMap.has(queueItem.id)) {
    targetMap.set(queueItem.id, {
      queueItem,
      queueItemId: queueItem.id,
      materialName: queueItem.materialName || record.materialName || "",
      sourceIdentityName:
        queueItem.sourceIdentityName ||
        record.sourceIdentityName ||
        queueItem.normalizedName ||
        queueItem.materialName ||
        "",
      formulasUsedIn: uniqueStrings([
        ...(queueItem.formulasUsedIn || []),
        ...(record.formulasUsedIn || []),
      ]),
      requiredSourceType: queueItem.requiredSourceType || record.requiredSourceType || "",
      priority: queueItem.priority || "medium",
      priorStatus: {
        queueStatus: queueItem.status || "",
        reviewStatus: queueItem.reviewStatus || "",
        evidenceStatus: "",
        recommendationStatus: "",
        promotionClassification: "",
      },
      targetReasons: [],
      isFocusMaterial: isFocusMaterial(queueItem),
    });
  }
  const target = targetMap.get(queueItem.id);
  target.targetReasons = uniqueStrings([...target.targetReasons, reason]);
  if (record.evidenceStatus) target.priorStatus.evidenceStatus = record.evidenceStatus;
  if (record.recommendationStatus) {
    target.priorStatus.recommendationStatus = record.recommendationStatus;
  }
  if (record.classification) {
    target.priorStatus.promotionClassification = record.classification;
  }
}

function isQueueItemStillTargetable(item = {}) {
  if (!TARGETABLE_SOURCE_TYPES.has(item.requiredSourceType)) return false;
  if (["reviewed", "promoted", "not_applicable", "deferred"].includes(item.status)) {
    return false;
  }
  if (item.reviewStatus === "reviewed_ok") return false;
  return true;
}

function compareTargets(left = {}, right = {}) {
  const focusDelta = focusRank(left.queueItem) - focusRank(right.queueItem);
  if (focusDelta) return focusDelta;
  const priorityDelta = priorityRank(left.priority) - priorityRank(right.priority);
  if (priorityDelta) return priorityDelta;
  const sourceDelta = String(left.requiredSourceType || "").localeCompare(
    String(right.requiredSourceType || "")
  );
  if (sourceDelta) return sourceDelta;
  return String(left.materialName || "").localeCompare(String(right.materialName || ""));
}

export function buildSourceAcquisitionTargets({
  sourceQueue = {},
  evidenceResolution = {},
  autopilotRecommendations = {},
  promotionOpportunities = {},
} = {}) {
  const queueLookup = buildQueueLookup(sourceQueue);
  const targetMap = new Map();

  for (const item of autopilotRecommendations.needsBetterSource || []) {
    const queueItem = findQueueItemForRecord(item, queueLookup);
    if (queueItem && isQueueItemStillTargetable(queueItem)) {
      addTargetReason(targetMap, queueItem, "autopilot_recommendation_needs_better_source", item);
    }
  }

  for (const item of autopilotRecommendations.items || []) {
    if (!TARGET_RECOMMENDATION_STATUSES.has(item.recommendationStatus)) continue;
    const queueItem = findQueueItemForRecord(item, queueLookup);
    if (queueItem && isQueueItemStillTargetable(queueItem)) {
      addTargetReason(targetMap, queueItem, "autopilot_recommendation_unresolved", item);
    }
  }

  for (const item of promotionOpportunities.opportunities || []) {
    if (!TARGET_PROMOTION_CLASSIFICATIONS.has(item.classification)) continue;
    const queueItem = findQueueItemForRecord(item, queueLookup);
    if (queueItem && isQueueItemStillTargetable(queueItem)) {
      addTargetReason(targetMap, queueItem, "promotion_ranker_needs_better_source", item);
    }
  }

  for (const item of evidenceResolution.items || []) {
    if (!TARGET_EVIDENCE_STATUSES.has(item.evidenceStatus)) continue;
    const queueItem = findQueueItemForRecord(item, queueLookup);
    if (queueItem && isQueueItemStillTargetable(queueItem)) {
      addTargetReason(targetMap, queueItem, "evidence_resolver_unresolved", item);
    }
  }

  for (const item of sourceQueue.items || []) {
    if (!isQueueItemStillTargetable(item)) continue;
    if (!isFocusMaterial(item) && item.priority !== "high") continue;
    addTargetReason(targetMap, item, isFocusMaterial(item) ? "focus_material_remaining_gap" : "high_priority_remaining_gap");
  }

  return [...targetMap.values()].sort(compareTargets);
}

function escapeMarkdown(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function stripTags(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value = "") {
  return String(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
}

function hrefFromAnchor(anchorOpen = "") {
  const match = String(anchorOpen).match(/\bhref\s*=\s*(["'])([\s\S]*?)\1/i);
  return match ? decodeHtml(match[2]) : "";
}

function resolveUrl(href = "", baseUrl = "") {
  if (!href || /^javascript:|^mailto:|^tel:/i.test(href)) return "";
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return "";
  }
}

export function classifyDiscoveredSourceLink({ url = "", linkText = "" } = {}) {
  const haystack = normalizeText(`${linkText} ${url}`);
  if (/\bifra\b/.test(haystack)) return "supplier_ifra";
  if (/\bsds\b|\bmsds\b|\bsafety data sheet\b|\bghs\b/.test(haystack)) {
    return "supplier_sds";
  }
  if (
    /\bspecification\b|\bspec sheet\b|\bspec\b|\ballergen\b|\bdocumentation\b|\bdownloads?\b|\bcertificate\b/.test(
      haystack
    )
  ) {
    return "supplier_specification";
  }
  if (/\bgoodscents\b|\bthegoodscentscompany\b|\bcas\b|\bidentity\b/.test(haystack)) {
    return "identity_reference";
  }
  if (/\bproduct\b|\bshop\b|\bitem\b|\bsku\b|\bcatalog\b/.test(haystack)) {
    return "product_page";
  }
  return "unknown";
}

export function isSafeSupplierDocumentFollow({
  sourcePageUrl = "",
  candidateUrl = "",
  sourceType = "unknown",
} = {}) {
  if (!DOC_DOWNLOAD_TYPES.has(sourceType)) {
    return {
      allowed: false,
      reason: "Only visible supplier IFRA, SDS, specification, allergen, or document links are followed.",
    };
  }
  let source;
  let candidate;
  try {
    source = new URL(sourcePageUrl);
    candidate = new URL(candidateUrl);
  } catch {
    return { allowed: false, reason: "Invalid source or candidate URL." };
  }
  if (!/^https?:$/.test(source.protocol) || !/^https?:$/.test(candidate.protocol)) {
    return { allowed: false, reason: "Only http/https source links are allowed." };
  }
  if (source.hostname !== candidate.hostname) {
    return {
      allowed: false,
      reason: "Blocked because the discovered link leaves the known supplier domain.",
    };
  }
  return {
    allowed: true,
    reason: "Visible same-domain supplier document link from known product page.",
  };
}

export function discoverSupplierDocumentLinksFromHtml({
  html = "",
  pageUrl = "",
  pageLocalPath = "",
  target = {},
} = {}) {
  const links = [];
  const anchorRe = /<a\b([\s\S]*?)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRe.exec(String(html)))) {
    const href = hrefFromAnchor(match[1]);
    const linkText = stripTags(match[2]);
    const resolvedUrl = resolveUrl(href, pageUrl);
    if (!resolvedUrl) continue;
    const discoveryText = `${linkText} ${href}`;
    if (!LINK_DISCOVERY_RE.test(discoveryText)) continue;
    const sourceType = classifyDiscoveredSourceLink({
      url: resolvedUrl,
      linkText,
    });
    const safety = isSafeSupplierDocumentFollow({
      sourcePageUrl: pageUrl,
      candidateUrl: resolvedUrl,
      sourceType,
    });
    links.push({
      id: `ifra-source-acquisition-link-${slugifyReviewText(`${target.queueItemId || target.materialName}-${resolvedUrl}`).slice(0, 140)}`,
      queueItemId: target.queueItemId || target.queueItem?.id || "",
      queueItemIds: uniqueStrings([target.queueItemId || target.queueItem?.id]),
      materialName: target.materialName || target.queueItem?.materialName || "",
      materialNames: uniqueStrings([target.materialName || target.queueItem?.materialName]),
      sourceIdentityName:
        target.sourceIdentityName ||
        target.queueItem?.sourceIdentityName ||
        target.materialName ||
        "",
      sourceIdentityNames: uniqueStrings([
        target.sourceIdentityName || target.queueItem?.sourceIdentityName,
      ]),
      formulasUsedIn: target.formulasUsedIn || target.queueItem?.formulasUsedIn || [],
      sourceType,
      sourceUrl: resolvedUrl,
      linkText,
      discoveredFromUrl: pageUrl,
      discoveredFromLocalPath: pageLocalPath,
      safeFollow: safety.allowed,
      blockedReason: safety.allowed ? "" : safety.reason,
      downloadStatus: "not_requested",
      localPath: "",
      metadataPath: "",
      httpStatus: null,
      contentType: "",
      error: "",
    });
  }
  return uniqueObjectsBy(links, (link) => link.sourceUrl);
}

function walkFiles(directory, predicate = () => true) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.name.startsWith(".")) return [];
    if (entry.isDirectory()) return walkFiles(filePath, predicate);
    if (!entry.isFile()) return [];
    return predicate(filePath) ? [filePath] : [];
  });
}

function buildCachedSourceIndex({ sourceDir = DEFAULT_IFRA_SOURCE_DOCUMENT_DIR, root = DEFAULT_ROOT } = {}) {
  const index = new Map();
  for (const metadataPath of walkFiles(sourceDir, (filePath) =>
    filePath.endsWith(".metadata.json")
  )) {
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
      if (!metadata.sourceUrl) continue;
      const localPath = resolveRepoPath(
        metadata.localPath || metadataPath.replace(/\.metadata\.json$/, ""),
        root
      );
      if (!fs.existsSync(localPath)) continue;
      index.set(metadata.sourceUrl, {
        metadata,
        localPath,
        metadataPath,
      });
    } catch {
      // Bad local cache metadata should not stop acquisition.
    }
  }
  return index;
}

function isInspectableHtml(filePath = "") {
  return /\.html?$/i.test(filePath) && fs.existsSync(filePath);
}

function targetLookup(targets = []) {
  const byQueueItemId = new Map();
  for (const target of targets) {
    byQueueItemId.set(target.queueItemId, target);
  }
  return byQueueItemId;
}

function collectInspectableProductPages({
  harvestReport = {},
  previousHarvestReport = {},
  targets = [],
  sourceDir = DEFAULT_IFRA_SOURCE_DOCUMENT_DIR,
  root = DEFAULT_ROOT,
} = {}) {
  const targetById = targetLookup(targets);
  const cached = buildCachedSourceIndex({ sourceDir, root });
  const reports = [harvestReport, previousHarvestReport].filter(Boolean);
  const pages = [];
  for (const report of reports) {
    for (const link of report.sourceLinks || []) {
      if (!PRODUCT_PAGE_TYPES.has(link.sourceType || "unknown")) continue;
      const matchingTargetIds = (link.queueItemIds || []).filter((id) => targetById.has(id));
      if (!matchingTargetIds.length) continue;
      const cacheRecord = cached.get(link.sourceUrl);
      const localPath = resolveRepoPath(link.localPath || cacheRecord?.localPath || "", root);
      if (!isInspectableHtml(localPath)) continue;
      for (const queueItemId of matchingTargetIds) {
        pages.push({
          queueItemId,
          target: targetById.get(queueItemId),
          sourceUrl: link.sourceUrl,
          localPath,
          localPathRelative: toRepoRelative(localPath, root),
        });
      }
    }
  }
  return uniqueObjectsBy(pages, (page) => `${page.queueItemId}|${page.sourceUrl}|${page.localPath}`);
}

function directoryForDiscoveredType(sourceType, cacheDir = DEFAULT_AUTOPILOT_CACHE_DIR) {
  if (sourceType === "supplier_ifra") return path.join(cacheDir, "ifra");
  if (sourceType === "supplier_sds") return path.join(cacheDir, "sds");
  if (sourceType === "supplier_specification") return path.join(cacheDir, "specs");
  if (sourceType === "product_page") return path.join(cacheDir, "product_pages");
  return cacheDir;
}

function extensionForDownload({ url = "", contentType = "", sourceType = "" } = {}) {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (ext && ext.length <= 8) return ext;
  } catch {
    // Fall through to content-type guesses.
  }
  if (/pdf/i.test(contentType)) return ".pdf";
  if (/json/i.test(contentType)) return ".json";
  if (/text/i.test(contentType)) return ".txt";
  if (sourceType === "product_page" || /html/i.test(contentType)) return ".html";
  return ".html";
}

function cachePathForDiscoveredLink(link, contentType, {
  cacheDir = DEFAULT_AUTOPILOT_CACHE_DIR,
} = {}) {
  const directory = directoryForDiscoveredType(link.sourceType, cacheDir);
  const extension = extensionForDownload({
    url: link.sourceUrl,
    contentType,
    sourceType: link.sourceType,
  });
  return path.join(
    directory,
    `${slugifyReviewText(`${link.materialName}-${link.sourceType}-${link.sourceUrl}`).slice(0, 130)}${extension}`
  );
}

function responseHeader(response, name) {
  return response.headers?.get?.(name) || "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function cacheDiscoveredSupplierLinks({
  discoveredLinks = [],
  download = false,
  fetchImpl = globalThis.fetch,
  rateLimitMs = 350,
  sourceDir = DEFAULT_IFRA_SOURCE_DOCUMENT_DIR,
  cacheDir = DEFAULT_AUTOPILOT_CACHE_DIR,
  root = DEFAULT_ROOT,
} = {}) {
  const cached = buildCachedSourceIndex({ sourceDir, root });
  const seen = new Set();
  const downloads = [];
  for (const link of discoveredLinks) {
    if (seen.has(link.sourceUrl)) {
      downloads.push({
        ...link,
        downloadStatus: "skipped_duplicate",
        error: "Duplicate discovered URL already processed in this run.",
      });
      continue;
    }
    seen.add(link.sourceUrl);

    if (!link.safeFollow) {
      downloads.push({
        ...link,
        downloadStatus: "blocked",
        error: link.blockedReason || "Blocked by safe-follow policy.",
      });
      continue;
    }
    if (!download) {
      downloads.push({ ...link, downloadStatus: "not_requested" });
      continue;
    }
    const cachedRecord = cached.get(link.sourceUrl);
    if (cachedRecord) {
      downloads.push({
        ...link,
        downloadStatus: "skipped_cached",
        httpStatus: cachedRecord.metadata.httpStatus ?? null,
        contentType: cachedRecord.metadata.contentType || "",
        localPath: toRepoRelative(cachedRecord.localPath, root),
        metadataPath: toRepoRelative(cachedRecord.metadataPath, root),
      });
      continue;
    }
    try {
      const response = await fetchImpl(link.sourceUrl, {
        headers: {
          "user-agent": "Perfumery-Dashboard IFRA source acquisition autopilot",
        },
      });
      const contentType = responseHeader(response, "content-type");
      if (!response.ok) {
        downloads.push({
          ...link,
          downloadStatus: "failed",
          httpStatus: response.status,
          contentType,
          error: `HTTP ${response.status}`,
        });
        if (rateLimitMs > 0) await sleep(rateLimitMs);
        continue;
      }
      const localPath = cachePathForDiscoveredLink(link, contentType, { cacheDir });
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, Buffer.from(await response.arrayBuffer()));
      const metadata = {
        sourceUrl: link.sourceUrl,
        sourceType: link.sourceType,
        materialName: link.materialName,
        materialNames: link.materialNames || [],
        sourceIdentityName: link.sourceIdentityName,
        sourceIdentityNames: link.sourceIdentityNames || [],
        queueItemIds: link.queueItemIds || [],
        discoveredFromUrl: link.discoveredFromUrl,
        discoveredFromLocalPath: link.discoveredFromLocalPath,
        fetchedAt: new Date().toISOString(),
        httpStatus: response.status,
        contentType,
        localPath: toRepoRelative(localPath, root),
      };
      const metadataPath = `${localPath}.metadata.json`;
      fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
      downloads.push({
        ...link,
        downloadStatus: "downloaded",
        httpStatus: response.status,
        contentType,
        localPath: metadata.localPath,
        metadataPath: toRepoRelative(metadataPath, root),
        error: "",
      });
    } catch (error) {
      downloads.push({
        ...link,
        downloadStatus: "failed",
        error: error?.message || String(error),
      });
    }
    if (rateLimitMs > 0) await sleep(rateLimitMs);
  }
  return downloads;
}

function discoverLinksFromCachedProductPages({
  harvestReport = {},
  previousHarvestReport = {},
  targets = [],
  sourceDir = DEFAULT_IFRA_SOURCE_DOCUMENT_DIR,
  root = DEFAULT_ROOT,
} = {}) {
  const productPages = collectInspectableProductPages({
    harvestReport,
    previousHarvestReport,
    targets,
    sourceDir,
    root,
  });
  const discoveredLinks = productPages.flatMap((page) =>
    discoverSupplierDocumentLinksFromHtml({
      html: fs.readFileSync(page.localPath, "utf8"),
      pageUrl: page.sourceUrl,
      pageLocalPath: page.localPathRelative,
      target: page.target,
    })
  );
  return {
    productPagesInspected: productPages,
    discoveredLinks: uniqueObjectsBy(discoveredLinks, (link) => `${link.queueItemId}|${link.sourceUrl}`),
  };
}

function idSet(records = []) {
  return new Set(records.map((record) => record?.id || record?.proposedRecordId).filter(Boolean));
}

function candidatesFromExtractions(file = {}) {
  return file.candidates || [];
}

function proposedRecordsFromFile(file = {}) {
  return file.records || file.proposedStructuredRecords || [];
}

function isTargetRecord(record = {}, targetIds = new Set()) {
  if (record.queueItemId && targetIds.has(record.queueItemId)) return true;
  return (record.queueItemIds || []).some((id) => targetIds.has(id));
}

function loadInputFiles(paths = {}) {
  return {
    sourceQueue:
      loadExistingHeroIfraSourceQueue(paths.sourceQueuePath || DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH) ||
      {},
    evidenceResolution:
      loadJsonIfPresent(paths.evidenceResolutionPath || DEFAULT_IFRA_EVIDENCE_RESOLUTION_PATH) ||
      {},
    autopilotRecommendations:
      loadJsonIfPresent(
        paths.recommendationsPath || DEFAULT_IFRA_AUTOPILOT_RECOMMENDATIONS_PATH
      ) || {},
    promotionOpportunities:
      loadJsonIfPresent(
        paths.promotionOpportunitiesPath || DEFAULT_IFRA_PROMOTION_OPPORTUNITIES_PATH
      ) || {},
    harvestReport:
      loadJsonIfPresent(paths.harvestReportPath || DEFAULT_INGREDIENT_SOURCE_HARVEST_REPORT_PATH) ||
      {},
    officialCandidates:
      loadJsonIfPresent(
        paths.officialIfraSourceCandidatesPath || DEFAULT_OFFICIAL_IFRA_SOURCE_CANDIDATES_PATH
      ) || {},
    candidateExtractions:
      loadJsonIfPresent(
        paths.candidateExtractionsPath || DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH
      ) || {},
    proposedRecords:
      loadJsonIfPresent(
        paths.proposedRecordsPath || DEFAULT_PROPOSED_IFRA_STRUCTURED_RECORDS_PATH
      ) || {},
  };
}

async function runOfficialAcquisition({
  sourceQueue = {},
  targets = [],
  beforeOfficialCandidates = {},
  download = false,
  fetchImpl = globalThis.fetch,
  generatedAt = new Date().toISOString(),
  root = DEFAULT_ROOT,
  officialReportPath = DEFAULT_OFFICIAL_IFRA_HARVEST_REPORT_PATH,
  officialReportMarkdownPath = DEFAULT_OFFICIAL_IFRA_HARVEST_REPORT_MARKDOWN_PATH,
  officialCandidatesPath = DEFAULT_OFFICIAL_IFRA_SOURCE_CANDIDATES_PATH,
  officialCandidatesMarkdownPath = DEFAULT_OFFICIAL_IFRA_SOURCE_CANDIDATES_MARKDOWN_PATH,
} = {}) {
  let indexDownloads = [];
  let pdfDownloads = [];
  if (download) {
    indexDownloads = await cacheOfficialIfraIndexPages({ fetchImpl, root });
  }
  let officialReport = buildOfficialIfraHarvestReport({
    sourceQueue,
    downloadedPdfs: indexDownloads,
    generatedAt,
    root,
  });
  if (download) {
    pdfDownloads = await downloadOfficialStandardPdfs({
      report: officialReport,
      fetchImpl,
      root,
    });
    officialReport = buildOfficialIfraHarvestReport({
      sourceQueue,
      downloadedPdfs: [...indexDownloads, ...pdfDownloads],
      generatedAt,
      root,
    });
  }
  const officialCandidatesFile = buildOfficialIfraSourceCandidatesFile(officialReport);
  writeOfficialIfraHarvestReport(officialReportPath, officialReport);
  writeOfficialIfraSourceCandidates(officialCandidatesPath, officialCandidatesFile);
  writeOfficialIfraMarkdown(officialReportMarkdownPath, formatOfficialIfraHarvestMarkdown(officialReport));
  writeOfficialIfraMarkdown(
    officialCandidatesMarkdownPath,
    formatOfficialIfraHarvestMarkdown({
      ...officialReport,
      noOfficialMatchFound: [],
      needsSupplierDocumentInstead: [],
      weakAmbiguousMatches: [],
    })
  );

  const beforeIds = idSet(beforeOfficialCandidates.candidates || []);
  const targetIds = new Set(targets.map((target) => target.queueItemId));
  const targetOfficialMatches = (officialReport.officialMatchesFound || []).filter((candidate) =>
    targetIds.has(candidate.queueItemId)
  );
  const newOfficialMatches = targetOfficialMatches.filter(
    (candidate) => !beforeIds.has(candidate.id)
  );
  return {
    report: officialReport,
    candidatesFile: officialCandidatesFile,
    officialSearchesAttempted: targets.length,
    newOfficialMatches,
    targetOfficialMatches,
    officialDownloadRecords: [...indexDownloads, ...pdfDownloads],
  };
}

function summarizeDownloads({ harvestReport = {}, officialRecords = [], discoveredDownloads = [] } = {}) {
  const harvestSummary = harvestReport.summary || {};
  const officialAttempted = officialRecords.length;
  const officialSucceeded = officialRecords.filter((record) =>
    ["downloaded", "skipped_cached"].includes(record.status)
  ).length;
  const officialFailed = officialRecords.filter((record) => record.status === "failed").length;
  const discoveredAttempted = discoveredDownloads.filter((record) =>
    ["downloaded", "skipped_cached", "failed"].includes(record.downloadStatus)
  ).length;
  const discoveredSucceeded = discoveredDownloads.filter((record) =>
    ["downloaded", "skipped_cached"].includes(record.downloadStatus)
  ).length;
  const discoveredFailed = discoveredDownloads.filter(
    (record) => record.downloadStatus === "failed"
  ).length;
  return {
    downloadsAttempted:
      (harvestSummary.downloadAttemptCount || 0) + officialAttempted + discoveredAttempted,
    downloadsSucceeded:
      (harvestSummary.downloadSuccessCount || 0) + officialSucceeded + discoveredSucceeded,
    downloadsFailed:
      (harvestSummary.downloadFailureCount || 0) + officialFailed + discoveredFailed,
  };
}

function summarizeNewSupplierDocs(downloads = []) {
  return downloads.filter(
    (link) =>
      DOC_DOWNLOAD_TYPES.has(link.sourceType) &&
      link.safeFollow &&
      !["blocked", "failed", "skipped_duplicate"].includes(link.downloadStatus)
  );
}

function buildAfterIndexes({
  targets = [],
  beforeInputs = {},
  pipelineResult = {},
  promotionReport = {},
  officialAcquisition = {},
  discoveredDownloads = [],
} = {}) {
  const targetIds = new Set(targets.map((target) => target.queueItemId));
  const beforeCandidateIds = idSet(candidatesFromExtractions(beforeInputs.candidateExtractions));
  const beforeProposedIds = idSet(proposedRecordsFromFile(beforeInputs.proposedRecords));
  const afterCandidates = candidatesFromExtractions(pipelineResult.candidateExtractions || {});
  const afterProposed = proposedRecordsFromFile(pipelineResult.proposedRecordsFile || {});
  const beforeReviewReadyIds = new Set(
    (beforeInputs.evidenceResolution.items || [])
      .filter((item) => REVIEW_READY_EVIDENCE_STATUSES.has(item.evidenceStatus))
      .map((item) => item.queueItemId)
  );
  const afterReviewReady = (pipelineResult.evidenceResolution?.items || []).filter(
    (item) =>
      targetIds.has(item.queueItemId) &&
      REVIEW_READY_EVIDENCE_STATUSES.has(item.evidenceStatus) &&
      !beforeReviewReadyIds.has(item.queueItemId)
  );

  return {
    newCandidateSnippets: afterCandidates.filter(
      (candidate) => !beforeCandidateIds.has(candidate.id) && isTargetRecord(candidate, targetIds)
    ),
    newProposedStructuredRecords: afterProposed.filter(
      (record) => !beforeProposedIds.has(record.id) && isTargetRecord(record, targetIds)
    ),
    newReviewReadyItems: afterReviewReady,
    remainingNeedsBetterSource: uniqueObjectsBy(
      [
        ...(pipelineResult.recommendations?.needsBetterSource || []),
        ...(pipelineResult.recommendations?.items || []).filter(
          (item) => item.recommendationStatus === "no_useful_evidence_found"
        ),
      ].filter((item) => targetIds.has(item.queueItemId)),
      (item) => item.queueItemId || item.materialName
    ),
    alreadyHandled: uniqueObjectsBy(
      [
        ...(pipelineResult.recommendations?.alreadyHandled || []),
        ...(promotionReport.opportunities || []).filter((item) =>
          ["already_promoted", "good_candidate_after_review", "special_case_only"].includes(
            item.classification
          )
        ),
      ],
      (item) => `${item.queueItemId || item.proposedRecordId || ""}|${item.materialName || ""}|${item.classification || item.recommendationStatus || ""}`
    ),
    newSupplierDocs: summarizeNewSupplierDocs(discoveredDownloads),
    newOfficialMatches: officialAcquisition.newOfficialMatches || [],
  };
}

function bestEvidenceForTarget(target, indexes) {
  const official = indexes.newOfficialMatches.find(
    (candidate) => candidate.queueItemId === target.queueItemId
  );
  if (official) {
    return {
      type: "official_ifra_standard",
      sourceType: official.sourceType,
      source: official.downloadUrl || official.sourceUrl || official.sourceFile || "",
      snippet: official.snippet || "",
    };
  }
  const snippet = indexes.newCandidateSnippets.find((candidate) =>
    (candidate.queueItemIds || []).includes(target.queueItemId)
  );
  if (snippet) {
    return {
      type: "candidate_snippet",
      sourceType: snippet.sourceType,
      source: snippet.sourceUrl || snippet.sourceFile || "",
      snippet: snippet.snippet || "",
    };
  }
  const doc = indexes.newSupplierDocs.find((link) =>
    (link.queueItemIds || []).includes(target.queueItemId)
  );
  if (doc) {
    return {
      type: ["downloaded", "skipped_cached"].includes(doc.downloadStatus)
        ? "supplier_document"
        : "supplier_document_link",
      sourceType: doc.sourceType,
      source: doc.sourceUrl || doc.localPath || "",
      snippet: doc.linkText || "",
    };
  }
  return {
    type: "",
    sourceType: "",
    source: "",
    snippet: "",
  };
}

function recommendationForTarget(target, pipelineResult = {}) {
  const recommendation = (pipelineResult.recommendations?.items || []).find(
    (item) => item.queueItemId === target.queueItemId
  );
  if (recommendation?.suggestedAction) return recommendation.suggestedAction;
  const resolution = (pipelineResult.evidenceResolution?.items || []).find(
    (item) => item.queueItemId === target.queueItemId
  );
  return resolution?.suggestedAction || "Continue review-first source acquisition.";
}

function buildMaterialResults({ targets = [], discoveredLinks = [], indexes, pipelineResult = {} } = {}) {
  const linksByTarget = new Map();
  for (const link of discoveredLinks) {
    for (const id of link.queueItemIds || []) {
      if (!linksByTarget.has(id)) linksByTarget.set(id, []);
      linksByTarget.get(id).push(link);
    }
  }
  const remainingIds = new Set(indexes.remainingNeedsBetterSource.map((item) => item.queueItemId));
  const proposedIds = new Set(indexes.newProposedStructuredRecords.map((item) => item.queueItemId));
  const reviewReadyIds = new Set(indexes.newReviewReadyItems.map((item) => item.queueItemId));
  const officialIds = new Set(indexes.newOfficialMatches.map((item) => item.queueItemId));
  const supplierDocIds = new Set(
    indexes.newSupplierDocs.flatMap((item) => item.queueItemIds || [])
  );
  const snippetIds = new Set(
    indexes.newCandidateSnippets.flatMap((item) => item.queueItemIds || [])
  );
  return targets.map((target) => {
    const evidence = bestEvidenceForTarget(target, indexes);
    const discoveredForTarget = linksByTarget.get(target.queueItemId) || [];
    let result = "still_unresolved";
    if (proposedIds.has(target.queueItemId)) result = "new_proposed_structured_record";
    else if (reviewReadyIds.has(target.queueItemId)) result = "new_review_ready_item";
    else if (officialIds.has(target.queueItemId)) result = "new_official_match";
    else if (supplierDocIds.has(target.queueItemId)) {
      const docs = indexes.newSupplierDocs.filter((item) =>
        (item.queueItemIds || []).includes(target.queueItemId)
      );
      result = docs.some((item) =>
        ["downloaded", "skipped_cached"].includes(item.downloadStatus)
      )
        ? "supplier_document_cached"
        : "supplier_document_link_found";
    }
    else if (snippetIds.has(target.queueItemId)) result = "new_candidate_snippet";
    else if (!discoveredForTarget.length && remainingIds.has(target.queueItemId)) {
      result = "no_source_found";
    }
    return {
      material: target.materialName,
      sourceIdentity: target.sourceIdentityName,
      queueItemId: target.queueItemId,
      formulasUsedIn: target.formulasUsedIn || [],
      priorStatus: target.priorStatus,
      acquisitionActionAttempted: [
        "official_ifra_source_match",
        "known_csv_supplier_link_harvest",
        discoveredForTarget.length
          ? "same_domain_supplier_document_link_discovery"
          : "cached_product_page_document_link_discovery",
      ],
      result,
      discoveredLinks: discoveredForTarget.map((link) => ({
        sourceType: link.sourceType,
        sourceUrl: link.sourceUrl,
        safeFollow: link.safeFollow,
        downloadStatus: link.downloadStatus,
        error: link.error || link.blockedReason || "",
      })),
      bestNewEvidence: evidence,
      nextAutomatedRecommendation: recommendationForTarget(target, pipelineResult),
    };
  });
}

function buildGroupedReportSections({ indexes, materialResults, discoveredDownloads = [] } = {}) {
  const remainingIds = new Set(indexes.remainingNeedsBetterSource.map((item) => item.queueItemId));
  return {
    newOfficialMatchesFound: indexes.newOfficialMatches.map((candidate) => ({
      material: candidate.materialName,
      sourceIdentity: candidate.sourceIdentityName,
      standardTitle: candidate.standardTitle,
      sourceUrl: candidate.downloadUrl || candidate.sourceUrl || "",
      sourceFile: candidate.officialPdfLocalFile || candidate.sourceFile || "",
      snippet: candidate.snippet || "",
    })),
    newSupplierIfraSdsSpecDocsFound: indexes.newSupplierDocs.map((link) => ({
      material: link.materialName,
      sourceIdentity: link.sourceIdentityName,
      sourceType: link.sourceType,
      sourceUrl: link.sourceUrl,
      localPath: link.localPath || "",
      downloadStatus: link.downloadStatus,
      discoveredFromUrl: link.discoveredFromUrl,
    })),
    newCandidateSnippetsFound: indexes.newCandidateSnippets.map((candidate) => ({
      material: candidate.materialName,
      sourceIdentity: candidate.sourceIdentityName,
      candidateLimitType: candidate.candidateLimitType,
      sourceType: candidate.sourceType,
      sourceUrl: candidate.sourceUrl,
      sourceFile: candidate.sourceFile,
      snippet: candidate.snippet,
    })),
    newProposedStructuredRecords: indexes.newProposedStructuredRecords.map((record) => ({
      material: record.materialName,
      sourceIdentity: record.sourceIdentityName,
      recordType: record.recordType,
      category: record.category,
      candidateValue: record.candidateValue,
      candidateUnit: record.candidateUnit,
      sourceType: record.sourceType,
      sourceUrl: record.sourceUrl,
      sourceFile: record.sourceFile,
    })),
    stillNeedsBetterSource: materialResults.filter(
      (item) => remainingIds.has(item.queueItemId) && item.result !== "no_source_found"
    ),
    noSourceFound: materialResults.filter((item) => item.result === "no_source_found"),
    skippedOrBlockedDownloads: discoveredDownloads
      .filter((link) => ["blocked", "failed", "skipped_duplicate"].includes(link.downloadStatus))
      .map((link) => ({
        material: link.materialName,
        sourceType: link.sourceType,
        sourceUrl: link.sourceUrl,
        status: link.downloadStatus,
        reason: link.error || link.blockedReason || "",
        discoveredFromUrl: link.discoveredFromUrl,
      })),
    alreadyHandled: indexes.alreadyHandled.map((item) => ({
      material: item.materialName,
      sourceIdentity: item.sourceIdentityName,
      status: item.recommendationStatus || item.classification || "already_handled",
      sourceType: item.sourceType || "",
      sourceUrl: item.sourceUrl || "",
      sourceFile: item.sourceFile || "",
    })),
  };
}

function nextAction(summary = {}) {
  if (
    summary.newLinksDiscovered > 0 &&
    summary.downloadsSucceeded === 0 &&
    summary.newSupplierIfraSdsSpecDocsFound > 0
  ) {
    return "Run with --download to cache the discovered same-domain supplier documents, then rerun review.";
  }
  if (summary.remainingNeedsBetterSource > 0) {
    return "Inspect newly cached supplier documents and rerun review before any separate promotion task.";
  }
  if (summary.newProposedStructuredRecords > 0) {
    return "Review proposed structured records one at a time; do not bulk promote.";
  }
  if (summary.newCandidateSnippets > 0) {
    return "Review new candidate snippets and mark only source-backed evidence accepted.";
  }
  return "Rerun acquisition when more known supplier links are added to the ingredient reference.";
}

export function buildIfraSourceAcquisitionAutopilotReport({
  generatedAt = new Date().toISOString(),
  downloadRequested = false,
  targets = [],
  officialAcquisition = {},
  harvestReport = {},
  productPagesInspected = [],
  discoveredDownloads = [],
  pipelineResult = {},
  promotionReport = {},
  beforeInputs = {},
} = {}) {
  const indexes = buildAfterIndexes({
    targets,
    beforeInputs,
    pipelineResult,
    promotionReport,
    officialAcquisition,
    discoveredDownloads,
  });
  const downloadSummary = summarizeDownloads({
    harvestReport,
    officialRecords: officialAcquisition.officialDownloadRecords || [],
    discoveredDownloads,
  });
  const materialResults = buildMaterialResults({
    targets,
    discoveredLinks: discoveredDownloads,
    indexes,
    pipelineResult,
  });
  const summary = {
    materialsTargeted: targets.length,
    officialSearchesAttempted: officialAcquisition.officialSearchesAttempted || 0,
    supplierPagesInspected: productPagesInspected.length,
    newLinksDiscovered: discoveredDownloads.length,
    ...downloadSummary,
    newOfficialMatchesFound: indexes.newOfficialMatches.length,
    newSupplierIfraSdsSpecDocsFound: indexes.newSupplierDocs.length,
    newCandidateSnippets: indexes.newCandidateSnippets.length,
    newReviewReadyItems: indexes.newReviewReadyItems.length,
    newProposedStructuredRecords: indexes.newProposedStructuredRecords.length,
    remainingNeedsBetterSource: indexes.remainingNeedsBetterSource.length,
  };
  summary.newSourcesFound =
    summary.newOfficialMatchesFound + summary.newSupplierIfraSdsSpecDocsFound;
  summary.nextAutomatedAction = nextAction(summary);

  return {
    metadata: {
      generatedAt,
      reportName: "IFRA Source Acquisition Autopilot v2",
      regenerateCommand: IFRA_SOURCE_ACQUISITION_AUTOPILOT_COMMAND,
      mode: downloadRequested ? "download" : "dry_run",
      guardrails: [
        "Uses existing local data, official IFRA harvest logic, known CSV links, and same-domain supplier document links only.",
        "No broad web search is used.",
        "No access controls are bypassed.",
        "No runtime IFRA limits are promoted.",
        "No formula, pricing, accord recipe, GCMS, AI behavior, or runtime IFRA classification is changed.",
        "No launch clearance is claimed.",
      ],
    },
    pipeline: {
      stepsRun: [
        "load_existing_ifra_source_acquisition_reports",
        "target_unresolved_materials",
        "refresh_official_ifra_candidates",
        "harvest_known_csv_supplier_links",
        downloadRequested ? "download_known_csv_links" : "reuse_cached_known_links",
        "discover_visible_same_domain_supplier_document_links",
        downloadRequested ? "download_visible_supplier_document_links" : "report_visible_supplier_document_links",
        "rerun_review_first_evidence_autopilot",
        "regenerate_ifra_promotion_opportunity_ranker",
      ],
      broadSearchUsed: false,
      runtimeIfraMutation: false,
    },
    summary,
    targets: targets.map((target) => ({
      material: target.materialName,
      sourceIdentity: target.sourceIdentityName,
      queueItemId: target.queueItemId,
      formulasUsedIn: target.formulasUsedIn,
      requiredSourceType: target.requiredSourceType,
      priority: target.priority,
      targetReasons: target.targetReasons,
      priorStatus: target.priorStatus,
    })),
    groups: buildGroupedReportSections({
      indexes,
      materialResults,
      discoveredDownloads,
    }),
    materialResults,
  };
}

function formatCountLine(label, value) {
  return `- ${label}: ${Number(value || 0).toLocaleString()}`;
}

function formatMaterialResult(item = {}) {
  const evidence = item.bestNewEvidence || {};
  return [
    `### ${item.material}`,
    "",
    `- Source identity: ${item.sourceIdentity || item.material}`,
    `- Formulas used in: ${(item.formulasUsedIn || []).join(", ") || "Unknown"}`,
    `- Prior status: ${[
      item.priorStatus?.queueStatus,
      item.priorStatus?.reviewStatus,
      item.priorStatus?.evidenceStatus,
      item.priorStatus?.recommendationStatus,
      item.priorStatus?.promotionClassification,
    ].filter(Boolean).join(" / ") || "Unknown"}`,
    `- Acquisition action attempted: ${(item.acquisitionActionAttempted || []).join(", ")}`,
    `- Result: ${item.result}`,
    `- Best new evidence: ${evidence.type ? `${evidence.type} from ${evidence.source || evidence.sourceType || "source"}` : "None"}`,
    evidence.snippet ? `- Evidence snippet: ${escapeMarkdown(evidence.snippet)}` : "",
    `- Next automated recommendation: ${item.nextAutomatedRecommendation}`,
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatSimpleGroup(items = [], formatter) {
  if (!items.length) return "_None._";
  return items.slice(0, 20).map(formatter).join("\n");
}

export function formatIfraSourceAcquisitionAutopilotMarkdown(report = {}) {
  const summary = report.summary || {};
  const groups = report.groups || {};
  return [
    "# IFRA Source Acquisition Autopilot Report",
    "",
    `Generated: ${report.metadata?.generatedAt || ""}`,
    "",
    "This is source acquisition and review-pipeline refresh only. It does not promote runtime IFRA limits, change formulas, or claim launch clearance.",
    "",
    "## Summary",
    "",
    formatCountLine("Materials targeted", summary.materialsTargeted),
    formatCountLine("Official searches attempted", summary.officialSearchesAttempted),
    formatCountLine("Supplier pages inspected", summary.supplierPagesInspected),
    formatCountLine("New links discovered", summary.newLinksDiscovered),
    formatCountLine("Downloads attempted", summary.downloadsAttempted),
    formatCountLine("Downloads succeeded", summary.downloadsSucceeded),
    formatCountLine("Downloads failed", summary.downloadsFailed),
    formatCountLine("New official matches found", summary.newOfficialMatchesFound),
    formatCountLine("New supplier IFRA/SDS/spec docs found", summary.newSupplierIfraSdsSpecDocsFound),
    formatCountLine("New candidate snippets", summary.newCandidateSnippets),
    formatCountLine("New review-ready items", summary.newReviewReadyItems),
    formatCountLine("New proposed structured records", summary.newProposedStructuredRecords),
    formatCountLine("Remaining needs-better-source", summary.remainingNeedsBetterSource),
    "",
    `Next automated action: ${summary.nextAutomatedAction || ""}`,
    "",
    "## New Official Matches Found",
    "",
    formatSimpleGroup(groups.newOfficialMatchesFound || [], (item) =>
      `- ${escapeMarkdown(item.material)}: ${escapeMarkdown(item.standardTitle || item.sourceUrl || "official match")}`
    ),
    "",
    "## New Supplier IFRA/SDS/Spec Docs Found",
    "",
    formatSimpleGroup(groups.newSupplierIfraSdsSpecDocsFound || [], (item) =>
      `- ${escapeMarkdown(item.material)}: ${escapeMarkdown(item.sourceType)} ${escapeMarkdown(item.sourceUrl || item.localPath)}`
    ),
    "",
    "## New Candidate Snippets Found",
    "",
    formatSimpleGroup(groups.newCandidateSnippetsFound || [], (item) =>
      `- ${escapeMarkdown(item.material)}: ${escapeMarkdown(item.candidateLimitType)} from ${escapeMarkdown(item.sourceUrl || item.sourceFile)}`
    ),
    "",
    "## New Proposed Structured Records",
    "",
    formatSimpleGroup(groups.newProposedStructuredRecords || [], (item) =>
      `- ${escapeMarkdown(item.material)}: ${escapeMarkdown(item.recordType)} ${escapeMarkdown(item.category || "")} ${escapeMarkdown(`${item.candidateValue || ""}${item.candidateUnit || ""}`)}`
    ),
    "",
    "## Still Needs Better Source",
    "",
    (groups.stillNeedsBetterSource || []).length
      ? (groups.stillNeedsBetterSource || []).map(formatMaterialResult).join("\n")
      : "_None._",
    "## No Source Found",
    "",
    (groups.noSourceFound || []).length
      ? (groups.noSourceFound || []).map(formatMaterialResult).join("\n")
      : "_None._",
    "## Skipped / Blocked Downloads",
    "",
    formatSimpleGroup(groups.skippedOrBlockedDownloads || [], (item) =>
      `- ${escapeMarkdown(item.material)}: ${escapeMarkdown(item.status)} ${escapeMarkdown(item.sourceUrl)} (${escapeMarkdown(item.reason)})`
    ),
    "",
    "## Already Handled",
    "",
    formatSimpleGroup(groups.alreadyHandled || [], (item) =>
      `- ${escapeMarkdown(item.material)}: ${escapeMarkdown(item.status)}`
    ),
  ].join("\n");
}

export function formatIfraSourceAcquisitionAutopilotText(report = {}) {
  const summary = report.summary || {};
  return [
    "IFRA Source Acquisition Autopilot v2",
    "",
    "Source acquisition and review refresh only. No runtime IFRA limits are promoted.",
    "",
    `Materials targeted: ${summary.materialsTargeted || 0}`,
    `Official searches attempted: ${summary.officialSearchesAttempted || 0}`,
    `Supplier pages inspected: ${summary.supplierPagesInspected || 0}`,
    `New links discovered: ${summary.newLinksDiscovered || 0}`,
    `Downloads attempted: ${summary.downloadsAttempted || 0}`,
    `Downloads succeeded: ${summary.downloadsSucceeded || 0}`,
    `Downloads failed: ${summary.downloadsFailed || 0}`,
    `New official matches found: ${summary.newOfficialMatchesFound || 0}`,
    `New supplier IFRA/SDS/spec docs found: ${summary.newSupplierIfraSdsSpecDocsFound || 0}`,
    `New candidate snippets: ${summary.newCandidateSnippets || 0}`,
    `New proposed structured records: ${summary.newProposedStructuredRecords || 0}`,
    `Remaining needs-better-source: ${summary.remainingNeedsBetterSource || 0}`,
    "",
    `Next: ${summary.nextAutomatedAction || "Review acquisition report."}`,
    "",
  ].join("\n");
}

export function writeIfraSourceAcquisitionAutopilotReport(filePath, report) {
  writeJson(filePath, report);
}

export async function runIfraSourceAcquisitionAutopilot({
  ingredientReferencePath,
  download = false,
  rateLimitMs = 350,
  generatedAt = new Date().toISOString(),
  root = DEFAULT_ROOT,
  sourceDocumentDir = DEFAULT_IFRA_SOURCE_DOCUMENT_DIR,
  autopilotCacheDir = DEFAULT_AUTOPILOT_CACHE_DIR,
  outputPath = DEFAULT_IFRA_SOURCE_ACQUISITION_AUTOPILOT_REPORT_PATH,
  sourceQueuePath = DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH,
  harvestReportPath = DEFAULT_INGREDIENT_SOURCE_HARVEST_REPORT_PATH,
  candidateExtractionsPath = DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH,
  evidenceResolutionPath = DEFAULT_IFRA_EVIDENCE_RESOLUTION_PATH,
  evidenceAutopilotReportPath = DEFAULT_IFRA_EVIDENCE_AUTOPILOT_REPORT_PATH,
  officialIfraSourceCandidatesPath = DEFAULT_OFFICIAL_IFRA_SOURCE_CANDIDATES_PATH,
  officialReportPath = DEFAULT_OFFICIAL_IFRA_HARVEST_REPORT_PATH,
  recommendationsPath = DEFAULT_IFRA_AUTOPILOT_RECOMMENDATIONS_PATH,
  proposedRecordsPath = DEFAULT_PROPOSED_IFRA_STRUCTURED_RECORDS_PATH,
  promotionOpportunitiesPath = DEFAULT_IFRA_PROMOTION_OPPORTUNITIES_PATH,
  fetchImpl = globalThis.fetch,
  officialAcquisitionRunner = runOfficialAcquisition,
  pipelineRunner = runIfraEvidenceAutopilot,
  promotionRanker = buildIfraPromotionOpportunityReportFromFiles,
  fileExists = fs.existsSync,
} = {}) {
  if (!ingredientReferencePath) {
    throw new Error("--ingredient-reference is required");
  }
  if (!fileExists(ingredientReferencePath)) {
    throw new Error(`Ingredient reference CSV not found: ${ingredientReferencePath}`);
  }

  const beforeInputs = loadInputFiles({
    sourceQueuePath,
    evidenceResolutionPath,
    recommendationsPath,
    promotionOpportunitiesPath,
    harvestReportPath,
    officialIfraSourceCandidatesPath,
    candidateExtractionsPath,
    proposedRecordsPath,
  });

  const targets = buildSourceAcquisitionTargets({
    sourceQueue: beforeInputs.sourceQueue,
    evidenceResolution: beforeInputs.evidenceResolution,
    autopilotRecommendations: beforeInputs.autopilotRecommendations,
    promotionOpportunities: beforeInputs.promotionOpportunities,
  });

  const officialAcquisition = await officialAcquisitionRunner({
    sourceQueue: beforeInputs.sourceQueue,
    targets,
    beforeOfficialCandidates: beforeInputs.officialCandidates,
    download,
    fetchImpl,
    generatedAt,
    root,
    officialReportPath,
    officialCandidatesPath: officialIfraSourceCandidatesPath,
  });

  let harvestReport = buildIngredientSourceHarvestReport({
    ingredientReferencePath,
    queue: beforeInputs.sourceQueue,
    generatedAt,
    download,
    root,
  });
  if (download) {
    harvestReport = await downloadHarvestSources({
      report: harvestReport,
      fetchImpl,
      rateLimitMs,
      root,
      sourceDir: sourceDocumentDir,
    });
  }
  writeIngredientSourceHarvestReport(harvestReportPath, harvestReport);

  const discovery = discoverLinksFromCachedProductPages({
    harvestReport,
    previousHarvestReport: beforeInputs.harvestReport,
    targets,
    sourceDir: sourceDocumentDir,
    root,
  });
  const discoveredDownloads = await cacheDiscoveredSupplierLinks({
    discoveredLinks: discovery.discoveredLinks,
    download,
    fetchImpl,
    rateLimitMs,
    sourceDir: sourceDocumentDir,
    cacheDir: autopilotCacheDir,
    root,
  });

  const pipelineResult = await pipelineRunner({
    ingredientReferencePath,
    download,
    rateLimitMs,
    generatedAt,
    sourceDocumentDir,
    sourceQueuePath,
    harvestReportPath,
    candidateExtractionsPath,
    evidenceResolutionPath,
    officialIfraSourceCandidatesPath,
    proposedRecordsPath,
    recommendationsPath,
    outputPath: evidenceAutopilotReportPath,
    fetchImpl,
  });

  const promotionReport = promotionRanker();
  writeIfraPromotionOpportunityReport(promotionOpportunitiesPath, promotionReport);

  const report = buildIfraSourceAcquisitionAutopilotReport({
    generatedAt,
    downloadRequested: download,
    targets,
    officialAcquisition,
    harvestReport: pipelineResult.harvestReport || harvestReport,
    productPagesInspected: discovery.productPagesInspected,
    discoveredDownloads,
    pipelineResult,
    promotionReport,
    beforeInputs,
  });
  writeIfraSourceAcquisitionAutopilotReport(outputPath, report);

  return {
    report,
    targets,
    officialAcquisition,
    harvestReport,
    productPagesInspected: discovery.productPagesInspected,
    discoveredDownloads,
    pipelineResult,
    promotionReport,
  };
}
