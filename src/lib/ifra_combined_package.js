import ifraMasterDataset from "../data/ifra_master_standards.json" with { type: "json" };
import materialNormalization from "../data/material_normalization.json" with { type: "json" };
import evidenceCandidateRegistry from "../data/evidence_candidate_registry.json" with { type: "json" };
import sourceDocumentRegistry from "../data/source_document_registry.json" with { type: "json" };
import supplierImportReviewQueue from "../data/supplier_import_review_queue.json" with { type: "json" };
import supplierProductRegistry from "../data/supplier_product_registry.json" with { type: "json" };
import {
  buildHeroFormulaMaterialNormalizationEntries,
  getHeroFormulaAccordRecipe,
} from "./hero_formula_material_support.js";

// Starter IFRA combined package for Beach Box app integration
const IFRA_SUPPLEMENTAL_MATERIALS = {
  "benzyl benzoate": {
    canonicalName: "Benzyl benzoate",
    cas: ["120-51-4"],
    synonyms: [
      "bb",
      "benylate",
      "benzoic acid, benzyl ester",
      "benzoic acid, phenylmethyl ester",
      "benzyl phenylformate",
      "phenylmethyl benzoate",
    ],
    recommendationType: "restriction",
    status: "active",
    publicationYear: 2020,
    amendment: 49,
    implementationDates: {
      newCreation: "2021-02-10",
      existingCreation: "2022-02-10",
    },
    limits: {
      cat4: 4.8,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [25, 26, 27],
    },
    notes: [
      "Appears in index and has a full IFRA standard in the uploaded PDF.",
      "Treat as carrier/solvent for dashboard note-role logic, not as a fragrance note.",
    ],
  },
  "triethyl citrate": {
    canonicalName: "Triethyl Citrate",
    cas: [],
    synonyms: ["tec"],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [],
    },
    notes: [
      "No matching IFRA standard was located in the uploaded PDF during this pass.",
      "Do not render as unrestricted; render as 'no specific IFRA standard found in uploaded PDF'.",
      "Treat as carrier/solvent for dashboard note-role logic.",
    ],
  },
  "isopropyl myristate": {
    canonicalName: "Isopropyl Myristate",
    cas: [],
    synonyms: ["ipm"],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [],
    },
    notes: [
      "No matching IFRA standard was located in the uploaded PDF during this pass.",
      "Do not render as unrestricted; render as 'no specific IFRA standard found in uploaded PDF'.",
      "Treat as carrier/solvent for dashboard note-role logic.",
    ],
  },
  "benzyl salicylate": {
    canonicalName: "Benzyl Salicylate",
    cas: ["118-58-1"],
    synonyms: [
      "benzyl salicylate",
      "benzyl 2-hydroxybenzoate",
    ],
    recommendationType: "restriction",
    status: "active",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: 7.3,
      cat5b: 1.5,
      cat9: 7.3,
      cat1: 1.3,
    },
    limitUnit: "%",
    source: {
      document: "Beach Box repo IFRA seed",
      pages: [3],
    },
    notes: [
      "Cat 4 and related limits were promoted from the repo IFRA seed in beach-box-perfumery/apply_ifra_v2.py.",
    ],
  },
  "coumarin": {
    canonicalName: "Coumarin",
    cas: ["91-64-5"],
    synonyms: ["coumarin"],
    recommendationType: "restriction",
    status: "active",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: 1.5,
      cat5b: 0.23,
      cat9: 0.57,
      cat1: 0.089,
    },
    limitUnit: "%",
    source: {
      document: "Beach Box repo IFRA seed",
      pages: [5],
    },
    notes: [
      "Cat 4 and related limits were promoted from the repo IFRA seed in beach-box-perfumery/apply_ifra_v2.py.",
    ],
  },
  "hexyl cinnamic aldehyde": {
    canonicalName: "Hexyl Cinnamic Aldehyde",
    cas: ["101-86-0"],
    synonyms: [
      "hexyl cinnamic aldehyde",
      "alpha-hexyl cinnamaldehyde",
    ],
    recommendationType: "restriction",
    status: "active",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: 9.9,
      cat5b: 2.1,
      cat9: 9.9,
    },
    limitUnit: "%",
    source: {
      document: "Beach Box repo IFRA seed",
      pages: [134],
    },
    notes: [
      "Cat 4 and related limits were promoted from the repo IFRA seed in beach-box-perfumery/apply_ifra_v2.py.",
    ],
  },
  "oakmoss absolute": {
    canonicalName: "Oakmoss Absolute",
    cas: ["9000-50-4"],
    synonyms: [
      "oakmoss absolute",
      "oakmoss",
      "evernia prunastri extract",
    ],
    recommendationType: "restriction",
    status: "active",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: 0.1,
      cat5b: 0.02,
    },
    limitUnit: "%",
    source: {
      document: "Beach Box repo IFRA seed",
      pages: [216],
    },
    notes: [
      "Cat 4 and related limits were promoted from the repo IFRA seed in beach-box-perfumery/apply_ifra_v2.py.",
    ],
  },
  "bergamot expressed": {
    canonicalName: "Bergamot expressed",
    cas: ["68648-33-9"],
    synonyms: [
      "bergamot expressed",
      "bergamot oil",
      "bergamot",
    ],
    recommendationType: "restriction",
    status: "active",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: 0.4,
    },
    limitUnit: "%",
    source: {
      document: "Beach Box repo IFRA seed",
      pages: [3],
    },
    notes: [
      "Cat 4 limit was promoted from the repo IFRA seed in beach-box-perfumery/apply_ifra_v2.py.",
      "This regular expressed bergamot helper record must not be applied to explicitly FCF / furocoumarin-free bergamot rows.",
    ],
  },
  "bergamot eo fcf": {
    canonicalName: "Bergamot EO FCF",
    cas: ["68648-33-9"],
    synonyms: [
      "bergamot eo fcf",
      "bergamot fcf",
      "bergamot oil fcf",
      "bergamot oil fcf, cote d'ivoire",
      "bergamot oil fcf, côte d'ivoire",
      "bergamot oil fcf organic",
      "bergamot oil fcf, organic",
      "bergamot oil fcf terpeneless",
      "bergamot oil fcf, terpeneless",
      "bergamot superior oil fcf",
      "bergamot superior oil, fcf",
    ],
    recommendationType: null,
    status: "active",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "Beach Box repo IFRA seed",
      pages: [3],
    },
    missingLimitReason:
      "FCF / furocoumarin-free support — regular expressed bergamot phototoxic limit not applied. Verify supplier IFRA/SDS for final compliance.",
    notes: [
      "Explicit FCF / furocoumarin-free bergamot support row.",
      "The prior helper mapped this row to regular expressed bergamot and applied the phototoxic Cat 4 limit, which created a false positive for FCF formula rows.",
      "No source-backed replacement Cat 4 limit has been promoted here; keep supplier IFRA/SDS verification as the final compliance step.",
    ],
  },
  "lemon eo italy": {
    canonicalName: "Lemon EO Italy",
    cas: ["84929-31-7"],
    synonyms: [
      "lemon expressed",
      "lemon eo italy",
      "lemon italy",
      "lemon oil",
      "lemon",
    ],
    recommendationType: "restriction",
    status: "active",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: 2.0,
    },
    limitUnit: "%",
    source: {
      document: "Beach Box repo IFRA seed",
      pages: [10],
    },
    notes: [
      "Cat 4 limit was promoted from the repo IFRA seed in beach-box-perfumery/apply_ifra_v2.py.",
    ],
  },
  "lemon fcf": {
    canonicalName: "Lemon FCF",
    cas: ["84929-31-7"],
    synonyms: [
      "lemon fcf",
      "lemon eo fcf",
      "lemon oil fcf",
      "furocoumarin-free lemon",
      "lemon furocoumarin free",
    ],
    recommendationType: null,
    status: "active",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "Beach Box repo IFRA seed",
      pages: [10],
    },
    missingLimitReason:
      "FCF / furocoumarin-free support - regular cold-pressed lemon phototoxic limit not applied. Verify supplier IFRA/SDS for final compliance.",
    notes: [
      "Explicit FCF / furocoumarin-free lemon support row.",
      "No source-backed replacement Cat 4 limit has been promoted here; keep supplier IFRA/SDS verification as the final compliance step.",
    ],
  },
  "jasmine sambac absolute": {
    canonicalName: "Jasmine Sambac Absolute",
    cas: ["91771-65-6"],
    synonyms: [
      "jasmine sambac absolute",
      "jasmine sambac",
      "jasminum sambacum flower extract",
    ],
    recommendationType: "restriction",
    status: "active",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: 3.8,
      cat5b: 0.76,
    },
    limitUnit: "%",
    source: {
      document: "Beach Box repo IFRA seed",
      pages: [],
    },
    notes: [
      "Cat 4 and related limits were promoted from the repo IFRA seed in beach-box-perfumery/apply_ifra_v2.py.",
    ],
  },
  "ylang ylang extra absolute": {
    canonicalName: "Ylang Ylang Extra Absolute",
    cas: [],
    synonyms: [
      "ylang ylang extra absolute",
      "ylang ylang extra",
      "ylang ylang oil",
      "ylang ylang",
    ],
    recommendationType: "restriction",
    status: "active",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: 0.73,
    },
    limitUnit: "%",
    source: {
      document: "Beach Box repo IFRA seed",
      pages: [],
    },
    notes: [
      "Cat 4 limit was promoted from the repo IFRA seed in beach-box-perfumery/apply_ifra_v2.py.",
    ],
  },
  "labdanum absolute": {
    canonicalName: "Labdanum Absolute",
    cas: ["8016-26-0"],
    synonyms: [
      "labdanum absolute",
      "labdanum",
      "cistus ladaniferus resin extract",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [],
    },
    notes: [
      "No matching IFRA standard was located in the uploaded PDF during this pass.",
      "Maps diluted labdanum stock names to a canonical helper identity so stock active-percent handling can apply when IFRA limits are added later.",
    ],
  },
  "vanilla co2": {
    canonicalName: "Vanilla CO2",
    cas: ["8024-06-4"],
    synonyms: [
      "vanilla co2",
      "vanilla planifolia fruit co2 extract",
      "vanilla",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [],
    },
    notes: [
      "No matching IFRA standard was located in the uploaded PDF during this pass.",
      "Maps diluted vanilla CO2 stock names to a canonical helper identity so stock active-percent handling can apply when IFRA limits are added later.",
    ],
  },
  "tolu balsam resinoid": {
    canonicalName: "Tolu Balsam Resinoid",
    cas: [],
    synonyms: [
      "tolu balsam resinoid",
      "tolu balsam",
      "tolu balsam resinoid 50% tec",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [],
    },
    notes: [
      "Canonical helper seed for normalization inheritance coverage.",
      "The current repo represents this material through the live diluted-stock row Tolu Balsam Resinoid 50% TEC.",
      "No structured IFRA standard or source-backed canonical CAS/INCI chemistry has been promoted yet.",
    ],
  },
  "poplar bud absolute": {
    canonicalName: "Poplar Bud Absolute",
    cas: [],
    synonyms: [
      "poplar bud absolute",
      "poplar buds absolute",
      "poplar bud",
      "poplar bud absolute 50% tec",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [],
    },
    notes: [
      "Canonical helper seed for normalization inheritance coverage.",
      "The current repo represents this material through the live diluted-stock row Poplar Bud Absolute 50% TEC.",
      "No structured IFRA standard or source-backed canonical CAS/INCI chemistry has been promoted yet.",
    ],
  },
  "benzoin siam resinoid": {
    canonicalName: "Benzoin Siam Resinoid",
    cas: [],
    synonyms: [
      "benzoin siam resinoid",
      "benzoin siam resinoid 50% tec",
      "benzoin siam resinoid 50",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [],
    },
    notes: [
      "Canonical helper seed for normalization inheritance coverage.",
      "The current repo represents this material through the live diluted-stock row Benzoin Siam Resinoid 50% TEC.",
      "No structured IFRA standard or source-backed canonical CAS/INCI chemistry has been promoted yet.",
    ],
  },
  "agarwood oil": {
    canonicalName: "Agarwood Oil",
    cas: [],
    synonyms: [
      "agarwood oil",
      "oud co2",
      "oud",
      "aquilaria malaccensis wood co2 extract",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [352],
    },
    notes: [
      "Helper maps oud/agarwood diluted stock names to a canonical identity from the uploaded source dataset.",
      "Exact IFRA category limits have not yet been promoted into the structured helper dataset, so do not treat this as unrestricted.",
    ],
  },
  linalool: {
    canonicalName: "Linalool",
    cas: ["78-70-6"],
    synonyms: [
      "linalool",
      "linalool natural",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [10],
    },
    notes: [
      "Helper maps Linalool Natural to a canonical linalool identity using app CAS/INCI data.",
      "A PDF index match exists in the uploaded source dataset, but no structured IFRA standard has been promoted into the helper dataset yet.",
    ],
  },
  "clove bud absolute": {
    canonicalName: "Clove Bud Absolute",
    cas: ["8015-97-2"],
    synonyms: [
      "clove bud absolute",
      "clove bud",
      "eugenia caryophyllata bud extract",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [],
    },
    notes: [
      "Helper maps Clove Bud Absolute to a canonical identity using app CAS/INCI data.",
      "No structured IFRA standard has been promoted into the helper dataset yet.",
    ],
  },
  "violet leaf absolute": {
    canonicalName: "Violet Leaf Absolute",
    cas: ["8024-08-6"],
    synonyms: [
      "violet leaf absolute",
      "violet leaf",
      "viola odorata leaf extract",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [],
    },
    notes: [
      "Helper maps Violet Leaf Absolute to a canonical identity using app CAS/INCI data.",
      "No structured IFRA standard has been promoted into the helper dataset yet.",
    ],
  },
  "neroli absolute": {
    canonicalName: "Neroli Absolute",
    cas: ["8016-38-4"],
    synonyms: [
      "neroli absolute",
      "neroli oil",
      "neroli",
      "citrus aurantium flower extract",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [],
    },
    notes: [
      "Helper maps Neroli Absolute to a canonical identity using app CAS/INCI data.",
      "No structured IFRA standard has been promoted into the helper dataset yet.",
    ],
  },
  "benzyl acetate": {
    canonicalName: "Benzyl Acetate",
    cas: ["140-11-4"],
    synonyms: [
      "benzyl acetate",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [],
    },
    notes: [
      "Helper maps Benzyl Acetate to a canonical identity using app CAS data.",
      "No structured IFRA standard has been promoted into the helper dataset yet.",
    ],
  },
  "cognac absolute": {
    canonicalName: "Cognac Absolute",
    cas: ["8016-44-2"],
    synonyms: [
      "cognac absolute",
      "cognac",
      "vitis vinifera distillate extract",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [],
    },
    notes: [
      "Helper maps Cognac Absolute to a canonical identity using app CAS/INCI data.",
      "No structured IFRA standard has been promoted into the helper dataset yet.",
    ],
  },
  "tobacco absolute": {
    canonicalName: "Tobacco Absolute",
    cas: ["8016-68-0"],
    synonyms: [
      "tobacco absolute",
      "tobacco",
      "nicotiana tabacum leaf extract",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [],
    },
    notes: [
      "Helper maps Tobacco Absolute to a canonical identity using app CAS/INCI data.",
      "No structured IFRA standard has been promoted into the helper dataset yet.",
    ],
  },
  "sweet orange absolute": {
    canonicalName: "Sweet Orange Absolute",
    cas: ["8028-48-6"],
    synonyms: [
      "sweet orange absolute",
      "sweet orange",
      "sweet orange oil",
      "orange oil",
      "citrus sinensis peel extract",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [282],
    },
    notes: [
      "Helper maps Sweet Orange Absolute to a canonical identity using app CAS/INCI data.",
      "A likely PDF text match exists in the uploaded source dataset, but no structured IFRA standard has been promoted into the helper dataset yet.",
    ],
  },
  "peru balsam oil": {
    canonicalName: "Peru Balsam Oil",
    cas: ["8007-00-9"],
    synonyms: [
      "peru balsam oil",
      "balsam peru eo",
      "balsam peru",
      "peru balsam",
      "myroxylon pereirae resin oil",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [229],
    },
    notes: [
      "Helper maps Balsam Peru EO to a canonical Peru Balsam Oil identity using app CAS/INCI data.",
      "A likely PDF text match exists in the uploaded source dataset, but no structured IFRA standard has been promoted into the helper dataset yet.",
    ],
  },
  "benzoin siam absolute": {
    canonicalName: "Benzoin Siam Absolute",
    cas: ["9000-72-0"],
    synonyms: [
      "benzoin siam absolute",
      "benzoin siam",
      "benzoin resinoid",
      "benzoin",
      "styrax tonkinensis resin extract",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [],
    },
    notes: [
      "Helper maps Benzoin Siam Absolute to a canonical identity using app CAS/INCI data.",
      "No structured IFRA standard has been promoted into the helper dataset yet.",
    ],
  },
  "coconut co2": {
    canonicalName: "Coconut CO2",
    cas: ["8001-31-8"],
    synonyms: [
      "coconut co2",
      "coconut",
      "cocos nucifera oil co2 extract",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [],
    },
    notes: [
      "Helper maps Coconut CO2 to a canonical identity using app CAS/INCI data.",
      "No structured IFRA standard has been promoted into the helper dataset yet.",
    ],
  },
  "vanilla absolute": {
    canonicalName: "Vanilla Absolute",
    cas: ["8006-39-1"],
    synonyms: [
      "vanilla absolute",
      "vanilla",
      "vanilla planifolia fruit extract",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [],
    },
    notes: [
      "Helper maps Vanilla Absolute to a canonical identity using app CAS/INCI data.",
      "No structured IFRA standard has been promoted into the helper dataset yet.",
    ],
  },
  "vanilla bourbon absolute": {
    canonicalName: "Vanilla Bourbon Absolute",
    cas: ["84650-60-2"],
    synonyms: [
      "vanilla bourbon absolute",
      "vanilla bourbon",
      "vanilla planifolia bourbon fruit extract",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [],
    },
    notes: [
      "Helper maps Vanilla Bourbon Absolute to a canonical identity using app CAS/INCI data.",
      "No structured IFRA standard has been promoted into the helper dataset yet.",
    ],
  },
  "petitgrain bigarade eo": {
    canonicalName: "Petitgrain Bigarade EO",
    cas: ["8014-17-3"],
    synonyms: [
      "petitgrain bigarade eo",
      "petitgrain bigarade",
      "petitgrain oil",
      "petitgrain",
      "citrus aurantium leaf/twig oil",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [286],
    },
    notes: [
      "Helper maps Petitgrain Bigarade EO to a canonical identity using app CAS/INCI data.",
      "A likely PDF text match exists in the uploaded source dataset, but no structured IFRA standard has been promoted into the helper dataset yet.",
    ],
  },
  "cedarwood virginia eo": {
    canonicalName: "Cedarwood Virginia EO",
    cas: ["8000-27-9"],
    synonyms: [
      "cedarwood virginia eo",
      "cedarwood virginia",
      "virginia cedarwood",
      "cedarwood oil",
      "juniperus virginiana wood oil",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [],
    },
    notes: [
      "Helper maps Cedarwood Virginia EO to a canonical identity using app CAS/INCI data.",
      "No structured IFRA standard has been promoted into the helper dataset yet.",
    ],
  },
  "vetiver bourbon eo": {
    canonicalName: "Vetiver Bourbon EO",
    cas: ["8016-96-4"],
    synonyms: [
      "vetiver bourbon eo",
      "vetiver bourbon",
      "vetiver oil",
      "vetiver",
      "vetiveria zizanoides root oil",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [20],
    },
    notes: [
      "Helper maps Vetiver Bourbon EO to a canonical identity using app CAS/INCI data.",
      "A likely PDF text match exists in the uploaded source dataset, but no structured IFRA standard has been promoted into the helper dataset yet.",
    ],
  },
  "juniper berry co2": {
    canonicalName: "Juniper Berry CO2",
    cas: ["8012-91-7"],
    synonyms: [
      "juniper berry co2",
      "juniper berry",
      "juniper berry oil",
      "juniperus communis",
      "juniperus communis fruit co2 extract",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [],
    },
    notes: [
      "Helper maps Juniper Berry CO2 to a canonical identity using app CAS/INCI data.",
      "No structured IFRA standard has been promoted into the helper dataset yet.",
    ],
  },
  "galbanum absolute": {
    canonicalName: "Galbanum Absolute",
    cas: ["8023-91-4"],
    synonyms: [
      "galbanum absolute",
      "galbanum",
      "ferula galbaniflua resin extract",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [],
    },
    notes: [
      "Helper maps Galbanum Absolute to a canonical identity using app CAS/INCI data.",
      "No structured IFRA standard has been promoted into the helper dataset yet.",
    ],
  },
  "himalayan cedarwood eo": {
    canonicalName: "Himalayan Cedarwood EO",
    cas: ["8023-85-6"],
    synonyms: [
      "himalayan cedarwood eo",
      "himalayan cedarwood",
      "cedrus deodara wood oil",
    ],
    recommendationType: null,
    status: "not_found_in_uploaded_pdf",
    publicationYear: null,
    amendment: null,
    implementationDates: {
      newCreation: null,
      existingCreation: null,
    },
    limits: {
      cat4: null,
    },
    limitUnit: "%",
    source: {
      document: "IFRA - 51st Amendment.pdf",
      pages: [],
    },
    notes: [
      "Helper maps Himalayan Cedarwood EO to a canonical identity using app CAS/INCI data.",
      "No structured IFRA standard has been promoted into the helper dataset yet.",
    ],
  },
};

export const IFRA_MASTER_DATASET_METADATA = ifraMasterDataset.metadata;
const HERO_FORMULA_MATERIAL_NORMALIZATION_ENTRIES =
  buildHeroFormulaMaterialNormalizationEntries(materialNormalization);
export const MATERIAL_NORMALIZATION = {
  ...materialNormalization,
  ...HERO_FORMULA_MATERIAL_NORMALIZATION_ENTRIES,
};
export const SOURCE_DOCUMENT_REGISTRY_METADATA =
  sourceDocumentRegistry.metadata;
export const SOURCE_DOCUMENT_REGISTRY =
  sourceDocumentRegistry.documents || {};
export const SOURCE_DOCUMENT_INTAKE_TARGETS =
  sourceDocumentRegistry.intakeTargets || {};
export const EVIDENCE_CANDIDATE_REGISTRY_METADATA =
  evidenceCandidateRegistry.metadata;
export const EVIDENCE_CANDIDATES = evidenceCandidateRegistry.candidates || {};
export const EVIDENCE_CANDIDATE_TARGETS =
  evidenceCandidateRegistry.candidateTargets || {};
export const SUPPLIER_PRODUCT_REGISTRY_METADATA =
  supplierProductRegistry.metadata;
