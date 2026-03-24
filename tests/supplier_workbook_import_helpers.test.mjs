import test from "node:test";
import assert from "node:assert/strict";

import * as XLSX from "xlsx";

import {
  buildFraterworksFullCatalogSyncPlan,
  buildFraterworksReferenceWorkbookExport,
  buildFraterworksJsonPasteImportPlan,
  buildTrustedSupplierWorkbookImportPlan,
  fetchFraterworksPaginatedCatalog,
  normalizeFraterworksJsonPastePayload,
  parseTrustedSupplierWorkbookArrayBuffer,
} from "../src/lib/supplier_workbook_import_helpers.js";

function buildWorkbookArrayBuffer(sheetRowsByName) {
  const workbook = XLSX.utils.book_new();
  Object.entries(sheetRowsByName).forEach(([sheetName, rows]) => {
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  });
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" });
}

function buildMockJsonResponse(payload, { ok = true, status = 200 } = {}) {
  const text = JSON.stringify(payload);
  return {
    ok,
    status,
    async text() {
      return text;
    },
  };
}

test("trusted supplier workbook parser reports missing required sheets", () => {
  const workbookBuffer = buildWorkbookArrayBuffer({
    Supplier_Products_Import: [
      {
        supplier_name: "Trusted Supplier",
        supplier_product_name: "Only Product",
      },
    ],
  });

  const parsed = parseTrustedSupplierWorkbookArrayBuffer(workbookBuffer);

  assert.ok(
    parsed.fatalErrors.some((error) =>
      error.includes("Missing required sheet: Supplier_Prices_Import")
    )
  );
  assert.ok(
    parsed.fatalErrors.some((error) =>
      error.includes("Missing required sheet: Material_Mapping")
    )
  );
});

test("trusted supplier workbook import maps an existing material and attaches multiple price rows", () => {
  const workbookBuffer = buildWorkbookArrayBuffer({
    Supplier_Products_Import: [
      {
        supplier_product_key: "trusted_supplier:test_product",
        supplier_name: "Trusted Supplier",
        supplier_product_name: "Test Product",
        supplier_product_url: "https://supplier.example/test-product",
        availability: "In stock",
        ifra_percent_shown: "1.5",
        sds_url: "https://supplier.example/test-product/sds.pdf",
        inci_shown: "Existing Material Inci",
        cas_shown: "111-11-1",
        product_description: "Trusted workbook import row.",
        scent_summary: "Citrus-woody note.",
      },
    ],
    Supplier_Prices_Import: [
      {
        supplier_product_key: "trusted_supplier:test_product",
        supplier_name: "Trusted Supplier",
        size_value: 15,
        size_unit: "g",
        price_usd: 12.5,
      },
      {
        supplier_product_key: "trusted_supplier:test_product",
        supplier_name: "Trusted Supplier",
        size_value: 30,
        size_unit: "g",
        price_usd: 22,
      },
    ],
    Material_Mapping: [
      {
        supplier_product_key: "trusted_supplier:test_product",
        mapping_action: "existing_material",
        mapped_material_name: "Existing Material",
      },
    ],
  });

  const parsed = parseTrustedSupplierWorkbookArrayBuffer(workbookBuffer);
  const plan = buildTrustedSupplierWorkbookImportPlan(parsed, {
    db: {
      "Existing Material": {
        canonicalMaterialKey: "existing_material",
        inci: "Existing Material Inci",
        cas: "111-11-1",
      },
    },
    getIfraMaterialRecord: () => ({
      limits: {
        cat4: 1.5,
      },
    }),
  });

  assert.deepEqual(plan.fatalErrors, []);
  assert.equal(plan.report.summary.supplierProductsImported, 1);
  assert.equal(plan.report.summary.priceRowsImported, 2);
  assert.equal(plan.report.summary.mappingsResolved, 1);
  assert.equal(plan.report.summary.itemsSentToReview, 0);
  assert.equal(plan.pricePatches.length, 1);
  assert.equal(plan.pricePatches[0].catalogName, "Existing Material");
  assert.equal(plan.pricePatches[0].supplierName, "Trusted Supplier");
  assert.deepEqual(plan.pricePatches[0].pricePoints, [
    [15, "g", 12.5, null],
    [30, "g", 22, null],
  ]);
  const importedRecord = Object.values(plan.supplierLayerRecordMap)[0];
  assert.equal(importedRecord.mappedCatalogName, "Existing Material");
  assert.equal(importedRecord.trustLane, "auto_apply_safe");
});

