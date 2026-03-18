import { APP_STORAGE_KEYS, readJsonStorage } from "./browser_storage.js";

export const FORMULA_NOTE_ORDER = {
  top: 0,
  mid: 1,
  base: 2,
  carrier: 3,
};

const FORMULA_VERSION_RE = /^v(\d+)\.(\d+)$/i;

export const FORMULA_COMPARE_DEFAULT_STATE = {
  leftFormulaKey: null,
  rightFormulaKey: null,
};

export function formatHumanList(values = [], maxItems = 3) {
  const list = values.filter(Boolean).slice(0, maxItems);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}

export function pushUniqueItem(items, value) {
  if (!value || items.includes(value)) return;
  items.push(value);
}

function slugifyFormulaName(name = "") {
  const slug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "formula";
}

export function buildFormulaKey(name, prefix = "formula") {
  return [
    prefix,
    slugifyFormulaName(name),
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 6),
  ].join("-");
}

function normalizeFormulaVersionLabel(versionLabel, fallback = "v1.0") {
  if (typeof versionLabel !== "string") return fallback;
  const trimmed = versionLabel.trim();
  return FORMULA_VERSION_RE.test(trimmed) ? trimmed : fallback;
}

export function incrementFormulaVersionLabel(versionLabel) {
  const match = FORMULA_VERSION_RE.exec(
    normalizeFormulaVersionLabel(versionLabel)
  );
  if (!match) return "v1.1";
  const major = Number(match[1]) || 1;
  const minor = Number(match[2]) || 0;
  return `v${major}.${minor + 1}`;
}

export function sortFormulaIngredients(ingredients = [], db = {}) {
  return [...ingredients]
    .filter((ingredient) => ingredient && ingredient.name)
    .map((ingredient) => {
      const name = String(ingredient.name).trim();
      return {
        ...ingredient,
        name,
        g: Number.isFinite(Number(ingredient.g)) ? Number(ingredient.g) : 0,
        note: ingredient.note || db[name]?.note || "mid",
      };
    })
    .sort(
      (a, b) =>
        (FORMULA_NOTE_ORDER[a.note] ?? 2) - (FORMULA_NOTE_ORDER[b.note] ?? 2)
    );
}

export function getFormulaDisplayLabel(
  formula,
  { includeVersion = false } = {}
) {
  if (!formula) return "";
  return includeVersion && formula.versionLabel
    ? `${formula.name} ${formula.versionLabel}`
    : formula.name;
}

export function formatFormulaDateLabel(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString();
}

function createSeedFormulaRecord(formula, index, { db = {} } = {}) {
  const formulaKey =
    formula.formulaKey || `seed-${slugifyFormulaName(formula.name)}-${index + 1}`;
  return {
    ...formula,
    formulaKey,
    versionLabel: normalizeFormulaVersionLabel(formula.versionLabel, "v1.0"),
    parentFormulaKey: formula.parentFormulaKey || null,
    parentVersionId: formula.parentVersionId || null,
    isLocked: Boolean(formula.isLocked),
    revisionNote:
      typeof formula.revisionNote === "string" ? formula.revisionNote : "",
    createdAt: formula.createdAt || null,
    updatedAt: formula.updatedAt || null,
    ingredients: sortFormulaIngredients(formula.ingredients, db),
    isSeeded: true,
    isCustom: false,
    sourceType: "seeded",
    seedSourceKey: formulaKey,
  };
}

