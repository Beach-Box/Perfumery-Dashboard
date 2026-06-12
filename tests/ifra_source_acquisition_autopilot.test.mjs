import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildIfraSourceAcquisitionAutopilotReport,
  buildSourceAcquisitionTargets,
  cacheDiscoveredSupplierLinks,
  classifyDiscoveredSourceLink,
  discoverSupplierDocumentLinksFromHtml,
  isSafeSupplierDocumentFollow,
  runIfraSourceAcquisitionAutopilot,
} from "../scripts/lib/ifra_source_acquisition_autopilot.mjs";

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function makeQueueItem(overrides = {}) {
  return {
    id: overrides.id || "hero-ifra-source-calone-1951-global_ifra_standard_needed",
    materialName: overrides.materialName || "Calone 1951 20%",
    sourceIdentityName: overrides.sourceIdentityName || "Calone 1951",
    normalizedName: overrides.normalizedName || "Calone 1951 20%",
    requiredSourceType:
      overrides.requiredSourceType || "global_ifra_standard_needed",
    priority: overrides.priority || "high",
    status: overrides.status || "needed",
    reviewStatus: overrides.reviewStatus || "not_started",
    formulasUsedIn: overrides.formulasUsedIn || ["Damp Shoreline v1"],
    candidateSearchTerms: overrides.candidateSearchTerms || [
      "Calone 1951",
      "Calone",
      "CAS 28940-11-6",
    ],
  };
}

function syntheticCsv() {
  return [
    "Neat Ingredients,Ingredient,Name,CAS,URL,SDS Link,Product Page,Supplier Page,Description,Supplier",
    "Calone 1951,Calone 1951 20%,Calone 1951,28940-11-6,,https://supplier.test/docs/calone-sds.pdf,https://supplier.test/products/calone,,Marine,Supplier",
  ].join("\n");
}

test("source acquisition autopilot targets unresolved focus and high-value materials only", () => {
  const sourceQueue = {
    items: [
      makeQueueItem(),
      makeQueueItem({
        id: "hero-ifra-source-cetalox-specialty_supplier_document_needed",
        materialName: "Cetalox",
        sourceIdentityName: "Cetalox",
        requiredSourceType: "specialty_supplier_document_needed",
      }),
      makeQueueItem({
        id: "hero-ifra-source-hedione-already_structured",
        materialName: "Hedione",
        sourceIdentityName: "Hedione",
        requiredSourceType: "already_structured",
        status: "not_applicable",
        reviewStatus: "reviewed_ok",
      }),
      makeQueueItem({
        id: "hero-ifra-source-driftwood-accord-accord_component_expansion_deferred",
        materialName: "Driftwood Accord",
        sourceIdentityName: "Driftwood Accord",
        requiredSourceType: "accord_component_expansion_deferred",
        status: "deferred",
      }),
    ],
  };

  const targets = buildSourceAcquisitionTargets({
    sourceQueue,
    evidenceResolution: {
      items: [
        {
          queueItemId: "hero-ifra-source-calone-1951-global_ifra_standard_needed",
          materialName: "Calone 1951 20%",
          evidenceStatus: "insufficient_evidence",
        },
      ],
    },
    autopilotRecommendations: {
      needsBetterSource: [
        {
          queueItemId: "hero-ifra-source-cetalox-specialty_supplier_document_needed",
          materialName: "Cetalox",
          recommendationStatus: "needs_better_source",
        },
      ],
    },
  });

  assert.deepEqual(
    targets.map((target) => target.materialName),
    ["Calone 1951 20%", "Cetalox"]
  );
  assert.ok(targets[0].targetReasons.includes("evidence_resolver_unresolved"));
  assert.ok(targets[1].targetReasons.includes("autopilot_recommendation_needs_better_source"));
});

test("official source evidence is preferred over supplier snippets in material results", () => {
  const target = {
    queueItemId: "hero-ifra-source-calone-1951-global_ifra_standard_needed",
    materialName: "Calone 1951 20%",
    sourceIdentityName: "Calone 1951",
    formulasUsedIn: ["Damp Shoreline v1"],
    priorStatus: { queueStatus: "needed", reviewStatus: "not_started" },
  };

  const report = buildIfraSourceAcquisitionAutopilotReport({
    targets: [target],
    officialAcquisition: {
      officialSearchesAttempted: 1,
      newOfficialMatches: [
        {
          id: "official-calone",
          queueItemId: target.queueItemId,
          materialName: target.materialName,
          sourceIdentityName: target.sourceIdentityName,
          sourceType: "official_ifra_standard_library",
          standardTitle: "Calone",
          sourceUrl: "https://ifrafragrance.org/standards-library",
          snippet: "Official IFRA Standards Library match for Calone.",
        },
      ],
    },
    pipelineResult: {
      candidateExtractions: {
        candidates: [
          {
            id: "candidate-supplier-calone",
            queueItemIds: [target.queueItemId],
            materialName: target.materialName,
            sourceIdentityName: target.sourceIdentityName,
            sourceType: "supplier_product_page",
            sourceUrl: "https://supplier.test/products/calone",
            snippet: "Supplier IFRA Category 4 wording.",
          },
        ],
      },
      evidenceResolution: { items: [] },
      recommendations: { items: [], needsBetterSource: [] },
      proposedRecordsFile: { records: [] },
    },
    beforeInputs: {
      candidateExtractions: { candidates: [] },
      proposedRecords: { records: [] },
      evidenceResolution: { items: [] },
    },
  });

  assert.equal(report.summary.newOfficialMatchesFound, 1);
  assert.equal(report.summary.newCandidateSnippets, 1);
  assert.equal(report.materialResults[0].bestNewEvidence.type, "official_ifra_standard");
});

