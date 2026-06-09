import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHeroIfraSourceGapReport,
  extractFormulasInitFromAppSource,
  formatMarkdownReport,
  formatTextReport,
} from "../scripts/report_hero_ifra_source_gaps.mjs";

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
  assert.match(markdown, /\| Priority \| Material \| Current IFRA \|/);
  assert.match(markdown, /Natural\/UVCB supplier docs needed/);
  assert.match(markdown, /Specialty supplier document needed/);
});
