import test from "node:test";
import assert from "node:assert/strict";

import {
  buildIfraAutopilotRecommendations,
  buildProposedIfraStructuredRecordsFile,
  formatIfraAutopilotRecommendationsMarkdown,
  isAutoAcceptableNonLimitEvidence,
  isStrongCategoryLimitCandidate,
} from "../scripts/lib/ifra_autopilot_recommendations.mjs";

function resolutionItem(overrides = {}) {
  return {
    queueItemId: "hero-ifra-source-calone-1951-global_ifra_standard_needed",
    materialName: "Calone 1951",
    sourceIdentityName: "Calone 1951",
    formulasUsedIn: ["Damp Shoreline v2"],
    requiredSourceType: "global_ifra_standard_needed",
    evidenceStatus: "review_ready",
    suggestedAction: "review_top_candidate",
    confidence: "high",
    score: 190,
    bestCandidates: [
      {
        id: "candidate-calone-cat4",
        materialName: "Calone 1951",
        sourceIdentityName: "Calone 1951",
        candidateLimitType: "ifra_category_limit",
        reviewPriority: "high",
        sourceType: "supplier_product_page",
        sourceUrl: "https://supplier.example/calone",
        sourceFile: "downloads/source_documents/ifra/product_pages/calone.html",
        category: "4",
        candidateValue: "No restriction",
        candidateUnit: "",
        snippet: "Calone 1951 IFRA 51: No restriction for category 4 fine fragrance.",
        queueItemIds: ["hero-ifra-source-calone-1951-global_ifra_standard_needed"],
        signals: {
          linked: true,
          exactName: true,
          hasIfra: true,
          hasCategory4: true,
          hasGhsCategory4: false,
          hasRifmUsage: false,
        },
      },
    ],
    whySelected: "Strong supplier product-page IFRA language.",
    limitations: ["Review before promotion."],
    ...overrides,
  };
}

test("strong category-limit candidate becomes a proposed structured record", () => {
  const item = resolutionItem();
  const candidate = item.bestCandidates[0];

  assert.equal(isStrongCategoryLimitCandidate({ item, candidate }), true);

  const report = buildIfraAutopilotRecommendations({
    evidenceResolution: { items: [item] },
    candidateExtractions: { candidates: [candidate] },
    reviewedSourceRecords: { records: [] },
    generatedAt: "2026-06-11T00:00:00.000Z",
  });
  const proposed = report.proposedStructuredRecords[0];

  assert.equal(report.summary.proposedStructuredRecordCount, 1);
  assert.equal(proposed.recordType, "ifra_category_limit");
  assert.equal(proposed.promotionStatus, "proposed");
  assert.equal(proposed.autopilotRecommendation, "propose_for_review");
  assert.equal(proposed.normalizedCandidateValue, null);
  assert.match(proposed.sourceSnippet, /IFRA 51/);
  assert.match(proposed.limitations.join(" "), /Not runtime-active/i);
});

test("FCF non-limit evidence can be auto-accepted as evidence only", () => {
  const item = resolutionItem({
    queueItemId: "hero-ifra-source-bergamot-fcf-fcf_special_case",
    materialName: "Bergamot EO FCF",
    sourceIdentityName: "Bergamot EO FCF",
    requiredSourceType: "fcf_special_case",
    evidenceStatus: "likely_fcf_evidence",
    suggestedAction: "promote_fcf_evidence_after_review",
    bestCandidates: [
      {
        id: "candidate-bergamot-fcf",
        materialName: "Bergamot EO FCF",
        sourceIdentityName: "Bergamot EO FCF",
        candidateLimitType: "phototoxic_note",
        reviewPriority: "high",
        sourceType: "supplier_product_page",
        sourceUrl: "https://supplier.example/bergamot-fcf",
        sourceFile: "downloads/source_documents/ifra/product_pages/bergamot-fcf.html",
        snippet: "Bergamot EO FCF is bergapten-free and furocoumarin-free.",
        queueItemIds: ["hero-ifra-source-bergamot-fcf-fcf_special_case"],
        signals: {
          linked: true,
          exactName: true,
          hasFcf: true,
          hasGhsCategory4: false,
          hasRifmUsage: false,
        },
      },
    ],
  });
  const candidate = item.bestCandidates[0];

  assert.equal(isAutoAcceptableNonLimitEvidence({ item, candidate }), true);

  const report = buildIfraAutopilotRecommendations({
    evidenceResolution: { items: [item] },
    candidateExtractions: { candidates: [candidate] },
    reviewedSourceRecords: { records: [] },
  });
  const accepted = report.autoAcceptedNonLimitEvidence[0];

  assert.equal(report.summary.autoAcceptedNonLimitEvidenceCount, 1);
  assert.equal(accepted.recordType, "phototoxic_note");
  assert.equal(accepted.autopilotRecommendation, "auto_accept_non_limit");
  assert.equal(accepted.promotionStatus, "reviewed_ok");
  assert.equal(accepted.category, "");
  assert.equal(accepted.normalizedCandidateValue, null);
  assert.match(accepted.limitations.join(" "), /Non-limit source evidence only/i);
});

