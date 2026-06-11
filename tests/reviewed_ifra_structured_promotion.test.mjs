import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  auditFormulaIfraCoverage,
  buildFinishedProductIfraGuidance,
  buildFormulaIfraStatus,
  getIfraMaterialRecord,
  resolveIngredientIdentity,
} from "../src/lib/ifra_combined_package.js";
import {
  buildReviewedIfraStructuredRecord,
  promoteReviewedIfraStructuredRecord,
} from "../scripts/lib/reviewed_ifra_structured_promotion.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function proposedRecord(overrides = {}) {
  return {
    id: "proposed-vetiveryl-acetate",
    materialName: "Vetiveryl Acetate",
    sourceIdentityName: "Vetiveryl Acetate",
    formulaMaterialNames: ["Vetiveryl Acetate"],
    recordType: "ifra_category_limit",
    sourceType: "official_ifra_standard_library",
    sourceUrl: "https://d3t14p1xronwr0.cloudfront.net/docs/standards/IFRA_STD_002.pdf",
    sourceFile:
      "downloads/source_documents/ifra/official_ifra/standards/acetylated-vetiver-oil.pdf",
    candidateIds: ["official-vetiveryl-acetate"],
    category: "4",
    candidateValue: "0.9",
    candidateUnit: "%",
    normalizedCandidateValue: 0.9,
    sourceSnippet:
      "Official IFRA Standards Library match for Acetylated Vetiver oil. Category 4: 0.9%.",
    promotionStatus: "proposed",
    limitations: ["Not runtime-active", "Requires review before promotion"],
    ...overrides,
  };
}

function officialCandidate(overrides = {}) {
  return {
    id: "official-vetiveryl-acetate",
    materialName: "Vetiveryl Acetate",
    materialNames: ["Vetiveryl Acetate"],
    sourceIdentityNames: ["Vetiveryl Acetate"],
    sourceType: "official_ifra_standard_library",
    standardTitle: "Acetylated Vetiver oil",
    cas: ["84082-84-8", "68917-34-0"],
    standardType: "Restriction",
    amendment: "49",
    downloadUrl: "https://d3t14p1xronwr0.cloudfront.net/docs/standards/IFRA_STD_002.pdf",
    sourceUrl: "https://d3t14p1xronwr0.cloudfront.net/docs/standards/IFRA_STD_002.pdf",
    sourceFile: "src/data/ifra_master_standards.json",
    officialPdfLocalFile:
      "downloads/source_documents/ifra/official_ifra/standards/acetylated-vetiver-oil.pdf",
    ...overrides,
  };
}

function tempPaths() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reviewed-ifra-promotion-"));
  return {
    proposedPath: path.join(dir, "proposed_ifra_structured_records.json"),
    officialPath: path.join(dir, "official_ifra_source_candidates.json"),
    overridesPath: path.join(dir, "reviewed_ifra_structured_overrides.json"),
  };
}

test("reviewed structured promotion rejects missing proposed ids", () => {
  const paths = tempPaths();
  writeJson(paths.proposedPath, { records: [] });

  assert.throws(
    () =>
      promoteReviewedIfraStructuredRecord({
        proposedRecordId: "missing",
        reviewStatus: "reviewed_ok",
        proposedRecordsPath: paths.proposedPath,
        officialCandidatesPath: paths.officialPath,
        overridesPath: paths.overridesPath,
        write: false,
      }),
    /Proposed record not found/
  );
});

test("reviewed structured promotion rejects non-official proposed records", () => {
  assert.throws(
    () =>
      buildReviewedIfraStructuredRecord({
        proposedRecord: proposedRecord({
          sourceType: "supplier_product_page",
          sourceUrl: "https://supplier.example/vetiveryl",
        }),
        officialCandidate: null,
        reviewStatus: "reviewed_ok",
      }),
    /official IFRA standard/
  );
});

