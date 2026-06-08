import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  HERO_FORMULA_ACCORD_RECIPES,
  HERO_FORMULA_MATERIAL_SUPPORT,
  HERO_FORMULA_RAW_DB_FIELDS,
  buildHeroFormulaMaterialNormalizationEntries,
  buildHeroFormulaPricingSupportRows,
  buildHeroFormulaRawDbSupportRows,
  createHeroSupportRecordPricing,
  getHeroFormulaAccordRecipe,
} from "../src/lib/hero_formula_material_support.js";
import { buildSupplierBasket } from "../src/lib/perfumer_runtime_helpers.js";
import {
  MATERIAL_NORMALIZATION,
  computeActiveRestrictedPercent,
  resolveIngredientIdentity,
} from "../src/lib/ifra_combined_package.js";

function rawDbRow(overrides = {}) {
  return HERO_FORMULA_RAW_DB_FIELDS.map((field) => overrides[field] ?? null);
}

function rawDbRecordFromRow(row = []) {
  return Object.fromEntries(
    HERO_FORMULA_RAW_DB_FIELDS.map((field, index) => [field, row[index]])
  );
}

function extractAppArrayConstant(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${marker} should exist`);
  const arrayStart = source.indexOf("[", start);
  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let i = arrayStart; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) inString = false;
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === "[") depth += 1;
    if (ch === "]") {
      depth -= 1;
      if (depth === 0) return Function(`return ${source.slice(arrayStart, i + 1)};`)();
    }
  }
  throw new Error(`${marker} array end was not found`);
}

function extractAppObjectConstant(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${marker} should exist`);
  const objectStart = source.indexOf("{", start);
  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let i = objectStart; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) inString = false;
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return Function(`return (${source.slice(objectStart, i + 1)});`)();
      }
    }
  }
  throw new Error(`${marker} object end was not found`);
}

test("hero formula diluted stocks build exact DB rows and stock-equivalent pricing", () => {
  const rawRows = buildHeroFormulaRawDbSupportRows({
    "Calone 1951": rawDbRow({ note: "top", type: "SYNTH" }),
  });

  assert.equal(rawRows["Calone 1951 20%"][8], "mid");
  assert.equal(rawRows["Calone 1951 20%"][9], "SYNTH");
  assert.equal(rawRows["Calone 1951 20%"][22], 0.2);

  const pricingRows = buildHeroFormulaPricingSupportRows({
    "Calone 1951": {
      TestSupplier: {
        S: [
          [10, "g", 25],
          [5, "mL", 15],
        ],
        inStock: true,
      },
    },
  });

  assert.deepEqual(pricingRows["Calone 1951 20%"].TestSupplier.S, [
    [50, "g", 25],
    [25, "mL", 15],
  ]);
});

test("hero formula diluted stocks inherit parent molecular fields without losing stock behavior", () => {
  const rawRows = buildHeroFormulaRawDbSupportRows({
    "Calone 1951": rawDbRow({
      MW: 207.27,
      xLogP: 2.7,
      VP: 0.003,
      ODT: 0.02,
      note: "top",
      type: "SYNTH",
      densityGmL: 1.03,
      odorThreshold_ngL: 0.02,
      vpConfidence: "source_backed_parent",
      isUVCB: false,
      isIsomerMix: true,
    }),
  });

  const stockRow = rawRows["Calone 1951 20%"];

  assert.equal(stockRow[0], 207.27);
  assert.equal(stockRow[1], 2.7);
  assert.equal(stockRow[5], 0.003);
  assert.equal(stockRow[6], 0.02);
  assert.equal(stockRow[14], 1.03);
  assert.equal(stockRow[22], 0.2);
  assert.equal(stockRow[23], false);
  assert.equal(stockRow[25], 0.02);
  assert.equal(stockRow[26], "source_backed_parent");
  assert.equal(stockRow[27], true);

  assert.equal(stockRow[8], "mid");
  assert.equal(stockRow[9], "SYNTH");
  assert.equal(stockRow[11], "Hero Formula Support");
  assert.equal(stockRow[13], "Calone 1951");
  assert.equal(stockRow[17], "Diluted Stock");
});

test("hero formula diluted stocks inherit only fields that exist on partial parents", () => {
  const rawRows = buildHeroFormulaRawDbSupportRows({
    Oceanol: rawDbRow({
      xLogP: 1.24,
      note: "mid",
      type: "SYNTH",
    }),
  });

  const stockRow = rawRows["Oceanol 10%"];

  assert.equal(stockRow[0], null);
  assert.equal(stockRow[1], 1.24);
  assert.equal(stockRow[5], null);
  assert.equal(stockRow[6], null);
  assert.equal(stockRow[22], 0.1);
});

