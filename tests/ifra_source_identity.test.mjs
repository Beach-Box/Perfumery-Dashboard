import test from "node:test";
import assert from "node:assert/strict";

import {
  buildIfraSourceIdentity,
  buildSourceIdentitySearchTerms,
  stripSourceDilutionTerms,
} from "../scripts/lib/ifra_source_identity.mjs";
import {
  computeDilutedFormulaLineGrams,
  buildBenchStockRuntimeSummary,
} from "../src/lib/perfumer_runtime_helpers.js";

test("diluted stock names normalize to parent source identity", () => {
  const calone = buildIfraSourceIdentity("Calone 1951 20% TEC");
  assert.equal(calone.displayName, "Calone 1951 20% TEC");
  assert.equal(calone.formulaMaterialName, "Calone 1951 20% TEC");
  assert.equal(calone.sourceIdentityName, "Calone 1951");
  assert.equal(calone.activeMaterialName, "Calone 1951");
  assert.equal(calone.dilutionLabel, "20% TEC");
  assert.equal(calone.carrierLabel, "TEC");
  assert.ok(calone.sourceSearchTerms.includes("Calone"));
  assert.equal(
    calone.sourceSearchTerms.some((term) => /20%|TEC/.test(term)),
    false
  );

  assert.equal(buildIfraSourceIdentity("Geosmin 1% TEC").sourceIdentityName, "Geosmin");
  assert.equal(
    buildIfraSourceIdentity("Ambrettolide 50% TEC").sourceIdentityName,
    "Ambrettolide"
  );
  assert.equal(
    buildIfraSourceIdentity("Ethyl Vanillin 10%").sourceIdentityName,
    "Ethyl Vanillin"
  );
  assert.equal(buildIfraSourceIdentity("Helional 25%").sourceIdentityName, "Helional®");
  assert.equal(
    buildIfraSourceIdentity("Veramoss 20% TEC").sourceIdentityName,
    "Veramoss"
  );
  assert.equal(
    buildIfraSourceIdentity("Seaweed Absolute 10%").sourceIdentityName,
    "Seaweed Absolute"
  );
});

test("source search term helpers strip dilution and carrier suffixes", () => {
  assert.equal(stripSourceDilutionTerms("IFRA Calone 1951 20% TEC"), "IFRA Calone 1951");
  assert.deepEqual(buildSourceIdentitySearchTerms(["Veramoss 20% TEC"]), [
    "Veramoss",
    "Evernyl",
    "Methyl atrarate",
  ]);
});

test("source identity normalization does not strip exact known accord names", () => {
  const accord = buildIfraSourceIdentity("Iso E + AmberXtreme 1%");
  assert.equal(accord.sourceIdentityName, "Iso E + AmberXtreme 1%");
  assert.equal(accord.dilutionLabel, "");
  assert.equal(
    stripSourceDilutionTerms("Iso E + AmberXtreme 1%"),
    "Iso E + AmberXtreme 1%"
  );
});

test("source identity normalization does not change active-load math", () => {
  assert.deepEqual(
    computeDilutedFormulaLineGrams({ stockGrams: 0.5, dilutionFactor: 0.2 }),
    {
      stockGrams: 0.5,
      activeGrams: 0.1,
      carrierGrams: 0.4,
      dilutionFactor: 0.2,
      isDiluted: true,
    }
  );

  const runtime = buildBenchStockRuntimeSummary([{ name: "Calone 1951 20%", g: 0.5 }], {
    db: {
      "Calone 1951 20%": {
        note: "mid",
        type: "SYNTH",
        dilutionFactor: 0.2,
        carrierName: "TEC",
      },
    },
  });
  assert.equal(runtime.rows[0].activeGrams, 0.1);
  assert.equal(runtime.rows[0].carrierGrams, 0.4);
});
