import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  HERO_FORMULA_MATERIAL_SUPPORT,
  HERO_FORMULA_RAW_DB_FIELDS,
  buildHeroFormulaMaterialNormalizationEntries,
  buildHeroFormulaPricingSupportRows,
  buildHeroFormulaRawDbSupportRows,
} from "../src/lib/hero_formula_material_support.js";
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

test("hero formula support creates alias rows and black-box accord records", () => {
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

  const pricingRows = buildHeroFormulaPricingSupportRows({});
  assert.equal(
    pricingRows["Driftwood Accord v2.2 NT"]["Bench Accord"].S[0][2],
    0
  );
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

test("hero formula support creates minimal own-material support records without pricing", () => {
  const rawRows = buildHeroFormulaRawDbSupportRows({});

  assert.equal(rawRows.Algenone[0], null);
  assert.equal(rawRows.Algenone[5], null);
  assert.equal(rawRows.Algenone[25], null);
  assert.equal(rawRows.Algenone[8], "mid");
  assert.equal(rawRows.Algenone[11], "Hero Formula Support");
  assert.equal(rawRows.Algenone[17], "Support Record");
  assert.equal(rawRows.Algenone[20], null);
  assert.equal(rawRows.Cyclogalbanate[0], null);
  assert.equal(rawRows.Cyclogalbanate[5], null);
  assert.equal(rawRows.Cyclogalbanate[25], null);
  assert.equal(rawRows.Cyclogalbanate[8], "mid");
  assert.equal(rawRows.Cyclogalbanate[11], "Hero Formula Support");
  assert.equal(rawRows.Cyclogalbanate[17], "Support Record");

  const pricingRows = buildHeroFormulaPricingSupportRows({});
  assert.equal(pricingRows.Algenone, undefined);
  assert.equal(pricingRows.Cyclogalbanate, undefined);

  assert.equal(
    MATERIAL_NORMALIZATION.Algenone.entryKind,
    "canonical_material"
  );
  assert.equal(
    MATERIAL_NORMALIZATION.Algenone.canonicalMaterialKey,
    "hero_algenone"
  );
  assert.equal(
    MATERIAL_NORMALIZATION.Cyclogalbanate.canonicalMaterialKey,
    "hero_cyclogalbanate"
  );
  assert.equal(
    MATERIAL_NORMALIZATION.Algenone.reviewState,
    "catalog_record_needed"
  );
});

test("hero formula support creates source-backed PA support records without pricing", () => {
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
  assert.equal(pricingRows.Cypriol, undefined);
  assert.equal(pricingRows["Pink Peppercorn Oil P&N"], undefined);

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
    },
  };

  for (const [name, expected] of Object.entries(expectedRecords)) {
    assert.equal(rawDb[name].length, HERO_FORMULA_RAW_DB_FIELDS.length);
    const record = rawDbRecordFromRow(rawDb[name]);
    for (const [field, value] of Object.entries(expected)) {
      assert.equal(record[field], value, `${name} ${field}`);
    }
    assert.equal(record.ODT, null, `${name} ODT should remain unsourced`);
    assert.equal(
      record.odorThreshold_ngL,
      null,
      `${name} odor threshold should remain unsourced`
    );
  }
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

test("active hero formula seed composition is unchanged by support overlays", () => {
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
});