test("hero formula diluted stock normalization documents parent-derived molecular support", () => {
  assert.equal(
    MATERIAL_NORMALIZATION["Calone 1951 20%"].molecularSource,
    "parent_inherited"
  );
  assert.equal(
    MATERIAL_NORMALIZATION["Calone 1951 20%"].molecularParentName,
    "Calone 1951"
  );
  assert.equal(
    MATERIAL_NORMALIZATION["Calone 1951 20%"].molecularInheritanceConfidence,
    "parent_material"
  );
  assert.equal(
    MATERIAL_NORMALIZATION["Seaweed Absolute 10%"]
      .molecularInheritanceConfidence,
    "parent_proxy_mixture"
  );
});

test("hero formula support creates alias rows and component-costed accord records", () => {
  const florolTargetRow = rawDbRow({
    note: "mid",
    type: "SYNTH",
    supplier: "Fraterworks",
    scentSummary: "Trademarked Florol row.",
  });
  const rawRows = buildHeroFormulaRawDbSupportRows({
    "Florol®": florolTargetRow,
  });

  assert.deepEqual(rawRows.Florol, florolTargetRow);
  assert.equal(rawRows["Botanical Musk Accord"][9], "ACCORD");
  assert.equal(rawRows["Botanical Musk Accord"][23], true);
  assert.equal(rawRows["Botanical Musk Accord"][0], null);
  assert.equal(rawRows["Botanical Musk Accord"][1], null);
  assert.equal(rawRows["Botanical Musk Accord"][5], null);
  assert.equal(rawRows["Botanical Musk Accord"][25], null);
  assert.ok(rawRows["Botanical Musk Accord"][24].includes("Component Costed Accord"));

  const pricingRows = buildHeroFormulaPricingSupportRows({
    "Iso E Super": { TestSupplier: { S: [[10, "g", 10]], inStock: true } },
    "Ambroxan Crystals": {
      TestSupplier: { S: [[10, "g", 20]], inStock: true },
    },
    "Vetiveryl Acetate": {
      TestSupplier: { S: [[10, "g", 30]], inStock: true },
    },
    Cashmeran: { TestSupplier: { S: [[10, "g", 40]], inStock: true } },
  });
  const driftwoodPricing = pricingRows["Driftwood Accord"]["Bench Accord"];
  assert.equal(driftwoodPricing.pricingMode, "unit_cost");
  assert.equal(driftwoodPricing.componentPricingStatus, "complete");
  assert.equal(driftwoodPricing.unitCostPerG, 1.5386);
  assert.deepEqual(driftwoodPricing.S[0], [1, "g", 1.5386]);
});

test("hero formula support resolves confirmed aliases to existing catalog rows", () => {
  const targetRows = {
    "Hedione® High Cis": rawDbRow({ note: "mid", supplier: "Fraterworks" }),
    "Vetiveryl Acetate 20326": rawDbRow({
      note: "base",
      supplier: "Fraterworks",
    }),
    "Gamma Nonalactone": rawDbRow({ note: "mid", supplier: "Fraterworks" }),
    "Lemon “Superior” Oil, FCF": rawDbRow({
      note: "top",
      supplier: "Fraterworks",
    }),
  };
  const rawRows = buildHeroFormulaRawDbSupportRows(targetRows);

  assert.deepEqual(rawRows["Hedione HC"], targetRows["Hedione® High Cis"]);
  assert.deepEqual(
    rawRows["Vetiveryl Acetate"],
    targetRows["Vetiveryl Acetate 20326"]
  );
  assert.deepEqual(rawRows["Aldehyde C-18"], targetRows["Gamma Nonalactone"]);
  assert.deepEqual(
    rawRows["Lemon FCF"],
    targetRows["Lemon “Superior” Oil, FCF"]
  );

  const pricingRows = buildHeroFormulaPricingSupportRows({
    "Lemon “Superior” Oil, FCF": {
      Fraterworks: { S: [[4, "g", 4.72]], inStock: true },
    },
  });
  assert.deepEqual(pricingRows["Lemon FCF"].Fraterworks.S, [[4, "g", 4.72]]);

  assert.equal(
    MATERIAL_NORMALIZATION["Hedione HC"].linkedDuplicateOfCatalogName,
    "Hedione® High Cis"
  );
  assert.equal(
    MATERIAL_NORMALIZATION["Vetiveryl Acetate"].linkedDuplicateOfCatalogName,
    "Vetiveryl Acetate 20326"
  );
  assert.equal(
    MATERIAL_NORMALIZATION["Aldehyde C-18"].linkedDuplicateOfCatalogName,
    "Gamma Nonalactone"
  );
  assert.equal(
    MATERIAL_NORMALIZATION["Lemon FCF"].linkedDuplicateOfCatalogName,
    "Lemon “Superior” Oil, FCF"
  );

  const aldehydeResolved = resolveIngredientIdentity("Aldehyde C-18");
  assert.equal(aldehydeResolved.inheritedFromCatalogName, "Gamma Nonalactone");
  assert.equal(aldehydeResolved.sourceCatalogName, "Aldehyde C-18");
});

