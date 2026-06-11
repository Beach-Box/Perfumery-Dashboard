import fs from "node:fs";
import path from "node:path";

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

export const OFFICIAL_IFRA_STANDARDS_LIBRARY_URL =
  "https://ifrafragrance.org/standards-library";
export const OFFICIAL_IFRA_TRANSPARENCY_LIST_URL =
  "https://ifrafragrance.org/transparency-list";
export const OFFICIAL_IFRA_STANDARDS_DOCUMENTATION_URL =
  "https://ifrafragrance.org/initiatives-positions/safe-use-fragrance-science/ifra-standards/ifra-standards-documentation";

export const OFFICIAL_IFRA_CACHE_DIR = path.join(
  DEFAULT_IFRA_SOURCE_DOCUMENT_DIR,
  "official_ifra"
);
export const OFFICIAL_IFRA_STANDARDS_CACHE_DIR = path.join(
  OFFICIAL_IFRA_CACHE_DIR,
  "standards"
);
export const OFFICIAL_IFRA_TRANSPARENCY_CACHE_DIR = path.join(
  OFFICIAL_IFRA_CACHE_DIR,
  "transparency"
);

export const DEFAULT_IFRA_MASTER_STANDARDS_PATH = path.join(
  DEFAULT_ROOT,
  "src",
  "data",
  "ifra_master_standards.json"
);

export const DEFAULT_OFFICIAL_IFRA_SOURCE_CANDIDATES_PATH = path.join(
  DEFAULT_ROOT,
  "data",
  "ifra_source_acquisition",
  "official_ifra_source_candidates.json"
);

export const DEFAULT_OFFICIAL_IFRA_SOURCE_CANDIDATES_MARKDOWN_PATH = path.join(
  DEFAULT_ROOT,
  "docs",
  "ifra",
  "official_ifra_source_candidates.md"
);

export const DEFAULT_OFFICIAL_IFRA_HARVEST_REPORT_MARKDOWN_PATH = path.join(
  DEFAULT_ROOT,
  "docs",
  "ifra",
  "official_ifra_harvest_report.md"
);

export const OFFICIAL_IFRA_HARVEST_COMMAND =
  "node scripts/harvest_official_ifra_sources.mjs --markdown --write docs/ifra/official_ifra_harvest_report.md";

const CAS_RE = /\b\d{2,7}-\d{2}-\d\b/g;
const CAS_TEST_RE = /\b\d{2,7}-\d{2}-\d\b/;
const STANDARD_SOURCE_TYPES = new Set([
  "official_ifra_standard_library",
  "official_ifra_standard_pdf",
]);
const SOURCE_TYPES_REQUIRING_SUPPLIER_DOCS = new Set([
  "supplier_ifra_or_sds_needed",
  "specialty_supplier_document_needed",
  "natural_uvcb_supplier_document_needed",
  "fcf_special_case",
]);
const GENERIC_QUERY_WORDS = new Set([
  "cas",
  "ifra",
  "sds",
  "supplier",
  "product",
  "standard",
  "category",
  "cat",
  "source",
  "document",
]);
const FCF_RE = /\b(?:fcf|furocoumarin[\s-]*free|bergapten[\s-]*free)\b/i;

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

function normalizeText(value) {
  return normalizeReviewText(value);
}

function decodeHtmlEntities(value = "") {
  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value = "") {
  return decodeHtmlEntities(
    String(value)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function stripWrappingQuotes(value = "") {
  return decodeHtmlEntities(String(value || ""))
    .replace(/\\"/g, '"')
    .replace(/^"+|"+$/g, "")
    .trim();
}

function extractHref(value = "") {
  const match = String(value).match(/\bhref\s*=\s*["']([^"']+)["']/i);
  return match ? decodeHtmlEntities(match[1]).trim() : "";
}

function resolveOfficialUrl(url = "", baseUrl = OFFICIAL_IFRA_STANDARDS_LIBRARY_URL) {
  if (!url) return "";
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

function extractCasTerms(values = []) {
  return uniqueStrings(
    values.flatMap((value) => String(value || "").match(CAS_RE) || [])
  );
}

function splitNameTerms(value = "") {
  return String(value || "")
    .replace(/^IFRA\s+/i, "")
    .replace(/\bSDS\b/gi, "")
    .replace(/\bCAS\s+\d{2,7}-\d{2}-\d\b/gi, "")
    .split(/\s*(?:\/|\||;|,|\bor\b)\s*/i)
    .map(stripSourceDilutionTerms)
    .map((term) => term.replace(/^IFRA\s+/i, "").trim())
    .filter(Boolean);
}

function isUsefulNameTerm(value = "") {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  if (CAS_TEST_RE.test(value)) return false;
  const tokens = normalized.split(" ").filter((token) => !GENERIC_QUERY_WORDS.has(token));
  if (tokens.length >= 2) return true;
  return tokens.length === 1 && tokens[0].length >= 5 && /[a-z]/.test(tokens[0]);
}

function typeLabel(value = "") {
  const text = normalizeText(value);
  if (!text) return "";
  if (text === "r" || text.includes("restriction")) return "Restriction";
  if (text === "s" || text.includes("specification")) return "Specification";
  if (text === "p" || text.includes("prohibition")) return "Prohibition";
  return String(value || "").trim();
}

function candidateLimitTypeForStandardType(standardType = "") {
  const normalized = normalizeText(standardType);
  if (normalized.includes("restriction")) return "ifra_category_limit";
  if (normalized.includes("prohibition") || normalized.includes("specification")) {
    return "allergen_or_restriction";
  }
  return "allergen_or_restriction";
}

function loadJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function walkFiles(directory, predicate = () => true) {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.name.startsWith(".")) return [];
    if (entry.isDirectory()) return walkFiles(filePath, predicate);
    if (!entry.isFile()) return [];
    return predicate(filePath) ? [filePath] : [];
  });
}

function rowCells(rowHtml = "") {
  return [...String(rowHtml).matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
    (match) => stripTags(match[1])
  );
}

function rowDownloadUrl(rowHtml = "", baseUrl = OFFICIAL_IFRA_STANDARDS_LIBRARY_URL) {
  const downloadAnchor =
    [...String(rowHtml).matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)]
      .map((match) => match[0])
      .find((anchor) => /download/i.test(stripTags(anchor))) || "";
  return resolveOfficialUrl(extractHref(downloadAnchor), baseUrl);
}

