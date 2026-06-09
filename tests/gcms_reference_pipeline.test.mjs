import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildGcmsManifest,
  buildGcmsReferenceSummary,
  extractGcmsPdfText,
  formatGcmsSummaryMarkdown,
  normalizeGcmsManifestReports,
  parseMaterialCandidateLine,
  slugFromFilename,
  structureGcmsReportsFromExtraction,
} from "../scripts/lib/gcms_reference_pipeline.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GCMS_REPORT_FIXTURE_DIR = path.join(ROOT, "scripts", "fixtures", "gcms_reports");

test("GCMS filename slugging creates stable readable ids", () => {
  assert.equal(
    slugFromFilename("Sample Brand - Coastal Study GCMS.pdf"),
    "sample-brand-coastal-study-gcms"
  );
  assert.equal(slugFromFilename("!!!.pdf"), "gcms-report");
});

test("GCMS manifest creation scans only PDF fixture names", () => {
  const manifest = buildGcmsManifest({
    reportsDir: GCMS_REPORT_FIXTURE_DIR,
    generatedAt: "2026-06-09T00:00:00.000Z",
  });

  assert.equal(manifest.reportCount, 1);
  assert.equal(manifest.reports[0].id, "sample-brand-coastal-study-gcms");
  assert.equal(manifest.reports[0].filename, "Sample Brand - Coastal Study GCMS.pdf");
  assert.equal(manifest.reports[0].status, "pending_extraction");
  assert.equal(manifest.reports[0].brandGuess, "Sample Brand");
  assert.equal(manifest.reports[0].titleGuess, "Coastal Study");
});

test("GCMS extraction accepts manifest.reports including pending records", () => {
  const fixtureRelativePath = "scripts/fixtures/gcms_reports/Sample Brand - Coastal Study GCMS.pdf";
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gcms-extraction-test-"));
  const status = extractGcmsPdfText({
    generatedAt: "2026-06-09T00:00:00.000Z",
    manifestPath: path.join(tempDir, "unused_manifest.json"),
    manifest: {
      reportCount: 1,
      reports: [
        {
          id: "sample-brand-coastal-study-gcms",
          filename: "Sample Brand - Coastal Study GCMS.pdf",
          relativePath: fixtureRelativePath,
          status: "pending_extraction",
        },
      ],
    },
    rawTextDir: path.join(tempDir, "raw_text"),
    outputPath: path.join(tempDir, "gcms_extraction_status.json"),
    runPdfExtractor: () => ({
      pageCount: 1,
      pages: [{ pageNumber: 1, text: "Linalool 78-70-6 Area % 12.4" }],
    }),
  });

  assert.equal(normalizeGcmsManifestReports({ reports: status.reports }).length, 1);
  assert.equal(status.reportCount, 1);
  assert.equal(status.reports[0].extractionStatus, "ok");
  assert.equal(status.reports[0].textPath.endsWith("/raw_text/sample-brand-coastal-study-gcms.json"), true);
  assert.equal(fs.existsSync(path.join(tempDir, "raw_text", "sample-brand-coastal-study-gcms.json")), true);
});

test("GCMS extraction records individual missing PDF failures without dropping reports", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gcms-extraction-failure-test-"));
  const status = extractGcmsPdfText({
    generatedAt: "2026-06-09T00:00:00.000Z",
    manifest: {
      reportCount: 2,
      reports: [
        {
          id: "missing-report",
          filename: "Missing Report.pdf",
          relativePath: "downloads/gcms_reports/Missing Report.pdf",
          status: "pending_extraction",
        },
        {
          id: "missing-relative-path",
          filename: "Missing Relative Path.pdf",
          status: "pending_extraction",
        },
      ],
    },
    rawTextDir: path.join(tempDir, "raw_text"),
    outputPath: path.join(tempDir, "gcms_extraction_status.json"),
    runPdfExtractor: () => {
      throw new Error("Should not be called for invalid manifest paths");
    },
  });

  assert.equal(status.reportCount, 2);
  assert.equal(status.reports.every((report) => report.extractionStatus === "failed"), true);
  assert.match(status.reports[0].error, /PDF file not found/);
  assert.match(status.reports[1].error, /missing relativePath/i);
});

