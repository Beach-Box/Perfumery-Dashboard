import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildIfraSourceDocumentInventory,
  findQueueItemForReviewUpdate,
  formatHeroIfraSourceReviewStatusMarkdown,
  formatIfraSourceDocumentInventoryMarkdown,
  updateHeroIfraSourceQueueStatus,
} from "../scripts/lib/ifra_source_document_review.mjs";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ifra-doc-review-test-"));
}

function touchFixture(filePath, content = "synthetic fixture") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function buildSyntheticQueue() {
  return {
    metadata: {
      generatedAt: "2026-06-11T00:00:00.000Z",
    },
    summary: {
      itemCount: 4,
      statusCounts: { needed: 4 },
      reviewStatusCounts: { not_started: 4 },
    },
    items: [
      {
        id: "hero-ifra-source-octanal-aldehyde-c-8-global_ifra_standard_needed",
        materialName: "Aldehyde C-8",
        normalizedName: "Octanal / Aldehyde C-8",
        formulasUsedIn: ["Skin-Air Bridge"],
        priority: "high",
        requiredSourceType: "global_ifra_standard_needed",
        suggestedDocumentName: "IFRA 51st Amendment standard for Octanal",
        candidateSearchTerms: [
          "Aldehyde C-8",
          "Octanal",
          "CAS 124-13-0",
          "IFRA Octanal",
        ],
        currentIfraCategory: "sourceUnavailable",
        status: "needed",
        reviewStatus: "not_started",
        sourceFile: "",
        sourceNotes: "",
        reviewNotes: "",
        lastUpdated: "2026-06-11T00:00:00.000Z",
      },
      {
        id: "hero-ifra-source-gamma-nonalactone-global_ifra_standard_needed",
        materialName: "Aldehyde C-18",
        normalizedName: "Gamma Nonalactone",
        formulasUsedIn: ["Skin-Air Bridge"],
        priority: "high",
        requiredSourceType: "global_ifra_standard_needed",
        suggestedDocumentName: "IFRA 51st Amendment standard for Gamma Nonalactone",
        candidateSearchTerms: ["Aldehyde C-18", "Gamma Nonalactone"],
        currentIfraCategory: "sourceUnavailable",
        status: "needed",
        reviewStatus: "not_started",
        sourceFile: "",
        sourceNotes: "",
        reviewNotes: "",
        lastUpdated: "2026-06-11T00:00:00.000Z",
      },
      {
        id: "hero-ifra-source-cedarwood-virginia-natural_uvcb_supplier_document_needed",
        materialName: "Cedarwood Virginia EO",
        normalizedName: "Cedarwood Virginia",
        formulasUsedIn: ["Damp Shoreline v2"],
        priority: "high",
        requiredSourceType: "natural_uvcb_supplier_document_needed",
        suggestedDocumentName: "Cedarwood Virginia EO supplier IFRA/SDS",
        candidateSearchTerms: ["Cedarwood Virginia EO", "Juniperus virginiana"],
        currentIfraCategory: "supplierSdsNeeded",
        status: "needed",
        reviewStatus: "not_started",
        sourceFile: "",
        sourceNotes: "",
        reviewNotes: "",
        lastUpdated: "2026-06-11T00:00:00.000Z",
      },
      {
        id: "hero-ifra-source-cedarwood-virginia-specialty_supplier_document_needed",
        materialName: "Cedarwood Virginia Absolute",
        normalizedName: "Cedarwood Virginia",
        formulasUsedIn: ["Damp Shoreline v2"],
        priority: "medium",
        requiredSourceType: "specialty_supplier_document_needed",
        suggestedDocumentName: "Cedarwood Virginia Absolute supplier IFRA/SDS",
        candidateSearchTerms: ["Cedarwood Virginia Absolute"],
        currentIfraCategory: "supplierSdsNeeded",
        status: "needed",
        reviewStatus: "not_started",
        sourceFile: "",
        sourceNotes: "",
        reviewNotes: "",
        lastUpdated: "2026-06-11T00:00:00.000Z",
      },
    ],
  };
}

test("IFRA source document inventory matches safe normalized material terms", () => {
  const sourceDir = makeTempDir();
  touchFixture(path.join(sourceDir, "Aldehyde_C8_IFRA_51st_Standard.pdf"));

  const inventory = buildIfraSourceDocumentInventory({
    sourceDir,
    queue: buildSyntheticQueue(),
    generatedAt: "2026-06-11T01:00:00.000Z",
    root: sourceDir,
  });

  assert.equal(inventory.summary.documentCount, 1);
  assert.equal(inventory.summary.matchedDocumentCount, 1);
  assert.equal(inventory.documents[0].matchConfidence, "high");
  assert.deepEqual(inventory.documents[0].matchedQueueItemIds, [
    "hero-ifra-source-octanal-aldehyde-c-8-global_ifra_standard_needed",
  ]);
  assert.equal(inventory.documents[0].sourceTypeGuess, "global_ifra_standard");
});