export const SUPPLIER_PRODUCT_REGISTRY =
  supplierProductRegistry.products || {};
export const SUPPLIER_IMPORT_REVIEW_QUEUE_METADATA =
  supplierImportReviewQueue.metadata;
export const SUPPLIER_IMPORT_REVIEW_QUEUE =
  supplierImportReviewQueue.items || {};

function cloneJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item)])
    );
  }
  return value;
}

function normalizeRegistryText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getUrlSlugFromValue(url) {
  try {
    const pathname = new URL(String(url || "")).pathname
      .replace(/^\/+|\/+$/g, "")
      .replace(/\.html?$/i, "")
      .trim();
    return pathname || null;
  } catch {
    return null;
  }
}

const SUPPLIER_KEY_BY_DISPLAY_NAME = Object.fromEntries(
  Object.entries(SUPPLIER_PRODUCT_REGISTRY_METADATA?.suppliers || {}).map(
    ([supplierKey, supplier]) => [supplier?.displayName, supplierKey]
  )
);

const SUPPLIER_PRODUCT_KEYS_BY_CATALOG_NAME = Object.entries(
  SUPPLIER_PRODUCT_REGISTRY
).reduce((acc, [supplierProductKey, record]) => {
  const catalogName = record?.mappedCatalogName;
  if (!catalogName) return acc;
  if (!acc[catalogName]) acc[catalogName] = [];
  acc[catalogName].push(supplierProductKey);
  return acc;
}, {});

const SUPPLIER_PRODUCT_KEYS_BY_CANONICAL_KEY = Object.entries(
  SUPPLIER_PRODUCT_REGISTRY
).reduce((acc, [supplierProductKey, record]) => {
  const canonicalMaterialKey = record?.mappedCanonicalMaterialKey;
  if (!canonicalMaterialKey) return acc;
  if (!acc[canonicalMaterialKey]) acc[canonicalMaterialKey] = [];
  acc[canonicalMaterialKey].push(supplierProductKey);
  return acc;
}, {});

const SOURCE_DOCUMENT_KEYS_BY_CANONICAL_KEY = Object.entries(
  SOURCE_DOCUMENT_REGISTRY
).reduce((acc, [sourceDocumentKey, record]) => {
  const canonicalMaterialKey = record?.canonicalMaterialKey;
  if (!canonicalMaterialKey) return acc;
  if (!acc[canonicalMaterialKey]) acc[canonicalMaterialKey] = [];
  acc[canonicalMaterialKey].push(sourceDocumentKey);
  return acc;
}, {});

const EVIDENCE_CANDIDATE_KEYS_BY_CANONICAL_KEY = Object.entries(
  EVIDENCE_CANDIDATES
).reduce((acc, [evidenceCandidateKey, record]) => {
  const canonicalMaterialKey = record?.canonicalMaterialKey;
  if (!canonicalMaterialKey) return acc;
  if (!acc[canonicalMaterialKey]) acc[canonicalMaterialKey] = [];
  acc[canonicalMaterialKey].push(evidenceCandidateKey);
  return acc;
}, {});

export function getSupplierRegistrySupplierKey(supplierNameOrKey) {
  if (!supplierNameOrKey) return null;
  if (
    SUPPLIER_PRODUCT_REGISTRY_METADATA?.suppliers?.[supplierNameOrKey]
  ) {
    return supplierNameOrKey;
  }

  return (
    SUPPLIER_KEY_BY_DISPLAY_NAME[supplierNameOrKey] ||
    normalizeRegistryText(supplierNameOrKey) ||
    null
  );
}

export function buildSupplierProductKey({
  supplierKey,
  supplierName,
  url,
  sku,
}) {
  const resolvedSupplierKey = getSupplierRegistrySupplierKey(
    supplierKey || supplierName
  );
  if (!resolvedSupplierKey) return null;

  const stableIdentifier = normalizeRegistryText(sku) || getUrlSlugFromValue(url);
  if (!stableIdentifier) return null;

  return `${resolvedSupplierKey}:${stableIdentifier}`;
}

export function getSupplierProductRecord(supplierProductKey) {
  const record = SUPPLIER_PRODUCT_REGISTRY[supplierProductKey];
  return record ? cloneJsonValue(record) : null;
}

export function getSupplierProductsForCatalogName(catalogName) {
  const keys = SUPPLIER_PRODUCT_KEYS_BY_CATALOG_NAME[catalogName] || [];
  return keys
    .map((key) => getSupplierProductRecord(key))
    .filter(Boolean);
}

export function getSupplierProductsForCanonicalMaterialKey(
  canonicalMaterialKey
) {
  const keys =
    SUPPLIER_PRODUCT_KEYS_BY_CANONICAL_KEY[canonicalMaterialKey] || [];
  return keys
    .map((key) => getSupplierProductRecord(key))
    .filter(Boolean);
}

export function getSourceDocumentRecord(sourceDocumentKey) {
  const record = SOURCE_DOCUMENT_REGISTRY[sourceDocumentKey];
  return record ? cloneJsonValue(record) : null;
}

export function getSourceDocumentsForCanonicalMaterialKey(
  canonicalMaterialKey
) {
  const keys = SOURCE_DOCUMENT_KEYS_BY_CANONICAL_KEY[canonicalMaterialKey] || [];
  return keys
    .map((key) => ({
      sourceDocumentKey: key,
      ...getSourceDocumentRecord(key),
    }))
    .filter(Boolean);
}

export function getEvidenceCandidateRecord(evidenceCandidateKey) {
  const record = EVIDENCE_CANDIDATES[evidenceCandidateKey];
  return record ? cloneJsonValue(record) : null;
}

export function getEvidenceCandidatesForCanonicalMaterialKey(
  canonicalMaterialKey
) {
  const keys =
    EVIDENCE_CANDIDATE_KEYS_BY_CANONICAL_KEY[canonicalMaterialKey] || [];
  return keys
    .map((key) => ({
      evidenceCandidateKey: key,
      ...getEvidenceCandidateRecord(key),
    }))
    .filter(Boolean);
}

export function getPendingEvidenceCandidateTargets() {
  return Object.entries(EVIDENCE_CANDIDATE_TARGETS)
    .filter(([, target]) => {
      const status = String(target?.reviewStatus || "").trim().toLowerCase();
      return !status || status.startsWith("awaiting") || status.startsWith("pending");
    })
    .map(([targetKey, target]) => ({
      targetKey,
      ...cloneJsonValue(target),
    }));
}

export function getPendingSupplierImportItems() {
  return Object.values(SUPPLIER_IMPORT_REVIEW_QUEUE)
    .filter((item) => {
      const status = String(item?.reviewStatus || "").trim().toLowerCase();
      return !status || status.startsWith("pending");
    })
    .map((item) => cloneJsonValue(item));
}

const CANONICAL_ENTRY_NAME_BY_KEY = Object.fromEntries(
  Object.entries(MATERIAL_NORMALIZATION)
    .filter(
      ([, entry]) =>
        entry?.entryKind === "canonical_material" && entry?.canonicalMaterialKey
    )
    .map(([name, entry]) => [entry.canonicalMaterialKey, name])
);

export function getMaterialNormalizationEntry(name) {
  return MATERIAL_NORMALIZATION[name] || null;
}

export function getCanonicalCatalogName(name) {
  const normalizationEntry = getMaterialNormalizationEntry(name);
  const canonicalMaterialKey = normalizationEntry?.canonicalMaterialKey;
  if (!canonicalMaterialKey) return null;

  const canonicalName = CANONICAL_ENTRY_NAME_BY_KEY[canonicalMaterialKey] || null;
  return canonicalName && canonicalName !== name ? canonicalName : null;
}

const CANONICAL_MATERIAL_SOURCE_DATA = {
  ylang_ylang_extra_oil: {
    canonicalMaterialKey: "ylang_ylang_extra_oil",
    canonicalName: "Ylang-Ylang Extra Oil",
    note: "mid",
    type: "EO",
    cas: "8006-81-3",
    inci: "Cananga Odorata Flower Oil",
    scentClass: "Floral",
    scentSummary: "Diffusive creamy ylang extra oil",
    scentDesc:
      "Canonical helper source seed for the ylang extra-oil family. Supplier product pages indicate this family is an essential oil, not an absolute.",
    rep: "Benzyl Acetate",
    isUVCB: true,
    descriptorTags: ["Floral", "Creamy", "Ylang"],
  },
  ylang_ylang_absolute: {
    canonicalMaterialKey: "ylang_ylang_absolute",
    canonicalName: "Ylang-Ylang Absolute",
    note: "mid",
    type: "ABS",
    cas: "8006-81-3",
    inci: "Cananga Odorata Flower Extract",
    scentClass: "Floral",
    scentSummary: "Creamy, exotic banana-floral",
    scentDesc:
      "Canonical helper source seed for ylang-ylang absolute. Supplier identity is supported, and the current catalog already carries source-backed CAS and INCI metadata.",
    rep: "Benzyl Acetate",
    isUVCB: true,
    descriptorTags: ["Floral", "Creamy", "Ylang"],
  },
  ylang_ylang_complete_oil: {
    canonicalMaterialKey: "ylang_ylang_complete_oil",
    canonicalName: "Ylang-Ylang Complete Oil",
    note: "mid",
    type: "EO",
    cas: "8006-81-3",
    inci: "Cananga Odorata Flower Oil",
    scentClass: "Floral",
    scentSummary: "Ylang-ylang complete essential oil",
    scentDesc:
      "Canonical helper source seed for the complete-distillation ylang family. The repo already treats the ylang essential-oil family as Cananga Odorata Flower Oil, but detailed source-backed IFRA identity has not been promoted yet for this specific grade.",
    isUVCB: true,
    descriptorTags: ["Floral", "Ylang", "EO"],
  },
  ylang_ylang_fine_oil: {
    canonicalMaterialKey: "ylang_ylang_fine_oil",
    canonicalName: "Ylang-Ylang Fine Oil",
    type: "EO",
    cas: "8006-81-3",
    inci: "Cananga Odorata Flower Oil",
    scentClass: "Floral",
    scentSummary: "Ylang-ylang fine grade essential oil",
    scentDesc:
      "Canonical helper source seed for the ylang fine-oil grade. Supplier identity is supported, and the repo already treats the ylang essential-oil family as Cananga Odorata Flower Oil, but detailed source-backed IFRA identity has not been promoted yet for this grade.",
    isUVCB: true,
    descriptorTags: ["Floral", "Ylang", "EO"],
  },
  ylang_ylang_i_oil: {
    canonicalMaterialKey: "ylang_ylang_i_oil",
    canonicalName: "Ylang-Ylang I Oil",
    type: "EO",
    cas: "8006-81-3",
    inci: "Cananga Odorata Flower Oil",
    scentClass: "Floral",
    scentSummary: "Ylang-ylang grade I essential oil",
    scentDesc:
      "Canonical helper source seed for the ylang grade I oil family. Supplier identity is supported, and the repo already treats the ylang essential-oil family as Cananga Odorata Flower Oil, but detailed source-backed IFRA identity has not been promoted yet for this grade.",
    isUVCB: true,
    descriptorTags: ["Floral", "Ylang", "EO"],
  },
  ylang_ylang_ii_oil: {
    canonicalMaterialKey: "ylang_ylang_ii_oil",
    canonicalName: "Ylang-Ylang II Oil",
    type: "EO",
    cas: "8006-81-3",
    inci: "Cananga Odorata Flower Oil",
    scentClass: "Floral",
    scentSummary: "Ylang-ylang grade II essential oil",
    scentDesc:
      "Canonical helper source seed for the ylang grade II oil family. Supplier identity is supported, and the repo already treats the ylang essential-oil family as Cananga Odorata Flower Oil, but detailed source-backed IFRA identity has not been promoted yet for this grade.",
    isUVCB: true,
    descriptorTags: ["Floral", "Ylang", "EO"],
  },
  ylang_ylang_iii_oil: {
    canonicalMaterialKey: "ylang_ylang_iii_oil",
    canonicalName: "Ylang-Ylang III Oil",
    note: "mid",
    type: "EO",
    cas: "8006-81-3",
    inci: "Cananga Odorata Flower Oil",
    scentClass: "Floral",
    scentSummary: "Ylang-ylang grade III essential oil",
    scentDesc:
      "Canonical helper source seed for the ylang grade III oil family. Supplier identity is supported, and the repo already treats the ylang essential-oil family as Cananga Odorata Flower Oil, but detailed source-backed IFRA identity has not been promoted yet for this grade.",
    isUVCB: true,
    descriptorTags: ["Floral", "Ylang", "EO"],
  },
  ylang_imperiale: {
    canonicalMaterialKey: "ylang_imperiale",
    canonicalName: "Ylang Impériale",
    note: "mid",
    type: "SYNTH",
    scentClass: "Floral",
    scentSummary: "Vendor-style ylang accord/product",
    scentDesc:
      "Canonical helper source seed for the Ylang Impériale accord-style row. Treat as a separate vendor product identity, not as a canonical ylang raw material family or IFRA-listed source.",
    descriptorTags: ["Floral", "Ylang", "Accord"],
  },
  neroli_absolute: {
    canonicalMaterialKey: "neroli_absolute",
    canonicalName: "Neroli Absolute",
    note: "top",
    type: "ABS",
    cas: "8016-38-4",
    inci: "Citrus Aurantium Flower Extract",
    scentClass: "Floral",
    scentSummary: "Bright, honeyed orange blossom",
    scentDesc:
      "Canonical helper source seed for neroli absolute. The current catalog already carries source-backed CAS, INCI, and descriptive identity metadata, but supplier ownership remains intentionally conservative until a clearly matching absolute listing is present.",
    rep: "Linalool",
    isUVCB: true,
    descriptorTags: ["Floral", "Orange Blossom", "Absolute"],
  },
  orange_blossom_water_absolute: {
    canonicalMaterialKey: "orange_blossom_water_absolute",
    canonicalName: "Orange Blossom Water Absolute",
    note: "mid",
    type: "ABS",
    cas: "68917-75-9",
    inci: "Citrus Aurantium Flower Water Extract",
    scentClass: "Floral",
    scentSummary: "Watery orange blossom with grape facet",
    scentDesc:
      "Canonical helper source seed for orange blossom water absolute. The current catalog already carries source-backed CAS, INCI, and descriptive identity metadata, but IFRA promotion remains conservative until structured standards coverage is promoted.",
    rep: "Methyl Anthranilate",
    isUVCB: true,
    descriptorTags: ["Floral", "Orange Blossom", "Water Absolute"],
  },
  petitgrain_bigarade_eo: {
    canonicalMaterialKey: "petitgrain_bigarade_eo",
    canonicalName: "Petitgrain Bigarade EO",
    note: "top",
    type: "EO",
    cas: "8014-17-3",
    inci: "Citrus Aurantium Leaf/Twig Oil",
    scentClass: "Citrus",
    scentSummary: "Green, woody citrus bridge note",
    scentDesc:
      "Canonical helper source seed for petitgrain bigarade essential oil. The current catalog already carries source-backed CAS, INCI, and descriptive identity metadata.",
    rep: "Linalyl Acetate",
    isUVCB: true,
    descriptorTags: ["Citrus", "Green", "Petitgrain"],
  },
  benzyl_acetate: {
    canonicalMaterialKey: "benzyl_acetate",
    canonicalName: "Benzyl Acetate",
    note: "mid",
    type: "SYNTH",
    cas: "140-11-4",
    inci: "Benzyl Acetate",
    scentClass: "Floral",
    scentSummary: "Jasmine-sweet fruity floral",
    scentDesc:
      "The current catalog treats benzyl acetate as a jasmine-ylang floral body material with sweet, fruity lift. This seed is source-backed from the live catalog row, but IFRA promotion remains conservative until structured standards coverage is promoted.",
    rep: "Benzyl Acetate",
    descriptorTags: ["Floral", "Fruity", "Jasmine"],
  },
  peru_balsam_oil: {
    canonicalMaterialKey: "peru_balsam_oil",
    canonicalName: "Peru Balsam Oil",
    note: "base",
    type: "EO",
    cas: "8007-00-9",
    inci: "Myroxylon Pereirae Resin Oil",
    scentClass: "Oriental",
    scentSummary: "Resinous cinnamic amber balsam warmth",
    scentDesc:
      "Benzyl benzoate and cinnamic esters give this a warm, sweet-resinous, cinnamic amber character. Excellent fixative with a warm balsamic depth. Pairs beautifully with vanilla, musks, and woody notes in oriental bases.",
    rep: "Benzyl Benzoate",
    isUVCB: true,
    descriptorTags: ["Balsamic", "Amber", "Resinous"],
  },
  peru_balsam_resinoid: {
    canonicalMaterialKey: "peru_balsam_resinoid",
    canonicalName: "Peru Balsam Resinoid",
    note: "base",
    type: "ABS",
    inci: "Myroxylon Pereirae Oil/Extract",
    scentClass: "Amber",
    scentSummary: "Peru balsam resinoid",
    scentDesc:
      "Canonical helper source seed for Peru balsam resinoid. Supplier identity is supported, but detailed source-backed chemistry and IFRA identity have not been promoted yet.",
    isUVCB: true,
    descriptorTags: ["Amber", "Resinoid", "Balsamic"],
  },
  benzoin_siam_absolute: {
    canonicalMaterialKey: "benzoin_siam_absolute",
    canonicalName: "Benzoin Siam Absolute",
    note: "base",
    type: "ABS",
    cas: "9000-72-0",
    inci: "Styrax Tonkinensis Resin Extract",
    scentClass: "Oriental",
    scentSummary: "Balsamic vanilla-sweet benzoin warmth",
    scentDesc:
      "From Styrax tonkinensis resin — sweet, warm balsamic character with benzaldehyde-vanilla facets. One of the great fixatives of perfumery. Adds warmth, roundness, and oriental depth to any accord. Anchors musks and florals beautifully.",
    rep: "Benzyl Benzoate",
    isUVCB: true,
    descriptorTags: ["Balsamic", "Vanilla", "Resin"],
  },
  benzoin_siam_resinoid: {
    canonicalMaterialKey: "benzoin_siam_resinoid",
    canonicalName: "Benzoin Siam Resinoid",
    note: "base",
    type: "ABS",
    cas: "9000-72-0",
    scentClass: "Amber",
    scentSummary: "Benzoin Siam resinoid",
    scentDesc:
      "Canonical helper source seed for benzoin Siam resinoid. The current repo represents this material through the live diluted-stock row Benzoin Siam Resinoid 50% TEC by Fraterworks/Mane, but source-backed canonical CAS/INCI chemistry and IFRA identity have not been promoted yet.",
    isUVCB: true,
    descriptorTags: ["Amber", "Resinoid", "Balsamic"],
  },
  labdanum_absolute: {
    canonicalMaterialKey: "labdanum_absolute",
    canonicalName: "Labdanum Absolute",
    note: "mid",
    type: "ABS",
    cas: "8016-26-0",
    inci: "Cistus Ladaniferus Resin Extract",
    scentClass: "Oriental",
    scentSummary: "Resinous amber leathery Mediterranean",
    scentDesc:
      "The current catalog source row describes labdanum absolute as the classical amber-resin base: warm, leathery, balsamic, and strongly fixative. This canonical seed is promoted from the repo's 10% stock row without inventing new IFRA coverage.",
    rep: "Labdanolic Acid",
    isUVCB: true,
    descriptorTags: ["Resinous", "Amber", "Leather"],
  },
  vanilla_absolute: {
    canonicalMaterialKey: "vanilla_absolute",
    canonicalName: "Vanilla Absolute",
    note: "base",
    type: "ABS",
    cas: "8006-39-1",
    inci: "Vanilla Planifolia Fruit Extract",
    scentClass: "Gourmand",
    scentSummary: "Silky sweet vanilla warm anchor",
    scentDesc:
      "Canonical helper source seed for vanilla absolute. Supplier identity is supported, and the current catalog already carries source-backed CAS and INCI metadata.",
    rep: "Vanillin",
    isUVCB: true,
    descriptorTags: ["Vanilla", "Gourmand", "Absolute"],
  },
  vanilla_bourbon_absolute: {
    canonicalMaterialKey: "vanilla_bourbon_absolute",
    canonicalName: "Vanilla Bourbon Absolute",
    note: "base",
    type: "ABS",
    cas: "84650-60-2",
    inci: "Vanilla Planifolia Bourbon Fruit Extract",
    scentClass: "Gourmand",
    scentSummary: "Rich creamy Bourbon vanilla depth",
    scentDesc:
      "Canonical helper source seed for vanilla bourbon absolute. Supplier identity is supported, and the current catalog already carries source-backed CAS and INCI metadata.",
    rep: "Vanillin",
    isUVCB: true,
    descriptorTags: ["Vanilla", "Gourmand", "Bourbon"],
  },
  vanilla_co2: {
    canonicalMaterialKey: "vanilla_co2",
    canonicalName: "Vanilla CO2",
    note: "mid",
    type: "CO2",
    cas: "8024-06-4",
    inci: "Vanilla Planifolia Fruit CO2 Extract",
    scentClass: "Gourmand",
    scentSummary: "Smooth, natural warm vanilla CO2",
    scentDesc:
      "The current catalog source row describes vanilla CO2 as a rounded, natural vanilla extract that preserves fuller bean complexity than flat vanillin alone. This canonical seed is promoted from the repo's 10% stock row without inventing new IFRA coverage.",
    rep: "Vanillin",
    isUVCB: true,
    descriptorTags: ["Vanilla", "Gourmand", "CO2"],
  },
  tolu_balsam_resinoid: {
    canonicalMaterialKey: "tolu_balsam_resinoid",
    canonicalName: "Tolu Balsam Resinoid",
    note: "base",
    type: "ABS",
    scentClass: "Amber",
    scentSummary: "Tolu balsam resinoid",
    scentDesc:
      "Canonical helper source seed for tolu balsam resinoid. The current repo represents this material through the live diluted-stock row Tolu Balsam Resinoid 50% TEC, but source-backed canonical CAS/INCI chemistry and IFRA identity have not been promoted yet.",
    isUVCB: true,
    descriptorTags: ["Amber", "Resinoid"],
  },
  poplar_bud_absolute: {
    canonicalMaterialKey: "poplar_bud_absolute",
    canonicalName: "Poplar Bud Absolute",
    note: "mid",
    type: "ABS",
    scentClass: "Aromatic",
    scentSummary: "Poplar bud absolute",
    scentDesc:
      "Canonical helper source seed for poplar bud absolute. The current repo represents this material through the live diluted-stock row Poplar Bud Absolute 50% TEC by Fraterworks/Biolandes, but source-backed canonical CAS/INCI chemistry and IFRA identity have not been promoted yet.",
    isUVCB: true,
    descriptorTags: ["Aromatic", "Balsamic"],
  },
};

