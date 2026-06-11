import test from "node:test";
import assert from "node:assert/strict";

import {
  buildIfraEvidenceResolution,
  formatIfraEvidenceResolutionMarkdown,
} from "../scripts/lib/ifra_evidence_resolver.mjs";

function makeQueueItem(overrides = {}) {
  return {
    id: "hero-ifra-source-ambroxan-global_ifra_standard_needed",
    materialName: "Ambroxan Crystals",
    normalizedName: "Ambroxan",
    formulasUsedIn: ["Skin-Air Bridge"],
    priority: "high",
    requiredSourceType: "global_ifra_standard_needed",
    currentIfraCategory: "sourceUnavailable",
    candidateSearchTerms: ["Ambroxan", "Ambroxide", "IFRA Ambroxan"],
    status: "needed",
    reviewStatus: "not_started",
    ...overrides,
  };
}

function makeCandidate(overrides = {}) {
  return {
    id: "candidate-ambroxan-sds",
    materialName: "Ambroxan Crystals",
    queueItemIds: ["hero-ifra-source-ambroxan-global_ifra_standard_needed"],
    sourceType: "supplier_sds",
    sourceUrl: "https://supplier.example/ambroxan-sds.pdf",
    sourceFile: "downloads/source_documents/ifra/sds/ambroxan-sds.pdf",
    candidateLimitType: "ifra_category_limit",
    reviewPriority: "high",
    snippet:
      "Ambroxan Crystals IFRA Category 4 fine fragrance maximum use level listed in supplier SDS.",
    ...overrides,
  };
}

test("IFRA evidence resolver marks strong linked supplier candidates review-ready", () => {
  const queueItem = makeQueueItem();
  const report = buildIfraEvidenceResolution({
    sourceQueue: { items: [queueItem] },
    candidateExtractions: { candidates: [makeCandidate()] },
  });
  const item = report.items[0];

  assert.equal(item.evidenceStatus, "review_ready");
  assert.equal(item.suggestedAction, "review_top_candidate");
  assert.equal(item.confidence, "high");
  assert.equal(item.bestCandidates[0].id, "candidate-ambroxan-sds");
  assert.match(item.whySelected, /supplier\/SDS\/product-page/i);
});

test("IFRA evidence resolver suppresses weak identity-reference navigation evidence", () => {
  const queueItem = makeQueueItem({
    id: "hero-ifra-source-oceanol-specialty_supplier_document_needed",
    materialName: "Oceanol 10%",
    normalizedName: "Oceanol",
    requiredSourceType: "specialty_supplier_document_needed",
  });
  const report = buildIfraEvidenceResolution({
    sourceQueue: { items: [queueItem] },
    candidateExtractions: {
      candidates: [
        makeCandidate({
          id: "candidate-oceanol-identity",
          materialName: "Oceanol 10%",
          queueItemIds: [queueItem.id],
          sourceType: "identity_reference",
          candidateLimitType: "identity",
          reviewPriority: "low",
          snippet:
            "Search Suppliers Safety Supplier Sponsors Twitter Instagram Product(s): Oceanol supplier directory text.",
        }),
      ],
    },
  });
  const item = report.items[0];

  assert.equal(item.evidenceStatus, "identity_only");
  assert.equal(item.suggestedAction, "request_supplier_ifra_or_sds");
  assert.equal(item.confidence, "low");
  assert.match(item.bestCandidates[0].warnings.join(" "), /navigation/i);
});

test("IFRA evidence resolver does not treat GHS Category 4 as IFRA Cat 4", () => {
  const queueItem = makeQueueItem();
  const report = buildIfraEvidenceResolution({
    sourceQueue: { items: [queueItem] },
    candidateExtractions: {
      candidates: [
        makeCandidate({
          id: "candidate-ghs-category-4",
          snippet:
            "Ambroxan GHS hazard Category 4 acute inhalation toxicity. Safety Data Sheet.",
        }),
      ],
    },
  });
  const item = report.items[0];

  assert.notEqual(item.evidenceStatus, "review_ready");
  assert.match(item.bestCandidates[0].warnings.join(" "), /GHS hazard Category 4/i);
});

