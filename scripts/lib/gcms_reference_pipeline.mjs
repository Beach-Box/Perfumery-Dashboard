import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildHeroFormulaRawDbSupportRows } from "../../src/lib/hero_formula_material_support.js";

const SCRIPT_LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(SCRIPT_LIB_DIR, "..", "..");
export const DEFAULT_GCMS_REPORTS_DIR = path.join(ROOT, "downloads", "gcms_reports");
export const DEFAULT_GCMS_OUTPUT_DIR = path.join(ROOT, "data", "gcms_extracted");
export const DEFAULT_GCMS_MANIFEST_PATH = path.join(
  DEFAULT_GCMS_OUTPUT_DIR,
  "gcms_manifest.json"
);
export const DEFAULT_GCMS_EXTRACTION_STATUS_PATH = path.join(
  DEFAULT_GCMS_OUTPUT_DIR,
  "gcms_extraction_status.json"
);
export const DEFAULT_GCMS_STRUCTURED_CANDIDATES_PATH = path.join(
  DEFAULT_GCMS_OUTPUT_DIR,
  "gcms_structured_candidates.json"
);
export const DEFAULT_GCMS_RAW_TEXT_DIR = path.join(DEFAULT_GCMS_OUTPUT_DIR, "raw_text");
export const DEFAULT_APP_PATH = path.join(ROOT, "src", "App.jsx");

const CAS_RE = /\b\d{2,7}-\d{2}-\d\b/g;