test("product-page discovery classifies visible IFRA, SDS, and specification links", () => {
  const html = `
    <a href="/docs/calone-ifra-certificate.pdf">IFRA Certificate</a>
    <a href="/docs/calone-sds.pdf">Safety Data Sheet</a>
    <a href="/downloads/calone-spec.pdf">Spec Sheet</a>
    <a href="https://other.test/calone-ifra.pdf">Offsite IFRA</a>
  `;

  const links = discoverSupplierDocumentLinksFromHtml({
    html,
    pageUrl: "https://supplier.test/products/calone",
    target: {
      queueItemId: "calone",
      materialName: "Calone 1951",
      sourceIdentityName: "Calone",
    },
  });

  assert.deepEqual(
    links.map((link) => link.sourceType),
    ["supplier_ifra", "supplier_sds", "supplier_specification", "supplier_ifra"]
  );
  assert.equal(links[0].safeFollow, true);
  assert.equal(links[1].safeFollow, true);
  assert.equal(links[2].safeFollow, true);
  assert.equal(links[3].safeFollow, false);
  assert.match(links[3].blockedReason, /supplier domain/i);
  assert.equal(
    classifyDiscoveredSourceLink({
      linkText: "GHS Safety Data Sheet",
      url: "https://supplier.test/sds.pdf",
    }),
    "supplier_sds"
  );
});

test("same-domain same-product safe-follow blocks offsite and non-document links", () => {
  assert.deepEqual(
    isSafeSupplierDocumentFollow({
      sourcePageUrl: "https://supplier.test/products/calone",
      candidateUrl: "https://supplier.test/docs/calone-sds.pdf",
      sourceType: "supplier_sds",
    }),
    {
      allowed: true,
      reason: "Visible same-domain supplier document link from known product page.",
    }
  );
  assert.equal(
    isSafeSupplierDocumentFollow({
      sourcePageUrl: "https://supplier.test/products/calone",
      candidateUrl: "https://other.test/docs/calone-sds.pdf",
      sourceType: "supplier_sds",
    }).allowed,
    false
  );
  assert.equal(
    isSafeSupplierDocumentFollow({
      sourcePageUrl: "https://supplier.test/products/calone",
      candidateUrl: "https://supplier.test/products/other",
      sourceType: "product_page",
    }).allowed,
    false
  );
});

test("blocked and failed downloads are recorded without aborting acquisition", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ifra-source-acq-download-"));
  const downloads = await cacheDiscoveredSupplierLinks({
    download: true,
    sourceDir: path.join(tempDir, "source"),
    cacheDir: path.join(tempDir, "autopilot"),
    rateLimitMs: 0,
    discoveredLinks: [
      {
        sourceUrl: "https://other.test/calone-ifra.pdf",
        sourceType: "supplier_ifra",
        materialName: "Calone 1951",
        sourceIdentityName: "Calone",
        queueItemIds: ["calone"],
        safeFollow: false,
        blockedReason: "Blocked because the discovered link leaves the known supplier domain.",
      },
      {
        sourceUrl: "https://supplier.test/calone-sds.pdf",
        sourceType: "supplier_sds",
        materialName: "Calone 1951",
        sourceIdentityName: "Calone",
        queueItemIds: ["calone"],
        safeFollow: true,
      },
    ],
    fetchImpl: async () => ({
      ok: false,
      status: 403,
      headers: { get: () => "application/pdf" },
      arrayBuffer: async () => new ArrayBuffer(0),
    }),
  });

  assert.deepEqual(
    downloads.map((download) => download.downloadStatus),
    ["blocked", "failed"]
  );
  assert.match(downloads[0].error, /supplier domain/i);
  assert.equal(downloads[1].httpStatus, 403);
});