test("hero formula accord recipe registry preserves supplied recipes and legacy aliases", () => {
  assert.deepEqual(
    HERO_FORMULA_ACCORD_RECIPES.recipes.map((recipe) => recipe.name),
    [
      "Botanical Musk Accord",
      "Driftwood Accord",
      "Driftwood Accord v2",
      "Iso E + AmberXtreme 1%",
    ]
  );

  const botanicalRecipe = getHeroFormulaAccordRecipe("Botanical Musk Accord");
  assert.equal(botanicalRecipe.totalAmount, 30.001);
  assert.equal(botanicalRecipe.components[0].name, "Ethylene Brassylate");
  assert.equal(botanicalRecipe.components[1].name, "Exaltolide");
  assert.equal(botanicalRecipe.components[1].dilution, "50% TEC");

  const driftwoodLegacyRecipe = getHeroFormulaAccordRecipe(
    "Driftwood Accord v2.2 NT"
  );
  assert.equal(driftwoodLegacyRecipe.name, "Driftwood Accord v2");
});

test("hero formula accord pricing marks incomplete component costs instead of free rows", () => {
  const pricingRows = buildHeroFormulaPricingSupportRows({
    "Iso E Super": { TestSupplier: { S: [[10, "g", 10]], inStock: true } },
  });
  const driftwoodPricing = pricingRows["Driftwood Accord"]["Bench Accord"];

  assert.equal(driftwoodPricing.componentPricingStatus, "incomplete");
  assert.deepEqual(driftwoodPricing.S, []);
  assert.ok(driftwoodPricing.missingComponents.includes("Ambroxan 50% TEC"));
  assert.notEqual(driftwoodPricing.supportNote.includes("$0"), true);
});

test("hero formula accord rows stay single rows but basket cost is component-derived", () => {
  const pricingRows = buildHeroFormulaPricingSupportRows({
    "Iso E Super": { TestSupplier: { S: [[10, "g", 10]], inStock: true } },
    "Ambroxan Crystals": {
      TestSupplier: { S: [[10, "g", 20]], inStock: true },
    },
    "Vetiveryl Acetate": {
      TestSupplier: { S: [[10, "g", 30]], inStock: true },
    },
    Cashmeran: { TestSupplier: { S: [[10, "g", 40]], inStock: true } },
  });

  const basket = buildSupplierBasket(
    [{ name: "Driftwood Accord", g: 1.5, note: "base" }],
    {},
    {},
    "cheapest",
    { pricing: pricingRows }
  );
  const line = basket.lines[0];

  assert.equal(line.ingredientName, "Driftwood Accord");
  assert.equal(line.supplier, "Bench Accord");
  assert.equal(line.status, "inferred");
  assert.equal(line.line.pricingMode, "unit_cost");
  assert.equal(Number(line.lineCost.toFixed(4)), 2.3079);
  assert.equal(basket.totalCost > 0, true);
  assert.equal(basket.missingCount, 0);
});

test("hero formula normalization overlay supports diluted identity and aliases", () => {
  assert.equal(
    MATERIAL_NORMALIZATION["Ambroxan 50% TEC"].entryKind,
    "diluted_stock"
  );
  assert.equal(
    MATERIAL_NORMALIZATION["Seaweed Abs 10%"].linkedDuplicateOfCatalogName,
    "Seaweed Absolute 10%"
  );
  assert.equal(MATERIAL_NORMALIZATION.Florol.linkedDuplicateOfCatalogName, "Florol®");
  assert.equal(MATERIAL_NORMALIZATION["Botanical Musk Accord"].entryKind, "accord");
  assert.equal(MATERIAL_NORMALIZATION["Driftwood Accord v2"].entryKind, "accord");
  assert.equal(
    MATERIAL_NORMALIZATION["Driftwood Accord v2.2 NT"].linkedDuplicateOfCatalogName,
    "Driftwood Accord v2"
  );
  assert.equal(
    MATERIAL_NORMALIZATION["Driftwood Accord v2.2 NT"].entryKind,
    "accord"
  );

  const resolved = resolveIngredientIdentity("Ambroxan 50% TEC");
  assert.equal(resolved.materialClass, "diluted_stock");
  assert.equal(resolved.stock.activeMaterialName, "Ambroxan Crystals");
  assert.equal(resolved.stock.activePercent, 50);
  assert.equal(
    computeActiveRestrictedPercent({
      formulaPercent: 8,
      ingredientName: "Ambroxan 50% TEC",
    }),
    4
  );
  assert.equal(
    computeActiveRestrictedPercent({
      formulaPercent: 8,
      ingredientName: "Cetalox 50% TEC",
    }),
    4
  );
});

test("hero formula support maps Ylang Ylang shorthand as a 10% complete-oil stock", () => {
  assert.equal(
    MATERIAL_NORMALIZATION["Ylang Ylang 10%"].entryKind,
    "diluted_stock"
  );
  assert.equal(
    MATERIAL_NORMALIZATION["Ylang Ylang 10%"].linkedDuplicateOfCatalogName,
    "Ylang-Ylang Complete Oil"
  );
  assert.equal(
    MATERIAL_NORMALIZATION["Ylang Ylang 10%"].stock.activeMaterialName,
    "Ylang-Ylang Complete Oil"
  );
  assert.equal(
    MATERIAL_NORMALIZATION["Ylang Ylang 10%"].stock.activePercent,
    10
  );
  assert.equal(
    computeActiveRestrictedPercent({
      formulaPercent: 8,
      ingredientName: "Ylang Ylang 10%",
    }),
    0.8
  );

  const pricingRows = buildHeroFormulaPricingSupportRows({
    "Ylang-Ylang Complete Oil": {
      Fraterworks: {
        S: [[10, "g", 20]],
        inStock: true,
      },
    },
  });
  assert.deepEqual(pricingRows["Ylang Ylang 10%"].Fraterworks.S, [
    [100, "g", 20],
  ]);
});

