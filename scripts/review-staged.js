#!/usr/bin/env node
/**
 * review-staged.js
 *
 * Reads all candidate batches in src/data/staged/ and prints a formatted
 * diff table comparing each proposed value against the current RAW_DB value
 * in src/App.jsx.
 *
 * Usage:
 *   node scripts/review-staged.js
 *   node scripts/review-staged.js --batch intake-example-2026-03-18
 *   node scripts/review-staged.js --field VP          # filter by field
 *   node scripts/review-staged.js --safe-only         # promotion-safe only
 *   node scripts/review-staged.js --conflicts-only    # conflicting only
 */

const fs = require("fs");
const path = require("path");

const STAGED_DIR = path.join(__dirname, "../src/data/staged");
const APP_JS = path.join(__dirname, "../src/App.jsx");

// Must match FIELDS array in src/App.jsx exactly (indices 0–21 are in-line editable)
const FIELD_INDEX = {
  MW: 0, xLogP: 1, TPSA: 2, HBD: 3, HBA: 4,
  VP: 5, ODT: 6, n: 7, note: 8, type: 9,
  ifra: 10, supplier: 11, char: 12, rep: 13, densityGmL: 14,
  cas: 15, inci: 16, scentClass: 17, scentSummary: 18,
  scentDesc: 19, ifraLimit: 20, densityGmL2: 21,
  // Fields 22–28 are patch-block managed — readable but not inline-editable
  dilutionFactor: 22, isUVCB: 23, descriptorTags: 24,
  odorThreshold_ngL: 25, vpConfidence: 26, isIsomerMix: 27, ifraLimits: 28,
};

const PATCH_BLOCK_FIELDS = new Set([
  "dilutionFactor", "isUVCB", "descriptorTags",
  "odorThreshold_ngL", "vpConfidence", "isIsomerMix", "ifraLimits",
]);

// ─── Parse CLI args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const batchFilter = args.includes("--batch") ? args[args.indexOf("--batch") + 1] : null;
const fieldFilter = args.includes("--field") ? args[args.indexOf("--field") + 1] : null;
const safeOnly = args.includes("--safe-only");
const conflictsOnly = args.includes("--conflicts-only");

// ─── Load App.js lines ────────────────────────────────────────────────────
if (!fs.existsSync(APP_JS)) {
  console.error("ERROR: src/App.jsx not found at", APP_JS);
  process.exit(1);
}
const appLines = fs.readFileSync(APP_JS, "utf8").split("\n");

// ─── Read current value from RAW_DB ──────────────────────────────────────
function readCurrentValue(canonicalKey, fieldName) {
  const fieldIdx = FIELD_INDEX[fieldName];
  if (fieldIdx === undefined) return { value: "UNKNOWN_FIELD", note: "field not in FIELD_INDEX" };

  // For patch-block fields, note they are runtime-applied, not in the inline array
  if (PATCH_BLOCK_FIELDS.has(fieldName)) {
    return { value: "(patch-block managed)", note: "not inline-editable via apply script" };
  }

  const escapedKey = canonicalKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headerRegex = new RegExp(`^\\s+(?:"${escapedKey}"|${escapedKey}):\\s*\\[\\s*$`);

  let entryStart = -1;
  for (let i = 0; i < appLines.length; i++) {
    if (headerRegex.test(appLines[i])) {
      entryStart = i;
      break;
    }
  }

  if (entryStart === -1) return { value: "KEY_NOT_FOUND", note: `no RAW_DB entry for "${canonicalKey}"` };

  // Count fieldIdx non-blank lines after entry start
  let valIdx = 0;
  let lineIdx = entryStart + 1;
  while (lineIdx < appLines.length) {
    const trimmed = appLines[lineIdx].trim();
    if (trimmed === "") { lineIdx++; continue; }
    if (valIdx === fieldIdx) {
      // Extract the value from this line (strip indent and trailing comma)
      const match = trimmed.match(/^(.*?),?\s*$/);
      return { value: match ? match[1] : trimmed, note: `line ${lineIdx + 1}` };
    }
    // Handle multi-null line (fields 22+): all remaining nulls on one line
    if (trimmed.startsWith("null,") || trimmed === "null") {
      // Count how many nulls are on this line
      const nullCount = trimmed.split(",").filter(p => p.trim() === "null" || p.trim() === "null").length;
      if (fieldIdx <= valIdx + nullCount - 1) {
        return { value: "null", note: `line ${lineIdx + 1} (multi-null line, index ${fieldIdx - valIdx} of ${nullCount})` };
      }
      valIdx += nullCount;
      lineIdx++;
      continue;
    }
    valIdx++;
    lineIdx++;
  }

  return { value: "PARSE_ERROR", note: `could not reach index ${fieldIdx} for "${canonicalKey}"` };
}

// ─── Formatting helpers ───────────────────────────────────────────────────
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";

function confidenceColor(c) {
  if (c === "confirmed") return GREEN;
  if (c === "likely") return CYAN;
  if (c === "conflicting") return RED;
  if (c === "missing") return GRAY;
  return RESET;
}

function applyPathColor(p) {
  if (p === "promotion-safe") return GREEN;
  if (p === "manual-review-only") return YELLOW;
  if (p === "insufficient-support") return RED;
  return RESET;
}

function truncate(str, len) {
  const s = String(str ?? "");
  return s.length > len ? s.slice(0, len - 1) + "…" : s;
}

