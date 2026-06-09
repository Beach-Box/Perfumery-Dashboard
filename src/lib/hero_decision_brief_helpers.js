const LOW_LAUNCH_CONFIDENCE_THRESHOLD = 6;

function getCandidateName(item) {
  return item?.formula?.name || item?.displayLabel || "Formula";
}

function getCandidateKey(item) {
  return item?.formula?.formulaKey || item?.formulaKey || "";
}

function getEvaluationCount(item) {
  return Number(item?.sensorySummary?.evaluationCount) || 0;
}

function getLatestRating(item, ratingKey) {
  const value = item?.sensorySummary?.latestEvaluation?.ratings?.[ratingKey];
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function formatCandidateList(items = []) {
  return items.map(getCandidateName).filter(Boolean).join(", ");
}

function formatRating(value) {
  return value == null ? "not scored" : `${value}/10`;
}

function getConfidenceCount(item, category) {
  return Number(item?.confidenceSummary?.categoryCounts?.[category]) || 0;
}

function formatCount(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildDecisionModelCaveatWarnings(item) {
  const name = getCandidateName(item);
  const warnings = [];
  const blackBoxCount = getConfidenceCount(item, "black_box_accord");
  const pricingCount = getConfidenceCount(item, "missing_pricing");
  const ifraCount = getConfidenceCount(item, "missing_ifra");
  const legacyCount = getConfidenceCount(item, "legacy");
  const missingThresholdCount = getConfidenceCount(item, "missing_threshold");
  const proxyCount = getConfidenceCount(item, "proxy_or_uvcb");

  if (blackBoxCount > 0) {
    warnings.push(
      `${name} model caveat: ${formatCount(
        blackBoxCount,
        "accord row"
      )} remain accord-level for chemistry/IFRA modeling; component-costed rows use recipe-derived cost where available.`
    );
  }

  if (pricingCount > 0) {
    warnings.push(
      `${name} model caveat: ${formatCount(
        pricingCount,
        "pricing caveat row"
      )} are missing or placeholder-supported, so purchase cost remains directional.`
    );
  }

  if (ifraCount > 0) {
    warnings.push(
      `${name} model caveat: ${formatCount(
        ifraCount,
        "IFRA coverage row"
      )} need cautious reading.`
    );
  }

  if (legacyCount > 0 || missingThresholdCount > 0) {
    const thresholdParts = [];
    if (legacyCount > 0) {
      thresholdParts.push(formatCount(legacyCount, "legacy ODT/VP row"));
    }
    if (missingThresholdCount > 0) {
      thresholdParts.push(formatCount(missingThresholdCount, "missing-threshold row"));
    }
    warnings.push(
      `${name} model caveat: threshold and vapor-pressure support is mixed (${thresholdParts.join(
        ", "
      )}); treat perceived-impact charts as directional.`
    );
  }

  if (proxyCount > 0) {
    warnings.push(
      `${name} model caveat: ${formatCount(
        proxyCount,
        "proxy/UVCB material"
      )} should be treated as directional model support.`
    );
  }

  return warnings;
}

function buildIfraStatusLabel(item) {
  const compliance = item?.launchReadiness?.compliance || {};
  if (compliance.statusLabel) return compliance.statusLabel;
  if (item?.ifraStatus?.statusLabel) return item.ifraStatus.statusLabel;
  if (compliance.finishedProductOffenderCount > 0) {
    return `${compliance.finishedProductOffenderCount} modeled finished-product offender${
      compliance.finishedProductOffenderCount === 1 ? "" : "s"
    }`;
  }
  if (compliance.concentrateHelperFlagCount > 0) {
    return `${compliance.concentrateHelperFlagCount} concentrate/helper flag${
      compliance.concentrateHelperFlagCount === 1 ? "" : "s"
    }`;
  }
  if (compliance.dataReviewCount > 0) return "Needs IFRA data review";
  if (compliance.warnCount > 0) {
    return `${compliance.warnCount} finished-product warning row${
      compliance.warnCount === 1 ? "" : "s"
    }`;
  }
  return "No modeled finished-product offenders";
}

function buildInventoryStatusLabel(item) {
  const inventory = item?.launchReadiness?.inventory || {};
  if (inventory.canFulfill) {
    return inventory.targetBatchG > 0
      ? `Can make ${inventory.targetBatchG.toFixed(0)}g`
      : "Inventory can fulfill current target";
  }
  const shortageCount = Number(inventory.shortageCount) || 0;
  return `${shortageCount} inventory shortage${shortageCount === 1 ? "" : "s"}`;
}

function getFormulaIngredients(item) {
  return Array.isArray(item?.formula?.ingredients) ? item.formula.ingredients : [];
}

function getBasket(item) {
  return item?.selectedBasket || item?.basket || {};
}

function getBasketLines(item) {
  return Array.isArray(getBasket(item)?.lines) ? getBasket(item).lines : [];
}

function getBasketTotalCost(item) {
  const value = Number(getBasket(item)?.totalCost);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function getIngredientCount(item) {
  return (
    Number(item?.ingredientCount) ||
    getFormulaIngredients(item).filter((ingredient) => ingredient?.name).length
  );
}

function getBasketMissingCount(item) {
  const basket = getBasket(item);
  const explicit = Number(basket?.missingCount);
  if (Number.isFinite(explicit)) return explicit;
  return getBasketLines(item).filter(
    (line) =>
      line?.status === "missing" ||
      line?.mappingConfidence === "missing" ||
      line?.lineCost == null
  ).length;
}

function getLowConfidenceSupplierMappingCount(item) {
  const basket = getBasket(item);
  const explicit = Number(basket?.uncertainCount);
  if (Number.isFinite(explicit)) return explicit;
  return getBasketLines(item).filter((line) =>
    ["missing", "uncertain"].includes(String(line?.mappingConfidence || ""))
  ).length;
}

function getComponentCostedAccordCount(item) {
  return getBasketLines(item).filter(
    (line) =>
      line?.costingMode === "component_derived" ||
      line?.linkStatus === "component_derived_accord"
  ).length;
}

function getNoteTotals(item) {
  return getFormulaIngredients(item).reduce(
    (acc, ingredient) => {
      const note = ingredient?.note || "mid";
      const grams = Number(ingredient?.activeG ?? ingredient?.g) || 0;
      acc[note] = (acc[note] || 0) + grams;
      acc.total += grams;
      return acc;
    },
    { top: 0, mid: 0, base: 0, carrier: 0, total: 0 }
  );
}

function getNoteBalanceScore(item) {
  const totals = getNoteTotals(item);
  if (!totals.total) return 0;
  const topShare = totals.top / totals.total;
  const midShare = totals.mid / totals.total;
  const baseShare = totals.base / totals.total;
  const ideal = { top: 0.16, mid: 0.42, base: 0.42 };
  const deviation =
    Math.abs(topShare - ideal.top) +
    Math.abs(midShare - ideal.mid) +
    Math.abs(baseShare - ideal.base);
  const hasAllStages = topShare > 0 && midShare > 0 && baseShare > 0;
  return Math.max(0, 10 - deviation * 10 + (hasAllStages ? 1 : -2));
}

function countIngredientNameMatches(item, patterns = []) {
  const joinedNames = getFormulaIngredients(item)
    .map((ingredient) => ingredient?.name || "")
    .join(" ")
    .toLowerCase();
  return patterns.reduce(
    (count, pattern) => count + (joinedNames.includes(pattern) ? 1 : 0),
    0
  );
}

function getTraceHighImpactCount(item) {
  return countIngredientNameMatches(item, [
    "aldehyde",
    "calone",
    "oceanol",
    "algenone",
    "geosmin",
    "amberxtreme",
  ]);
}

function getNaturalOrUvcbCount(item) {
  return countIngredientNameMatches(item, [
    " eo",
    "oil",
    "absolute",
    "seaweed",
    "oakmoss",
    "cedarwood",
    "cypriol",
    "ylang",
    "peppercorn",
  ]);
}

function getAccordIngredientCount(item) {
  return getFormulaIngredients(item).filter((ingredient) =>
    /accord/i.test(String(ingredient?.name || ""))
  ).length;
}

function getFormulaText(item) {
  const formula = item?.formula || {};
  return [
    formula.name,
    formula.tagline,
    formula.desc,
    formula.revisionNote,
    getFormulaIngredients(item)
      .map((ingredient) => ingredient?.name || "")
      .join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getConceptAlignmentRead(item) {
  const text = getFormulaText(item);
  const themes = [
    {
      label: "marine shoreline",
      concept: ["shore", "sea", "marine", "ocean", "beach", "damp"],
      materials: ["calone", "oceanol", "algenone", "seaweed", "maritima"],
    },
    {
      label: "skin musk air",
      concept: ["skin", "air", "airy", "musk", "diffusion"],
      materials: ["musk", "ambrettolide", "hedione", "iso e", "ambrox", "cetalox"],
    },
    {
      label: "damp woods",
      concept: ["damp", "shoreline", "wood", "driftwood", "mineral"],
      materials: ["driftwood", "cedar", "clearwood", "cypriol", "oakmoss", "geosmin"],
    },
    {
      label: "floral lift",
      concept: ["floral", "flower", "radiance", "bridge"],
      materials: ["hedione", "florol", "celestafleur", "ylang", "phenyl ethyl"],
    },
  ];
  const matchedThemes = themes
    .map((theme) => {
      const conceptHits = theme.concept.filter((term) => text.includes(term)).length;
      const materialHits = theme.materials.filter((term) => text.includes(term)).length;
      return {
        label: theme.label,
        conceptHits,
        materialHits,
        score: conceptHits * 2 + materialHits,
      };
    })
    .filter((theme) => theme.conceptHits > 0 && theme.materialHits > 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  const score =
    matchedThemes.reduce((sum, theme) => sum + theme.score, 0) +
    Math.min(3, getNoteBalanceScore(item) / 4);

  return {
    score,
    matchedThemes: matchedThemes.map((theme) => theme.label),
  };
}

function getMemorabilityScore(item) {
  const concept = getConceptAlignmentRead(item);
  return (
    concept.score +
    getTraceHighImpactCount(item) * 0.8 +
    getAccordIngredientCount(item) * 0.7 +
    Math.min(4, getIngredientCount(item) / 10) +
    (Number(item?.performance?.sillage) || 0) * 0.4 +
    (Number(item?.performance?.projection) || 0) * 0.25
  );
}

function getTechnicalRiskScore(item) {
  const compliance = item?.launchReadiness?.compliance || {};
  const blockerCount = item?.launchReadiness?.blockers?.length || 0;
  const cautionCount = item?.launchReadiness?.cautions?.length || 0;
  return (
    blockerCount * 7 +
    cautionCount * 2 +
    (compliance.hasHardBlock ? 10 : 0) +
    (Number(compliance.finishedProductOffenderCount ?? compliance.failCount) ||
      0) *
      7 +
    (Number(compliance.finishedProductWarningCount ?? compliance.warnCount) ||
      0) *
      3 +
    (Number(compliance.concentrateHelperFlagCount) || 0) * 2 +
    (Number(compliance.concentrateHelperWarningCount) || 0) * 1 +
    Math.min(6, (Number(compliance.dataReviewCount) || 0) * 1.2) +
    getConfidenceCount(item, "black_box_accord") * 2.4 +
    getConfidenceCount(item, "missing_ifra") * 2.2 +
    getConfidenceCount(item, "missing_pricing") * 2 +
    getConfidenceCount(item, "missing_threshold") * 1.1 +
    getConfidenceCount(item, "proxy_or_uvcb") * 1.4 +
    getLowConfidenceSupplierMappingCount(item) * 1.5 +
    getTraceHighImpactCount(item) * 0.8 +
    getNaturalOrUvcbCount(item) * 0.6 +
    Math.max(0, getIngredientCount(item) - 28) * 0.25
  );
}

function getDataConfidenceRiskScore(item) {
  const trust = item?.trustSummary || {};
  return (
    getConfidenceCount(item, "missing_pricing") * 3 +
    getConfidenceCount(item, "missing_ifra") * 3 +
    getConfidenceCount(item, "missing_threshold") * 2 +
    getConfidenceCount(item, "legacy") * 1 +
    getConfidenceCount(item, "black_box_accord") * 1.5 +
    getConfidenceCount(item, "proxy_or_uvcb") * 1.8 +
    getBasketMissingCount(item) * 3 +
    getLowConfidenceSupplierMappingCount(item) * 1.5 +
    (trust.missingSignals?.length || 0) * 1.5 +
    (trust.uncertainSignals?.length || 0)
  );
}

function getCostComplexityBurden(item) {
  const totalCost = getBasketTotalCost(item);
  const ingredientCount = Math.max(1, getIngredientCount(item));
  const missingPenalty = getBasketMissingCount(item) * 10;
  const uncertainPenalty = getLowConfidenceSupplierMappingCount(item) * 3;
  return (
    (totalCost == null ? 999 : totalCost) / Math.sqrt(ingredientCount) +
    missingPenalty +
    uncertainPenalty
  );
}

function sortCandidates(candidateItems, scoreFn, direction = "desc") {
  return [...candidateItems].sort((a, b) => {
    const aScore = scoreFn(a);
    const bScore = scoreFn(b);
    const scoreDelta = direction === "asc" ? aScore - bScore : bScore - aScore;
    if (scoreDelta !== 0) return scoreDelta;
    return getCandidateName(a).localeCompare(getCandidateName(b));
  });
}

function formatCost(value) {
  return value == null ? "cost unavailable" : `$${value.toFixed(2)}`;
}

function formatRankedNames(items = [], limit = 3) {
  return items
    .slice(0, limit)
    .map((item, index) => `${index + 1}. ${getCandidateName(item)}`)
    .join(" | ");
}

function makeComparisonSection({
  key,
  title,
  selected,
  ranked = [],
  label = "",
  reason,
  caveat,
  decisionUse,
}) {
  return {
    key,
    title,
    selectedFormulaKey: getCandidateKey(selected),
    selectedFormulaName: selected ? getCandidateName(selected) : "No clear selection",
    rankedFormulaNames: ranked.length ? ranked.map(getCandidateName) : [],
    label,
    reason,
    caveat,
    decisionUse,
  };
}

function buildValidationQuestions(item) {
  const questions = [];
  if (getEvaluationCount(item) === 0) {
    questions.push("Does the modeled opening-to-drydown balance hold on skin?");
  }
  if (getTraceHighImpactCount(item) > 0) {
    questions.push("Do high-impact traces read as sparkle or as harshness?");
  }
  if (getAccordIngredientCount(item) > 0) {
    questions.push("Do accord-level rows feel integrated rather than muddy?");
  }
  if (getBasketMissingCount(item) > 0 || getLowConfidenceSupplierMappingCount(item) > 0) {
    questions.push("Are the current supplier and cost assumptions strong enough?");
  }
  if (
    item?.launchReadiness?.compliance?.finishedProductWarningCount > 0 ||
    item?.launchReadiness?.compliance?.concentrateHelperFlagCount > 0 ||
    item?.launchReadiness?.compliance?.dataReviewCount > 0 ||
    getConfidenceCount(item, "missing_ifra") > 0
  ) {
    questions.push("Is IFRA headroom confirmed enough for the intended product context?");
  }
  return questions.slice(0, 3);
}

function buildCandidateComparisonSummary(item) {
  const concept = getConceptAlignmentRead(item);
  const totalCost = getBasketTotalCost(item);
  return {
    formulaKey: getCandidateKey(item),
    name: getCandidateName(item),
    readinessScore: Number(item?.launchReadiness?.totalScore) || 0,
    readinessLabel:
      item?.launchReadiness?.statusMeta?.label ||
      item?.launchReadiness?.status ||
      "readiness unknown",
    totalCost,
    costLabel: formatCost(totalCost),
    ingredientCount: getIngredientCount(item),
    missingPriceCount: getBasketMissingCount(item),
    lowConfidenceSupplierMappingCount: getLowConfidenceSupplierMappingCount(item),
    componentCostedAccordCount: getComponentCostedAccordCount(item),
    accordModelCaveatCount: getConfidenceCount(item, "black_box_accord"),
    ifraLabel: buildIfraStatusLabel(item),
    noteBalanceScore: Number(getNoteBalanceScore(item).toFixed(1)),
    conceptAlignmentThemes: concept.matchedThemes,
    traceHighImpactCount: getTraceHighImpactCount(item),
    naturalOrUvcbCount: getNaturalOrUvcbCount(item),
    evaluationCount: getEvaluationCount(item),
    technicalRiskScore: Number(getTechnicalRiskScore(item).toFixed(1)),
    dataConfidenceRiskScore: Number(getDataConfidenceRiskScore(item).toFixed(1)),
  };
}

export function buildHeroComparisonInterpreter(candidateItems = []) {
  const items = (Array.isArray(candidateItems) ? candidateItems : []).filter(
    (item) => getCandidateKey(item)
  );
  const sensoryEvidence = buildHeroSensoryEvidenceSummary(items);
  const hasWearTests = sensoryEvidence.totalEvaluationCount > 0;
  const readinessRank = sortCandidates(
    items,
    (item) =>
      (Number(item?.launchReadiness?.totalScore) || 0) -
      getTechnicalRiskScore(item) * 0.35 -
      getDataConfidenceRiskScore(item) * 0.18
  );
  const memorableRank = sortCandidates(items, getMemorabilityScore);
  const costRank = sortCandidates(items, getCostComplexityBurden, "asc");
  const technicalRiskRank = sortCandidates(items, getTechnicalRiskScore);
  const dataRiskRank = sortCandidates(items, getDataConfidenceRiskScore);
  const conceptRank = sortCandidates(
    items,
    (item) => getConceptAlignmentRead(item).score
  );
  const firstTestRank = sortCandidates(
    items.filter((item) => getEvaluationCount(item) === 0),
    (item) =>
      (Number(item?.launchReadiness?.totalScore) || 0) * 0.7 +
      getMemorabilityScore(item) * 0.35 +
      getConceptAlignmentRead(item).score * 0.3 -
      getTechnicalRiskScore(item) * 0.18
  );
  const firstTestCandidate = firstTestRank[0] || readinessRank[0] || null;
  const doNotChangeCandidate = firstTestCandidate || readinessRank[0] || null;
  const validationRank = sortCandidates(
    items,
    (item) =>
      buildValidationQuestions(item).length * 4 +
      getTechnicalRiskScore(item) * 0.45 +
      getMemorabilityScore(item) * 0.25
  );

  const launchCandidate = readinessRank[0] || null;
  const memorableCandidate = memorableRank[0] || null;
  const costCandidate = costRank[0] || null;
  const riskCandidate = technicalRiskRank[0] || null;
  const uncertainCandidate = dataRiskRank[0] || null;
  const conceptCandidate = conceptRank[0] || null;
  const validationCandidate = validationRank[0] || null;

  const sections = [
    makeComparisonSection({
      key: "best_current_launch_candidate",
      title: "Best current launch candidate",
      selected: launchCandidate,
      ranked: readinessRank,
      label: launchCandidate ? "Strong current candidate" : "No clear current candidate",
      reason: launchCandidate
        ? `${getCandidateName(launchCandidate)} has the strongest current readiness read (${(
            Number(launchCandidate.launchReadiness?.totalScore) || 0
          ).toFixed(0)}/100), ${buildIfraStatusLabel(
            launchCandidate
          )}, and ${buildInventoryStatusLabel(launchCandidate).toLowerCase()}.`
        : "No active hero formulas were available to compare.",
      caveat: hasWearTests
        ? "Use the model read beside recorded sensory evidence; this is still not a production clearance."
        : "No real wear-test evidence recorded yet. This comparison is model-guided only.",
      decisionUse: "Decision use: prioritize for first controlled wear test, not final production.",
    }),
    makeComparisonSection({
      key: "most_memorable_construction",
      title: "Most memorable construction",
      selected: memorableCandidate,
      ranked: memorableRank,
      label: memorableCandidate ? "Most distinctive on paper" : "No clear paper hook",
      reason: memorableCandidate
        ? `${getCandidateName(memorableCandidate)} combines the clearest concept/material signals with ${getTraceHighImpactCount(
            memorableCandidate
          )} high-impact trace cue${getTraceHighImpactCount(memorableCandidate) === 1 ? "" : "s"} and ${getAccordIngredientCount(
            memorableCandidate
          )} accord-level structure cue${getAccordIngredientCount(memorableCandidate) === 1 ? "" : "s"}.`
        : "No formula has enough current data for a paper memorability read.",
      caveat: "Memorability is inferred from construction, concept text, and model signals, not from smelled preference data.",
      decisionUse: "Decision use: use this to choose what to smell for, not what to reformulate.",
    }),
    makeComparisonSection({
      key: "best_cost_complexity_balance",
      title: "Best cost-to-complexity balance",
      selected: costCandidate,
      ranked: costRank,
      label: costCandidate ? "Best cost/logistics balance" : "Cost not resolved",
      reason: costCandidate
        ? `${getCandidateName(costCandidate)} has the lowest current cost burden (${formatCost(
            getBasketTotalCost(costCandidate)
          )} across ${getIngredientCount(costCandidate)} ingredients, with ${getBasketMissingCount(
            costCandidate
          )} missing price row${getBasketMissingCount(costCandidate) === 1 ? "" : "s"}).`
        : "No basket estimate is available.",
      caveat:
        getComponentCostedAccordCount(costCandidate) > 0
          ? `${getComponentCostedAccordCount(costCandidate)} accord row${
              getComponentCostedAccordCount(costCandidate) === 1 ? "" : "s"
            } are component-costed for pricing but still model-caveated.`
          : "Cost ignores production-scale purchasing and shipping effects.",
      decisionUse: "Decision use: cost is acceptable for R&D comparison, not production planning.",
    }),
    makeComparisonSection({
      key: "highest_technical_risk",
      title: "Highest technical risk",
      selected: riskCandidate,
      ranked: technicalRiskRank,
      label: riskCandidate ? "Technically interesting but riskier" : "No risk read",
      reason: riskCandidate
        ? `${getCandidateName(riskCandidate)} carries the highest combined risk from blockers/cautions, IFRA state, accord caveats, trace-impact cues, and data gaps.`
        : "No risk inputs were available.",
      caveat: "Risk does not mean bad; it means the formula deserves more controlled validation before edits.",
      decisionUse: "Decision use: validate suspected issues before making changes.",
    }),
    makeComparisonSection({
      key: "most_uncertain_model",
      title: "Most uncertain model",
      selected: uncertainCandidate,
      ranked: dataRiskRank,
      label: uncertainCandidate ? "Data confidence limited" : "No data gap read",
      reason: uncertainCandidate
        ? `${getCandidateName(uncertainCandidate)} has the weakest current confidence mix: ${getBasketMissingCount(
            uncertainCandidate
          )} missing price row${getBasketMissingCount(uncertainCandidate) === 1 ? "" : "s"}, ${getLowConfidenceSupplierMappingCount(
            uncertainCandidate
          )} low-confidence supplier mapping${getLowConfidenceSupplierMappingCount(uncertainCandidate) === 1 ? "" : "s"}, and ${getConfidenceCount(
            uncertainCandidate,
            "missing_ifra"
          )} IFRA confidence caveat row${getConfidenceCount(uncertainCandidate, "missing_ifra") === 1 ? "" : "s"}.`
        : "No confidence inputs were available.",
      caveat: "Missing confidence should guide data cleanup; do not treat it as a sensory failure.",
      decisionUse: "Decision use: improve source support before launch clearance.",
    }),
    makeComparisonSection({
      key: "strongest_concept_alignment",
      title: "Strongest concept/formula alignment",
      selected: conceptCandidate,
      ranked: conceptRank,
      label: conceptCandidate ? "Strongest concept fit on paper" : "Concept fit unclear",
      reason: conceptCandidate
        ? `${getCandidateName(conceptCandidate)} best connects formula concept language to materials: ${
            getConceptAlignmentRead(conceptCandidate).matchedThemes.join(", ") ||
            "general note architecture"
          }.`
        : "No concept-alignment inputs were available.",
      caveat: "Concept alignment is text/material matching; it still needs smelled confirmation.",
      decisionUse: "Decision use: use this to focus the brief for the first wear test.",
    }),
    makeComparisonSection({
      key: "first_test_priority",
      title: "First test priority",
      selected: firstTestCandidate,
      ranked: firstTestRank.length ? firstTestRank : readinessRank,
      label: firstTestCandidate ? "Test this first" : "No first test priority",
      reason: firstTestCandidate
        ? `${getCandidateName(firstTestCandidate)} offers the best blend of current readiness, concept promise, and useful unanswered questions.`
        : "No unevaluated formula is available.",
      caveat: hasWearTests
        ? "Some sensory evidence already exists; prioritize any remaining untested candidate before broad edits."
        : "No real wear-test evidence recorded yet. This comparison is model-guided only.",
      decisionUse: "Decision use: run the first controlled skin/blotter wear test here.",
    }),
    makeComparisonSection({
      key: "do_not_change_yet",
      title: "Do not change yet",
      selected: doNotChangeCandidate,
      ranked: doNotChangeCandidate ? [doNotChangeCandidate] : [],
      label: doNotChangeCandidate ? "Hold formula steady" : "No hold recommendation",
      reason: doNotChangeCandidate
        ? `${getCandidateName(doNotChangeCandidate)} should be validated before reformulation because the current model raises questions that sensory data can answer more cleanly than another edit.`
        : "No candidate is stable enough to hold.",
      caveat: "This is a validation hold, not a final approval.",
      decisionUse: "Decision use: do not reformulate yet; validate the suspected issue.",
    }),
    makeComparisonSection({
      key: "clearest_validation_questions",
      title: "Clearest next validation questions",
      selected: validationCandidate,
      ranked: validationRank,
      label: validationCandidate ? "Most actionable validation path" : "No validation path",
      reason: validationCandidate
        ? `${getCandidateName(validationCandidate)} has clear questions: ${buildValidationQuestions(
            validationCandidate
          ).join(" ")}`
        : "No validation questions were generated.",
      caveat: "Questions are generated from current model and support data only.",
      decisionUse: "Decision use: turn these into the next wear-test checklist.",
    }),
  ];

  return {
    modeLabel: hasWearTests ? "Model + sensory snapshot" : "Model-guided only",
    declaresWinner: false,
    sensoryEvidence,
    caveats: [
      hasWearTests
        ? "Sensory evidence exists, but this panel still uses model data for cross-formula structure."
        : "No real wear-test evidence recorded yet. This comparison is model-guided only.",
      "No section is a production winner declaration.",
      "IFRA, supplier, cost, accord, and threshold caveats remain visible inputs rather than hidden score penalties.",
    ],
    sections,
    candidateSummaries: items.map(buildCandidateComparisonSummary),
    rankedNames: {
      readiness: formatRankedNames(readinessRank),
      memorability: formatRankedNames(memorableRank),
      costToComplexity: formatRankedNames(costRank),
      technicalRisk: formatRankedNames(technicalRiskRank),
      dataConfidence: formatRankedNames(dataRiskRank),
      conceptAlignment: formatRankedNames(conceptRank),
      firstTest: formatRankedNames(firstTestRank.length ? firstTestRank : readinessRank),
    },
  };
}

export function selectMarkedHeroWinner(candidateItems = []) {
  return candidateItems.find((item) => item?.status === "winner") || null;
}

export function selectHeroLaunchCandidates(candidateItems = []) {
  return candidateItems.filter((item) => item?.status === "launch_candidate");
}

export function selectHeroFinalists(candidateItems = []) {
  return candidateItems.filter((item) => item?.status === "finalist");
}

export function countEvaluatedHeroCandidates(candidateItems = []) {
  return candidateItems.filter((item) => getEvaluationCount(item) > 0).length;
}

export function buildHeroSensoryEvidenceSummary(candidateItems = []) {
  const totalCandidateCount = candidateItems.length;
  const evaluatedCandidateCount = countEvaluatedHeroCandidates(candidateItems);
  const totalEvaluationCount = candidateItems.reduce(
    (sum, item) => sum + getEvaluationCount(item),
    0
  );
  const unevaluatedCandidateCount = Math.max(
    0,
    totalCandidateCount - evaluatedCandidateCount
  );

  let statusKey = "empty";
  let statusLabel = "No wear tests yet";
  if (totalEvaluationCount > 0 && evaluatedCandidateCount < totalCandidateCount) {
    statusKey = "partial";
    statusLabel = "Partial wear testing";
  } else if (totalEvaluationCount > totalCandidateCount) {
    statusKey = "multiple";
    statusLabel = "Multiple wear tests logged";
  } else if (totalEvaluationCount > 0) {
    statusKey = "covered";
    statusLabel = "Wear tests logged for every candidate";
  }

  return {
    statusKey,
    statusLabel,
    totalCandidateCount,
    evaluatedCandidateCount,
    unevaluatedCandidateCount,
    totalEvaluationCount,
    coverageLabel: `${evaluatedCandidateCount}/${totalCandidateCount} candidates evaluated · ${totalEvaluationCount} wear test${
      totalEvaluationCount === 1 ? "" : "s"
    } logged`,
  };
}

export function selectStrongestHeroSensoryCandidate(candidateItems = []) {
  return (
    [...candidateItems]
      .filter((item) => getEvaluationCount(item) > 0)
      .sort((a, b) => {
        const evaluationDelta = getEvaluationCount(b) - getEvaluationCount(a);
        if (evaluationDelta !== 0) return evaluationDelta;

        const confidenceDelta =
          (getLatestRating(b, "launchConfidence") ?? -1) -
          (getLatestRating(a, "launchConfidence") ?? -1);
        if (confidenceDelta !== 0) return confidenceDelta;

        const preferenceDelta =
          (getLatestRating(b, "preference") ?? -1) -
          (getLatestRating(a, "preference") ?? -1);
        if (preferenceDelta !== 0) return preferenceDelta;

        return getCandidateName(a).localeCompare(getCandidateName(b));
      })[0] || null
  );
}

export function buildHeroDecisionBrief(candidateItems = []) {
  const winner = selectMarkedHeroWinner(candidateItems);
  const launchCandidates = selectHeroLaunchCandidates(candidateItems);
  const finalists = selectHeroFinalists(candidateItems);
  const sensoryEvidence = buildHeroSensoryEvidenceSummary(candidateItems);
  const strongestSensoryCandidate =
    selectStrongestHeroSensoryCandidate(candidateItems);
  const topReadinessCandidate =
    [...candidateItems].sort(
      (a, b) =>
        (Number(b?.launchReadiness?.totalScore) || 0) -
          (Number(a?.launchReadiness?.totalScore) || 0) ||
        getCandidateName(a).localeCompare(getCandidateName(b))
    )[0] || null;

  const decisionCandidate =
    winner ||
    launchCandidates[0] ||
    finalists[0] ||
    strongestSensoryCandidate ||
    topReadinessCandidate ||
    null;

  let headline = "No launch candidate marked yet";
  let decisionStateLabel = "No finalist, launch candidate, or winner selected";
  if (winner) {
    headline = `Current marked winner: ${getCandidateName(winner)}`;
    decisionStateLabel = "Winner selected manually";
  } else if (launchCandidates.length > 0) {
    headline =
      launchCandidates.length === 1
        ? `Current launch candidate: ${getCandidateName(launchCandidates[0])}`
        : `Current launch candidates: ${formatCandidateList(launchCandidates)}`;
    decisionStateLabel = "Launch candidate marked manually";
  } else if (finalists.length > 0) {
    headline = `Current finalists: ${formatCandidateList(finalists)}`;
    decisionStateLabel = "Finalists marked manually";
  }

  const warnings = [];
  if (!winner && launchCandidates.length === 0 && finalists.length === 0) {
    warnings.push("No candidate is marked finalist, launch candidate, or winner.");
  }

  if (winner) {
    const winnerEvaluationCount = getEvaluationCount(winner);
    const winnerConfidence = getLatestRating(winner, "launchConfidence");
    const winnerBlocker = winner.launchReadiness?.blockers?.[0] || "";
    if (winnerEvaluationCount === 0) {
      warnings.push("Current marked winner has no structured wear test yet.");
    }
    if (
      winnerConfidence != null &&
      winnerConfidence < LOW_LAUNCH_CONFIDENCE_THRESHOLD
    ) {
      warnings.push(
        `Current marked winner has low launch confidence (${formatRating(
          winnerConfidence
        )}).`
      );
    }
    if (winnerBlocker) {
      warnings.push(`Current marked winner still has a blocker: ${winnerBlocker}`);
    }
  }

  if (decisionCandidate) {
    buildDecisionModelCaveatWarnings(decisionCandidate).forEach((warning) => {
      warnings.push(warning);
    });
    if (getEvaluationCount(decisionCandidate) > 0) {
      warnings.push(
        `${getCandidateName(decisionCandidate)} sensory read summarizes the latest wear test snapshot; review the full history before final production planning.`
      );
    }
  }

  if (sensoryEvidence.unevaluatedCandidateCount >= 2) {
    warnings.push(
      `${sensoryEvidence.unevaluatedCandidateCount} hero formulas still have no structured wear test.`
    );
  }

  const focusedBlocker =
    decisionCandidate?.launchReadiness?.blockers?.[0] ||
    decisionCandidate?.launchReadiness?.cautions?.[0] ||
    "";
  const strongestSensoryLabel = strongestSensoryCandidate
    ? `${getCandidateName(strongestSensoryCandidate)} (${getEvaluationCount(
        strongestSensoryCandidate
      )} test${getEvaluationCount(strongestSensoryCandidate) === 1 ? "" : "s"} · confidence ${formatRating(
        getLatestRating(strongestSensoryCandidate, "launchConfidence")
      )} · preference ${formatRating(
        getLatestRating(strongestSensoryCandidate, "preference")
      )})`
    : "No sensory-backed candidate yet";
  const topReadinessLabel = topReadinessCandidate
    ? `${getCandidateName(topReadinessCandidate)} (${(
        Number(topReadinessCandidate.launchReadiness?.totalScore) || 0
      ).toFixed(0)}/100 · ${
        topReadinessCandidate.launchReadiness?.statusMeta?.label ||
        topReadinessCandidate.launchReadiness?.status ||
        "readiness"
      })`
    : "No technical readiness read available";
  const focusedTechnicalLabel = decisionCandidate
    ? `${getCandidateName(decisionCandidate)}: ${(
        Number(decisionCandidate.launchReadiness?.totalScore) || 0
      ).toFixed(0)}/100 launch score · ${
        decisionCandidate.trustSummary?.supportLabel || "material support unavailable"
      } · ${buildIfraStatusLabel(decisionCandidate)} · ${buildInventoryStatusLabel(
        decisionCandidate
      )}`
    : "No focused candidate selected yet.";

  let nextAction = "Mark a finalist or launch candidate after the next comparison pass.";
  if (winner?.launchReadiness?.blockers?.length) {
    nextAction = `Resolve blockers before treating ${getCandidateName(
      winner
    )} as production-ready.`;
  } else if (winner && getEvaluationCount(winner) === 0) {
    nextAction = `Log at least one skin wear test for ${getCandidateName(
      winner
    )} before production planning.`;
  } else if (
    winner &&
    getLatestRating(winner, "launchConfidence") != null &&
    getLatestRating(winner, "launchConfidence") < LOW_LAUNCH_CONFIDENCE_THRESHOLD
  ) {
    nextAction = "Run another wear test before final launch decision.";
  } else if (sensoryEvidence.totalEvaluationCount === 0) {
    nextAction = "Log at least one skin wear test for each variation.";
  } else if (sensoryEvidence.unevaluatedCandidateCount > 0) {
    nextAction = "Log at least one skin wear test for each untested hero formula.";
  } else if (!winner && launchCandidates.length > 0) {
    nextAction = `Compare Original vs ${getCandidateName(
      launchCandidates[0]
    )} before marking a Winner.`;
  } else if (winner) {
    nextAction = "Candidate is marked Winner; review blockers before production planning.";
  } else if (
    strongestSensoryCandidate?.sensorySummary?.nextModificationNeededLabel &&
    strongestSensoryCandidate.sensorySummary.nextModificationNeededLabel !==
      "No next modification logged"
  ) {
    nextAction = `Review next modification for ${getCandidateName(
      strongestSensoryCandidate
    )}: ${strongestSensoryCandidate.sensorySummary.nextModificationNeededLabel}`;
  }

  return {
    headline,
    decisionStateLabel,
    decisionCandidate,
    decisionCandidateKey: getCandidateKey(decisionCandidate),
    winner,
    launchCandidates,
    finalists,
    strongestSensoryCandidate,
    strongestSensoryLabel,
    sensoryEvidence,
    topReadinessCandidate,
    topReadinessLabel,
    focusedTechnicalLabel,
    focusedBlocker,
    warnings: warnings.slice(0, 8),
    nextAction,
  };
}
