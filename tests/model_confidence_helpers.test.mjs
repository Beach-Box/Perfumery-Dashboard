import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFormulaConfidenceSummary,
  buildIfraCoverageEstimate,
  buildMaterialConfidenceCaveats,
  classifyOdorThreshold,
  classifyVaporPressure,
  getFormulaConfidenceBadges,
  hasMissingPricingRisk,
  isBlackBoxAccordRecord,
  isParentInheritedDilutionRecord,
} from "../src/lib/model_confidence_helpers.js";

test("odor-threshold classifier separates source-backed, legacy, and missing ODT", () => {
  assert.equal(
    classifyOdorThreshold({
      ODT: 0.17,
      VP: 1.18,
      odorThresholdSource: {
        source: "EPA HERO",
        unit: "ppbv air",
      },
    }).status,
    "source_backed"
  );

  const legacy = classifyOdorThreshold({
    ODT: 0.00001,
    VP: 0.001,
    descriptorTags: ["Legacy ODT Caveat"],
  });
  assert.equal(legacy.status, "legacy");
  assert.equal(legacy.category, "legacy");

  const missing = classifyOdorThreshold({
    ODT: null,
    VP: 0.000051,
  });
  assert.equal(missing.status, "missing");
  assert.equal(missing.category, "missing_threshold");
});

test("vapor-pressure classifier distinguishes provenance from legacy values", () => {
  assert.equal(
    classifyVaporPressure({
      VP: 0.000051,
      vpConfidence: "iff_compendium_23c",
    }).status,
    "source_backed"
  );
  assert.equal(
    classifyVaporPressure({
      VP: 0.000051,
    }).status,
    "unprovenanced"
  );
  assert.equal(
    classifyVaporPressure({
      VP: null,
    }).status,
    "unsupported"
  );
});

test("dilution, black-box accord, and proxy records produce distinct caveats", () => {
  assert.equal(
    isParentInheritedDilutionRecord(
      {
        supplier: "Hero Formula Support",
        scentClass: "Diluted Stock",
        rep: "Oceanol",
        dilutionFactor: 0.1,
      },
      "Oceanol 10%"
    ),
    true
  );

  const accordRecord = {
    type: "ACCORD",
    supplier: "Bench Accord",
    isUVCB: true,
    descriptorTags: ["Hero Formula", "Accord"],
  };
  assert.equal(isBlackBoxAccordRecord(accordRecord), true);
  assert.equal(
    hasMissingPricingRisk({
      record: accordRecord,
      basketLine: {
        supplier: "Bench Accord",
        lineCost: 0,
        status: "confirmed",
      },
    }),
    true
  );

  const caveats = buildMaterialConfidenceCaveats("Seaweed Absolute", {
    record: {
      type: "ABS",
      isUVCB: true,
      VP: 0.02,
      ODT: 0.1,
      descriptorTags: ["Marine", "Natural / Absolute", "Mixture Proxy Caveat"],
    },
    basketLine: {
      status: "confirmed",
      lineCost: 1,
      mappingConfidence: "confirmed",
    },
  });
  assert.ok(caveats.some((caveat) => caveat.category === "proxy_or_uvcb"));
  assert.ok(caveats.some((caveat) => caveat.category === "legacy"));
});

test("formula confidence summary aggregates visible badges without fake certainty", () => {
  const summary = buildFormulaConfidenceSummary(
    [
      { name: "Aldehyde C-8", g: 0.03 },
      { name: "Oceanol 10%", g: 0.4 },
      { name: "Driftwood Accord", g: 0.6 },
    ],
    {
      db: {
        "Aldehyde C-8": {
          VP: 1.18,
          ODT: 0.17,
          odorThresholdSource: { source: "EPA HERO" },
          vpConfidence: "tgsc_epi_exp_25c",
        },
        "Oceanol 10%": {
          VP: 0.000051,
          ODT: null,
          vpConfidence: "iff_compendium_23c",
          dilutionFactor: 0.1,
          supplier: "Hero Formula Support",
          scentClass: "Diluted Stock",
          rep: "Oceanol",
        },
        "Driftwood Accord": {
          type: "ACCORD",
          supplier: "Bench Accord",
          isUVCB: true,
          descriptorTags: ["Accord"],
        },
      },
      basket: {
        lines: [
          { ingredientName: "Aldehyde C-8", lineCost: 1, status: "confirmed" },
          { ingredientName: "Oceanol 10%", lineCost: 2, status: "confirmed" },
          {
            ingredientName: "Driftwood Accord",
            lineCost: 0,
            status: "confirmed",
            supplier: "Bench Accord",
          },
        ],
      },
      finishedProductGuidance: {
        rows: [
          { name: "Aldehyde C-8", dataState: "confirmed", status: "ok" },
          { name: "Oceanol 10%", dataState: "confirmed", status: "ok" },
          { name: "Driftwood Accord", dataState: "missing", status: "blocked" },
        ],
      },
    }
  );

  assert.equal(summary.sourceBackedOdtCount, 1);
  assert.equal(summary.missingThresholdCount, 1);
  assert.equal(summary.categoryCounts.parent_inherited, 1);
  assert.equal(summary.categoryCounts.black_box_accord, 1);
  assert.equal(summary.categoryCounts.missing_pricing, 1);
  assert.equal(summary.categoryCounts.missing_ifra, 1);

  const badgeLabels = getFormulaConfidenceBadges(summary).map((badge) => badge.label);
  assert.ok(badgeLabels.includes("Model estimate"));
  assert.ok(badgeLabels.some((label) => label.includes("Black-box accord")));
  assert.ok(badgeLabels.some((label) => label.includes("Missing threshold")));
});

test("IFRA coverage estimate does not treat no restricted rows as fully safe", () => {
  assert.equal(
    buildIfraCoverageEstimate({
      ifraRows: [],
      finishedProductGuidance: { overallStatus: "no_restricted_rows" },
    }).score < 10,
    true
  );
  assert.equal(
    buildIfraCoverageEstimate({
      ifraRows: [],
      finishedProductGuidance: {
        overallStatus: "appears_compliant_with_missing",
      },
    }).score < 10,
    true
  );
  assert.equal(
    buildIfraCoverageEstimate({
      ifraRows: [{ name: "A", status: "ok" }],
      finishedProductGuidance: { overallStatus: "appears_compliant" },
    }).score,
    10
  );
});
