import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildOfficialIfraHarvestReport,
  cacheOfficialIfraIndexPages,
  officialCandidatesAsEvidenceCandidates,
  parseOfficialStandardsLibraryHtml,
  parseOfficialTransparencyListHtml,
} from "../scripts/lib/official_ifra_harvest.mjs";
import { buildIfraEvidenceResolution } from "../scripts/lib/ifra_evidence_resolver.mjs";

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function queueWithItems(items) {
  return {
    metadata: { generatedAt: "2026-06-11T00:00:00.000Z" },
    items,
  };
}

function queueItem(overrides = {}) {
  return {
    id: overrides.id || "hero-ifra-source-calone-global_ifra_standard_needed",
    materialName: overrides.materialName || "Calone 1951 20% TEC",
    normalizedName: overrides.normalizedName || "Calone 1951 20% TEC",
    sourceIdentityName: overrides.sourceIdentityName || "",
    activeMaterialName: overrides.activeMaterialName || "",
    formulasUsedIn: ["Synthetic Test"],
    priority: "high",
    requiredSourceType: overrides.requiredSourceType || "global_ifra_standard_needed",
    currentIfraCategory: "sourceUnavailable",
    candidateSearchTerms: overrides.candidateSearchTerms || [
      "Calone 1951",
      "Calone",
      "Watermelon ketone",
      "CAS 28940-11-6",
    ],
    sourceSearchTerms: overrides.sourceSearchTerms || [],
    knownReferenceLinks: [],
    status: "needed",
    reviewStatus: "not_started",
  };
}

test("Official IFRA Standards Library rows parse standard metadata and download links", () => {
  const html = `
    <table>
      <tr><th>Cas n°</th><th>Title</th><th>Type</th><th>Publication Date</th><th>Amendment</th><th>Status</th><th>Actions</th></tr>
      <tr>
        <td>28940-11-6</td>
        <td>"Calone"</td>
        <td>R</td>
        <td>2024-01</td>
        <td>51</td>
        <td>active</td>
        <td><a href="/download/calone.pdf">Download</a></td>
      </tr>
    </table>
  `;

  const rows = parseOfficialStandardsLibraryHtml(html, {
    sourceUrl: "https://ifrafragrance.org/standards-library",
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].standardTitle, "Calone");
  assert.deepEqual(rows[0].cas, ["28940-11-6"]);
  assert.equal(rows[0].standardType, "Restriction");
  assert.equal(rows[0].amendment, "51");
  assert.equal(rows[0].downloadUrl, "https://ifrafragrance.org/download/calone.pdf");
});

test("Official IFRA Standards Library data-layer links parse standard metadata and download links", () => {
  const html = `
    <a
      class="js-data-layer"
      href="https://d3t14p1xronwr0.cloudfront.net/docs/standards/IFRA_STD_002.pdf"
      data-layer="{&quot;event&quot;:&quot;download&quot;,&quot;document_name&quot;:&quot;\\&quot;Acetylated Vetiver oil\\&quot;&quot;,&quot;document_type&quot;:&quot;standards&quot;,&quot;cas_number&quot;:&quot;84082-84-8 68917-34-0&quot;,&quot;publication_date&quot;:&quot;2020-01&quot;,&quot;type&quot;:&quot;R&quot;,&quot;amendment&quot;:&quot;49&quot;}">
      Download
    </a>
  `;

  const rows = parseOfficialStandardsLibraryHtml(html, {
    sourceUrl: "https://ifrafragrance.org/standards-library",
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].standardTitle, "Acetylated Vetiver oil");
  assert.deepEqual(rows[0].cas, ["84082-84-8", "68917-34-0"]);
  assert.equal(rows[0].standardType, "Restriction");
  assert.equal(rows[0].amendment, "49");
  assert.equal(
    rows[0].downloadUrl,
    "https://d3t14p1xronwr0.cloudfront.net/docs/standards/IFRA_STD_002.pdf"
  );
});

test("Official IFRA Transparency List rows parse as identity support only", () => {
  const html = `
    <table>
      <tr><th>CAS n°</th><th>Principal name</th><th>Naturals (ncs) category</th></tr>
      <tr><td>28940-11-6</td><td>Calone</td><td></td></tr>
    </table>
  `;

  const rows = parseOfficialTransparencyListHtml(html);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].principalName, "Calone");
  assert.deepEqual(rows[0].cas, ["28940-11-6"]);
});

