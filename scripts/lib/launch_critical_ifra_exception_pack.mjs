import fs from "node:fs";
import path from "node:path";

import { extractFormulasInitFromAppSource } from "../report_hero_ifra_source_gaps.mjs";

const DEFAULT_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);

export const DEFAULT_LAUNCH_CRITICAL_IFRA_EXCEPTION_PACK_PATH = path.join(
  DEFAULT_ROOT,
  "data",
  "ifra_source_acquisition",
  "launch_critical_ifra_exception_pack.json"
);

export const DEFAULT_LAUNCH_CRITICAL_IFRA_EXCEPTION_PACK_MARKDOWN_PATH = path.join(
  DEFAULT_ROOT,
  "docs",
  "ifra",
  "launch_critical_ifra_exception_pack.md"
);

export const LAUNCH_CRITICAL_IFRA_EXCEPTION_PACK_COMMAND =
  "node scripts/generate_launch_critical_ifra_exception_pack.mjs --markdown --write docs/ifra/launch_critical_ifra_exception_pack.md";

const DEFAULT_APP_PATH = path.join(DEFAULT_ROOT, "src", "App.jsx");

const DEFAULT_INPUT_PATHS = {
  sourceQueuePath: path.join(
    DEFAULT_ROOT,
    "data",
    "ifra_source_acquisition",
    "hero_ifra_source_queue.json"
  ),
  evidenceResolutionPath: path.join(
    DEFAULT_ROOT,
    "data",
    "ifra_source_acquisition",
    "ifra_evidence_resolution.json"
  ),
  recommendationsPath: path.join(
    DEFAULT_ROOT,
    "data",
    "ifra_source_acquisition",
    "ifra_autopilot_recommendations.json"
  ),
  promotionOpportunitiesPath: path.join(
    DEFAULT_ROOT,
    "data",
    "ifra_source_acquisition",
    "ifra_promotion_opportunities.json"
  ),
  sourceAcquisitionAutopilotPath: path.join(
    DEFAULT_ROOT,
    "data",
    "ifra_source_acquisition",
    "ifra_source_acquisition_autopilot_report.json"
  ),
  proposedRecordsPath: path.join(
    DEFAULT_ROOT,
    "data",
    "ifra_source_acquisition",
    "proposed_ifra_structured_records.json"
  ),
  reviewedSourceRecordsPath: path.join(
    DEFAULT_ROOT,
    "data",
    "ifra_source_acquisition",
    "reviewed_ifra_source_records.json"
  ),
  reviewedStructuredOverridesPath: path.join(
    DEFAULT_ROOT,
    "src",
    "data",
    "reviewed_ifra_structured_overrides.json"
  ),
  appPath: DEFAULT_APP_PATH,
};

const PRIMARY_GROUPS = {
  launchCritical: "launch_critical_across_all_active_formulas",
  deferUntilFinalist: "important_but_defer_until_finalist_selected",
  variantSpecific: "variant_specific_only",
  alreadyHandled: "already_handled",
};

const SOURCE_TAGS = {
  blockedBySourceAvailability: "blocked_by_source_availability",
  needsSupplierIfraSds: "needs_supplier_ifra_sds",
  needsOfficialGlobalSource: "needs_official_global_source",
  specialCaseEvidenceOnly: "special_case_evidence_only",
};

const SOURCE_TYPE_LABELS = {
  global_ifra_standard_needed: "official/global IFRA source",
  supplier_ifra_or_sds_needed: "supplier IFRA/SDS",
  specialty_supplier_document_needed: "specialty supplier IFRA/SDS",
  natural_uvcb_supplier_document_needed: "natural/UVCB supplier IFRA/SDS",
  fcf_special_case: "special-case non-limit evidence",
  accord_component_expansion_deferred: "deferred accord component expansion",
  already_structured: "already structured",
};

