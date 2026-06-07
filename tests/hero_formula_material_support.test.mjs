import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  HERO_FORMULA_MATERIAL_SUPPORT,
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
  const fields = [
    "MW",
    "xLogP",
    "TPSA",
    "HBD",
    "HBA",
    "VP",
    "ODT",
    "n",
    "note",
    "type",
    "ifra",
    "supplier",
    "char",
    "rep",
    "densityGmL",
    "cas",
    "inci",
    "scentClass",
    "scentSummary",
    "scentDesc",
    "ifraLimit",
    "densityGmL2",
    "dilutionFactor",
    "isUVCB",
    "descriptorTags",
    "odorThreshold_ngL",
    "vpConfidence",
    "isIsomerMix",
    "ifraLimits",
  ];
  return fields.map((field) => overrides[field] ?? null);
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

  assert.equal(rawRows.Algenone[8], "mid");
  assert.equal(rawRows.Algenone[11], "Hero Formula Support");
  assert.equal(rawRows.Algenone[17], "Support Record");
  assert.equal(rawRows.Algenone[20], null);
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

test("hero formula support improves confirmed gap coverage and leaves missing PA rows for review", () => {
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

  assert.equal(HERO_FORMULA_MATERIAL_SUPPORT.reviewNeeded.length, 2);
  assert.equal(reviewNeededNames.has("Pink Peppercorn Oil P&N"), true);
  assert.equal(reviewNeededNames.has("Cypriol"), true);
  assert.equal(51 - reviewNeededNames.size, 49);
  assert.equal(MATERIAL_NORMALIZATION["Pink Peppercorn Oil P&N"], undefined);
  assert.equal(MATERIAL_NORMALIZATION.Cypriol, undefined);
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