test("Official harvest matches exact CAS, rejects weak substring, and normalizes diluted stocks", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "official-ifra-harvest-"));
  const masterPath = path.join(tempDir, "ifra_master_standards.json");
  writeJson(masterPath, {
    metadata: {},
    standards: [
      {
        canonical_name: "Calone",
        cas_numbers: ["28940-11-6"],
        standard_type: "RESTRICTION",
        amendment: 51,
        publication_year: 2024,
        status: "active",
        category_limits: {
          cat4: { kind: "no_restriction" },
        },
      },
      {
        canonical_name: "Calone adjacent material",
        cas_numbers: ["11111-11-1"],
        standard_type: "RESTRICTION",
        amendment: 51,
        publication_year: 2024,
      },
    ],
  });

  const report = buildOfficialIfraHarvestReport({
    sourceQueue: queueWithItems([queueItem()]),
    masterStandardsPath: masterPath,
    cacheDir: path.join(tempDir, "cache"),
    generatedAt: "2026-06-11T00:00:00.000Z",
  });

  assert.equal(report.summary.officialStandardCandidateCount, 1);
  assert.equal(report.candidates[0].materialName, "Calone 1951 20% TEC");
  assert.equal(report.candidates[0].sourceIdentityName, "Calone 1951");
  assert.equal(report.candidates[0].matchType, "cas");
  assert.equal(report.candidates[0].candidateUse, "standard_candidate");
  assert.equal(report.candidates[0].candidateValue, "No restriction");
  assert.equal(report.weakAmbiguousMatches.length, 0);
});

test("Transparency matches create identity support and never category-limit candidates", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "official-ifra-transparency-"));
  const masterPath = path.join(tempDir, "ifra_master_standards.json");
  const transparencyPath = path.join(tempDir, "official_ifra", "transparency", "transparency-list.html");
  writeJson(masterPath, { metadata: {}, standards: [] });
  fs.mkdirSync(path.dirname(transparencyPath), { recursive: true });
  fs.writeFileSync(
    transparencyPath,
    `<table><tr><th>CAS n°</th><th>Principal name</th></tr><tr><td>28940-11-6</td><td>Calone</td></tr></table>`
  );
  writeJson(`${transparencyPath}.metadata.json`, {
    sourceUrl: "https://ifrafragrance.org/transparency-list",
    sourceType: "official_ifra_transparency_list",
    localPath: transparencyPath,
  });

  const report = buildOfficialIfraHarvestReport({
    sourceQueue: queueWithItems([queueItem()]),
    masterStandardsPath: masterPath,
    cacheDir: path.join(tempDir, "official_ifra"),
  });

  assert.equal(report.summary.officialStandardCandidateCount, 0);
  assert.equal(report.summary.officialIdentitySupportCount, 1);
  assert.equal(report.candidates[0].candidateUse, "identity_support");
  assert.equal(report.candidates[0].candidateLimitType, "identity");
  assert.equal(report.candidates[0].candidateValue, "");
});

test("Weak substring matches are reported but not auto-linked as candidates", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "official-ifra-weak-"));
  const masterPath = path.join(tempDir, "ifra_master_standards.json");
  writeJson(masterPath, {
    metadata: {},
    standards: [
      {
        canonical_name: "Ambroxan analog unrelated",
        cas_numbers: ["11111-11-1"],
        standard_type: "RESTRICTION",
        amendment: 51,
      },
    ],
  });

  const report = buildOfficialIfraHarvestReport({
    sourceQueue: queueWithItems([
      queueItem({
        id: "ambroxan",
        materialName: "Ambroxan Crystals",
        candidateSearchTerms: ["Ambroxan", "CAS 6790-58-5"],
      }),
    ]),
    masterStandardsPath: masterPath,
    cacheDir: path.join(tempDir, "cache"),
  });

  assert.equal(report.summary.candidateCount, 0);
  assert.equal(report.summary.weakAmbiguousMatchCount, 1);
});

test("FCF citrus materials do not inherit regular expressed citrus official standards", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "official-ifra-fcf-"));
  const masterPath = path.join(tempDir, "ifra_master_standards.json");
  writeJson(masterPath, {
    metadata: {},
    standards: [
      {
        canonical_name: "Lemon oil cold pressed",
        cas_numbers: ["84929-31-7"],
        standard_type: "RESTRICTION",
        amendment: 51,
        category_limits: {
          cat4: { kind: "limit", value: 2, unit: "%" },
        },
      },
    ],
  });

  const report = buildOfficialIfraHarvestReport({
    sourceQueue: queueWithItems([
      queueItem({
        id: "lemon-fcf",
        materialName: "Lemon FCF",
        requiredSourceType: "fcf_special_case",
        candidateSearchTerms: [
          "Lemon FCF",
          "furocoumarin-free lemon",
          "CAS 84929-31-7",
        ],
      }),
    ]),
    masterStandardsPath: masterPath,
    cacheDir: path.join(tempDir, "cache"),
  });

  assert.equal(report.summary.officialStandardCandidateCount, 0);
  assert.equal(report.summary.noOfficialMatchCount, 1);
  assert.equal(report.candidates.length, 0);
});

