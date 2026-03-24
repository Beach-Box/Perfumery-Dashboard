function cloneStorageFallback(fallbackValue) {
  if (Array.isArray(fallbackValue)) return [...fallbackValue];
  if (fallbackValue && typeof fallbackValue === "object") {
    return { ...fallbackValue };
  }
  return fallbackValue;
}

export const APP_STORAGE_KEYS = {
  apiKey: "bb_api_key",
  inventory: "bb_inventory",
  formulaNotes: "bb_formula_notes",
  supplierData: "bb_supplier_data_v4",
  localDraftIngredients: "bb_local_draft_ingredients_v1",
  manualRecordEdits: "bb_manual_record_edits_v1",
  savedBuilds: "bb_saved_builds",
  formulaCompare: "bb_formula_compare_state",
  critiqueLens: "bb_critique_lens",
  founderLaunchScenarios: "bb_founder_launch_scenarios_v1",
  supplierImportLocalReview: "bb_supplier_import_local_review_v1",
  evidenceCandidateLocalReview: "bb_evidence_candidate_review_v1",
  supplierLayerPageFacts: "bb_supplier_layer_page_facts_v1",
};

export function readJsonStorage(key, fallbackValue) {
  if (typeof localStorage === "undefined") {
    return cloneStorageFallback(fallbackValue);
  }
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return cloneStorageFallback(fallbackValue);
    const parsed = JSON.parse(raw);
    return parsed ?? cloneStorageFallback(fallbackValue);
  } catch {
    return cloneStorageFallback(fallbackValue);
  }
}

export function writeJsonStorage(key, value) {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readTextStorage(key, fallbackValue = "") {
  if (typeof localStorage === "undefined") return fallbackValue;
  try {
    return localStorage.getItem(key) ?? fallbackValue;
  } catch {
    return fallbackValue;
  }
}

export function writeTextStorage(key, value) {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(key, String(value ?? ""));
    return true;
  } catch {
    return false;
  }
}