test("IFRA evidence resolver does not treat RIFM usage percentages as IFRA limits", () => {
  const queueItem = makeQueueItem();
  const report = buildIfraEvidenceResolution({
    sourceQueue: { items: [queueItem] },
    candidateExtractions: {
      candidates: [
        makeCandidate({
          id: "candidate-rifm-usage",
          sourceType: "identity_reference",
          snippet:
            "Ambroxan RIFM average use level reported use 2.5% in fragrance examples.",
        }),
      ],
    },
  });
  const item = report.items[0];

  assert.notEqual(item.evidenceStatus, "review_ready");
  assert.match(item.bestCandidates[0].warnings.join(" "), /RIFM/i);
});

test("IFRA evidence resolver prioritizes likely FCF phototoxic evidence", () => {
  const queueItem = makeQueueItem({
    id: "hero-ifra-source-bergamot-eo-fcf-fcf_special_case",
    materialName: "Bergamot EO FCF",
    normalizedName: "Bergamot EO FCF",
    requiredSourceType: "fcf_special_case",
    currentIfraCategory: "fcfSpecialCase",
    candidateSearchTerms: ["Bergamot EO FCF", "furocoumarin free", "bergapten-free"],
  });
  const report = buildIfraEvidenceResolution({
    sourceQueue: { items: [queueItem] },
    candidateExtractions: {
      candidates: [
        makeCandidate({
          id: "candidate-bergamot-fcf",
          materialName: "Bergamot EO FCF",
          queueItemIds: [queueItem.id],
          sourceType: "product_page",
          candidateLimitType: "phototoxic_note",
          snippet:
            "Bergamot oil FCF product page states bergapten-free and furocoumarin-free handling.",
        }),
      ],
    },
  });
  const item = report.items[0];

  assert.equal(item.evidenceStatus, "likely_fcf_evidence");
  assert.equal(item.suggestedAction, "promote_fcf_evidence_after_review");
  assert.match(item.bestCandidates[0].generatedCommand, /promote_reviewed_ifra_candidates/);
});

test("IFRA evidence resolver ranks linked candidates above unlinked candidates", () => {
  const queueItem = makeQueueItem();
  const report = buildIfraEvidenceResolution({
    sourceQueue: { items: [queueItem] },
    candidateExtractions: {
      candidates: [
        makeCandidate({
          id: "candidate-unlinked",
          queueItemIds: [],
          snippet:
            "Ambroxan IFRA Category 4 maximum use level mentioned on a supplier page.",
        }),
        makeCandidate({
          id: "candidate-linked",
          queueItemIds: [queueItem.id],
          reviewPriority: "medium",
          snippet:
            "Ambroxan supplier SDS includes IFRA fine fragrance maximum use wording.",
        }),
      ],
    },
  });

  assert.equal(report.items[0].bestCandidates[0].id, "candidate-linked");
});

test("IFRA evidence resolver markdown keeps only requested top snippets", () => {
  const queueItem = makeQueueItem();
  const report = buildIfraEvidenceResolution({
    sourceQueue: { items: [queueItem] },
    candidateExtractions: {
      candidates: [
        makeCandidate({ id: "candidate-one" }),
        makeCandidate({ id: "candidate-two", snippet: "Second candidate should be hidden." }),
      ],
    },
    top: 1,
  });
  const markdown = formatIfraEvidenceResolutionMarkdown(report);

  assert.match(markdown, /candidate-one/);
  assert.doesNotMatch(markdown, /candidate-two/);
});

test("IFRA evidence resolver does not mutate source queue or candidate data", () => {
  const sourceQueue = { items: [makeQueueItem()] };
  const candidateExtractions = { candidates: [makeCandidate()] };
  const before = JSON.stringify({ sourceQueue, candidateExtractions });

  buildIfraEvidenceResolution({ sourceQueue, candidateExtractions });

  assert.equal(JSON.stringify({ sourceQueue, candidateExtractions }), before);
});