test("hero formula support creates reviewed PA price rows for source-backed materials", () => {
  const rawRows = buildHeroFormulaRawDbSupportRows({});

  assert.equal(rawRows.Algenone[0], null);
  assert.equal(rawRows.Algenone[5], null);
  assert.equal(rawRows.Algenone[25], null);
  assert.equal(rawRows.Algenone[8], "mid");
  assert.equal(rawRows.Algenone[11], "Perfumers Apprentice");
  assert.equal(rawRows.Algenone[15], "Mixture");
  assert.equal(rawRows.Algenone[17], "Marine");
  assert.equal(rawRows.Cyclogalbanate[0], null);
  assert.equal(rawRows.Cyclogalbanate[5], null);
  assert.equal(rawRows.Cyclogalbanate[25], null);
  assert.equal(rawRows.Cyclogalbanate[8], "mid");
  assert.equal(rawRows.Cyclogalbanate[11], "Perfumers Apprentice");
  assert.equal(rawRows.Cyclogalbanate[15], "68901-15-5");
  assert.equal(rawRows.Cyclogalbanate[17], "Green");

  const pricingRows = buildHeroFormulaPricingSupportRows({});
  assert.deepEqual(pricingRows.Algenone["Perfumers Apprentice"].S, [
    [4, "ml", 7.5],
    [15, "ml", 18.75],
    [50, "g", 31],
    [250, "g", 131],
    [500, "g", 209.5],
  ]);
  assert.deepEqual(pricingRows.Cyclogalbanate["Perfumers Apprentice"].S, [
    [4, "ml", 6.5],
    [15, "ml", 12.5],
    [50, "g", 21.75],
  ]);

  assert.equal(
    MATERIAL_NORMALIZATION.Algenone.entryKind,
    "canonical_material"
  );
  assert.equal(
    MATERIAL_NORMALIZATION.Algenone.canonicalMaterialKey,
    "pa_algenone_synarome"
  );
  assert.equal(
    MATERIAL_NORMALIZATION.Cyclogalbanate.canonicalMaterialKey,
    "pa_cyclogalbanate_glycoflor"
  );
  assert.equal(
    MATERIAL_NORMALIZATION.Algenone.reviewState,
    "source_backed_supplier_product"
  );
});

test("hero formula support creates source-backed PA support records with reviewed pricing", () => {
  const rawRows = buildHeroFormulaRawDbSupportRows({});

  assert.equal(rawRows.Cypriol[0], null);
  assert.equal(rawRows.Cypriol[5], null);
  assert.equal(rawRows.Cypriol[25], null);
  assert.equal(rawRows.Cypriol[8], "base");
  assert.equal(rawRows.Cypriol[9], "EO");
  assert.equal(rawRows.Cypriol[11], "Perfumers Apprentice");
  assert.equal(rawRows.Cypriol[15], "91771-62-9");
  assert.equal(rawRows.Cypriol[16], "Cyperus Scariosus Root Oil");
  assert.equal(rawRows.Cypriol[17], "Woody");

  assert.equal(rawRows["Pink Peppercorn Oil P&N"][0], null);
  assert.equal(rawRows["Pink Peppercorn Oil P&N"][5], null);
  assert.equal(rawRows["Pink Peppercorn Oil P&N"][25], null);
  assert.equal(rawRows["Pink Peppercorn Oil P&N"][8], "top");
  assert.equal(rawRows["Pink Peppercorn Oil P&N"][9], "EO");
  assert.equal(
    rawRows["Pink Peppercorn Oil P&N"][11],
    "Perfumers Apprentice"
  );
  assert.equal(rawRows["Pink Peppercorn Oil P&N"][15], "68917-52-2");
  assert.equal(rawRows["Pink Peppercorn Oil P&N"][16], "Schinus molle oil");
  assert.equal(rawRows["Pink Peppercorn Oil P&N"][17], "Spicy");

  const pricingRows = buildHeroFormulaPricingSupportRows({});
  assert.deepEqual(pricingRows.Cypriol["Perfumers Apprentice"].S, [
    [4, "ml", 11.75],
    [15, "ml", 28.75],
    [50, "g", 47.75],
    [250, "g", 219],
    [500, "g", 379],
  ]);
  assert.deepEqual(
    pricingRows["Pink Peppercorn Oil P&N"]["Perfumers Apprentice"].S,
    [
      [4, "ml", 8],
      [15, "ml", 24],
      [50, "g", 37],
      [250, "g", 157],
    ]
  );

  const cypriolSupplier =
    MATERIAL_NORMALIZATION.Cypriol.supplierLinks["Perfumers Apprentice"];
  assert.equal(
    cypriolSupplier.url,
    "https://shop.perfumersapprentice.com/p-10991-cypriol-essential-oil.aspx"
  );
  assert.equal(cypriolSupplier.productTitle, "Cypriol Essential Oil");
  assert.equal(
    MATERIAL_NORMALIZATION.Cypriol.reviewState,
    "source_backed_supplier_product"
  );

  const pinkPepperSupplier =
    MATERIAL_NORMALIZATION["Pink Peppercorn Oil P&N"].supplierLinks[
      "Perfumers Apprentice"
    ];
  assert.equal(
    pinkPepperSupplier.url,
    "https://shop.perfumersapprentice.com/p-8016-pink-peppercorn-oil-pn.aspx"
  );
  assert.equal(pinkPepperSupplier.productTitle, "Pink Peppercorn Oil P&N **");
  assert.equal(
    MATERIAL_NORMALIZATION["Pink Peppercorn Oil P&N"].reviewState,
    "source_backed_supplier_product"
  );
});