export function getCanonicalMaterialSource(canonicalMaterialKey) {
  const source = CANONICAL_MATERIAL_SOURCE_DATA[canonicalMaterialKey];
  if (!source) return null;

  return {
    ...source,
    descriptorTags: Array.isArray(source.descriptorTags)
      ? [...source.descriptorTags]
      : source.descriptorTags,
  };
}

function buildStandardPageList(pageReference) {
  const start = pageReference?.standard_page_start;
  const end = pageReference?.standard_page_end;
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) {
    return [];
  }

  const pages = [];
  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }
  return pages;
}

function buildRuntimeLimits(categoryLimits = {}) {
  return Object.fromEntries(
    Object.entries(categoryLimits).map(([category, limit]) => [
      category,
      limit?.kind === "limit" ? limit.value : null,
    ])
  );
}

function buildRuntimeLimitKinds(categoryLimits = {}) {
  return Object.fromEntries(
    Object.entries(categoryLimits).map(([category, limit]) => [
      category,
      limit?.kind || null,
    ])
  );
}

function buildRuntimeMaterialRecord(standard) {
  return {
    canonicalName: standard.canonical_name,
    cas: standard.cas_numbers || [],
    synonyms: (standard.synonyms || []).filter(
      (synonym) => synonym && synonym !== "Not applicable."
    ),
    recommendationType: standard.standard_type
      ? standard.standard_type.toLowerCase()
      : null,
    recommendationTypes: standard.standard_types || [],
    status: standard.status || "active",
    publicationYear: standard.publication_year ?? null,
    amendment: standard.amendment ?? null,
    implementationDates: {
      newCreation: standard.implementation_dates?.new_creation ?? null,
      existingCreation: standard.implementation_dates?.existing_creation ?? null,
    },
    limits: buildRuntimeLimits(standard.category_limits),
    limitKinds: buildRuntimeLimitKinds(standard.category_limits),
    limitUnit: "%",
    source: {
      document:
        standard.source_document ||
        ifraMasterDataset.metadata?.source_document ||
        "IFRA - 51st Amendment.pdf",
      pages: buildStandardPageList(standard.page_reference),
    },
    notes: standard.cas_notes || [],
  };
}

const IFRA_MASTER_DATASET_MATERIALS = Object.fromEntries(
  (ifraMasterDataset.standards || []).map((standard) => [
    standard.lookup_key,
    buildRuntimeMaterialRecord(standard),
  ])
);

const IFRA_MASTER_DATASET_ALIAS_MAP = {
  cashmeran: "6,7-dihydro-1,1,2,3,3-pentamethyl-4(5h)-indanone (dpmi)",
  helional: "alpha-methyl-1,3-benzodioxole-5-propionaldehyde (mmdhca)",
  "hexyl cinnamic aldehyde": "alpha-hexyl cinnamic aldehyde",
  "oakmoss absolute": "oakmoss extracts",
  "jasmine sambac absolute": "jasmine absolute (sambac)",
  "ylang ylang extra absolute": "ylang ylang extracts",
  "peru balsam oil": "peru balsam",
};

const IFRA_MASTER_DATASET_ALIAS_MATERIALS = Object.fromEntries(
  Object.entries(IFRA_MASTER_DATASET_ALIAS_MAP)
    .map(([aliasKey, datasetKey]) => {
      const material = IFRA_MASTER_DATASET_MATERIALS[datasetKey];
      if (!material) return null;
      return [
        aliasKey,
        {
          ...material,
          notes: [
            ...(material.notes || []),
            `Runtime compatibility alias for extracted master key "${datasetKey}".`,
          ],
        },
      ];
    })
    .filter(Boolean)
);

export const IFRA_MASTER_MATERIALS = {
  ...IFRA_SUPPLEMENTAL_MATERIALS,
  ...IFRA_MASTER_DATASET_MATERIALS,
  ...IFRA_MASTER_DATASET_ALIAS_MATERIALS,
};

