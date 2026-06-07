export const HERO_SENSORY_SCHEMA_VERSION = 1;
export const HERO_SENSORY_RATING_MIN = 0;
export const HERO_SENSORY_RATING_MAX = 10;

export const HERO_SENSORY_TEST_SURFACES = Object.freeze([
  "skin",
  "strip",
  "fabric",
  "other",
]);

const DEFAULT_IMPRESSIONS = Object.freeze({
  opening: "",
  heart: "",
  drydown: "",
  skinFeel: "",
  offNotes: "",
  memorability: "",
  emotionalBrandFit: "",
});

const DEFAULT_RATINGS = Object.freeze({
  diffusion: null,
  longevity: null,
  preference: null,
  launchConfidence: null,
});

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeTimestamp(value, fallbackValue) {
  const candidate = String(value || "").trim();
  if (candidate && !Number.isNaN(Date.parse(candidate))) return candidate;
  return fallbackValue;
}

function normalizeDate(value, fallbackValue = "") {
  const candidate = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return candidate;
  return fallbackValue;
}

function getIsoTimestamp(now = new Date()) {
  if (now instanceof Date) return now.toISOString();
  const parsed = new Date(now);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

function getDateStamp(now = new Date()) {
  return getIsoTimestamp(now).slice(0, 10);
}

function normalizeTestSurface(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return HERO_SENSORY_TEST_SURFACES.includes(normalized) ? normalized : "skin";
}

function normalizeDoseSprays(value) {
  if (value === "" || value == null) return "";
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "";
  return Math.max(0, Math.round(numericValue * 10) / 10);
}

export function normalizeHeroSensoryRating(value) {
  if (value === "" || value == null) return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  const boundedValue = Math.max(
    HERO_SENSORY_RATING_MIN,
    Math.min(HERO_SENSORY_RATING_MAX, numericValue)
  );
  return Math.round(boundedValue * 10) / 10;
}

export function createEmptyHeroSensoryEvaluationRecord(
  formulaKey,
  { now = new Date(), id } = {}
) {
  const timestamp = getIsoTimestamp(now);
  const dateStamp = getDateStamp(now);
  const idStamp = timestamp.replace(/\D/g, "");
  return {
    id: normalizeText(id) || `wear-${dateStamp}-${idStamp}`,
    formulaKey: normalizeText(formulaKey),
    createdAt: timestamp,
    updatedAt: timestamp,
    testDate: dateStamp,
    evaluator: "",
    testSurface: "skin",
    dose: {
      sprays: 1,
      amount: "",
      unit: "",
    },
    impressions: { ...DEFAULT_IMPRESSIONS },
    ratings: { ...DEFAULT_RATINGS },
    nextModificationNeeded: "",
    summary: "",
  };
}

export function normalizeHeroSensoryEvaluationRecord(
  record,
  { formulaKey = record?.formulaKey, now = new Date() } = {}
) {
  const normalizedFormulaKey = normalizeText(formulaKey);
  if (!normalizedFormulaKey) return null;

  const timestamp = getIsoTimestamp(now);
  const fallback = createEmptyHeroSensoryEvaluationRecord(normalizedFormulaKey, {
    now: timestamp,
    id: record?.id,
  });
  const impressions = record?.impressions || {};
  const ratings = record?.ratings || {};
  const dose = record?.dose || {};

  return {
    id: normalizeText(record?.id) || fallback.id,
    formulaKey: normalizedFormulaKey,
    createdAt: normalizeTimestamp(record?.createdAt, fallback.createdAt),
    updatedAt: normalizeTimestamp(record?.updatedAt, timestamp),
    testDate: normalizeDate(record?.testDate, fallback.testDate),
    evaluator: normalizeText(record?.evaluator),
    testSurface: normalizeTestSurface(record?.testSurface),
    dose: {
      sprays: normalizeDoseSprays(dose?.sprays),
      amount: normalizeText(dose?.amount),
      unit: normalizeText(dose?.unit),
    },
    impressions: {
      opening: normalizeText(impressions.opening),
      heart: normalizeText(impressions.heart),
      drydown: normalizeText(impressions.drydown),
      skinFeel: normalizeText(impressions.skinFeel),
      offNotes: normalizeText(impressions.offNotes),
      memorability: normalizeText(impressions.memorability),
      emotionalBrandFit: normalizeText(impressions.emotionalBrandFit),
    },
    ratings: {
      diffusion: normalizeHeroSensoryRating(ratings.diffusion),
      longevity: normalizeHeroSensoryRating(ratings.longevity),
      preference: normalizeHeroSensoryRating(ratings.preference),
      launchConfidence: normalizeHeroSensoryRating(ratings.launchConfidence),
    },
    nextModificationNeeded: normalizeText(record?.nextModificationNeeded),
    summary: normalizeText(record?.summary),
  };
}

export function cleanHeroSensoryEvaluationState(rawState = {}) {
  const byFormulaKey = {};
  const rawByFormulaKey =
    rawState && typeof rawState === "object" && rawState.byFormulaKey
      ? rawState.byFormulaKey
      : {};

  Object.entries(rawByFormulaKey).forEach(([formulaKey, formulaState]) => {
    const normalizedFormulaKey = normalizeText(
      formulaState?.formulaKey || formulaKey
    );
    if (!normalizedFormulaKey) return;

    const evaluations = Array.isArray(formulaState?.evaluations)
      ? formulaState.evaluations
      : [];
    const normalizedEvaluations = evaluations
      .filter((evaluation) => evaluation && typeof evaluation === "object")
      .map((evaluation) =>
        normalizeHeroSensoryEvaluationRecord(evaluation, {
          formulaKey: normalizedFormulaKey,
        })
      )
      .filter(Boolean);

    byFormulaKey[normalizedFormulaKey] = {
      formulaKey: normalizedFormulaKey,
      evaluations: normalizedEvaluations,
    };
  });

  return {
    schemaVersion: HERO_SENSORY_SCHEMA_VERSION,
    byFormulaKey,
  };
}

export function groupHeroSensoryEvaluationsByFormulaKey(records = []) {
  const byFormulaKey = {};
  if (!Array.isArray(records)) {
    return {
      schemaVersion: HERO_SENSORY_SCHEMA_VERSION,
      byFormulaKey,
    };
  }

  records.forEach((record) => {
    if (!record || typeof record !== "object") return;
    const normalized = normalizeHeroSensoryEvaluationRecord(record);
    if (!normalized) return;
    if (!byFormulaKey[normalized.formulaKey]) {
      byFormulaKey[normalized.formulaKey] = {
        formulaKey: normalized.formulaKey,
        evaluations: [],
      };
    }
    byFormulaKey[normalized.formulaKey].evaluations.push(normalized);
  });

  return {
    schemaVersion: HERO_SENSORY_SCHEMA_VERSION,
    byFormulaKey,
  };
}

export function getHeroSensoryEvaluationsForFormula(state, formulaKey) {
  const normalizedFormulaKey = normalizeText(formulaKey);
  if (!normalizedFormulaKey) return [];
  const cleanedState = cleanHeroSensoryEvaluationState(state);
  return [
    ...(cleanedState.byFormulaKey[normalizedFormulaKey]?.evaluations || []),
  ];
}

export function countHeroSensoryEvaluations(state, formulaKey) {
  return getHeroSensoryEvaluationsForFormula(state, formulaKey).length;
}

export function getLatestHeroSensoryEvaluation(evaluations = []) {
  if (!Array.isArray(evaluations) || evaluations.length === 0) return null;
  return [...evaluations]
    .map((evaluation) => normalizeHeroSensoryEvaluationRecord(evaluation))
    .filter(Boolean)
    .sort((a, b) => {
      const aDate = Date.parse(`${a.testDate || "0000-01-01"}T00:00:00Z`);
      const bDate = Date.parse(`${b.testDate || "0000-01-01"}T00:00:00Z`);
      if (bDate !== aDate) return bDate - aDate;
      return Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0);
    })[0] || null;
}

