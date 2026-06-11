import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildHeroIfraSourceGapReport,
  extractFormulasInitFromAppSource,
  formatMarkdownReport,
  formatTextReport,
} from "../scripts/report_hero_ifra_source_gaps.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INGREDIENT_REFERENCE_FIXTURE = path.join(
  ROOT,
  "scripts",
  "fixtures",
  "ingredient_reference_sample.csv"
);

function findMaterial(report, materialName) {
  const row = report.materials.find((item) => item.materialName === materialName);
  assert.ok(row, `${materialName} should be present in the report`);
  return row;
}

test("hero IFRA source gap report extracts active hero formulas from App source", () => {
  const formulas = extractFormulasInitFromAppSource(`
    const FORMULAS_INIT = [
      {
        formulaKey: "seed-a",
        familyKey: "hero-scent",
        developmentStatus: "active",
        name: "Active Hero",
        ingredients: [{ name: "Cashmeran", g: 1 }]
      },
      {
        formulaKey: "seed-b",
        familyKey: "legacy",
        developmentStatus: "retired",
        name: "Legacy",
        ingredients: []
      }
    ];
  `);

  assert.equal(formulas.length, 2);
  assert.equal(formulas[0].name, "Active Hero");
});

test("hero IFRA source gap report includes active hero materials and current summary counts", () => {
  const report = buildHeroIfraSourceGapReport({
    generatedAt: "2026-06-09T00:00:00.000Z",
  });

  assert.equal(report.summary.activeFormulaCount, 4);
  assert.equal(report.summary.uniqueMaterialCount, 50);
  assert.equal(report.summary.structuredStandardCount, 259);
  assert.equal(report.summary.structuredStandardsWithCategoryLimits, 168);
  assert.equal(report.metadata.referencedIfraPdf.presentInRepo, false);
  assert.equal(report.metadata.referencedIfraPdf.sourcePathExistsInRepo, false);
  assert.equal(Object.hasOwn(report.metadata.referencedIfraPdf, "sourcePathExists"), false);

  for (const materialName of [
    "Aldehyde C-8",
    "Iso E Super",
    "Ambroxan Crystals",
    "Cetalox",
    "Seaweed Absolute 10%",
    "Pink Peppercorn Oil P&N",
    "Cedarwood Virginia EO",
  ]) {
    findMaterial(report, materialName);
  }
});

test("hero IFRA source gap report keeps structured, FCF, supplier, and accord states separate", () => {
  const report = buildHeroIfraSourceGapReport({
    generatedAt: "2026-06-09T00:00:00.000Z",
  });

  const cashmeran = findMaterial(report, "Cashmeran");
  assert.equal(cashmeran.currentIfraCategory, "aliasIfraMatch");
  assert.equal(cashmeran.requiredSourceType, "already_structured");
  assert.equal(cashmeran.safeToMapNow, true);

  const bergamotFcf = findMaterial(report, "Bergamot EO FCF");
  assert.equal(bergamotFcf.currentIfraCategory, "fcfSpecialCase");
  assert.equal(bergamotFcf.requiredSourceType, "fcf_special_case");
  assert.equal(bergamotFcf.safeToMapNow, false);

  const seaweed = findMaterial(report, "Seaweed Absolute 10%");
  assert.equal(seaweed.currentIfraCategory, "supplierSdsNeeded");
  assert.equal(seaweed.requiredSourceType, "natural_uvcb_supplier_document_needed");
  assert.equal(seaweed.safeToMapNow, false);
  assert.equal(seaweed.sourceIdentityName, "Seaweed Absolute");
  assert.equal(seaweed.dilutionLabel, "10%");
  assert.equal(
    seaweed.candidateSearchTerms.some((term) => /Seaweed Absolute 10%|10%/.test(term)),
    false
  );

  const cetalox = findMaterial(report, "Cetalox");
  assert.equal(cetalox.currentIfraCategory, "supplierSdsNeeded");
  assert.equal(cetalox.requiredSourceType, "specialty_supplier_document_needed");
  assert.equal(cetalox.safeToMapNow, false);

  const accord = findMaterial(report, "Botanical Musk Accord");
  assert.equal(accord.currentIfraCategory, "accordLevelOnly");
  assert.equal(accord.requiredSourceType, "accord_component_expansion_deferred");
  assert.equal(accord.safeToMapNow, false);
});

test("hero IFRA source gap report does not expose or add IFRA limits", () => {
  const report = buildHeroIfraSourceGapReport({
    generatedAt: "2026-06-09T00:00:00.000Z",
  });

  assert.equal(
    report.materials.some(
      (row) =>
        Object.hasOwn(row, "limits") ||
        Object.hasOwn(row, "categoryLimits") ||
        Object.hasOwn(row, "limitSummary")
    ),
    false
  );

  const aldehydeC8 = findMaterial(report, "Aldehyde C-8");
  assert.equal(aldehydeC8.requiredSourceType, "global_ifra_standard_needed");
  assert.equal(aldehydeC8.safeToMapNow, false);
  assert.ok(aldehydeC8.candidateSearchTerms.includes("Octanal"));
  assert.equal(Object.hasOwn(aldehydeC8, "referenceMatchConfidence"), false);
});

