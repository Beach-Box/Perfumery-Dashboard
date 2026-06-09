const DEFAULT_PROTOCOL = Object.freeze({
  surfaces: Object.freeze([
    "Skin: start with 1 spray and record the actual dose.",
    "Scent strip: use 2 sprays or the closest repeatable test dose.",
    "Fabric: optional 1 spray for next-day fabric/strip read.",
  ]),
  checkpoints: Object.freeze([
    "5 min",
    "30 min",
    "2 hr",
    "4 hr",
    "6 hr",
    "Next day fabric/strip",
  ]),
});

const BASE_DO_NOT_CHANGE = Object.freeze([
  "Do not reduce trace high-impact materials solely because a model chart flags them.",
  "Do not reformulate for projection until concentration, dose, and wear behavior are observed.",
  "Do not treat GCMS pattern guidance as a recipe.",
  "Do not mark this as a winner from model score alone.",
]);

const BASE_CONDITIONAL_MOVES = Object.freeze([
  "If opening is too sharp: consider softening aldehydic/citrus lift.",
  "If marine heart feels detergent-like: consider reducing marine load or warming the bridge.",
  "If drydown feels flat: consider base complexity rather than stronger top materials.",
  "If projection feels weak: test concentration/dose before adding high-impact materials.",
]);

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    const key = normalizeText(text);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(text);
  }
  return output;
}

function getCandidateKey(item) {
  return item?.formula?.formulaKey || item?.formulaKey || "";
}

function getCandidateName(item) {
  return item?.formula?.name || item?.displayLabel || "Formula";
}

