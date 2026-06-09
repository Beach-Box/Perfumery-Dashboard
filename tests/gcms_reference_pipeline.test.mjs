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
  parseInscentifyComponentRow,
  parseInscentifyFormulaTable,
  parseInscentifyTotalRow,
  parseMaterialCandidateLine,
  slugFromFilename,
  structureGcmsReportsFromExtraction,
} from "../scripts/lib/gcms_reference_pipeline.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GCMS_REPORT_FIXTURE_DIR = path.join(ROOT, "scripts", "fixtures", "gcms_reports");

function buildSyntheticInscentifyText() {
  return [
    "A GCMS ANALYSIS OF",
    "Coastal Study",
    "Fixture Brand (2026)",
    "Perfumer: Example Nose",
    "",
    "Complete Formula Breakdown",
    "This fragrance contains 4 identified components, listed below in descending order of concentra-",
    "tion. Highlighted materials make up 80% of the total formula by weight.",
    "# Component CAS PPT %",
    "1 Iso E Super 54464-57-2 230.587 23.059",
    "2 Ethyl Linalool 10339-55-6 154.774 15.477",
    "Page 4 of 8 © 2026 Inscentify Ltd.",
    "# Component CAS PPT %",
    "3 Seaweed Absolute Not available 10.000 1.000",
    "4 Ambromusc 0.607 0.061",
    "5 Unidentified compounds N/A 604.032 60.403",
    "TOTAL 1000.000 100.000",
    "Page 5 of 8 © 2026 Inscentify Ltd.",
    "",
    "How to Read a GCMS Analysis",
    "Look for the biggest percentages first. A reading of 42.3% might represent rounded dosage.",
  ].join("\n");
}

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

test("GCMS Inscentify component row parsing is strict and does not invent values", () => {
  const parsed = parseInscentifyComponentRow(
    "1 Iso E Super 54464-57-2 230.587 23.059"
  )?.component;
  assert.equal(parsed.rank, 1);
  assert.equal(parsed.name, "Iso E Super");
  assert.equal(parsed.cas, "54464-57-2");
  assert.equal(parsed.ppt, 230.587);
  assert.equal(parsed.percent, 23.059);
  assert.equal(parsed.relativePercent, 23.059);
  assert.equal(parsed.areaPercent, null);

  const unavailable = parseInscentifyComponentRow(
    "15 Bulnesol Acetate Not available 17.231 1.723"
  )?.component;
  assert.equal(unavailable.name, "Bulnesol Acetate");
  assert.equal(unavailable.cas, "Not available");

  const noCas = parseInscentifyComponentRow("32 Ambromusc 0.607 0.061")?.component;
  assert.equal(noCas.name, "Ambromusc");
  assert.equal(noCas.cas, "");
  assert.equal(noCas.percent, 0.061);

  const unidentified = parseInscentifyComponentRow(
    "141 Unidentified compounds N/A 32.110 3.211"
  )?.component;
  assert.equal(unidentified.name, "Unidentified compounds");
  assert.equal(unidentified.cas, "N/A");
  assert.equal(unidentified.percent, 3.211);

  assert.equal(parseInscentifyTotalRow("TOTAL 1000.000 100.000").percent, 100);
  assert.equal(parseInscentifyComponentRow("Look for a reading of 42.3%"), null);
  assert.equal(parseMaterialCandidateLine("Linalool 78-70-6 Area % 12.40"), null);
});

test("GCMS formula table parser ignores headers and page markers across pages", () => {
  const parsed = parseInscentifyFormulaTable(buildSyntheticInscentifyText());

  assert.equal(parsed.tableFound, true);
  assert.equal(parsed.detectedMaterials.length, 5);
  assert.equal(parsed.detectedMaterials[0].name, "Iso E Super");
  assert.equal(parsed.detectedMaterials[2].cas, "Not available");
  assert.equal(parsed.detectedMaterials[4].name, "Unidentified compounds");
  assert.equal(parsed.totalPercent, 100);
  assert.equal(parsed.parseWarnings.length, 0);
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
      "No strict Complete Formula Breakdown component rows were detected from extracted text."
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
        text: buildSyntheticInscentifyText(),
      },
    },
    inventoryNames: ["Iso E Super"],
  });

  const report = structured.reports[0];
  assert.equal(report.fragranceName, "Coastal Study");
  assert.equal(report.brand, "Fixture Brand");
  assert.equal(report.releaseYear, 2026);
  assert.equal(report.perfumer, "Example Nose");
  assert.equal(report.componentCountClaimed, 4);
  assert.equal(report.componentCountParsed, 4);
  assert.equal(report.componentCountDelta, 0);
  assert.equal(report.detectedMaterials.length, 5);
  assert.equal(report.totalPercent, 100);
  assert.equal(report.unidentifiedPercent, 60.403);
  assert.equal(report.parseWarningCount, 0);
  assert.equal(report.extractionConfidence, "high");
  assert.equal(report.inventoryMatches[0].catalogName, "Iso E Super");
  assert.equal(report.unknownMaterials.some((row) => row.name === "Ethyl Linalool"), true);
  assert.ok(report.possibleFamilies.includes("marine"));

  const summary = buildGcmsReferenceSummary(structured);
  assert.equal(summary.reportsProcessed, 1);
  assert.equal(summary.reportsParsed, 1);
  assert.equal(summary.trueComponentRowCount, 5);
  assert.equal(summary.identifiedComponentRowCount, 4);
  assert.equal(summary.confidenceCounts.high, 1);
  assert.equal(summary.mostCommonDetectedMaterials.some((row) => row.name === "Iso E Super"), true);
  assert.equal(summary.mostCommonCasNumbers.some((row) => row.name === "54464-57-2"), true);
  assert.equal(summary.topStructuralMaterialsAbove5Percent.some((row) => row.name === "Ethyl Linalool"), true);
  assert.equal(summary.materialsOverlappingInventory[0].name, "Iso E Super");
  assert.equal(summary.materialsAbsentFromInventory.some((row) => row.name === "Ethyl Linalool"), true);
  assert.equal(summary.reportsWithHighUnidentifiedPercent.length, 1);

  const markdown = formatGcmsSummaryMarkdown(summary);
  assert.match(markdown, /GCMS Reference Summary/);
  assert.match(markdown, /Beach Box Inventory Overlap/);
  assert.match(markdown, /Top Structural Materials Above 5%/);
  assert.match(markdown, /Reports With High Unidentified Percent/);
});