test("hero IFRA source gap report formats text and markdown output", () => {
  const report = buildHeroIfraSourceGapReport({
    generatedAt: "2026-06-09T00:00:00.000Z",
  });
  const text = formatTextReport(report);
  const markdown = formatMarkdownReport(report);

  assert.match(text, /Hero IFRA Source Gap Report/);
  assert.match(text, /High-priority source gaps: 37/);
  assert.match(markdown, /^# Hero IFRA Source Gap Report/);
  assert.match(markdown, /\| Priority \| Formula material \| Source identity \| Dilution \|/);
  assert.match(markdown, /Natural\/UVCB supplier docs needed/);
  assert.match(markdown, /Specialty supplier document needed/);
});

test("hero IFRA source gap report separates diluted stock display names from source identity search", () => {
  const report = buildHeroIfraSourceGapReport({
    generatedAt: "2026-06-09T00:00:00.000Z",
  });

  const calone = findMaterial(report, "Calone 1951 20%");
  assert.equal(calone.formulaMaterialName, "Calone 1951 20%");
  assert.equal(calone.sourceIdentityName, "Calone 1951");
  assert.equal(calone.activeMaterialName, "Calone 1951");
  assert.equal(calone.dilutionLabel, "20%");
  assert.ok(calone.candidateSearchTerms.includes("Calone 1951"));
  assert.ok(calone.candidateSearchTerms.includes("Calone"));
  assert.equal(
    calone.candidateSearchTerms.some((term) => /20%|TEC|dilution|stock/i.test(term)),
    false
  );

  const geosmin = findMaterial(report, "Geosmin 1% TEC");
  assert.equal(geosmin.sourceIdentityName, "Geosmin");
  assert.equal(geosmin.dilutionLabel, "1% TEC");
  assert.equal(geosmin.carrierLabel, "TEC");
  assert.equal(
    geosmin.candidateSearchTerms.some((term) => /1%|TEC/i.test(term)),
    false
  );
});

test("ingredient reference CSV enriches confirmed active hero material matches", () => {
  const report = buildHeroIfraSourceGapReport({
    generatedAt: "2026-06-09T00:00:00.000Z",
    ingredientReferencePath: INGREDIENT_REFERENCE_FIXTURE,
  });

  assert.equal(report.metadata.ingredientReference.rowCount, 4);
  assert.equal(report.summary.ingredientReferenceMatchedMaterialCount, 2);
  assert.equal(report.summary.ingredientReferenceAmbiguousMaterialCount, 1);

  const aldehydeC8 = findMaterial(report, "Aldehyde C-8");
  assert.equal(aldehydeC8.referenceMatchConfidence, "confirmed");
  assert.equal(aldehydeC8.referenceIngredient, "Aldehyde C-8");
  assert.equal(aldehydeC8.referenceName, "Octanal");
  assert.equal(aldehydeC8.referenceCas, "124-13-0");
  assert.equal(
    aldehydeC8.referenceSdsLink,
    "https://example.invalid/sds/aldehyde-c8.pdf"
  );
  assert.equal(
    aldehydeC8.referenceProductPage,
    "https://example.invalid/products/aldehyde-c8"
  );
  assert.equal(aldehydeC8.referenceSupplier, "Example Supplier");
  assert.ok(aldehydeC8.candidateSearchTerms.includes("CAS 124-13-0"));
  assert.ok(
    aldehydeC8.notes.includes(
      "SDS/product reference available; IFRA category limit still not structured."
    )
  );
});

test("ingredient reference CSV flags ambiguous matches without treating them as confirmed", () => {
  const report = buildHeroIfraSourceGapReport({
    generatedAt: "2026-06-09T00:00:00.000Z",
    ingredientReferencePath: INGREDIENT_REFERENCE_FIXTURE,
  });

  const oceanol = findMaterial(report, "Oceanol 10%");
  assert.equal(oceanol.referenceMatchConfidence, "ambiguous");
  assert.equal(oceanol.referenceMatchCount, 2);
  assert.equal(Object.hasOwn(oceanol, "referenceSdsLink"), false);
  assert.ok(
    oceanol.notes.includes(
      "Ingredient reference CSV matched multiple rows; review manually before using any reference link."
    )
  );
});

test("ingredient reference CSV does not create IFRA limits or compliance status", () => {
  const report = buildHeroIfraSourceGapReport({
    generatedAt: "2026-06-09T00:00:00.000Z",
    ingredientReferencePath: INGREDIENT_REFERENCE_FIXTURE,
  });

  const aldehydeC8 = findMaterial(report, "Aldehyde C-8");
  assert.equal(aldehydeC8.currentIfraCategory, "sourceUnavailable");
  assert.equal(aldehydeC8.requiredSourceType, "global_ifra_standard_needed");
  assert.equal(aldehydeC8.safeToMapNow, false);
  assert.equal(
    Object.hasOwn(aldehydeC8, "limits") ||
      Object.hasOwn(aldehydeC8, "categoryLimits") ||
      Object.hasOwn(aldehydeC8, "limitSummary"),
    false
  );

  const bergamotFcf = findMaterial(report, "Bergamot EO FCF");
  assert.equal(bergamotFcf.currentIfraCategory, "fcfSpecialCase");
  assert.equal(bergamotFcf.requiredSourceType, "fcf_special_case");
  assert.equal(bergamotFcf.safeToMapNow, false);
});

test("markdown output includes ingredient reference links when CSV is supplied", () => {
  const report = buildHeroIfraSourceGapReport({
    generatedAt: "2026-06-09T00:00:00.000Z",
    ingredientReferencePath: INGREDIENT_REFERENCE_FIXTURE,
  });
  const markdown = formatMarkdownReport(report);

  assert.match(markdown, /## Known Reference Links/);
  assert.match(markdown, /https:\/\/example\.invalid\/sds\/aldehyde-c8\.pdf/);
  assert.match(markdown, /Identity\/source-acquisition aids only|identity\/source-acquisition aids only/i);
});
