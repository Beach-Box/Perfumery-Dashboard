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

test("hero formula normalization overlay supports diluted identity and aliases", () => {
  assert.equal(MATERIAL_NORMALIZATION["Ambroxan 50% TEC"].entryKind, "diluted_stock");
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

test("hero formula support leaves ambiguous user-confirmation items unresolved", () => {
  const reviewNeededNames = new Set(
    HERO_FORMULA_MATERIAL_SUPPORT.reviewNeeded.map((item) => item.name)
  );

  assert.equal(reviewNeededNames.has("Pink Peppercorn Oil P&N"), true);
  assert.equal(reviewNeededNames.has("Lemon FCF"), true);
  assert.equal(reviewNeededNames.has("Ylang Ylang 10%"), true);
  assert.equal(MATERIAL_NORMALIZATION["Pink Peppercorn Oil P&N"], undefined);
  assert.equal(MATERIAL_NORMALIZATION["Lemon FCF"], undefined);
  assert.equal(MATERIAL_NORMALIZATION["Ylang Ylang 10%"], undefined);
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