function loadJsonIfPresent(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function indexBy(items = [], keyFn) {
  const map = new Map();
  for (const item of items || []) {
    const key = keyFn(item);
    if (key) map.set(key, item);
  }
  return map;
}

function indexManyBy(items = [], keyFn) {
  const map = new Map();
  for (const item of items || []) {
    const key = keyFn(item);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const output = [];
  for (const value of values || []) {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
  }
  return output;
}

function countBy(items = [], key) {
  return (items || []).reduce((acc, item) => {
    const value = item?.[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function formatSourceType(value) {
  return SOURCE_TYPE_LABELS[value] || value || "source";
}

function loadActiveHeroFormulasFromApp(appPath = DEFAULT_APP_PATH) {
  const source = fs.readFileSync(appPath, "utf8");
  return extractFormulasInitFromAppSource(source).filter(
    (formula) =>
      formula?.familyKey === "hero-scent" &&
      formula?.developmentStatus === "active"
  );
}

function getPriorityFormula(activeFormulas = []) {
  const nonOriginal = activeFormulas.filter(
    (formula) => formula?.variationRole !== "original"
  );
  const candidates = nonOriginal.length ? nonOriginal : activeFormulas;
  return [...candidates].sort(
    (left, right) =>
      (Number(right?.variationNumber) || 0) - (Number(left?.variationNumber) || 0)
  )[0] || null;
}

function buildFormulaLoadIndex(activeFormulas = []) {
  const map = new Map();
  for (const formula of activeFormulas || []) {
    for (const ingredient of formula?.ingredients || []) {
      const name = String(ingredient?.name || "").trim();
      if (!name) continue;
      const normalized = normalizeText(name);
      if (!map.has(normalized)) map.set(normalized, []);
      map.get(normalized).push({
        formulaName: formula.name,
        grams: Number(ingredient.g) || 0,
        note: ingredient.note || "",
      });
    }
  }
  return map;
}

function getFormulaLoadsForItem(item = {}, loadIndex = new Map()) {
  const names = uniqueStrings([
    item.materialName,
    item.sourceIdentityName,
    item.normalizedName,
    item.activeMaterialName,
  ]);
  const byFormula = new Map();
  for (const name of names) {
    for (const load of loadIndex.get(normalizeText(name)) || []) {
      const existing = byFormula.get(load.formulaName) || {
        formulaName: load.formulaName,
        grams: 0,
        notes: new Set(),
      };
      existing.grams += load.grams;
      if (load.note) existing.notes.add(load.note);
      byFormula.set(load.formulaName, existing);
    }
  }
  return [...byFormula.values()].map((load) => ({
    formulaName: load.formulaName,
    grams: Number(load.grams.toFixed(6)),
    notes: [...load.notes].sort(),
  }));
}

function isReviewedStructured(item = {}, structuredOverrides = []) {
  const material = normalizeText(item.materialName);
  const sourceIdentity = normalizeText(item.sourceIdentityName);
  return (structuredOverrides || []).some((record) => {
    const names = [
      record.standardName,
      record.sourceIdentityName,
      ...(record.materialNames || []),
    ].map(normalizeText);
    return (
      record.reviewStatus === "reviewed_ok" &&
      (names.includes(material) || names.includes(sourceIdentity))
    );
  });
}

function isReviewedNonLimit(item = {}, reviewedSourceRecords = []) {
  const material = normalizeText(item.materialName);
  const sourceIdentity = normalizeText(item.sourceIdentityName);
  return (reviewedSourceRecords || []).some((record) => {
    const names = [
      record.materialName,
      record.normalizedName,
      record.sourceIdentityName,
    ].map(normalizeText);
    return (
      record.reviewStatus === "reviewed_ok" &&
      (names.includes(material) || names.includes(sourceIdentity))
    );
  });
}

function bestProposedRecord(records = []) {
  const official = records.find((record) =>
    String(record.sourceType || "").startsWith("official_ifra")
  );
  return official || records[0] || null;
}

function cleanSnippet(value = "", maxLength = 240) {
  const text = String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\\u003c|\\u003e|\\n|\\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function deriveBestEvidence({
  item,
  resolutionItem,
  recommendationItem,
  acquisitionItem,
  proposedRecord,
  promotionItem,
  reviewedStructured,
  reviewedNonLimit,
} = {}) {
  if (reviewedStructured) {
    return {
      label: "Reviewed structured runtime IFRA override.",
      evidenceQuality: "reviewed_official_runtime",
      sourceType: "official_ifra_standard_pdf",
      source: "",
      snippet: "",
    };
  }
  if (reviewedNonLimit) {
    return {
      label: "Reviewed non-limit FCF/source evidence.",
      evidenceQuality: "reviewed_non_limit_evidence",
      sourceType: "supplier_product_page",
      source: "",
      snippet: "",
    };
  }
  if (promotionItem?.sourceType?.startsWith?.("official_ifra") || proposedRecord?.sourceType?.startsWith?.("official_ifra")) {
    return {
      label: "High-confidence official IFRA candidate staged for review.",
      evidenceQuality: "official_review_candidate",
      sourceType: proposedRecord?.sourceType || promotionItem?.sourceType || "official_ifra",
      source: proposedRecord?.sourceUrl || proposedRecord?.sourceFile || promotionItem?.sourceUrl || "",
      snippet: cleanSnippet(proposedRecord?.sourceSnippet || promotionItem?.bestSourceSnippet || ""),
    };
  }
  if (proposedRecord) {
    const value = `${proposedRecord.category ? `Cat ${proposedRecord.category} ` : ""}${proposedRecord.candidateValue || ""}${proposedRecord.candidateUnit || ""}`.trim();
    return {
      label: `Proposed ${proposedRecord.recordType || "record"} from ${proposedRecord.sourceType || "source"}${value ? ` (${value})` : ""}.`,
      evidenceQuality:
        proposedRecord.sourceType === "supplier_product_page"
          ? "supplier_product_page_only"
          : "needs_review",
      sourceType: proposedRecord.sourceType || "",
      source: proposedRecord.sourceUrl || proposedRecord.sourceFile || "",
      snippet: cleanSnippet(proposedRecord.sourceSnippet || ""),
    };
  }
  const best = acquisitionItem?.bestNewEvidence || {};
  if (best.type) {
    return {
      label: `${best.type} available from ${best.sourceType || "source"}.`,
      evidenceQuality:
        best.type === "supplier_document"
          ? "supplier_document_cached"
          : "candidate_needs_review",
      sourceType: best.sourceType || "",
      source: best.source || "",
      snippet: cleanSnippet(best.snippet || ""),
    };
  }
  const candidate = resolutionItem?.bestCandidates?.[0] || recommendationItem?.bestCandidate || null;
  if (candidate) {
    return {
      label: "Review-ready candidate snippet exists.",
      evidenceQuality:
        candidate.sourceType === "supplier_product_page"
          ? "supplier_product_page_only"
          : "candidate_needs_review",
      sourceType: candidate.sourceType || "",
      source: candidate.sourceUrl || candidate.sourceFile || "",
      snippet: cleanSnippet(candidate.snippet || ""),
    };
  }
  return {
    label: "No useful allowed source found in current outputs.",
    evidenceQuality: "no_useful_allowed_source",
    sourceType: "",
    source: "",
    snippet: "",
  };
}

function hasSourceAvailabilityBlock({ recommendationItem, acquisitionItem, resolutionItem } = {}) {
  return (
    recommendationItem?.recommendationStatus === "no_useful_evidence_found" ||
    acquisitionItem?.result === "no_source_found" ||
    resolutionItem?.evidenceStatus === "insufficient_evidence"
  );
}

function hasProposedButNotPromotable({ recommendationItem, promotionItem } = {}) {
  return (
    recommendationItem?.recommendationStatus ===
      "proposed_structured_record_ready_for_final_review" &&
    promotionItem?.classification === "needs_better_source"
  );
}

function buildMissingText({ item, sourceTags, proposedButNotPromotable, alreadyHandled } = {}) {
  if (alreadyHandled) return "No immediate source action.";
  if (sourceTags.includes(SOURCE_TAGS.blockedBySourceAvailability)) {
    return "A useful allowed public source is missing from current cached/official/supplier outputs.";
  }
  if (proposedButNotPromotable) {
    return "A stronger source or final review confirming identity/category context before any runtime use.";
  }
  if (sourceTags.includes(SOURCE_TAGS.needsSupplierIfraSds)) {
    return "Product-specific supplier IFRA certificate, SDS, or specification strong enough for review.";
  }
  if (sourceTags.includes(SOURCE_TAGS.needsOfficialGlobalSource)) {
    return "Official/global IFRA standard or source-backed Cat 4 evidence for the source identity.";
  }
  if (sourceTags.includes(SOURCE_TAGS.specialCaseEvidenceOnly)) {
    return "Keep this as non-limit source evidence unless a separate category-limit source is reviewed.";
  }
  return `Review-ready ${formatSourceType(item.requiredSourceType)} evidence.`;
}

function buildLaunchImpact({ primaryGroup, sourceTags, item, modelPriorityFormulaName }) {
  const formulas = item.formulasUsedIn || [];
  if (primaryGroup === PRIMARY_GROUPS.alreadyHandled) {
    return "Low. Current reviewed evidence is already recorded; still not launch clearance.";
  }
  if (primaryGroup === PRIMARY_GROUPS.launchCritical) {
    return "High. It appears across all active hero formulas, so unresolved source quality affects every launch path.";
  }
  if (formulas.includes(modelPriorityFormulaName)) {
    return `Medium-high. It affects the current model-guided priority formula (${modelPriorityFormulaName}) but can wait until finalist selection.`;
  }
  if (primaryGroup === PRIMARY_GROUPS.variantSpecific) {
    return "Variant-specific. Resolve only if this formula becomes finalist.";
  }
  if (sourceTags.includes(SOURCE_TAGS.blockedBySourceAvailability)) {
    return "Medium. It is source-blocked, but launch impact depends on finalist selection.";
  }
  return "Medium. It matters if one of the formulas using it becomes the finalist.";
}

function buildNextAction({ primaryGroup, sourceTags, proposedButNotPromotable, alreadyHandled, item }) {
  if (alreadyHandled) return "No further IFRA action right now; keep provenance visible.";
  if (sourceTags.includes(SOURCE_TAGS.specialCaseEvidenceOnly)) {
    return "Keep as special-case evidence; do not convert FCF/phototoxic wording into a runtime category limit.";
  }
  if (sourceTags.includes(SOURCE_TAGS.blockedBySourceAvailability)) {
    return "Keep as a source-availability exception and request/upload an allowed supplier or official document only if this formula remains launch-relevant.";
  }
  if (primaryGroup === PRIMARY_GROUPS.launchCritical) {
    if (proposedButNotPromotable) {
      return "Keep as launch-critical exception; seek formal supplier IFRA/SDS or official/global support before promotion.";
    }
    return "Review the best cached evidence packet and request the missing official or supplier IFRA document if this remains in the launch candidate.";
  }
  if (primaryGroup === PRIMARY_GROUPS.variantSpecific) {
    return "Defer until this variant is selected as finalist; then review the cached evidence or request supplier IFRA/SDS.";
  }
  if (item.requiredSourceType === "global_ifra_standard_needed") {
    return "Defer until finalist selection, then seek official/global IFRA support if still present.";
  }
  return "Defer until finalist selection, then request supplier IFRA/SDS if still present.";
}

function buildDoNotDo({ proposedButNotPromotable, sourceTags, alreadyHandled }) {
  if (alreadyHandled) return "Do not re-promote or treat reviewed evidence as launch clearance.";
  if (sourceTags.includes(SOURCE_TAGS.specialCaseEvidenceOnly)) {
    return "Do not convert non-limit FCF/phototoxic evidence into a category limit.";
  }
  if (proposedButNotPromotable) {
    return "Do not promote weak supplier/product-page snippets as runtime IFRA limits.";
  }
  if (sourceTags.includes(SOURCE_TAGS.blockedBySourceAvailability)) {
    return "Do not broaden scraping or guess URLs to fill this gap.";
  }
  return "Do not promote runtime IFRA data from this exception pack.";
}

function buildPrimaryGroup({ item, allFormula, alreadyHandled, activeFormulaCount }) {
  if (alreadyHandled) return PRIMARY_GROUPS.alreadyHandled;
  if (item.requiredSourceType === "accord_component_expansion_deferred") {
    return PRIMARY_GROUPS.deferUntilFinalist;
  }
  const formulas = item.formulasUsedIn || [];
  if (allFormula && activeFormulaCount > 0) return PRIMARY_GROUPS.launchCritical;
  if (formulas.length <= 1) return PRIMARY_GROUPS.variantSpecific;
  return PRIMARY_GROUPS.deferUntilFinalist;
}

function buildSourceTags({ item, resolutionItem, recommendationItem, acquisitionItem, alreadyHandled }) {
  const tags = [];
  if (item.requiredSourceType === "fcf_special_case") {
    tags.push(SOURCE_TAGS.specialCaseEvidenceOnly);
  }
  if (!alreadyHandled && hasSourceAvailabilityBlock({ recommendationItem, acquisitionItem, resolutionItem })) {
    tags.push(SOURCE_TAGS.blockedBySourceAvailability);
  }
  if (
    !alreadyHandled &&
    [
      "supplier_ifra_or_sds_needed",
      "specialty_supplier_document_needed",
      "natural_uvcb_supplier_document_needed",
    ].includes(item.requiredSourceType)
  ) {
    tags.push(SOURCE_TAGS.needsSupplierIfraSds);
  }
  if (!alreadyHandled && item.requiredSourceType === "global_ifra_standard_needed") {
    tags.push(SOURCE_TAGS.needsOfficialGlobalSource);
  }
  return uniqueStrings(tags);
}

function scoreException({
  item,
  primaryGroup,
  sourceTags,
  allFormula,
  affectsModelPriority,
  proposedButNotPromotable,
  reviewedStructured,
  reviewedNonLimit,
  evidenceQuality,
}) {
  let score = 0;
  if (primaryGroup === PRIMARY_GROUPS.launchCritical) score += 60;
  if (primaryGroup === PRIMARY_GROUPS.deferUntilFinalist) score += 30;
  if (primaryGroup === PRIMARY_GROUPS.variantSpecific) score += 10;
  if (allFormula) score += 18;
  if (affectsModelPriority) score += 12;
  if (item.priority === "high") score += 10;
  if (!reviewedStructured && !reviewedNonLimit) score += 10;
  if (sourceTags.includes(SOURCE_TAGS.blockedBySourceAvailability)) score += 14;
  if (sourceTags.includes(SOURCE_TAGS.needsSupplierIfraSds)) score += 8;
  if (sourceTags.includes(SOURCE_TAGS.needsOfficialGlobalSource)) score += 8;
  if (proposedButNotPromotable) score += 12;
  if (evidenceQuality === "supplier_product_page_only") score += 7;
  if (evidenceQuality === "no_useful_allowed_source") score += 9;
  if (primaryGroup === PRIMARY_GROUPS.alreadyHandled) score -= 80;
  return score;
}

function currentStatusText({
  item,
  resolutionItem,
  recommendationItem,
  promotionItem,
  acquisitionItem,
  proposedButNotPromotable,
  reviewedStructured,
  reviewedNonLimit,
}) {
  if (reviewedStructured) return "Reviewed structured runtime IFRA source exists.";
  if (reviewedNonLimit) return "Reviewed non-limit source evidence exists.";
  if (proposedButNotPromotable) {
    return "Proposed structured record exists, but promotion ranker requires better source.";
  }
  if (recommendationItem?.recommendationStatus === "needs_better_source") {
    return recommendationItem.suggestedAction || "Needs better source.";
  }
  if (recommendationItem?.recommendationStatus === "no_useful_evidence_found") {
    return recommendationItem.suggestedAction || "No useful evidence found.";
  }
  if (resolutionItem?.evidenceStatus) {
    return `${resolutionItem.evidenceStatus}: ${
      resolutionItem.suggestedAction || "review required"
    }`;
  }
  if (promotionItem?.classification) return `Promotion triage: ${promotionItem.classification}.`;
  if (acquisitionItem?.result) return `Acquisition result: ${acquisitionItem.result}.`;
  return `${formatSourceType(item.requiredSourceType)} review remains open.`;
}

function buildExceptionRows({
  sourceQueue,
  evidenceResolution,
  recommendations,
  promotionOpportunities,
  sourceAcquisitionAutopilot,
  proposedRecordsFile,
  reviewedSourceRecords,
  reviewedStructuredOverrides,
  activeFormulas,
} = {}) {
  const activeFormulaNames = new Set((activeFormulas || []).map((formula) => formula.name));
  const activeFormulaCount = activeFormulaNames.size;
  const priorityFormula = getPriorityFormula(activeFormulas);
  const priorityFormulaName = priorityFormula?.name || "";
  const loadIndex = buildFormulaLoadIndex(activeFormulas);
  const resolutionById = indexBy(evidenceResolution?.items || [], (item) => item.queueItemId);
  const recommendationById = indexBy(recommendations?.items || [], (item) => item.queueItemId);
  const promotionById = indexBy(
    promotionOpportunities?.opportunities || [],
    (item) => item.queueItemId
  );
  const acquisitionById = indexBy(
    sourceAcquisitionAutopilot?.materialResults || [],
    (item) => item.queueItemId
  );
  const proposedById = indexManyBy(proposedRecordsFile?.records || [], (item) => item.queueItemId);

  return (sourceQueue?.items || []).map((item) => {
    const formulasUsedIn = uniqueStrings(item.formulasUsedIn || []);
    const formulaLoads = getFormulaLoadsForItem(item, loadIndex);
    const formulaNames = formulasUsedIn.length
      ? formulasUsedIn
      : formulaLoads.map((load) => load.formulaName);
    const allFormula =
      activeFormulaCount > 0 &&
      activeFormulaNames.size > 0 &&
      activeFormulaCount === formulaNames.filter((name) => activeFormulaNames.has(name)).length;
    const affectsModelPriority = Boolean(
      priorityFormulaName && formulaNames.includes(priorityFormulaName)
    );
    const resolutionItem = resolutionById.get(item.id) || null;
    const recommendationItem = recommendationById.get(item.id) || null;
    const promotionItem = promotionById.get(item.id) || null;
    const acquisitionItem = acquisitionById.get(item.id) || null;
    const proposedRecord = bestProposedRecord(proposedById.get(item.id) || []);
    const reviewedStructured = isReviewedStructured(item, reviewedStructuredOverrides?.records || []);
    const reviewedNonLimit = isReviewedNonLimit(item, reviewedSourceRecords?.records || []);
    const alreadyHandled =
      reviewedStructured ||
      reviewedNonLimit ||
      item.requiredSourceType === "already_structured" ||
      item.status === "not_applicable" ||
      recommendationItem?.recommendationStatus === "already_handled" ||
      resolutionItem?.evidenceStatus === "already_reviewed";
    const proposedButNotPromotable = hasProposedButNotPromotable({
      recommendationItem,
      promotionItem,
    });
    const sourceTags = buildSourceTags({
      item,
      resolutionItem,
      recommendationItem,
      acquisitionItem,
      alreadyHandled,
    });
    const primaryGroup = buildPrimaryGroup({
      item,
      allFormula,
      alreadyHandled,
      activeFormulaCount,
    });
    const evidence = deriveBestEvidence({
      item,
      resolutionItem,
      recommendationItem,
      acquisitionItem,
      proposedRecord,
      promotionItem,
      reviewedStructured,
      reviewedNonLimit,
    });
    const score = scoreException({
      item,
      primaryGroup,
      sourceTags,
      allFormula,
      affectsModelPriority,
      proposedButNotPromotable,
      reviewedStructured,
      reviewedNonLimit,
      evidenceQuality: evidence.evidenceQuality,
    });
    return {
      material: item.materialName,
      sourceIdentity: item.sourceIdentityName || item.materialName,
      queueItemId: item.id,
      formulasUsedIn: formulaNames,
      formulaLoads,
      currentFormulaRelevance: allFormula
        ? "Used in all active hero formulas"
        : affectsModelPriority
          ? `Used in ${formulaNames.length} active formula(s), including ${priorityFormulaName}`
          : formulaNames.length === 1
            ? `Variant-specific to ${formulaNames[0]}`
            : `Used in ${formulaNames.length} active formula(s)`,
      priority: item.priority || "",
      requiredSourceType: item.requiredSourceType || "",
      primaryGroup,
      sourceTags,
      exceptionScore: score,
      currentIfraSourceStatus: currentStatusText({
        item,
        resolutionItem,
        recommendationItem,
        promotionItem,
        acquisitionItem,
        proposedButNotPromotable,
        reviewedStructured,
        reviewedNonLimit,
      }),
      bestAvailableEvidence: evidence.label,
      evidenceQuality: evidence.evidenceQuality,
      bestEvidenceSourceType: evidence.sourceType,
      bestEvidenceSource: evidence.source,
      bestEvidenceSnippet: evidence.snippet,
      whatIsMissing: buildMissingText({
        item,
        sourceTags,
        proposedButNotPromotable,
        alreadyHandled,
      }),
      launchConfidenceImpact: buildLaunchImpact({
        primaryGroup,
        sourceTags,
        item: { ...item, formulasUsedIn: formulaNames },
        modelPriorityFormulaName: priorityFormulaName,
      }),
      recommendedNextAction: buildNextAction({
        primaryGroup,
        sourceTags,
        proposedButNotPromotable,
        alreadyHandled,
        item,
      }),
      doNotDo: buildDoNotDo({
        proposedButNotPromotable,
        sourceTags,
        alreadyHandled,
      }),
    };
  });
}

function sortRows(rows = []) {
  return [...rows].sort((left, right) => {
    const scoreDelta = (right.exceptionScore || 0) - (left.exceptionScore || 0);
    if (scoreDelta) return scoreDelta;
    const formulaDelta = (right.formulasUsedIn?.length || 0) - (left.formulasUsedIn?.length || 0);
    if (formulaDelta) return formulaDelta;
    return String(left.material || "").localeCompare(String(right.material || ""));
  });
}

function compactRows(rows = []) {
  return sortRows(rows).map((row) => ({
    material: row.material,
    sourceIdentity: row.sourceIdentity,
    formulasUsedIn: row.formulasUsedIn,
    currentFormulaRelevance: row.currentFormulaRelevance,
    currentIfraSourceStatus: row.currentIfraSourceStatus,
    bestAvailableEvidence: row.bestAvailableEvidence,
    evidenceQuality: row.evidenceQuality,
    bestEvidenceSourceType: row.bestEvidenceSourceType,
    bestEvidenceSource: row.bestEvidenceSource,
    bestEvidenceSnippet: row.bestEvidenceSnippet,
    whatIsMissing: row.whatIsMissing,
    launchConfidenceImpact: row.launchConfidenceImpact,
    recommendedNextAction: row.recommendedNextAction,
    doNotDo: row.doNotDo,
    exceptionScore: row.exceptionScore,
    sourceTags: row.sourceTags,
    requiredSourceType: row.requiredSourceType,
    queueItemId: row.queueItemId,
  }));
}

function buildGroups(rows = []) {
  return {
    launchCriticalAcrossAllActiveFormulas: compactRows(
      rows.filter((row) => row.primaryGroup === PRIMARY_GROUPS.launchCritical)
    ),
    importantButDeferUntilFinalistSelected: compactRows(
      rows.filter((row) => row.primaryGroup === PRIMARY_GROUPS.deferUntilFinalist)
    ),
    variantSpecificOnly: compactRows(
      rows.filter((row) => row.primaryGroup === PRIMARY_GROUPS.variantSpecific)
    ),
    alreadyHandled: compactRows(
      rows.filter((row) => row.primaryGroup === PRIMARY_GROUPS.alreadyHandled)
    ),
    blockedBySourceAvailability: compactRows(
      rows.filter((row) => row.sourceTags.includes(SOURCE_TAGS.blockedBySourceAvailability))
    ),
    needsSupplierIfraSds: compactRows(
      rows.filter((row) => row.sourceTags.includes(SOURCE_TAGS.needsSupplierIfraSds))
    ),
    needsOfficialGlobalSource: compactRows(
      rows.filter((row) => row.sourceTags.includes(SOURCE_TAGS.needsOfficialGlobalSource))
    ),
    specialCaseEvidenceOnly: compactRows(
      rows.filter((row) => row.sourceTags.includes(SOURCE_TAGS.specialCaseEvidenceOnly))
    ),
  };
}

function nextActionForReport(groups) {
  if (groups.launchCriticalAcrossAllActiveFormulas.length) {
    return "Use this pack as the daily IFRA view: resolve launch-critical all-formula exceptions first, then defer variant-only gaps until a finalist is selected.";
  }
  if (groups.blockedBySourceAvailability.length) {
    return "Resolve source-availability exceptions only for formulas that remain in launch contention.";
  }
  return "Keep reviewed provenance visible and regenerate this pack after IFRA evidence or formula changes.";
}

export function buildLaunchCriticalIfraExceptionPack({
  generatedAt = new Date().toISOString(),
  sourceQueue = {},
  evidenceResolution = {},
  recommendations = {},
  promotionOpportunities = {},
  sourceAcquisitionAutopilot = {},
  proposedRecordsFile = {},
  reviewedSourceRecords = {},
  reviewedStructuredOverrides = {},
  activeFormulas = [],
} = {}) {
  const priorityFormula = getPriorityFormula(activeFormulas);
  const rows = buildExceptionRows({
    sourceQueue,
    evidenceResolution,
    recommendations,
    promotionOpportunities,
    sourceAcquisitionAutopilot,
    proposedRecordsFile,
    reviewedSourceRecords,
    reviewedStructuredOverrides,
    activeFormulas,
  });
  const groups = buildGroups(rows);
  const summary = {
    activeFormulaCount: activeFormulas.length,
    activeFormulaNames: activeFormulas.map((formula) => formula.name),
    modelGuidedPriorityFormula: priorityFormula?.name || "",
    totalMaterialsAudited: rows.length,
    launchCriticalExceptionCount:
      groups.launchCriticalAcrossAllActiveFormulas.length,
    alreadyHandledCount: groups.alreadyHandled.length,
    deferUntilFinalistCount:
      groups.importantButDeferUntilFinalistSelected.length,
    variantSpecificOnlyCount: groups.variantSpecificOnly.length,
    blockedBySourceAvailabilityCount: groups.blockedBySourceAvailability.length,
    needsSupplierIfraSdsCount: groups.needsSupplierIfraSds.length,
    needsOfficialGlobalSourceCount: groups.needsOfficialGlobalSource.length,
    specialCaseEvidenceOnlyCount: groups.specialCaseEvidenceOnly.length,
    evidenceQualityCounts: countBy(rows, "evidenceQuality"),
    nextRecommendedAction: nextActionForReport(groups),
  };
  return {
    metadata: {
      generatedAt,
      reportName: "Launch-Critical IFRA Exception Pack",
      regenerateCommand: LAUNCH_CRITICAL_IFRA_EXCEPTION_PACK_COMMAND,
      guardrails: [
        "Exception pack is a launch-confidence review aid only.",
        "No IFRA limits are promoted.",
        "No runtime IFRA classification is changed.",
        "No broad scraping is performed.",
        "No formula, pricing, accord recipe, GCMS, or AI behavior is changed.",
        "No launch clearance is claimed.",
      ],
    },
    decisionSummary: {
      alreadyHandled:
        "Reviewed provenance exists for narrow cases such as Vetiveryl Acetate structured IFRA and reviewed FCF source evidence.",
      launchConfidenceBlockers:
        "All-formula materials with source-quality gaps, no useful allowed source, or proposed records that are not safe to promote.",
      canWaitUntilFinalistSelection:
        "Materials used only by some variants, deferred accord expansion, and DS2-only specialty/natural materials.",
      noFurtherActionRightNow:
        "Reviewed or redundant official-source items that do not reduce the next launch decision risk.",
      recommendedNextIfraAction: summary.nextRecommendedAction,
    },
    summary,
    groups,
  };
}

export function loadLaunchCriticalIfraExceptionPackInputs({
  root = DEFAULT_ROOT,
  paths = {},
  activeFormulas = null,
} = {}) {
  const resolvedPaths = { ...DEFAULT_INPUT_PATHS, ...paths };
  const formulas =
    activeFormulas ||
    loadActiveHeroFormulasFromApp(resolvedPaths.appPath || DEFAULT_APP_PATH);
  return {
    sourceQueue: loadJsonIfPresent(resolvedPaths.sourceQueuePath) || {},
    evidenceResolution: loadJsonIfPresent(resolvedPaths.evidenceResolutionPath) || {},
    recommendations: loadJsonIfPresent(resolvedPaths.recommendationsPath) || {},
    promotionOpportunities:
      loadJsonIfPresent(resolvedPaths.promotionOpportunitiesPath) || {},
    sourceAcquisitionAutopilot:
      loadJsonIfPresent(resolvedPaths.sourceAcquisitionAutopilotPath) || {},
    proposedRecordsFile: loadJsonIfPresent(resolvedPaths.proposedRecordsPath) || {},
    reviewedSourceRecords:
      loadJsonIfPresent(resolvedPaths.reviewedSourceRecordsPath) || {},
    reviewedStructuredOverrides:
      loadJsonIfPresent(resolvedPaths.reviewedStructuredOverridesPath) || {},
    activeFormulas: formulas,
    root,
  };
}

export function buildLaunchCriticalIfraExceptionPackFromFiles(options = {}) {
  return buildLaunchCriticalIfraExceptionPack(
    loadLaunchCriticalIfraExceptionPackInputs(options)
  );
}

function escapeMarkdown(value = "") {
  return String(value || "").replace(/\|/g, "\\|");
}

function formatList(values = []) {
  return values?.length ? values.join(", ") : "None";
}

function formatRowMarkdown(row) {
  const lines = [
    `### ${row.material}`,
    "",
    `- Source identity: ${row.sourceIdentity || row.material}`,
    `- Used in: ${formatList(row.formulasUsedIn)}`,
    `- Formula relevance: ${row.currentFormulaRelevance}`,
    `- Current IFRA/source status: ${row.currentIfraSourceStatus}`,
    `- Best evidence: ${row.bestAvailableEvidence}`,
    `- Evidence quality: ${row.evidenceQuality}`,
    row.bestEvidenceSource ? `- Source: ${row.bestEvidenceSource}` : "",
    row.bestEvidenceSnippet ? `- Evidence snippet: ${escapeMarkdown(row.bestEvidenceSnippet)}` : "",
    `- Missing: ${row.whatIsMissing}`,
    `- Launch-confidence impact: ${row.launchConfidenceImpact}`,
    `- Next action: ${row.recommendedNextAction}`,
    `- Do not do: ${row.doNotDo}`,
    "",
  ];
  return lines.filter(Boolean).join("\n");
}

function formatGroup(title, rows = [], { maxRows = 12 } = {}) {
  if (!rows.length) return [`## ${title}`, "", "_None._", ""].join("\n");
  return [
    `## ${title}`,
    "",
    ...rows.slice(0, maxRows).map(formatRowMarkdown),
    rows.length > maxRows ? `_Plus ${rows.length - maxRows} more in JSON._` : "",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function formatLaunchCriticalIfraExceptionPackMarkdown(report = {}) {
  const summary = report.summary || {};
  const groups = report.groups || {};
  const top = groups.launchCriticalAcrossAllActiveFormulas || [];
  return [
    "# Launch-Critical IFRA Exception Pack",
    "",
    `Generated: ${report.metadata?.generatedAt || ""}`,
    "",
    "This report is a launch-confidence review aid only. It does not promote IFRA limits, change runtime IFRA classification, or claim compliance.",
    "",
    "## Decision Summary",
    "",
    `- What the system has already handled: ${report.decisionSummary?.alreadyHandled || ""}`,
    `- What still blocks launch confidence: ${report.decisionSummary?.launchConfidenceBlockers || ""}`,
    `- What can wait until finalist selection: ${report.decisionSummary?.canWaitUntilFinalistSelection || ""}`,
    `- What needs no further action right now: ${report.decisionSummary?.noFurtherActionRightNow || ""}`,
    `- Recommended next IFRA action: ${report.decisionSummary?.recommendedNextIfraAction || ""}`,
    "",
    "## Counts",
    "",
    `- Active hero formulas: ${summary.activeFormulaCount || 0}`,
    `- Model-guided priority formula: ${summary.modelGuidedPriorityFormula || "Unknown"}`,
    `- Materials audited: ${summary.totalMaterialsAudited || 0}`,
    `- Launch-critical exceptions: ${summary.launchCriticalExceptionCount || 0}`,
    `- Already handled: ${summary.alreadyHandledCount || 0}`,
    `- Defer until finalist: ${summary.deferUntilFinalistCount || 0}`,
    `- Variant-specific only: ${summary.variantSpecificOnlyCount || 0}`,
    `- Blocked by source availability: ${summary.blockedBySourceAvailabilityCount || 0}`,
    `- Needs supplier IFRA/SDS: ${summary.needsSupplierIfraSdsCount || 0}`,
    `- Needs official/global source: ${summary.needsOfficialGlobalSourceCount || 0}`,
    `- Special-case evidence only: ${summary.specialCaseEvidenceOnlyCount || 0}`,
    "",
    "## Top Launch-Critical Exceptions",
    "",
    top.length
      ? top
          .slice(0, 8)
          .map((row) =>
            `- ${escapeMarkdown(row.material)}: ${escapeMarkdown(row.currentIfraSourceStatus)}`
          )
          .join("\n")
      : "_None._",
    "",
    formatGroup(
      "Launch-Critical Across All Active Formulas",
      groups.launchCriticalAcrossAllActiveFormulas || []
    ),
    formatGroup(
      "Important But Defer Until Finalist Selected",
      groups.importantButDeferUntilFinalistSelected || [],
      { maxRows: 10 }
    ),
    formatGroup("Variant-Specific Only", groups.variantSpecificOnly || [], {
      maxRows: 10,
    }),
    formatGroup("Already Handled", groups.alreadyHandled || [], { maxRows: 10 }),
    formatGroup(
      "Blocked By Source Availability",
      groups.blockedBySourceAvailability || [],
      { maxRows: 10 }
    ),
    formatGroup("Needs Supplier IFRA/SDS", groups.needsSupplierIfraSds || [], {
      maxRows: 10,
    }),
    formatGroup(
      "Needs Official/Global Source",
      groups.needsOfficialGlobalSource || [],
      { maxRows: 10 }
    ),
    formatGroup("Special-Case Evidence Only", groups.specialCaseEvidenceOnly || [], {
      maxRows: 10,
    }),
  ].join("\n");
}

export function formatLaunchCriticalIfraExceptionPackText(report = {}) {
  const summary = report.summary || {};
  const top = report.groups?.launchCriticalAcrossAllActiveFormulas || [];
  return [
    "Launch-Critical IFRA Exception Pack",
    "",
    "Review aid only. No IFRA limits are promoted and no launch clearance is claimed.",
    "",
    `Launch-critical exceptions: ${summary.launchCriticalExceptionCount || 0}`,
    `Already handled: ${summary.alreadyHandledCount || 0}`,
    `Defer until finalist: ${summary.deferUntilFinalistCount || 0}`,
    `Blocked by source availability: ${summary.blockedBySourceAvailabilityCount || 0}`,
    `Next action: ${summary.nextRecommendedAction || ""}`,
    "",
    "Top launch-critical exceptions:",
    ...(top.length
      ? top.slice(0, 8).map((row) => `- ${row.material}: ${row.currentIfraSourceStatus}`)
      : ["- None"]),
    "",
  ].join("\n");
}

export function writeLaunchCriticalIfraExceptionPack(filePath, report) {
  writeJson(filePath, report);
}
