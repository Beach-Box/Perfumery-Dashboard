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
  assert.equal(downloaded.metadata.mode, "download");
  assert.equal(downloaded.summary.downloadAttemptCount, 1);
  assert.equal(downloaded.summary.downloadSuccessCount, 1);
  assert.equal(downloaded.summary.downloadFetchedCount, 1);
  assert.equal(downloaded.summary.downloadFailureCount, 0);
  assert.equal(downloaded.summary.downloadedByType[link.sourceType], 1);
  assert.deepEqual(downloaded.summary.downloadFailures, []);
  assert.equal(metadata.sourceUrl, link.sourceUrl);
  assert.equal(metadata.httpStatus, 200);
  assert.equal(metadata.sourceType, link.sourceType);
  assert.ok(metadata.localPath);
});

test("download mode records individual failures without failing the whole report", async () => {
  const tempDir = makeTempDir();
  const report = {
    metadata: { mode: "download" },
    summary: { duplicateUrlCount: 2 },
    sourceLinks: [
      {
        sourceUrl: "https://supplier.test/missing.pdf",
        sourceType: "supplier_sds",
        materialNames: ["Aldehyde C-8"],
        ingredients: ["Aldehyde C-8"],
        suppliers: ["Synthetic Supplier"],
        queueItemIds: ["hero-ifra-source-octanal-aldehyde-c-8-global_ifra_standard_needed"],
      },
    ],
  };
  const fakeFetch = async () => ({
    ok: false,
    status: 404,
    headers: { get: () => "text/html" },
    arrayBuffer: async () => Buffer.from("not found").buffer,
  });

  const downloaded = await downloadHarvestSources({
    report,
    fetchImpl: fakeFetch,
    rateLimitMs: 0,
    root: tempDir,
    sourceDir: path.join(tempDir, "source_documents", "ifra"),
  });

  assert.equal(downloaded.sourceLinks[0].downloadStatus, "failed");
  assert.equal(downloaded.summary.downloadAttemptCount, 1);
  assert.equal(downloaded.summary.downloadSuccessCount, 0);
  assert.equal(downloaded.summary.downloadFailureCount, 1);
  assert.equal(downloaded.summary.downloadSkippedDuplicateCount, 2);
  assert.deepEqual(downloaded.summary.downloadFailures[0], {
    sourceUrl: "https://supplier.test/missing.pdf",
    materialName: "Aldehyde C-8",
    sourceType: "supplier_sds",
    reason: "HTTP 404",
    httpStatus: 404,
    notes: [],
  });
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
  assert.equal(cat4.reviewPriority, "high");
  assert.equal(cat4.reviewStatus, "needs_review");
  assert.deepEqual(cat4.queueItemIds, [
    "hero-ifra-source-octanal-aldehyde-c-8-global_ifra_standard_needed",
  ]);
  assert.match(markdown, /review only/);
  assert.doesNotMatch(markdown, /runtime IFRA data updated/i);
});

