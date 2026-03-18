#!/usr/bin/env node
/**
 * apply-approved.js
 *
 * Applies promotion-safe candidates from src/data/approved/ to RAW_DB
 * in src/App.jsx, then archives processed batch files to src/data/applied/.
 *
 * Only applies candidates where:
 *   - apply_path === "promotion-safe"
 *   - field is in the inline-editable range (indices 0–21 in FIELDS)
 *   - the RAW_DB entry key exists in App.js
 *   - the value line can be found and replaced safely
 *
 * Patch-block fields (dilutionFactor, isUVCB, ifraLimits, etc.) are NOT
 * handled here — update them in the _dilOverrides / _uvNames / _ifraLimits
 * patch block in App.js directly.
 *
 * Usage:
 *   node scripts/apply-approved.js            # apply all promotion-safe
 *   node scripts/apply-approved.js --dry-run  # preview without writing
 *   node scripts/apply-approved.js --batch intake-2026-03-18-001
 */

const fs = require("fs");
const path = require("path");

const APPROVED_DIR = path.join(__dirname, "../src/data/approved");
const APPLIED_DIR = path.join(__dirname, "../src/data/applied");
const APP_JS = path.join(__dirname, "../src/App.jsx");

const FIELD_INDEX = {
  MW: 0, xLogP: 1, TPSA: 2, HBD: 3, HBA: 4,
  VP: 5, ODT: 6, n: 7, note: 8, type: 9,
  ifra: 10, supplier: 11, char: 12, rep: 13, densityGmL: 14,
  cas: 15, inci: 16, scentClass: 17, scentSummary: 18,
  scentDesc: 19, ifraLimit: 20, densityGmL2: 21,
  // 22–28 are patch-block fields — not inline-editable by this script
};

const PATCH_BLOCK_FIELDS = new Set([
  "dilutionFactor", "isUVCB", "descriptorTags",
  "odorThreshold_ngL", "vpConfidence", "isIsomerMix", "ifraLimits",
]);

// ─── Parse CLI args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const batchFilter = args.includes("--batch") ? args[args.indexOf("--batch") + 1] : null;

// ─── Formatting ───────────────────────────────────────────────────────────
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const GRAY = "\x1b[90m";
const DIM = "\x1b[2m";

if (DRY_RUN) {
  console.log(`${YELLOW}${BOLD}DRY RUN — no files will be written${RESET}\n`);
}

// ─── Load App.js ──────────────────────────────────────────────────────────
if (!fs.existsSync(APP_JS)) {
  console.error(`${RED}ERROR: src/App.jsx not found at ${APP_JS}${RESET}`);
  process.exit(1);
}
let appLines = fs.readFileSync(APP_JS, "utf8").split("\n");
const originalLines = [...appLines]; // keep for change count

