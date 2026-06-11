#!/usr/bin/env node

import path from "node:path";

import {
  promoteReviewedIfraStructuredRecord,
  DEFAULT_REVIEWED_IFRA_STRUCTURED_OVERRIDES_PATH,
} from "./lib/reviewed_ifra_structured_promotion.mjs";
import {
  DEFAULT_PROPOSED_IFRA_STRUCTURED_RECORDS_PATH,
} from "./lib/ifra_autopilot_recommendations.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

function usage() {
  return `Usage:
  node scripts/promote_reviewed_ifra_structured_record.mjs --help
  node scripts/promote_reviewed_ifra_structured_record.mjs \\
    --proposed-record-id "<id>" \\
    --review-status reviewed_ok \\
    --notes "Reviewed official IFRA source PDF; promote one source-backed standard record."

Options:
  --proposed-record-id <id>  Required proposed record id.
  --review-status <status>   Required; must be reviewed_ok.
  --notes <text>             Review notes to preserve with the promoted record.
  --proposed-records <path>  Override proposed records JSON path.
  --overrides <path>         Override reviewed runtime overlay JSON path.
  --json                     Print JSON result.
  --help                     Show this help.

Guardrails:
  - Promotes exactly one proposed record per run.
  - Requires an official IFRA standard source candidate and source provenance.
  - Does not promote supplier-only records.
  - Does not invent IFRA limits or claim launch clearance.
  - Does not commit downloaded source PDFs/HTML.`;
}

function parseArgs(argv = []) {
  const args = {
    proposedRecordId: "",
    reviewStatus: "",
    notes: "",
    proposedRecordsPath: DEFAULT_PROPOSED_IFRA_STRUCTURED_RECORDS_PATH,
    overridesPath: DEFAULT_REVIEWED_IFRA_STRUCTURED_OVERRIDES_PATH,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      const value = argv[index];
      if (!value) throw new Error(`${arg} requires a value.`);
      return value;
    };
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--proposed-record-id") args.proposedRecordId = next();
    else if (arg === "--review-status") args.reviewStatus = next();
    else if (arg === "--notes") args.notes = next();
    else if (arg === "--proposed-records") {
      args.proposedRecordsPath = path.resolve(ROOT, next());
    } else if (arg === "--overrides") {
      args.overridesPath = path.resolve(ROOT, next());
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return null;
  }

  const result = promoteReviewedIfraStructuredRecord({
    proposedRecordId: args.proposedRecordId,
    reviewStatus: args.reviewStatus,
    reviewNotes: args.notes,
    proposedRecordsPath: args.proposedRecordsPath,
    overridesPath: args.overridesPath,
  });

  const summary = {
    promotedRecordId: result.promotedRecord.id,
    proposedRecordId: result.promotedRecord.proposedRecordId,
    materialNames: result.promotedRecord.materialNames,
    standardName: result.promotedRecord.standardName,
    sourceType: result.promotedRecord.sourceType,
    sourceUrl: result.promotedRecord.sourceUrl,
    sourceFile: result.promotedRecord.sourceFile,
    categoryLimits: result.promotedRecord.categoryLimits,
    reviewStatus: result.promotedRecord.reviewStatus,
    runtimeUse: result.promotedRecord.runtimeUse,
    limitations: result.promotedRecord.limitations,
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log("Reviewed IFRA structured record promoted.");
    console.log(`Promoted record: ${summary.promotedRecordId}`);
    console.log(`Standard: ${summary.standardName}`);
    console.log(`Source: ${summary.sourceUrl}`);
    console.log(`Local source file: ${summary.sourceFile}`);
    console.log("Runtime note: not launch clearance; one reviewed structured record only.");
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  }
}
