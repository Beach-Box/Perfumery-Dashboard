export const HERO_CANDIDATE_STATUS_ORDER = Object.freeze([
  "active",
  "finalist",
  "launch_candidate",
  "winner",
  "parked",
]);

export const HERO_CANDIDATE_STATUS_META = Object.freeze({
  active: {
    label: "Active",
    color: "#7DD3FC",
    bg: "#071826",
    border: "#1E3A52",
  },
  finalist: {
    label: "Finalist",
    color: "#C4B5FD",
    bg: "#1E1B4B",
    border: "#6D28D9",
  },
  launch_candidate: {
    label: "Launch Candidate",
    color: "#FCD34D",
    bg: "#422006",
    border: "#92400E",
  },
  winner: {
    label: "Winner",
    color: "#86EFAC",
    bg: "#052E16",
    border: "#166534",
  },
  parked: {
    label: "Parked",
    color: "#CBD5E1",
    bg: "#111827",
    border: "#334155",
  },
});

const HERO_CANDIDATE_STATUS_SET = new Set(HERO_CANDIDATE_STATUS_ORDER);

function normalizeVariationNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 999;
}

export function isHeroFormulaCandidate(formula, familyKey = "hero-scent") {
  return (
    Boolean(formula?.formulaKey) &&
    formula.familyKey === familyKey &&
    formula.developmentStatus === "active" &&
    String(formula.formulaKey).startsWith("seed-hero-")
  );
}

export function sortHeroCandidateFormulas(
  formulas = [],
  { familyKey = "hero-scent" } = {}
) {
  return [...formulas]
    .filter((formula) => isHeroFormulaCandidate(formula, familyKey))
    .sort((a, b) => {
      const aRoleWeight = a.variationRole === "original" ? 0 : 1;
      const bRoleWeight = b.variationRole === "original" ? 0 : 1;
      if (aRoleWeight !== bRoleWeight) return aRoleWeight - bRoleWeight;
      const variationDelta =
        normalizeVariationNumber(a.variationNumber) -
        normalizeVariationNumber(b.variationNumber);
      if (variationDelta !== 0) return variationDelta;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
}

export function getHeroCandidateRoleLabel(formula) {
  if (formula?.variationRole === "original") return "Original";
  if (formula?.variationRole === "test_variation") {
    const variationNumber = Number(formula?.variationNumber);
    return Number.isFinite(variationNumber) && variationNumber > 0
      ? `Test Variation ${variationNumber}`
      : "Test Variation";
  }
  return "Test Variation";
}

export function normalizeHeroCandidateStatus(status) {
  const normalizedStatus = String(status || "").trim();
  return HERO_CANDIDATE_STATUS_SET.has(normalizedStatus)
    ? normalizedStatus
    : "active";
}

export function normalizeHeroCandidateStatusState(
  formulas = [],
  storedStatusByFormula = {}
) {
  const sortedFormulas = sortHeroCandidateFormulas(formulas);
  const nextStatusByFormula = {};
  let winnerKey = null;

  sortedFormulas.forEach((formula) => {
    const formulaKey = formula.formulaKey;
    const nextStatus = normalizeHeroCandidateStatus(
      storedStatusByFormula?.[formulaKey]
    );
    if (nextStatus === "winner") {
      if (!winnerKey) {
        winnerKey = formulaKey;
        nextStatusByFormula[formulaKey] = "winner";
      } else {
        nextStatusByFormula[formulaKey] = "active";
      }
    } else {
      nextStatusByFormula[formulaKey] = nextStatus;
    }
  });

  return nextStatusByFormula;
}

export function applyHeroCandidateStatus(
  storedStatusByFormula = {},
  formulas = [],
  formulaKey,
  status
) {
  const sortedFormulas = sortHeroCandidateFormulas(formulas);
  const candidateKeySet = new Set(sortedFormulas.map((formula) => formula.formulaKey));
  const normalizedState = normalizeHeroCandidateStatusState(
    sortedFormulas,
    storedStatusByFormula
  );
  const normalizedFormulaKey = String(formulaKey || "").trim();

  if (!candidateKeySet.has(normalizedFormulaKey)) {
    return normalizedState;
  }

  const nextStatus = normalizeHeroCandidateStatus(status);
  const nextState = { ...normalizedState };

  if (nextStatus === "winner") {
    Object.keys(nextState).forEach((key) => {
      if (nextState[key] === "winner") nextState[key] = "active";
    });
  }

  nextState[normalizedFormulaKey] = nextStatus;
  return nextState;
}
