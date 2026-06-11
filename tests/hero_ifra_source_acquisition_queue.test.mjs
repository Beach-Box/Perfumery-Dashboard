import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHeroIfraSourceAcquisitionQueue,
  formatHeroIfraSourceAcquisitionQueueMarkdown,
  makeHeroIfraSourceQueueItemId,
} from "../scripts/lib/hero_ifra_source_acquisition_queue.mjs";

function buildSyntheticGapReport() {
  return {
    metadata: {
      generatedAt: "2026-06-11T00:00:00.000Z",
      reportName: "Hero IFRA Source Gap Report",
    },
    materials: [
      {
        materialName: "Seaweed Absolute 10%",
        normalizedName: "Seaweed Absolute",
        formulasUsedIn: ["Skin-Air Bridge", "Damp Shoreline v2"],
        priority: "high",
        requiredSourceType: "natural_uvcb_supplier_document_needed",
        suggestedDocumentName:
          "Seaweed Absolute 10% supplier IFRA certificate, SDS, and product identity/spec document",
        candidateSearchTerms: [
          "Seaweed Absolute",
          "Seaweed Absolute SDS",
          "Seaweed Absolute IFRA certificate",
        ],
        currentIfraCategory: "supplierSdsNeeded",
        reason:
          "Current IFRA category is supplierSdsNeeded. Appears in 2 active hero formulas.",
        referenceMatchConfidence: "confirmed",
        referenceSdsLink: "https://example.test/seaweed-sds.pdf",
        referenceProductPage: "https://example.test/seaweed",
      },
      {
        materialName: "Iso E Super",
        normalizedName: "Iso E Super",
        formulasUsedIn: ["Random Concoction - Original", "Skin-Air Bridge"],
        priority: "high",
        requiredSourceType: "global_ifra_standard_needed",
        suggestedDocumentName: "IFRA 51st Amendment standard for Iso E Super",
        candidateSearchTerms: ["Iso E Super", "OTNE", "IFRA OTNE"],
        currentIfraCategory: "sourceUnavailable",
        reason:
          "Current IFRA category is sourceUnavailable. Appears in 2 active hero formulas.",
      },
      {
        materialName: "Driftwood Accord",
        normalizedName: "Driftwood Accord",
        formulasUsedIn: ["Random Concoction - Original"],
        priority: "low",
        requiredSourceType: "accord_component_expansion_deferred",
        suggestedDocumentName: "Driftwood Accord component IFRA expansion worksheet",
        candidateSearchTerms: ["Driftwood Accord"],
        currentIfraCategory: "accordLevelOnly",
        reason: "Formula row is an accord; component IFRA expansion is deferred.",
      },
      {
        materialName: "Hedione",
        normalizedName: "Hedione",
        formulasUsedIn: ["Skin-Air Bridge"],
        priority: "low",
        requiredSourceType: "already_structured",
        suggestedDocumentName: "Existing structured IFRA standard for Hedione",
        candidateSearchTerms: ["Hedione"],
        currentIfraCategory: "exactIfraMatch",
        reason: "Already has a structured runtime IFRA match.",
      },
    ],
  };
}

test("hero IFRA source acquisition queue generates stable actionable items", () => {
  const queue = buildHeroIfraSourceAcquisitionQueue({
    gapReport: buildSyntheticGapReport(),
    generatedAt: "2026-06-11T01:00:00.000Z",
  });

  assert.equal(queue.items.length, 4);
  assert.equal(queue.summary.itemCount, 4);
  assert.equal(queue.summary.highPriorityCount, 2);
  assert.equal(queue.summary.globalStandardsNeededCount, 1);
  assert.equal(queue.summary.naturalUvcbDocsNeededCount, 1);

  const seaweed = queue.items.find((item) => item.materialName === "Seaweed Absolute 10%");
  assert.equal(
    seaweed.id,
    "hero-ifra-source-seaweed-absolute-natural_uvcb_supplier_document_needed"
  );
  assert.deepEqual(
    seaweed.knownReferenceLinks.map((link) => link.type),
    ["sds", "product_page"]
  );
  assert.equal(seaweed.status, "needed");
  assert.equal(seaweed.reviewStatus, "not_started");

  assert.equal(
    makeHeroIfraSourceQueueItemId({
      materialName: "Seaweed Absolute 10%",
      normalizedName: "Seaweed Absolute",
      requiredSourceType: "natural_uvcb_supplier_document_needed",
    }),
    seaweed.id
  );
});