const FAMILY_PATTERNS = [
  ["aldehydic", /\baldehyd|octanal|nonanal|decanal\b/i],
  ["amber", /\bamber|ambrox|cetalox|labdan|benzoin|vanillin\b/i],
  ["aromatic", /\blavender|rosemary|thyme|basil|clary|sage|coumarin\b/i],
  ["citrus", /\bcitral|limonene|linalyl acetate|bergamot|lemon|orange|grapefruit|mandarin|terpinene\b/i],
  ["floral", /\bhedione|jasmine|rose|ionone|linalool|geraniol|phenyl ethyl\b/i],
  ["fruity", /\bfruity|berry|apple|peach|pear|lactone|damascone\b/i],
  ["gourmand", /\bvanillin|ethyl maltol|maltol|coumarin|cocoa|caramel\b/i],
  ["green", /\bgalban|hexen|leaf|stem|violet leaf|cyclogalbanate\b/i],
  ["marine", /\bcalone|ocean|marine|seaweed|ozon|algenone|maritima\b/i],
  ["musk", /\bmusk|galaxolide|habanolide|ambrettolide|ethylene brassylate\b/i],
  ["resinous", /\bresin|balsam|benzoin|frankincense|myrrh|olibanum\b/i],
  ["spicy", /\bpepper|clove|eugenol|cinnamon|cardamom|ginger\b/i],
  ["woody", /\bcedar|sandal|vetiver|patchouli|iso e|cashmeran|guaiac|oakmoss\b/i],
];

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function toRepoPath(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJsonFile(filePath, payload) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

export function normalizeMaterialName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function uniqueStrings(values = []) {
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

export function slugFromFilename(filename) {
  const base = path.basename(String(filename || ""), path.extname(String(filename || "")));
  const slug = base
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || "gcms-report";
}

function shortHash(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 8);
}

function cleanTitlePart(value) {
  return String(value || "")
    .replace(/\b(?:gcms|gcms|gc-ms|analysis|fragrance analysis|report|pdf)\b/gi, " ")
    .replace(/[_+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function guessTitleAndBrandFromFilename(filename) {
  const base = path.basename(String(filename || ""), path.extname(String(filename || "")));
  const separatorParts = base
    .split(/\s+(?:-|--|by)\s+|[_]{2,}/i)
    .map(cleanTitlePart)
    .filter(Boolean);
  if (separatorParts.length >= 2) {
    return {
      brandGuess: separatorParts[0],
      titleGuess: separatorParts.slice(1).join(" - "),
    };
  }
  return {
    brandGuess: "",
    titleGuess: cleanTitlePart(base),
  };
}

function listPdfFilesRecursive(directory) {
  if (!fs.existsSync(directory)) return [];
  const output = [];
  const visit = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile() && /\.pdf$/i.test(entry.name)) {
        output.push(fullPath);
      }
    }
  };
  visit(directory);
  return output.sort((a, b) => toRepoPath(a).localeCompare(toRepoPath(b)));
}

export function buildGcmsManifest({
  reportsDir = DEFAULT_GCMS_REPORTS_DIR,
  generatedAt = new Date().toISOString(),
} = {}) {
  const pdfPaths = listPdfFilesRecursive(reportsDir);
  const slugCounts = new Map();
  for (const pdfPath of pdfPaths) {
    const slug = slugFromFilename(path.basename(pdfPath));
    slugCounts.set(slug, (slugCounts.get(slug) || 0) + 1);
  }

  const records = pdfPaths.map((pdfPath) => {
    const stat = fs.statSync(pdfPath);
    const relativePath = toRepoPath(pdfPath);
    const baseSlug = slugFromFilename(path.basename(pdfPath));
    const id =
      slugCounts.get(baseSlug) > 1 ? `${baseSlug}-${shortHash(relativePath)}` : baseSlug;
    const guesses = guessTitleAndBrandFromFilename(path.basename(pdfPath));
    return {
      id,
      filename: path.basename(pdfPath),
      relativePath,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      titleGuess: guesses.titleGuess,
      brandGuess: guesses.brandGuess,
      status: "pending_extraction",
    };
  });

  return {
    generatedAt,
    sourceDirectory: toRepoPath(reportsDir),
    reportCount: records.length,
    reports: records,
  };
}

export function writeGcmsManifest({
  reportsDir = DEFAULT_GCMS_REPORTS_DIR,
  outputPath = DEFAULT_GCMS_MANIFEST_PATH,
  generatedAt = new Date().toISOString(),
} = {}) {
  const manifest = buildGcmsManifest({ reportsDir, generatedAt });
  writeJsonFile(outputPath, manifest);
  return manifest;
}

function buildSwiftPdfExtractorSource() {
  return `
import Foundation
import PDFKit

struct PageRecord: Codable {
  let pageNumber: Int
  let text: String
}

struct ExtractionRecord: Codable {
  let pageCount: Int
  let pages: [PageRecord]
}

if CommandLine.arguments.count < 2 {
  fputs("missing pdf path\\n", stderr)
  exit(2)
}

let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let document = PDFDocument(url: url) else {
  fputs("failed to open pdf\\n", stderr)
  exit(1)
}

var pages: [PageRecord] = []
for index in 0..<document.pageCount {
  let pageText = document.page(at: index)?.string ?? ""
  pages.append(PageRecord(pageNumber: index + 1, text: pageText))
}

let record = ExtractionRecord(pageCount: document.pageCount, pages: pages)
let encoder = JSONEncoder()
encoder.outputFormatting = [.withoutEscapingSlashes]
FileHandle.standardOutput.write(try! encoder.encode(record))
`;
}

function compileSwiftPdfExtractor() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gcms-pdf-extractor-"));
  const swiftPath = path.join(tempDir, "extract.swift");
  const binPath = path.join(tempDir, "extract-pdf-text");
  fs.writeFileSync(swiftPath, buildSwiftPdfExtractorSource());
  const compileResult = childProcess.spawnSync(
    "swiftc",
    [
      "-module-cache-path",
      path.join(os.tmpdir(), "codex-clang-module-cache"),
      swiftPath,
      "-o",
      binPath,
    ],
    { encoding: "utf8" }
  );
  if (compileResult.status !== 0) {
    throw new Error(
      compileResult.stderr ||
        compileResult.stdout ||
        "swiftc failed while compiling the PDF text extractor"
    );
  }
  return { binPath, tempDir };
}

function flattenExtractedPages(pages = []) {
  return pages
    .map((page) => String(page?.text || "").replace(/\r/g, "\n").trim())
    .filter(Boolean)
    .join("\n\n");
}

function readManifestForExtraction(manifestPath = DEFAULT_GCMS_MANIFEST_PATH) {
  const manifest = readJsonIfExists(manifestPath, null);
  if (manifest) return manifest;
  return buildGcmsManifest();
}

