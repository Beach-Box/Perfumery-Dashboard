import { buildFormulaConfidenceWarningLabels } from "./model_confidence_helpers.js";

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

function buildIfraStatusLabel(item) {
  const compliance = item?.launchReadiness?.compliance || {};
  if (compliance.hasHardBlock) return "IFRA hard block";
  if (compliance.failCount > 0) {
    return `${compliance.failCount} IFRA fail row${
      compliance.failCount === 1 ? "" : "s"
    }`;
  }
  if (compliance.warnCount > 0) {
    return `${compliance.warnCount} IFRA warning row${
      compliance.warnCount === 1 ? "" : "s"
    }`;
  }
  return "IFRA clear in current context";
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
    buildFormulaConfidenceWarningLabels(decisionCandidate.confidenceSummary)
      .slice(0, 3)
      .forEach((warning) => {
        warnings.push(`${getCandidateName(decisionCandidate)} model caveat: ${warning}`);
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
    warnings: warnings.slice(0, 6),
    nextAction,
  };
}