export function createPersistedFormulaRecord(
  formula,
  index = 0,
  { db = {} } = {}
) {
  const name =
    typeof formula?.name === "string" && formula.name.trim()
      ? formula.name.trim()
      : `Saved Formula ${index + 1}`;
  const nowIso = new Date().toISOString();
  const createdAt = formula?.createdAt || formula?.updatedAt || nowIso;
  const updatedAt = formula?.updatedAt || createdAt;
  const formulaKey = formula?.formulaKey || buildFormulaKey(name, "formula");
  const parentVersionId = formula?.parentVersionId || null;
  const sourceType =
    formula?.sourceType ||
    (parentVersionId
      ? "version"
      : formula?.isSeeded
      ? "seeded_override"
      : "custom");

  return {
    ...formula,
    name,
    formulaKey,
    emoji: formula?.emoji || "🧪",
    tagline: formula?.tagline || "Custom build",
    desc: formula?.desc || "Created in Build Lab.",
    ingredients: sortFormulaIngredients(formula?.ingredients || [], db),
    versionLabel: normalizeFormulaVersionLabel(formula?.versionLabel, "v1.0"),
    parentFormulaKey: formula?.parentFormulaKey || null,
    parentVersionId,
    isLocked: Boolean(formula?.isLocked),
    revisionNote:
      typeof formula?.revisionNote === "string" ? formula.revisionNote : "",
    createdAt,
    updatedAt,
    isSeeded: Boolean(formula?.isSeeded),
    isCustom:
      typeof formula?.isCustom === "boolean"
        ? formula.isCustom
        : !formula?.isSeeded,
    sourceType,
    seedSourceKey: formula?.seedSourceKey || null,
  };
}

export function readPersistedFormulaRecords({
  storageKey = APP_STORAGE_KEYS.savedBuilds,
  db = {},
} = {}) {
  const parsed = readJsonStorage(storageKey, []);
  return Array.isArray(parsed)
    ? parsed.map((record, index) =>
        createPersistedFormulaRecord(record, index, { db })
      )
    : [];
}

export function upsertFormulaRecord(records, formulaRecord, { db = {} } = {}) {
  const normalized = createPersistedFormulaRecord(formulaRecord, 0, { db });
  const existingIndex = records.findIndex(
    (record) => record.formulaKey === normalized.formulaKey
  );
  if (existingIndex === -1) return [...records, normalized];
  const next = [...records];
  next[existingIndex] = normalized;
  return next;
}

export function removeFormulaRecord(records, formulaKey) {
  return records.filter((record) => record.formulaKey !== formulaKey);
}

export function buildFormulaLibrary(
  seedFormulas,
  persistedRecords,
  { db = {} } = {}
) {
  const seeded = seedFormulas.map((formula, index) =>
    createSeedFormulaRecord(formula, index, { db })
  );
  const seededKeys = new Set(seeded.map((formula) => formula.formulaKey));
  const persisted = persistedRecords.map((record, index) =>
    createPersistedFormulaRecord(record, index, { db })
  );
  const persistedByKey = new Map(
    persisted.map((record) => [record.formulaKey, record])
  );

  const mergedSeeded = seeded.map((seedFormula) => {
    const override = persistedByKey.get(seedFormula.formulaKey);
    if (!override) return seedFormula;
    return {
      ...seedFormula,
      ...override,
      formulaKey: seedFormula.formulaKey,
      isSeeded: true,
      sourceType:
        override.sourceType === "seeded"
          ? "seeded_override"
          : override.sourceType,
      seedSourceKey: seedFormula.seedSourceKey,
    };
  });

  const additional = persisted
    .filter((record) => !seededKeys.has(record.formulaKey))
    .sort((a, b) => {
      const createdCompare = String(a.createdAt || "").localeCompare(
        String(b.createdAt || "")
      );
      if (createdCompare !== 0) return createdCompare;
      return a.name.localeCompare(b.name);
    });

  return [...mergedSeeded, ...additional];
}

export function readFormulaCompareState({
  storageKey = APP_STORAGE_KEYS.formulaCompare,
  defaultState = FORMULA_COMPARE_DEFAULT_STATE,
} = {}) {
  const parsed = readJsonStorage(storageKey, defaultState);
  return {
    leftFormulaKey: parsed?.leftFormulaKey || null,
    rightFormulaKey: parsed?.rightFormulaKey || null,
  };
}