test("fraterworks json import extracts compliance fields and treats multi-CAS support as order-insensitive", () => {
  const importPlan = buildFraterworksJsonPasteImportPlan(
    JSON.stringify({
      products: [
        {
          id: 101,
          title: "Bergamot EO",
          handle: "bergamot-eo",
          vendor: "Fraterworks",
          product_type: "Essential Oil",
          tags: ["citrus", "top"],
          body_html: `
            <p>Fresh bergamot essential oil.</p>
            <p>INCI: Citrus Aurantium Bergamia Peel Oil</p>
            <p>CAS: 8007-75-8 ; 89957-91-5</p>
            <p>IFRA Cat 4: 0.4%</p>
            <p><a href="/files/bergamot-sds.pdf">SDS</a></p>
          `,
          variants: [
            {
              id: 201,
              title: "15 g / 100% Pure",
              option1: "15 g",
              option2: "100% Pure",
              sku: "8007-75-8-BERG-15",
              price: "12.50",
              available: true,
            },
            {
              id: 202,
              title: "30 g / 100% Pure",
              option1: "30 g",
              option2: "100% Pure",
              sku: "89957-91-5-BERG-30",
              price: "22.00",
              available: true,
            },
          ],
        },
      ],
    }),
    {
      db: {
        "Bergamot EO": {
          cas: "89957-91-5 ; 8007-75-8",
          inci: "Citrus Aurantium Bergamia Peel Oil",
          canonicalMaterialKey: "bergamot_eo",
        },
      },
      supplierProductRegistry: {
        "fraterworks:bergamot-eo": {
          supplierKey: "fraterworks",
          supplierDisplayName: "Fraterworks",
          productTitle: "Bergamot EO",
          mappedCatalogName: "Bergamot EO",
          mappedCanonicalMaterialKey: "bergamot_eo",
        },
      },
      getIfraMaterialRecord: () => ({
        limits: {
          cat4: 0.4,
        },
      }),
    }
  );

  assert.deepEqual(importPlan.fatalErrors, []);
  assert.equal(importPlan.report.summary.priceRowsImported, 2);
  const importedRecord = Object.values(importPlan.supplierLayerRecordMap)[0];
  assert.equal(importedRecord.pageFacts.ifraPercent, 0.4);
  assert.equal(
    importedRecord.pageFacts.sdsUrl,
    "https://fraterworks.com/files/bergamot-sds.pdf"
  );
  assert.equal(
    importedRecord.pageFacts.inci,
    "Citrus Aurantium Bergamia Peel Oil"
  );
  assert.equal(
    importedRecord.pageFacts.casShown,
    "8007-75-8 ; 89957-91-5"
  );
  assert.equal(importedRecord.pageFacts.casState, "multiple");
  assert.equal(
    importedRecord.reviewItems.some(
      (item) => item.issueType === "canonical_conflict_cas"
    ),
    false
  );
});

test("fraterworks json import preserves explicit mixture CAS state", () => {
  const importPlan = buildFraterworksJsonPasteImportPlan(
    JSON.stringify({
      products: [
        {
          id: 102,
          title: "Natural Accord Base",
          handle: "natural-accord-base",
          vendor: "Fraterworks",
          product_type: "Accord",
          body_html: `
            <p>Complex natural accord.</p>
            <p>CAS: Mixture</p>
            <p>INCI: Fragrance</p>
          `,
          variants: [
            {
              id: 301,
              title: "15 g / 100% Pure",
              option1: "15 g",
              option2: "100% Pure",
              sku: "NAB-15",
              price: "18.00",
              available: false,
            },
          ],
        },
      ],
    }),
    {
      db: {
        "Natural Accord Base": {
          cas: "Mixture",
          inci: "Fragrance",
        },
      },
    }
  );

  assert.deepEqual(importPlan.fatalErrors, []);
  const importedRecord = Object.values(importPlan.supplierLayerRecordMap)[0];
  assert.equal(importedRecord.pageFacts.casShown, "Mixture");
  assert.equal(importedRecord.pageFacts.casState, "mixture");
});

