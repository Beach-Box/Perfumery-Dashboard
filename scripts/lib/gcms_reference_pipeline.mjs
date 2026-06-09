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
const CAS_LIKE_RE = /\b\d{1,7}-\d{1,3}-\d\b/;
const PAGE_MARKER_RE = /^Page\s+\d+(?:\s+of\s+\d+)?\b/i;
const TABLE_HEADER_RE = /^#\s*Component\s+CAS\s+PPT\s+%$/i;
const TOTAL_ROW_RE = /^TOTAL\s+([0-9]+(?:\.[0-9]+)?)\s+([0-9]+(?:\.[0-9]+)?)$/i;

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

export function normalizeGcmsManifestReports(manifest) {
  if (Array.isArray(manifest)) return manifest;
  if (Array.isArray(manifest?.reports)) return manifest.reports;
  return [];
}

export function extractGcmsPdfText({
  manifestPath = DEFAULT_GCMS_MANIFEST_PATH,
  manifest = null,
  rawTextDir = DEFAULT_GCMS_RAW_TEXT_DIR,
  outputPath = DEFAULT_GCMS_EXTRACTION_STATUS_PATH,
  generatedAt = new Date().toISOString(),
  runPdfExtractor = null,
} = {}) {
  const loadedManifest = manifest || readManifestForExtraction(manifestPath);
  const reports = normalizeGcmsManifestReports(loadedManifest);
  ensureDirectory(rawTextDir);

  let compiledExtractor = null;
  let compileError = null;
  if (reports.length && !runPdfExtractor) {
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
      if (!report.relativePath) {
        throw new Error("Manifest record is missing relativePath.");
      }
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`PDF file not found: ${report.relativePath}`);
      }
      let extracted = null;
      if (runPdfExtractor) {
        extracted = runPdfExtractor(sourcePath, report);
      } else {
        const runResult = childProcess.spawnSync(compiledExtractor.binPath, [sourcePath], {
          encoding: "utf8",
          maxBuffer: 1024 * 1024 * 80,
        });
        if (runResult.status !== 0) {
          throw new Error(runResult.stderr || runResult.stdout || "PDF extraction failed");
        }
        extracted = JSON.parse(runResult.stdout || "{}");
      }
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
  return parseInscentifyComponentRow(rawLine)?.component || null;
}