export function extractGcmsPdfText({
  manifestPath = DEFAULT_GCMS_MANIFEST_PATH,
  rawTextDir = DEFAULT_GCMS_RAW_TEXT_DIR,
  outputPath = DEFAULT_GCMS_EXTRACTION_STATUS_PATH,
  generatedAt = new Date().toISOString(),
} = {}) {
  const manifest = readManifestForExtraction(manifestPath);
  const reports = Array.isArray(manifest?.reports) ? manifest.reports : [];
  ensureDirectory(rawTextDir);

  let compiledExtractor = null;
  let compileError = null;
  if (reports.length) {
    try {
      compiledExtractor = compileSwiftPdfExtractor();
    } catch (error) {
      compileError = error;
    }
  }

  const statusRecords = reports.map((report) => {
    const sourcePath = path.join(ROOT, report.relativePath || "");
    const textPath = path.join(rawTextDir, `${report.id}.json`);
    const relativeTextPath = toRepoPath(textPath);

    if (compileError) {
      return {
        id: report.id,
        filename: report.filename,
        textPath: null,
        pageCount: null,
        extractionStatus: "failed",
        error: `PDF extractor unavailable: ${compileError.message}`,
      };
    }

    try {
      const runResult = childProcess.spawnSync(compiledExtractor.binPath, [sourcePath], {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 80,
      });
      if (runResult.status !== 0) {
        throw new Error(runResult.stderr || runResult.stdout || "PDF extraction failed");
      }
      const extracted = JSON.parse(runResult.stdout || "{}");
      const text = flattenExtractedPages(extracted.pages);
      const rawRecord = {
        id: report.id,
        filename: report.filename,
        sourcePath: report.relativePath,
        pageCount: Number.isFinite(extracted.pageCount) ? extracted.pageCount : null,
        extractedAt: generatedAt,
        text,
        pages: Array.isArray(extracted.pages) ? extracted.pages : [],
      };
      writeJsonFile(textPath, rawRecord);
      return {
        id: report.id,
        filename: report.filename,
        textPath: relativeTextPath,
        pageCount: rawRecord.pageCount,
        extractionStatus: text.length ? "ok" : "partial",
        error: null,
      };
    } catch (error) {
      return {
        id: report.id,
        filename: report.filename,
        textPath: null,
        pageCount: null,
        extractionStatus: "failed",
        error: error.message,
      };
    }
  });

  const payload = {
    generatedAt,
    manifestPath: toRepoPath(manifestPath),
    rawTextDirectory: toRepoPath(rawTextDir),
    reportCount: statusRecords.length,
    reports: statusRecords,
  };
  writeJsonFile(outputPath, payload);
  return payload;
}

function extractDelimitedNumber(line, labelPattern) {
  const match = String(line || "").match(labelPattern);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
}

function extractGenericPercent(line) {
  const matches = [...String(line || "").matchAll(/\b([0-9]+(?:\.[0-9]+)?)\s*%/g)];
  if (!matches.length) return null;
  const usableMatches = matches.filter((match) => {
    const prefix = String(line || "").slice(Math.max(0, match.index - 32), match.index);
    return !/\b(?:match quality|quality|similarity|score)\b\s*[:=]?\s*$/i.test(prefix);
  });
  if (!usableMatches.length) return null;
  const value = Number.parseFloat(usableMatches[usableMatches.length - 1][1]);
  return Number.isFinite(value) ? value : null;
}

