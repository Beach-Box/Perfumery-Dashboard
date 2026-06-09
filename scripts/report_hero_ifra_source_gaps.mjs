#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  auditFormulaIfraCoverage,
  getIfraMaterialRecord,
  resolveIngredientIdentity,
} from "../src/lib/ifra_combined_package.js";
import {
  HERO_FORMULA_RAW_DB_FIELDS,
  buildHeroFormulaRawDbSupportRows,
  getHeroFormulaAccordRecipe,
} from "../src/lib/hero_formula_material_support.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_APP_PATH = path.join(ROOT, "src", "App.jsx");
const IFRA_MASTER_STANDARDS_PATH = path.join(
  ROOT,
  "src",
  "data",
  "ifra_master_standards.json"
);
const IFRA_COMBINED_PACKAGE_PATH = path.join(
  ROOT,
  "src",
  "data",
  "ifra_combined_package.json"
);

const REQUIRED_SOURCE_TYPE_LABELS = {
  global_ifra_standard_needed: "Global IFRA standard needed",
  supplier_ifra_or_sds_needed: "Supplier IFRA/SDS needed",
  specialty_supplier_document_needed: "Specialty supplier document needed",
  natural_uvcb_supplier_document_needed: "Natural/UVCB supplier docs needed",
  accord_component_expansion_deferred: "Accord expansion deferred",
  already_structured: "Already structured",
  fcf_special_case: "FCF special case",
  defer_low_priority: "Deferred low priority",
};

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

const NATURAL_UVCB_PATTERNS = [
  /\babsolute\b/i,
  /\beo\b/i,
  /\boil\b/i,
  /\bco2\b/i,
  /\bextract\b/i,
  /\bresinoid\b/i,
  /\btincture\b/i,
  /\bcypriol\b/i,
];

const NATURAL_UVCB_TYPES = new Set([
  "ABS",
  "CO2",
  "EO",
  "EXTRACT",
  "NAT",
  "NATURAL",
  "OIL",
  "RESINOID",
  "TINCTURE",
]);

const SPECIALTY_MATERIAL_PATTERNS = [
  /\balgenone\b/i,
  /\bcelestafleur\b/i,
  /\bcetalox\b/i,
  /\bclearwood\b/i,
  /\bcyclogalbanate\b/i,
  /\bflorol\b/i,
  /\bhedione hc\b/i,
  /\bmaritima\b/i,
  /\boceanol\b/i,
  /\borbitone\b/i,
  /\btimbersilk\b/i,
  /\bveramoss\b/i,
];