test("source-backed support records without price tiers remain missing instead of free", () => {
  const pricing = createHeroSupportRecordPricing({
    name: "Unpriced PA Material",
    supplierName: "Perfumers Apprentice",
    sourceUrl: "https://shop.perfumersapprentice.com/example.aspx",
    sourceProductTitle: "Unpriced PA Material",
  });

  assert.deepEqual(pricing["Perfumers Apprentice"].S, []);
  assert.equal(pricing["Perfumers Apprentice"].inStock, false);
  assert.equal(
    pricing["Perfumers Apprentice"].priceReviewStatus,
    "current_price_needed"
  );

  const basket = buildSupplierBasket(
    [{ name: "Unpriced PA Material", g: 0.1, note: "mid" }],
    {},
    {},
    "cheapest",
    { pricing: { "Unpriced PA Material": pricing } }
  );

  assert.equal(basket.lines[0].status, "missing");
  assert.equal(basket.lines[0].lineCost, null);
  assert.equal(basket.totalCost, 0);
  assert.equal(basket.missingCount, 1);
});

test("remaining non-accord hero pricing gaps no longer count as zero-cost lines", () => {
  const pricingRows = buildHeroFormulaPricingSupportRows({});
  const basket = buildSupplierBasket(
    [
      { name: "Algenone", g: 0.18, note: "mid" },
      { name: "Cyclogalbanate", g: 0.04, note: "mid" },
      { name: "Cypriol", g: 0.06, note: "base" },
      { name: "Pink Peppercorn Oil P&N", g: 0.05, note: "top" },
    ],
    {},
    {},
    "cheapest",
    { pricing: pricingRows }
  );

  assert.equal(basket.missingCount, 0);
  assert.equal(basket.lines.every((line) => line.lineCost > 0), true);
  assert.equal(
    basket.lines.every((line) => line.supplier === "Perfumers Apprentice"),
    true
  );
});

test("priority hero materials expose reviewed molecular fields", () => {
  const source = fs.readFileSync("src/App.jsx", "utf8");
  const rawDb = extractAppObjectConstant(source, "const RAW_DB = {");
  const expectedRecords = {
    Oceanol: {
      MW: 182,
      xLogP: 2.97,
      VP: 0.000051,
      densityGmL: 0,
      vpConfidence: "iff_compendium_23c",
      descriptorTags: ["Marine", "Ozonic", "High Impact Marine", "Low VP Caveat"],
    },
    "Phenyl Ethyl Acetate": {
      MW: 164.2,
      xLogP: 2.3,
      VP: 0.056,
      densityGmL: 1.032,
      vpConfidence: "tgsc_est_25c",
    },
    "Allyl Amyl Glycolate": {
      MW: 186.25,
      xLogP: 2.3,
      VP: 0.04,
      densityGmL: 0,
      vpConfidence: "tgsc_est_25c",
    },
    "Cyclamen Aldehyde": {
      MW: 190.28,
      xLogP: 3.3,
      VP: 0.009,
      densityGmL: 0,
      vpConfidence: "tgsc_est_25c",
    },
    "Aldehyde C-8": {
      MW: 128.21,
      xLogP: 2.7,
      VP: 1.18,
      densityGmL: 0,
      vpConfidence: "tgsc_epi_exp_25c",
      descriptorTags: ["Aldehydic", "High Impact Aldehydic"],
    },
  };
  const expectedOdtByName = {
    "Aldehyde C-8": {
      ODT: 0.17,
      odorThresholdSource: {
        source: "EPA HERO 1454083 / Cometto-Muniz and Abraham 2010",
        url: "https://hero.epa.gov/reference/1454083/",
        sourceValue: 0.17,
        sourceUnit: "ppb air",
        value: 0.17,
        unit: "ppbv air",
        medium: "air/vapor",
        method:
          "3-alternative forced-choice vapor detection against carbon-filtered air.",
        confidence: "reviewed_source_backed",
      },
    },
  };

  for (const [name, expected] of Object.entries(expectedRecords)) {
    assert.equal(rawDb[name].length, HERO_FORMULA_RAW_DB_FIELDS.length);
    const record = rawDbRecordFromRow(rawDb[name]);
    for (const [field, value] of Object.entries(expected)) {
      assert.deepEqual(record[field], value, `${name} ${field}`);
    }
    assert.equal(
      record.ODT,
      expectedOdtByName[name]?.ODT ?? null,
      `${name} ODT`
    );
    assert.equal(
      record.odorThreshold_ngL,
      null,
      `${name} odor threshold should remain unsourced`
    );
    assert.deepEqual(
      record.odorThresholdSource ?? null,
      expectedOdtByName[name]?.odorThresholdSource ?? null,
      `${name} odor threshold source`
    );
  }
});