test("trusted supplier workbook import creates a local draft material when requested", () => {
  const workbookBuffer = buildWorkbookArrayBuffer({
    Supplier_Products_Import: [
      {
        supplier_product_key: "trusted_supplier:new_draft_material",
        supplier_name: "Trusted Supplier",
        supplier_product_name: "New Draft Material",
        supplier_product_url: "https://supplier.example/new-draft-material",
        availability: "Limited stock",
        inci_shown: "Draft Material Inci",
        cas_shown: "222-22-2",
        product_description: "Should become a local draft material.",
        create_local_draft: "yes",
        note_role: "mid",
        material_type: "SYNTH",
      },
    ],
    Supplier_Prices_Import: [
      {
        supplier_product_key: "trusted_supplier:new_draft_material",
        supplier_name: "Trusted Supplier",
        size_value: 10,
        size_unit: "g",
        price_usd: 18,
      },
    ],
    Material_Mapping: [
      {
        supplier_product_key: "trusted_supplier:new_draft_material",
        mapping_action: "create_local_draft",
        local_draft_material_name: "Workbook Draft Material",
      },
    ],
  });

  const parsed = parseTrustedSupplierWorkbookArrayBuffer(workbookBuffer);
  const plan = buildTrustedSupplierWorkbookImportPlan(parsed, {
    db: {},
  });

  assert.deepEqual(plan.fatalErrors, []);
  assert.equal(plan.report.summary.localDraftMaterialsCreated, 1);
  assert.ok(plan.localDraftRecordsByName["Workbook Draft Material"]);
  assert.equal(plan.pricePatches.length, 1);
  assert.equal(plan.pricePatches[0].catalogName, "Workbook Draft Material");
  assert.equal(plan.report.resultRows[0].createdLocalDraft, true);
});

test("trusted supplier workbook import routes unresolved rows into review without blocking other imports", () => {
  const workbookBuffer = buildWorkbookArrayBuffer({
    Supplier_Products_Import: [
      {
        supplier_product_key: "trusted_supplier:unresolved_product",
        supplier_name: "Trusted Supplier",
        supplier_product_name: "Unresolved Product",
        supplier_product_url: "https://supplier.example/unresolved-product",
        availability: "Request only",
        product_description: "Mapping intentionally unresolved.",
      },
    ],
    Supplier_Prices_Import: [
      {
        supplier_product_key: "trusted_supplier:unresolved_product",
        supplier_name: "Trusted Supplier",
        size_value: 15,
        size_unit: "g",
        price_usd: 20,
      },
    ],
    Material_Mapping: [
      {
        supplier_product_key: "trusted_supplier:unresolved_product",
        mapping_action: "unresolved",
        review_note: "Need human mapping review.",
      },
    ],
  });

  const parsed = parseTrustedSupplierWorkbookArrayBuffer(workbookBuffer);
  const plan = buildTrustedSupplierWorkbookImportPlan(parsed, {
    db: {},
  });

  assert.deepEqual(plan.fatalErrors, []);
  assert.equal(plan.pricePatches.length, 0);
  assert.ok(plan.report.summary.itemsSentToReview > 0);
  const importedRecord = Object.values(plan.supplierLayerRecordMap)[0];
  assert.equal(importedRecord.trustLane, "batch_review_mapping");
  assert.ok(importedRecord.reviewItems.some((item) => item.issueType));
  assert.equal(plan.report.resultRows[0].status, "review_required");
});

test("fraterworks json normalization accepts already valid payloads without repairs", () => {
  const result = normalizeFraterworksJsonPastePayload(
    JSON.stringify({
      products: [
        {
          title: "Valid Product",
          handle: "valid-product",
          variants: [
            {
              title: "15g / 10% TEC",
              option1: "15g",
              option2: "10% TEC",
              price: "12.50",
              available: true,
            },
          ],
        },
      ],
    })
  );

  assert.equal(result.ok, true);
  assert.equal(result.strictParsePassed, true);
  assert.equal(result.normalizationApplied, false);
  assert.equal(result.repairCount, 0);
  assert.equal(result.productsDetected, 1);
  assert.equal(result.previewRows[0].title, "Valid Product");
});

