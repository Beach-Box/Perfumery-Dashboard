import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIfraPromotionOpportunityReport,
  formatIfraPromotionOpportunitiesMarkdown,
} from "../scripts/lib/ifra_promotion_opportunity_ranker.mjs";

function proposedRecord(overrides = {}) {
  return {
    id: "proposed-official-musk",
    materialName: "Official Musk",
    sourceIdentityName: "Official Musk",
    formulaMaterialNames: ["Official Musk"],
    recordType: "ifra_category_limit",
    sourceType: "official_ifra_standard_library",
    sourceUrl: "https://ifra.example/official-musk.pdf",
    sourceFile: "downloads/source_documents/ifra/official_ifra/standards/official-musk.pdf",
    candidateIds: ["official-musk-candidate"],
    category: "4",
    candidateValue: "1.2",
    candidateUnit: "%",
    normalizedCandidateValue: 1.2,
    sourceSnippet:
      "Official IFRA Standards Library match for Official Musk. Category 4: 1.2% maximum use in fine fragrance.",
    evidenceConfidence: "high",
    promotionStatus: "proposed",
    limitations: ["Not runtime-active", "Requires review before promotion"],
    ...overrides,
  };
}

function officialCandidate(overrides = {}) {
  return {
    id: "official-musk-candidate",
    materialName: "Official Musk",
    sourceIdentityName: "Official Musk",
    materialNames: ["Official Musk"],
    sourceIdentityNames: ["Official Musk"],
    queueItemId: "hero-ifra-source-official-musk-global_ifra_standard_needed",
    queueItemIds: ["hero-ifra-source-official-musk-global_ifra_standard_needed"],
    sourceType: "official_ifra_standard_library",
    matchType: "cas",
    matchConfidence: "high",
    standardTitle: "Official Musk",
    cas: ["123-45-6"],
    downloadUrl: "https://ifra.example/official-musk.pdf",
    officialPdfLocalFile:
      "downloads/source_documents/ifra/official_ifra/standards/official-musk.pdf",
    candidateUse: "standard_candidate",
    candidateLimitType: "ifra_category_limit",
    ...overrides,
  };
}

function queueItem(overrides = {}) {
  return {
    id: "hero-ifra-source-official-musk-global_ifra_standard_needed",
    materialName: "Official Musk",
    sourceIdentityName: "Official Musk",
    formulasUsedIn: ["Skin-Air Bridge"],
    priority: "high",
    requiredSourceType: "global_ifra_standard_needed",
    currentIfraCategory: "sourceUnavailable",
    ...overrides,
  };
}

function reportFor({ records, candidates = [officialCandidate()], queue = [queueItem()], overrides = [] }) {
  return buildIfraPromotionOpportunityReport({
    proposedRecordsFile: { records },
    officialIfraSourceCandidates: { candidates },
    heroIfraSourceQueue: { items: queue },
    reviewedStructuredOverrides: { records: overrides },
    reviewedSourceRecords: { records: [] },
    autopilotRecommendations: { recommendations: [] },
    generatedAt: "2026-06-11T00:00:00.000Z",
    fileExists: (filePath) => /official-musk\.pdf$|src\/data/.test(filePath),
  });
}

test("official PDF candidates rank above supplier page candidates", () => {
  const supplier = proposedRecord({
    id: "proposed-supplier-musk",
    sourceType: "supplier_product_page",
    sourceUrl: "https://supplier.example/musk",
    sourceFile: "downloads/source_documents/ifra/product_pages/musk.html",
    candidateIds: ["supplier-musk-candidate"],
    sourceSnippet:
      "Supplier product page says IFRA 51: 1.2% finished product Cat. 4.",
  });
  const report = reportFor({
    records: [supplier, proposedRecord()],
  });

  const official = report.opportunities.find(
    (item) => item.proposedRecordId === "proposed-official-musk"
  );
  const supplierItem = report.opportunities.find(
    (item) => item.proposedRecordId === "proposed-supplier-musk"
  );

  assert.equal(official.classification, "promote_next");
  assert.equal(supplierItem.classification, "needs_better_source");
  assert.ok(official.score > supplierItem.score);
});

test("already promoted records are not recommended again", () => {
  const report = reportFor({
    records: [proposedRecord({ promotionStatus: "promoted" })],
    overrides: [
      {
        id: "reviewed-official-musk",
        proposedRecordId: "proposed-official-musk",
        materialNames: ["Official Musk"],
        runtimeUse: "structured_ifra_standard",
      },
    ],
  });

  assert.equal(report.opportunities[0].classification, "already_promoted");
  assert.equal(report.opportunities[0].promotionCommand, "");
});

test("FCF special cases are not recommended as regular category-limit promotion", () => {
  const record = proposedRecord({
    id: "proposed-bergamot-fcf",
    materialName: "Bergamot EO FCF",
    sourceIdentityName: "Bergamot EO FCF",
    sourceType: "supplier_product_page",
    sourceFile: "downloads/source_documents/ifra/product_pages/bergamot-fcf.html",
    sourceSnippet:
      "Bergamot EO FCF is bergapten-free and furocoumarin-free. IFRA Cat 4 wording needs review.",
  });
  const report = reportFor({
    records: [record],
    candidates: [],
    queue: [
      queueItem({
        id: "hero-ifra-source-bergamot-fcf-fcf_special_case",
        materialName: "Bergamot EO FCF",
        sourceIdentityName: "Bergamot EO FCF",
        requiredSourceType: "fcf_special_case",
        currentIfraCategory: "fcfSpecialCase",
      }),
    ],
  });

  assert.equal(report.opportunities[0].classification, "special_case_only");
  assert.equal(report.opportunities[0].promotionCommand, "");
});

test("weak or ambiguous source gets needs-better-source classification", () => {
  const record = proposedRecord({
    id: "proposed-weak-source",
    sourceType: "supplier_product_page",
    sourceFile: "downloads/source_documents/ifra/product_pages/weak.html",
    evidenceConfidence: "low",
    sourceSnippet:
      "Marketing copy mentions IFRA somewhere but the source identity is ambiguous.",
  });
  const report = reportFor({ records: [record], candidates: [] });

  assert.equal(report.opportunities[0].classification, "needs_better_source");
});

test("markdown includes promotion command only for promote-next items", () => {
  const report = reportFor({
    records: [
      proposedRecord(),
      proposedRecord({
        id: "proposed-supplier-musk",
        sourceType: "supplier_product_page",
        sourceFile: "downloads/source_documents/ifra/product_pages/musk.html",
        candidateIds: ["supplier-musk-candidate"],
      }),
    ],
  });
  const markdown = formatIfraPromotionOpportunitiesMarkdown(report);

  assert.match(markdown, /proposed-official-musk/);
  assert.match(markdown, /promote_reviewed_ifra_structured_record/);
  assert.doesNotMatch(
    markdown,
    /--proposed-record-id "proposed-supplier-musk"[\s\S]*--review-status reviewed_ok/
  );
});

test("ranking does not mutate runtime override input", () => {
  const overrides = {
    records: [
      {
        id: "reviewed-existing",
        proposedRecordId: "already-promoted",
        runtimeUse: "structured_ifra_standard",
      },
    ],
  };
  const before = JSON.stringify(overrides);
  const report = reportFor({
    records: [proposedRecord()],
    overrides: overrides.records,
  });

  assert.equal(report.summary.auditedRecordCount, 1);
  assert.equal(JSON.stringify(overrides), before);
});