function getFormulaText(item) {
  const formula = item?.formula || {};
  return [
    formula.name,
    formula.tagline,
    formula.desc,
    formula.revisionNote,
    ...(Array.isArray(formula.ingredients)
      ? formula.ingredients.map((ingredient) => ingredient?.name || "")
      : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function findComparisonSection(comparisonInterpreter, sectionKey) {
  return (comparisonInterpreter?.sections || []).find(
    (section) => section?.key === sectionKey
  );
}

function findPriorityCandidate(candidateItems, comparisonInterpreter) {
  const firstTestSection = findComparisonSection(
    comparisonInterpreter,
    "first_test_priority"
  );
  const selectedKey = firstTestSection?.selectedFormulaKey || "";
  const selectedName = normalizeText(firstTestSection?.selectedFormulaName || "");
  return (
    candidateItems.find((item) => getCandidateKey(item) === selectedKey) ||
    candidateItems.find(
      (item) => normalizeText(getCandidateName(item)) === selectedName
    ) ||
    candidateItems[0] ||
    null
  );
}

function findCandidateSummary(candidate, comparisonInterpreter) {
  const key = getCandidateKey(candidate);
  const name = normalizeText(getCandidateName(candidate));
  return (comparisonInterpreter?.candidateSummaries || []).find(
    (summary) =>
      summary?.formulaKey === key || normalizeText(summary?.name || "") === name
  );
}

function findGcmsRelevance(candidate, gcmsPatternInsights) {
  const name = normalizeText(getCandidateName(candidate));
  return (gcmsPatternInsights?.heroFormulaRelevance || []).find(
    (row) => normalizeText(row?.formulaName || "") === name
  );
}

function buildEvidenceStatus(candidate) {
  const sensorySummary = candidate?.sensorySummary || {};
  const count = Number(sensorySummary.evaluationCount) || 0;
  if (count <= 0) {
    return {
      statusKey: "model_guided_only",
      label: "No real wear-test evidence recorded yet. This plan is model-guided only.",
      latestTestDateLabel: "",
      latestSurfaceLabel: "",
      keyOutcome: "",
      confidenceLabel: "",
    };
  }

  const outcome =
    sensorySummary.summaryLabel ||
    sensorySummary.nextModificationNeededLabel ||
    sensorySummary.offNoteLabel ||
    "Review the latest logged sensory record before editing.";
  return {
    statusKey: "wear_test_logged",
    label: `${count} wear test${count === 1 ? "" : "s"} recorded.`,
    latestTestDateLabel: sensorySummary.latestTestDateLabel || "Date not logged",
    latestSurfaceLabel: sensorySummary.latestSurfaceLabel || "Surface not logged",
    keyOutcome: outcome,
    confidenceLabel: sensorySummary.launchConfidenceLabel || "Not scored",
  };
}

function buildWhyItems({
  candidate,
  comparisonSection,
  summary,
  gcmsRelevance,
  evidenceStatus,
}) {
  const items = [];
  if (comparisonSection?.reason) items.push(comparisonSection.reason);
  if (summary) {
    items.push(
      `${summary.name || getCandidateName(candidate)} currently reads ${Number(
        summary.readinessScore || 0
      ).toFixed(0)}/100 for model readiness.`
    );
    if (
      Number(summary.missingPriceCount) === 0 &&
      Number(summary.lowConfidenceSupplierMappingCount) === 0
    ) {
      items.push(
        "Cost data is complete enough for R&D basket comparison; it is still not production depletion costing."
      );
    } else {
      items.push(
        `${Number(summary.missingPriceCount) || 0} missing price row(s) and ${
          Number(summary.lowConfidenceSupplierMappingCount) || 0
        } low-confidence supplier mapping(s) remain.`
      );
    }
    if (summary.ifraLabel) {
      items.push(`IFRA read: ${summary.ifraLabel}; this is not launch clearance.`);
    }
  }
  if (gcmsRelevance?.nextValidation) {
    items.push(`GCMS pattern relevance: ${gcmsRelevance.nextValidation}`);
  }
  if (evidenceStatus.statusKey === "model_guided_only") {
    items.push("Needs real wear testing before any formula edits.");
  }
  return uniqueStrings(items).slice(0, 5);
}

function buildWatchItems({ candidate, summary, gcmsRelevance }) {
  const text = getFormulaText(candidate);
  const items = [];
  if (gcmsRelevance?.nextValidation) items.push(gcmsRelevance.nextValidation);
  if (gcmsRelevance?.watch) items.push(gcmsRelevance.watch);
  if (/aldehyde|bergamot|lemon|citrus|dihydromyrcenol/.test(text)) {
    items.push("Opening sharpness and whether salt-air lift stays polished.");
  }
  if (/calone|oceanol|algenone|maritima|seaweed|marine|shoreline/.test(text)) {
    items.push("Marine/floral balance and detergent-aquatic risk.");
  }
  if (/hedione|florol|celestafleur|ylang|floral/.test(text)) {
    items.push("Whether the floral bridge feels skinlike rather than cosmetic.");
  }
  if (/iso e|ambrox|cetalox|musk|ambrettolide|habanolide/.test(text)) {
    items.push("Skin-air diffusion and whether the base feels present without haze.");
  }
  if (/driftwood|cedarwood|clearwood|cypriol|oakmoss|veramoss|geosmin/.test(text)) {
    items.push("Drydown warmth/flatness and trace realism becoming dirty or muddy.");
  }
  if (Number(summary?.traceHighImpactCount) > 0) {
    items.push("High-impact trace cues: sparkle versus harshness.");
  }
  return uniqueStrings(items).slice(0, 6);
}

function buildDoNotChangeItems({ candidate, gcmsRelevance }) {
  const text = getFormulaText(candidate);
  const items = [...BASE_DO_NOT_CHANGE];
  if (/calone|oceanol|algenone|maritima|seaweed|marine|shoreline/.test(text)) {
    items.push("Do not add more marine force before confirming the current marine heart on skin.");
  }
  if (gcmsRelevance?.watch) items.push(gcmsRelevance.watch);
  return uniqueStrings(items).slice(0, 6);
}

function buildConditionalMoves(candidate) {
  const text = getFormulaText(candidate);
  const items = [...BASE_CONDITIONAL_MOVES];
  if (/geosmin|oakmoss|veramoss|seaweed|cypriol|dirty|earthy/.test(text)) {
    items.push(
      "If trace realism turns dirty or muddy: keep realism cues trace and simplify the muddy edge."
    );
  }
  if (/hedione|florol|celestafleur|floral/.test(text)) {
    items.push(
      "If the bridge feels cosmetic: test warmer skin-musk support before adding more floral lift."
    );
  }
  return uniqueStrings(items).slice(0, 6);
}

export function buildNextControlledWearTestPlan({
  candidateItems = [],
  comparisonInterpreter = {},
  gcmsPatternInsights = {},
} = {}) {
  const items = Array.isArray(candidateItems)
    ? candidateItems.filter((item) => getCandidateKey(item))
    : [];
  const candidate = findPriorityCandidate(items, comparisonInterpreter);
  if (!candidate) {
    return {
      isAvailable: false,
      declaresWinner: false,
      priorityLabel: "Current model-guided test priority",
      formulaKey: "",
      formulaName: "No active hero formula",
      confidenceLabel: "No comparison input available",
      whyThisOne: [],
      testProtocol: DEFAULT_PROTOCOL,
      watchItems: [],
      doNotChangeYet: BASE_DO_NOT_CHANGE,
      ifConfirmedThenConsider: BASE_CONDITIONAL_MOVES,
      evidenceStatus: buildEvidenceStatus(null),
      sensoryCtaLabel: "Record wear test",
    };
  }

  const comparisonSection = findComparisonSection(
    comparisonInterpreter,
    "first_test_priority"
  );
  const summary = findCandidateSummary(candidate, comparisonInterpreter);
  const gcmsRelevance = findGcmsRelevance(candidate, gcmsPatternInsights);
  const evidenceStatus = buildEvidenceStatus(candidate);

  return {
    isAvailable: true,
    declaresWinner: false,
    priorityLabel: "Current model-guided test priority",
    formulaKey: getCandidateKey(candidate),
    formulaName: getCandidateName(candidate),
    confidenceLabel:
      comparisonInterpreter?.modeLabel ||
      (evidenceStatus.statusKey === "model_guided_only"
        ? "Model-guided only"
        : "Model plus sensory snapshot"),
    whyThisOne: buildWhyItems({
      candidate,
      comparisonSection,
      summary,
      gcmsRelevance,
      evidenceStatus,
    }),
    testProtocol: DEFAULT_PROTOCOL,
    watchItems: buildWatchItems({ candidate, summary, gcmsRelevance }),
    doNotChangeYet: buildDoNotChangeItems({ candidate, gcmsRelevance }),
    ifConfirmedThenConsider: buildConditionalMoves(candidate),
    evidenceStatus,
    sensoryCtaLabel: "Record wear test",
  };
}

function getConfidenceCount(item, category) {
  return Number(item?.confidenceSummary?.categoryCounts?.[category]) || 0;
}

function getComparisonSummaries(comparisonInterpreter) {
  return Array.isArray(comparisonInterpreter?.candidateSummaries)
    ? comparisonInterpreter.candidateSummaries
    : [];
}

function countFormulasMatching(items, predicate) {
  return items.filter((item) => {
    try {
      return Boolean(predicate(item));
    } catch {
      return false;
    }
  }).length;
}

function makeLaunchGap({
  key,
  title,
  statusLabel,
  whyItMatters,
  nextAction,
  severity = "watch",
}) {
  return {
    key,
    title,
    statusLabel,
    whyItMatters,
    nextAction,
    severity,
  };
}

export function buildCriticalHeroLaunchReadinessGaps({
  candidateItems = [],
  comparisonInterpreter = {},
  nextControlledWearTestPlan = {},
} = {}) {
  const items = Array.isArray(candidateItems)
    ? candidateItems.filter((item) => getCandidateKey(item))
    : [];
  const summaries = getComparisonSummaries(comparisonInterpreter);
  const sensoryEvidence = comparisonInterpreter?.sensoryEvidence || {};
  const candidateCount = items.length || Number(sensoryEvidence.totalCandidateCount) || 0;
  const evaluatedCount =
    Number(sensoryEvidence.evaluatedCandidateCount) ||
    countFormulasMatching(items, (item) => Number(item?.sensorySummary?.evaluationCount) > 0);
  const totalEvaluationCount =
    Number(sensoryEvidence.totalEvaluationCount) ||
    items.reduce(
      (sum, item) => sum + (Number(item?.sensorySummary?.evaluationCount) || 0),
      0
    );
  const priorityName =
    nextControlledWearTestPlan?.formulaName &&
    nextControlledWearTestPlan.formulaName !== "No active hero formula"
      ? nextControlledWearTestPlan.formulaName
      : "the current test priority";

  const dataReviewFormulaCount = countFormulasMatching(
    items,
    (item) =>
      Number(item?.launchReadiness?.compliance?.dataReviewCount) > 0 ||
      getConfidenceCount(item, "missing_ifra") > 0
  );
  const supplierDocFormulaCount = countFormulasMatching(
    items,
    (item) =>
      getConfidenceCount(item, "proxy_or_uvcb") > 0 ||
      getConfidenceCount(item, "missing_ifra") > 0
  );
  const accordLevelRowCount = items.reduce(
    (sum, item) => sum + getConfidenceCount(item, "black_box_accord"),
    0
  );
  const missingPriceCount = summaries.reduce(
    (sum, summary) => sum + (Number(summary?.missingPriceCount) || 0),
    0
  );
  const lowConfidenceSupplierCount = summaries.reduce(
    (sum, summary) =>
      sum + (Number(summary?.lowConfidenceSupplierMappingCount) || 0),
    0
  );

  return [
    makeLaunchGap({
      key: "wear_test_evidence",
      title: "Wear-test evidence missing",
      statusLabel:
        totalEvaluationCount > 0
          ? `${evaluatedCount}/${candidateCount} candidates evaluated · ${totalEvaluationCount} wear test${totalEvaluationCount === 1 ? "" : "s"} logged`
          : "No real wear-test evidence recorded yet",
      whyItMatters:
        "Model guidance cannot validate skin evolution, projection, off-notes, or drydown appeal.",
      nextAction: `Complete the controlled wear test for ${priorityName}.`,
      severity: totalEvaluationCount > 0 ? "watch" : "critical",
    }),
    makeLaunchGap({
      key: "structured_ifra_source_coverage",
      title: "Structured IFRA source coverage incomplete",
      statusLabel:
        dataReviewFormulaCount > 0
          ? `${dataReviewFormulaCount}/${candidateCount} formulas still show IFRA/source review needs`
          : "No modeled finished-product offenders in checked rows",
      whyItMatters:
        "Known checked rows and unresolved rows must stay separate before launch confidence.",
      nextAction:
        "Review formula IFRA rows and the hero IFRA source gap report before any launch-clearance read.",
      severity: dataReviewFormulaCount > 0 ? "critical" : "watch",
    }),
    makeLaunchGap({
      key: "supplier_ifra_sds",
      title: "Supplier IFRA/SDS still needed",
      statusLabel:
        supplierDocFormulaCount > 0
          ? `${supplierDocFormulaCount}/${candidateCount} formulas include proxy, UVCB, or unresolved IFRA support`
          : "Supplier-document need not cleared for launch",
      whyItMatters:
        "Naturals, UVCB materials, and specialty materials need supplier documentation before launch confidence.",
      nextAction:
        "Acquire supplier IFRA certificates/SDS for unresolved naturals and specialty materials.",
      severity: supplierDocFormulaCount > 0 ? "critical" : "watch",
    }),
    makeLaunchGap({
      key: "accord_ifra_expansion",
      title: "Accord-level IFRA expansion deferred",
      statusLabel:
        accordLevelRowCount > 0
          ? `${accordLevelRowCount} accord-level row${accordLevelRowCount === 1 ? "" : "s"} remain model-caveated`
          : "No accord-level caveat surfaced in the current comparison",
      whyItMatters:
        "Component-costed accords can help basket estimates while still remaining caveated for chemistry/IFRA interpretation.",
      nextAction:
        "Keep accord rows caveated; defer component IFRA expansion to a dedicated task.",
      severity: accordLevelRowCount > 0 ? "watch" : "clear",
    }),
    makeLaunchGap({
      key: "production_costing",
      title: "Production costing deferred",
      statusLabel:
        missingPriceCount + lowConfidenceSupplierCount > 0
          ? `${missingPriceCount} missing price row${missingPriceCount === 1 ? "" : "s"} · ${lowConfidenceSupplierCount} low-confidence supplier mapping${lowConfidenceSupplierCount === 1 ? "" : "s"}`
          : "Current cost view is R&D basket confidence, not production depletion cost",
      whyItMatters:
        "R&D purchase baskets do not include production-scale depletion, shipping, tax, or minimum-order planning.",
      nextAction:
        "Use current costs for R&D comparison only; defer production costing until wear evidence supports a finalist.",
      severity: "watch",
    }),
  ];
}