test("fraterworks json normalization repairs broken html quotes and wrapper junk", () => {
  const brokenPayload = `\`\`\`json
before copy noise
{"products":[{"title":"Broken Html","handle":"broken-html","body_html":"<meta charset="utf-8"><p>Test body</p>","vendor":"Fraterworks","variants":[{"title":"15g / 10% TEC","option1":"15g","option2":"10% TEC","price":"12.50","available":true,},],}],}
after copy noise
\`\`\``;

  const result = normalizeFraterworksJsonPastePayload(brokenPayload);

  assert.equal(result.ok, true);
  assert.equal(result.strictParsePassed, false);
  assert.equal(result.normalizationApplied, true);
  assert.ok(result.repairCount >= 3);
  assert.equal(result.productsDetected, 1);
  assert.equal(
    result.parsedJson.products[0].body_html,
    '<meta charset="utf-8"><p>Test body</p>'
  );
});

test("fraterworks json normalization wraps a single product object", () => {
  const result = normalizeFraterworksJsonPastePayload(
    JSON.stringify({
      title: "Single Product",
      handle: "single-product",
      body_html: "<p>Wrapped.</p>",
      variants: [],
    })
  );

  assert.equal(result.ok, true);
  assert.equal(result.productsDetected, 1);
  assert.equal(Array.isArray(result.parsedJson.products), true);
  assert.equal(result.parsedJson.products[0].handle, "single-product");
  assert.ok(
    result.repairMessages.some((message) =>
      message.includes('Wrapped a single product object')
    )
  );
});

test("fraterworks json normalization fails clearly for unrecoverable payloads", () => {
  const result = normalizeFraterworksJsonPastePayload(
    '{"products":[{"title":"Broken","handle":"broken","body_html":"<p>Bad</p>","variants":[{"title":"15g","price":"12.50"}]'
  );

  assert.equal(result.ok, false);
  assert.ok(
    result.fatalErrors.some((error) =>
      error.startsWith("Invalid JSON after normalization:")
    )
  );
  assert.ok(result.fatalErrors[0].includes("Near:"));
});

test("fraterworks json paste import parses multiple products, variant dilutions, and auto-onboards clean new rows", () => {
  const jsonText = JSON.stringify({
    products: [
      {
        id: 101,
        title: "Existing Material",
        handle: "existing-material",
        body_html:
          "<p>Bright citrus-woody material.</p><p>Useful in modern bases.</p>",
        vendor: "Fraterworks",
        product_type: "Synthetic",
        tags: "synthetic, citrus",
        variants: [
          {
            id: 201,
            title: "15g / 10% TEC",
            option1: "15g",
            option2: "10% TEC",
            price: "12.50",
            available: true,
            sku: "111-11-1-EXIST-15",
          },
          {
            id: 202,
            title: "30g / 100% Pure",
            option1: "30g",
            option2: "100% Pure",
            price: "22.00",
            available: false,
            sku: "111-11-1-EXIST-30",
          },
        ],
        images: [{ src: "https://cdn.example/existing-material.jpg" }],
        options: [{ name: "Size" }, { name: "Strength" }],
      },
      {
        id: 102,
        title: "Ambiguous Product",
        handle: "ambiguous-product",
        body_html: "<p>Needs review.</p>",
        vendor: "Fraterworks",
        product_type: "Natural",
        tags: "experimental",
        variants: [
          {
            id: 203,
            title: "10g / 10% DPG",
            option1: "10g",
            option2: "10% DPG",
            price: "18.00",
            available: true,
            sku: "999-99-9-AMB-10",
          },
        ],
      },
    ],
  });

  const plan = buildFraterworksJsonPasteImportPlan(jsonText, {
    db: {
      "Existing Material": {
        canonicalMaterialKey: "existing_material",
        inci: "Existing Material Inci",
        cas: "111-11-1",
      },
    },
    supplierProductRegistry: {
      "fraterworks:existing-material": {
        supplierKey: "fraterworks",
        supplierDisplayName: "Fraterworks",
        productTitle: "Existing Material",
        mappedCatalogName: "Existing Material",
      },
    },
    buildSupplierProductKey: ({ supplierKey, url }) =>
      `${supplierKey}:${String(url).split("/").pop()}`,
    getIfraMaterialRecord: () => ({
      limits: {
        cat4: null,
      },
    }),
    importedAt: "2026-03-20T15:00:00.000Z",
  });

  assert.deepEqual(plan.fatalErrors, []);
  assert.equal(plan.report.summary.productsParsed, 2);
  assert.equal(plan.report.summary.supplierProductsImported, 2);
  assert.equal(plan.report.summary.priceRowsImported, 3);
  assert.equal(plan.report.summary.productsImported, 2);
  assert.equal(plan.pricePatches.length, 1);
  assert.equal(plan.pricePatches[0].catalogName, "Existing Material");

  const existingRecord = Object.values(plan.supplierLayerRecordMap).find(
    (record) => record.supplierProductKey === "fraterworks:existing-material"
  );
  const newRecord = Object.values(plan.supplierLayerRecordMap).find(
    (record) => record.supplierProductKey === "fraterworks:ambiguous-product"
  );

  assert.equal(existingRecord.pageFacts.casShown, "111-11-1");
  assert.equal(existingRecord.pageFacts.variantFacts.length, 2);
  assert.equal(existingRecord.pageFacts.variantFacts[0].dilutionNote, "10% TEC");
  assert.equal(existingRecord.pageFacts.variantFacts[1].dilutionNote, "100% Pure");
  assert.equal(existingRecord.pageFacts.imageUrl, "https://cdn.example/existing-material.jpg");
  assert.equal(newRecord.trustLane, "auto_apply_safe");
  assert.equal(newRecord.reviewItems.length, 0);
  assert.equal(plan.report.summary.itemsSentToReview, 0);
});