// ─── Serialize a JS value for inline insertion ────────────────────────────
function serializeValue(val) {
  if (val === null) return "null";
  if (typeof val === "boolean") return String(val);
  if (typeof val === "number") return String(val);
  if (typeof val === "string") return JSON.stringify(val);
  if (Array.isArray(val)) return JSON.stringify(val);
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

// ─── Find the target line for a field in a RAW_DB entry ──────────────────
function findValueLine(canonicalKey, fieldIdx) {
  const escapedKey = canonicalKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headerRegex = new RegExp(`^\\s+(?:"${escapedKey}"|${escapedKey}):\\s*\\[\\s*$`);

  let entryStart = -1;
  for (let i = 0; i < appLines.length; i++) {
    if (headerRegex.test(appLines[i])) {
      entryStart = i;
      break;
    }
  }
  if (entryStart === -1) return { error: `RAW_DB entry not found for key "${canonicalKey}"` };

  let valIdx = 0;
  let lineIdx = entryStart + 1;
  while (lineIdx < appLines.length) {
    const trimmed = appLines[lineIdx].trim();
    if (trimmed === "") { lineIdx++; continue; }
    if (valIdx === fieldIdx) {
      return { lineNum: lineIdx, line: appLines[lineIdx] };
    }
    valIdx++;
    lineIdx++;
    // Safety guard: don't go past the closing ],
    if (trimmed === "],") break;
  }
  return { error: `could not reach field index ${fieldIdx} for key "${canonicalKey}"` };
}

// ─── Apply a single candidate ─────────────────────────────────────────────
function applyCandidate(c) {
  const key = c.canonical_key;
  const field = c.field;
  const proposed = c.proposed_value;
  const fieldIdx = FIELD_INDEX[field];

  // Guard: patch-block fields
  if (PATCH_BLOCK_FIELDS.has(field)) {
    return {
      ok: false,
      reason: `"${field}" is a patch-block field — update _dilOverrides / _uvNames / _ifraLimits in App.js directly`,
    };
  }

  // Guard: unknown field
  if (fieldIdx === undefined) {
    return { ok: false, reason: `field "${field}" not found in FIELD_INDEX` };
  }

  const { lineNum, line, error } = findValueLine(key, fieldIdx);
  if (error) return { ok: false, reason: error };

  // Extract indent and trailing comma from the current line
  const lineMatch = line.match(/^(\s*)(.*?)(,?\s*)$/);
  if (!lineMatch) return { ok: false, reason: `unexpected line format at line ${lineNum + 1}: ${line}` };

  const [, indent, , trailingComma] = lineMatch;
  const newLine = `${indent}${serializeValue(proposed)}${trailingComma}`;

  if (!DRY_RUN) {
    appLines[lineNum] = newLine;
  }

  return {
    ok: true,
    lineNum: lineNum + 1,
    oldLine: line.trim(),
    newLine: newLine.trim(),
  };
}

// ─── Load approved files ──────────────────────────────────────────────────
if (!fs.existsSync(APPROVED_DIR)) {
  console.error(`${RED}ERROR: src/data/approved/ not found at ${APPROVED_DIR}${RESET}`);
  process.exit(1);
}
if (!fs.existsSync(APPLIED_DIR)) {
  fs.mkdirSync(APPLIED_DIR, { recursive: true });
}

const approvedFiles = fs.readdirSync(APPROVED_DIR)
  .filter(f => f.endsWith(".json"))
  .sort();

if (approvedFiles.length === 0) {
  console.log("No approved candidate files found in", APPROVED_DIR);
  console.log("Move reviewed batches from src/data/staged/ to src/data/approved/ first.");
  process.exit(0);
}

// ─── Process each file ────────────────────────────────────────────────────
let totalApplied = 0;
let totalSkipped = 0;
let totalErrors = 0;
const processedFiles = [];

for (const filename of approvedFiles) {
  if (batchFilter && !filename.includes(batchFilter)) continue;

  const filePath = path.join(APPROVED_DIR, filename);
  let batch;
  try {
    batch = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    console.error(`${RED}PARSE ERROR ${filename}: ${e.message}${RESET}`);
    continue;
  }

  const candidates = (batch.candidates || []).filter(c => c.apply_path === "promotion-safe");
  if (candidates.length === 0) {
    console.log(`${GRAY}${filename}: no promotion-safe candidates — skipping${RESET}`);
    continue;
  }

  console.log(`\n${"─".repeat(80)}`);
  console.log(`${BOLD}Processing: ${batch.batch_id}${RESET}  ${DIM}(${filename})${RESET}`);
  console.log(`${DIM}${candidates.length} promotion-safe candidates${RESET}`);
  console.log();

  let batchApplied = 0;
  let batchSkipped = 0;
  let batchErrors = 0;

  for (const c of candidates) {
    const result = applyCandidate(c);
    if (result.ok) {
      const noChange = result.oldLine === result.newLine;
      if (noChange) {
        console.log(`  ${GRAY}⊘  ${c.canonical_key}.${c.field} — already correct${RESET}`);
        batchSkipped++;
        totalSkipped++;
      } else {
        console.log(`  ${GREEN}✓  ${c.canonical_key}.${c.field}${RESET}`);
        console.log(`     ${GRAY}was: ${result.oldLine}${RESET}`);
        console.log(`     ${GREEN}now: ${result.newLine}${RESET}`);
        if (DRY_RUN) console.log(`     ${YELLOW}(dry-run — not written)${RESET}`);
        batchApplied++;
        totalApplied++;
      }
    } else {
      console.log(`  ${RED}✗  ${c.canonical_key}.${c.field} — ${result.reason}${RESET}`);
      batchErrors++;
      totalErrors++;
    }
  }

  const notSafe = (batch.candidates || []).filter(c => c.apply_path !== "promotion-safe");
  if (notSafe.length > 0) {
    console.log(`\n  ${YELLOW}⚠ ${notSafe.length} non-promotion-safe candidate(s) not applied:${RESET}`);
    for (const c of notSafe) {
      console.log(`     ${c.canonical_key}.${c.field}  [${c.apply_path}]`);
    }
  }

  console.log(`\n  Applied: ${batchApplied}  Skipped: ${batchSkipped}  Errors: ${batchErrors}`);
  processedFiles.push(filename);
}

// ─── Write updated App.js + archive files ────────────────────────────────
if (!DRY_RUN && totalApplied > 0) {
  // Verify brace balance before writing
  const code = appLines.join("\n");
  let opens = 0, closes = 0;
  for (const ch of code) {
    if (ch === "{") opens++;
    if (ch === "}") closes++;
  }
  if (opens !== closes) {
    console.error(`\n${RED}${BOLD}BRACE BALANCE ERROR: ${opens - closes}. App.js NOT saved.${RESET}`);
    console.error("Fix the balance issue before applying again.");
    process.exit(1);
  }

  fs.writeFileSync(APP_JS, code);
  console.log(`\n${GREEN}${BOLD}✓ src/App.jsx updated (${totalApplied} change(s) applied)${RESET}`);

  // Archive processed files
  const timestamp = new Date().toISOString().slice(0, 10);
  for (const filename of processedFiles) {
    const src = path.join(APPROVED_DIR, filename);
    const dest = path.join(APPLIED_DIR, `${timestamp}-${filename}`);
    fs.renameSync(src, dest);
    console.log(`  ${DIM}Archived: ${filename} → src/data/applied/${timestamp}-${filename}${RESET}`);
  }
} else if (DRY_RUN) {
  console.log(`\n${YELLOW}Dry-run complete — no files written.${RESET}`);
  console.log(`Remove --dry-run to apply.`);
} else if (totalApplied === 0) {
  console.log(`\n${GRAY}No changes applied (all candidates already correct or skipped).${RESET}`);
}

// ─── Final summary ────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(60)}`);
console.log(`${BOLD}SUMMARY${RESET}`);
console.log(`  ${GREEN}Applied:${RESET}   ${totalApplied}`);
console.log(`  ${GRAY}Skipped:${RESET}   ${totalSkipped}  (already correct)`);
console.log(`  ${RED}Errors:${RESET}    ${totalErrors}`);
if (totalErrors > 0) {
  console.log(`\n  ${RED}Review errors above. Errored candidates were not applied.${RESET}`);
  console.log(`  Common causes:`);
  console.log(`    - canonical_key not matching exact RAW_DB key`);
  console.log(`    - patch-block field (use App.js patch block directly)`);
  console.log(`    - entry structure changed`);
}
if (!DRY_RUN && totalApplied > 0) {
  console.log(`\n  ${YELLOW}Run: npm run build${RESET}  to verify the app still builds.`);
}