test("run source acquisition autopilot reruns the pipeline summary without broad search or runtime IFRA mutation", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ifra-source-acq-run-"));
  const csvPath = path.join(tempDir, "ingredients.csv");
  fs.writeFileSync(csvPath, syntheticCsv());
  const queuePath = path.join(tempDir, "hero_ifra_source_queue.json");
  const item = makeQueueItem();
  writeJson(queuePath, { metadata: {}, items: [item] });
  writeJson(path.join(tempDir, "ifra_evidence_resolution.json"), {
    items: [
      {
        queueItemId: item.id,
        materialName: item.materialName,
        evidenceStatus: "insufficient_evidence",
      },
    ],
  });
  writeJson(path.join(tempDir, "ifra_autopilot_recommendations.json"), {
    items: [
      {
        queueItemId: item.id,
        materialName: item.materialName,
        recommendationStatus: "needs_better_source",
      },
    ],
    needsBetterSource: [
      {
        queueItemId: item.id,
        materialName: item.materialName,
        recommendationStatus: "needs_better_source",
      },
    ],
  });
  writeJson(path.join(tempDir, "ifra_promotion_opportunities.json"), {
    opportunities: [],
  });
  writeJson(path.join(tempDir, "ingredient_source_harvest_report.json"), {
    sourceLinks: [],
  });
  writeJson(path.join(tempDir, "official_ifra_source_candidates.json"), {
    candidates: [],
  });
  writeJson(path.join(tempDir, "candidate_ifra_source_extractions.json"), {
    candidates: [],
  });
  writeJson(path.join(tempDir, "proposed_ifra_structured_records.json"), {
    records: [],
  });

  let pipelineCalled = false;
  const runtimeBefore = fs.readFileSync("src/data/ifra_master_standards.json", "utf8");
  const result = await runIfraSourceAcquisitionAutopilot({
    ingredientReferencePath: csvPath,
    download: false,
    rateLimitMs: 0,
    root: tempDir,
    sourceDocumentDir: path.join(tempDir, "source_documents"),
    autopilotCacheDir: path.join(tempDir, "source_documents", "autopilot"),
    outputPath: path.join(tempDir, "report.json"),
    sourceQueuePath: queuePath,
    harvestReportPath: path.join(tempDir, "ingredient_source_harvest_report.json"),
    candidateExtractionsPath: path.join(tempDir, "candidate_ifra_source_extractions.json"),
    evidenceResolutionPath: path.join(tempDir, "ifra_evidence_resolution.json"),
    evidenceAutopilotReportPath: path.join(tempDir, "ifra_evidence_autopilot_report.json"),
    officialIfraSourceCandidatesPath: path.join(
      tempDir,
      "official_ifra_source_candidates.json"
    ),
    recommendationsPath: path.join(tempDir, "ifra_autopilot_recommendations.json"),
    proposedRecordsPath: path.join(tempDir, "proposed_ifra_structured_records.json"),
    promotionOpportunitiesPath: path.join(tempDir, "ifra_promotion_opportunities.json"),
    officialReportPath: path.join(tempDir, "official_ifra_harvest_report.json"),
    officialAcquisitionRunner: async ({ targets }) => ({
      officialSearchesAttempted: targets.length,
      newOfficialMatches: [],
      officialDownloadRecords: [],
    }),
    pipelineRunner: async () => {
      pipelineCalled = true;
      return {
        harvestReport: { summary: {} },
        candidateExtractions: {
          candidates: [
            {
              id: "candidate-calone-new",
              queueItemIds: [item.id],
              materialName: item.materialName,
              sourceIdentityName: item.sourceIdentityName,
              sourceType: "supplier_product_page",
              sourceUrl: "https://supplier.test/products/calone",
              snippet: "IFRA Category 4 candidate.",
            },
          ],
        },
        evidenceResolution: {
          items: [
            {
              queueItemId: item.id,
              materialName: item.materialName,
              evidenceStatus: "review_ready",
              suggestedAction: "review_top_candidate",
            },
          ],
        },
        recommendations: {
          items: [
            {
              queueItemId: item.id,
              materialName: item.materialName,
              recommendationStatus:
                "proposed_structured_record_ready_for_final_review",
              suggestedAction: "Review proposed record later.",
            },
          ],
          needsBetterSource: [],
          alreadyHandled: [],
        },
        proposedRecordsFile: {
          records: [
            {
              id: "proposed-calone-new",
              queueItemId: item.id,
              materialName: item.materialName,
              sourceIdentityName: item.sourceIdentityName,
              recordType: "ifra_category_limit",
              sourceType: "supplier_product_page",
            },
          ],
        },
      };
    },
    promotionRanker: () => ({ summary: {}, opportunities: [] }),
    fetchImpl: async (url) => {
      throw new Error(`Unexpected fetch: ${url}`);
    },
  });
  const runtimeAfter = fs.readFileSync("src/data/ifra_master_standards.json", "utf8");

  assert.equal(pipelineCalled, true);
  assert.equal(result.report.summary.materialsTargeted, 1);
  assert.equal(result.report.summary.newCandidateSnippets, 1);
  assert.equal(result.report.summary.newReviewReadyItems, 1);
  assert.equal(result.report.summary.newProposedStructuredRecords, 1);
  assert.equal(result.report.summary.remainingNeedsBetterSource, 0);
  assert.equal(result.report.pipeline.broadSearchUsed, false);
  assert.equal(result.report.pipeline.runtimeIfraMutation, false);
  assert.equal(runtimeAfter, runtimeBefore);
});