test("fraterworks json paste import can create local drafts for clearly new products", () => {
  const jsonText = JSON.stringify({
    products: [
      {
        id: 301,
        title: "New Draft Material",
        handle: "new-draft-material",
        body_html: "<p>Draft-worthy material.</p>",
        vendor: "Fraterworks",
        product_type: "Synthetic",
        tags: "synthetic, diffusive",
        variants: [
          {
            id: 401,
            title: "15g / 10% TEC",
            option1: "15g",
            option2: "10% TEC",
            price: "14.50",
            available: true,
            sku: "222-22-2-DRAFT-15",
          },
        ],
      },
    ],
  });

  const plan = buildFraterworksJsonPasteImportPlan(jsonText, {
    db: {},
    supplierProductRegistry: {},
    buildSupplierProductKey: ({ supplierKey, url }) =>
      `${supplierKey}:${String(url).split("/").pop()}`,
    createLocalDrafts: true,
    importedAt: "2026-03-20T15:30:00.000Z",
  });

  assert.deepEqual(plan.fatalErrors, []);
  assert.equal(plan.report.summary.localDraftMaterialsCreated, 1);
  assert.equal(plan.report.summary.localDraftsCreated, 1);
  assert.ok(plan.localDraftRecordsByName["New Draft Material"]);
  assert.equal(plan.pricePatches.length, 1);
  assert.equal(plan.pricePatches[0].catalogName, "New Draft Material");
  assert.equal(plan.report.resultRows[0].createdLocalDraft, true);
});

test("fraterworks json paste import does not create duplicate review from weak shared-word overlap", () => {
  const jsonText = JSON.stringify({
    products: [
      {
        id: 401,
        title: "Benzyl Acetate",
        handle: "benzyl-acetate",
        body_html: "<p>Distinct benzyl product.</p>",
        vendor: "Fraterworks",
        product_type: "Synthetic",
        tags: "synthetic",
        variants: [
          {
            id: 501,
            title: "10g / 100% Pure",
            option1: "10g",
            option2: "100% Pure",
            price: "9.50",
            available: true,
            sku: "140-11-4-BENZYL-ACETATE",
          },
        ],
      },
      {
        id: 402,
        title: "Bourbon Geranium Oil",
        handle: "bourbon-geranium-oil",
        body_html: "<p>Distinct bourbon product.</p>",
        vendor: "Fraterworks",
        product_type: "Natural",
        tags: "natural",
        variants: [
          {
            id: 502,
            title: "10g / 100% Pure",
            option1: "10g",
            option2: "100% Pure",
            price: "11.50",
            available: true,
            sku: "8000-46-2-BOURBON-GERANIUM",
          },
        ],
      },
    ],
  });

  const plan = buildFraterworksJsonPasteImportPlan(jsonText, {
    db: {
      "Benzyl Benzoate": {
        canonicalMaterialKey: "benzyl_benzoate",
        cas: "120-51-4",
      },
      "Vetiver Oil Bourbon": {
        canonicalMaterialKey: "vetiver_oil_bourbon",
        cas: "8016-96-4",
      },
    },
    supplierProductRegistry: {
      "fraterworks:benzyl-benzoate": {
        supplierKey: "fraterworks",
        supplierDisplayName: "Fraterworks",
        productTitle: "Benzyl Benzoate",
        mappedCatalogName: "Benzyl Benzoate",
      },
      "fraterworks:vetiver-oil-bourbon": {
        supplierKey: "fraterworks",
        supplierDisplayName: "Fraterworks",
        productTitle: "Vetiver Oil Bourbon",
        mappedCatalogName: "Vetiver Oil Bourbon",
      },
    },
    buildSupplierProductKey: ({ supplierKey, url }) =>
      `${supplierKey}:${String(url).split("/").pop()}`,
    importedAt: "2026-03-21T10:00:00.000Z",
  });

  assert.deepEqual(plan.fatalErrors, []);
  assert.equal(plan.report.summary.itemsSentToReview, 0);
  assert.ok(
    Object.values(plan.supplierLayerRecordMap).every(
      (record) =>
        record.trustLane === "auto_apply_safe" &&
        record.reviewItems.length === 0
    )
  );
});

