import test from "node:test";
import assert from "node:assert/strict";

import {
  assignDosageBand,
  buildBeachBoxInventoryIndex,
  buildGcmsConstructionPatterns,
  classifyBeachBoxInventoryOverlap,
  formatGcmsConstructionPatternsMarkdown,
  summarizePercentiles,
} from "../scripts/lib/gcms_construction_patterns.mjs";

function buildSyntheticStructuredPayload() {
  return {
    generatedAt: "2026-06-09T00:00:00.000Z",
    reportCount: 3,
    reports: [
      {
        id: "coastal-amber",
        sourceFilename: "Coastal Amber.pdf",
        fragranceName: "Coastal Amber",
        brand: "Fixture",
        detectedMaterials: [
          { name: "Iso E Super", cas: "54464-57-2", percent: 12, ppt: 120 },
          { name: "Hedione", cas: "24851-98-7", percent: 4, ppt: 40 },
          { name: "Ethylene Brassylate", cas: "105-95-3", percent: 1, ppt: 10 },
          { name: "Calone", cas: "", percent: 0.2, ppt: 2 },
          { name: "Unidentified compounds", cas: "N/A", percent: 5, ppt: 50 },
        ],
      },
      {
        id: "driftwood-musk",
        sourceFilename: "Driftwood Musk.pdf",
        fragranceName: "Driftwood Musk",
        brand: "Fixture",
        detectedMaterials: [
          { name: "Iso E Super", cas: "54464-57-2", percent: 6, ppt: 60 },
          { name: "Hedione", cas: "24851-98-7", percent: 2, ppt: 20 },
          { name: "Cashmeran", cas: "33704-61-9", percent: 0.8, ppt: 8 },
          { name: "Linalool", cas: "78-70-6", percent: 0.04, ppt: 0.4 },
        ],
      },
      {
        id: "citrus-floral",
        sourceFilename: "Citrus Floral.pdf",
        fragranceName: "Citrus Floral",
        brand: "Fixture",
        detectedMaterials: [
          { name: "Linalool", cas: "78-70-6", percent: 15, ppt: 150 },
          { name: "Linalyl Acetate", cas: "115-95-7", percent: 6, ppt: 60 },
          { name: "Hedione", cas: "24851-98-7", percent: 0.6, ppt: 6 },
        ],
      },
    ],
  };
}

function buildSyntheticSupportData() {
  return {
    dilutedStocks: [{ name: "Calone 1951 20%", parentName: "Calone 1951" }],
    aliases: [{ name: "Calone", targetName: "Calone 1951" }],
    supportRecords: [{ name: "Hedione", sourceProductTitle: "Hedione" }],
  };
}

function buildSyntheticAccordRecipes() {
  return {
    componentPricingAliases: [],
    recipes: [
      {
        name: "Driftwood Accord",
        components: [{ name: "Iso E Super" }, { name: "Cashmeran" }],
      },
    ],
  };
}

test("GCMS construction helper assigns dosage bands at documented boundaries", () => {
  assert.equal(assignDosageBand(0.05), "trace");
  assert.equal(assignDosageBand(0.1), "support");
  assert.equal(assignDosageBand(0.5), "modifier");
  assert.equal(assignDosageBand(2), "structural");
  assert.equal(assignDosageBand(10), "structural");
  assert.equal(assignDosageBand(10.01), "backbone");
});

test("GCMS construction helper summarizes percentiles without inventing values", () => {
  const summary = summarizePercentiles([12, 6]);
  assert.equal(summary.min, 6);
  assert.equal(summary.p25, 7.5);
  assert.equal(summary.median, 9);
  assert.equal(summary.p75, 10.5);
  assert.equal(summary.max, 12);
  assert.equal(summary.mean, 9);
});