test("hero IFRA source acquisition queue preserves manual status on regeneration", () => {
  const first = buildHeroIfraSourceAcquisitionQueue({
    gapReport: buildSyntheticGapReport(),
    generatedAt: "2026-06-11T01:00:00.000Z",
  });
  const existingQueue = {
    ...first,
    items: first.items.map((item) =>
      item.materialName === "Iso E Super"
        ? {
            ...item,
            status: "acquired",
            reviewStatus: "needs_review",
            sourceFile: "downloads/source_documents/ifra/iso-e-super-ifra.pdf",
            sourceNotes: "Downloaded from supplier portal.",
            reviewNotes: "Needs Cat 4 extraction later.",
            lastUpdated: "2026-06-11T02:00:00.000Z",
          }
        : item
    ),
  };

  const regenerated = buildHeroIfraSourceAcquisitionQueue({
    gapReport: buildSyntheticGapReport(),
    existingQueue,
    generatedAt: "2026-06-11T03:00:00.000Z",
  });
  const iso = regenerated.items.find((item) => item.materialName === "Iso E Super");

  assert.equal(iso.status, "acquired");
  assert.equal(iso.reviewStatus, "needs_review");
  assert.equal(iso.sourceFile, "downloads/source_documents/ifra/iso-e-super-ifra.pdf");
  assert.equal(iso.sourceNotes, "Downloaded from supplier portal.");
  assert.equal(iso.reviewNotes, "Needs Cat 4 extraction later.");
  assert.equal(iso.lastUpdated, "2026-06-11T02:00:00.000Z");
});

test("hero IFRA source acquisition queue merges duplicate normalized source needs", () => {
  const gapReport = buildSyntheticGapReport();
  gapReport.materials.push({
    materialName: "Iso E Super 10%",
    normalizedName: "Iso E Super",
    formulasUsedIn: ["Damp Shoreline v2"],
    priority: "high",
    requiredSourceType: "global_ifra_standard_needed",
    suggestedDocumentName: "IFRA 51st Amendment standard for Iso E Super",
    candidateSearchTerms: ["Iso E Super 10%", "IFRA Iso E Super"],
    currentIfraCategory: "sourceUnavailable",
    reason: "Current IFRA category is sourceUnavailable. Appears in 1 active hero formula.",
  });

  const queue = buildHeroIfraSourceAcquisitionQueue({
    gapReport,
    generatedAt: "2026-06-11T01:00:00.000Z",
  });
  const isoRows = queue.items.filter((item) => item.normalizedName === "Iso E Super");

  assert.equal(isoRows.length, 1);
  assert.deepEqual(isoRows[0].sourceRowNames, ["Iso E Super", "Iso E Super 10%"]);
  assert.deepEqual(isoRows[0].formulasUsedIn, [
    "Random Concoction - Original",
    "Skin-Air Bridge",
    "Damp Shoreline v2",
  ]);
  assert.ok(isoRows[0].candidateSearchTerms.includes("Iso E Super 10%"));
});

test("hero IFRA source acquisition markdown groups source states and avoids limits", () => {
  const gapReport = buildSyntheticGapReport();
  const before = JSON.stringify(gapReport);
  const queue = buildHeroIfraSourceAcquisitionQueue({
    gapReport,
    generatedAt: "2026-06-11T01:00:00.000Z",
  });
  const markdown = formatHeroIfraSourceAcquisitionQueueMarkdown(queue);

  assert.equal(JSON.stringify(gapReport), before);
  assert.match(markdown, /## High Priority/);
  assert.match(markdown, /## Deferred/);
  assert.match(markdown, /## Already Structured \/ Special Case/);
  assert.match(markdown, /Seaweed Absolute 10%/);
  assert.match(markdown, /Known reference links: SDS: https:\/\/example\.test\/seaweed-sds\.pdf/);
  assert.doesNotMatch(markdown, /categoryLimits/i);
  assert.doesNotMatch(markdown, /max(?:imum)?\s*use/i);
  assert.doesNotMatch(markdown, /launch clearance achieved/i);
});