test("fraterworks json paste import reports fatal errors for invalid payloads", () => {
  const plan = buildFraterworksJsonPasteImportPlan("{not valid json", {});

  assert.ok(
    plan.fatalErrors.some(
      (error) =>
        error.startsWith("Invalid JSON after normalization:") &&
        error.includes("Near:")
    )
  );
  assert.equal(plan.report.summary.productsParsed, 0);
  assert.equal(plan.report.summary.supplierProductsImported, 0);
});

test("fraterworks full catalog sync merges multiple pages, refreshes known rows, and auto-onboards clean new products", async () => {
  const pagePayloads = new Map([
    [
      "https://fraterworks.com/products.json?limit=2&page=1",
      buildMockJsonResponse({
        products: [
          {
            id: 101,
            title: "Existing Material",
            handle: "existing-material",
            body_html: "<p>Existing product refreshed.</p>",
            vendor: "Fraterworks",
            product_type: "Synthetic",
            tags: "synthetic, citrus",
            variants: [
              {
                id: 201,
                title: "15g / 10% TEC",
                option1: "15g",
                option2: "10% TEC",
                price: "12.50",
                available: true,
                sku: "111-11-1-EXIST-15",
              },
            ],
          },
          {
            id: 102,
            title: "Fresh New Product",
            handle: "fresh-new-product",
            body_html: "<p>New supplier-layer row.</p>",
            vendor: "Fraterworks",
            product_type: "Synthetic",
            tags: "synthetic, diffusive",
            variants: [
              {
                id: 202,
                title: "10g / 100% Pure",
                option1: "10g",
                option2: "100% Pure",
                price: "18.00",
                available: true,
                sku: "222-22-2-NEW-10",
              },
            ],
          },
        ],
      }),
    ],
    [
      "https://fraterworks.com/products.json?limit=2&page=2",
      buildMockJsonResponse({
        products: [
          {
            id: 101,
            title: "Existing Material Duplicate",
            handle: "existing-material",
            body_html: "<p>Duplicate row should be ignored.</p>",
            vendor: "Fraterworks",
            product_type: "Synthetic",
            tags: "duplicate",
            variants: [
              {
                id: 203,
                title: "15g / 10% TEC",
                option1: "15g",
                option2: "10% TEC",
                price: "12.50",
                available: true,
                sku: "111-11-1-DUP-15",
              },
            ],
          },
          {
            id: 103,
            title: "Fresh Bourbon Citrus",
            handle: "fresh-bourbon-citrus",
            body_html: "<p>Clean new supplier-layer row.</p>",
            vendor: "Fraterworks",
            product_type: "Natural",
            tags: "experimental",
            variants: [
              {
                id: 204,
                title: "5g / 10% DPG",
                option1: "5g",
                option2: "10% DPG",
                price: "9.00",
                available: false,
                sku: "333-33-3-FRESH-5",
              },
            ],
          },
        ],
      }),
    ],
    [
      "https://fraterworks.com/products.json?limit=2&page=3",
      buildMockJsonResponse({
        products: [],
      }),
    ],
  ]);

  const fetchCalls = [];
  const fetchImpl = async (url) => {
    fetchCalls.push(url);
    const response = pagePayloads.get(url);
    if (!response) {
      throw new Error(`Unexpected URL ${url}`);
    }
    return response;
  };

  const plan = await buildFraterworksFullCatalogSyncPlan({
    fetchImpl,
    limit: 2,
    db: {
      "Existing Material": {
        canonicalMaterialKey: "existing_material",
        inci: "Existing Material Inci",
        cas: "111-11-1",
      },
    },
    supplierProductRegistry: {
      "fraterworks:existing-material": {
        supplierKey: "fraterworks",
        supplierDisplayName: "Fraterworks",
        productTitle: "Existing Material",
        mappedCatalogName: "Existing Material",
      },
    },
    buildSupplierProductKey: ({ supplierKey, url }) =>
      `${supplierKey}:${String(url).split("/").pop()}`,
    getIfraMaterialRecord: () => ({
      limits: {
        cat4: null,
      },
    }),
    importedAt: "2026-03-20T18:00:00.000Z",
  });

  assert.deepEqual(plan.fatalErrors, []);
  assert.equal(fetchCalls.length, 3);
  assert.equal(plan.report.metadata.sourceLabel, "Fraterworks Full Catalog Sync");
  assert.equal(plan.report.summary.pagesFetched, 3);
  assert.equal(plan.report.summary.totalProductsFetched, 4);
  assert.equal(plan.report.summary.uniqueProductsMerged, 3);
  assert.equal(plan.report.summary.duplicateProductsSkipped, 1);
  assert.equal(plan.report.summary.existingSupplierProductsRefreshed, 1);
  assert.equal(plan.report.summary.newSupplierProductsCreated, 2);
  assert.equal(plan.report.summary.productsImported, 3);
  assert.equal(plan.report.summary.priceRowsCreated, 3);
  assert.equal(plan.report.summary.itemsSentToReview, 0);
  assert.equal(plan.pricePatches.length, 1);
  assert.equal(plan.pricePatches[0].catalogName, "Existing Material");

  const cleanNewRecord = Object.values(plan.supplierLayerRecordMap).find(
    (record) => record.supplierProductKey === "fraterworks:fresh-bourbon-citrus"
  );
  const newRecord = Object.values(plan.supplierLayerRecordMap).find(
    (record) => record.supplierProductKey === "fraterworks:fresh-new-product"
  );

  assert.ok(newRecord);
  assert.equal(newRecord.sourceOrigin, "fraterworks_full_catalog_sync");
  assert.equal(
    newRecord.pageFacts.importedFromFraterworksFullCatalogSync,
    true
  );
  assert.equal(newRecord.trustLane, "auto_apply_safe");
  assert.equal(newRecord.reviewItems.length, 0);
  assert.equal(cleanNewRecord.trustLane, "auto_apply_safe");
  assert.equal(cleanNewRecord.reviewItems.length, 0);
  assert.ok(
    plan.warnings.some((warning) =>
      String(warning.message || "").includes("skipped duplicate Fraterworks product")
    )
  );
});