function cleanMaterialNameFromLine(line, cas, areaPercent, relativePercent) {
  let working = String(line || "")
    .replace(/\s+/g, " ")
    .replace(CAS_RE, " ")
    .replace(/\b(?:cas|cas no|cas number)\b[:#.]?/gi, " ")
    .replace(/\b(?:area|relative|rel)\s*(?:percent|pct|%)?\b\s*[:=]?\s*[0-9]+(?:\.[0-9]+)?\s*%?/gi, " ")
    .replace(/\b(?:match quality|quality|similarity|score)\b\s*[:=]?\s*[0-9]+(?:\.[0-9]+)?\s*%?/gi, " ")
    .replace(/\b(?:rt|retention time)\b\s*[:=]?\s*[0-9]+(?:\.[0-9]+)?\s*(?:min)?/gi, " ")
    .replace(/\b[0-9]+(?:\.[0-9]+)?\s*%/g, " ");

  if (cas && line.includes(cas)) {
    const beforeCas = line.slice(0, line.indexOf(cas)).trim();
    if (/[A-Za-z]/.test(beforeCas)) {
      working = beforeCas.replace(/\b(?:cas|cas no|cas number)\b[:#.]?/gi, " ");
    }
  } else if (areaPercent !== null || relativePercent !== null) {
    const percentMatch = line.match(/\b[0-9]+(?:\.[0-9]+)?\s*%/);
    if (percentMatch) {
      const beforePercent = line.slice(0, percentMatch.index).trim();
      if (/[A-Za-z]/.test(beforePercent)) working = beforePercent;
    }
  }

  working = working
    .replace(/^\s*(?:peak|compound|component|no|#)?\s*\d+\s+/i, " ")
    .replace(/^\s*[0-9]+(?:\.[0-9]+)?\s+/, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,;:\-|\s]+|[,;:\-|\s]+$/g, "")
    .trim();

  if (/^(?:cas|name|compound|component|peak|rt|area|percent|match|quality)$/i.test(working)) {
    return "";
  }
  return working;
}

export function parseMaterialCandidateLine(line) {
  const rawLine = String(line || "").trim();
  if (!rawLine || rawLine.length > 500) return null;
  if (/^\s*(?:page|copyright|disclaimer|fragrance analysis|gcms report)\b/i.test(rawLine)) {
    return null;
  }

  const casValues = rawLine.match(CAS_RE) || [];
  const cas = casValues[0] || "";
  const relativePercent = extractDelimitedNumber(
    rawLine,
    /\b(?:relative|rel)\s*(?:percent|pct|%)?\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i
  );
  const areaPercent =
    extractDelimitedNumber(
      rawLine,
      /\barea\s*(?:percent|pct|%)?\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i
    ) ?? (relativePercent === null ? extractGenericPercent(rawLine) : null);
  const matchQuality = extractDelimitedNumber(
    rawLine,
    /\b(?:match quality|quality|similarity|score)\b\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i
  );

  const hasCandidateEvidence = Boolean(cas) || areaPercent !== null || relativePercent !== null;
  if (!hasCandidateEvidence) return null;

  const name = cleanMaterialNameFromLine(rawLine, cas, areaPercent, relativePercent);
  if (!/[A-Za-z]{3,}/.test(name)) return null;

  return {
    name,
    cas,
    relativePercent,
    areaPercent,
    matchQuality,
    rawLine,
  };
}

function splitTextLines(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function uniqueMaterialCandidates(candidates) {
  const seen = new Set();
  const output = [];
  for (const candidate of candidates) {
    const key = [
      normalizeMaterialName(candidate.name),
      candidate.cas,
      candidate.relativePercent ?? "",
      candidate.areaPercent ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(candidate);
  }
  return output;
}

export function extractCatalogNamesFromAppSource(appSourceText) {
  const rawDbStart = appSourceText.indexOf("const RAW_DB = {");
  const rawDbEnd = appSourceText.indexOf("const FIELDS = [", rawDbStart);
  if (rawDbStart === -1 || rawDbEnd === -1 || rawDbEnd <= rawDbStart) return [];
  const rawDbSection = appSourceText.slice(rawDbStart, rawDbEnd);
  const keyPattern = /^\s*(?:"([^"]+)"|([A-Za-z0-9_]+)):\s*\[/gm;
  const catalogNames = [];
  let match = null;
  while ((match = keyPattern.exec(rawDbSection))) {
    const key = match[1] || match[2];
    if (key) catalogNames.push(key);
  }
  return uniqueStrings([
    ...catalogNames,
    ...Object.keys(buildHeroFormulaRawDbSupportRows({})),
  ]);
}

export function loadInventoryNames(appPath = DEFAULT_APP_PATH) {
  if (!fs.existsSync(appPath)) return [];
  return extractCatalogNamesFromAppSource(fs.readFileSync(appPath, "utf8"));
}

function matchInventoryCandidate(candidate, inventoryNameMap) {
  const normalized = normalizeMaterialName(candidate.name);
  const direct = inventoryNameMap.get(normalized);
  if (direct) return direct;
  const stripped = normalizeMaterialName(
    candidate.name.replace(/\s+\d+(?:\.\d+)?\s*%\s*(?:tec|dpg|etoh|ethanol|ipm)?$/i, "")
  );
  return inventoryNameMap.get(stripped) || null;
}

function detectFamilies(text, candidates) {
  const haystack = [
    text,
    ...candidates.map((candidate) => `${candidate.name} ${candidate.cas}`),
  ].join("\n");
  return FAMILY_PATTERNS.filter(([, pattern]) => pattern.test(haystack)).map(
    ([family]) => family
  );
}

function buildStructuredRecord({
  statusRecord,
  manifestRecord,
  rawTextRecord,
  inventoryNameMap,
}) {
  const sourceFilename =
    statusRecord?.filename || manifestRecord?.filename || rawTextRecord?.filename || "";
  const baseNotes = [];
  if (statusRecord?.extractionStatus === "failed") {
    baseNotes.push(statusRecord.error || "PDF text extraction failed.");
    return {
      id: statusRecord.id,
      sourceFilename,
      fragranceName: manifestRecord?.titleGuess || "",
      brand: manifestRecord?.brandGuess || "",
      extractionStatus: "failed",
      detectedMaterials: [],
      topMaterials: [],
      possibleFamilies: [],
      inventoryMatches: [],
      unknownMaterials: [],
      extractionConfidence: "low",
      reviewNeeded: true,
      notes: baseNotes,
    };
  }

  const text = rawTextRecord?.text || flattenExtractedPages(rawTextRecord?.pages);
  const lines = splitTextLines(text);
  const detectedMaterials = uniqueMaterialCandidates(
    lines.map(parseMaterialCandidateLine).filter(Boolean)
  );
  const inventoryMatches = [];
  const unknownMaterials = [];
  for (const material of detectedMaterials) {
    const catalogName = matchInventoryCandidate(material, inventoryNameMap);
    if (catalogName) {
      inventoryMatches.push({
        name: material.name,
        catalogName,
        cas: material.cas,
        areaPercent: material.areaPercent,
        relativePercent: material.relativePercent,
      });
    } else {
      unknownMaterials.push({
        name: material.name,
        cas: material.cas,
        areaPercent: material.areaPercent,
        relativePercent: material.relativePercent,
      });
    }
  }

  const sortableMaterials = [...detectedMaterials].sort(
    (a, b) =>
      (b.areaPercent ?? b.relativePercent ?? -1) -
        (a.areaPercent ?? a.relativePercent ?? -1) ||
      a.name.localeCompare(b.name)
  );

  const notes = [...baseNotes];
  if (!detectedMaterials.length) {
    notes.push("No conservative material candidate rows were detected from extracted text.");
  }
  if (statusRecord?.extractionStatus === "partial") {
    notes.push("PDF text extraction produced little or no readable text.");
  }

  const percentBackedCount = detectedMaterials.filter(
    (material) => material.areaPercent !== null || material.relativePercent !== null
  ).length;
  const casBackedCount = detectedMaterials.filter((material) => material.cas).length;
  let extractionConfidence = "low";
  if (detectedMaterials.length >= 10 && (percentBackedCount >= 5 || casBackedCount >= 5)) {
    extractionConfidence = "high";
  } else if (detectedMaterials.length > 0) {
    extractionConfidence = "medium";
  }

  return {
    id: statusRecord.id,
    sourceFilename,
    fragranceName: manifestRecord?.titleGuess || "",
    brand: manifestRecord?.brandGuess || "",
    extractionStatus: statusRecord?.extractionStatus || "ok",
    detectedMaterials,
    topMaterials: sortableMaterials.slice(0, 10).map((material) => material.name),
    possibleFamilies: detectFamilies(text, detectedMaterials),
    inventoryMatches,
    unknownMaterials,
    extractionConfidence,
    reviewNeeded: true,
    notes,
  };
}

export function structureGcmsReportsFromExtraction({
  extractionStatus,
  manifest,
  rawTextById = {},
  inventoryNames = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const statusReports = Array.isArray(extractionStatus?.reports)
    ? extractionStatus.reports
    : [];
  const manifestById = new Map(
    (manifest?.reports || []).map((report) => [report.id, report])
  );
  const inventoryNameMap = new Map(
    inventoryNames.map((name) => [normalizeMaterialName(name), name])
  );
  const reports = statusReports.map((statusRecord) =>
    buildStructuredRecord({
      statusRecord,
      manifestRecord: manifestById.get(statusRecord.id) || null,
      rawTextRecord: rawTextById[statusRecord.id] || null,
      inventoryNameMap,
    })
  );
  return {
    generatedAt,
    sourceExtractionStatusPath: extractionStatus?.sourcePath || null,
    reportCount: reports.length,
    reports,
  };
}

export function structureGcmsReports({
  manifestPath = DEFAULT_GCMS_MANIFEST_PATH,
  extractionStatusPath = DEFAULT_GCMS_EXTRACTION_STATUS_PATH,
  outputPath = DEFAULT_GCMS_STRUCTURED_CANDIDATES_PATH,
  appPath = DEFAULT_APP_PATH,
  generatedAt = new Date().toISOString(),
} = {}) {
  const manifest = readJsonIfExists(manifestPath, { reports: [] });
  const extractionStatus = readJsonIfExists(extractionStatusPath, { reports: [] });
  extractionStatus.sourcePath = toRepoPath(extractionStatusPath);
  const rawTextById = {};
  for (const statusRecord of extractionStatus.reports || []) {
    if (!statusRecord.textPath) continue;
    const rawPath = path.join(ROOT, statusRecord.textPath);
    if (fs.existsSync(rawPath)) {
      rawTextById[statusRecord.id] = readJsonIfExists(rawPath, null);
    }
  }
  const structured = structureGcmsReportsFromExtraction({
    extractionStatus,
    manifest,
    rawTextById,
    inventoryNames: loadInventoryNames(appPath),
    generatedAt,
  });
  writeJsonFile(outputPath, structured);
  return structured;
}

function incrementCounter(counter, key) {
  if (!key) return;
  counter.set(key, (counter.get(key) || 0) + 1);
}

function sortedCounterRows(counter, limit = 25) {
  return [...counter.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function buildGcmsReferenceSummary(structuredPayload = {}) {
  const reports = Array.isArray(structuredPayload?.reports)
    ? structuredPayload.reports
    : [];
  const materialCounter = new Map();
  const casCounter = new Map();
  const inventoryCounter = new Map();
  const absentCounter = new Map();
  const familyCounter = new Map();

  for (const report of reports) {
    for (const material of report.detectedMaterials || []) {
      incrementCounter(materialCounter, material.name);
      incrementCounter(casCounter, material.cas);
    }
    for (const match of report.inventoryMatches || []) {
      incrementCounter(inventoryCounter, match.catalogName || match.name);
    }
    for (const missing of report.unknownMaterials || []) {
      incrementCounter(absentCounter, missing.name);
    }
    for (const family of report.possibleFamilies || []) {
      incrementCounter(familyCounter, family);
    }
  }

  const failedReports = reports.filter((report) => report.extractionStatus === "failed");
  const reviewReports = reports.filter((report) => report.reviewNeeded);
  return {
    generatedAt: new Date().toISOString(),
    reportsProcessed: reports.length,
    reportsFailed: failedReports.length,
    failedReports: failedReports.map((report) => ({
      id: report.id,
      sourceFilename: report.sourceFilename,
      notes: report.notes || [],
    })),
    mostCommonDetectedMaterials: sortedCounterRows(materialCounter),
    mostCommonCasNumbers: sortedCounterRows(casCounter),
    materialsOverlappingInventory: sortedCounterRows(inventoryCounter),
    materialsAbsentFromInventory: sortedCounterRows(absentCounter),
    recurringAccordFamilies: sortedCounterRows(familyCounter),
    reportsNeedingManualReview: reviewReports.map((report) => ({
      id: report.id,
      sourceFilename: report.sourceFilename,
      extractionConfidence: report.extractionConfidence,
      detectedMaterialCount: report.detectedMaterials?.length || 0,
      notes: report.notes || [],
    })),
  };
}

function formatCountRows(rows, emptyLabel) {
  if (!rows.length) return `- ${emptyLabel}`;
  return rows.map((row) => `- ${row.name}: ${row.count}`).join("\n");
}

export function formatGcmsSummaryText(summary) {
  return [
    "GCMS Reference Summary",
    "",
    `Reports processed: ${summary.reportsProcessed}`,
    `Reports failed: ${summary.reportsFailed}`,
    `Reports needing manual review: ${summary.reportsNeedingManualReview.length}`,
    "",
    "Most common detected materials:",
    formatCountRows(summary.mostCommonDetectedMaterials.slice(0, 15), "No materials detected yet."),
    "",
    "Most common CAS numbers:",
    formatCountRows(summary.mostCommonCasNumbers.slice(0, 15), "No CAS numbers detected yet."),
    "",
    "Inventory overlap:",
    formatCountRows(
      summary.materialsOverlappingInventory.slice(0, 15),
      "No inventory overlaps detected yet."
    ),
    "",
    "Absent from inventory:",
    formatCountRows(
      summary.materialsAbsentFromInventory.slice(0, 15),
      "No absent materials detected yet."
    ),
    "",
    "Recurring accord families:",
    formatCountRows(summary.recurringAccordFamilies, "No accord families detected yet."),
  ].join("\n");
}

function markdownTable(rows, columns, emptyLabel) {
  if (!rows.length) return `_${emptyLabel}_`;
  const header = `| ${columns.map((column) => column.label).join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows
    .map(
      (row) =>
        `| ${columns
          .map((column) => String(column.value(row)).replace(/\|/g, "\\|"))
          .join(" | ")} |`
    )
    .join("\n");
  return [header, divider, body].join("\n");
}

export function formatGcmsSummaryMarkdown(summary) {
  const countColumns = [
    { label: "Name", value: (row) => row.name },
    { label: "Count", value: (row) => row.count },
  ];
  return [
    "# GCMS Reference Summary",
    "",
    "Review-first summary of locally extracted GCMS-backed fragrance analysis PDFs. GCMS output is not an exact formula, not compliance evidence, and requires manual review before use.",
    "",
    "## Counts",
    "",
    `- Reports processed: ${summary.reportsProcessed}`,
    `- Reports failed: ${summary.reportsFailed}`,
    `- Reports needing manual review: ${summary.reportsNeedingManualReview.length}`,
    "",
    "## Most Common Detected Materials",
    "",
    markdownTable(summary.mostCommonDetectedMaterials, countColumns, "No materials detected yet."),
    "",
    "## Most Common CAS Numbers",
    "",
    markdownTable(summary.mostCommonCasNumbers, countColumns, "No CAS numbers detected yet."),
    "",
    "## Beach Box Inventory Overlap",
    "",
    markdownTable(
      summary.materialsOverlappingInventory,
      countColumns,
      "No inventory overlaps detected yet."
    ),
    "",
    "## Materials Absent From Inventory",
    "",
    markdownTable(
      summary.materialsAbsentFromInventory,
      countColumns,
      "No absent materials detected yet."
    ),
    "",
    "## Recurring Accord Families",
    "",
    markdownTable(summary.recurringAccordFamilies, countColumns, "No accord families detected yet."),
    "",
    "## Reports Needing Manual Review",
    "",
    markdownTable(
      summary.reportsNeedingManualReview,
      [
        { label: "Report", value: (row) => row.sourceFilename || row.id },
        { label: "Confidence", value: (row) => row.extractionConfidence },
        { label: "Detected Materials", value: (row) => row.detectedMaterialCount },
      ],
      "No reports have been processed yet."
    ),
    "",
  ].join("\n");
}

export function loadStructuredCandidates(filePath = DEFAULT_GCMS_STRUCTURED_CANDIDATES_PATH) {
  return readJsonIfExists(filePath, { reports: [] });
}