test("Oceanol diluted stock inherits high-impact caveat metadata without changing dilution behavior", () => {
  const source = fs.readFileSync("src/App.jsx", "utf8");
  const rawDb = extractAppObjectConstant(source, "const RAW_DB = {");
  const supportRows = buildHeroFormulaRawDbSupportRows(rawDb);

  const oceanol = rawDbRecordFromRow(rawDb.Oceanol);
  const oceanolStock = rawDbRecordFromRow(supportRows["Oceanol 10%"]);

  assert.equal(oceanol.VP, 0.000051);
  assert.equal(oceanol.ODT, null);
  assert.deepEqual(oceanol.descriptorTags, [
    "Marine",
    "Ozonic",
    "High Impact Marine",
    "Low VP Caveat",
  ]);
  assert.equal(oceanolStock.VP, 0.000051);
  assert.equal(oceanolStock.ODT, null);
  assert.equal(oceanolStock.dilutionFactor, 0.1);
  assert.deepEqual(oceanolStock.descriptorTags, oceanol.descriptorTags);
  assert.equal(oceanolStock.supplier, "Hero Formula Support");
  assert.equal(oceanolStock.rep, "Oceanol");
});

test("high-impact trace caveats are present and inherited by active diluted stocks", () => {
  const source = fs.readFileSync("src/App.jsx", "utf8");
  const rawDb = extractAppObjectConstant(source, "const RAW_DB = {");
  const supportRows = buildHeroFormulaRawDbSupportRows(rawDb);

  const calone = rawDbRecordFromRow(rawDb["Calone 1951"]);
  const caloneStock = rawDbRecordFromRow(supportRows["Calone 1951 20%"]);
  assert.deepEqual(calone.descriptorTags, [
    "Marine",
    "Ozonic",
    "High Impact Marine",
    "Legacy ODT Caveat",
  ]);
  assert.deepEqual(caloneStock.descriptorTags, calone.descriptorTags);
  assert.equal(caloneStock.dilutionFactor, 0.2);
  assert.equal(caloneStock.VP, calone.VP);
  assert.equal(caloneStock.ODT, calone.ODT);

  const geosmin = rawDbRecordFromRow(rawDb.Geosmin);
  const geosminStock = rawDbRecordFromRow(supportRows["Geosmin 1% TEC"]);
  assert.deepEqual(geosmin.descriptorTags, [
    "Earthy",
    "High Impact Earthy",
    "Legacy ODT Caveat",
  ]);
  assert.deepEqual(geosminStock.descriptorTags, geosmin.descriptorTags);
  assert.equal(geosminStock.dilutionFactor, 0.01);
  assert.equal(geosminStock.VP, geosmin.VP);
  assert.equal(geosminStock.ODT, geosmin.ODT);

  const seaweed = rawDbRecordFromRow(rawDb["Seaweed Absolute"]);
  const seaweedStock = rawDbRecordFromRow(supportRows["Seaweed Absolute 10%"]);
  assert.deepEqual(seaweed.descriptorTags, [
    "Marine",
    "Natural / Absolute",
    "Mixture Proxy Caveat",
  ]);
  assert.deepEqual(seaweedStock.descriptorTags, seaweed.descriptorTags);
  assert.equal(seaweedStock.dilutionFactor, 0.1);
  assert.equal(seaweedStock.VP, seaweed.VP);
  assert.equal(seaweedStock.ODT, seaweed.ODT);

  assert.deepEqual(rawDbRecordFromRow(rawDb.Maritima).descriptorTags, [
    "Marine",
    "High Impact Marine",
    "Low VP Caveat",
  ]);
  assert.deepEqual(rawDbRecordFromRow(rawDb["Aldehyde C-8"]).descriptorTags, [
    "Aldehydic",
    "High Impact Aldehydic",
  ]);
});