test("candidate extractor prefers explicit IFRA finished-product value over average-use text", () => {
  const tempDir = makeTempDir();
  const htmlPath = path.join(tempDir, "product_pages", "cashmeran.html");
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.writeFileSync(
    htmlPath,
    "<html><body>IFRA 51: 3.8% in finished product (Cat. 4) Average Use: 0.33% in a perfume compound.</body></html>"
  );
  fs.writeFileSync(
    `${htmlPath}.metadata.json`,
    `${JSON.stringify(
      {
        sourceUrl: "https://supplier.test/cashmeran",
        materialName: "Cashmeran",
        materialNames: ["Cashmeran"],
        queueItemIds: ["hero-ifra-source-cashmeran-already_structured"],
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
    queue: buildQueue(),
    harvestReport: null,
  });
  const cat4 = report.candidates.find(
    (candidate) => candidate.candidateLimitType === "ifra_category_limit"
  );

  assert.ok(cat4);
  assert.equal(cat4.category, "4");
  assert.equal(cat4.candidateValue, "3.8");
  assert.equal(cat4.reviewPriority, "high");
});

test("candidate extractor suppresses identity-reference navigation noise", () => {
  const tempDir = makeTempDir();
  const htmlPath = path.join(tempDir, "from_csv", "goodscents-octanal.html");
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.writeFileSync(
    htmlPath,
    [
      "<html><body>",
      "Twitter Instagram Linkedin Pinterest Upcoming Events Blog Navigating IFRA Limits.",
      "neutral filler ".repeat(50),
      "Products List: Octanal. Name: octanal CAS Number: 124-13-0 Synonyms: Aldehyde C-8.",
      "neutral filler ".repeat(50),
      "Supplier directory: Example Co SDS More SDS Product(s) View full details Customer Reviews.",
      "Footer Search Demo Formulas Shipping Policy Privacy Policy.",
      "</body></html>",
    ].join(" ")
  );
  fs.writeFileSync(
    `${htmlPath}.metadata.json`,
    `${JSON.stringify(
      {
        sourceUrl: "https://www.thegoodscentscompany.test/octanal",
        materialName: "Aldehyde C-8",
        materialNames: ["Aldehyde C-8"],
        queueItemIds: [],
        httpStatus: 200,
        contentType: "text/html",
        localPath: htmlPath,
        sourceType: "identity_reference",
      },
      null,
      2
    )}\n`
  );

  const report = buildCandidateIfraSourceExtractions({
    sourceDir: tempDir,
    generatedAt: "2026-06-11T02:00:00.000Z",
    root: tempDir,
    queue: buildQueue(),
    harvestReport: null,
  });

  assert.equal(report.summary.candidateTypeCounts.unknown || 0, 0);
  assert.ok(report.summary.suppressedSnippetCount > 0);
  assert.ok(report.candidates.some((candidate) => candidate.candidateLimitType === "identity"));
  assert.ok(report.candidates.every((candidate) => candidate.reviewPriority === "low"));
});

test("candidate extractor retains phototoxic and FCF snippets as high-priority review candidates", () => {
  const tempDir = makeTempDir();
  const htmlPath = path.join(tempDir, "product_pages", "bergamot.html");
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.writeFileSync(
    htmlPath,
    "<html><body>Bergamot FCF material. Phototoxic furocoumarin and bergapten-free status should be reviewed.</body></html>"
  );
  fs.writeFileSync(
    `${htmlPath}.metadata.json`,
    `${JSON.stringify(
      {
        sourceUrl: "https://supplier.test/bergamot-fcf",
        materialName: "Bergamot FCF",
        materialNames: ["Bergamot FCF"],
        queueItemIds: ["hero-ifra-source-bergamot-fcf-fcf_special_case"],
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
    queue: buildQueue(),
    harvestReport: null,
  });
  const phototoxic = report.candidates.find(
    (candidate) => candidate.candidateLimitType === "phototoxic_note"
  );

  assert.ok(phototoxic);
  assert.equal(phototoxic.reviewPriority, "high");
  assert.equal(report.summary.reviewPriorityCounts.high, 1);
});

test("candidate extractor does not treat GHS Category 4 hazards as IFRA Cat 4 limits", () => {
  const tempDir = makeTempDir();
  const htmlPath = path.join(tempDir, "from_csv", "ghs-category.html");
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.writeFileSync(
    htmlPath,
    "<html><body>GHS Classification Flammable liquids (Category 4), H227. Skin irritation (Category 2), H315.</body></html>"
  );
  fs.writeFileSync(
    `${htmlPath}.metadata.json`,
    `${JSON.stringify(
      {
        sourceUrl: "https://identity.test/ghs",
        materialName: "Birch Tar Oil Rectified",
        materialNames: ["Birch Tar Oil Rectified"],
        queueItemIds: [],
        httpStatus: 200,
        contentType: "text/html",
        localPath: htmlPath,
        sourceType: "identity_reference",
      },
      null,
      2
    )}\n`
  );

  const report = buildCandidateIfraSourceExtractions({
    sourceDir: tempDir,
    generatedAt: "2026-06-11T02:00:00.000Z",
    root: tempDir,
    queue: buildQueue(),
    harvestReport: null,
  });

  assert.equal(report.summary.candidateTypeCounts.ifra_category_limit || 0, 0);
  assert.equal(report.summary.reviewPriorityCounts.high || 0, 0);
});

test("candidate extractor does not treat RIFM usage recommendations as IFRA Cat 4 limits", () => {
  const tempDir = makeTempDir();
  const htmlPath = path.join(tempDir, "from_csv", "rifm-usage.html");
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.writeFileSync(
    htmlPath,
    "<html><body>RIFM Fragrance Material Safety Assessment: Search IFRA Code of Practice Recommendation for octanol usage levels up to: 2.0000 % in the fragrance concentrate.</body></html>"
  );
  fs.writeFileSync(
    `${htmlPath}.metadata.json`,
    `${JSON.stringify(
      {
        sourceUrl: "https://identity.test/rifm",
        materialName: "Alcohol C8 (Octanol)",
        materialNames: ["Alcohol C8 (Octanol)"],
        queueItemIds: [],
        httpStatus: 200,
        contentType: "text/html",
        localPath: htmlPath,
        sourceType: "identity_reference",
      },
      null,
      2
    )}\n`
  );

  const report = buildCandidateIfraSourceExtractions({
    sourceDir: tempDir,
    generatedAt: "2026-06-11T02:00:00.000Z",
    root: tempDir,
    queue: buildQueue(),
    harvestReport: null,
  });

  assert.equal(report.summary.candidateTypeCounts.ifra_category_limit || 0, 0);
  assert.ok(
    report.candidates.some(
      (candidate) => candidate.candidateLimitType === "allergen_or_restriction"
    )
  );
});

test("candidate extractor safely links candidates to queue items by exact material terms", () => {
  const tempDir = makeTempDir();
  const htmlPath = path.join(tempDir, "product_pages", "seaweed.html");
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.writeFileSync(
    htmlPath,
    "<html><body>Seaweed Absolute CAS identity and SDS available. Supplier page requires review.</body></html>"
  );
  fs.writeFileSync(
    `${htmlPath}.metadata.json`,
    `${JSON.stringify(
      {
        sourceUrl: "https://supplier.test/seaweed",
        materialName: "Seaweed Absolute 10%",
        materialNames: ["Seaweed Absolute 10%"],
        queueItemIds: [],
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
    queue: buildQueue(),
    harvestReport: null,
  });
  const linked = report.candidates.find((candidate) => candidate.queueItemIds.length);

  assert.ok(linked);
  assert.equal(linked.queueItemIds[0], "hero-ifra-source-seaweed-absolute-natural_uvcb_supplier_document_needed");
  assert.equal(linked.queueLinkConfidence, "material_exact");
  assert.equal(report.summary.linkedCandidateCount, report.candidates.length);
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
