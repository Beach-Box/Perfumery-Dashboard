import test from "node:test";
import assert from "node:assert/strict";

import {
  promoteReviewedIfraCandidate,
} from "../scripts/lib/reviewed_ifra_source_records.mjs";
import {
  auditFormulaIfraCoverage,
  buildFinishedProductIfraGuidance,
  buildFormulaIfraStatus,
} from "../src/lib/ifra_combined_package.js";

function makeFcfCandidate(overrides = {}) {
  return {
    id: "candidate-bergamot-fcf-phototoxic",
    materialName: "Bergamot EO FCF",
    candidateLimitType: "phototoxic_note",
    reviewPriority: "high",
    sourceType: "supplier_product_page",
    sourceUrl: "https://supplier.example/bergamot-fcf",
    sourceFile: "downloads/source_documents/ifra/product_pages/bergamot-fcf.html",
    snippet: "Bergamot oil FCF. Furocoumarin free / bergapten-free source text.",
    queueItemIds: ["hero-ifra-source-bergamot-eo-fcf-fcf_special_case"],
    ...overrides,
  };
}

const PROMOTION_INPUT = {
  candidateId: "candidate-bergamot-fcf-phototoxic",
  materialName: "Bergamot EO FCF",
  recordType: "fcf_phototoxic_note",
  finding: "furocoumarin_free_or_bergapten_free",
  summary:
    "Reviewed source text supports FCF/bergapten-free handling; regular expressed bergamot phototoxic limit should not be applied as if furocoumarins are present.",
  reviewedAt: "2026-06-11T12:00:00.000Z",
};

test("reviewed FCF promotion creates evidence metadata without IFRA limits", () => {
  const result = promoteReviewedIfraCandidate({
    candidateExtractions: { candidates: [makeFcfCandidate()] },
    reviewedRecordsFile: { records: [] },
    candidateReviewQueue: {
      items: [
        {
          id: "candidate-ifra-review-hero-ifra-source-bergamot-eo-fcf-fcf-special-case",
          candidateIds: ["candidate-bergamot-fcf-phototoxic"],
          acceptedCandidateIds: [],
          rejectedCandidateIds: [],
          reviewStatus: "not_started",
        },
      ],
    },
    ...PROMOTION_INPUT,
  });

  assert.equal(result.record.materialName, "Bergamot EO FCF");
  assert.equal(result.record.recordType, "fcf_phototoxic_note");
  assert.equal(result.record.runtimeUse, "support_special_case_only");
  assert.equal(result.record.reviewStatus, "reviewed_ok");
  assert.deepEqual(result.record.candidateIds, ["candidate-bergamot-fcf-phototoxic"]);
  assert.equal(Object.hasOwn(result.record, "limits"), false);
  assert.equal(Object.hasOwn(result.record, "categoryLimits"), false);
  assert.match(result.record.limitations.join(" "), /Not launch clearance/);
  assert.equal(result.candidateReviewQueueUpdate.updated, true);
  assert.equal(
    result.candidateReviewQueue.items[0].reviewStatus,
    "accepted"
  );
});

test("reviewed FCF promotion rejects materials outside the pilot", () => {
  assert.throws(
    () =>
      promoteReviewedIfraCandidate({
        candidateExtractions: {
          candidates: [makeFcfCandidate({ materialName: "Iso E Super" })],
        },
        reviewedRecordsFile: { records: [] },
        ...PROMOTION_INPUT,
        materialName: "Iso E Super",
      }),
    /outside the FCF promotion pilot/i
  );
});

test("reviewed FCF promotion rejects incompatible candidate types", () => {
  assert.throws(
    () =>
      promoteReviewedIfraCandidate({
        candidateExtractions: {
          candidates: [
            makeFcfCandidate({ candidateLimitType: "ifra_category_limit" }),
          ],
        },
        reviewedRecordsFile: { records: [] },
        ...PROMOTION_INPUT,
      }),
    /not compatible/i
  );
});

test("reviewed FCF promotion requires the candidate id to exist", () => {
  assert.throws(
    () =>
      promoteReviewedIfraCandidate({
        candidateExtractions: { candidates: [makeFcfCandidate()] },
        reviewedRecordsFile: { records: [] },
        ...PROMOTION_INPUT,
        candidateId: "missing-candidate-id",
      }),
    /Candidate not found/i
  );
});

test("reviewed FCF source records annotate special-case status without changing formula rows", () => {
  const formulaRows = [
    { name: "Bergamot EO FCF", g: 0.2 },
    { name: "Bergamot oil", g: 1 },
  ];
  const before = JSON.stringify(formulaRows);
  const promotion = promoteReviewedIfraCandidate({
    candidateExtractions: { candidates: [makeFcfCandidate()] },
    reviewedRecordsFile: { records: [] },
    ...PROMOTION_INPUT,
  });

  const audit = auditFormulaIfraCoverage(formulaRows, {
    reviewedSourceRecords: promotion.recordsFile,
  });
  const fcfRow = audit.rows.find((row) => row.name === "Bergamot EO FCF");

  assert.equal(JSON.stringify(formulaRows), before);
  assert.equal(fcfRow.category, "fcfSpecialCase");
  assert.equal(fcfRow.fcfSourceStatus.state, "reviewed");
  assert.equal(audit.counts.fcfSpecialCase, 1);
  assert.equal(audit.counts.fcfSourceReviewed, 1);
  assert.equal(audit.counts.fcfSourcePending, 0);

  const finishedProductGuidance = buildFinishedProductIfraGuidance({
    items: formulaRows,
    category: "cat4",
    fragranceLoadPercent: 17.5,
  });
  assert.equal(finishedProductGuidance.offenderRows.length, 1);
  assert.equal(finishedProductGuidance.offenderRows[0].name, "Bergamot oil");
  assert.equal(finishedProductGuidance.missingRows.length, 1);
  assert.equal(finishedProductGuidance.missingRows[0].name, "Bergamot EO FCF");

  const status = buildFormulaIfraStatus({
    items: formulaRows,
    coverageAudit: audit,
    finishedProductGuidance,
    category: "cat4",
    fragranceLoadPercent: 17.5,
  });
  assert.equal(status.fcfSpecialCaseCount, 1);
  assert.equal(status.fcfSourceReviewedCount, 1);
  assert.equal(status.hasLaunchClearance, false);
  assert.match(status.caveats.join(" "), /Reviewed FCF source note available/i);
});