test("GHS Category 4 and RIFM usage evidence are rejected as noise, not proposed records", () => {
  const ghs = {
    id: "candidate-ghs-category-4",
    materialName: "Ambroxan",
    candidateLimitType: "allergen_or_restriction",
    sourceType: "supplier_sds",
    snippet: "GHS hazard Category 4 acute toxicity in Safety Data Sheet.",
  };
  const rifm = {
    id: "candidate-rifm-usage",
    materialName: "Ambroxan",
    candidateLimitType: "identity",
    sourceType: "identity_reference",
    snippet: "RIFM average use level reported use 2.5% in fragrance examples.",
  };
  const report = buildIfraAutopilotRecommendations({
    evidenceResolution: { items: [] },
    candidateExtractions: {
      candidates: [ghs, rifm],
      suppressedSnippets: [
        {
          materialName: "Oceanol",
          sourceType: "identity_reference",
          sourceFile: "downloads/source_documents/ifra/from_csv/oceanol.html",
          reason: "identity_reference_unknown_noise",
          snippet: "Twitter Instagram Supplier Sponsors unrelated navigation.",
        },
      ],
    },
    reviewedSourceRecords: { records: [] },
  });

  assert.equal(report.summary.proposedStructuredRecordCount, 0);
  assert.equal(report.summary.rejectedNoiseCount, 3);
  assert.deepEqual(
    report.rejectedNoisyEvidence.map((item) => item.id),
    ["candidate-ghs-category-4", "candidate-rifm-usage", "suppressed-noise-1"]
  );
});

test("identity-only pages do not become proposed IFRA category-limit records", () => {
  const item = resolutionItem({
    materialName: "Oceanol 10%",
    sourceIdentityName: "Oceanol",
    evidenceStatus: "identity_only",
    suggestedAction: "request_supplier_ifra_or_sds",
    bestCandidates: [
      {
        id: "candidate-oceanol-identity",
        materialName: "Oceanol 10%",
        sourceIdentityName: "Oceanol",
        candidateLimitType: "identity",
        reviewPriority: "low",
        sourceType: "identity_reference",
        snippet: "Oceanol identity reference CAS and supplier directory.",
        queueItemIds: ["hero-ifra-source-calone-1951-global_ifra_standard_needed"],
        signals: {
          linked: true,
          exactName: true,
        },
      },
    ],
  });
  const report = buildIfraAutopilotRecommendations({
    evidenceResolution: { items: [item] },
    candidateExtractions: { candidates: item.bestCandidates },
    reviewedSourceRecords: { records: [] },
  });

  assert.equal(report.summary.proposedStructuredRecordCount, 0);
  assert.equal(report.items[0].recommendationStatus, "needs_better_source");
});

test("proposed records file stays review-only and not runtime-active", () => {
  const report = buildIfraAutopilotRecommendations({
    evidenceResolution: { items: [resolutionItem()] },
    candidateExtractions: {},
    reviewedSourceRecords: { records: [] },
  });
  const recordsFile = buildProposedIfraStructuredRecordsFile({
    records: report.proposedStructuredRecords,
    generatedAt: "2026-06-11T00:00:00.000Z",
  });
  const markdown = formatIfraAutopilotRecommendationsMarkdown(report);

  assert.equal(recordsFile.summary.recordCount, 1);
  assert.match(recordsFile.metadata.guardrails.join(" "), /not runtime-active/i);
  assert.doesNotMatch(JSON.stringify(recordsFile), /runtimeUse/);
  assert.match(markdown, /No runtime IFRA limits have been changed/i);
});