test("source-backed ODT metadata is recorded for Aldehyde C-8 and Maritima", () => {
  const source = fs.readFileSync("src/App.jsx", "utf8");
  const rawDb = extractAppObjectConstant(source, "const RAW_DB = {");

  const aldehydeC8 = rawDbRecordFromRow(rawDb["Aldehyde C-8"]);
  assert.equal(aldehydeC8.ODT, 0.17);
  assert.deepEqual(aldehydeC8.odorThresholdSource, {
    source: "EPA HERO 1454083 / Cometto-Muniz and Abraham 2010",
    url: "https://hero.epa.gov/reference/1454083/",
    sourceValue: 0.17,
    sourceUnit: "ppb air",
    value: 0.17,
    unit: "ppbv air",
    medium: "air/vapor",
    method:
      "3-alternative forced-choice vapor detection against carbon-filtered air.",
    confidence: "reviewed_source_backed",
  });

  const maritima = rawDbRecordFromRow(rawDb.Maritima);
  assert.equal(maritima.ODT, 155);
  assert.deepEqual(maritima.odorThresholdSource, {
    source: "Google Patents US20100130624A1",
    url: "https://patents.google.com/patent/US20100130624A1/en",
    sourceValue: 0.155,
    sourceUnit: "ppm air",
    value: 155,
    unit: "ppbv air",
    medium: "air",
    conversion: "0.155 ppm * 1000 = 155 ppbv",
    method:
      "Defined sampling-bag sensory threshold method with about 8 subjects at ambient temperature.",
    confidence: "reviewed_patent_source_medium",
  });
});

test("high-impact trace ODT updates stay scoped to source-backed targets", () => {
  const source = fs.readFileSync("src/App.jsx", "utf8");
  const rawDb = extractAppObjectConstant(source, "const RAW_DB = {");

  assert.equal(rawDbRecordFromRow(rawDb.Oceanol).ODT, null);
  assert.equal(rawDbRecordFromRow(rawDb.Maritima).ODT, 155);
  assert.equal(rawDbRecordFromRow(rawDb["Aldehyde C-8"]).ODT, 0.17);
  assert.equal(rawDbRecordFromRow(rawDb["Calone 1951"]).ODT, 0.00001);
  assert.equal(rawDbRecordFromRow(rawDb.Geosmin).ODT, 0.00001);
  assert.equal(rawDbRecordFromRow(rawDb["Seaweed Absolute"]).ODT, 0.1);
  assert.equal(
    rawDbRecordFromRow(rawDb["Calone 1951"]).odorThresholdSource ?? null,
    null
  );
  assert.equal(rawDbRecordFromRow(rawDb.Geosmin).odorThresholdSource ?? null, null);
});

test("chemistry engine keeps missing ODT from becoming fake odor-value certainty", () => {
  const source = fs.readFileSync("src/App.jsx", "utf8");

  assert.match(source, /const odt = getPositiveChemistryNumber\(d\.ODT\);/);
  assert.match(source, /const OV = odt \? headspace_ppbv \/ odt : 0;/);
  assert.doesNotMatch(source, /const OV = headspace_ppbv \/ d\.ODT;/);
  assert.match(source, /odorValueIsModeled: Boolean\(vp && odt\)/);
});

test("second-tier hero materials expose reviewed molecular fields with scoped threshold claims", () => {
  const source = fs.readFileSync("src/App.jsx", "utf8");
  const rawDb = extractAppObjectConstant(source, "const RAW_DB = {");
  const expectedRecords = {
    Veramoss: {
      MW: 196.1,
      xLogP: 3.6,
      VP: 0.000018,
      densityGmL: 0,
      vpConfidence: "iff_compendium_23c",
    },
    Maritima: {
      MW: 229.36,
      xLogP: 6.4,
      VP: 0.000086,
      densityGmL: 0,
      vpConfidence: "iff_compendium_23c",
    },
    "Ethyl Linalyl Acetate": {
      MW: 210.32,
      xLogP: 3.7,
      VP: 0.026,
      densityGmL: 0,
      vpConfidence: "tgsc_est_25c",
    },
    "Florol®": {
      MW: 173,
      xLogP: 2.22,
      VP: 0.007126,
      densityGmL: 0,
      vpConfidence: "firmenich_spec_pa_to_mmhg_20c",
    },
    Geosmin: {
      MW: 182.31,
      xLogP: 3.3,
      VP: 0.001,
      densityGmL: 0,
      vpConfidence: "tgsc_est_25c",
    },
  };

  for (const [name, expected] of Object.entries(expectedRecords)) {
    assert.equal(rawDb[name].length, HERO_FORMULA_RAW_DB_FIELDS.length);
    const record = rawDbRecordFromRow(rawDb[name]);
    for (const [field, value] of Object.entries(expected)) {
      assert.equal(record[field], value, `${name} ${field}`);
    }
    assert.equal(
      record.odorThreshold_ngL,
      null,
      `${name} odor threshold should remain unset until explicitly sourced`
    );
  }

  assert.equal(rawDbRecordFromRow(rawDb.Veramoss).ODT, 0.01);
  assert.equal(rawDbRecordFromRow(rawDb.Geosmin).ODT, 0.00001);
  assert.equal(rawDbRecordFromRow(rawDb.Maritima).ODT, 155);
  assert.equal(rawDbRecordFromRow(rawDb["Ethyl Linalyl Acetate"]).ODT, null);
  assert.equal(rawDbRecordFromRow(rawDb["Florol®"]).ODT, null);
});