test("GCMS material row parsing is conservative and does not invent percentages", () => {
  const parsed = parseMaterialCandidateLine(
    "Linalool 78-70-6 Area % 12.40 Match Quality 91"
  );
  assert.equal(parsed.name, "Linalool");
  assert.equal(parsed.cas, "78-70-6");
  assert.equal(parsed.areaPercent, 12.4);
  assert.equal(parsed.matchQuality, 91);

  const noPercent = parseMaterialCandidateLine("Hedione CAS 24851-98-7");
  assert.equal(noPercent.name, "Hedione");
  assert.equal(noPercent.cas, "24851-98-7");
  assert.equal(noPercent.areaPercent, null);
  assert.equal(noPercent.relativePercent, null);

  const qualityOnly = parseMaterialCandidateLine("Iso E Super 54464-57-2 Match Quality 91%");
  assert.equal(qualityOnly.areaPercent, null);
  assert.equal(qualityOnly.matchQuality, 91);

  assert.equal(parseMaterialCandidateLine("Compound Name CAS Area %"), null);
});

test("GCMS structuring keeps failed and empty extractions review-first", () => {
  const structured = structureGcmsReportsFromExtraction({
    generatedAt: "2026-06-09T00:00:00.000Z",
    manifest: {
      reports: [
        {
          id: "failed-report",
          filename: "Failed Report.pdf",
          titleGuess: "Failed Report",
          brandGuess: "Fixture",
        },
        {
          id: "empty-report",
          filename: "Empty Report.pdf",
          titleGuess: "Empty Report",
          brandGuess: "Fixture",
        },
      ],
    },
    extractionStatus: {
      reports: [
        {
          id: "failed-report",
          filename: "Failed Report.pdf",
          extractionStatus: "failed",
          error: "fixture failure",
        },
        {
          id: "empty-report",
          filename: "Empty Report.pdf",
          extractionStatus: "partial",
          textPath: "data/gcms_extracted/raw_text/empty-report.json",
        },
      ],
    },
    rawTextById: {
      "empty-report": { text: "" },
    },
    inventoryNames: ["Linalool"],
  });

  assert.equal(structured.reportCount, 2);
  assert.equal(structured.reports[0].extractionStatus, "failed");
  assert.equal(structured.reports[0].reviewNeeded, true);
  assert.equal(structured.reports[1].extractionConfidence, "low");
  assert.ok(
    structured.reports[1].notes.includes(
      "No conservative material candidate rows were detected from extracted text."
    )
  );
});

test("GCMS summary counts material frequency, CAS, inventory overlap, and absent materials", () => {
  const structured = structureGcmsReportsFromExtraction({
    generatedAt: "2026-06-09T00:00:00.000Z",
    manifest: {
      reports: [
        {
          id: "coastal",
          filename: "Coastal.pdf",
          titleGuess: "Coastal",
          brandGuess: "Fixture",
        },
      ],
    },
    extractionStatus: {
      reports: [
        {
          id: "coastal",
          filename: "Coastal.pdf",
          extractionStatus: "ok",
          textPath: "data/gcms_extracted/raw_text/coastal.json",
        },
      ],
    },
    rawTextById: {
      coastal: {
        text: [
          "Linalool 78-70-6 Area % 12.40 Match Quality 91",
          "Calone 28940-11-6 0.50%",
        ].join("\n"),
      },
    },
    inventoryNames: ["Linalool"],
  });

  const report = structured.reports[0];
  assert.equal(report.detectedMaterials.length, 2);
  assert.equal(report.inventoryMatches[0].catalogName, "Linalool");
  assert.equal(report.unknownMaterials[0].name, "Calone");
  assert.ok(report.possibleFamilies.includes("marine"));

  const summary = buildGcmsReferenceSummary(structured);
  assert.equal(summary.reportsProcessed, 1);
  assert.equal(summary.mostCommonDetectedMaterials[0].name, "Calone");
  assert.equal(summary.mostCommonCasNumbers.some((row) => row.name === "78-70-6"), true);
  assert.equal(summary.materialsOverlappingInventory[0].name, "Linalool");
  assert.equal(summary.materialsAbsentFromInventory[0].name, "Calone");

  const markdown = formatGcmsSummaryMarkdown(summary);
  assert.match(markdown, /GCMS Reference Summary/);
  assert.match(markdown, /Beach Box Inventory Overlap/);
});