test("GCMS construction inventory overlap separates support, accord, and missing materials", () => {
  const index = buildBeachBoxInventoryIndex({
    supportData: buildSyntheticSupportData(),
    accordRecipes: buildSyntheticAccordRecipes(),
  });

  assert.equal(
    classifyBeachBoxInventoryOverlap("Hedione", index).status,
    "in Beach Box inventory/support"
  );
  assert.equal(
    classifyBeachBoxInventoryOverlap("Iso E Super", index).status,
    "in accord component"
  );
  assert.equal(
    classifyBeachBoxInventoryOverlap("Linalool", index).status,
    "missing from inventory"
  );
  assert.equal(
    classifyBeachBoxInventoryOverlap("Calone", index).status,
    "in Beach Box inventory/support"
  );
});

test("GCMS construction patterns count frequency, high-dose rows, co-occurrences, and avoid mutation", () => {
  const structuredPayload = buildSyntheticStructuredPayload();
  const before = JSON.stringify(structuredPayload);
  const report = buildGcmsConstructionPatterns({
    structuredPayload,
    supportData: buildSyntheticSupportData(),
    accordRecipes: buildSyntheticAccordRecipes(),
    generatedAt: "2026-06-09T00:00:00.000Z",
  });

  assert.equal(JSON.stringify(structuredPayload), before);
  assert.equal(report.reportCount, 3);
  assert.equal(report.trueComponentRowCount, 12);
  assert.equal(report.identifiedComponentRowCount, 11);

  const iso = report.universalStructuralMaterials.find(
    (material) => material.name === "Iso E Super"
  );
  assert.equal(iso.reportFrequency, 2);
  assert.equal(iso.medianPercent, 9);
  assert.equal(iso.highDoseCounts[">5%"], 2);
  assert.equal(iso.highDoseCounts[">10%"], 1);
  assert.equal(iso.inventoryOverlap.status, "in accord component");

  const aboveFive = report.highDoseArchitectureMaterials.thresholds[">5%"].map(
    (material) => material.name
  );
  assert.ok(aboveFive.includes("Iso E Super"));
  assert.ok(aboveFive.includes("Linalool"));

  const isoHedionePair = report.coOccurrencePatterns.find((pair) =>
    pair.materials.includes("Iso E Super") && pair.materials.includes("Hedione")
  );
  assert.equal(isoHedionePair.reportFrequency, 2);
  assert.ok(
    report.featuredCoOccurrencePatterns.some(
      (pair) => pair.materials.includes("Iso E Super") && pair.materials.includes("Hedione")
    )
  );

  assert.ok(
    report.accordSkeletons.some(
      (skeleton) => skeleton.id === "marine_mineral" && skeleton.matchedReportCount >= 1
    )
  );
});

test("GCMS construction output uses only observed material names in material/pair sections", () => {
  const structuredPayload = buildSyntheticStructuredPayload();
  const observedNames = new Set(
    structuredPayload.reports.flatMap((report) =>
      report.detectedMaterials
        .filter((material) => !/unidentified/i.test(material.name))
        .map((material) => material.name)
    )
  );
  const report = buildGcmsConstructionPatterns({
    structuredPayload,
    supportData: buildSyntheticSupportData(),
    accordRecipes: buildSyntheticAccordRecipes(),
  });

  for (const material of report.universalStructuralMaterials) {
    assert.equal(observedNames.has(material.name), true);
  }
  for (const thresholdRows of Object.values(report.highDoseArchitectureMaterials.thresholds)) {
    for (const material of thresholdRows) {
      assert.equal(observedNames.has(material.name), true);
    }
  }
  for (const pair of report.coOccurrencePatterns) {
    for (const materialName of pair.materials) {
      assert.equal(observedNames.has(materialName), true);
    }
  }
});

test("GCMS construction markdown documents limitations and Beach Box translation", () => {
  const report = buildGcmsConstructionPatterns({
    structuredPayload: buildSyntheticStructuredPayload(),
    supportData: buildSyntheticSupportData(),
    accordRecipes: buildSyntheticAccordRecipes(),
  });
  const markdown = formatGcmsConstructionPatternsMarkdown(report);

  assert.match(markdown, /GCMS Construction Patterns/);
  assert.match(markdown, /Universal Structural Materials/);
  assert.match(markdown, /Material Co-Occurrence Patterns/);
  assert.match(markdown, /Beach Box Inventory Overlap/);
  assert.match(markdown, /not a formula reconstruction tool/i);
});