test("second-tier diluted stocks inherit reviewed parent molecular fields", () => {
  const source = fs.readFileSync("src/App.jsx", "utf8");
  const rawDb = extractAppObjectConstant(source, "const RAW_DB = {");
  const supportRows = buildHeroFormulaRawDbSupportRows(rawDb);

  const veramossStock = rawDbRecordFromRow(supportRows["Veramoss 20% TEC"]);
  assert.equal(veramossStock.MW, 196.1);
  assert.equal(veramossStock.xLogP, 3.6);
  assert.equal(veramossStock.VP, 0.000018);
  assert.equal(veramossStock.ODT, 0.01);
  assert.equal(veramossStock.vpConfidence, "iff_compendium_23c");
  assert.equal(veramossStock.dilutionFactor, 0.2);
  assert.equal(veramossStock.supplier, "Hero Formula Support");
  assert.equal(veramossStock.rep, "Veramoss");
  assert.equal(veramossStock.scentClass, "Diluted Stock");

  const geosminStock = rawDbRecordFromRow(supportRows["Geosmin 1% TEC"]);
  assert.equal(geosminStock.MW, 182.31);
  assert.equal(geosminStock.xLogP, 3.3);
  assert.equal(geosminStock.VP, 0.001);
  assert.equal(geosminStock.ODT, 0.00001);
  assert.equal(geosminStock.vpConfidence, "tgsc_est_25c");
  assert.equal(geosminStock.dilutionFactor, 0.01);
  assert.equal(geosminStock.supplier, "Hero Formula Support");
  assert.equal(geosminStock.rep, "Geosmin");
  assert.equal(geosminStock.scentClass, "Diluted Stock");
});

test("hero formula support covers all confirmed hero formula material gaps", () => {
  const reviewNeededNames = new Set(
    HERO_FORMULA_MATERIAL_SUPPORT.reviewNeeded.map((item) => item.name)
  );
  const resolvedOverlayNames = new Set([
    ...HERO_FORMULA_MATERIAL_SUPPORT.dilutedStocks.map((item) => item.name),
    ...HERO_FORMULA_MATERIAL_SUPPORT.aliases.map((item) => item.name),
    ...HERO_FORMULA_MATERIAL_SUPPORT.supportRecords.map((item) => item.name),
  ]);

  for (const name of [
    "Algenone",
    "Cyclogalbanate",
    "Hedione HC",
    "Vetiveryl Acetate",
    "Aldehyde C-18",
    "Lemon FCF",
    "Ylang Ylang 10%",
    "Cypriol",
    "Pink Peppercorn Oil P&N",
  ]) {
    assert.equal(
      resolvedOverlayNames.has(name),
      true,
      `${name} should resolve`
    );
    assert.equal(
      reviewNeededNames.has(name),
      false,
      `${name} should not need review`
    );
  }

  assert.equal(HERO_FORMULA_MATERIAL_SUPPORT.reviewNeeded.length, 0);
  assert.equal(51 - reviewNeededNames.size, 51);
});

test("active hero formula seed composition preserves grams with approved accord name corrections", () => {
  const source = fs.readFileSync("src/App.jsx", "utf8");
  const formulas = extractAppArrayConstant(source, "const FORMULAS_INIT = [");

  assert.deepEqual(
    formulas.map((formula) => formula.name),
    [
      "Random Concoction - Original",
      "Skin-Air Bridge",
      "Damp Shoreline v1",
      "Damp Shoreline v2",
    ]
  );
  assert.equal(
    formulas.reduce((sum, formula) => sum + formula.ingredients.length, 0),
    129
  );
  assert.equal(
    formulas.some((formula) =>
      formula.ingredients.some((ingredient) => ingredient.name === "Base")
    ),
    false
  );

  const randomConcoction = formulas[0];
  assert.equal(randomConcoction.ingredients[0].name, "Iso E Super");
  assert.equal(randomConcoction.ingredients[0].g, 0.580266);
  assert.equal(
    randomConcoction.ingredients.find(
      (ingredient) => ingredient.name === "Driftwood Accord"
    ).g,
    0.606
  );

  const dampShorelineV2 = formulas.find(
    (formula) => formula.name === "Damp Shoreline v2"
  );
  assert.equal(
    dampShorelineV2.ingredients.find(
      (ingredient) => ingredient.name === "Botanical Musk Accord"
    ).g,
    1.3
  );
  assert.equal(
    dampShorelineV2.ingredients.find(
      (ingredient) => ingredient.name === "Driftwood Accord v2"
    ).g,
    0.15
  );
  assert.equal(
    formulas.some((formula) =>
      formula.ingredients.some(
        (ingredient) => ingredient.name === "Botanical Musk Accord v2"
      )
    ),
    false
  );
  assert.equal(
    formulas.some((formula) =>
      formula.ingredients.some(
        (ingredient) => ingredient.name === "Driftwood Accord v2.2 NT"
      )
    ),
    false
  );
});