const SOURCE_HINTS = [
  {
    match: /\baldehyde c-?8\b|\bald c-?8\b|\boctanal\b/i,
    terms: ["Aldehyde C-8", "Ald C-8", "Octanal", "IFRA Octanal"],
    highImpact: true,
    knownRestrictionLikely: true,
  },
  {
    match: /\baldehyde c-?18\b|\bgamma nonalactone\b/i,
    terms: ["Aldehyde C-18", "Gamma Nonalactone", "IFRA Gamma Nonalactone"],
    highImpact: false,
    knownRestrictionLikely: true,
  },
  {
    match: /\biso e super\b|\botne\b|\btetramethyl acetyloctahydronaphthalenes\b/i,
    terms: [
      "Iso E Super",
      "OTNE",
      "Tetramethyl acetyloctahydronaphthalenes",
      "IFRA OTNE",
    ],
    highImpact: true,
  },
  {
    match: /\bambroxan\b|\bambroxide\b/i,
    terms: ["Ambroxan", "Ambroxide", "IFRA Ambroxan", "IFRA Ambroxide"],
    highImpact: true,
  },
  {
    match: /\bcetalox\b/i,
    terms: ["Cetalox", "Cetalox IFRA", "Cetalox SDS"],
    specialty: true,
  },
  {
    match: /\bambrettolide\b/i,
    terms: ["Ambrettolide", "IFRA Ambrettolide"],
    highImpact: true,
  },
  {
    match: /\bdihydromyrcenol\b/i,
    terms: ["Dihydromyrcenol", "IFRA Dihydromyrcenol"],
    highImpact: true,
    knownRestrictionLikely: true,
  },
  {
    match: /\bethy(?:l)?\s*vanillin\b/i,
    terms: ["Ethyl Vanillin", "Ethylvanillin", "IFRA Ethylvanillin"],
    knownRestrictionLikely: true,
  },
  {
    match: /\bcalone\b/i,
    terms: ["Calone", "Calone 1951", "IFRA Calone"],
    highImpact: true,
  },
  {
    match: /\bhedione\b|\bmethyl dihydrojasmonate\b|\bmdj\b/i,
    terms: [
      "Hedione",
      "Methyl dihydrojasmonate",
      "MDJ",
      "IFRA methyl dihydrojasmonate",
    ],
    highImpact: true,
  },
  {
    match: /\boceanol\b/i,
    terms: ["Oceanol", "Oceanol IFRA", "Oceanol SDS"],
    specialty: true,
    highImpact: true,
  },
  {
    match: /\bmaritima\b/i,
    terms: ["Maritima", "Maritima IFRA", "Maritima SDS"],
    specialty: true,
  },
  {
    match: /\balgenone\b/i,
    terms: ["Algenone", "Algenone IFRA", "Algenone SDS"],
    specialty: true,
  },
  {
    match: /\bveramoss\b|\bevernyl\b|\bmethyl atrarate\b/i,
    terms: ["Veramoss", "Evernyl", "Methyl atrarate", "IFRA methyl atrarate"],
    specialty: true,
    knownRestrictionLikely: true,
  },
  {
    match: /\bflorol\b/i,
    terms: ["Florol", "Florol IFRA", "Florol SDS"],
    specialty: true,
  },
  {
    match: /\bcelestafleur\b/i,
    terms: ["Celestafleur", "Celestafleur IFRA", "Celestafleur SDS"],
    specialty: true,
  },
  {
    match: /\bcypriol\b/i,
    terms: ["Cypriol", "Cypriol oil", "Cypriol IFRA", "Cypriol SDS"],
    natural: true,
  },
  {
    match: /\bseaweed\b/i,
    terms: [
      "Seaweed Absolute",
      "Seaweed Absolute IFRA",
      "Seaweed Absolute SDS",
    ],
    natural: true,
  },
  {
    match: /\bpink pepper/i,
    terms: [
      "Pink Peppercorn Oil P&N",
      "Pink Peppercorn Oil IFRA",
      "Pink Peppercorn Oil SDS",
    ],
    natural: true,
  },
  {
    match: /\bcedarwood virginia\b|\bjuniperus virginiana\b/i,
    terms: [
      "Cedarwood Virginia EO",
      "Juniperus virginiana wood oil",
      "Cedarwood Virginia IFRA",
      "Cedarwood Virginia SDS",
    ],
    natural: true,
  },
];

function getRequiredSourceTypeLabel(key) {
  return REQUIRED_SOURCE_TYPE_LABELS[key] || key;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

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
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
  }
  return output;
}

function extractArrayConstant(source, marker) {
  const markerStart = source.indexOf(marker);
  if (markerStart === -1) {
    throw new Error(`${marker} was not found`);
  }
  const arrayStart = source.indexOf("[", markerStart);
  if (arrayStart === -1) {
    throw new Error(`${marker} array start was not found`);
  }

  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let index = arrayStart; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) inString = false;
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      inString = true;
      quote = char;
      continue;
    }

    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(arrayStart, index + 1);
      }
    }
  }

  throw new Error(`${marker} array end was not found`);
}

export function extractFormulasInitFromAppSource(source) {
  const arraySource = extractArrayConstant(source, "const FORMULAS_INIT");
  return vm.runInNewContext(`(${arraySource})`, {}, { timeout: 1000 });
}

export function loadActiveHeroFormulas(appPath = DEFAULT_APP_PATH) {
  const source = fs.readFileSync(appPath, "utf8");
  const formulas = extractFormulasInitFromAppSource(source);
  return formulas.filter(
    (formula) =>
      formula?.familyKey === "hero-scent" &&
      formula?.developmentStatus === "active"
  );
}