test("Official exact candidates outrank supplier product-page candidates in resolver", () => {
  const sourceQueue = queueWithItems([
    queueItem({
      id: "hero-ifra-source-calone-global_ifra_standard_needed",
      materialName: "Calone 1951",
      sourceIdentityName: "Calone 1951",
    }),
  ]);
  const officialIfraSourceCandidates = {
    metadata: { generatedAt: "2026-06-11T00:00:00.000Z" },
    candidates: [
      {
        id: "official-calone",
        materialName: "Calone 1951",
        sourceIdentityName: "Calone 1951",
        queueItemId: "hero-ifra-source-calone-global_ifra_standard_needed",
        queueItemIds: ["hero-ifra-source-calone-global_ifra_standard_needed"],
        sourceType: "official_ifra_standard_library",
        candidateLimitType: "ifra_category_limit",
        candidateUse: "standard_candidate",
        reviewPriority: "high",
        matchType: "cas",
        matchConfidence: "high",
        snippet:
          "Official IFRA Standards Library match. IFRA Category 4: No restriction.",
        candidateValue: "No restriction",
      },
    ],
  };
  const candidateExtractions = {
    candidates: [
      {
        id: "supplier-calone",
        materialName: "Calone 1951",
        sourceIdentityName: "Calone 1951",
        queueItemIds: ["hero-ifra-source-calone-global_ifra_standard_needed"],
        sourceType: "supplier_product_page",
        candidateLimitType: "ifra_category_limit",
        reviewPriority: "high",
        snippet: "Supplier product page says IFRA 51: No restriction for category 4.",
        candidateValue: "No restriction",
      },
    ],
  };

  const resolution = buildIfraEvidenceResolution({
    sourceQueue,
    officialIfraSourceCandidates,
    candidateExtractions,
    candidateReviewQueue: { items: [] },
    reviewedSourceRecords: { records: [] },
  });

  assert.equal(resolution.items[0].bestCandidates[0].id, "official-calone");
  assert.equal(resolution.items[0].bestCandidates[0].sourceType, "official_ifra_standard_library");
  assert.equal(resolution.summary.officialIfraSourceCandidateCount, 1);
});

test("Official candidate evidence prefers cached PDF path while preserving structured source file", () => {
  const candidates = officialCandidatesAsEvidenceCandidates({
    candidates: [
      {
        id: "official-vetiveryl-acetate",
        candidateUse: "standard_candidate",
        sourceType: "official_ifra_standard_library",
        sourceFile: "src/data/ifra_master_standards.json",
        officialPdfLocalFile:
          "downloads/source_documents/ifra/official_ifra/standards/acetylated-vetiver-oil.pdf",
      },
    ],
  });

  assert.equal(
    candidates[0].sourceFile,
    "downloads/source_documents/ifra/official_ifra/standards/acetylated-vetiver-oil.pdf"
  );
  assert.equal(candidates[0].structuredSourceFile, "src/data/ifra_master_standards.json");
});

test("Official cache download writes review metadata shape without requiring live network", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "official-ifra-cache-"));
  const fetchImpl = async (url) => ({
    ok: true,
    status: 200,
    headers: { get: () => "text/html" },
    arrayBuffer: async () => Buffer.from(`<html>${url}</html>`),
  });

  const results = await cacheOfficialIfraIndexPages({
    fetchImpl,
    cacheDir: path.join(tempDir, "official_ifra"),
    root: tempDir,
  });

  assert.equal(results.length, 3);
  assert.equal(results[0].sourceType, "official_ifra_standards_library");
  assert.equal(results[0].httpStatus, 200);
  assert.ok(results[0].localPath.endsWith("standards-library.html"));
  const metadata = JSON.parse(
    fs.readFileSync(path.join(tempDir, results[0].metadataPath), "utf8")
  );
  assert.equal(metadata.sourceType, "official_ifra_standards_library");
  assert.equal(metadata.httpStatus, 200);
  assert.equal(metadata.materialOrQuery, "IFRA Standards Library");
});