test("IFRA source document inventory flags ambiguous matches without auto-linking", () => {
  const sourceDir = makeTempDir();
  touchFixture(path.join(sourceDir, "Cedarwood_Virginia_IFRA.pdf"));

  const inventory = buildIfraSourceDocumentInventory({
    sourceDir,
    queue: buildSyntheticQueue(),
    generatedAt: "2026-06-11T01:00:00.000Z",
    root: sourceDir,
  });
  const document = inventory.documents[0];

  assert.equal(document.matchConfidence, "low");
  assert.deepEqual(document.matchedQueueItemIds, []);
  assert.equal(document.possibleMatches.length, 2);
});

test("IFRA source document inventory handles missing folders with an empty inventory", () => {
  const sourceDir = path.join(makeTempDir(), "missing", "ifra");
  const inventory = buildIfraSourceDocumentInventory({
    sourceDir,
    queue: buildSyntheticQueue(),
    generatedAt: "2026-06-11T01:00:00.000Z",
  });

  assert.equal(fs.existsSync(sourceDir), true);
  assert.equal(inventory.summary.documentCount, 0);
  assert.deepEqual(inventory.documents, []);
});

test("IFRA queue status update touches only manual review fields", () => {
  const queue = buildSyntheticQueue();
  const beforeMaterialName = queue.items[0].materialName;
  const beforeRequiredSourceType = queue.items[0].requiredSourceType;
  const result = updateHeroIfraSourceQueueStatus({
    queue,
    id: "aldehyde-c-8-global-ifra-standard-needed",
    now: "2026-06-11T02:00:00.000Z",
    updates: {
      status: "acquired",
      reviewStatus: "needs_review",
      sourceFile: "/repo/downloads/source_documents/ifra/Aldehyde_C8_IFRA.pdf",
      sourceNotes: "Downloaded source document; needs extraction/review.",
      reviewNotes: "Check Cat 4 later.",
      materialName: "Do Not Change",
    },
    root: "/repo",
  });

  assert.equal(result.item.materialName, beforeMaterialName);
  assert.equal(result.item.requiredSourceType, beforeRequiredSourceType);
  assert.equal(result.item.status, "acquired");
  assert.equal(result.item.reviewStatus, "needs_review");
  assert.equal(
    result.item.sourceFile,
    "downloads/source_documents/ifra/Aldehyde_C8_IFRA.pdf"
  );
  assert.equal(result.item.lastUpdated, "2026-06-11T02:00:00.000Z");
  assert.equal(
    findQueueItemForReviewUpdate(result.queue.items, result.item.id).id,
    result.item.id
  );
});

test("IFRA source review markdown groups review states and avoids compliance claims", () => {
  const queue = buildSyntheticQueue();
  const updated = updateHeroIfraSourceQueueStatus({
    queue,
    id: "hero-ifra-source-octanal-aldehyde-c-8-global_ifra_standard_needed",
    now: "2026-06-11T02:00:00.000Z",
    updates: {
      status: "acquired",
      reviewStatus: "needs_review",
      sourceFile: "downloads/source_documents/ifra/Aldehyde_C8_IFRA.pdf",
    },
  }).queue;
  const markdown = formatHeroIfraSourceReviewStatusMarkdown({
    queue: updated,
    inventory: {
      summary: { documentCount: 1, matchedDocumentCount: 1 },
      documents: [
        {
          matchedQueueItemIds: [
            "hero-ifra-source-octanal-aldehyde-c-8-global_ifra_standard_needed",
          ],
          relativePath: "downloads/source_documents/ifra/Aldehyde_C8_IFRA.pdf",
        },
      ],
    },
  });
  const inventoryMarkdown = formatIfraSourceDocumentInventoryMarkdown({
    metadata: { generatedAt: "2026-06-11T01:00:00.000Z" },
    summary: {
      documentCount: 0,
      matchedDocumentCount: 0,
      possibleMatchDocumentCount: 0,
      unmatchedDocumentCount: 0,
    },
    documents: [],
  });

  assert.match(markdown, /## Acquired \/ Needs Review/);
  assert.match(markdown, /Aldehyde C-8/);
  assert.match(markdown, /Reviewed OK is not promotion/);
  assert.doesNotMatch(markdown, /categoryLimits/i);
  assert.doesNotMatch(markdown, /max(?:imum)?\s*use/i);
  assert.match(inventoryMarkdown, /does not parse PDFs, add IFRA limits/);
});