function formatRating(value) {
  return value == null ? "Not scored" : `${value}/10`;
}

function formatSurface(value) {
  const normalized = normalizeTestSurface(value);
  if (normalized === "skin") return "Skin";
  if (normalized === "strip") return "Strip";
  if (normalized === "fabric") return "Fabric";
  return "Other";
}

export function buildHeroSensorySummary(state, formulaKey) {
  const evaluations = getHeroSensoryEvaluationsForFormula(state, formulaKey);
  const latestEvaluation = getLatestHeroSensoryEvaluation(evaluations);
  const evaluationCount = evaluations.length;
  const statusLabel =
    evaluationCount === 0
      ? "No wear test yet"
      : evaluationCount === 1
      ? "Wear test logged"
      : "Multiple wear tests logged";

  return {
    formulaKey: normalizeText(formulaKey),
    evaluationCount,
    statusLabel,
    statusKey:
      evaluationCount === 0
        ? "empty"
        : evaluationCount === 1
        ? "logged"
        : "multiple",
    latestEvaluation,
    latestTestDateLabel: latestEvaluation?.testDate || "Not tested",
    latestSurfaceLabel: latestEvaluation
      ? formatSurface(latestEvaluation.testSurface)
      : "Not tested",
    preferenceLabel: latestEvaluation
      ? formatRating(latestEvaluation.ratings.preference)
      : "Not scored",
    launchConfidenceLabel: latestEvaluation
      ? formatRating(latestEvaluation.ratings.launchConfidence)
      : "Not scored",
    diffusionLabel: latestEvaluation
      ? formatRating(latestEvaluation.ratings.diffusion)
      : "Not scored",
    longevityLabel: latestEvaluation
      ? formatRating(latestEvaluation.ratings.longevity)
      : "Not scored",
    offNoteLabel:
      latestEvaluation?.impressions.offNotes || "No off-note logged",
    nextModificationNeededLabel:
      latestEvaluation?.nextModificationNeeded || "No next modification logged",
    summaryLabel: latestEvaluation?.summary || "No summary logged",
  };
}