test("reviewed structured promotion creates exactly one source-backed runtime overlay record", () => {
  const paths = tempPaths();
  writeJson(paths.proposedPath, {
    metadata: { reportName: "Proposed IFRA Structured Records" },
    records: [proposedRecord(), proposedRecord({ id: "other-proposed", materialName: "Other" })],
  });
  writeJson(paths.officialPath, { candidates: [officialCandidate()] });
  writeJson(paths.overridesPath, { metadata: {}, records: [] });

  const result = promoteReviewedIfraStructuredRecord({
    proposedRecordId: "proposed-vetiveryl-acetate",
    reviewStatus: "reviewed_ok",
    reviewNotes: "Reviewed official PDF.",
    proposedRecordsPath: paths.proposedPath,
    officialCandidatesPath: paths.officialPath,
    overridesPath: paths.overridesPath,
    reviewedAt: "2026-06-11T00:00:00.000Z",
  });

  assert.equal(result.overridesFile.summary.recordCount, 1);
  assert.equal(result.promotedRecord.standardName, "Acetylated Vetiver oil");
  assert.deepEqual(result.promotedRecord.categoryLimits, { "4": 0.9 });
  assert.equal(result.promotedRecord.sourceType, "official_ifra_standard_pdf");
  assert.match(result.promotedRecord.sourceFile, /acetylated-vetiver-oil\.pdf$/);
  assert.match(result.promotedRecord.limitations.join(" "), /Not launch clearance/);
  const updatedProposed = JSON.parse(fs.readFileSync(paths.proposedPath, "utf8"));
  const promoted = updatedProposed.records.find(
    (record) => record.id === "proposed-vetiveryl-acetate"
  );
  const untouched = updatedProposed.records.find((record) => record.id === "other-proposed");
  assert.equal(promoted.promotionStatus, "promoted");
  assert.equal(promoted.promotedRecordId, result.promotedRecord.id);
  assert.equal(untouched.promotionStatus, "proposed");
});

test("reviewed structured promotion does not invent a category limit when value is absent", () => {
  const promoted = buildReviewedIfraStructuredRecord({
    proposedRecord: proposedRecord({
      candidateValue: "",
      normalizedCandidateValue: null,
    }),
    officialCandidate: officialCandidate(),
    reviewStatus: "reviewed_ok",
  });

  assert.deepEqual(promoted.categoryLimits, { "4": null });
});

test("reviewed Vetiveryl Acetate runtime record resolves with provenance and no launch clearance", () => {
  const formulaRows = [{ name: "Vetiveryl Acetate", g: 0.4, note: "base" }];
  const before = JSON.stringify(formulaRows);
  const identity = resolveIngredientIdentity("Vetiveryl Acetate");
  const material = getIfraMaterialRecord("Vetiveryl Acetate");

  assert.equal(identity?.matchStrategy, "reviewed_structured_ifra_override");
  assert.equal(material?.canonicalName, "Acetylated Vetiver oil");
  assert.equal(material?.limits?.cat4, 0.9);
  assert.equal(material?.source?.runtimeUse, "structured_ifra_standard");
  assert.match(material?.source?.document || "", /acetylated-vetiver-oil\.pdf$/);

  const audit = auditFormulaIfraCoverage(formulaRows);
  const row = audit.rows.find((item) => item.name === "Vetiveryl Acetate");
  assert.equal(row.category, "aliasIfraMatch");
  assert.equal(row.label, "Reviewed official IFRA standard");
  assert.equal(row.reviewedStructuredSource, true);

  const guidance = buildFinishedProductIfraGuidance({
    items: formulaRows,
    category: "cat4",
    fragranceLoadPercent: 17.5,
  });
  assert.equal(guidance.rows[0].limit, 0.9);
  assert.equal(JSON.stringify(formulaRows), before);

  const dilutedGuidance = buildFinishedProductIfraGuidance({
    items: [{ name: "Vetiveryl Acetate", g: 0.4, note: "base", effectiveActivePercent: 50 }],
    category: "cat4",
    fragranceLoadPercent: 17.5,
  });
  assert.equal(dilutedGuidance.rows[0].activeRestrictedPercent, 8.75);
  assert.equal(dilutedGuidance.rows[0].usesActivePercent, true);

  const status = buildFormulaIfraStatus({
    items: formulaRows,
    coverageAudit: audit,
    finishedProductGuidance: guidance,
    category: "cat4",
    fragranceLoadPercent: 17.5,
  });
  assert.equal(status.hasLaunchClearance, false);
  assert.equal(status.knownRestrictedRowCount, 1);
});

test("promoted official IFRA PDF cache path remains gitignored", () => {
  const material = getIfraMaterialRecord("Vetiveryl Acetate");
  const sourceFile = material?.source?.document || "";
  const ignoredPath = execFileSync("git", ["check-ignore", sourceFile], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();

  assert.equal(ignoredPath, sourceFile);
});