test("fraterworks paginated catalog fetch stops on short pages and deduplicates by stable keys", async () => {
  const fetchImpl = async (url) => {
    if (url === "https://fraterworks.com/products.json?limit=2&page=1") {
      return buildMockJsonResponse({
        products: [
          { id: 201, title: "One", handle: "one", variants: [] },
          { id: 202, title: "Two", handle: "two", variants: [] },
        ],
      });
    }
    if (url === "https://fraterworks.com/products.json?limit=2&page=2") {
      return buildMockJsonResponse({
        products: [
          { id: 202, title: "Two Duplicate", handle: "two", variants: [] },
        ],
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  const result = await fetchFraterworksPaginatedCatalog({
    fetchImpl,
    limit: 2,
  });

  assert.deepEqual(result.fatalErrors, []);
  assert.equal(result.summary.pagesFetched, 2);
  assert.equal(result.summary.totalProductsFetched, 3);
  assert.equal(result.summary.uniqueProductsMerged, 2);
  assert.equal(result.summary.duplicateProductsSkipped, 1);
  assert.equal(result.summary.stopReason, "short_page");
});

test("fraterworks reference workbook export includes product, material, and price reference sheets", () => {
  const exportResult = buildFraterworksReferenceWorkbookExport({
    db: {
      "Existing Material": {
        canonicalMaterialKey: "existing_material",
        entryKind: "canonical_material",
        cas: "111-11-1",
        inci: "Existing Material Inci",
        note: "mid",
        type: "SYNTH",
        scentSummary: "Citrus-woody reference",
      },
      "Workbook Draft Material": {
        entryKind: "local_draft",
        isLocalDraft: true,
        cas: "222-22-2",
        inci: "Draft Material Inci",
        note: "base",
        type: "EO",
        scentSummary: "Draft reference row",
      },
    },
    pricesState: {
      "Existing Material": {
        Fraterworks: {
          url: "https://fraterworks.com/products/existing-material",
          S: [[15, "g", 12.5, null]],
          availabilityStatus: "in_stock",
          ifraPercent: 1.5,
          sdsUrl: "https://fraterworks.com/products/existing-material/sds.pdf",
        },
      },
    },
    supplierLayerRecords: [
      {
        recordKey: "supplier_layer:fraterworks_existing_material",
        supplierKey: "fraterworks",
        supplierDisplayName: "Fraterworks",
        supplierProductKey: "fraterworks:existing-material",
        mappedCatalogName: "Existing Material",
        pageFacts: {
          productTitle: "Existing Material",
          url: "https://fraterworks.com/products/existing-material",
          pricePoints: [[15, "g", 12.5, null]],
          availabilityStatus: "in_stock",
          availabilityStatusLabel: "In stock",
          ifraPercent: 1.5,
          sdsUrl: "https://fraterworks.com/products/existing-material/sds.pdf",
          inci: "Existing Material Inci",
          casShown: "111-11-1",
          productDescription: "Reference export supplier-layer row.",
          scentSummary: "Citrus-woody reference",
          dilutionOrCarrier: "",
        },
        reviewItems: [],
        notes: ["Known Fraterworks row."],
      },
    ],
    supplierProductRegistry: {
      "fraterworks:existing-material": {
        supplierKey: "fraterworks",
        supplierDisplayName: "Fraterworks",
        productTitle: "Existing Material",
        url: "https://fraterworks.com/products/existing-material",
        mappedCatalogName: "Existing Material",
        notes: ["Registry mapping confirmed."],
      },
    },
    buildIngredientTruthReport: (name) => ({
      levelLabel: name === "Workbook Draft Material" ? "Partial" : "Supported",
      supportLabel:
        name === "Workbook Draft Material"
          ? "60% covered · 20% strong"
          : "100% covered · 90% strong",
    }),
    exportedAt: "2026-03-20T12:00:00.000Z",
  });

  const workbook = XLSX.read(exportResult.workbookArrayBuffer, { type: "array" });

  assert.deepEqual(workbook.SheetNames, [
    "Existing_FW_Products_Reference",
    "Existing_Materials_Reference",
    "Existing_FW_Product_Prices_Ref",
  ]);
  assert.equal(exportResult.summary.fraterworksProductsExported, 1);
  assert.equal(exportResult.summary.fraterworksPriceRowsExported, 1);

  const productRows = XLSX.utils.sheet_to_json(
    workbook.Sheets.Existing_FW_Products_Reference,
    { defval: "" }
  );
  const materialRows = XLSX.utils.sheet_to_json(
    workbook.Sheets.Existing_Materials_Reference,
    { defval: "" }
  );
  const priceRows = XLSX.utils.sheet_to_json(
    workbook.Sheets.Existing_FW_Product_Prices_Ref,
    { defval: "" }
  );

  assert.equal(productRows[0].current_supplier_product_name, "Existing Material");
  assert.equal(productRows[0].current_material_name_if_mapped, "Existing Material");
  assert.equal(productRows[0].current_mapping_status, "mapped_existing_material");
  assert.equal(productRows[0].current_prices_summary, "$12.50 / 15g");
  assert.ok(
    materialRows.some(
      (row) =>
        row.material_name === "Existing Material" &&
        row.canonical_or_local_draft === "Canonical material"
    )
  );
  assert.ok(
    priceRows.some(
      (row) =>
        row.supplier_product_key === "fraterworks:existing-material" &&
        row.size_value === 15 &&
        row.price_value === 12.5
    )
  );
});