function pad(str, len) {
  const s = truncate(str, len);
  return s + " ".repeat(Math.max(0, len - s.length));
}

// ─── Load staged files ────────────────────────────────────────────────────
if (!fs.existsSync(STAGED_DIR)) {
  console.error("ERROR: src/data/staged/ not found. Expected at", STAGED_DIR);
  process.exit(1);
}

const stagedFiles = fs.readdirSync(STAGED_DIR)
  .filter(f => f.endsWith(".json"))
  .sort();

if (stagedFiles.length === 0) {
  console.log("No staged candidate files found in", STAGED_DIR);
  console.log("Place JSON batch files there (see src/data/schemas/candidate.schema.json for format).");
  process.exit(0);
}

// ─── Process each file ────────────────────────────────────────────────────
let totalCandidates = 0;
let safeCount = 0;
let reviewCount = 0;
let insufficientCount = 0;
let conflictCount = 0;
let noChangeCount = 0;

for (const filename of stagedFiles) {
  if (batchFilter && !filename.includes(batchFilter)) continue;

  const filePath = path.join(STAGED_DIR, filename);
  let batch;
  try {
    batch = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    console.error(`${RED}PARSE ERROR${RESET} ${filename}: ${e.message}`);
    continue;
  }

  let candidates = batch.candidates || [];
  if (fieldFilter) candidates = candidates.filter(c => c.field === fieldFilter);
  if (safeOnly) candidates = candidates.filter(c => c.apply_path === "promotion-safe");
  if (conflictsOnly) candidates = candidates.filter(c => c.confidence === "conflicting");
  if (candidates.length === 0) continue;

  console.log(`\n${"─".repeat(120)}`);
  console.log(`${BOLD}Batch: ${batch.batch_id}${RESET}  ${DIM}(${filename})${RESET}`);
  console.log(`${DIM}Created: ${batch.created_at}   Agent: ${batch.source_agent || "—"}   Batch apply_path: ${batch.apply_path}${RESET}`);
  if (batch.notes) console.log(`${DIM}Notes: ${batch.notes}${RESET}`);
  console.log();

  // Header
  console.log(
    `${BOLD}${pad("KEY", 30)} ${pad("FIELD", 18)} ${pad("CURRENT", 30)} ${pad("PROPOSED", 30)} ${pad("CONF", 11)} ${pad("APPLY_PATH", 20)} ${pad("SOURCE", 35)}${RESET}`
  );
  console.log("─".repeat(180));

  for (const c of candidates) {
    const key = c.canonical_key || "?";
    const field = c.field || "?";
    const proposed = c.proposed_value;
    const { value: current, note: currentNote } = readCurrentValue(key, field);

    // Check if it's a no-op
    const isNoChange = String(current) === String(proposed);
    const isConflict = c.confidence === "conflicting";

    const confColor = confidenceColor(c.confidence);
    const pathColor = applyPathColor(c.apply_path);
    const rowColor = isNoChange ? GRAY : isConflict ? RED : RESET;

    const currentDisplay = isNoChange ? `${GRAY}${pad(current, 28)} =${RESET}` : pad(current, 30);
    const proposedDisplay = isNoChange
      ? `${GRAY}${pad(proposed, 29)} (no change)${RESET}`
      : `${GREEN}${pad(proposed, 30)}${RESET}`;

    console.log(
      `${rowColor}${pad(key, 30)}${RESET} ` +
      `${pad(field, 18)} ` +
      `${currentDisplay} ` +
      `${proposedDisplay} ` +
      `${confColor}${pad(c.confidence, 11)}${RESET} ` +
      `${pathColor}${pad(c.apply_path, 20)}${RESET} ` +
      `${DIM}${pad(c.source_ref || c.source_type || "—", 35)}${RESET}`
    );

    if (c.conflict_note) {
      console.log(`  ${RED}⚠ CONFLICT: ${c.conflict_note}${RESET}`);
    }
    if (currentNote && (current === "KEY_NOT_FOUND" || current === "PARSE_ERROR")) {
      console.log(`  ${RED}⚠ ${currentNote}${RESET}`);
    }
    if (c.reviewer_notes && c.reviewer_notes.trim()) {
      console.log(`  ${DIM}↳ Reviewer: ${c.reviewer_notes}${RESET}`);
    }

    totalCandidates++;
    if (isNoChange) noChangeCount++;
    if (c.apply_path === "promotion-safe") safeCount++;
    else if (c.apply_path === "manual-review-only") reviewCount++;
    else insufficientCount++;
    if (isConflict) conflictCount++;
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(80)}`);
console.log(`${BOLD}SUMMARY${RESET}`);
console.log(`${"─".repeat(80)}`);
console.log(`  Total candidates:     ${totalCandidates}`);
console.log(`  ${GREEN}Promotion-safe:${RESET}       ${safeCount}  ← move batch to src/data/approved/ to apply`);
console.log(`  ${YELLOW}Manual-review-only:${RESET}   ${reviewCount}  ← needs human decision before applying`);
console.log(`  ${RED}Insufficient-support:${RESET} ${insufficientCount}`);
console.log(`  ${RED}Conflicts:${RESET}            ${conflictCount}`);
console.log(`  ${GRAY}No-change (already correct): ${noChangeCount}${RESET}`);
console.log();
console.log(`To apply promotion-safe batches:`);
console.log(`  1. Move the batch file to src/data/approved/`);
console.log(`  2. node scripts/apply-approved.js --dry-run`);
console.log(`  3. node scripts/apply-approved.js`);