function buildSupportDb() {
  const rows = buildHeroFormulaRawDbSupportRows();
  return Object.fromEntries(
    Object.entries(rows || {}).map(([name, row]) => {
      if (!Array.isArray(row)) return [name, row || {}];
      return [
        name,
        Object.fromEntries(
          HERO_FORMULA_RAW_DB_FIELDS.map((field, index) => [field, row[index]])
        ),
      ];
    })
  );
}

function collectUniqueFormulaMaterials(formulas) {
  const byName = new Map();
  for (const formula of formulas) {
    for (const ingredient of formula?.ingredients || []) {
      const name = String(ingredient?.name || "").trim();
      if (!name) continue;
      if (!byName.has(name)) {
        byName.set(name, {
          materialName: name,
          formulasUsedIn: [],
          totalFormulaGrams: 0,
          noteRoles: new Set(),
        });
      }
      const row = byName.get(name);
      if (!row.formulasUsedIn.includes(formula.name)) {
        row.formulasUsedIn.push(formula.name);
      }
      row.totalFormulaGrams += Number(ingredient.g) || 0;
      if (ingredient.note) row.noteRoles.add(ingredient.note);
    }
  }
  return [...byName.values()].map((row) => ({
    ...row,
    noteRoles: [...row.noteRoles].sort(),
  }));
}

function getHint(materialName, identity) {
  const values = [
    materialName,
    identity?.canonicalAppName,
    identity?.normalizedName,
    ...(identity?.aliases || []),
  ];
  const haystack = values.map(normalizeText).join(" ");
  return SOURCE_HINTS.find((hint) => hint.match.test(haystack)) || null;
}

function hasDefinedIfraLimit(material) {
  return Object.values(material?.limits || {}).some((limit) => limit != null);
}

function getCasTerms(identity, material) {
  return uniqueStrings([
    ...(identity?.aliases || []),
    ...(material?.cas || []),
    ...(material?.synonyms || []),
  ]).filter((value) => /\b\d{2,7}-\d{2}-\d\b/.test(value));
}

function isNaturalOrUvcb(materialName, record, identity, hint) {
  const materialType = String(record?.type || identity?.dbMaterialType || "").toUpperCase();
  return (
    Boolean(hint?.natural) ||
    NATURAL_UVCB_TYPES.has(materialType) ||
    Boolean(record?.isUVCB || identity?.isUVCB) ||
    NATURAL_UVCB_PATTERNS.some((pattern) => pattern.test(materialName))
  );
}

function isSpecialtyMaterial(materialName, identity, hint) {
  const values = [
    materialName,
    identity?.canonicalAppName,
    identity?.normalizedName,
    ...(identity?.aliases || []),
  ].join(" ");
  return (
    Boolean(hint?.specialty) ||
    SPECIALTY_MATERIAL_PATTERNS.some((pattern) => pattern.test(values))
  );
}

function classifyRequiredSourceType({
  auditRow,
  materialName,
  record,
  identity,
  material,
  hint,
}) {
  if (
    auditRow?.category === "exactIfraMatch" ||
    auditRow?.category === "aliasIfraMatch"
  ) {
    return "already_structured";
  }
  if (auditRow?.category === "fcfSpecialCase") return "fcf_special_case";
  if (auditRow?.category === "accordLevelOnly" || getHeroFormulaAccordRecipe(materialName)) {
    return "accord_component_expansion_deferred";
  }
  if (auditRow?.category === "supplierSdsNeeded") {
    if (isNaturalOrUvcb(materialName, record, identity, hint)) {
      return "natural_uvcb_supplier_document_needed";
    }
    if (isSpecialtyMaterial(materialName, identity, hint)) {
      return "specialty_supplier_document_needed";
    }
    return "supplier_ifra_or_sds_needed";
  }
  if (material && material.status === "active" && hasDefinedIfraLimit(material)) {
    return "already_structured";
  }
  if (isSpecialtyMaterial(materialName, identity, hint)) {
    return "specialty_supplier_document_needed";
  }
  return "global_ifra_standard_needed";
}