export const INGREDIENT_IDENTITY_MAP = {
  "Benzyl Salicylate": {
    canonicalAppName: "Benzyl Salicylate",
    normalizedName: "Benzyl salicylate",
    matchStrategy: "pdf_text_match_needs_verification",
    resolvedIfraMaterial: "benzyl salicylate",
    materialClass: "not_yet_resolved",
    aliases: ["Benzyl salicylate", "Benzyl Salicylate"],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Multi-functional: a fixative, UV-absorber, and pleasant green-balsamic-floral note. Sweet, slightly green with a soft balsamic character. One of the most important bases in perfumery \u2014 adds lasting power and a classic fine-fragrance character.",
    pdfMatchStatus: "full_text_match",
    pdfMatchedAlias: "Benzyl salicylate",
    pdfMatchedPage: 3.0,
    reviewNote: "Has likely PDF match \u2014 verify exact standard and Cat 4",
  },
  DPG: {
    canonicalAppName: "DPG",
    normalizedName: "Dipropylene Glycol",
    matchStrategy: "manual_classification",
    resolvedIfraMaterial: null,
    materialClass: "functional_solvent",
    aliases: ["Dipropylene Glycol", "DPG"],
    stock: null,
    dbNoteRole: "carrier",
    dbMaterialType: "CARRIER",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "DPG is the industry-standard odorless carrier for perfume concentrates. Water-miscible, low irritation, excellent solvency for both polar and non-polar odorants. The backbone of any serious formula.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Vetiver Bourbon EO": {
    canonicalAppName: "Vetiver Bourbon EO",
    normalizedName: "Vetiver Bourbon EO",
    matchStrategy: "pdf_text_match_needs_verification",
    resolvedIfraMaterial: "vetiver bourbon eo",
    materialClass: "not_yet_resolved",
    aliases: [
      "Vetiver Bourbon EO",
      "Vetiver Bourbon",
      "Vetiver oil",
      "Vetiver",
      "8016-96-4",
      "Vetiveria Zizanoides Root Oil",
    ],
    stock: null,
    dbNoteRole: "base",
    dbMaterialType: "EO",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Bourbon (R\u00e9union) vetiver \u2014 the benchmark. Khusimol-rich, deep, earthy, smoky-rootsy with mineral nuances. The perfect base note for grounding any formula. Extraordinary longevity on skin and fabric. Essential in masculine bases and chypres.",
    pdfMatchStatus: "full_text_match",
    pdfMatchedAlias: "Vetiver oil",
    pdfMatchedPage: 20.0,
    reviewNote:
      "Helper maps Vetiver Bourbon EO to a canonical identity using app CAS/INCI data; likely PDF match exists but no structured IFRA standard has been promoted yet.",
  },
  "Bergamot EO FCF": {
    canonicalAppName: "Bergamot EO FCF",
    normalizedName: "Bergamot EO FCF",
    matchStrategy: "manual_fcf_identity_split",
    resolvedIfraMaterial: "bergamot eo fcf",
    materialClass: "not_yet_resolved",
    aliases: [
      "Bergamot EO FCF",
      "Bergamot FCF",
      "Bergamot Oil FCF",
      "Bergamot Oil FCF, Cote d'Ivoire",
      "Bergamot Oil FCF, Côte d'Ivoire",
      "Bergamot Oil FCF, Organic",
      "Bergamot Oil FCF, Terpeneless",
      "Bergamot “Superior” Oil, FCF",
    ],
    stock: null,
    dbNoteRole: "top",
    dbMaterialType: "EO",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Bergamot FCF (furocoumarin-free) \u2014 the benchmark citrus opening note. Green, floral-citrus sparkle driven by linalool and linalyl acetate with a characteristic bergamot bitterness. Versatile, bright, essential in foug\u00e8res and chypres.",
    pdfMatchStatus: "full_text_match",
    pdfMatchedAlias: "Bergamot oil",
    pdfMatchedPage: 3.0,
    reviewNote:
      "FCF / furocoumarin-free support — regular expressed bergamot phototoxic limit is not applied. Verify supplier IFRA/SDS for final compliance.",
  },
  "Lemon FCF": {
    canonicalAppName: "Lemon FCF",
    normalizedName: "Lemon FCF",
    matchStrategy: "manual_fcf_identity_split",
    resolvedIfraMaterial: "lemon fcf",
    materialClass: "not_yet_resolved",
    aliases: [
      "Lemon FCF",
      "Lemon EO FCF",
      "Lemon Oil FCF",
      "Furocoumarin-Free Lemon",
    ],
    stock: null,
    dbNoteRole: "top",
    dbMaterialType: "EO",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Lemon FCF helper identity keeps furocoumarin-free lemon separate from the regular cold-pressed lemon phototoxic restriction.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote:
      "FCF / furocoumarin-free support - regular cold-pressed lemon phototoxic limit is not applied. Verify supplier IFRA/SDS for final compliance.",
  },
  "Bergamot expressed": {
    canonicalAppName: "Bergamot expressed",
    normalizedName: "Bergamot expressed",
    matchStrategy: "manual_regular_expressed_identity",
    resolvedIfraMaterial: "bergamot expressed",
    materialClass: "not_yet_resolved",
    aliases: [
      "Bergamot expressed",
      "Bergamot oil",
      "Bergamot",
    ],
    stock: null,
    dbNoteRole: "top",
    dbMaterialType: "EO",
    currentAppIfraFlag: true,
    currentAppIfraText:
      "Regular expressed bergamot oil helper identity. Phototoxic/furocoumarin restrictions remain active for non-FCF bergamot rows.",
    pdfMatchStatus: "full_text_match",
    pdfMatchedAlias: "Bergamot oil",
    pdfMatchedPage: 3.0,
    reviewNote:
      "Regular expressed bergamot identity keeps the repo seed Cat 4 restriction for non-FCF rows.",
  },
  Coumarin: {
    canonicalAppName: "Coumarin",
    normalizedName: "Coumarin",
    matchStrategy: "pdf_text_match_needs_verification",
    resolvedIfraMaterial: "coumarin",
    materialClass: "not_yet_resolved",
    aliases: ["Coumarin"],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "The founding molecule of foug\u00e8re perfumery (Foug\u00e8re Royale, 1882). Sweet, hay-like, tonka-warm character. Essential in foug\u00e8res, orientals, and modern gourmands. Powerful fixative that anchors and extends floral and woody accords.",
    pdfMatchStatus: "index_match",
    pdfMatchedAlias: "Coumarin",
    pdfMatchedPage: 5.0,
    reviewNote: "Has likely PDF match \u2014 verify exact standard and Cat 4",
  },
  "Oakmoss Absolute": {
    canonicalAppName: "Oakmoss Absolute",
    normalizedName: "Oakmoss Absolute",
    matchStrategy: "pdf_text_match_needs_verification",
    resolvedIfraMaterial: "oakmoss absolute",
    materialClass: "not_yet_resolved",
    aliases: ["Oakmoss Absolute", "Oakmoss absolute", "Oakmoss"],
    stock: null,
    dbNoteRole: "base",
    dbMaterialType: "ABS",
    currentAppIfraFlag: true,
    currentAppIfraText:
      "The quintessential chypre ingredient \u2014 damp, earthy, forest floor mossy depth. Severely IFRA restricted due to atranol and chloroatranol sensitizers. Maximum 0.1% in leave-on products effectively means it can only be used as a trace note today. A ghost of its former perfumery self.",
    pdfMatchStatus: "full_text_match",
    pdfMatchedAlias: "Oakmoss Absolute",
    pdfMatchedPage: 216.0,
    reviewNote: "Has likely PDF match \u2014 verify exact standard and Cat 4",
  },
  "Violet Leaf Absolute": {
    canonicalAppName: "Violet Leaf Absolute",
    normalizedName: "Violet leaf absolute",
    matchStrategy: "manual_helper_record",
    resolvedIfraMaterial: "violet leaf absolute",
    materialClass: "not_yet_resolved",
    aliases: [
      "Violet leaf absolute",
      "Violet Leaf Absolute",
      "Violet leaf",
      "Violet Leaf",
      "8024-08-6",
      "Viola Odorata Leaf Extract",
    ],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "ABS",
    currentAppIfraFlag: true,
    currentAppIfraText:
      "Exceptional potency \u2014 traces create a watery, green, cucumber-like freshness with an almost ozonic quality. 2,6-Nonadienal is the key odorant. IFRA restricted due to sensitization potential. Used in tiny amounts in chypres, green accords, and aquatics.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote:
      "Mapped to canonical helper identity from app CAS/INCI data; IFRA standard not yet promoted",
  },
  "Methyl Ionone Gamma Coeur": {
    canonicalAppName: "Methyl Ionone Gamma Coeur",
    normalizedName: "Methyl ionone, mixed isomers",
    matchStrategy: "pdf_text_match_needs_verification",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: [
      "Methyl ionone, mixed isomers",
      "Methyl Ionone Gamma Coeur",
      "Methyl ionone gamma",
      "Methyl ionone",
    ],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Gamma methyl ionone \u2014 the softest, most powdery of the ionones. Iris-violet character without the orris-root earthiness. Adds elegance, feminine powder, and depth as a heart note bridge. Essential in violet, iris, and powdery florals.",
    pdfMatchStatus: "full_text_match",
    pdfMatchedAlias: "Methyl ionone, mixed isomers",
    pdfMatchedPage: 203.0,
    reviewNote: "Has likely PDF match \u2014 verify exact standard and Cat 4",
  },
  "Petitgrain Bigarade EO": {
    canonicalAppName: "Petitgrain Bigarade EO",
    normalizedName: "Petitgrain Bigarade EO",
    matchStrategy: "pdf_text_match_needs_verification",
    resolvedIfraMaterial: "petitgrain bigarade eo",
    materialClass: "not_yet_resolved",
    aliases: [
      "Petitgrain Bigarade EO",
      "Petitgrain bigarade",
      "Petitgrain Bigarade",
      "Petitgrain oil",
      "Petitgrain",
      "8014-17-3",
      "Citrus Aurantium Leaf/Twig Oil",
    ],
    stock: null,
    dbNoteRole: "top",
    dbMaterialType: "EO",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "From the leaves and twigs of bitter orange \u2014 a woody-green, slightly floral citrus bridge note. Linalyl acetate dominant. Bridges the gap between citrus tops and floral/woody hearts beautifully. Essential in classic foug\u00e8res and modern masculines.",
    pdfMatchStatus: "full_text_match",
    pdfMatchedAlias: "Petitgrain",
    pdfMatchedPage: 286.0,
    reviewNote:
      "Helper maps Petitgrain Bigarade EO to a canonical identity using app CAS/INCI data; likely PDF match exists but no structured IFRA standard has been promoted yet.",
  },
  "Sweet Orange Absolute": {
    canonicalAppName: "Sweet Orange Absolute",
    normalizedName: "Sweet Orange Absolute",
    matchStrategy: "pdf_text_match_needs_verification",
    resolvedIfraMaterial: "sweet orange absolute",
    materialClass: "not_yet_resolved",
    aliases: [
      "Sweet Orange Absolute",
      "Sweet orange oil",
      "Sweet Orange",
      "Sweet orange",
      "Orange oil",
      "8028-48-6",
      "Citrus Sinensis Peel Extract",
    ],
    stock: null,
    dbNoteRole: "top",
    dbMaterialType: "ABS",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Unlike the EO, the absolute carries the full ripe orange juice and peel character \u2014 honeyed, warm, slightly waxy. Adds weight and longevity to citrus openings that the EO cannot. Excellent with coconut and vanilla.",
    pdfMatchStatus: "full_text_match",
    pdfMatchedAlias: "Orange oil",
    pdfMatchedPage: 282.0,
    reviewNote:
      "Helper maps Sweet Orange Absolute to a canonical identity using app CAS/INCI data; likely PDF match exists but no structured IFRA standard has been promoted yet.",
  },
  "Lemon EO Italy": {
    canonicalAppName: "Lemon EO Italy",
    normalizedName: "Lemon expressed",
    matchStrategy: "pdf_text_match_needs_verification",
    resolvedIfraMaterial: "lemon eo italy",
    materialClass: "not_yet_resolved",
    aliases: [
      "Lemon expressed",
      "Lemon EO Italy",
      "Lemon Italy",
      "Lemon oil",
      "Lemon",
    ],
    stock: null,
    dbNoteRole: "top",
    dbMaterialType: "EO",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Cold-pressed Italian lemon \u2014 the brightest citrus opening. Citral and limonene dominant. Clean, transparent lemon sparkle with slight green-waxy facets. Short-lived but irreplaceable for authentic citrus openings. Use with fixatives like Iso E Super or benzyl salicylate to extend longevity.",
    pdfMatchStatus: "index_match",
    pdfMatchedAlias: "Lemon oil",
    pdfMatchedPage: 10.0,
    reviewNote: "Has likely PDF match \u2014 verify exact standard and Cat 4",
  },
  Cashmeran: {
    canonicalAppName: "Cashmeran",
    normalizedName: "Cashmeran",
    matchStrategy: "master_standard_commercial_name_alias",
    resolvedIfraMaterial: "cashmeran",
    materialClass: "not_yet_resolved",
    aliases: ["Cashmeran", "Cashmeran®"],
    stock: null,
    dbNoteRole: "base",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Commercial-name alias for the extracted IFRA master standard 6,7-Dihydro-1,1,2,3,3-pentamethyl-4(5H)-indanone (DPMI).",
    pdfMatchStatus: "full_text_match",
    pdfMatchedAlias: "Cashmeran (commercial name)",
    pdfMatchedPage: 98.0,
    reviewNote:
      "Mapped through a commercial-name synonym already present in the structured IFRA master dataset.",
  },
  Helional: {
    canonicalAppName: "Helional",
    normalizedName: "Helional",
    matchStrategy: "master_standard_commercial_name_alias",
    resolvedIfraMaterial: "helional",
    materialClass: "not_yet_resolved",
    aliases: ["Helional", "Helional®"],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Commercial-name alias for the extracted IFRA master standard alpha-Methyl-1,3-benzodioxole-5-propionaldehyde (MMDHCA).",
    pdfMatchStatus: "full_text_match",
    pdfMatchedAlias: "Helional (commercial name)",
    pdfMatchedPage: 191.0,
    reviewNote:
      "Mapped through a commercial-name synonym already present in the structured IFRA master dataset.",
  },
  "Helional 25%": {
    canonicalAppName: "Helional 25%",
    normalizedName: "Helional",
    matchStrategy: "stock_name_parse",
    resolvedIfraMaterial: "helional",
    materialClass: "diluted_stock",
    aliases: ["Helional 25%", "Helional 25"],
    stock: {
      activeMaterialName: "Helional",
      activePercent: 25,
      carrierName: null,
    },
    dbNoteRole: "mid",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "25% Helional stock mapped to the structured IFRA master standard for Helional/MMDHCA; finished-product guidance uses the active fraction.",
    pdfMatchStatus: "full_text_match",
    pdfMatchedAlias: "Helional (commercial name)",
    pdfMatchedPage: 191.0,
    reviewNote:
      "Diluted stock alias mapped through the Helional commercial-name synonym already present in the structured IFRA master dataset.",
  },
  "Cyclamen Aldehyde": {
    canonicalAppName: "Cyclamen Aldehyde",
    normalizedName: "Cyclamen Aldehyde",
    matchStrategy: "master_standard_name_alias",
    resolvedIfraMaterial: "cyclamen aldehyde",
    materialClass: "not_yet_resolved",
    aliases: ["Cyclamen Aldehyde"],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Structured IFRA master standard match for Cyclamen aldehyde.",
    pdfMatchStatus: "full_text_match",
    pdfMatchedAlias: "Cyclamen aldehyde",
    pdfMatchedPage: 89.0,
    reviewNote:
      "Mapped to the exact Cyclamen aldehyde standard already present in the structured IFRA master dataset.",
  },
  "Ylang Ylang Complete": {
    canonicalAppName: "Ylang Ylang Complete",
    normalizedName: "Ylang Ylang Complete",
    matchStrategy: "master_standard_natural_extract_alias",
    resolvedIfraMaterial: "ylang ylang extracts",
    materialClass: "not_yet_resolved",
    aliases: [
      "Ylang Ylang Complete",
      "Ylang-Ylang Complete",
      "Ylang-Ylang Complete Oil",
      "Ylang Ylang Oil Complete",
    ],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "EO",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Ylang ylang complete oil mapped to the structured IFRA master standard for ylang ylang extracts; supplier IFRA/SDS remains the final check for the exact UVCB product.",
    pdfMatchStatus: "full_text_match",
    pdfMatchedAlias: "Ylang ylang oil",
    pdfMatchedPage: 269.0,
    reviewNote:
      "Mapped through ylang ylang oil/extract synonyms already present in the structured IFRA master dataset.",
  },
  "Ylang Ylang Complete 10%": {
    canonicalAppName: "Ylang Ylang Complete 10%",
    normalizedName: "Ylang Ylang Complete",
    matchStrategy: "stock_name_parse",
    resolvedIfraMaterial: "ylang ylang extracts",
    materialClass: "diluted_stock",
    aliases: [
      "Ylang Ylang Complete 10%",
      "Ylang Ylang 10%",
      "Ylang-Ylang Complete 10%",
      "Ylang-Ylang Complete Oil 10%",
    ],
    stock: {
      activeMaterialName: "Ylang Ylang Complete",
      activePercent: 10,
      carrierName: null,
    },
    dbNoteRole: "mid",
    dbMaterialType: "EO",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "10% ylang ylang complete stock mapped to the structured IFRA master standard for ylang ylang extracts; finished-product guidance uses the active fraction.",
    pdfMatchStatus: "full_text_match",
    pdfMatchedAlias: "Ylang ylang oil",
    pdfMatchedPage: 269.0,
    reviewNote:
      "Diluted stock alias mapped through ylang ylang oil/extract synonyms already present in the structured IFRA master dataset.",
  },
  "Balsam Peru EO": {
    canonicalAppName: "Balsam Peru EO",
    normalizedName: "Peru balsam oil",
    matchStrategy: "pdf_text_match_needs_verification",
    resolvedIfraMaterial: "peru balsam oil",
    materialClass: "not_yet_resolved",
    aliases: [
      "Peru balsam oil",
      "Balsam Peru EO",
      "Balsam Peru",
      "Peru balsam",
      "8007-00-9",
      "Myroxylon Pereirae Resin Oil",
    ],
    stock: null,
    dbNoteRole: "base",
    dbMaterialType: "EO",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Benzyl benzoate and cinnamic esters give this a warm, sweet-resinous, cinnamic amber character. Excellent fixative with a warm balsamic depth. Pairs beautifully with vanilla, musks, and woody notes in oriental bases.",
    pdfMatchStatus: "full_text_match",
    pdfMatchedAlias: "Peru balsam oil",
    pdfMatchedPage: 229.0,
    reviewNote:
      "Helper maps Balsam Peru EO to a canonical Peru Balsam Oil identity using app CAS/INCI data; likely PDF match exists but no structured IFRA standard has been promoted yet.",
  },
  "Cinnamon Bark EO": {
    canonicalAppName: "Cinnamon Bark EO",
    normalizedName: "Cinnamon bark oil",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: [
      "Cinnamon bark oil",
      "Cinnamon Bark EO",
      "Cinnamon Bark",
      "Cinnamon oil",
      "Cassia oil",
    ],
    stock: null,
    dbNoteRole: "top",
    dbMaterialType: "EO",
    currentAppIfraFlag: true,
    currentAppIfraText:
      "Intensely fiery-sweet cinnamaldehyde-dominant spice. The most powerful natural spice in perfumery but severely IFRA restricted due to sensitization risk. Cinnamaldehyde is a Category B restricted material. Use with extreme caution \u2014 maximum 0.05% in leave-on skin products.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Clove Bud Absolute": {
    canonicalAppName: "Clove Bud Absolute",
    normalizedName: "Clove Bud Absolute",
    matchStrategy: "manual_helper_record",
    resolvedIfraMaterial: "clove bud absolute",
    materialClass: "not_yet_resolved",
    aliases: [
      "Clove Bud Absolute",
      "Clove bud oil",
      "Clove Bud",
      "Clove bud",
      "Clove oil",
      "8015-97-2",
      "Eugenia Caryophyllata Bud Extract",
    ],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "ABS",
    currentAppIfraFlag: true,
    currentAppIfraText:
      "Eugenol-dominant absolute from clove buds. Warming, medicinal-spice character with a slightly anesthetic quality. IFRA restricted due to eugenol sensitization potential. Essential in oriental and leather accords at compliant levels.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote:
      "Mapped to canonical helper identity from app CAS/INCI data; IFRA standard not yet promoted",
  },
  "Hexyl Cinnamic Aldehyde": {
    canonicalAppName: "Hexyl Cinnamic Aldehyde",
    normalizedName: "Hexyl Cinnamic Aldehyde",
    matchStrategy: "pdf_text_match_needs_verification",
    resolvedIfraMaterial: "hexyl cinnamic aldehyde",
    materialClass: "not_yet_resolved",
    aliases: ["Hexyl Cinnamic Aldehyde"],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Sweet, warm floral with magnolia and lily facets. One of the most widely-used synthetic materials in perfumery. Also a UV-absorber like benzyl salicylate. Adds warmth, sweetness, and lasting power to any floral or oriental accord.",
    pdfMatchStatus: "full_text_match",
    pdfMatchedAlias: "Hexyl Cinnamic Aldehyde",
    pdfMatchedPage: 134.0,
    reviewNote: "Has likely PDF match \u2014 verify exact standard and Cat 4",
  },
  "Linalool Natural": {
    canonicalAppName: "Linalool Natural",
    normalizedName: "Linalool Natural",
    matchStrategy: "pdf_text_match_needs_verification",
    resolvedIfraMaterial: "linalool",
    materialClass: "not_yet_resolved",
    aliases: ["Linalool Natural", "Linalool", "78-70-6"],
    stock: null,
    dbNoteRole: "top",
    dbMaterialType: "EO",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "The most important terpene in perfumery \u2014 soft, floral-citrus character that bridges top and heart notes. Present in over 200 natural materials. Adds smoothness, lift, and a characteristic 'floral clean' quality. Essential for blending.",
    pdfMatchStatus: "index_match",
    pdfMatchedAlias: "Linalool",
    pdfMatchedPage: 10.0,
    reviewNote:
      "Mapped to canonical helper linalool identity; verify exact standard and Cat 4",
  },
  "Oud CO2 10%": {
    canonicalAppName: "Oud CO2 10%",
    normalizedName: "Agarwood oil",
    matchStrategy: "stock_name_parse",
    resolvedIfraMaterial: "agarwood oil",
    materialClass: "diluted_stock",
    aliases: ["Agarwood oil", "Oud CO2 10%", "Agarwood", "Oud CO2", "Oud"],
    stock: {
      activeMaterialName: "Oud CO2",
      activePercent: 10,
      carrierName: null,
    },
    dbNoteRole: "base",
    dbMaterialType: "CO2",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "10% CO2 oud dilution \u2014 preserves the full spectrum of agarwood's complexity: dark woody resin, rose-animalic facets, deep balsamic character. More affordable way to work with oud's complexity while maintaining the signature depth.",
    pdfMatchStatus: "full_text_match",
    pdfMatchedAlias: "Oud",
    pdfMatchedPage: 352.0,
    reviewNote: "Has likely PDF match \u2014 verify exact standard and Cat 4",
  },
  "Rum Absolute": {
    canonicalAppName: "Rum Absolute",
    normalizedName: "Rum Absolute",
    matchStrategy: "pdf_text_match_needs_verification",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: ["Rum Absolute", "Rum"],
    stock: null,
    dbNoteRole: "top",
    dbMaterialType: "ABS",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Ethyl butyrate-rich rum character \u2014 tropical, sweet, slightly estery and boozy. Pairs perfectly with vanilla, coconut, and citrus in tropical gourmand accords. More tenacious than it seems due to the heavy molasses components.",
    pdfMatchStatus: "full_text_match",
    pdfMatchedAlias: "Rum Absolute",
    pdfMatchedPage: 161.0,
    reviewNote: "Has likely PDF match \u2014 verify exact standard and Cat 4",
  },
  "Ylang Ylang Extra Absolute": {
    canonicalAppName: "Ylang Ylang Extra Absolute",
    normalizedName: "Ylang Ylang Extra Absolute",
    matchStrategy: "legacy_compatibility_alias",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: ["Ylang Ylang Extra Absolute", "Ylang-Ylang Extra Absolute"],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "EO",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Legacy compatibility alias \u2014 use Ylang-Ylang Extra Oil, Comoros for the extra-oil product or Ylang-Ylang Absolute for the absolute.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote:
      "Deprecated compatibility alias for a misnamed Ylang row. Do not treat as a standalone supplier product or direct listed IFRA identity.",
  },
  "Benzyl Benzoate": {
    canonicalAppName: "Benzyl Benzoate",
    normalizedName: "Benzyl Benzoate",
    matchStrategy: "alias_map",
    resolvedIfraMaterial: "benzyl benzoate",
    materialClass: "functional_solvent",
    aliases: ["Benzyl Benzoate", "Benzyl benzoate", "BB"],
    stock: null,
    dbNoteRole: "carrier",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "One of the oldest and most important materials in perfumery. Sweet, balsamic, slightly floral base note. Primarily functions as a fixative and solvent, greatly enhancing the longevity and blending of other materials. Found in virtually every oriental, amber, and floral base.",
    pdfMatchStatus: "full_text_match",
    pdfMatchedAlias: "Benzyl Benzoate",
    pdfMatchedPage: 3.0,
    reviewNote: "Use starter IFRA record",
  },
  IPM: {
    canonicalAppName: "IPM",
    normalizedName: "Isopropyl Myristate",
    matchStrategy: "alias_map",
    resolvedIfraMaterial: "isopropyl myristate",
    materialClass: "functional_solvent",
    aliases: [
      "Isopropyl Myristate",
      "Isopropyl Myristate (IPM)",
      "IPM",
    ],
    stock: null,
    dbNoteRole: "carrier",
    dbMaterialType: "CARRIER",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Functional carrier solvent used to dilute and handle perfume materials without adding a meaningful odor profile.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "Use starter IFRA record",
  },
  TEC: {
    canonicalAppName: "TEC",
    normalizedName: "Triethyl Citrate",
    matchStrategy: "alias_map",
    resolvedIfraMaterial: "triethyl citrate",
    materialClass: "functional_solvent",
    aliases: [
      "Triethyl Citrate",
      "Triethyl Citrate, Natural (TEC)",
      "TEC",
    ],
    stock: null,
    dbNoteRole: "carrier",
    dbMaterialType: "CARRIER",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Functional carrier solvent used to dilute and handle perfume materials without adding a meaningful odor profile.",
    pdfMatchStatus: "full_text_match",
    pdfMatchedAlias: "TEC",
    pdfMatchedPage: 119.0,
    reviewNote: "Use starter IFRA record",
  },
  "Ambroxan Crystals": {
    canonicalAppName: "Ambroxan Crystals",
    normalizedName: "Ambroxan Crystals",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: ["Ambroxan Crystals", "Ambroxan", "Ambroxide"],
    stock: null,
    dbNoteRole: "base",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Ambroxan (Ambroxide) is the synthetic equivalent of the key ambergris odorant. Extremely diffusive, radiant, warm-mineral character. Amplifies all surrounding notes and adds skin-warming depth. The modern perfumer's essential 'radiance' molecule.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Ethylene Brassylate": {
    canonicalAppName: "Ethylene Brassylate",
    normalizedName: "Ethylene Brassylate",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: ["Ethylene Brassylate", "105-95-3"],
    stock: null,
    dbNoteRole: "base",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Macrocyclic diester prized for its sweet, clean white-musk character. More floral and soft than other musks. Blends beautifully with white florals, gourmands, and clean bases. Outstanding longevity.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  Habanolide: {
    canonicalAppName: "Habanolide",
    normalizedName: "Habanolide",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: ["Habanolide", "111879-80-2"],
    stock: null,
    dbNoteRole: "base",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Exaltolide-type macrolide lactone with a skin-warm, powdery-clean diffusion. One of the most laundry-fresh musks in perfumery \u2014 bright, sheer, and radiating. Blends seamlessly with floral and woody bases.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  Helvetolide: {
    canonicalAppName: "Helvetolide",
    normalizedName: "Helvetolide",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: ["Helvetolide", "141773-73-1"],
    stock: null,
    dbNoteRole: "base",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Polycyclic macrolide with extraordinary tenacity on skin. Soft, velvety clean character with subtle sweetness. Excellent for creating the 'second-skin' effect in skin musks and transparent bases.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Iso E Super": {
    canonicalAppName: "Iso E Super",
    normalizedName: "Iso E Super",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: [
      "Iso E Super",
      "OTNE",
      "Tetramethyl acetyloctahydronaphthalenes",
      "54464-57-2",
    ],
    stock: null,
    dbNoteRole: "base",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "The quintessential 'radiance molecule' \u2014 diffusive, cedar-velvet warmth that becomes almost imperceptible at high concentrations (superoleic effect). Amplifies surrounding notes, adds texture and depth. Essential in modern masculines and skin musks.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Calone 1951": {
    canonicalAppName: "Calone 1951",
    normalizedName: "Calone 1951",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: ["Calone 1951", "Calone", "Calone 1951\u00ae", "28940-11-6"],
    stock: null,
    dbNoteRole: "top",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "The original marine odorant \u2014 extraordinarily powerful at ppb levels. Cold, metallic, melon-marine character that instantly evokes the sea. At correct dosage (0.1-0.5% of formula) it's transformative. At too high it becomes overpowering and synthetic.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Methyl Pamplemousse": {
    canonicalAppName: "Methyl Pamplemousse",
    normalizedName: "Methyl Pamplemousse",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: ["Methyl Pamplemousse"],
    stock: null,
    dbNoteRole: "top",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Synthetic grapefruit with more tenacity than natural citrus oils. Bright, tart, juicy quality. A key molecule for extending grapefruit character well beyond the natural EO's lifespan. Excellent in freshness accords.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Benzoin Siam Absolute": {
    canonicalAppName: "Benzoin Siam Absolute",
    normalizedName: "Benzoin Siam Absolute",
    matchStrategy: "manual_helper_record",
    resolvedIfraMaterial: "benzoin siam absolute",
    materialClass: "not_yet_resolved",
    aliases: [
      "Benzoin Siam Absolute",
      "Benzoin resinoid",
      "Benzoin Siam",
      "Benzoin",
      "9000-72-0",
      "Styrax Tonkinensis Resin Extract",
    ],
    stock: null,
    dbNoteRole: "base",
    dbMaterialType: "ABS",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "From Styrax tonkinensis resin \u2014 sweet, warm balsamic character with benzaldehyde-vanilla facets. One of the great fixatives of perfumery. Adds warmth, roundness, and oriental depth to any accord. Anchors musks and florals beautifully.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote:
      "Helper maps Benzoin Siam Absolute to a canonical identity using app CAS/INCI data. No structured IFRA standard has been promoted into the helper dataset yet.",
  },
  "Benzoin Siam Resinoid 50% TEC": {
    canonicalAppName: "Benzoin Siam Resinoid 50% TEC",
    normalizedName: "Benzoin Siam Resinoid",
    matchStrategy: "stock_name_parse",
    resolvedIfraMaterial: "benzoin siam resinoid",
    materialClass: "diluted_stock",
    aliases: [
      "Benzoin Siam Resinoid 50% TEC",
      "Benzoin Siam Resinoid",
      "Benzoin Siam Resinoid 50",
    ],
    stock: {
      activeMaterialName: "Benzoin Siam Resinoid",
      activePercent: 50,
      carrierName: "TEC",
    },
    dbNoteRole: "base",
    dbMaterialType: "ABS",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Current repo stock row for a diluted benzoin Siam resinoid supplier product by Mane. Canonical chemistry and IFRA limits remain intentionally conservative until stronger source-backed data is promoted.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote:
      "Maps the live 50% TEC stock row to a canonical Benzoin Siam Resinoid helper identity without promoting new IFRA limits.",
  },
  Dihydromyrcenol: {
    canonicalAppName: "Dihydromyrcenol",
    normalizedName: "Dihydromyrcenol",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: ["Dihydromyrcenol", "18479-58-8"],
    stock: null,
    dbNoteRole: "top",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "The backbone of modern marine-fresh masculines. Lime-metallic-clean character that reads as 'aquatic laundry' freshness. Essential in Cool Water-type accords. Extremely diffusive opening note \u2014 pairs beautifully with juniper, bergamot, and Calone.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Gamma Nonalactone": {
    canonicalAppName: "Gamma Nonalactone",
    normalizedName: "Gamma Nonalactone",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: ["Gamma Nonalactone"],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "The definitive lactone for creamy-fruity accords. Peach-coconut character that adds soft creaminess and tropical warmth. Essential in 'beach' accords \u2014 pairs with heliotropin for maximum coconut effect.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  Heliotropin: {
    canonicalAppName: "Heliotropin",
    normalizedName: "Heliotropin",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: ["Heliotropin"],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Piperonal (heliotropin) \u2014 sweet, almond-like, with a distinctive heliotrope floral facet. A remarkable coconut enhancer when combined with gamma-nonalactone. Also adds powdery softness to any formula. Bridges floral and gourmand.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Labdanum Absolute 10%": {
    canonicalAppName: "Labdanum Absolute 10%",
    normalizedName: "Labdanum Absolute 10%",
    matchStrategy: "stock_name_parse",
    resolvedIfraMaterial: "labdanum absolute",
    materialClass: "diluted_stock",
    aliases: [
      "Labdanum Absolute 10%",
      "Labdanum Absolute",
      "Labdanum absolute",
      "Labdanum",
    ],
    stock: {
      activeMaterialName: "Labdanum Absolute",
      activePercent: 10,
      carrierName: null,
    },
    dbNoteRole: "mid",
    dbMaterialType: "ABS",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "The 10% dilution of the dense resin absolute. Labdanum creates the classical amber base \u2014 warm, slightly animalic, leathery-resinous and balsamic. The key ingredient in amber accords and chypres. Extraordinary fixative properties.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Cedarwood Virginia EO": {
    canonicalAppName: "Cedarwood Virginia EO",
    normalizedName: "Cedarwood Virginia EO",
    matchStrategy: "manual_helper_record",
    resolvedIfraMaterial: "cedarwood virginia eo",
    materialClass: "not_yet_resolved",
    aliases: [
      "Cedarwood Virginia EO",
      "Cedarwood virginia",
      "Cedarwood Virginia",
      "Virginia cedarwood",
      "Cedarwood oil",
      "8000-27-9",
      "Juniperus Virginiana Wood Oil",
    ],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "EO",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Cedrol-rich Virginia cedarwood \u2014 the smell of freshly sharpened pencils. Dry, slightly sweet pencil-cedar character. Excellent fixative and woody backbone. More affordable than Atlas or Himalayan cedarwood with a distinctive American character.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote:
      "Helper maps Cedarwood Virginia EO to a canonical identity using app CAS/INCI data. No structured IFRA standard has been promoted into the helper dataset yet.",
  },
  "Ethyl Vanillin": {
    canonicalAppName: "Ethyl Vanillin",
    normalizedName: "Ethyl Vanillin",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: ["Ethyl Vanillin", "Ethylvanillin", "121-32-4"],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "3-4x stronger than vanillin with a richer, creamier-sweeter character. Adds 'weight' to vanilla accords and gourmand bases. Pairs beautifully with coumarin, heliotropin, and musks for a full dessert foundation.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Ambrette Seed Absolute": {
    canonicalAppName: "Ambrette Seed Absolute",
    normalizedName: "Ambrette Seed Absolute",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: ["Ambrette Seed Absolute", "Ambrette Seed"],
    stock: null,
    dbNoteRole: "base",
    dbMaterialType: "ABS",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "The complete absolute from ambrette seed, richer and more complex than the synthetic ambrettolide. Nutty, winey, slightly earthy musk character. Rare and prized in natural perfumery. Excellent skin retention.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Coconut CO2": {
    canonicalAppName: "Coconut CO2",
    normalizedName: "Coconut CO2",
    matchStrategy: "manual_helper_record",
    resolvedIfraMaterial: "coconut co2",
    materialClass: "not_yet_resolved",
    aliases: [
      "Coconut CO2",
      "Coconut",
      "8001-31-8",
      "Cocos Nucifera Oil CO2 Extract",
    ],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "CO2",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "CO2 coconut captures the full creamy lactonic quality of fresh coconut. gamma-Nonalactone dominant. The definitive tropical-beach note \u2014 pairs with vanilla, pineapple, orange, and musks. A Beach Box essential.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote:
      "Helper maps Coconut CO2 to a canonical identity using app CAS/INCI data. No structured IFRA standard has been promoted into the helper dataset yet.",
  },
  "Eucalyptus Blue Gum EO": {
    canonicalAppName: "Eucalyptus Blue Gum EO",
    normalizedName: "Eucalyptus Blue Gum EO",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: [
      "Eucalyptus Blue Gum EO",
      "Blue gum eucalyptus",
      "Eucalyptus Blue Gum",
      "Eucalyptus oil",
      "Eucalyptus",
    ],
    stock: null,
    dbNoteRole: "top",
    dbMaterialType: "EO",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "1,8-Cineole (eucalyptol) dominant \u2014 sharp, piercing, clean and medicinal. Creates instant openness and freshness. Pairs beautifully with marine notes (Calone), mint, and rosemary in coastal and herbal accords.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Juniper Berry CO2": {
    canonicalAppName: "Juniper Berry CO2",
    normalizedName: "Juniperus communis",
    matchStrategy: "manual_helper_record",
    resolvedIfraMaterial: "juniper berry co2",
    materialClass: "not_yet_resolved",
    aliases: [
      "Juniperus communis",
      "Juniper Berry CO2",
      "Juniper berry oil",
      "Juniper Berry",
      "Juniper berry",
      "8012-91-7",
      "Juniperus Communis Fruit CO2 Extract",
    ],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "CO2",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "CO2 juniper captures the authentic gin character \u2014 fresh, piney, with a slight dark-resinous undercurrent. More complex than the steam-distilled EO. Essential in maritime and foug\u00e8re accords. Brings a refined herbal structure.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote:
      "Helper maps Juniper Berry CO2 to a canonical identity using app CAS/INCI data. No structured IFRA standard has been promoted into the helper dataset yet.",
  },
  "Neroli Absolute": {
    canonicalAppName: "Neroli Absolute",
    normalizedName: "Neroli Absolute",
    matchStrategy: "manual_helper_record",
    resolvedIfraMaterial: "neroli absolute",
    materialClass: "not_yet_resolved",
    aliases: [
      "Neroli Absolute",
      "Neroli oil",
      "Neroli",
      "8016-38-4",
      "Citrus Aurantium Flower Extract",
    ],
    stock: null,
    dbNoteRole: "top",
    dbMaterialType: "ABS",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "The absolute version of neroli \u2014 richer, more animalic, and honeyed than the EO. Captures the waxy-green indolic facets of fresh orange blossom. Pricey but transformative in floral and chypre accords. Extraordinary tenacity.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote:
      "Mapped to canonical helper identity from app CAS/INCI data; IFRA standard not yet promoted",
  },
  "Pink Peppercorn CO2": {
    canonicalAppName: "Pink Peppercorn CO2",
    normalizedName: "Pink Peppercorn CO2",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: [
      "Pink Peppercorn CO2",
      "Pink pepper oil",
      "Pink Peppercorn",
      "Pink pepper",
    ],
    stock: null,
    dbNoteRole: "top",
    dbMaterialType: "CO2",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "CO2 pink peppercorn captures both the spicy terpene character and the distinctive rosy-woody facets. More complex and nuanced than black pepper. Brings warmth without harshness. Brilliant with amber, rose, and citrus.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Seaweed Absolute": {
    canonicalAppName: "Seaweed Absolute",
    normalizedName: "Seaweed Absolute",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: ["Seaweed Absolute", "Seaweed"],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "ABS",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "The raw, feral smell of seaweed on a beach at low tide \u2014 iodine, brine, dark green marine algae character. More animalic and complex than synthetic marine materials. Adds authentic coastal roughness to marine accords.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Benzyl Acetate": {
    canonicalAppName: "Benzyl Acetate",
    normalizedName: "Benzyl Acetate",
    matchStrategy: "manual_helper_record",
    resolvedIfraMaterial: "benzyl acetate",
    materialClass: "not_yet_resolved",
    aliases: ["Benzyl Acetate", "140-11-4"],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "The dominant odorant in jasmine and ylang ylang. Sweet, fruity-floral with a distinctive jasmine character. Essential for building jasmine accords and adding sweet floral body to any heart note construction.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote:
      "Mapped to canonical helper identity from app CAS data; IFRA standard not yet promoted",
  },
  "Cognac Absolute": {
    canonicalAppName: "Cognac Absolute",
    normalizedName: "Cognac Absolute",
    matchStrategy: "manual_helper_record",
    resolvedIfraMaterial: "cognac absolute",
    materialClass: "not_yet_resolved",
    aliases: [
      "Cognac Absolute",
      "Cognac",
      "8016-44-2",
      "Vitis Vinifera Distillate Extract",
    ],
    stock: null,
    dbNoteRole: "top",
    dbMaterialType: "ABS",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "The distillate absolute captures the complex character of aged brandy \u2014 grape, spirit, warm oak nuances. Ethyl octanoate dominant. Adds sophisticated boozy warmth to oriental, tobacco, and amber accords. A secret weapon for gourmand complexity.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote:
      "Mapped to canonical helper identity from app CAS/INCI data; IFRA standard not yet promoted",
  },
  "Galbanum Absolute": {
    canonicalAppName: "Galbanum Absolute",
    normalizedName: "Galbanum Absolute",
    matchStrategy: "manual_helper_record",
    resolvedIfraMaterial: "galbanum absolute",
    materialClass: "not_yet_resolved",
    aliases: [
      "Galbanum Absolute",
      "Galbanum",
      "8023-91-4",
      "Ferula Galbaniflua Resin Extract",
    ],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "ABS",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "One of the most potent and challenging naturals in perfumery. 2-Methoxypyrazine gives a vegetable-green, almost pepper-green intensity at trace levels. Extraordinary ODT \u2014 a single drop can define the entire formula. Used in traces in Chanel No.19, Alliage. Handle with great care.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote:
      "Helper maps Galbanum Absolute to a canonical identity using app CAS/INCI data. No structured IFRA standard has been promoted into the helper dataset yet.",
  },
  "Litsea Cubeba EO": {
    canonicalAppName: "Litsea Cubeba EO",
    normalizedName: "Litsea Cubeba EO",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: ["Litsea Cubeba EO", "Litsea Cubeba"],
    stock: null,
    dbNoteRole: "top",
    dbMaterialType: "EO",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "High citral content gives an intense, clean lemon-lime character. More tenacious than citrus peel oils. Pairs beautifully with marine, green, and floral notes. A secret weapon for longevity in citrus accords.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Patchouli Dark EO": {
    canonicalAppName: "Patchouli Dark EO",
    normalizedName: "Patchouli Dark EO",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: [
      "Patchouli Dark EO",
      "Patchouli Dark",
      "Patchouli oil",
      "Patchouli",
    ],
    stock: null,
    dbNoteRole: "base",
    dbMaterialType: "EO",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Dark, aged patchouli \u2014 camphoraceous, earthly, animalic with the rich complexity that develops over time. Patchoulol dominant. Lower camphor content than fresh patchouli, deeper and more resinous. The backbone of oriental, leather, and chypre accords.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Poplar Bud Absolute 50% TEC": {
    canonicalAppName: "Poplar Bud Absolute 50% TEC",
    normalizedName: "Poplar Bud Absolute",
    matchStrategy: "stock_name_parse",
    resolvedIfraMaterial: "poplar bud absolute",
    materialClass: "diluted_stock",
    aliases: [
      "Poplar Bud Absolute 50% TEC",
      "Poplar Bud Absolute",
      "Poplar Bud",
    ],
    stock: {
      activeMaterialName: "Poplar Bud Absolute",
      activePercent: 50,
      carrierName: "TEC",
    },
    dbNoteRole: "mid",
    dbMaterialType: "ABS",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Current repo stock row for a diluted poplar bud absolute supplier product by Biolandes. Canonical chemistry and IFRA limits remain intentionally conservative until stronger source-backed data is promoted.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote:
      "Maps the live 50% TEC stock row to a canonical Poplar Bud Absolute helper identity without promoting new IFRA limits.",
  },
  "Tobacco Absolute": {
    canonicalAppName: "Tobacco Absolute",
    normalizedName: "Tobacco leaf absolute",
    matchStrategy: "manual_helper_record",
    resolvedIfraMaterial: "tobacco absolute",
    materialClass: "not_yet_resolved",
    aliases: [
      "Tobacco leaf absolute",
      "Tobacco absolute",
      "Tobacco Absolute",
      "Tobacco",
      "8016-68-0",
      "Nicotiana Tabacum Leaf Extract",
    ],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "ABS",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Solanone-rich absolute from cured tobacco leaf. Sweet-hay-dry tobacco character \u2014 warm, complex, slightly sweet. Extraordinary tenacity. Essential in oriental, leather, and gourmand masculines. Pairs beautifully with vanilla, amber, and leather.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote:
      "Mapped to canonical helper identity from app CAS/INCI data; IFRA standard not yet promoted",
  },
  "Vanilla CO2 10%": {
    canonicalAppName: "Vanilla CO2 10%",
    normalizedName: "Vanilla CO2 10%",
    matchStrategy: "stock_name_parse",
    resolvedIfraMaterial: "vanilla co2",
    materialClass: "diluted_stock",
    aliases: ["Vanilla CO2 10%", "Vanilla CO2", "Vanilla"],
    stock: {
      activeMaterialName: "Vanilla CO2",
      activePercent: 10,
      carrierName: null,
    },
    dbNoteRole: "mid",
    dbMaterialType: "CO2",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "CO2 extraction preserves the full vanilla bean complexity \u2014 vanillin, coumarin, and numerous aromatic aldehydes. More natural and rounded than synthetics, less 'flat'. 10% dilution in DPG makes it easy to work with at formula percentages.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Tolu Balsam Resinoid 50% TEC": {
    canonicalAppName: "Tolu Balsam Resinoid 50% TEC",
    normalizedName: "Tolu Balsam Resinoid",
    matchStrategy: "stock_name_parse",
    resolvedIfraMaterial: "tolu balsam resinoid",
    materialClass: "diluted_stock",
    aliases: [
      "Tolu Balsam Resinoid 50% TEC",
      "Tolu Balsam Resinoid",
      "Tolu Balsam",
    ],
    stock: {
      activeMaterialName: "Tolu Balsam Resinoid",
      activePercent: 50,
      carrierName: "TEC",
    },
    dbNoteRole: "base",
    dbMaterialType: "ABS",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Current repo stock row for a diluted tolu balsam resinoid supplier product. Canonical chemistry and IFRA limits remain intentionally conservative until stronger source-backed data is promoted.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote:
      "Maps the live 50% TEC stock row to a canonical Tolu Balsam Resinoid helper identity without promoting new IFRA limits.",
  },
  "Aldehyde C-11 Undecylenic": {
    canonicalAppName: "Aldehyde C-11 Undecylenic",
    normalizedName: "Aldehyde C-11 Undecylenic",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: ["Aldehyde C-11 Undecylenic"],
    stock: null,
    dbNoteRole: "top",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "C-11 undecylenic aldehyde \u2014 soapy, waxy, slightly fatty and abstract. A classic Chanel No.5-lineage aldehyde. Adds lift, luminosity, and a distinctive 'classic perfumery' character to any formula. Use at 0.5-3% for effect.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  Ambrettolide: {
    canonicalAppName: "Ambrettolide",
    normalizedName: "Ambrettolide",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: ["Ambrettolide", "7779-50-2"],
    stock: null,
    dbNoteRole: "base",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Natural macrolide from ambrette seed. Warm, musky, slightly winey and fatty. A biodegradable nature-identical musk with more complexity than the purely synthetic variants. Pairs beautifully with woody and amber bases.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Black Cardamom CO2": {
    canonicalAppName: "Black Cardamom CO2",
    normalizedName: "Black Cardamom CO2",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: ["Black Cardamom CO2", "Black Cardamom"],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "CO2",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Unlike green cardamom, black cardamom has an assertive smokiness alongside the spice. CO2 extraction preserves this distinctive character. Adds depth, mystery, and a camphoraceous-smoky dimension to oriental and aromatic accords.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Black Pepper CO2": {
    canonicalAppName: "Black Pepper CO2",
    normalizedName: "Black Pepper CO2",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: [
      "Black Pepper CO2",
      "Black pepper oil",
      "Black Pepper",
      "Black pepper",
    ],
    stock: null,
    dbNoteRole: "top",
    dbMaterialType: "CO2",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "CO2 black pepper preserves the full spectrum including green woody terpenes and beta-caryophyllene. Sharper and more complex than steam-distilled versions. Essential in masculine foug\u00e8res, woody orientals, and modern aromatic accords.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Cardamom EO": {
    canonicalAppName: "Cardamom EO",
    normalizedName: "Cardamom oil",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: ["Cardamom oil", "Cardamom EO", "Cardamom"],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "EO",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "1,8-Cineole dominant with sweet-spicy aromatic facets. Cardamom is uniquely versatile \u2014 adds warmth without heaviness, brightness to darker accords, and an oriental complexity to anything it touches. Crucial in masculine and unisex accords.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Cedarwood Atlantic EO": {
    canonicalAppName: "Cedarwood Atlantic EO",
    normalizedName: "Cedarwood Atlantic EO",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: [
      "Cedarwood Atlantic EO",
      "Cedarwood Atlantic",
      "Atlas cedarwood",
      "Cedarwood atlas",
      "Cedarwood oil",
    ],
    stock: null,
    dbNoteRole: "base",
    dbMaterialType: "EO",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Moroccan Atlas cedarwood \u2014 atlantone-rich with a distinctive dry, mineral, pencil-shavings character. More austere and elegant than Virginia cedarwood. Excellent for adding woody structure and longevity to any accord.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Cocoa Absolute": {
    canonicalAppName: "Cocoa Absolute",
    normalizedName: "Cocoa Absolute",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: ["Cocoa Absolute", "Cocoa"],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "ABS",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Pyrazine-rich chocolate absolute \u2014 deep, roasted, slightly bitter dark chocolate character. More complex and realistic than any synthetic substitute. Extraordinarily tenacious despite high apparent VP (pyrazines have low ODTs). Essential for gourmand oriental accords.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Gamma Decalactone": {
    canonicalAppName: "Gamma Decalactone",
    normalizedName: "Gamma Decalactone",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: ["Gamma Decalactone"],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "SYNTH",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "The definitive ripe peach lactone \u2014 richer and more tenacious than gamma-nonalactone. Warm, sweet, almost buttery peach character. Essential for peach accords, gourmand compositions, and adding creaminess to fruity florals. Pairs beautifully with rose, jasmine, and vanilla.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Himalayan Cedarwood EO": {
    canonicalAppName: "Himalayan Cedarwood EO",
    normalizedName: "Himalayan Cedarwood EO",
    matchStrategy: "manual_helper_record",
    resolvedIfraMaterial: "himalayan cedarwood eo",
    materialClass: "not_yet_resolved",
    aliases: [
      "Himalayan Cedarwood EO",
      "Himalayan Cedarwood",
      "8023-85-6",
      "Cedrus Deodara Wood Oil",
    ],
    stock: null,
    dbNoteRole: "base",
    dbMaterialType: "EO",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Cedrus deodara \u2014 the softest and cleanest of the cedars. Subtle spice from sesquiterpenes. Dry, fresh-woody character that adds refinement without the earthiness of Atlas or the sharpness of Virginia. An elegant base option.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote:
      "Helper maps Himalayan Cedarwood EO to a canonical identity using app CAS/INCI data. No structured IFRA standard has been promoted into the helper dataset yet.",
  },
  "Jasmine Sambac Absolute": {
    canonicalAppName: "Jasmine Sambac Absolute",
    normalizedName: "Jasmine Sambac Absolute",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: "jasmine sambac absolute",
    materialClass: "not_yet_resolved",
    aliases: [
      "Jasmine Sambac Absolute",
      "Jasmine sambac absolute",
      "Jasmine sambac",
      "Jasmine Sambac",
    ],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "ABS",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Sambac jasmine \u2014 more tropical, indolic, and honeyed than grandiflorum. The scent of leis, tropical evenings, and Indian temples. Heady, rich, with benzyl acetate sweetness and an animalic depth. Pairs with coconut, citrus, and musks.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Menthol Natural Crystals": {
    canonicalAppName: "Menthol Natural Crystals",
    normalizedName: "Menthol Natural Crystals",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: ["Menthol Natural Crystals", "Menthol"],
    stock: null,
    dbNoteRole: "top",
    dbMaterialType: "EO",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "L-Menthol from natural sources \u2014 the definitive cooling agent in perfumery. Activates TRPM8 cold receptors for a physiological cooling sensation. Extraordinary odor intensity at very low concentrations. Use sparingly; pairs with marine, citrus, and aquatic notes.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Orange Blossom Water Abs": {
    canonicalAppName: "Orange Blossom Water Abs",
    normalizedName: "Orange blossom water absolute",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: [
      "Orange blossom water absolute",
      "Orange Blossom Water Abs",
      "Orange blossom absolute",
      "Orange flower absolute",
      "Orange Blossom Water",
    ],
    stock: null,
    dbNoteRole: "mid",
    dbMaterialType: "ABS",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Methyl anthranilate gives this absolute a distinctive grapey-citrus quality alongside the orange blossom. More delicate and aqueous than the full absolute. Adds a unique freshness to white floral accords.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Rosemary EO": {
    canonicalAppName: "Rosemary EO",
    normalizedName: "Rosemary oil",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: ["Rosemary oil", "Rosemary EO", "Rosemary"],
    stock: null,
    dbNoteRole: "top",
    dbMaterialType: "EO",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Mediterranean herbal freshness driven by alpha-pinene, camphor, and 1,8-cineole. Brings an authentic coastal herb character \u2014 the smell of wild rosemary on a sun-baked hillside above the sea. Essential in foug\u00e8res and marine accords.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Sandalwood Mysore EO": {
    canonicalAppName: "Sandalwood Mysore EO",
    normalizedName: "Sandalwood Mysore EO",
    matchStrategy: "unresolved",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: [
      "Sandalwood Mysore EO",
      "Mysore sandalwood",
      "Sandalwood Mysore",
      "Sandalwood oil",
      "Sandalwood",
    ],
    stock: null,
    dbNoteRole: "base",
    dbMaterialType: "EO",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "The world's finest sandalwood \u2014 alpha-santalol dominant, creamy, milky, soft woody character. Extraordinary tenacity and skin-affinity. Endangered and expensive. Works beautifully as a primary base note or as an accord enhancer.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: "No PDF match found automatically \u2014 manual review needed",
  },
  "Vanilla Absolute": {
    canonicalAppName: "Vanilla Absolute",
    normalizedName: "Vanilla Absolute",
    matchStrategy: "manual_helper_record",
    resolvedIfraMaterial: "vanilla absolute",
    materialClass: "not_yet_resolved",
    aliases: [
      "Vanilla Absolute",
      "Vanilla",
      "8006-39-1",
      "Vanilla Planifolia Fruit Extract",
    ],
    stock: null,
    dbNoteRole: "base",
    dbMaterialType: "ABS",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Full vanilla bean absolute \u2014 rich, complex, warm. Goes beyond vanillin to include coumarin, para-hydroxybenzaldehyde, and numerous trace aromatic compounds. The most natural-smelling vanilla option. Extraordinary fixative properties.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote:
      "Helper maps Vanilla Absolute to a canonical identity using app CAS/INCI data. No structured IFRA standard has been promoted into the helper dataset yet.",
  },
  "Vanilla Bourbon Absolute": {
    canonicalAppName: "Vanilla Bourbon Absolute",
    normalizedName: "Vanilla Bourbon Absolute",
    matchStrategy: "manual_helper_record",
    resolvedIfraMaterial: "vanilla bourbon absolute",
    materialClass: "not_yet_resolved",
    aliases: [
      "Vanilla Bourbon Absolute",
      "Vanilla Bourbon",
      "84650-60-2",
      "Vanilla Planifolia Bourbon Fruit Extract",
    ],
    stock: null,
    dbNoteRole: "base",
    dbMaterialType: "ABS",
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Bourbon vanilla from R\u00e9union/Madagascar \u2014 richer, creamier, and slightly darker than Tahitian vanilla. High vanillin content with additional coumarin warmth. The definitive vanilla for oriental and gourmand bases.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote:
      "Helper maps Vanilla Bourbon Absolute to a canonical identity using app CAS/INCI data. No structured IFRA standard has been promoted into the helper dataset yet.",
  },
};

export const IFRA_COMPLIANCE_CONFIG = {
  defaultCategory: "cat4",
  preferredIdentityResolutionOrder: [
    "cas",
    "canonicalName",
    "synonym",
    "inci",
    "aliasMap",
    "manualReview",
  ],
  nonOdorMaterialClasses: ["functional_solvent", "carrier"],
  stockHandling: {
    enabled: true,
    rule: "For diluted stocks, active restricted material contribution = formula usage percent \u00d7 activePercent/100.",
  },
  uiStates: {
    listed: "Show recommendation type and Cat 4 limit if present.",
    functional_solvent:
      "Show neutral 'Functional material / no specific IFRA standard expected' state.",
    not_found_in_uploaded_pdf:
      "Show neutral 'No specific IFRA standard found in uploaded source dataset' state.",
    unresolved_identity:
      "Show warning 'Identity unresolved \u2014 review alias/CAS/INCI mapping'.",
  },
};

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeCasSupportToken(value) {
  const match = String(value || "")
    .trim()
    .match(/(\d{2,7}-\d{2}-\d)/);
  return match?.[1] || null;
}

function compareCasSupportTokenOrder(a, b) {
  const splitParts = (value) =>
    String(value || "")
      .split("-")
      .map((part) => Number(part));
  const [aHead = 0, aMid = 0, aTail = 0] = splitParts(a);
  const [bHead = 0, bMid = 0, bTail = 0] = splitParts(b);
  if (aHead !== bHead) return aHead - bHead;
  if (aMid !== bMid) return aMid - bMid;
  return aTail - bTail;
}

export function parseMaterialCasSupport(value) {
  const rawValue = Array.isArray(value)
    ? value
        .flatMap((entry) =>
          String(entry || "")
            .split(/[;\n]+/)
            .map((part) => part.trim())
        )
        .filter(Boolean)
        .join(" ; ")
    : String(value || "").trim();
  if (!rawValue) {
    return {
      rawValue: "",
      state: "unknown",
      values: [],
      primaryValue: null,
      displayValue: "",
      comparisonKey: "",
      hasValue: false,
      isMixture: false,
      hasStructuredCas: false,
    };
  }

  const mixtureOnly =
    /\bmixture\b/i.test(rawValue) &&
    !/(\d{2,7}-\d{2}-\d)/.test(rawValue);
  if (mixtureOnly) {
    return {
      rawValue,
      state: "mixture",
      values: [],
      primaryValue: "Mixture",
      displayValue: "Mixture",
      comparisonKey: "mixture",
      hasValue: true,
      isMixture: true,
      hasStructuredCas: false,
    };
  }

  const casValues = Array.from(
    new Set(
      Array.from(rawValue.matchAll(/(\d{2,7}-\d{2}-\d)/g))
        .map((match) => match?.[1] || null)
        .filter(Boolean)
    )
  ).sort(compareCasSupportTokenOrder);

  if (casValues.length === 0) {
    return {
      rawValue,
      state: "unknown",
      values: [],
      primaryValue: rawValue,
      displayValue: rawValue,
      comparisonKey: normalizeText(rawValue),
      hasValue: true,
      isMixture: false,
      hasStructuredCas: false,
    };
  }

  const state = casValues.length === 1 ? "single" : "multiple";
  const displayValue =
    state === "single" ? casValues[0] : casValues.join(" ; ");

  return {
    rawValue,
    state,
    values: casValues,
    primaryValue: state === "single" ? casValues[0] : displayValue,
    displayValue,
    comparisonKey: `${state}:${casValues.join(";")}`,
    hasValue: true,
    isMixture: false,
    hasStructuredCas: true,
  };
}

export function formatMaterialCasSupportValue(value) {
  return parseMaterialCasSupport(value).displayValue;
}

export function compareMaterialCasSupportValues(left, right) {
  const leftSupport = parseMaterialCasSupport(left);
  const rightSupport = parseMaterialCasSupport(right);
  if (!leftSupport.hasValue || !rightSupport.hasValue) return false;
  if (leftSupport.state === "mixture" || rightSupport.state === "mixture") {
    return (
      leftSupport.state === "mixture" && rightSupport.state === "mixture"
    );
  }
  if (leftSupport.hasStructuredCas && rightSupport.hasStructuredCas) {
    return leftSupport.comparisonKey === rightSupport.comparisonKey;
  }
  return normalizeText(leftSupport.displayValue) === normalizeText(rightSupport.displayValue);
}

const HERO_IFRA_UNRESOLVED_IDENTITY_TRACKING = {
  "Aldehyde C-8": {
    canonicalAppName: "Aldehyde C-8",
    normalizedName: "Octanal / Aldehyde C-8",
    aliases: ["Aldehyde C-8", "Ald C-8", "Aldehyde C8", "Octanal", "124-13-0"],
    dbNoteRole: "top",
    dbMaterialType: "SYNTH",
    reviewNote:
      "Tracked as octanal identity only. Current structured IFRA data has no standalone Octanal/Aldehyde C-8 standard; octanal substring hits in other standards are intentionally not used.",
  },
  Algenone: {
    canonicalAppName: "Algenone",
    normalizedName: "Algenone",
    aliases: ["Algenone"],
    dbNoteRole: "mid",
    dbMaterialType: "SYNTH",
    requiresSupplierIfraSds: true,
    reviewNote:
      "Source-backed app support exists, but no structured IFRA standard is wired. Supplier IFRA/SDS is needed before launch clearance.",
  },
  "Allyl Amyl Glycolate": {
    canonicalAppName: "Allyl Amyl Glycolate",
    normalizedName: "Allyl Amyl Glycolate",
    aliases: ["Allyl Amyl Glycolate", "Allyl amyl glycolate"],
    dbNoteRole: "top",
    dbMaterialType: "SYNTH",
    reviewNote:
      "Tracked as unresolved hero material; no structured IFRA standard is wired from current repo data.",
  },
  "Caryophyllene Oxide": {
    canonicalAppName: "Caryophyllene Oxide",
    normalizedName: "Caryophyllene Oxide",
    aliases: ["Caryophyllene Oxide", "Caryophyllene oxide"],
    dbNoteRole: "base",
    dbMaterialType: "SYNTH",
    reviewNote:
      "Tracked as unresolved hero material; no structured IFRA standard is wired from current repo data.",
  },
  Celestafleur: {
    canonicalAppName: "Celestafleur",
    normalizedName: "Celestafleur",
    aliases: ["Celestafleur", "Celestafleur®"],
    dbNoteRole: "mid",
    dbMaterialType: "SYNTH",
    requiresSupplierIfraSds: true,
    reviewNote:
      "Tracked as separate proprietary/specialty material. Do not map to another floral material without source support.",
  },
  Cetalox: {
    canonicalAppName: "Cetalox",
    normalizedName: "Cetalox",
    aliases: ["Cetalox", "Cetalox®"],
    dbNoteRole: "base",
    dbMaterialType: "SYNTH",
    requiresSupplierIfraSds: true,
    reviewNote:
      "Tracked separately from Ambroxan/Ambroxide. No structured IFRA standard is wired for Cetalox in current repo data.",
  },
  Clearwood: {
    canonicalAppName: "Clearwood",
    normalizedName: "Clearwood",
    aliases: ["Clearwood", "Clearwood®"],
    dbNoteRole: "base",
    dbMaterialType: "SYNTH",
    requiresSupplierIfraSds: true,
    reviewNote:
      "Tracked as proprietary/specialty material with no structured IFRA standard wired from current repo data.",
  },
  Cyclogalbanate: {
    canonicalAppName: "Cyclogalbanate",
    normalizedName: "Cyclogalbanate",
    aliases: ["Cyclogalbanate"],
    dbNoteRole: "top",
    dbMaterialType: "SYNTH",
    requiresSupplierIfraSds: true,
    reviewNote:
      "Source-backed app support exists, but no structured IFRA standard is wired. Supplier IFRA/SDS is needed before launch clearance.",
  },
  Cypriol: {
    canonicalAppName: "Cypriol",
    normalizedName: "Cypriol",
    aliases: ["Cypriol"],
    dbNoteRole: "base",
    dbMaterialType: "OIL",
    requiresSupplierIfraSds: true,
    reviewNote:
      "Source-backed app support exists, but no structured IFRA standard is wired. Supplier IFRA/SDS is needed before launch clearance.",
  },
  "Ethyl Linalool": {
    canonicalAppName: "Ethyl Linalool",
    normalizedName: "Ethyl Linalool",
    aliases: ["Ethyl Linalool", "Ethyl linalool"],
    dbNoteRole: "top",
    dbMaterialType: "SYNTH",
    reviewNote:
      "Tracked as unresolved hero material. Current master data contains Linalool standards, but this row is not mapped to Linalool.",
  },
  "Ethyl Linalyl Acetate": {
    canonicalAppName: "Ethyl Linalyl Acetate",
    normalizedName: "Ethyl Linalyl Acetate",
    aliases: ["Ethyl Linalyl Acetate", "Ethyl linalyl acetate"],
    dbNoteRole: "top",
    dbMaterialType: "SYNTH",
    reviewNote:
      "Tracked as unresolved hero material; no structured IFRA standard is wired from current repo data.",
  },
  "Ethyl Vanillin": {
    canonicalAppName: "Ethyl Vanillin",
    normalizedName: "Ethyl Vanillin",
    aliases: ["Ethyl Vanillin", "Ethylvanillin", "121-32-4"],
    dbNoteRole: "mid",
    dbMaterialType: "SYNTH",
    reviewNote:
      "Safe name alias only. No structured IFRA standard is wired from current repo data.",
  },
  Florol: {
    canonicalAppName: "Florol",
    normalizedName: "Florol",
    aliases: ["Florol", "Florol®"],
    dbNoteRole: "mid",
    dbMaterialType: "SYNTH",
    requiresSupplierIfraSds: true,
    reviewNote:
      "Tracked as commercial/specialty material with no structured IFRA standard wired from current repo data.",
  },
  Geosmin: {
    canonicalAppName: "Geosmin",
    normalizedName: "Geosmin",
    aliases: ["Geosmin"],
    dbNoteRole: "base",
    dbMaterialType: "SYNTH",
    reviewNote:
      "Tracked as unresolved hero material; no structured IFRA standard is wired from current repo data.",
  },
  Hedione: {
    canonicalAppName: "Hedione",
    normalizedName: "Methyl dihydrojasmonate / Hedione",
    aliases: [
      "Hedione",
      "Hedione®",
      "Methyl dihydrojasmonate",
      "MDJ",
      "24851-98-7",
    ],
    dbNoteRole: "mid",
    dbMaterialType: "SYNTH",
    reviewNote:
      "Safe identity aliases only. No structured IFRA standard is wired from current repo data.",
  },
  "Hedione HC": {
    canonicalAppName: "Hedione HC",
    normalizedName: "Hedione High Cis",
    aliases: ["Hedione HC", "Hedione High Cis", "Hedione® High Cis"],
    dbNoteRole: "mid",
    dbMaterialType: "SYNTH",
    requiresSupplierIfraSds: true,
    reviewNote:
      "Tracked separately from regular Hedione because current repo data does not wire a source-backed IFRA standard for this specific product.",
  },
  Maritima: {
    canonicalAppName: "Maritima",
    normalizedName: "Maritima",
    aliases: ["Maritima", "Maritima®"],
    dbNoteRole: "top",
    dbMaterialType: "SYNTH",
    requiresSupplierIfraSds: true,
    reviewNote:
      "Tracked as separate proprietary/specialty material. Do not map to Oceanol or another marine material without source support.",
  },
  "Methyl Ionone Alpha Extra": {
    canonicalAppName: "Methyl Ionone Alpha Extra",
    normalizedName: "Methyl Ionone Alpha Extra",
    aliases: ["Methyl Ionone Alpha Extra", "Methyl ionone alpha extra"],
    dbNoteRole: "base",
    dbMaterialType: "SYNTH",
    reviewNote:
      "Tracked as unresolved hero material; no structured IFRA standard is wired from current repo data.",
  },
  Oceanol: {
    canonicalAppName: "Oceanol",
    normalizedName: "Oceanol",
    aliases: ["Oceanol", "Oceanol®"],
    dbNoteRole: "top",
    dbMaterialType: "SYNTH",
    requiresSupplierIfraSds: true,
    reviewNote:
      "Tracked as separate specialty marine material. Do not map to Calone, Maritima, or another marine material without source support.",
  },
  "Orbitone T Neo": {
    canonicalAppName: "Orbitone T Neo",
    normalizedName: "Orbitone T Neo",
    aliases: ["Orbitone T Neo", "Orbitone® T Neo"],
    dbNoteRole: "base",
    dbMaterialType: "SYNTH",
    requiresSupplierIfraSds: true,
    reviewNote:
      "Tracked as separate commercial IES-family product. No structured IFRA standard is wired from current repo data.",
  },
  "Phenyl Ethyl Acetate": {
    canonicalAppName: "Phenyl Ethyl Acetate",
    normalizedName: "Phenyl Ethyl Acetate",
    aliases: ["Phenyl Ethyl Acetate", "Phenethyl acetate", "Phenylethyl acetate"],
    dbNoteRole: "mid",
    dbMaterialType: "SYNTH",
    reviewNote:
      "Tracked as unresolved hero material; no structured IFRA standard is wired from current repo data.",
  },
  "Pink Peppercorn Oil P&N": {
    canonicalAppName: "Pink Peppercorn Oil P&N",
    normalizedName: "Pink Peppercorn Oil P&N",
    aliases: ["Pink Peppercorn Oil P&N", "Pink Peppercorn Oil", "Pink pepper oil"],
    dbNoteRole: "top",
    dbMaterialType: "OIL",
    requiresSupplierIfraSds: true,
    reviewNote:
      "Source-backed app support exists, but no structured IFRA standard is wired. Botanical Schinus aliases are not added without source confirmation.",
  },
  Timbersilk: {
    canonicalAppName: "Timbersilk",
    normalizedName: "Timbersilk",
    aliases: ["Timbersilk", "Timbersilk®"],
    dbNoteRole: "base",
    dbMaterialType: "SYNTH",
    requiresSupplierIfraSds: true,
    reviewNote:
      "Tracked as separate commercial IES-family product. No structured IFRA standard is wired from current repo data.",
  },
  Veramoss: {
    canonicalAppName: "Veramoss",
    normalizedName: "Methyl atrarate / Veramoss",
    aliases: ["Veramoss", "Veramoss®", "Evernyl", "Evernyl®", "Methyl atrarate"],
    dbNoteRole: "base",
    dbMaterialType: "SYNTH",
    requiresSupplierIfraSds: true,
    reviewNote:
      "Safe identity aliases only. No structured IFRA standard is wired from current repo data.",
  },
  "Vetiveryl Acetate": {
    canonicalAppName: "Vetiveryl Acetate",
    normalizedName: "Vetiveryl Acetate",
    aliases: ["Vetiveryl Acetate", "Vetiveryl acetate"],
    dbNoteRole: "base",
    dbMaterialType: "SYNTH",
    reviewNote:
      "Tracked as unresolved hero material; no structured IFRA standard is wired from current repo data.",
  },
};

function buildHeroIfraUnresolvedIdentity(record) {
  return {
    canonicalAppName: record.canonicalAppName,
    normalizedName: record.normalizedName || record.canonicalAppName,
    matchStrategy: "hero_ifra_unresolved_tracking",
    resolvedIfraMaterial: null,
    materialClass: "not_yet_resolved",
    aliases: record.aliases || [record.canonicalAppName],
    stock: null,
    dbNoteRole: record.dbNoteRole || null,
    dbMaterialType: record.dbMaterialType || "SYNTH",
    requiresSupplierIfraSds: Boolean(record.requiresSupplierIfraSds),
    currentAppIfraFlag: false,
    currentAppIfraText:
      "Tracked in the hero IFRA gap inventory. No structured IFRA limit is wired from current repo data.",
    pdfMatchStatus: "not_found",
    pdfMatchedAlias: null,
    pdfMatchedPage: null,
    reviewNote: record.reviewNote,
  };
}

function resolveHeroIfraUnresolvedIdentity(name) {
  const normalized = normalizeText(name);
  if (!normalized) return null;
  for (const record of Object.values(HERO_IFRA_UNRESOLVED_IDENTITY_TRACKING)) {
    const aliases = record.aliases || [record.canonicalAppName];
    if (aliases.some((alias) => normalizeText(alias) === normalized)) {
      return buildHeroIfraUnresolvedIdentity(record);
    }
  }
  return null;
}

function resolveIngredientIdentityDirect(name) {
  const direct = INGREDIENT_IDENTITY_MAP[name];
  if (direct) return direct;

  const normalized = normalizeText(name);
  for (const [key, record] of Object.entries(INGREDIENT_IDENTITY_MAP)) {
    if (normalizeText(key) === normalized) return record;
    if (
      (record.aliases || []).some(
        (alias) => normalizeText(alias) === normalized
      )
    )
      return record;
  }
  const heroTracked = resolveHeroIfraUnresolvedIdentity(name);
  if (heroTracked) return heroTracked;
  return null;
}

export function resolveIngredientIdentity(name) {
  const direct = resolveIngredientIdentityDirect(name);
  if (direct) return direct;

  const canonicalName = getCanonicalCatalogName(name);
  if (!canonicalName) return null;

  const inherited = resolveIngredientIdentityDirect(canonicalName);
  if (!inherited) return null;
  const normalizationEntry = getMaterialNormalizationEntry(name);
  const stock = normalizationEntry?.stock
    ? {
        activeMaterialName:
          normalizationEntry.stock.activeMaterialName ||
          inherited.stock?.activeMaterialName ||
          inherited.canonicalAppName ||
          canonicalName,
        activePercent:
          normalizationEntry.stock.activePercent ?? inherited.stock?.activePercent,
        carrierName:
          normalizationEntry.stock.carrierName ?? inherited.stock?.carrierName ?? null,
      }
    : inherited.stock;

  return {
    ...inherited,
    materialClass:
      normalizationEntry?.entryKind === "diluted_stock"
        ? "diluted_stock"
        : inherited.materialClass,
    stock,
    inheritedViaCanonicalMaterialKey: true,
    inheritedFromCatalogName: canonicalName,
    sourceCatalogName: name,
    normalizationEntry,
  };
}

export function getIfraMaterialRecord(name) {
  const resolved = resolveIngredientIdentity(name);
  if (!resolved) return null;
  const key = resolved.resolvedIfraMaterial;
  return key ? IFRA_MASTER_MATERIALS[key] || null : null;
}

export function getIfraUiState(name) {
  const resolved = resolveIngredientIdentity(name);
  if (!resolved) return "unresolved_identity";

  const material = getIfraMaterialRecord(name);
  if (material && material.status === "active") return "listed";

  if (
    resolved.materialClass === "functional_solvent" ||
    resolved.materialClass === "carrier"
  ) {
    return "functional_solvent";
  }

  if (material && material.status === "not_found_in_uploaded_pdf")
    return "not_found_in_uploaded_pdf";

  return "unresolved_identity";
}

function hasDefinedIfraLimit(material = {}) {
  return Object.values(material?.limits || {}).some((limit) => limit != null);
}

function getIfraAuditMatchKind(name, material = {}) {
  const normalizedName = normalizeText(name);
  const normalizedCanonical = normalizeText(material?.canonicalName);
  if (normalizedName && normalizedCanonical && normalizedName === normalizedCanonical) {
    return "exact";
  }
  return "alias";
}

const SUPPLIER_IFRA_SDS_MATERIAL_TYPES = new Set([
  "ABS",
  "CO2",
  "EO",
  "EXTRACT",
  "NAT",
  "NATURAL",
  "OIL",
  "RESINOID",
  "TINCTURE",
]);

const SUPPLIER_IFRA_SDS_NAME_PATTERNS = [
  /\babsolute\b/,
  /\beo\b/,
  /\boil\b/,
  /\bco2\b/,
  /\bextract\b/,
  /\bresinoid\b/,
  /\btincture\b/,
];

function hasFcfSignal({ name, material, identity } = {}) {
  const values = [
    name,
    material?.canonicalName,
    material?.missingLimitReason,
    identity?.matchStrategy,
    identity?.reviewNote,
    ...(material?.synonyms || []),
    ...(identity?.aliases || []),
  ];
  return values.some((value) => {
    const normalized = normalizeText(value);
    return (
      normalized.includes("fcf") ||
      normalized.includes("furocoumarin-free") ||
      normalized.includes("furocoumarin free")
    );
  });
}

function needsSupplierIfraSds({ name, record, material, identity } = {}) {
  if (hasFcfSignal({ name, material, identity })) return false;
  if (identity?.requiresSupplierIfraSds || material?.requiresSupplierIfraSds)
    return true;
  const materialType = String(
    record?.type || identity?.dbMaterialType || ""
  ).toUpperCase();
  if (SUPPLIER_IFRA_SDS_MATERIAL_TYPES.has(materialType)) return true;
  if (record?.isUVCB || identity?.isUVCB || material?.isUVCB) return true;
  const normalizedName = normalizeText(name);
  return SUPPLIER_IFRA_SDS_NAME_PATTERNS.some((pattern) =>
    pattern.test(normalizedName)
  );
}

export function auditFormulaIfraCoverage(items = [], { db = {} } = {}) {
  const counts = {
    exactIfraMatch: 0,
    aliasIfraMatch: 0,
    intentionallyNotMatchedNoStandard: 0,
    noKnownRestriction: 0,
    missingAlias: 0,
    accordLevelOnly: 0,
    sourceUnavailable: 0,
    supplierSdsNeeded: 0,
    fcfSpecialCase: 0,
    knownRestrictionRows: 0,
  };

  const rows = (Array.isArray(items) ? items : []).map((item) => {
    const name = item?.name || "";
    const record = db?.[name] || {};
    const recipe = getHeroFormulaAccordRecipe(name);
    if (recipe || record?.type === "ACCORD") {
      counts.accordLevelOnly += 1;
      return {
        name,
        category: "accordLevelOnly",
        label: "Accord-level row; component IFRA not expanded",
        recipeName: recipe?.name || null,
        matchedMaterial: null,
      };
    }

    const identity = resolveIngredientIdentity(name);
    const material = getIfraMaterialRecord(name);
    const state = getIfraUiState(name);

    if (material && material.status === "active" && hasDefinedIfraLimit(material)) {
      const matchKind = getIfraAuditMatchKind(name, material);
      if (matchKind === "exact") counts.exactIfraMatch += 1;
      else counts.aliasIfraMatch += 1;
      counts.knownRestrictionRows += 1;
      return {
        name,
        category: matchKind === "exact" ? "exactIfraMatch" : "aliasIfraMatch",
        label: matchKind === "exact" ? "Exact matched" : "Alias matched",
        matchedMaterial: material.canonicalName,
        resolvedIfraMaterial: identity?.resolvedIfraMaterial || null,
        limitSummary: material.limits || {},
      };
    }

    if (
      state === "functional_solvent" ||
      material?.status === "not_found_in_uploaded_pdf"
    ) {
      if (needsSupplierIfraSds({ name, record, material, identity })) {
        counts.supplierSdsNeeded += 1;
        return {
          name,
          category: "supplierSdsNeeded",
          label: "Supplier IFRA/SDS needed before launch clearance",
          matchedMaterial: material?.canonicalName || identity?.canonicalAppName || null,
          resolvedIfraMaterial: identity?.resolvedIfraMaterial || null,
        };
      }
      counts.intentionallyNotMatchedNoStandard += 1;
      counts.noKnownRestriction += 1;
      return {
        name,
        category: "intentionallyNotMatchedNoStandard",
        label: "No known restriction in current structured data",
        matchedMaterial: material?.canonicalName || identity?.canonicalAppName || null,
        resolvedIfraMaterial: identity?.resolvedIfraMaterial || null,
      };
    }

    if (material && material.status === "active" && !hasDefinedIfraLimit(material)) {
      if (hasFcfSignal({ name, material, identity })) {
        counts.fcfSpecialCase += 1;
        return {
          name,
          category: "fcfSpecialCase",
          label: "Special handling: FCF/furocoumarin-free citrus",
          matchedMaterial: material.canonicalName,
          resolvedIfraMaterial: identity?.resolvedIfraMaterial || null,
          missingLimitReason: material.missingLimitReason || null,
        };
      }
      if (needsSupplierIfraSds({ name, record, material, identity })) {
        counts.supplierSdsNeeded += 1;
        return {
          name,
          category: "supplierSdsNeeded",
          label: "Supplier IFRA/SDS needed before launch clearance",
          matchedMaterial: material.canonicalName,
          resolvedIfraMaterial: identity?.resolvedIfraMaterial || null,
          missingLimitReason: material.missingLimitReason || null,
        };
      }
      if (!material.missingLimitReason) {
        counts.intentionallyNotMatchedNoStandard += 1;
        counts.noKnownRestriction += 1;
        return {
          name,
          category: "intentionallyNotMatchedNoStandard",
          label: "No known restriction in current structured data",
          matchedMaterial: material.canonicalName,
          resolvedIfraMaterial: identity?.resolvedIfraMaterial || null,
        };
      }
      counts.sourceUnavailable += 1;
      return {
        name,
        category: "sourceUnavailable",
        label: "Source unavailable in current structured IFRA data",
        matchedMaterial: material.canonicalName,
        resolvedIfraMaterial: identity?.resolvedIfraMaterial || null,
        missingLimitReason: material.missingLimitReason || null,
      };
    }

    if (identity && !material) {
      if (needsSupplierIfraSds({ name, record, material, identity })) {
        counts.supplierSdsNeeded += 1;
        return {
          name,
          category: "supplierSdsNeeded",
          label: "Supplier IFRA/SDS needed before launch clearance",
          matchedMaterial: null,
          resolvedIfraMaterial: identity.resolvedIfraMaterial || null,
        };
      }
      counts.sourceUnavailable += 1;
      return {
        name,
        category: "sourceUnavailable",
        label: "Source unavailable in current structured IFRA data",
        matchedMaterial: null,
        resolvedIfraMaterial: identity.resolvedIfraMaterial || null,
      };
    }

    if (needsSupplierIfraSds({ name, record, material, identity })) {
      counts.supplierSdsNeeded += 1;
      return {
        name,
        category: "supplierSdsNeeded",
        label: "Supplier IFRA/SDS needed before launch clearance",
        matchedMaterial: null,
        resolvedIfraMaterial: null,
      };
    }

    counts.missingAlias += 1;
    return {
      name,
      category: "missingAlias",
      label: "No IFRA record matched in current structured data",
      matchedMaterial: null,
      resolvedIfraMaterial: null,
    };
  });

  return { counts, rows };
}

export function computeActiveRestrictedPercent({
  formulaPercent,
  ingredientName,
  activePercentOverride = null,
}) {
  const normalizedActivePercentOverride =
    activePercentOverride != null ? Number(activePercentOverride) : null;
  if (
    Number.isFinite(normalizedActivePercentOverride) &&
    normalizedActivePercentOverride >= 0
  ) {
    return formulaPercent * (normalizedActivePercentOverride / 100);
  }
  const normalizationStockActivePercent = Number(
    getMaterialNormalizationEntry(ingredientName)?.stock?.activePercent
  );
  if (
    Number.isFinite(normalizationStockActivePercent) &&
    normalizationStockActivePercent >= 0
  ) {
    return formulaPercent * (normalizationStockActivePercent / 100);
  }
  const resolved = resolveIngredientIdentity(ingredientName);
  if (!resolved) return null;
  const stock = resolved.stock;
  if (!stock || !stock.activePercent) return formulaPercent;
  return formulaPercent * (stock.activePercent / 100);
}

export const IFRA_CATEGORY_LABELS = {
  cat4: "Cat 4 — Fine Fragrance",
  cat5b: "Cat 5b — Face Moisturizer",
  cat9: "Cat 9 — Body Lotion",
  cat1: "Cat 1 — Lip Product",
  cat11a: "Cat 11a — Rinse-off Body",
};

function hasCompletenessValue(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function countCompletenessValues(values = []) {
  return values.filter((value) => hasCompletenessValue(value)).length;
}

function buildIngredientTruthLevel({
  totalConsideredCount,
  confirmedCount,
  inferredCount,
  uncertainCount,
  missingCount,
}) {
  const safeTotal = Math.max(0, Number(totalConsideredCount) || 0);
  const safeConfirmed = Math.max(0, Number(confirmedCount) || 0);
  const safeInferred = Math.max(0, Number(inferredCount) || 0);
  const safeUncertain = Math.max(0, Number(uncertainCount) || 0);
  const safeMissing = Math.max(0, Number(missingCount) || 0);
  const resolvedCount = safeConfirmed + safeInferred;
  const confirmedCoveragePercent =
    safeTotal > 0 ? (safeConfirmed / safeTotal) * 100 : 0;
  const resolvedCoveragePercent =
    safeTotal > 0 ? (resolvedCount / safeTotal) * 100 : 0;

  let level = "strong";
  if (safeTotal === 0 || safeMissing >= 3 || resolvedCoveragePercent < 50) {
    level = "sparse";
  } else if (
    safeMissing > 0 ||
    safeUncertain > 0 ||
    resolvedCoveragePercent < 85
  ) {
    level = "partial";
  }

  const levelLabel =
    level === "strong"
      ? "Strong"
      : level === "partial"
      ? "Partial"
      : "Sparse";
  const headline =
    level === "strong"
      ? "Identity, pricing, and technical support look strong enough for most ingredient-driven reads."
      : level === "partial"
      ? "This material is still usable, but some pricing, IFRA, or technical support remains partial."
      : "Major truth gaps still make costing, substitution, or compliance reads provisional for this material.";
  const ingredientTrustCounts =
    level === "strong"
      ? {
          totalConsideredCount: 1,
          confirmedCount: 1,
          inferredCount: 0,
          uncertainCount: 0,
          missingCount: 0,
        }
      : level === "partial"
      ? {
          totalConsideredCount: 1,
          confirmedCount: 0,
          inferredCount: safeMissing === 0 && safeUncertain === 0 ? 1 : 0,
          uncertainCount: safeMissing === 0 && safeUncertain === 0 ? 0 : 1,
          missingCount: 0,
        }
      : {
          totalConsideredCount: 1,
          confirmedCount: 0,
          inferredCount: 0,
          uncertainCount: 0,
          missingCount: 1,
        };

  return {
    level,
    levelLabel,
    headline,
    totalConsideredCount: safeTotal,
    confirmedCount: safeConfirmed,
    inferredCount: safeInferred,
    uncertainCount: safeUncertain,
    missingCount: safeMissing,
    resolvedCount,
    confirmedCoveragePercent: Number(confirmedCoveragePercent.toFixed(1)),
    resolvedCoveragePercent: Number(resolvedCoveragePercent.toFixed(1)),
    supportLabel: `${resolvedCoveragePercent.toFixed(
      0
    )}% covered · ${confirmedCoveragePercent.toFixed(0)}% strong`,
    breakdownLabel: `${Math.round(safeConfirmed)} strong · ${Math.round(
      safeInferred
    )} partial · ${Math.round(safeUncertain)} uncertain · ${Math.round(
      safeMissing
    )} missing`,
    ingredientTrustCounts,
  };
}

function buildManualTrustedConflictFieldSet(record = {}) {
  return new Set(
    [
      ...(Array.isArray(record?.activeConflictFieldKeys)
        ? record.activeConflictFieldKeys
        : []),
      ...(Array.isArray(record?.manualConflictFieldKeys)
        ? record.manualConflictFieldKeys
        : []),
      ...(Array.isArray(record?.conflictFieldKeys) ? record.conflictFieldKeys : []),
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );
}

function hasAnyManualTrustedConflict(conflictFieldSet, fieldKeys = []) {
  const safeConflictFieldSet =
    conflictFieldSet instanceof Set ? conflictFieldSet : new Set();
  return (fieldKeys || []).some((fieldKey) =>
    safeConflictFieldSet.has(String(fieldKey || "").trim())
  );
}

export function buildIngredientTruthCompletenessReport(
  name,
  { record = null, livePricing = null } = {}
) {
  const safeRecord = record && typeof record === "object" ? record : {};
  const normalizationEntry =
    safeRecord?.normalizationEntry || getMaterialNormalizationEntry(name);
  const resolvedIdentity = resolveIngredientIdentity(name);
  const canonicalMaterialKey =
    normalizationEntry?.canonicalMaterialKey ||
    resolvedIdentity?.normalizationEntry?.canonicalMaterialKey ||
    resolvedIdentity?.canonicalMaterialKey ||
    safeRecord?.canonicalMaterialKey ||
    null;
  const isLocalDraft = Boolean(
    safeRecord?.isLocalDraft || normalizationEntry?.entryKind === "local_draft"
  );
  const canonicalCatalogName = getCanonicalCatalogName(name);
  const canonicalSource = canonicalMaterialKey
    ? getCanonicalMaterialSource(canonicalMaterialKey)
    : null;
  const sourceDocuments = canonicalMaterialKey
    ? getSourceDocumentsForCanonicalMaterialKey(canonicalMaterialKey)
    : [];
  const evidenceCandidates = canonicalMaterialKey
    ? getEvidenceCandidatesForCanonicalMaterialKey(canonicalMaterialKey)
    : [];
  const catalogSupplierProducts = getSupplierProductsForCatalogName(name);
  const canonicalSupplierProducts = canonicalMaterialKey
    ? getSupplierProductsForCanonicalMaterialKey(canonicalMaterialKey)
    : [];
  const supplierProducts = Array.from(
    new Map(
      [...catalogSupplierProducts, ...canonicalSupplierProducts].map((record) => [
        record?.supplierProductKey ||
          `${record?.supplierDisplayName || "supplier"}:${
            record?.productTitle || "product"
          }`,
        record,
      ])
    ).values()
  );
  const livePricingEntries = Object.entries(livePricing || {});
  const livePricingSupplierCount = livePricingEntries.filter(
    ([, supplierData]) =>
      countCompletenessValues([
        ...(Array.isArray(supplierData?.S) ? supplierData.S : []),
        ...(Array.isArray(supplierData?.P) ? supplierData.P : []),
        supplierData?.price,
      ]) > 0
  ).length;
  const livePricingPackCount = livePricingEntries.reduce((sum, [, supplierData]) => {
    const sizeCount = Array.isArray(supplierData?.S)
      ? supplierData.S.filter(
          (value) => Number.isFinite(Number(value)) && Number(value) > 0
        ).length
      : 0;
    return sum + sizeCount;
  }, 0);
  const catalogSupplierCount = new Set(
    supplierProducts.map((record) => record?.supplierDisplayName).filter(Boolean)
  ).size;
  const ifraMaterial = getIfraMaterialRecord(name);
  const ifraUiState = getIfraUiState(name);
  const hasManualIdentityEdit = Boolean(safeRecord?.manualIdentityEdited);
  const hasManualTechnicalEdit = Boolean(safeRecord?.manualTechnicalEdited);
  const hasManualSupplierEdit = Boolean(safeRecord?.manualSupplierEdited);
  const conflictFieldSet = buildManualTrustedConflictFieldSet(safeRecord);
  const hasIdentityConflict = hasAnyManualTrustedConflict(conflictFieldSet, [
    "identity",
    "cas",
    "inci",
    "rep",
    "type",
    "canonicalMaterialKey",
  ]);
  const hasRegulatoryConflict = hasAnyManualTrustedConflict(conflictFieldSet, [
    "regulatory",
    "cas",
    "inci",
  ]);
  const hasSupplierConflict = hasAnyManualTrustedConflict(conflictFieldSet, [
    "supplier",
    "supplierName",
    "supplierProductKey",
    "supplierProductUrl",
    "url",
    "availabilityStatus",
    "sdsUrl",
    "manualSdsAttachment",
    "supplierNotes",
    "originNote",
    "price",
    "pricePoints",
    "pricing",
    "dilutionOrCarrier",
  ]);
  const hasTechnicalConflict = hasAnyManualTrustedConflict(conflictFieldSet, [
    "technical",
    "MW",
    "xLogP",
    "VP",
    "vaporPressureRaw",
    "vaporPressureObservations",
    "ODT",
    "TPSA",
    "odorThreshold_ngL",
  ]);
  const hasIfraConflict = hasAnyManualTrustedConflict(conflictFieldSet, [
    "ifra",
    "ifraPercent",
    "ifraMaterialHint",
    "restriction",
    "cat4",
  ]);
  const hasActiveManualConflict = conflictFieldSet.size > 0;

  const identityFieldCount = countCompletenessValues([
    safeRecord?.cas || canonicalSource?.cas,
    safeRecord?.inci || canonicalSource?.inci,
    safeRecord?.rep || canonicalSource?.rep,
    safeRecord?.type || canonicalSource?.type,
  ]);
  const hasStrongLocalIdentity =
    hasCompletenessValue(name) &&
    hasCompletenessValue(safeRecord?.type || canonicalSource?.type) &&
    identityFieldCount >= 2;
  const identityStatusBase = canonicalMaterialKey
    ? "confirmed"
    : hasStrongLocalIdentity
    ? isLocalDraft
      ? "inferred"
      : "confirmed"
    : resolvedIdentity || normalizationEntry || identityFieldCount > 0
    ? "inferred"
    : "missing";
  const identityStatus = hasIdentityConflict
    ? identityStatusBase === "missing"
      ? "missing"
      : "uncertain"
    : identityStatusBase;

  const regulatoryFieldCount = countCompletenessValues([
    safeRecord?.cas || canonicalSource?.cas,
    safeRecord?.inci || canonicalSource?.inci,
  ]);
  const regulatoryStatusBase =
    regulatoryFieldCount >= 2
      ? "confirmed"
      : regulatoryFieldCount === 1
      ? "inferred"
      : identityStatus === "missing"
      ? "missing"
      : "uncertain";
  const regulatoryStatus =
    hasRegulatoryConflict
      ? regulatoryStatusBase === "missing"
        ? "missing"
        : "uncertain"
      : isLocalDraft &&
        !canonicalMaterialKey &&
        regulatoryStatusBase === "confirmed"
      ? "inferred"
      : regulatoryStatusBase;

  const descriptiveFieldCount = countCompletenessValues([
    safeRecord?.note || canonicalSource?.note,
    safeRecord?.type || canonicalSource?.type,
    safeRecord?.scentClass || canonicalSource?.scentClass,
    safeRecord?.scentSummary ||
      safeRecord?.scentDesc ||
      safeRecord?.char ||
      canonicalSource?.scentSummary ||
      canonicalSource?.scentDesc,
    safeRecord?.descriptorTags || canonicalSource?.descriptorTags,
    safeRecord?.dilutionFactor,
  ]);
  const descriptiveStatus =
    descriptiveFieldCount >= 4
      ? "confirmed"
      : descriptiveFieldCount >= 2
      ? "inferred"
      : descriptiveFieldCount >= 1
      ? "uncertain"
      : "missing";

  const supplierStatus =
    supplierProducts.length > 0 ||
    (hasManualSupplierEdit &&
      !hasSupplierConflict &&
      (livePricingEntries.length > 0 || hasCompletenessValue(safeRecord?.supplier)))
      ? "confirmed"
      : hasCompletenessValue(safeRecord?.supplier) ||
        normalizationEntry?.entryKind === "supplier_product" ||
        normalizationEntry?.entryKind === "diluted_stock" ||
        canonicalMaterialKey
      ? "inferred"
      : "uncertain";

  const pricingStatus =
    livePricingSupplierCount > 0
      ? "confirmed"
      : livePricingEntries.length > 0
      ? "uncertain"
      : supplierProducts.length > 0
      ? "inferred"
      : "missing";

  const technicalFieldCount = countCompletenessValues([
    safeRecord?.MW,
    safeRecord?.xLogP,
    safeRecord?.VP,
    safeRecord?.ODT,
    safeRecord?.TPSA,
    safeRecord?.odorThreshold_ngL,
  ]);
  const technicalStatusBase =
    technicalFieldCount >= 4
      ? "confirmed"
      : technicalFieldCount >= 2
      ? "inferred"
      : technicalFieldCount >= 1
      ? "uncertain"
      : "uncertain";
  const technicalStatus = hasTechnicalConflict
    ? technicalStatusBase === "missing"
      ? "missing"
      : "uncertain"
    : technicalStatusBase;

  const hasSupplierIfraSupport =
    livePricingEntries.some(
      ([, supplierData]) =>
        supplierData?.ifraPercent != null &&
        String(supplierData.ifraPercent).trim() !== ""
    ) ||
    supplierProducts.some(
      (record) =>
        record?.ifraPercentShown != null &&
        String(record.ifraPercentShown).trim() !== ""
    );
  const hasSdsSupport =
    livePricingEntries.some(
      ([, supplierData]) =>
        Boolean(supplierData?.sdsUrl || supplierData?.manualSdsAttachment)
    ) ||
    supplierProducts.some((record) =>
      Boolean(record?.sdsUrl || record?.manualSdsAttachment)
    );
  const hasSupplierNoRestrictionSupport =
    livePricingEntries.some(
      ([, supplierData]) =>
        supplierData?.ifraRestrictionState === "no_restriction"
    ) ||
    supplierProducts.some(
      (record) => record?.ifraRestrictionState === "no_restriction"
    );

  const ifraStatus =
    hasIfraConflict
      ? "uncertain"
      : ifraUiState === "listed" && ifraMaterial
      ? resolvedIdentity?.inheritedViaCanonicalMaterialKey
        ? "inferred"
        : "confirmed"
      : hasSupplierNoRestrictionSupport && !hasIfraConflict
      ? "confirmed"
      : hasSupplierIfraSupport && !hasIfraConflict
      ? "confirmed"
      : ifraUiState === "functional_solvent"
      ? "confirmed"
      : ifraUiState === "not_found_in_uploaded_pdf"
      ? "uncertain"
      : canonicalMaterialKey || resolvedIdentity || hasStrongLocalIdentity
      ? "uncertain"
      : "missing";

  const hasStrongManualIdentitySupport =
    hasManualIdentityEdit &&
    !hasIdentityConflict &&
    identityStatus === "confirmed";
  const hasStrongManualSupplierSupport =
    hasManualSupplierEdit &&
    !hasSupplierConflict &&
    (supplierStatus === "confirmed" || pricingStatus === "confirmed");
  const hasStrongManualTechnicalSupport =
    hasManualTechnicalEdit &&
    !hasTechnicalConflict &&
    technicalStatus === "confirmed";
  const hasStrongManualIfraSupport =
    hasManualSupplierEdit && !hasIfraConflict && ifraStatus === "confirmed";
  const hasAnyStrongManualSupport =
    hasStrongManualIdentitySupport ||
    hasStrongManualSupplierSupport ||
    hasStrongManualTechnicalSupport ||
    hasStrongManualIfraSupport;

  const evidenceStatus =
    sourceDocuments.length > 0
      ? "confirmed"
      : evidenceCandidates.length > 0
      ? "inferred"
      : hasAnyStrongManualSupport || hasSdsSupport
      ? "inferred"
      : "uncertain";

  const dimensions = [
    { key: "identity", label: "Canonical Identity", status: identityStatus },
    { key: "regulatory", label: "CAS / INCI", status: regulatoryStatus },
    { key: "descriptive", label: "Scent / Note", status: descriptiveStatus },
    { key: "supplier", label: "Supplier Variants", status: supplierStatus },
    { key: "pricing", label: "Live Pricing", status: pricingStatus },
    { key: "technical", label: "Technical Signals", status: technicalStatus },
    { key: "ifra", label: "IFRA Support", status: ifraStatus },
    { key: "evidence", label: "Evidence Support", status: evidenceStatus },
  ];
  const identityTypeValue = safeRecord?.type || canonicalSource?.type || null;
  const identityRepValue = safeRecord?.rep || canonicalSource?.rep || null;
  const regulatoryCasValue = safeRecord?.cas || canonicalSource?.cas || null;
  const regulatoryInciValue = safeRecord?.inci || canonicalSource?.inci || null;
  const descriptiveSummaryValue =
    safeRecord?.scentSummary ||
    safeRecord?.scentDesc ||
    safeRecord?.char ||
    canonicalSource?.scentSummary ||
    canonicalSource?.scentDesc ||
    null;
  const descriptiveNoteValue = safeRecord?.note || canonicalSource?.note || null;
  const descriptiveTypeValue = safeRecord?.type || canonicalSource?.type || null;
  const technicalFieldMeta = [
    { key: "MW", label: "MW", value: safeRecord?.MW },
    { key: "xLogP", label: "xLogP", value: safeRecord?.xLogP },
    {
      key: "VP",
      label: "vapor pressure",
      value:
        safeRecord?.vaporPressureRaw ||
        safeRecord?.VP ||
        safeRecord?.vaporPressureObservations,
    },
    { key: "ODT", label: "odor threshold", value: safeRecord?.ODT },
    { key: "TPSA", label: "TPSA", value: safeRecord?.TPSA },
    {
      key: "odorThreshold_ngL",
      label: "odor-threshold support",
      value: safeRecord?.odorThreshold_ngL,
    },
  ];
  const missingTechnicalLabels = technicalFieldMeta
    .filter((field) => !hasCompletenessValue(field.value))
    .map((field) => field.label);
  const counts = dimensions.reduce(
    (acc, dimension) => {
      acc.totalConsideredCount += 1;
      acc[`${dimension.status}Count`] += 1;
      return acc;
    },
    {
      totalConsideredCount: 0,
      confirmedCount: 0,
      inferredCount: 0,
      uncertainCount: 0,
      missingCount: 0,
    }
  );
  const summary = buildIngredientTruthLevel(counts);
  const missingSignals = [];
  const uncertainSignals = [];
  const manualTrustedSignals = [];
  const addSignal = (target, message) => {
    if (!message || target.includes(message)) return;
    target.push(message);
  };
  const addManualTrustedSignal = (message) => {
    if (!message || manualTrustedSignals.includes(message)) return;
    manualTrustedSignals.push(message);
  };

  if (identityStatus === "missing") {
    addSignal(
      missingSignals,
      "Canonical or source-backed identity is still too weak for strong downstream reads."
    );
  } else if (isLocalDraft && !canonicalMaterialKey) {
    addSignal(
      uncertainSignals,
      "This is a browser-local manual draft ingredient, so it is usable locally but not yet canonical or source-reviewed."
    );
  }
  if (hasManualIdentityEdit) {
    if (hasIdentityConflict || hasRegulatoryConflict) {
      addSignal(
        uncertainSignals,
        "Manual CAS / identity edits are present, but an explicit active conflict is still attached to identity support."
      );
    } else if (hasStrongManualIdentitySupport) {
      addManualTrustedSignal(
        "CAS / identity fields were manually verified and are being treated as strong practical support."
      );
    }
  }
  if (pricingStatus === "missing") {
    addSignal(
      missingSignals,
      "No live supplier pricing or registry-backed supplier variant is attached yet."
    );
  } else if (pricingStatus === "inferred") {
    addSignal(
      uncertainSignals,
      "Supplier variants exist, but live-priced size options are still missing."
    );
  } else if (pricingStatus === "uncertain") {
    addSignal(
      uncertainSignals,
      "Pricing rows exist, but usable pack-size or price support is still incomplete."
    );
  }
  if (hasManualSupplierEdit) {
    if (hasSupplierConflict || hasIfraConflict) {
      addSignal(
        uncertainSignals,
        "Manual supplier-page edits are present, but an explicit supplier or restriction conflict is still active."
      );
    } else if (hasStrongManualSupplierSupport || hasStrongManualIfraSupport) {
      addManualTrustedSignal(
        "Supplier-page facts were manually verified and are being treated as strong manual support."
      );
    }
  }
  if (regulatoryStatus !== "confirmed") {
    addSignal(
      uncertainSignals,
      "CAS / INCI support is still partial in the current catalog and canonical records."
    );
  }
  if (descriptiveStatus === "missing") {
    addSignal(
      missingSignals,
      "No useful scent, note-role, or material-type description is attached yet."
    );
  } else if (descriptiveStatus === "uncertain") {
    addSignal(
      uncertainSignals,
      "Scent and note-role description is still light for this material."
    );
  }
  if (supplierStatus === "uncertain") {
    addSignal(
      uncertainSignals,
      "Supplier-variant registry coverage is still light for this material."
    );
  }
  if (technicalFieldCount < 4) {
    addSignal(
      uncertainSignals,
      technicalFieldCount > 0
        ? "Technical behavior support is partial (MW / xLogP / VP / ODT / TPSA)."
        : "Technical behavior support is still sparse (MW / xLogP / VP / ODT / TPSA)."
    );
  }
  if (hasManualTechnicalEdit) {
    if (hasTechnicalConflict) {
      addSignal(
        uncertainSignals,
        "Technical / molecular manual edits are present, but an explicit active conflict is still attached to those fields."
      );
    } else if (hasStrongManualTechnicalSupport) {
      addManualTrustedSignal(
        "Technical / molecular fields were manually verified and are being treated as strong practical support."
      );
    }
  }
  if (ifraStatus !== "confirmed") {
    addSignal(
      uncertainSignals,
      "Structured IFRA restriction support is still partial in the current helper path."
    );
  }
  if (evidenceStatus !== "confirmed" && !hasAnyStrongManualSupport) {
    addSignal(
      uncertainSignals,
      "Source-document and evidence-candidate support is still light for this material."
    );
  } else if (
    evidenceStatus !== "confirmed" &&
    hasAnyStrongManualSupport &&
    !sourceDocuments.length &&
    !evidenceCandidates.length
  ) {
    addManualTrustedSignal(
      "Formal evidence review is not attached yet, but manually verified trusted edits are carrying strong practical support."
    );
  }
  const buildDimensionDetail = (key) => {
    const detailLines = [];
    const improveLines = [];
    let summary = "";

    if (key === "identity") {
      if (identityStatus === "confirmed") {
        summary = canonicalMaterialKey
          ? "Canonical identity is resolved for this record."
          : "Current name, type, and identity support are coherent enough to use confidently.";
      } else if (identityStatus === "inferred") {
        summary =
          "Identity is usable, but the canonical mapping or core identity shape is still incomplete.";
      } else if (identityStatus === "uncertain") {
        summary =
          "Identity is present, but an active conflict or unresolved mapping still makes it cautionary.";
      } else {
        summary =
          "Core identity is still too weak to trust without more confirmation.";
      }
      if (!canonicalMaterialKey && !resolvedIdentity) {
        detailLines.push("Canonical material mapping is still unresolved.");
      }
      if (!hasCompletenessValue(identityTypeValue)) {
        detailLines.push("Material type is still missing.");
      }
      if (!hasCompletenessValue(identityRepValue)) {
        detailLines.push("Representative odorant / identity hint is still missing.");
      }
      if (hasIdentityConflict) {
        detailLines.push(
          "A saved identity field currently conflicts with another active value."
        );
      }
      improveLines.push(
        "Confirm the material type and identity mapping so the visible record lines up with the intended ingredient."
      );
    } else if (key === "regulatory") {
      if (regulatoryStatus === "confirmed") {
        summary =
          "CAS and INCI both have usable support in the current record.";
      } else if (regulatoryStatus === "inferred") {
        summary =
          "Only part of the CAS / INCI identity support is filled in right now.";
      } else if (regulatoryStatus === "uncertain") {
        summary =
          "CAS / INCI support is present, but at least one of those fields is weak or conflict-aware.";
      } else {
        summary = "CAS and INCI are still missing.";
      }
      if (!hasCompletenessValue(regulatoryCasValue)) {
        detailLines.push("CAS is missing.");
      }
      if (!hasCompletenessValue(regulatoryInciValue)) {
        detailLines.push("INCI is missing.");
      }
      if (hasRegulatoryConflict) {
        detailLines.push(
          "CAS or INCI currently conflicts with another active value."
        );
      }
      improveLines.push(
        "Confirm or correct CAS and INCI from supplier data so identity-sensitive reads stop leaning on partial support."
      );
    } else if (key === "descriptive") {
      if (descriptiveStatus === "confirmed") {
        summary =
          "The scent, note-role, and descriptive profile are filled in well enough to read cleanly.";
      } else if (descriptiveStatus === "inferred") {
        summary =
          "Descriptive context is usable, but it still needs fuller scent/profile support.";
      } else if (descriptiveStatus === "uncertain") {
        summary =
          "Only a light descriptive profile is attached right now.";
      } else {
        summary =
          "No useful scent or note-role description is attached yet.";
      }
      if (!hasCompletenessValue(descriptiveNoteValue)) {
        detailLines.push("Note role is missing.");
      }
      if (!hasCompletenessValue(descriptiveTypeValue)) {
        detailLines.push("Material type is missing from the descriptive profile.");
      }
      if (!hasCompletenessValue(descriptiveSummaryValue)) {
        detailLines.push("Main scent summary / description is still missing.");
      }
      if (!hasCompletenessValue(safeRecord?.descriptorTags || canonicalSource?.descriptorTags)) {
        detailLines.push("Descriptor tags are still light or missing.");
      }
      improveLines.push(
        "Add a clearer scent summary, note role, material type, and descriptor tags so recommendation and profile reads stay grounded."
      );
    } else if (key === "supplier") {
      if (supplierStatus === "confirmed") {
        summary = "Supplier ownership and product-row coverage look solid.";
      } else if (supplierStatus === "inferred") {
        summary =
          "Supplier links exist, but the current record still leans on partial supplier coverage.";
      } else {
        summary =
          "Supplier coverage is still light enough that sourcing reads stay cautious.";
      }
      if (!supplierProducts.length && !hasCompletenessValue(safeRecord?.supplier)) {
        detailLines.push("No supplier product rows are attached yet.");
      }
      if (supplierProducts.length > 0 && catalogSupplierCount < 2) {
        detailLines.push("Supplier coverage is still narrow.");
      }
      if (hasSupplierConflict) {
        detailLines.push(
          "At least one supplier-linked field is still conflict-aware."
        );
      }
      improveLines.push(
        "Attach or refresh supplier rows so the record has clearer supplier ownership and coverage."
      );
    } else if (key === "pricing") {
      if (pricingStatus === "confirmed") {
        summary = "Live pack-size pricing is attached and usable.";
      } else if (pricingStatus === "inferred") {
        summary =
          "Supplier rows exist, but priced size support is still incomplete.";
      } else if (pricingStatus === "uncertain") {
        summary =
          "Pricing exists, but usable price or pack-size detail is still partial.";
      } else {
        summary = "No live priced pack sizes are attached yet.";
      }
      if (!livePricingEntries.length) {
        detailLines.push("No live supplier price rows are attached.");
      } else if (!livePricingSupplierCount) {
        detailLines.push("Supplier rows exist, but no usable pack-size pricing was resolved.");
      }
      improveLines.push(
        "Add or refresh supplier pack sizes and prices so costing and sourcing reads stay current."
      );
    } else if (key === "technical") {
      if (technicalStatus === "confirmed") {
        summary =
          "Technical behavior support is strong across the main modeled fields.";
      } else if (technicalStatus === "inferred") {
        summary =
          "Some technical behavior fields are present, but the model is still missing pieces.";
      } else {
        summary =
          "Technical behavior support is sparse or conflict-aware right now.";
      }
      if (missingTechnicalLabels.length) {
        detailLines.push(
          `Missing technical fields: ${missingTechnicalLabels.join(", ")}.`
        );
      }
      if (hasTechnicalConflict) {
        detailLines.push(
          "A technical / molecular field currently conflicts with another active value."
        );
      }
      if (hasManualTechnicalEdit && !hasTechnicalConflict) {
        detailLines.push(
          "Current technical support is being carried partly by manual trusted edits."
        );
      }
      improveLines.push(
        "Add MW, xLogP, vapor pressure, odor threshold, or TPSA where known so performance-model reads get stronger."
      );
    } else if (key === "ifra") {
      if (ifraStatus === "confirmed") {
        summary = hasSupplierNoRestrictionSupport
          ? "Current compliance support explicitly says no restriction."
          : "Structured IFRA support is present and usable.";
      } else {
        summary =
          "Restriction support is still partial, weak, or conflict-aware.";
      }
      if (!hasSupplierIfraSupport && !hasSupplierNoRestrictionSupport && ifraUiState !== "listed") {
        detailLines.push(
          "No supplier or helper IFRA support is attached yet."
        );
      }
      if (hasSupplierNoRestrictionSupport) {
        detailLines.push(
          "At least one supplier record explicitly states no restrictions."
        );
      }
      if (hasIfraConflict) {
        detailLines.push(
          "IFRA / restriction support currently conflicts with another saved value."
        );
      }
      improveLines.push(
        "Refresh supplier compliance fields or save the verified restriction state so compliance reads do not stay partial."
      );
    } else if (key === "evidence") {
      if (evidenceStatus === "confirmed") {
        summary = "Formal evidence-review support is attached.";
      } else if (evidenceStatus === "inferred") {
        summary =
          "Practical support exists, but the audit trail is still lighter than a fully documented record.";
      } else {
        summary =
          "Formal evidence-review support is still light or missing.";
      }
      if (!sourceDocuments.length) {
        detailLines.push("No source documents are attached.");
      }
      if (!evidenceCandidates.length) {
        detailLines.push("No staged evidence-review items are attached.");
      }
      if (hasAnyStrongManualSupport && !hasActiveManualConflict) {
        detailLines.push(
          "Manual trusted support is carrying practical confidence even without a heavier evidence trail."
        );
      } else if (supplierProducts.length > 0 && !hasSdsSupport) {
        detailLines.push(
          "Supplier rows exist, but SDS/source-document support is still incomplete."
        );
      }
      improveLines.push(
        "Attach SDS or source documents, or stage real conflicts into evidence review when you want a stronger audit trail."
      );
    }

    return {
      summary,
      detailLines,
      improveLines,
    };
  };
  const dimensionDetailByKey = Object.fromEntries(
    dimensions.map((dimension) => [
      dimension.key,
      buildDimensionDetail(dimension.key),
    ])
  );

  return {
    name,
    isLocalDraft,
    canonicalMaterialKey,
    canonicalCatalogName,
    normalizationEntry,
    resolvedIdentity,
    canonicalSource,
    sourceDocuments,
    evidenceCandidates,
    catalogSupplierProducts,
    canonicalSupplierProducts,
    supplierProducts,
    supplierVariantCount: supplierProducts.length,
    catalogSupplierCount,
    livePricingEntries,
    livePricingSupplierCount,
    livePricingPackCount,
    technicalFieldCount,
    technicalFieldTotal: 6,
    conflictFieldKeys: Array.from(conflictFieldSet),
    hasActiveManualConflict,
    hasStrongManualIdentitySupport,
    hasStrongManualSupplierSupport,
    hasStrongManualTechnicalSupport,
    hasStrongManualIfraSupport,
    hasAnyStrongManualSupport,
    hasSupplierIfraSupport,
    hasSdsSupport,
    manualTrustedSignals,
    dimensions,
    dimensionByKey: Object.fromEntries(
      dimensions.map((dimension) => [dimension.key, dimension])
    ),
    dimensionDetailByKey,
    missingSignals,
    uncertainSignals,
    primaryGap: missingSignals[0] || uncertainSignals[0] || null,
    ...summary,
  };
}

export function buildFinishedProductIfraGuidance({
  items = [],
  category = "cat4",
  fragranceLoadPercent = 17.5,
  warningThreshold = 0.8,
} = {}) {
  const categoryKey = IFRA_CATEGORY_LABELS[category] ? category : "cat4";
  const categoryLabel = IFRA_CATEGORY_LABELS[categoryKey];
  const safeFragranceLoadPercent = Math.max(
    0,
    Number(fragranceLoadPercent) || 0
  );
  const totalG =
    items.reduce((sum, item) => sum + (Number(item?.g) || 0), 0) || 1;

  const rows = items
    .map((item) => {
      const grams = Number(item?.g) || 0;
      if (!item?.name || grams <= 0) return null;

      const resolvedIdentity = resolveIngredientIdentity(item.name);
      const material = getIfraMaterialRecord(item.name);
      const uiState = getIfraUiState(item.name);
      const concentratePercent = (grams / totalG) * 100;
      const finishedProductPercent =
        concentratePercent * (safeFragranceLoadPercent / 100);
      const activeRestrictedPercent =
        computeActiveRestrictedPercent({
          formulaPercent: finishedProductPercent,
          ingredientName: item.name,
          activePercentOverride: item?.effectiveActivePercent ?? null,
        }) ?? finishedProductPercent;
      const activeRestrictedPercentInConcentrate =
        computeActiveRestrictedPercent({
          formulaPercent: concentratePercent,
          ingredientName: item.name,
          activePercentOverride: item?.effectiveActivePercent ?? null,
        }) ?? concentratePercent;
      const limit = material?.limits?.[categoryKey] ?? null;

      let dataState = "confirmed";
      let status = "ok";
      let missingReason = null;

      if (uiState === "functional_solvent") {
        dataState = "not_applicable";
        status = "ignored";
      } else if (!resolvedIdentity) {
        dataState = "missing";
        status = "blocked";
        missingReason = "No canonical IFRA identity could be resolved.";
      } else if (!material || material.status !== "active") {
        dataState = "missing";
        status = "blocked";
        missingReason =
          uiState === "not_found_in_uploaded_pdf"
            ? "Resolved material is not active in the current uploaded IFRA dataset."
            : "No active IFRA material record could be resolved.";
      } else if (limit == null) {
        dataState = "missing";
        status = "blocked";
        missingReason =
          material?.missingLimitReason ||
          `${categoryLabel} limit is missing for this material in the current IFRA dataset.`;
      } else {
        dataState = resolvedIdentity.inheritedViaCanonicalMaterialKey
          ? "inferred"
          : "confirmed";
        if (activeRestrictedPercent > limit) status = "offender";
        else if (activeRestrictedPercent > limit * warningThreshold)
          status = "warning";
      }

      const usageRatio =
        limit != null && limit > 0 ? activeRestrictedPercent / limit : null;
      const headroomPercent =
        limit != null ? limit - activeRestrictedPercent : null;
      const maxFinishedProductLoadPercent =
        activeRestrictedPercentInConcentrate > 0 && limit != null
          ? (limit / activeRestrictedPercentInConcentrate) * 100
          : null;
      const suggestedIngredientReductionPercent =
        limit != null && activeRestrictedPercent > 0
          ? Math.max(0, (1 - limit / activeRestrictedPercent) * 100)
          : null;

      return {
        name: item.name,
        note: item.note || null,
        grams,
        concentratePercent,
        finishedProductPercent,
        activeRestrictedPercent,
        activeRestrictedPercentInConcentrate,
        usesActivePercent:
          Math.abs(activeRestrictedPercent - finishedProductPercent) > 0.0001,
        limit,
        status,
        dataState,
        missingReason,
        usageRatio,
        headroomPercent,
        maxFinishedProductLoadPercent,
        suggestedIngredientReductionPercent,
        resolvedIdentity,
        inheritedViaCanonicalMaterialKey:
          resolvedIdentity?.inheritedViaCanonicalMaterialKey || false,
        canonicalMaterialKey:
          resolvedIdentity?.normalizationEntry?.canonicalMaterialKey ||
          resolvedIdentity?.canonicalMaterialKey ||
          null,
        resolvedIfraMaterial: resolvedIdentity?.resolvedIfraMaterial || null,
        ifraUiState: uiState,
      };
    })
    .filter(Boolean);

  const applicableRows = rows.filter((row) => row.dataState !== "not_applicable");
  const checkedRows = applicableRows.filter((row) => row.dataState !== "missing");
  const confirmedRows = checkedRows.filter((row) => row.dataState === "confirmed");
  const inferredRows = checkedRows.filter((row) => row.dataState === "inferred");
  const missingRows = applicableRows.filter((row) => row.dataState === "missing");
  const offenderRows = checkedRows
    .filter((row) => row.status === "offender")
    .sort((a, b) => (b.usageRatio || 0) - (a.usageRatio || 0));
  const warningRows = checkedRows
    .filter((row) => row.status === "warning")
    .sort((a, b) => (b.usageRatio || 0) - (a.usageRatio || 0));
  const limitingRows = checkedRows
    .filter(
      (row) =>
        row.maxFinishedProductLoadPercent != null &&
        Number.isFinite(row.maxFinishedProductLoadPercent)
    )
    .sort(
      (a, b) =>
        (a.maxFinishedProductLoadPercent || Number.POSITIVE_INFINITY) -
        (b.maxFinishedProductLoadPercent || Number.POSITIVE_INFINITY)
    )
    .slice(0, 5);

  const overallStatus = offenderRows.length
    ? missingRows.length
      ? "offender_with_missing"
      : "offender"
    : warningRows.length
    ? missingRows.length
      ? "warning_with_missing"
      : "warning"
    : missingRows.length
    ? checkedRows.length
      ? "appears_compliant_with_missing"
      : "blocked_missing"
    : checkedRows.length
    ? "appears_compliant"
    : "no_restricted_rows";

  const summary =
    overallStatus === "offender" || overallStatus === "offender_with_missing"
      ? `Appears non-compliant for ${categoryLabel} at ${safeFragranceLoadPercent.toFixed(
          1
        )}% fragrance load based on the restricted rows the helper can currently evaluate.`
      : overallStatus === "warning" || overallStatus === "warning_with_missing"
      ? `Appears within ${categoryLabel} limits at ${safeFragranceLoadPercent.toFixed(
          1
        )}% fragrance load, but one or more restricted rows have narrow headroom.`
      : overallStatus === "appears_compliant_with_missing"
      ? `No checked restricted row exceeds ${categoryLabel} at ${safeFragranceLoadPercent.toFixed(
          1
        )}% fragrance load, but missing IFRA coverage still blocks a confident finished-product conclusion.`
      : overallStatus === "blocked_missing"
      ? `Finished-product guidance is limited because the current IFRA helper coverage cannot evaluate any restricted rows for ${categoryLabel}.`
      : overallStatus === "no_restricted_rows"
      ? `No restricted rows were triggered for ${categoryLabel} at ${safeFragranceLoadPercent.toFixed(
          1
        )}% fragrance load, but this should not be treated as a blanket safety guarantee.`
      : `Appears compliant for ${categoryLabel} at ${safeFragranceLoadPercent.toFixed(
          1
        )}% fragrance load based on the restricted rows the helper can currently evaluate.`;

  return {
    category: categoryKey,
    categoryLabel,
    fragranceLoadPercent: safeFragranceLoadPercent,
    warningThreshold,
    overallStatus,
    summary,
    rows: applicableRows,
    checkedRows,
    confirmedRows,
    inferredRows,
    missingRows,
    offenderRows,
    warningRows,
    limitingRows,
    counts: {
      checked: checkedRows.length,
      confirmed: confirmedRows.length,
      inferred: inferredRows.length,
      missing: missingRows.length,
      offenders: offenderRows.length,
      warnings: warningRows.length,
    },
  };
}

function countIfraStatusRows(rows = [], status) {
  return (Array.isArray(rows) ? rows : []).filter((row) => row?.status === status);
}

function formatIfraStatusCount(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function buildFormulaIfraStatus({
  items = [],
  db = {},
  coverageAudit = null,
  finishedProductGuidance = null,
  concentrateRows = [],
  category = "cat4",
  fragranceLoadPercent = 17.5,
} = {}) {
  const safeItems = Array.isArray(items) ? items : [];
  const categoryKey = IFRA_CATEGORY_LABELS[category] ? category : "cat4";
  const categoryLabel = IFRA_CATEGORY_LABELS[categoryKey];
  const safeCoverageAudit =
    coverageAudit || auditFormulaIfraCoverage(safeItems, { db });
  const safeFinishedProductGuidance =
    finishedProductGuidance ||
    buildFinishedProductIfraGuidance({
      items: safeItems,
      category: categoryKey,
      fragranceLoadPercent,
    });
  const safeConcentrateRows = Array.isArray(concentrateRows)
    ? concentrateRows
    : [];
  const coverageCounts = safeCoverageAudit?.counts || {};
  const finishedCounts = safeFinishedProductGuidance?.counts || {};
  const finishedProductOffenderRows =
    safeFinishedProductGuidance?.offenderRows || [];
  const finishedProductWarningRows =
    safeFinishedProductGuidance?.warningRows || [];
  const finishedProductMissingRows =
    safeFinishedProductGuidance?.missingRows || [];
  const concentrateHelperFlagRows = countIfraStatusRows(
    safeConcentrateRows,
    "fail"
  );
  const concentrateHelperWarningRows = countIfraStatusRows(
    safeConcentrateRows,
    "warn"
  );
  const exactMatchCount = Number(coverageCounts.exactIfraMatch) || 0;
  const aliasMatchCount = Number(coverageCounts.aliasIfraMatch) || 0;
  const missingAliasCount = Number(coverageCounts.missingAlias) || 0;
  const sourceUnavailableCount = Number(coverageCounts.sourceUnavailable) || 0;
  const supplierSdsNeededCount = Number(coverageCounts.supplierSdsNeeded) || 0;
  const accordLevelCount = Number(coverageCounts.accordLevelOnly) || 0;
  const fcfSpecialCaseCount = Number(coverageCounts.fcfSpecialCase) || 0;
  const noKnownStructuredStandardCount =
    Number(
      coverageCounts.noKnownRestriction ??
        coverageCounts.intentionallyNotMatchedNoStandard
    ) || 0;
  const knownRestrictedRowCount = Number(coverageCounts.knownRestrictionRows) || 0;
  const structuredCoverageGapCount =
    missingAliasCount +
    sourceUnavailableCount +
    supplierSdsNeededCount +
    accordLevelCount +
    fcfSpecialCaseCount;
  const dataReviewCount =
    structuredCoverageGapCount + noKnownStructuredStandardCount;
  const finishedProductOffenderCount = finishedProductOffenderRows.length;
  const finishedProductWarningCount = finishedProductWarningRows.length;
  const concentrateHelperFlagCount = concentrateHelperFlagRows.length;
  const concentrateHelperWarningCount = concentrateHelperWarningRows.length;
  const checkedRowCount = Number(finishedCounts.checked) || 0;

  let severity = "unknown";
  let statusLabel = "IFRA status unavailable";
  let primaryMessage =
    "No normalized IFRA status is available for the current formula context.";

  if (finishedProductOffenderCount > 0) {
    severity = "estimated_offender";
    statusLabel = `${formatIfraStatusCount(
      finishedProductOffenderCount,
      "modeled finished-product offender"
    )}`;
    primaryMessage = `${formatIfraStatusCount(
      finishedProductOffenderCount,
      "checked restricted row"
    )} exceed the modeled ${categoryLabel} finished-product limit at ${(
      Number(fragranceLoadPercent) || 0
    ).toFixed(1)}% fragrance load.`;
  } else if (dataReviewCount > 0) {
    severity = "data_gap";
    statusLabel = "Needs IFRA data review";
    primaryMessage =
      checkedRowCount > 0
        ? "No modeled finished-product offenders in checked rows, but structured IFRA coverage is incomplete."
        : "Structured IFRA coverage is incomplete, so the helper cannot make a finished-product conclusion.";
  } else if (finishedProductWarningCount > 0) {
    severity = "watch";
    statusLabel = "Tight finished-product headroom";
    primaryMessage = `${formatIfraStatusCount(
      finishedProductWarningCount,
      "checked restricted row"
    )} are close to the modeled ${categoryLabel} finished-product limit.`;
  } else if (
    concentrateHelperFlagCount > 0 ||
    concentrateHelperWarningCount > 0
  ) {
    severity = "helper_review";
    statusLabel = "Concentrate/helper flags need review";
    primaryMessage =
      "No modeled finished-product offenders in checked rows; concentrate/helper threshold flags should be reviewed separately.";
  } else if (checkedRowCount > 0) {
    severity = "clear_checked";
    statusLabel = "No modeled finished-product offenders";
    primaryMessage =
      "No modeled finished-product offenders in checked rows for the current use context.";
  } else {
    severity = "no_checked_rows";
    statusLabel = "No checked restricted rows";
    primaryMessage =
      "No checked restricted rows were available; do not treat this as a blanket safe finding.";
  }

  const caveats = ["Not launch clearance."];
  if (finishedProductOffenderCount === 0 && checkedRowCount > 0) {
    caveats.push("No modeled finished-product offenders in checked rows.");
  }
  if (finishedProductWarningCount > 0) {
    caveats.push(
      `${formatIfraStatusCount(
        finishedProductWarningCount,
        "finished-product warning row"
      )} have narrow modeled headroom.`
    );
  }
  if (concentrateHelperFlagCount > 0) {
    caveats.push(
      `${formatIfraStatusCount(
        concentrateHelperFlagCount,
        "concentrate/helper threshold flag"
      )} need review; these are not finished-product violations.`
    );
  }
  if (concentrateHelperWarningCount > 0) {
    caveats.push(
      `${formatIfraStatusCount(
        concentrateHelperWarningCount,
        "concentrate/helper caution row"
      )} are close in the helper context; these are not finished-product violations.`
    );
  }
  if (missingAliasCount > 0 || sourceUnavailableCount > 0) {
    caveats.push(
      `${formatIfraStatusCount(
        missingAliasCount + sourceUnavailableCount,
        "structured IFRA coverage row"
      )} need alias/source review.`
    );
  }
  if (supplierSdsNeededCount > 0) {
    caveats.push(
      `${formatIfraStatusCount(
        supplierSdsNeededCount,
        "supplier IFRA/SDS row"
      )} need supplier documents before launch clearance.`
    );
  }
  if (fcfSpecialCaseCount > 0) {
    caveats.push(
      `${formatIfraStatusCount(
        fcfSpecialCaseCount,
        "FCF/furocoumarin-free citrus row"
      )} are tracked separately from regular expressed citrus limits.`
    );
  }
  if (accordLevelCount > 0) {
    caveats.push(
      `${formatIfraStatusCount(
        accordLevelCount,
        "accord-level row"
      )} remain accord-level in IFRA view. Component IFRA expansion is deferred to a dedicated task.`
    );
  }
  if (noKnownStructuredStandardCount > 0) {
    caveats.push(
      `${formatIfraStatusCount(
        noKnownStructuredStandardCount,
        "row"
      )} have no known structured standard in the current data; that is not a safe finding.`
    );
  }
  if (knownRestrictedRowCount > 0) {
    caveats.push(
      `${formatIfraStatusCount(
        knownRestrictedRowCount,
        "known restricted row"
      )} are present and should stay visible in review.`
    );
  }

  return {
    category: categoryKey,
    categoryLabel,
    fragranceLoadPercent: Math.max(0, Number(fragranceLoadPercent) || 0),
    severity,
    statusLabel,
    primaryMessage,
    hasLaunchClearance: false,
    launchClearanceLabel: "Not launch clearance",
    finishedProductOffenderCount,
    finishedProductWarningCount,
    finishedProductMissingCount: finishedProductMissingRows.length,
    concentrateHelperFlagCount,
    concentrateHelperWarningCount,
    knownRestrictedRowCount,
    checkedRowCount,
    exactMatchCount,
    aliasMatchCount,
    matchedStandardCount: exactMatchCount + aliasMatchCount,
    missingAliasCount,
    sourceUnavailableCount,
    supplierSdsNeededCount,
    accordLevelCount,
    fcfSpecialCaseCount,
    noKnownStructuredStandardCount,
    structuredCoverageGapCount,
    dataReviewCount,
    hasStructuredCoverageGaps: dataReviewCount > 0,
    hasFinishedProductOffenders: finishedProductOffenderCount > 0,
    offenderRows: finishedProductOffenderRows,
    warningRows: finishedProductWarningRows,
    missingRows: finishedProductMissingRows,
    concentrateHelperFlagRows,
    concentrateHelperWarningRows,
    coverageAudit: safeCoverageAudit,
    finishedProductGuidance: safeFinishedProductGuidance,
    caveats: Array.from(new Set(caveats)).slice(0, 8),
  };
}