function normalizeCasCell(value = "") {
  return extractCasTerms([value]);
}

function parseOfficialStandardsDataLayerRows(
  html = "",
  { sourceUrl = OFFICIAL_IFRA_STANDARDS_LIBRARY_URL } = {}
) {
  return [...String(html).matchAll(/<a\b[^>]*\bdata-layer\s*=\s*(["'])([\s\S]*?)\1[^>]*>/gi)]
    .map((match) => {
      const anchorHtml = match[0];
      const decodedDataLayer = decodeHtmlEntities(match[2]);
      let data = null;
      try {
        data = JSON.parse(decodedDataLayer);
      } catch {
        return null;
      }
      if (normalizeText(data?.document_type) !== "standards") return null;
      const title = stripWrappingQuotes(data.document_name || "");
      const cas = normalizeCasCell(data.cas_number || "");
      const downloadUrl = resolveOfficialUrl(extractHref(anchorHtml), sourceUrl);
      if (!title || !cas.length || !downloadUrl) return null;
      return {
        standardTitle: title,
        cas,
        standardType: typeLabel(data.type || ""),
        amendment: String(data.amendment || "").trim(),
        publicationDate: String(data.publication_date || "").trim(),
        status: String(data.status || "").trim(),
        sourceUrl,
        downloadUrl,
        sourceType: "official_ifra_standard_library",
        sourceOrigin: "official_ifra_cached_page",
      };
    })
    .filter(Boolean);
}

export function parseOfficialStandardsLibraryHtml(
  html = "",
  { sourceUrl = OFFICIAL_IFRA_STANDARDS_LIBRARY_URL } = {}
) {
  const tableRows = [...String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match) => match[0])
    .map((rowHtml) => {
      const cells = rowCells(rowHtml);
      if (cells.length < 5) return null;
      const joined = normalizeText(cells.join(" "));
      if (joined.includes("cas") && joined.includes("title") && joined.includes("amendment")) {
        return null;
      }
      const [casCell, titleCell, typeCell, publicationDateCell, amendmentCell, statusCell] = cells;
      const title = stripWrappingQuotes(titleCell);
      const cas = normalizeCasCell(casCell);
      if (!title || !cas.length) return null;
      return {
        standardTitle: title,
        cas,
        standardType: typeLabel(typeCell),
        amendment: String(amendmentCell || "").trim(),
        publicationDate: String(publicationDateCell || "").trim(),
        status: String(statusCell || "").trim(),
        sourceUrl,
        downloadUrl: rowDownloadUrl(rowHtml, sourceUrl),
        sourceType: "official_ifra_standard_library",
        sourceOrigin: "official_ifra_cached_page",
      };
    })
    .filter(Boolean);
  const dataLayerRows = parseOfficialStandardsDataLayerRows(html, { sourceUrl });
  const rows = [...tableRows, ...dataLayerRows];
  return uniqueObjectsBy(rows, (row) =>
    `${normalizeText(row.standardTitle)}|${row.cas.join(",")}|${row.amendment}`
  );
}

export function parseOfficialTransparencyListHtml(
  html = "",
  { sourceUrl = OFFICIAL_IFRA_TRANSPARENCY_LIST_URL } = {}
) {
  const rows = [...String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match) => rowCells(match[0]))
    .map((cells) => {
      if (cells.length < 2) return null;
      const joined = normalizeText(cells.join(" "));
      if (joined.includes("cas") && joined.includes("principal name")) return null;
      const [casCell, principalNameCell, naturalsCategoryCell] = cells;
      const principalName = stripWrappingQuotes(principalNameCell);
      const cas = normalizeCasCell(casCell);
      if (!principalName || !cas.length) return null;
      return {
        principalName,
        cas,
        naturalsCategory: String(naturalsCategoryCell || "").trim(),
        sourceUrl,
        sourceType: "official_ifra_transparency_list",
        sourceOrigin: "official_ifra_cached_page",
      };
    })
    .filter(Boolean);
  return uniqueObjectsBy(rows, (row) =>
    `${normalizeText(row.principalName)}|${row.cas.join(",")}`
  );
}

function loadMasterStandardRows(masterStandardsPath = DEFAULT_IFRA_MASTER_STANDARDS_PATH) {
  const payload = loadJsonIfPresent(masterStandardsPath) || {};
  const rows = Array.isArray(payload) ? payload : payload.standards || [];
  return rows.map((row) => ({
    standardTitle: row.canonical_name || row.standardTitle || row.title || "",
    cas: uniqueStrings([...(row.cas_numbers || []), ...(row.cas || [])]),
    standardType: typeLabel(row.standard_type || row.standardType || row.type || ""),
    amendment: row.amendment ? String(row.amendment) : "",
    publicationDate: row.publication_year ? String(row.publication_year) : "",
    status: row.status || "",
    sourceUrl: OFFICIAL_IFRA_STANDARDS_LIBRARY_URL,
    downloadUrl: "",
    localFile: toRepoRelative(masterStandardsPath),
    sourceType: "official_ifra_standard_library",
    sourceOrigin: "structured_master_standards",
    categoryLimits: row.category_limits || row.categoryLimits || {},
    sourceDocument: row.source_document || "",
    synonyms: uniqueStrings(row.synonyms || []),
  }));
}

function loadCachedOfficialStandards({
  cacheDir = OFFICIAL_IFRA_CACHE_DIR,
  root = DEFAULT_ROOT,
} = {}) {
  const htmlFiles = walkFiles(cacheDir, (filePath) => /\.html?$/i.test(filePath));
  return htmlFiles.flatMap((filePath) => {
    const metadataPath = `${filePath}.metadata.json`;
    const metadata = loadJsonIfPresent(metadataPath) || {};
    if (
      metadata.sourceType &&
      !["official_ifra_standards_library", "official_ifra_standard_library"].includes(
        metadata.sourceType
      )
    ) {
      return [];
    }
    const sourceUrl = metadata.sourceUrl || OFFICIAL_IFRA_STANDARDS_LIBRARY_URL;
    return parseOfficialStandardsLibraryHtml(fs.readFileSync(filePath, "utf8"), {
      sourceUrl,
    }).map((row) => ({
      ...row,
      localFile: toRepoRelative(filePath, root),
      metadataFile: fs.existsSync(metadataPath)
        ? toRepoRelative(metadataPath, root)
        : "",
    }));
  });
}

function attachCachedOfficialDownloadLinks(masterStandards = [], cachedStandards = []) {
  return masterStandards.map((standard) => {
    const standardCas = new Set(standard.cas || []);
    const standardTitle = normalizeText(standard.standardTitle);
    const cachedMatch = cachedStandards.find((cached) => {
      const hasCasMatch = (cached.cas || []).some((cas) => standardCas.has(cas));
      const hasTitleMatch =
        standardTitle &&
        normalizeText(cached.standardTitle) &&
        standardTitle === normalizeText(cached.standardTitle);
      return hasCasMatch || hasTitleMatch;
    });
    if (!cachedMatch?.downloadUrl) return standard;
    return {
      ...standard,
      downloadUrl: cachedMatch.downloadUrl,
      sourceUrl: cachedMatch.sourceUrl || standard.sourceUrl,
      officialLibraryLocalFile: cachedMatch.localFile || "",
      officialLibraryMetadataFile: cachedMatch.metadataFile || "",
    };
  });
}

function attachDownloadedOfficialPdfRecords(candidates = [], downloadedPdfs = []) {
  const pdfRecordsByUrl = new Map(
    downloadedPdfs
      .filter(
        (item) =>
          item.sourceType === "official_ifra_standard_pdf" &&
          item.sourceUrl &&
          ["downloaded", "skipped_cached"].includes(item.status)
      )
      .map((item) => [item.sourceUrl, item])
  );
  return candidates.map((candidate) => {
    const pdfRecord = pdfRecordsByUrl.get(candidate.downloadUrl);
    if (!pdfRecord?.localPath) return candidate;
    return {
      ...candidate,
      officialPdfLocalFile: pdfRecord.localPath,
      officialPdfMetadataFile: pdfRecord.metadataPath || "",
    };
  });
}

function loadCachedOfficialTransparency({
  cacheDir = OFFICIAL_IFRA_TRANSPARENCY_CACHE_DIR,
  root = DEFAULT_ROOT,
} = {}) {
  const htmlFiles = walkFiles(cacheDir, (filePath) => /\.html?$/i.test(filePath));
  return htmlFiles.flatMap((filePath) => {
    const metadataPath = `${filePath}.metadata.json`;
    const metadata = loadJsonIfPresent(metadataPath) || {};
    if (
      metadata.sourceType &&
      metadata.sourceType !== "official_ifra_transparency_list"
    ) {
      return [];
    }
    const sourceUrl = metadata.sourceUrl || OFFICIAL_IFRA_TRANSPARENCY_LIST_URL;
    return parseOfficialTransparencyListHtml(fs.readFileSync(filePath, "utf8"), {
      sourceUrl,
    }).map((row) => ({
      ...row,
      localFile: toRepoRelative(filePath, root),
      metadataFile: fs.existsSync(metadataPath)
        ? toRepoRelative(metadataPath, root)
        : "",
    }));
  });
}

function buildQueueProfile(queueItem = {}) {
  const sourceIdentity = buildIfraSourceIdentity(queueItem.materialName || "", {
    extraSearchTerms: [
      queueItem.normalizedName,
      queueItem.sourceIdentityName,
      ...(queueItem.sourceSearchTerms || []),
      ...(queueItem.candidateSearchTerms || []),
    ],
  });
  const rawTerms = uniqueStrings([
    queueItem.materialName,
    queueItem.normalizedName,
    queueItem.sourceIdentityName,
    queueItem.activeMaterialName,
    sourceIdentity.sourceIdentityName,
    ...(sourceIdentity.sourceSearchTerms || []),
    ...(queueItem.sourceSearchTerms || []),
    ...(queueItem.candidateSearchTerms || []),
    ...(queueItem.sourceRowNames || []),
  ]);
  const nameTerms = uniqueStrings(rawTerms.flatMap(splitNameTerms)).filter(isUsefulNameTerm);
  return {
    queueItem,
    materialName: queueItem.materialName || "",
    sourceIdentityName:
      queueItem.sourceIdentityName ||
      sourceIdentity.sourceIdentityName ||
      queueItem.normalizedName ||
      queueItem.materialName ||
      "",
    nameTerms,
    normalizedNameTerms: nameTerms.map(normalizeText),
    cas: extractCasTerms(rawTerms),
  };
}

function standardNameTerms(standard = {}) {
  return uniqueStrings([
    standard.standardTitle,
    ...(standard.synonyms || []),
  ]).map((term) => ({
    raw: term,
    normalized: normalizeText(term),
  }));
}

function matchStandardToProfile(standard = {}, profile = {}) {
  const standardCas = new Set(standard.cas || []);
  const casMatches = (profile.cas || []).filter((cas) => standardCas.has(cas));
  if (casMatches.length) {
    return {
      matchType: "cas",
      matchConfidence: "high",
      matchedTerms: casMatches,
    };
  }

  const terms = standardNameTerms(standard);
  const profileTerms = new Set(profile.normalizedNameTerms || []);
  const exactTitle = terms.find((term) => profileTerms.has(term.normalized));
  if (exactTitle) {
    const matchType =
      normalizeText(exactTitle.raw) === normalizeText(standard.standardTitle)
        ? "exact_title"
        : "alias";
    return {
      matchType,
      matchConfidence: "high",
      matchedTerms: [exactTitle.raw],
    };
  }

  const sourceIdentityNormalized = normalizeText(profile.sourceIdentityName);
  if (
    sourceIdentityNormalized &&
    terms.some((term) => term.normalized === sourceIdentityNormalized)
  ) {
    return {
      matchType: "source_identity",
      matchConfidence: "high",
      matchedTerms: [profile.sourceIdentityName],
    };
  }

  return null;
}

function isFcfProfile(profile = {}) {
  return FCF_RE.test(
    [
      profile.materialName,
      profile.sourceIdentityName,
      profile.queueItem?.requiredSourceType,
      ...(profile.queueItem?.candidateSearchTerms || []),
    ].join(" ")
  );
}

function standardSupportsFcfIdentity(standard = {}) {
  return FCF_RE.test(
    [
      standard.standardTitle,
      ...(standard.synonyms || []),
      standard.sourceDocument,
    ].join(" ")
  );
}

function isUnsafeFcfStandardMatch(standard = {}, profile = {}) {
  return isFcfProfile(profile) && !standardSupportsFcfIdentity(standard);
}

function weakStandardMatches(standardRows = [], profile = {}) {
  const profileTerms = profile.normalizedNameTerms || [];
  return standardRows
    .filter((standard) => !isUnsafeFcfStandardMatch(standard, profile))
    .map((standard) => {
      const title = normalizeText(standard.standardTitle);
      const matchedTerms = profileTerms.filter(
        (term) =>
          term &&
          term.length >= 6 &&
          title &&
          title !== term &&
          (title.includes(term) || term.includes(title))
      );
      return matchedTerms.length
        ? {
            materialName: profile.materialName,
            sourceIdentityName: profile.sourceIdentityName,
            standardTitle: standard.standardTitle,
            cas: standard.cas || [],
            standardType: standard.standardType || "",
            amendment: standard.amendment || "",
            matchType: "weak_substring",
            matchConfidence: "low",
            matchedTerms: uniqueStrings(matchedTerms).slice(0, 3),
            notes: [
              "Weak substring match only; not auto-linked as an official source candidate.",
            ],
          }
        : null;
    })
    .filter(Boolean)
    .slice(0, 3);
}

function matchTransparencyToProfile(row = {}, profile = {}) {
  const rowCas = new Set(row.cas || []);
  const casMatches = (profile.cas || []).filter((cas) => rowCas.has(cas));
  if (casMatches.length) {
    return {
      matchType: "transparency_identity",
      matchConfidence: "high",
      matchedTerms: casMatches,
    };
  }
  const principalName = normalizeText(row.principalName);
  const profileTerms = new Set(profile.normalizedNameTerms || []);
  if (principalName && profileTerms.has(principalName)) {
    return {
      matchType: "transparency_identity",
      matchConfidence: "medium",
      matchedTerms: [row.principalName],
    };
  }
  return null;
}

function cat4LimitFromStandard(standard = {}) {
  const cat4 = standard.categoryLimits?.cat4 || standard.categoryLimits?.["4"] || null;
  if (!cat4) return {};
  if (cat4.kind === "no_restriction") {
    return {
      category: "4",
      candidateValue: "No restriction",
      candidateUnit: "",
    };
  }
  return {
    category: "4",
    candidateValue:
      cat4.value == null || cat4.value === "" ? "" : String(cat4.value),
    candidateUnit: cat4.unit || "",
  };
}

function buildStandardCandidate({ profile, standard, match }) {
  const cat4 = cat4LimitFromStandard(standard);
  const candidateLimitType = candidateLimitTypeForStandardType(standard.standardType);
  const sourceFile = standard.localFile || "";
  const sourceUrl = standard.downloadUrl || standard.sourceUrl || OFFICIAL_IFRA_STANDARDS_LIBRARY_URL;
  const id = [
    "official-ifra",
    profile.queueItem.id,
    candidateLimitType,
    match.matchType,
    standard.standardTitle,
  ]
    .map(slugifyReviewText)
    .join("-")
    .slice(0, 180);
  const snippetParts = [
    `Official IFRA Standards Library match for ${standard.standardTitle}.`,
    standard.standardType ? `Type: ${standard.standardType}.` : "",
    standard.amendment ? `Amendment: ${standard.amendment}.` : "",
    standard.publicationDate ? `Publication date: ${standard.publicationDate}.` : "",
    cat4.category
      ? cat4.candidateValue === "No restriction"
        ? "Category 4: No restriction."
        : `Category 4: ${cat4.candidateValue}${cat4.candidateUnit || ""}.`
      : "Category 4 value not captured in this candidate; review source document.",
  ];
  return {
    id,
    materialName: profile.materialName,
    formulaMaterialName: profile.materialName,
    sourceIdentityName: profile.sourceIdentityName,
    materialNames: [profile.materialName],
    sourceIdentityNames: [profile.sourceIdentityName],
    queueItemId: profile.queueItem.id,
    queueItemIds: [profile.queueItem.id],
    sourceType: standard.sourceType || "official_ifra_standard_library",
    matchType: match.matchType,
    matchConfidence: match.matchConfidence,
    queueLinkConfidence: match.matchConfidence,
    standardTitle: standard.standardTitle || "",
    cas: standard.cas || [],
    standardType: standard.standardType || "",
    amendment: standard.amendment || "",
    publicationDate: standard.publicationDate || "",
    status: standard.status || "",
    downloadUrl: standard.downloadUrl || "",
    sourceUrl,
    sourceFile,
    localFile: sourceFile,
    officialLibraryLocalFile: standard.officialLibraryLocalFile || "",
    officialLibraryMetadataFile: standard.officialLibraryMetadataFile || "",
    candidateUse: "standard_candidate",
    reviewStatus: "needs_review",
    candidateLimitType,
    reviewPriority: "high",
    category: cat4.category || "",
    candidateValue: cat4.candidateValue || "",
    candidateUnit: cat4.candidateUnit || "",
    snippet: snippetParts.filter(Boolean).join(" "),
    notes: [
      "Official IFRA source candidate; review before structured promotion.",
      "This candidate does not update runtime IFRA limits.",
      standard.sourceOrigin === "structured_master_standards"
        ? "Matched through committed structured master standards."
        : "Matched through cached official IFRA Standards Library data.",
    ],
  };
}

function buildTransparencyCandidate({ profile, transparencyRow, match }) {
  const id = [
    "official-ifra-transparency",
    profile.queueItem.id,
    match.matchType,
    transparencyRow.principalName,
  ]
    .map(slugifyReviewText)
    .join("-")
    .slice(0, 180);
  return {
    id,
    materialName: profile.materialName,
    formulaMaterialName: profile.materialName,
    sourceIdentityName: profile.sourceIdentityName,
    materialNames: [profile.materialName],
    sourceIdentityNames: [profile.sourceIdentityName],
    queueItemId: profile.queueItem.id,
    queueItemIds: [profile.queueItem.id],
    sourceType: "official_ifra_transparency_list",
    matchType: match.matchType,
    matchConfidence: match.matchConfidence,
    queueLinkConfidence: match.matchConfidence,
    standardTitle: "",
    principalName: transparencyRow.principalName || "",
    cas: transparencyRow.cas || [],
    standardType: "",
    amendment: "",
    publicationDate: "",
    downloadUrl: "",
    sourceUrl: transparencyRow.sourceUrl || OFFICIAL_IFRA_TRANSPARENCY_LIST_URL,
    sourceFile: transparencyRow.localFile || "",
    localFile: transparencyRow.localFile || "",
    candidateUse: "identity_support",
    reviewStatus: "needs_review",
    candidateLimitType: "identity",
    reviewPriority: "low",
    category: "",
    candidateValue: "",
    candidateUnit: "",
    snippet: [
      `Official IFRA Transparency List identity support for ${transparencyRow.principalName}.`,
      transparencyRow.cas?.length ? `CAS: ${transparencyRow.cas.join(", ")}.` : "",
      transparencyRow.naturalsCategory
        ? `Naturals category: ${transparencyRow.naturalsCategory}.`
        : "",
    ]
      .filter(Boolean)
      .join(" "),
    notes: [
      "Transparency List is identity support only.",
      "Do not use Transparency List rows as IFRA category-limit data.",
    ],
  };
}

function candidateSort(left = {}, right = {}) {
  const confidenceOrder = { high: 0, medium: 1, low: 2 };
  const useOrder = { standard_candidate: 0, identity_support: 1 };
  const confidenceDelta =
    (confidenceOrder[left.matchConfidence] ?? 9) -
    (confidenceOrder[right.matchConfidence] ?? 9);
  if (confidenceDelta) return confidenceDelta;
  const useDelta = (useOrder[left.candidateUse] ?? 9) - (useOrder[right.candidateUse] ?? 9);
  if (useDelta) return useDelta;
  return String(left.materialName || "").localeCompare(String(right.materialName || ""));
}

function summarizeOfficialHarvest({ candidates, queueItems, weakMatches, downloadedPdfs = [] }) {
  const standardCandidates = candidates.filter(
    (candidate) => candidate.candidateUse === "standard_candidate"
  );
  const identitySupport = candidates.filter(
    (candidate) => candidate.candidateUse === "identity_support"
  );
  const matchedQueueIds = new Set(candidates.map((candidate) => candidate.queueItemId));
  const noOfficialMatchCount = queueItems.filter((item) => !matchedQueueIds.has(item.id)).length;
  const needsSupplierDocumentInsteadCount = queueItems.filter(
    (item) =>
      SOURCE_TYPES_REQUIRING_SUPPLIER_DOCS.has(item.requiredSourceType) &&
      !standardCandidates.some((candidate) => candidate.queueItemId === item.id)
  ).length;
  const officialDownloadSuccessCount = downloadedPdfs.filter((item) =>
    ["downloaded", "skipped_cached"].includes(item.status)
  ).length;
  const officialDownloadFailureCount = downloadedPdfs.filter(
    (item) => item.status === "failed"
  ).length;
  return {
    queueItemCount: queueItems.length,
    candidateCount: candidates.length,
    officialStandardCandidateCount: standardCandidates.length,
    officialIdentitySupportCount: identitySupport.length,
    noOfficialMatchCount,
    needsSupplierDocumentInsteadCount,
    weakAmbiguousMatchCount: weakMatches.length,
    officialDownloadAttemptCount: downloadedPdfs.length,
    officialDownloadSuccessCount,
    officialDownloadFailureCount,
    officialPageCacheCount: downloadedPdfs.filter(
      (item) =>
        [
          "official_ifra_standards_library",
          "official_ifra_transparency_list",
          "official_ifra_standards_documentation",
        ].includes(item.sourceType) && ["downloaded", "skipped_cached"].includes(item.status)
    ).length,
    officialPdfDownloadAttemptCount: downloadedPdfs.filter(
      (item) => item.sourceType === "official_ifra_standard_pdf"
    ).length,
    officialPdfDownloadFailureCount: downloadedPdfs.filter(
      (item) => item.sourceType === "official_ifra_standard_pdf" && item.status === "failed"
    ).length,
    downloadedPdfCount: downloadedPdfs.filter(
      (item) =>
        item.sourceType === "official_ifra_standard_pdf" &&
        ["downloaded", "skipped_cached"].includes(item.status)
    ).length,
    candidateUseCounts: countBy(candidates, "candidateUse"),
    sourceTypeCounts: countBy(candidates, "sourceType"),
    matchTypeCounts: countBy(candidates, "matchType"),
    matchConfidenceCounts: countBy(candidates, "matchConfidence"),
  };
}

export function buildOfficialIfraHarvestReport({
  sourceQueue = loadExistingHeroIfraSourceQueue(DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH),
  masterStandardsPath = DEFAULT_IFRA_MASTER_STANDARDS_PATH,
  cacheDir = OFFICIAL_IFRA_CACHE_DIR,
  generatedAt = new Date().toISOString(),
  downloadedPdfs = [],
  root = DEFAULT_ROOT,
} = {}) {
  const queueItems = Array.isArray(sourceQueue?.items) ? sourceQueue.items : [];
  const profiles = queueItems.map(buildQueueProfile);
  const cachedStandards = loadCachedOfficialStandards({ cacheDir, root });
  const masterStandards = attachCachedOfficialDownloadLinks(
    loadMasterStandardRows(masterStandardsPath),
    cachedStandards
  );
  const transparencyRows = loadCachedOfficialTransparency({
    cacheDir: path.join(cacheDir, "transparency"),
    root,
  });

  const candidates = [];
  const weakMatches = [];
  const noOfficialMatchFound = [];
  const needsSupplierDocumentInstead = [];

  for (const profile of profiles) {
    const masterMatches = masterStandards
      .map((standard) => ({ standard, match: matchStandardToProfile(standard, profile) }))
      .filter((entry) => entry.match && !isUnsafeFcfStandardMatch(entry.standard, profile))
      .map((entry) => buildStandardCandidate({ profile, ...entry }));
    const officialPageMatches = masterMatches.length
      ? []
      : cachedStandards
          .map((standard) => ({
            standard,
            match: matchStandardToProfile(standard, profile),
          }))
          .filter((entry) => entry.match && !isUnsafeFcfStandardMatch(entry.standard, profile))
          .map((entry) => buildStandardCandidate({ profile, ...entry }));
    const standardCandidates = [...masterMatches, ...officialPageMatches];
    candidates.push(...standardCandidates);

    const transparencyMatches = transparencyRows
      .map((transparencyRow) => ({
        transparencyRow,
        match: matchTransparencyToProfile(transparencyRow, profile),
      }))
      .filter((entry) => entry.match)
      .map((entry) => buildTransparencyCandidate({ profile, ...entry }));
    candidates.push(...transparencyMatches);

    if (!standardCandidates.length) {
      weakMatches.push(...weakStandardMatches([...masterStandards, ...cachedStandards], profile));
    }
    if (!standardCandidates.length && !transparencyMatches.length) {
      noOfficialMatchFound.push({
        queueItemId: profile.queueItem.id,
        materialName: profile.materialName,
        sourceIdentityName: profile.sourceIdentityName,
        requiredSourceType: profile.queueItem.requiredSourceType || "",
        recommendedNextAction: SOURCE_TYPES_REQUIRING_SUPPLIER_DOCS.has(
          profile.queueItem.requiredSourceType
        )
          ? "Acquire supplier IFRA/SDS or product-specific document."
          : "Search official IFRA Standards Library by exact CAS/title or upload official PDF.",
      });
    }
    if (
      SOURCE_TYPES_REQUIRING_SUPPLIER_DOCS.has(profile.queueItem.requiredSourceType) &&
      !standardCandidates.length
    ) {
      needsSupplierDocumentInstead.push({
        queueItemId: profile.queueItem.id,
        materialName: profile.materialName,
        sourceIdentityName: profile.sourceIdentityName,
        requiredSourceType: profile.queueItem.requiredSourceType,
        recommendedNextAction:
          "Official IFRA match was not enough; acquire supplier IFRA/SDS for product-specific launch review.",
      });
    }
  }

  const dedupedCandidates = attachDownloadedOfficialPdfRecords(
    uniqueObjectsBy(candidates, (candidate) => candidate.id).sort(candidateSort),
    downloadedPdfs
  );
  const dedupedWeakMatches = uniqueObjectsBy(
    weakMatches,
    (match) => `${match.materialName}|${match.standardTitle}|${match.matchedTerms?.join(",")}`
  );

  return {
    metadata: {
      generatedAt,
      reportName: "Official IFRA Source Harvest",
      regenerateCommand: OFFICIAL_IFRA_HARVEST_COMMAND,
      officialSources: {
        standardsLibrary: OFFICIAL_IFRA_STANDARDS_LIBRARY_URL,
        transparencyList: OFFICIAL_IFRA_TRANSPARENCY_LIST_URL,
        standardsDocumentation: OFFICIAL_IFRA_STANDARDS_DOCUMENTATION_URL,
      },
      sourceRoles: {
        transparencyList:
          "Ingredient identity/CAS support only; not IFRA category-limit evidence.",
        standardsLibrary:
          "Primary official IFRA source for standards metadata and PDF download links.",
        standardsDocumentation:
          "Methodology/context reference; not per-material limit data unless explicit material data is present.",
      },
      guardrails: [
        "Official candidates are review-first records.",
        "No runtime IFRA limits are promoted by this harvester.",
        "No launch clearance is claimed.",
        "Weak substring matches are reported but not auto-linked.",
      ],
    },
    summary: summarizeOfficialHarvest({
      candidates: dedupedCandidates,
      queueItems,
      weakMatches: dedupedWeakMatches,
      downloadedPdfs,
    }),
    officialMatchesFound: dedupedCandidates.filter(
      (candidate) => candidate.candidateUse === "standard_candidate"
    ),
    identitySupportMatches: dedupedCandidates.filter(
      (candidate) => candidate.candidateUse === "identity_support"
    ),
    noOfficialMatchFound,
    needsSupplierDocumentInstead,
    weakAmbiguousMatches: dedupedWeakMatches,
    downloadedStandardPdfs: downloadedPdfs,
    officialDownloadRecords: downloadedPdfs,
    candidates: dedupedCandidates,
  };
}

function metadataForCachedSource({
  sourceUrl,
  sourceType,
  localPath,
  materialOrQuery = "",
  httpStatus = 200,
  contentType = "",
  notes = [],
  root = DEFAULT_ROOT,
}) {
  return {
    sourceUrl,
    sourceType,
    fetchedAt: new Date().toISOString(),
    httpStatus,
    contentType,
    localPath: toRepoRelative(localPath, root),
    materialOrQuery,
    notes,
  };
}

async function fetchToCache({
  sourceUrl,
  sourceType,
  localPath,
  materialOrQuery = "",
  fetchImpl = globalThis.fetch,
  root = DEFAULT_ROOT,
} = {}) {
  if (!fetchImpl) throw new Error("No fetch implementation is available.");
  const response = await fetchImpl(sourceUrl, {
    headers: {
      "user-agent": "Perfumery-Dashboard official IFRA source review bot",
    },
  });
  const contentType = response.headers?.get?.("content-type") || "";
  if (!response.ok) {
    return {
      sourceUrl,
      sourceType,
      materialOrQuery,
      status: "failed",
      httpStatus: response.status,
      reason: `HTTP ${response.status}`,
      localPath: "",
      metadataPath: "",
    };
  }
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(localPath, bytes);
  const metadata = metadataForCachedSource({
    sourceUrl,
    sourceType,
    localPath,
    materialOrQuery,
    httpStatus: response.status,
    contentType,
    root,
  });
  const metadataPath = `${localPath}.metadata.json`;
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  return {
    ...metadata,
    status: "downloaded",
    metadataPath: toRepoRelative(metadataPath, root),
  };
}

export async function cacheOfficialIfraIndexPages({
  fetchImpl = globalThis.fetch,
  cacheDir = OFFICIAL_IFRA_CACHE_DIR,
  root = DEFAULT_ROOT,
} = {}) {
  const standardsPath = path.join(OFFICIAL_IFRA_STANDARDS_CACHE_DIR, "standards-library.html");
  const transparencyPath = path.join(
    OFFICIAL_IFRA_TRANSPARENCY_CACHE_DIR,
    "transparency-list.html"
  );
  const documentationPath = path.join(cacheDir, "standards-documentation.html");
  const requests = [
    {
      sourceUrl: OFFICIAL_IFRA_STANDARDS_LIBRARY_URL,
      sourceType: "official_ifra_standards_library",
      localPath: standardsPath,
      materialOrQuery: "IFRA Standards Library",
    },
    {
      sourceUrl: OFFICIAL_IFRA_TRANSPARENCY_LIST_URL,
      sourceType: "official_ifra_transparency_list",
      localPath: transparencyPath,
      materialOrQuery: "IFRA Transparency List",
    },
    {
      sourceUrl: OFFICIAL_IFRA_STANDARDS_DOCUMENTATION_URL,
      sourceType: "official_ifra_standards_documentation",
      localPath: documentationPath,
      materialOrQuery: "IFRA Standards Documentation",
    },
  ];
  const results = [];
  for (const request of requests) {
    try {
      results.push(await fetchToCache({ ...request, fetchImpl, root }));
    } catch (error) {
      results.push({
        sourceUrl: request.sourceUrl,
        sourceType: request.sourceType,
        materialOrQuery: request.materialOrQuery,
        status: "failed",
        httpStatus: null,
        reason: error?.message || String(error),
        localPath: "",
        metadataPath: "",
      });
    }
  }
  return results;
}

function pdfPathForCandidate(candidate = {}, standardsDir = OFFICIAL_IFRA_STANDARDS_CACHE_DIR) {
  return path.join(
    standardsDir,
    `${slugifyReviewText(candidate.standardTitle || candidate.materialName).slice(0, 96)}.pdf`
  );
}

export async function downloadOfficialStandardPdfs({
  report,
  fetchImpl = globalThis.fetch,
  standardsDir = OFFICIAL_IFRA_STANDARDS_CACHE_DIR,
  root = DEFAULT_ROOT,
} = {}) {
  const downloaded = [];
  const seen = new Set();
  for (const candidate of report.candidates || []) {
    if (candidate.candidateUse !== "standard_candidate") continue;
    if (!candidate.downloadUrl || seen.has(candidate.downloadUrl)) continue;
    seen.add(candidate.downloadUrl);
    const localPath = pdfPathForCandidate(candidate, standardsDir);
    if (fs.existsSync(localPath)) {
      downloaded.push({
        sourceUrl: candidate.downloadUrl,
        materialName: candidate.materialName,
        sourceType: "official_ifra_standard_pdf",
        status: "skipped_cached",
        httpStatus: null,
        localPath: toRepoRelative(localPath, root),
        metadataPath: fs.existsSync(`${localPath}.metadata.json`)
          ? toRepoRelative(`${localPath}.metadata.json`, root)
          : "",
      });
      continue;
    }
    try {
      downloaded.push(
        await fetchToCache({
          sourceUrl: candidate.downloadUrl,
          sourceType: "official_ifra_standard_pdf",
          localPath,
          materialOrQuery: candidate.standardTitle || candidate.materialName,
          fetchImpl,
          root,
        })
      );
    } catch (error) {
      downloaded.push({
        sourceUrl: candidate.downloadUrl,
        materialName: candidate.materialName,
        sourceType: "official_ifra_standard_pdf",
        status: "failed",
        httpStatus: null,
        reason: error?.message || String(error),
        localPath: "",
        metadataPath: "",
      });
    }
  }
  return downloaded;
}

export function buildOfficialIfraSourceCandidatesFile(report = {}) {
  return {
    metadata: {
      generatedAt: report.metadata?.generatedAt || new Date().toISOString(),
      reportName: "Official IFRA Source Candidates",
      sourceReport: "official_ifra_harvest_report",
      guardrails: report.metadata?.guardrails || [],
    },
    summary: report.summary || {},
    candidates: report.candidates || [],
  };
}

function formatCountLine(label, value) {
  return `- ${label}: ${Number(value || 0).toLocaleString()}`;
}

function formatCandidateLine(candidate = {}) {
  const source = candidate.downloadUrl || candidate.sourceUrl || candidate.sourceFile || "";
  const identity =
    candidate.sourceIdentityName && candidate.sourceIdentityName !== candidate.materialName
      ? ` (${candidate.sourceIdentityName})`
      : "";
  return [
    `### ${candidate.materialName}${identity}`,
    "",
    `- Use: ${candidate.candidateUse}`,
    `- Source type: ${candidate.sourceType}`,
    `- Match: ${candidate.matchType}, ${candidate.matchConfidence} confidence`,
    candidate.standardTitle ? `- Standard: ${candidate.standardTitle}` : "",
    candidate.principalName ? `- Principal name: ${candidate.principalName}` : "",
    candidate.cas?.length ? `- CAS: ${candidate.cas.join(", ")}` : "",
    candidate.standardType ? `- Standard type: ${candidate.standardType}` : "",
    candidate.amendment ? `- Amendment: ${candidate.amendment}` : "",
    source ? `- Source: ${source}` : "",
    candidate.officialPdfLocalFile ? `- Official PDF: ${candidate.officialPdfLocalFile}` : "",
    candidate.localFile ? `- Local file: ${candidate.localFile}` : "",
    `- Recommended next action: ${
      candidate.candidateUse === "standard_candidate"
        ? "Review official standard candidate before any structured promotion."
        : "Use as identity/CAS support only."
    }`,
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatSimpleItem(item = {}) {
  return `- ${item.materialName || item.sourceIdentityName || "Unknown"}: ${
    item.recommendedNextAction || item.requiredSourceType || "Review manually."
  }`;
}

function formatWeakMatch(item = {}) {
  return `- ${item.materialName}: weakly resembled "${item.standardTitle}" via ${(
    item.matchedTerms || []
  ).join(", ")}. Not auto-linked.`;
}

export function formatOfficialIfraHarvestMarkdown(report = {}) {
  const summary = report.summary || {};
  return [
    "# Official IFRA Source Harvest",
    "",
    `Generated: ${report.metadata?.generatedAt || ""}`,
    "",
    "This report uses official IFRA source roles conservatively: the Standards Library can produce standard candidates for review, while the Transparency List is identity/CAS support only. It does not promote runtime IFRA limits or prove launch clearance.",
    "",
    "## Summary",
    "",
    formatCountLine("Queue items", summary.queueItemCount),
    formatCountLine("Official standard candidates", summary.officialStandardCandidateCount),
    formatCountLine("Official identity-support matches", summary.officialIdentitySupportCount),
    formatCountLine("No official match found", summary.noOfficialMatchCount),
    formatCountLine("Needs supplier document instead", summary.needsSupplierDocumentInsteadCount),
    formatCountLine("Weak/ambiguous matches", summary.weakAmbiguousMatchCount),
    formatCountLine("Official download attempts", summary.officialDownloadAttemptCount),
    formatCountLine("Official download successes", summary.officialDownloadSuccessCount),
    formatCountLine("Official download failures", summary.officialDownloadFailureCount),
    formatCountLine("Official HTML/pages cached", summary.officialPageCacheCount),
    formatCountLine("Official PDF download attempts", summary.officialPdfDownloadAttemptCount),
    formatCountLine("Downloaded standard PDFs", summary.downloadedPdfCount),
    "",
    "## Official IFRA Matches Found",
    "",
    report.officialMatchesFound?.length
      ? report.officialMatchesFound.map(formatCandidateLine).join("\n")
      : "_No official standard candidates found._\n",
    "",
    "## Official IFRA Identity Support",
    "",
    report.identitySupportMatches?.length
      ? report.identitySupportMatches.map(formatCandidateLine).join("\n")
      : "_No Transparency List identity-support matches found._\n",
    "",
    "## No Official Match Found",
    "",
    report.noOfficialMatchFound?.length
      ? report.noOfficialMatchFound.map(formatSimpleItem).join("\n")
      : "_Every queue item had at least one official match or identity-support record._",
    "",
    "## Needs Supplier Document Instead",
    "",
    report.needsSupplierDocumentInstead?.length
      ? report.needsSupplierDocumentInstead.map(formatSimpleItem).join("\n")
      : "_No supplier-document-only blockers identified from official harvest._",
    "",
    "## Downloaded Standard PDFs",
    "",
    report.downloadedStandardPdfs?.filter((item) => item.sourceType === "official_ifra_standard_pdf")
      .length
      ? report.downloadedStandardPdfs
          .filter((item) => item.sourceType === "official_ifra_standard_pdf")
          .map(
            (item) =>
              `- ${item.materialOrQuery || item.materialName || item.sourceUrl}: ${item.status} ${item.localPath || ""}`
          )
          .join("\n")
      : "_No official standard PDFs downloaded in this run._",
    "",
    "## Official Download Failures",
    "",
    report.officialDownloadRecords?.filter((item) => item.status === "failed").length
      ? report.officialDownloadRecords
          .filter((item) => item.status === "failed")
          .map(
            (item) =>
              `- ${item.sourceUrl}: ${item.reason || "download failed"} (${item.sourceType})`
          )
          .join("\n")
      : "_No official download failures recorded._",
    "",
    "## Weak/Ambiguous Matches",
    "",
    report.weakAmbiguousMatches?.length
      ? report.weakAmbiguousMatches.map(formatWeakMatch).join("\n")
      : "_No weak substring matches reported._",
    "",
  ].join("\n");
}

export function formatOfficialIfraHarvestText(report = {}) {
  const summary = report.summary || {};
  return [
    "Official IFRA Source Harvest",
    "",
    "Review-first official IFRA source candidates. No runtime IFRA limits are changed.",
    "",
    `Queue items: ${summary.queueItemCount || 0}`,
    `Official standard candidates: ${summary.officialStandardCandidateCount || 0}`,
    `Identity-support matches: ${summary.officialIdentitySupportCount || 0}`,
    `No official match found: ${summary.noOfficialMatchCount || 0}`,
    `Weak/ambiguous matches: ${summary.weakAmbiguousMatchCount || 0}`,
    `Official download attempts: ${summary.officialDownloadAttemptCount || 0}`,
    `Official download successes: ${summary.officialDownloadSuccessCount || 0}`,
    `Official download failures: ${summary.officialDownloadFailureCount || 0}`,
    `Official HTML/pages cached: ${summary.officialPageCacheCount || 0}`,
    `Official PDF download attempts: ${summary.officialPdfDownloadAttemptCount || 0}`,
    `Downloaded PDFs: ${summary.downloadedPdfCount || 0}`,
    "",
  ].join("\n");
}

export function writeOfficialIfraHarvestReport(filePath, report) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
}

export function writeOfficialIfraSourceCandidates(filePath, candidatesFile) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(candidatesFile, null, 2)}\n`);
}

export function writeOfficialIfraMarkdown(filePath, markdown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, markdown.endsWith("\n") ? markdown : `${markdown}\n`);
}

export function officialCandidatesAsEvidenceCandidates(officialCandidatesFile = {}) {
  return (officialCandidatesFile.candidates || []).map((candidate) => ({
    ...candidate,
    structuredSourceFile: candidate.sourceFile || "",
    sourceFile: candidate.officialPdfLocalFile || candidate.sourceFile || "",
    sourceType:
      candidate.candidateUse === "identity_support"
        ? "official_ifra_transparency_list"
        : candidate.sourceType || "official_ifra_standard_library",
  }));
}

export { STANDARD_SOURCE_TYPES };