function parseNumber(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeTableLine(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanComponentName(value) {
  return normalizeTableLine(value)
    .replace(/\s+\(\s*$/, "")
    .replace(/^[,;:\-|\s]+|[,;:\-|\s]+$/g, "")
    .trim();
}

function splitComponentNameAndCas(componentWithCas) {
  const text = normalizeTableLine(componentWithCas);
  const unavailableMatch = text.match(/\s+(N\/A|Not available)$/i);
  if (unavailableMatch) {
    return {
      name: cleanComponentName(text.slice(0, unavailableMatch.index)),
      cas: unavailableMatch[1],
    };
  }

  const casMatch = text.match(new RegExp(`\\s+(${CAS_LIKE_RE.source})$`, "i"));
  if (casMatch) {
    return {
      name: cleanComponentName(text.slice(0, casMatch.index)),
      cas: casMatch[1],
    };
  }

  return {
    name: cleanComponentName(text),
    cas: "",
  };
}

export function parseInscentifyTotalRow(line) {
  const match = normalizeTableLine(line).match(TOTAL_ROW_RE);
  if (!match) return null;
  return {
    ppt: parseNumber(match[1]),
    percent: parseNumber(match[2]),
    rawLine: String(line || "").trim(),
  };
}

export function parseInscentifyComponentRow(line) {
  const rawLine = String(line || "").trim();
  const normalized = normalizeTableLine(rawLine);
  if (!normalized || normalized.length > 500) return null;
  const match = normalized.match(
    /^(\d+)\s+(.+?)\s+([0-9]+(?:\.[0-9]+)?)\s+([0-9]+(?:\.[0-9]+)?)$/
  );
  if (!match) return null;

  const rank = Number.parseInt(match[1], 10);
  const ppt = parseNumber(match[3]);
  const percent = parseNumber(match[4]);
  if (!Number.isFinite(rank) || ppt === null || percent === null) return null;

  const { name, cas } = splitComponentNameAndCas(match[2]);
  if (!/[A-Za-z]{2,}/.test(name)) return null;

  const component = {
    rank,
    name,
    cas,
    ppt,
    percent,
    relativePercent: percent,
    areaPercent: null,
    matchQuality: null,
    rawLine,
  };

  return { component };
}

function shouldWarnForFailedTableLine(line) {
  const normalized = normalizeTableLine(line);
  if (!normalized) return false;
  if (TABLE_HEADER_RE.test(normalized)) return false;
  if (PAGE_MARKER_RE.test(normalized)) return false;
  if (/^Complete Formula Breakdown$/i.test(normalized)) return false;
  if (/^How to Read a GCMS Analysis$/i.test(normalized)) return false;
  if (/^This fragrance contains\b/i.test(normalized)) return false;
  if (/^tion\./i.test(normalized)) return false;
  if (/^Highlighted materials\b/i.test(normalized)) return false;
  if (/^TOTAL\b/i.test(normalized)) return true;
  return /^\d+\s+/.test(normalized);
}

function extractGcmsReportMetadata(text, fallback = {}) {
  const lines = splitTextLines(text);
  const warnings = [];
  let fragranceName = fallback.fragranceName || "";
  let brand = fallback.brand || "";
  let releaseYear = null;
  let perfumer = null;

  const titleIndex = lines.findIndex((line) => /^A GCMS ANALYSIS OF$/i.test(line));
  if (titleIndex !== -1) {
    fragranceName = lines[titleIndex + 1] || fragranceName;
    const brandLine = lines[titleIndex + 2] || "";
    const brandMatch = brandLine.match(/^(.*?)\s+\((\d{4}|Unknown)\)$/i);
    if (brandMatch) {
      brand = brandMatch[1].trim();
      releaseYear = /^\d{4}$/.test(brandMatch[2])
        ? Number.parseInt(brandMatch[2], 10)
        : null;
    } else if (brandLine) {
      brand = brandLine.trim();
      warnings.push(`Could not parse brand/year line: ${brandLine}`);
    }
  } else {
    warnings.push("Report title marker was not found.");
  }

  const perfumerLine = lines.find((line) => /^Perfumer:/i.test(line));
  if (perfumerLine) {
    perfumer = perfumerLine.replace(/^Perfumer:\s*/i, "").trim() || null;
  } else {
    warnings.push("Perfumer line was not found.");
  }

  const claimMatch = text.match(/This fragrance contains\s+(\d+)\s+identified components/i);
  const componentCountClaimed = claimMatch ? Number.parseInt(claimMatch[1], 10) : null;
  if (componentCountClaimed === null) {
    warnings.push("Component count claim was not found.");
  }

  return {
    fragranceName,
    brand,
    releaseYear,
    perfumer,
    componentCountClaimed,
    metadataWarnings: warnings,
  };
}

function isUnidentifiedMaterial(material) {
  return /\bunidentified compounds?\b/i.test(material?.name || "");
}

export function parseInscentifyFormulaTable(text) {
  const lines = splitTextLines(text);
  const detectedMaterials = [];
  const parseWarnings = [];
  let inTable = false;
  let tableFound = false;
  let totalPpt = null;
  let totalPercent = null;
  let totalRow = null;

  for (const line of lines) {
    const normalized = normalizeTableLine(line);
    if (!inTable) {
      if (/^Complete Formula Breakdown$/i.test(normalized)) {
        inTable = true;
        tableFound = true;
      }
      continue;
    }

    if (/^How to Read a GCMS Analysis$/i.test(normalized)) break;
    if (TABLE_HEADER_RE.test(normalized) || PAGE_MARKER_RE.test(normalized)) continue;

    const total = parseInscentifyTotalRow(normalized);
    if (total) {
      totalPpt = total.ppt;
      totalPercent = total.percent;
      totalRow = total.rawLine;
      break;
    }

    const parsed = parseInscentifyComponentRow(normalized);
    if (parsed) {
      detectedMaterials.push(parsed.component);
      continue;
    }

    if (shouldWarnForFailedTableLine(line)) {
      parseWarnings.push(`Could not parse formula table line: ${line}`);
    }
  }

  if (!tableFound) {
    parseWarnings.push("Complete Formula Breakdown section was not found.");
  } else if (totalPercent === null) {
    parseWarnings.push("TOTAL row was not found before the formula table ended.");
  }

  return {
    detectedMaterials,
    tableFound,
    totalPpt,
    totalPercent,
    totalRow,
    parseWarnings,
  };
}

function assignGcmsExtractionConfidence({
  tableFound,
  totalPercent,
  componentCountClaimed,
  componentCountDelta,
  parseWarningCount,
}) {
  if (!tableFound) return "low";
  const totalIsNear100 =
    typeof totalPercent === "number" && Math.abs(totalPercent - 100) <= 0.25;
  const countIsClose =
    componentCountClaimed === null ||
    componentCountDelta === null ||
    Math.abs(componentCountDelta) <= 2;
  if (totalIsNear100 && countIsClose && parseWarningCount <= 2) return "high";
  if (totalIsNear100 && parseWarningCount <= 10) return "medium";
  return "low";
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
      releaseYear: null,
      perfumer: null,
      extractionStatus: "failed",
      detectedMaterials: [],
      topMaterials: [],
      possibleFamilies: [],
      inventoryMatches: [],
      unknownMaterials: [],
      componentCountClaimed: null,
      componentCountParsed: 0,
      componentCountDelta: null,
      totalPercent: null,
      unidentifiedPercent: null,
      parseWarningCount: 0,
      metadataWarnings: [],
      parseWarnings: [],
      extractionConfidence: "low",
      reviewNeeded: true,
      notes: baseNotes,
    };
  }

  const text = rawTextRecord?.text || flattenExtractedPages(rawTextRecord?.pages);
  const metadata = extractGcmsReportMetadata(text, {
    fragranceName: manifestRecord?.titleGuess || "",
    brand: manifestRecord?.brandGuess || "",
  });
  const table = parseInscentifyFormulaTable(text);
  const detectedMaterials = table.detectedMaterials;
  const componentCountParsed = detectedMaterials.filter(
    (material) => !isUnidentifiedMaterial(material)
  ).length;
  const componentCountDelta =
    metadata.componentCountClaimed === null
      ? null
      : componentCountParsed - metadata.componentCountClaimed;
  const unidentifiedPercent = detectedMaterials
    .filter(isUnidentifiedMaterial)
    .reduce((sum, material) => sum + (material.percent ?? material.relativePercent ?? 0), 0);

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
        ppt: material.ppt,
        percent: material.percent,
      });
    } else {
      unknownMaterials.push({
        name: material.name,
        cas: material.cas,
        areaPercent: material.areaPercent,
        relativePercent: material.relativePercent,
        ppt: material.ppt,
        percent: material.percent,
      });
    }
  }

  const sortableMaterials = [...detectedMaterials].sort(
    (a, b) =>
      (b.percent ?? b.areaPercent ?? b.relativePercent ?? -1) -
        (a.percent ?? a.areaPercent ?? a.relativePercent ?? -1) ||
      a.name.localeCompare(b.name)
  );

  const notes = [...baseNotes];
  if (!detectedMaterials.length) {
    notes.push("No strict Complete Formula Breakdown component rows were detected from extracted text.");
  }
  if (statusRecord?.extractionStatus === "partial") {
    notes.push("PDF text extraction produced little or no readable text.");
  }
  if (componentCountDelta !== null && componentCountDelta !== 0) {
    notes.push(
      `Parsed identified component count differs from claimed count by ${componentCountDelta}.`
    );
  }
  if (table.totalPercent !== null && Math.abs(table.totalPercent - 100) > 0.25) {
    notes.push(`Formula TOTAL percent is ${table.totalPercent}, not near 100.`);
  }

  const metadataWarnings = [...metadata.metadataWarnings];
  if (componentCountDelta !== null && componentCountDelta !== 0) {
    metadataWarnings.push(
      `Claimed identified components ${metadata.componentCountClaimed}; parsed ${componentCountParsed}.`
    );
  }
  if (!table.tableFound) metadataWarnings.push("Complete Formula Breakdown table was not found.");
  if (table.totalPercent === null) metadataWarnings.push("Formula TOTAL percent was not parsed.");

  const parseWarningCount = table.parseWarnings.length;
  const extractionConfidence = assignGcmsExtractionConfidence({
    tableFound: table.tableFound,
    totalPercent: table.totalPercent,
    componentCountClaimed: metadata.componentCountClaimed,
    componentCountDelta,
    parseWarningCount,
  });

  return {
    id: statusRecord.id,
    sourceFilename,
    fragranceName: metadata.fragranceName,
    brand: metadata.brand,
    releaseYear: metadata.releaseYear,
    perfumer: metadata.perfumer,
    extractionStatus: statusRecord?.extractionStatus || "ok",
    detectedMaterials,
    topMaterials: sortableMaterials.slice(0, 10).map((material) => material.name),
    possibleFamilies: detectFamilies(text, detectedMaterials),
    inventoryMatches,
    unknownMaterials,
    componentCountClaimed: metadata.componentCountClaimed,
    componentCountParsed,
    componentCountDelta,
    totalPercent: table.totalPercent,
    totalPpt: table.totalPpt,
    unidentifiedPercent: unidentifiedPercent || null,
    parseWarningCount,
    metadataWarnings,
    parseWarnings: table.parseWarnings,
    extractionConfidence,
    reviewNeeded: true,
    notes: [...notes, ...table.parseWarnings.slice(0, 5)],
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
  const structuralMaterialCounter = new Map();
  const confidenceCounts = { high: 0, medium: 0, low: 0 };

  for (const report of reports) {
    if (confidenceCounts[report.extractionConfidence] !== undefined) {
      confidenceCounts[report.extractionConfidence] += 1;
    }
    for (const material of report.detectedMaterials || []) {
      incrementCounter(materialCounter, material.name);
      incrementCounter(casCounter, material.cas);
      if ((material.percent ?? material.relativePercent ?? 0) >= 5) {
        incrementCounter(structuralMaterialCounter, material.name);
      }
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
  const reportsWithCountMismatches = reports.filter(
    (report) => report.componentCountDelta !== null && report.componentCountDelta !== 0
  );
  const reportsWithMetadataWarnings = reports.filter(
    (report) => Array.isArray(report.metadataWarnings) && report.metadataWarnings.length
  );
  const reportsWithHighUnidentifiedPercent = reports.filter(
    (report) => (report.unidentifiedPercent || 0) >= 5
  );
  return {
    generatedAt: new Date().toISOString(),
    reportsProcessed: reports.length,
    reportsParsed: reports.filter((report) => (report.detectedMaterials?.length || 0) > 0).length,
    reportsFailed: failedReports.length,
    trueComponentRowCount: reports.reduce(
      (sum, report) => sum + (report.detectedMaterials?.length || 0),
      0
    ),
    identifiedComponentRowCount: reports.reduce(
      (sum, report) => sum + (report.componentCountParsed || 0),
      0
    ),
    confidenceCounts,
    failedReports: failedReports.map((report) => ({
      id: report.id,
      sourceFilename: report.sourceFilename,
      notes: report.notes || [],
    })),
    reportsWithCountMismatches: reportsWithCountMismatches.map((report) => ({
      id: report.id,
      sourceFilename: report.sourceFilename,
      componentCountClaimed: report.componentCountClaimed,
      componentCountParsed: report.componentCountParsed,
      componentCountDelta: report.componentCountDelta,
    })),
    reportsWithMetadataWarnings: reportsWithMetadataWarnings.map((report) => ({
      id: report.id,
      sourceFilename: report.sourceFilename,
      metadataWarnings: report.metadataWarnings || [],
    })),
    reportsWithHighUnidentifiedPercent: reportsWithHighUnidentifiedPercent.map((report) => ({
      id: report.id,
      sourceFilename: report.sourceFilename,
      unidentifiedPercent: report.unidentifiedPercent,
    })),
    mostCommonDetectedMaterials: sortedCounterRows(materialCounter),
    mostCommonCasNumbers: sortedCounterRows(casCounter),
    topStructuralMaterialsAbove5Percent: sortedCounterRows(structuralMaterialCounter),
    materialsOverlappingInventory: sortedCounterRows(inventoryCounter),
    materialsAbsentFromInventory: sortedCounterRows(absentCounter),
    recurringAccordFamilies: sortedCounterRows(familyCounter),
    reportsNeedingManualReview: reviewReports.map((report) => ({
      id: report.id,
      sourceFilename: report.sourceFilename,
      extractionConfidence: report.extractionConfidence,
      detectedMaterialCount: report.detectedMaterials?.length || 0,
      componentCountClaimed: report.componentCountClaimed,
      componentCountParsed: report.componentCountParsed,
      totalPercent: report.totalPercent,
      unidentifiedPercent: report.unidentifiedPercent,
      parseWarningCount: report.parseWarningCount,
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
    `Reports parsed: ${summary.reportsParsed}`,
    `Reports failed: ${summary.reportsFailed}`,
    `True component rows: ${summary.trueComponentRowCount}`,
    `Identified component rows: ${summary.identifiedComponentRowCount}`,
    `Reports needing manual review: ${summary.reportsNeedingManualReview.length}`,
    `Extraction confidence: high ${summary.confidenceCounts.high}, medium ${summary.confidenceCounts.medium}, low ${summary.confidenceCounts.low}`,
    `Reports with count mismatches: ${summary.reportsWithCountMismatches.length}`,
    `Reports with metadata warnings: ${summary.reportsWithMetadataWarnings.length}`,
    `Reports with high unidentified percent: ${summary.reportsWithHighUnidentifiedPercent.length}`,
    "",
    "Most common detected materials:",
    formatCountRows(summary.mostCommonDetectedMaterials.slice(0, 15), "No materials detected yet."),
    "",
    "Top structural materials above 5%:",
    formatCountRows(
      summary.topStructuralMaterialsAbove5Percent.slice(0, 15),
      "No >5% structural materials detected yet."
    ),
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
  const reportColumns = [
    { label: "Report", value: (row) => row.sourceFilename || row.id },
    { label: "Detail", value: (row) => row.detail || "" },
  ];
  return [
    "# GCMS Reference Summary",
    "",
    "Review-first summary of locally extracted GCMS-backed fragrance analysis PDFs. GCMS output is not an exact formula, not compliance evidence, and requires manual review before use.",
    "",
    "## Counts",
    "",
    `- Reports processed: ${summary.reportsProcessed}`,
    `- Reports parsed: ${summary.reportsParsed}`,
    `- Reports failed: ${summary.reportsFailed}`,
    `- True component rows parsed: ${summary.trueComponentRowCount}`,
    `- Identified component rows parsed: ${summary.identifiedComponentRowCount}`,
    `- Reports needing manual review: ${summary.reportsNeedingManualReview.length}`,
    `- Extraction confidence: high ${summary.confidenceCounts.high}, medium ${summary.confidenceCounts.medium}, low ${summary.confidenceCounts.low}`,
    `- Reports with count mismatches: ${summary.reportsWithCountMismatches.length}`,
    `- Reports with metadata warnings: ${summary.reportsWithMetadataWarnings.length}`,
    `- Reports with unidentified compounds at or above 5%: ${summary.reportsWithHighUnidentifiedPercent.length}`,
    "",
    "## Most Common Detected Materials",
    "",
    markdownTable(summary.mostCommonDetectedMaterials, countColumns, "No materials detected yet."),
    "",
    "## Top Structural Materials Above 5%",
    "",
    markdownTable(
      summary.topStructuralMaterialsAbove5Percent,
      countColumns,
      "No >5% structural materials detected yet."
    ),
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
    "## Reports With Count Mismatches",
    "",
    markdownTable(
      summary.reportsWithCountMismatches.map((row) => ({
        ...row,
        detail: `claimed ${row.componentCountClaimed}; parsed ${row.componentCountParsed}; delta ${row.componentCountDelta}`,
      })),
      reportColumns,
      "No claimed-vs-parsed count mismatches."
    ),
    "",
    "## Reports With Metadata Warnings",
    "",
    markdownTable(
      summary.reportsWithMetadataWarnings.map((row) => ({
        ...row,
        detail: row.metadataWarnings.join("; "),
      })),
      reportColumns,
      "No metadata warnings."
    ),
    "",
    "## Reports With High Unidentified Percent",
    "",
    markdownTable(
      summary.reportsWithHighUnidentifiedPercent.map((row) => ({
        ...row,
        detail: `${row.unidentifiedPercent?.toFixed?.(3) ?? row.unidentifiedPercent}% unidentified`,
      })),
      reportColumns,
      "No reports have unidentified compounds at or above 5%."
    ),
    "",
    "## Reports Needing Manual Review",
    "",
    markdownTable(
      summary.reportsNeedingManualReview,
      [
        { label: "Report", value: (row) => row.sourceFilename || row.id },
        { label: "Confidence", value: (row) => row.extractionConfidence },
        { label: "Detected Materials", value: (row) => row.detectedMaterialCount },
        { label: "Claimed", value: (row) => row.componentCountClaimed ?? "" },
        { label: "Parsed", value: (row) => row.componentCountParsed ?? "" },
        { label: "Total %", value: (row) => row.totalPercent ?? "" },
        { label: "Parse Warnings", value: (row) => row.parseWarningCount ?? 0 },
      ],
      "No reports have been processed yet."
    ),
    "",
  ].join("\n");
}

export function loadStructuredCandidates(filePath = DEFAULT_GCMS_STRUCTURED_CANDIDATES_PATH) {
  return readJsonIfExists(filePath, { reports: [] });
}
