import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildCandidateIfraSourceExtractions,
  buildIngredientSourceHarvestReport,
  classifySourceLink,
  downloadHarvestSources,
  formatCandidateIfraExtractionsMarkdown,
  formatIngredientSourceHarvestMarkdown,
  inspectIfra51Pdf,
} from "../scripts/lib/ifra_source_harvest.mjs";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ifra-source-harvest-test-"));
}

function writeCsvFixture(filePath) {
  fs.writeFileSync(
    filePath,
    [
      [
        "Neat Ingredients",
        "Ingredient",
        "Name",
        "CAS",
        "URL",
        "SDS Link",
        "Product Page",
        "Supplier Page",
        "Supplier",
        "Description",
      ].join(","),
      [
        "Aldehyde C-8",
        "Aldehyde C-8",
        "Octanal",
        "124-13-0",
        "https://example.test/octanal",
        "https://example.test/octanal-sds.pdf",
        "https://supplier.test/octanal-product",
        "https://supplier.test/octanal-product",
        "Synthetic Supplier",
        "aldehydic material",
      ].join(","),
      [
        "Seaweed Absolute",
        "Seaweed Absolute 10%",
        "Seaweed Absolute",
        "",
        "",
        "",
        "https://supplier.test/seaweed-product",
        "",
        "Natural Supplier",
        "marine natural",
      ].join(","),
    ].join("\n")
  );
}

function buildQueue() {
  return {
    items: [
      {
        id: "hero-ifra-source-octanal-aldehyde-c-8-global_ifra_standard_needed",
        materialName: "Aldehyde C-8",
        normalizedName: "Octanal / Aldehyde C-8",
        requiredSourceType: "global_ifra_standard_needed",
        candidateSearchTerms: ["Aldehyde C-8", "Octanal", "CAS 124-13-0"],
        sourceRowNames: ["Aldehyde C-8"],
        status: "needed",
        reviewStatus: "not_started",
      },
      {
        id: "hero-ifra-source-seaweed-absolute-natural_uvcb_supplier_document_needed",
        materialName: "Seaweed Absolute 10%",
        normalizedName: "Seaweed Absolute",
        requiredSourceType: "natural_uvcb_supplier_document_needed",
        candidateSearchTerms: ["Seaweed Absolute", "Seaweed Absolute 10%"],
        sourceRowNames: ["Seaweed Absolute 10%"],
        status: "needed",
        reviewStatus: "not_started",
      },
    ],
  };
}

test("ingredient CSV harvest extracts and classifies source links without downloading by default", () => {
  const tempDir = makeTempDir();
  const csvPath = path.join(tempDir, "ingredient-reference.csv");
  writeCsvFixture(csvPath);
  const report = buildIngredientSourceHarvestReport({
    ingredientReferencePath: csvPath,
    queue: buildQueue(),
    generatedAt: "2026-06-11T01:00:00.000Z",
    ifra51ExpectedPath: path.join(tempDir, "missing-ifra.pdf"),
  });

  assert.equal(report.summary.csvRowCount, 2);
  assert.equal(report.summary.activeHeroMatchedQueueItemCount, 2);
  assert.equal(report.summary.sourceLinkCount, 4);
  assert.equal(report.summary.duplicateUrlCount, 1);
  assert.equal(report.summary.sourceLinkTypeCounts.supplier_sds, 1);
  assert.equal(report.summary.sourceLinkTypeCounts.product_page, 2);
  assert.equal(report.summary.sourceLinkTypeCounts.identity_reference, 1);
  assert.ok(report.sourceLinks.every((link) => link.downloadStatus === "not_requested"));
  assert.equal(report.ifra51Pdf.found, false);

  const markdown = formatIngredientSourceHarvestMarkdown(report);
  assert.match(markdown, /does not add IFRA limits/);
  assert.match(markdown, /Aldehyde C-8/);
});

test("IFRA 51 PDF inspection can copy to an ignored local cache path when requested", () => {
  const tempDir = makeTempDir();
  const expectedPath = path.join(tempDir, "IFRA - 51st Amendment.pdf");
  const cachePath = path.join(
    tempDir,
    "downloads",
    "source_documents",
    "ifra",
    "global",
    "IFRA - 51st Amendment.pdf"
  );
  fs.writeFileSync(expectedPath, "synthetic pdf bytes");

  const dryRun = inspectIfra51Pdf({
    expectedPath,
    cachePath,
    copy: false,
    root: tempDir,
  });
  assert.equal(dryRun.found, true);
  assert.equal(dryRun.copied, false);
  assert.equal(fs.existsSync(cachePath), false);

  const copied = inspectIfra51Pdf({
    expectedPath,
    cachePath,
    copy: true,
    root: tempDir,
  });
  assert.equal(copied.found, true);
  assert.equal(copied.copied, true);
  assert.equal(fs.readFileSync(cachePath, "utf8"), "synthetic pdf bytes");
});