function getSuggestedDocumentName(row) {
  const baseName = row.normalizedName || row.materialName;
  switch (row.requiredSourceType) {
    case "already_structured":
      return `Existing structured IFRA standard for ${row.matchedMaterial || baseName}`;
    case "fcf_special_case":
      return `${row.materialName} supplier IFRA certificate confirming FCF/furocoumarin-free identity`;
    case "accord_component_expansion_deferred":
      return `${row.materialName} component IFRA expansion worksheet`;
    case "natural_uvcb_supplier_document_needed":
      return `${row.materialName} supplier IFRA certificate, SDS, and product identity/spec document`;
    case "specialty_supplier_document_needed":
      return `${row.materialName} supplier or manufacturer IFRA certificate and SDS`;
    case "supplier_ifra_or_sds_needed":
      return `${row.materialName} supplier IFRA certificate and SDS`;
    case "defer_low_priority":
      return `${row.materialName} source document when this row becomes decision-critical`;
    default:
      return `IFRA 51st Amendment standard for ${baseName}`;
  }
}

function getPriority({ uniqueRow, auditRow, requiredSourceType, hint }) {
  if (requiredSourceType === "already_structured") return "low";
  if (requiredSourceType === "accord_component_expansion_deferred") return "low";
  if (requiredSourceType === "fcf_special_case") return "medium";
  if (
    requiredSourceType === "natural_uvcb_supplier_document_needed" ||
    auditRow?.category === "supplierSdsNeeded" ||
    auditRow?.category === "sourceUnavailable" ||
    hint?.knownRestrictionLikely ||
    hint?.highImpact ||
    uniqueRow.formulasUsedIn.length > 1
  ) {
    return "high";
  }
  return "medium";
}

function buildReason({ uniqueRow, auditRow, requiredSourceType, hint }) {
  const pieces = [];
  pieces.push(`Current IFRA category is ${auditRow?.category || "unknown"}.`);
  if (uniqueRow.formulasUsedIn.length > 1) {
    pieces.push(`Appears in ${uniqueRow.formulasUsedIn.length} active hero formulas.`);
  } else {
    pieces.push("Appears in 1 active hero formula.");
  }
  if (hint?.highImpact) pieces.push("High-impact material for odor/model decisions.");
  if (hint?.knownRestrictionLikely) pieces.push("Known-restriction review is likely useful.");
  if (requiredSourceType === "already_structured") {
    pieces.push("Already has a structured runtime IFRA match.");
  }
  if (requiredSourceType === "fcf_special_case") {
    pieces.push("FCF/furocoumarin-free citrus must stay separate from regular expressed citrus.");
  }
  if (requiredSourceType === "accord_component_expansion_deferred") {
    pieces.push("Formula row is an accord; component IFRA expansion is deferred.");
  }
  return pieces.join(" ");
}

function buildSearchTerms({ materialName, identity, material, hint, requiredSourceType }) {
  const casTerms = getCasTerms(identity, material).map((cas) => `CAS ${cas}`);
  const aliasTerms = uniqueStrings([
    materialName,
    identity?.canonicalAppName,
    identity?.normalizedName,
    ...(identity?.aliases || []),
    material?.canonicalName,
    ...(material?.synonyms || []),
    ...(hint?.terms || []),
  ]).filter((term) => term && !/\b\d{2,7}-\d{2}-\d\b/.test(term));

  const ifraTerms =
    requiredSourceType === "already_structured"
      ? []
      : aliasTerms
          .filter((term) => !/\b(ifra|sds|certificate)\b/i.test(term))
          .slice(0, 3)
          .map((term) => `IFRA ${term}`);
  const supplierTerms =
    requiredSourceType.includes("supplier") ||
    requiredSourceType.includes("natural") ||
    requiredSourceType.includes("specialty")
      ? [`${materialName} SDS`, `${materialName} IFRA certificate`]
      : [];

  return uniqueStrings([...aliasTerms, ...casTerms, ...ifraTerms, ...supplierTerms]).slice(0, 14);
}