test("source link classifier separates SDS, IFRA certificates, product, and safety pages", () => {
  assert.equal(
    classifySourceLink({ url: "https://supplier.test/file-sds.pdf", sourceField: "SDS Link" }),
    "supplier_sds"
  );
  assert.equal(
    classifySourceLink({
      url: "https://supplier.test/ifra-certificate.pdf",
      sourceField: "Supplier Page",
    }),
    "supplier_ifra"
  );
  assert.equal(
    classifySourceLink({ url: "https://supplier.test/product/octanal", sourceField: "Product Page" }),
    "product_page"
  );
  assert.equal(
    classifySourceLink({ url: "https://supplier.test/regulatory-safety", sourceField: "URL" }),
    "safety_page"
  );
});

test("download mode caches source content and metadata using a supplied fetch implementation", async () => {
  const tempDir = makeTempDir();
  const csvPath = path.join(tempDir, "ingredient-reference.csv");
  writeCsvFixture(csvPath);
  const report = buildIngredientSourceHarvestReport({
    ingredientReferencePath: csvPath,
    queue: buildQueue(),
    generatedAt: "2026-06-11T01:00:00.000Z",
    download: true,
    ifra51ExpectedPath: path.join(tempDir, "missing-ifra.pdf"),
  });
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => "text/html; charset=utf-8" },
    arrayBuffer: async () =>
      Buffer.from("<html>IFRA Category 4 maximum use level 2.5%</html>").buffer,
  });

  const downloaded = await downloadHarvestSources({
    report: { ...report, sourceLinks: report.sourceLinks.slice(0, 1) },
    fetchImpl: fakeFetch,
    rateLimitMs: 0,
    root: tempDir,
    sourceDir: path.join(tempDir, "source_documents", "ifra"),
  });
  const link = downloaded.sourceLinks[0];
  const metadataPath = path.resolve(tempDir, link.metadataPath);
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));

  assert.equal(link.downloadStatus, "downloaded");
  assert.equal(metadata.sourceUrl, link.sourceUrl);
  assert.equal(metadata.httpStatus, 200);
  assert.equal(metadata.sourceType, link.sourceType);
  assert.ok(metadata.localPath);
});

test("candidate extractor finds product-page Cat 4 snippets as review candidates only", () => {
  const tempDir = makeTempDir();
  const htmlPath = path.join(tempDir, "product_pages", "octanal.html");
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.writeFileSync(
    htmlPath,
    "<html><body>Octanal CAS 124-13-0. IFRA Category 4 maximum use level 2.5% in fine fragrance.</body></html>"
  );
  fs.writeFileSync(
    `${htmlPath}.metadata.json`,
    `${JSON.stringify(
      {
        sourceUrl: "https://supplier.test/octanal",
        materialName: "Aldehyde C-8",
        materialNames: ["Aldehyde C-8"],
        queueItemIds: [
          "hero-ifra-source-octanal-aldehyde-c-8-global_ifra_standard_needed",
        ],
        supplier: "Synthetic Supplier",
        httpStatus: 200,
        contentType: "text/html",
        localPath: htmlPath,
        sourceType: "product_page",
      },
      null,
      2
    )}\n`
  );

  const report = buildCandidateIfraSourceExtractions({
    sourceDir: tempDir,
    generatedAt: "2026-06-11T02:00:00.000Z",
    root: tempDir,
  });
  const cat4 = report.candidates.find(
    (candidate) => candidate.candidateLimitType === "ifra_category_limit"
  );
  const markdown = formatCandidateIfraExtractionsMarkdown(report);

  assert.ok(cat4);
  assert.equal(cat4.sourceType, "supplier_product_page");
  assert.equal(cat4.category, "4");
  assert.equal(cat4.candidateValue, "2.5");
  assert.equal(cat4.reviewStatus, "needs_review");
  assert.deepEqual(cat4.queueItemIds, [
    "hero-ifra-source-octanal-aldehyde-c-8-global_ifra_standard_needed",
  ]);
  assert.match(markdown, /review only/);
  assert.doesNotMatch(markdown, /runtime IFRA data updated/i);
});

test("harvest and extraction helpers do not mutate queue status or runtime IFRA data", () => {
  const tempDir = makeTempDir();
  const csvPath = path.join(tempDir, "ingredient-reference.csv");
  writeCsvFixture(csvPath);
  const queue = buildQueue();
  const beforeQueue = JSON.stringify(queue);
  const report = buildIngredientSourceHarvestReport({
    ingredientReferencePath: csvPath,
    queue,
    generatedAt: "2026-06-11T01:00:00.000Z",
    ifra51ExpectedPath: path.join(tempDir, "missing-ifra.pdf"),
  });

  assert.equal(JSON.stringify(queue), beforeQueue);
  assert.ok(report.metadata.guardrails.some((line) => /does not update runtime IFRA/i.test(line)));
});