function buildNotes({ requiredSourceType, material, masterDataHasCandidate }) {
  const notes = [];
  if (requiredSourceType === "global_ifra_standard_needed") {
    notes.push("Need a source-backed IFRA standard before adding a structured limit.");
    if (!masterDataHasCandidate) {
      notes.push("Current committed IFRA master standards did not expose a safe candidate match.");
    }
  }
  if (
    requiredSourceType === "supplier_ifra_or_sds_needed" ||
    requiredSourceType === "specialty_supplier_document_needed" ||
    requiredSourceType === "natural_uvcb_supplier_document_needed"
  ) {
    notes.push("Supplier IFRA/SDS needed before launch clearance.");
  }
  if (requiredSourceType === "fcf_special_case") {
    notes.push("Do not map this row to regular expressed citrus without source-backed non-FCF identity.");
  }
  if (requiredSourceType === "accord_component_expansion_deferred") {
    notes.push("Accord rows remain single formula rows; recipe costing does not expand IFRA coverage.");
  }
  if (requiredSourceType === "already_structured" && material?.source?.document) {
    notes.push(`Structured source reference: ${material.source.document}.`);
  }
  return notes;
}

function masterDataContainsCandidate(standards, terms) {
  const normalizedTerms = terms.map(normalizeText).filter(Boolean);
  return standards.some((standard) => {
    const candidates = [
      standard.lookup_key,
      standard.canonical_name,
      ...(standard.synonyms || []),
      ...(standard.cas_numbers || []),
    ].map(normalizeText);
    return normalizedTerms.some((term) => candidates.includes(term));
  });
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item?.[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

export function buildHeroIfraSourceGapReport({
  appPath = DEFAULT_APP_PATH,
  generatedAt = new Date().toISOString(),
} = {}) {
  const ifraMasterData = readJson(IFRA_MASTER_STANDARDS_PATH);
  const ifraCombinedPackage = readJson(IFRA_COMBINED_PACKAGE_PATH);
  const activeFormulas = loadActiveHeroFormulas(appPath);
  const uniqueRows = collectUniqueFormulaMaterials(activeFormulas);
  const supportDb = buildSupportDb();
  const audit = auditFormulaIfraCoverage(
    uniqueRows.map((row) => ({ name: row.materialName, g: row.totalFormulaGrams })),
    { db: supportDb }
  );
  const auditRowsByName = new Map(audit.rows.map((row) => [row.name, row]));
  const standards = ifraMasterData.standards || [];

  const materials = uniqueRows
    .map((uniqueRow) => {
      const materialName = uniqueRow.materialName;
      const auditRow = auditRowsByName.get(materialName) || null;
      const record = supportDb[materialName] || {};
      const identity = resolveIngredientIdentity(materialName);
      const material = getIfraMaterialRecord(materialName);
      const hint = getHint(materialName, identity);
      const requiredSourceType = classifyRequiredSourceType({
        auditRow,
        materialName,
        record,
        identity,
        material,
        hint,
      });
      const likelyCasOrAliasTerms = uniqueStrings([
        ...(identity?.aliases || []),
        ...(material?.cas || []),
        ...(material?.synonyms || []),
        ...(hint?.terms || []),
      ]);
      const masterDataHasCandidate = masterDataContainsCandidate(
        standards,
        likelyCasOrAliasTerms
      );
      const baseRow = {
        materialName,
        normalizedName:
          identity?.normalizedName ||
          identity?.canonicalAppName ||
          material?.canonicalName ||
          materialName,
        formulasUsedIn: uniqueRow.formulasUsedIn,
        currentIfraCategory: auditRow?.category || "unknown",
        requiredSourceType,
        suggestedDocumentName: "",
        candidateSearchTerms: [],
        likelyCasOrAliasTerms,
        priority: "",
        reason: "",
        safeToMapNow: requiredSourceType === "already_structured",
        notes: [],
        matchedMaterial: auditRow?.matchedMaterial || material?.canonicalName || null,
        totalFormulaGrams: Number(uniqueRow.totalFormulaGrams.toFixed(6)),
      };
      baseRow.suggestedDocumentName = getSuggestedDocumentName(baseRow);
      baseRow.candidateSearchTerms = buildSearchTerms({
        materialName,
        identity,
        material,
        hint,
        requiredSourceType,
      });
      baseRow.priority = getPriority({
        uniqueRow,
        auditRow,
        requiredSourceType,
        hint,
      });
      baseRow.reason = buildReason({
        uniqueRow,
        auditRow,
        requiredSourceType,
        hint,
      });
      baseRow.notes = buildNotes({
        requiredSourceType,
        material,
        masterDataHasCandidate,
      });
      return baseRow;
    })
    .sort((left, right) => {
      const priorityDelta =
        PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
      if (priorityDelta) return priorityDelta;
      const sourceDelta = left.requiredSourceType.localeCompare(
        right.requiredSourceType
      );
      if (sourceDelta) return sourceDelta;
      return left.materialName.localeCompare(right.materialName);
    });

  const highPriorityGaps = materials.filter(
    (row) => row.priority === "high" && row.requiredSourceType !== "already_structured"
  );
  const sourcePath = ifraMasterData.metadata?.source_path || "";
  const resolvedSourcePath = sourcePath ? path.resolve(ROOT, sourcePath) : "";
  const sourcePathRelative = resolvedSourcePath
    ? path.relative(ROOT, resolvedSourcePath)
    : "";
  const sourcePathInsideRepo =
    Boolean(sourcePathRelative) &&
    !sourcePathRelative.startsWith("..") &&
    !path.isAbsolute(sourcePathRelative);
  const sourcePathExistsInRepo = sourcePathInsideRepo
    ? fs.existsSync(resolvedSourcePath)
    : false;

  return {
    metadata: {
      generatedAt,
      reportName: "Hero IFRA Source Gap Report",
      activeFormulaSource: path.relative(ROOT, appPath),
      sourceDataFiles: [
        "src/App.jsx",
        "src/data/ifra_master_standards.json",
        "src/data/ifra_combined_package.json",
        "src/lib/ifra_combined_package.js",
        "src/data/hero_formula_material_support.json",
        "src/data/hero_formula_accord_recipes.json",
      ],
      referencedIfraPdf: {
        sourceDocument: ifraMasterData.metadata?.source_document || null,
        sourcePath: sourcePath || null,
        sourcePathExistsInRepo,
        presentInRepo: sourcePathExistsInRepo,
      },
      note:
        "Read-only source acquisition report. It does not add IFRA limits or prove launch compliance.",
    },
    summary: {
      activeFormulaCount: activeFormulas.length,
      activeFormulaNames: activeFormulas.map((formula) => formula.name),
      uniqueMaterialCount: materials.length,
      requiredSourceTypeCounts: countBy(materials, "requiredSourceType"),
      priorityCounts: countBy(materials, "priority"),
      highPriorityGapCount: highPriorityGaps.length,
      structuredStandardCount: standards.length,
      structuredStandardsWithCategoryLimits: Number(
        ifraMasterData.metadata?.records_with_category_limits
      ) || standards.filter((standard) => Object.keys(standard.category_limits || {}).length).length,
      combinedPackageVersion: ifraCombinedPackage.meta?.version || null,
    },
    materials,
  };
}

function escapeMarkdown(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function formatMarkdownReport(report) {
  const sourceCounts = report.summary.requiredSourceTypeCounts;
  const priorityCounts = report.summary.priorityCounts;
  const rows = [
    "# Hero IFRA Source Gap Report",
    "",
    `Generated: ${report.metadata.generatedAt}`,
    "",
    "This is a source acquisition report. It does not prove compliance, add IFRA limits, or claim launch clearance.",
    "",
    "## Summary",
    "",
    `- Active formulas: ${report.summary.activeFormulaCount}`,
    `- Unique active hero materials: ${report.summary.uniqueMaterialCount}`,
    `- High-priority source gaps: ${report.summary.highPriorityGapCount}`,
    `- Structured IFRA standards in current dataset: ${report.summary.structuredStandardCount}`,
    `- Structured standards with category limits: ${report.summary.structuredStandardsWithCategoryLimits}`,
    `- Referenced IFRA PDF present in repo: ${report.metadata.referencedIfraPdf.presentInRepo ? "yes" : "no"}`,
    "",
    "Required source type counts:",
    ...Object.entries(sourceCounts)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `- ${key}: ${value}`),
    "",
    "Priority counts:",
    ...Object.entries(priorityCounts)
      .sort(([left], [right]) => PRIORITY_RANK[left] - PRIORITY_RANK[right])
      .map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Materials",
    "",
    "| Priority | Material | Current IFRA | Required source | Used in | Suggested document | Search terms | Safe to map now |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...report.materials
      .map((row) =>
        [
          row.priority,
          row.materialName,
          row.currentIfraCategory,
          `${getRequiredSourceTypeLabel(row.requiredSourceType)} (${row.requiredSourceType})`,
          row.formulasUsedIn.join(", "),
          row.suggestedDocumentName,
          row.candidateSearchTerms.join("; "),
          row.safeToMapNow ? "yes" : "no",
        ]
          .map(escapeMarkdown)
          .join(" | ")
      )
      .map((line) => `| ${line} |`),
    "",
  ];
  return rows.join("\n");
}

export function formatTextReport(report) {
  const lines = [
    "Hero IFRA Source Gap Report",
    "",
    "This is a source acquisition report. It does not prove compliance or add IFRA limits.",
    "",
    `Active formulas: ${report.summary.activeFormulaCount}`,
    `Unique active hero materials: ${report.summary.uniqueMaterialCount}`,
    `High-priority source gaps: ${report.summary.highPriorityGapCount}`,
    `Referenced IFRA PDF present in repo: ${
      report.metadata.referencedIfraPdf.presentInRepo ? "yes" : "no"
    }`,
    "",
    "Required source type counts:",
    ...Object.entries(report.summary.requiredSourceTypeCounts)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `- ${key}: ${value}`),
    "",
    "Required source type labels:",
    ...Object.entries(REQUIRED_SOURCE_TYPE_LABELS)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `- ${key}: ${value}`),
    "",
    "High-priority gaps:",
  ];

  for (const row of report.materials.filter((item) => item.priority === "high")) {
    lines.push(
      `- ${row.materialName}: ${row.requiredSourceType} (${getRequiredSourceTypeLabel(
        row.requiredSourceType
      )}; current ${row.currentIfraCategory})`
    );
    lines.push(`  Used in: ${row.formulasUsedIn.join(", ")}`);
    lines.push(`  Suggested document: ${row.suggestedDocumentName}`);
    lines.push(`  Search: ${row.candidateSearchTerms.slice(0, 8).join("; ")}`);
  }

  lines.push("", "All materials:");
  for (const row of report.materials) {
    lines.push(
      `- [${row.priority}] ${row.materialName} -> ${row.requiredSourceType}; safeToMapNow=${row.safeToMapNow ? "yes" : "no"}`
    );
  }

  return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
  const args = {
    format: "text",
    writePath: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") args.format = "json";
    else if (arg === "--markdown") args.format = "markdown";
    else if (arg === "--write") {
      const value = argv[index + 1];
      if (!value) throw new Error("--write requires a path");
      args.writePath = path.resolve(ROOT, value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function renderReport(report, format) {
  if (format === "json") return `${JSON.stringify(report, null, 2)}\n`;
  if (format === "markdown") return formatMarkdownReport(report);
  return formatTextReport(report);
}

export function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const report = buildHeroIfraSourceGapReport();
  const output = renderReport(report, args.format);
  if (args.writePath) {
    fs.mkdirSync(path.dirname(args.writePath), { recursive: true });
    fs.writeFileSync(args.writePath, output.endsWith("\n") ? output : `${output}\n`);
  } else {
    process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
  }
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  runCli();
}
