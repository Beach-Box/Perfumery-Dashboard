#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_REVIEWED_IFRA_SOURCE_RECORDS_PATH,
  PILOT_FCF_MATERIALS,
  REVIEWED_IFRA_FINDINGS,
  REVIEWED_IFRA_SOURCE_RECORD_TYPES,
  promoteReviewedIfraCandidateFromFiles,
} from "./lib/reviewed_ifra_source_records.mjs";
import { DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH } from "./lib/ifra_source_harvest.mjs";
import { DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_PATH } from "./lib/candidate_ifra_review_queue.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function printHelp() {
  console.log(`Usage:
  node scripts/promote_reviewed_ifra_candidates.mjs \\
    --candidate-id "<candidate-id>" \\
    --material "Bergamot EO FCF" \\
    --record-type fcf_phototoxic_note \\
    --finding furocoumarin_free_or_bergapten_free \\
    --summary "Reviewed source text supports FCF/bergapten-free special-case handling."

Options:
  --candidate-id <id>       Candidate ID from candidate_ifra_source_extractions.json.
  --material <name>         Pilot material. Allowed: ${PILOT_FCF_MATERIALS.join(", ")}.
  --record-type <type>      Allowed: ${REVIEWED_IFRA_SOURCE_RECORD_TYPES.join(", ")}.
  --finding <finding>       Allowed: ${REVIEWED_IFRA_FINDINGS.join(", ")}.
  --summary <text>          Human review summary for the source evidence.
  --allow-low-priority      Allow low-priority candidates after explicit review.
  --json                    Print machine-readable result.
  --candidates <path>       Candidate extraction JSON path.
  --records <path>          Reviewed source records JSON path.
  --review-queue <path>     Candidate review queue JSON path.
  --no-review-queue-update  Do not mark the exact candidate review item accepted.
  --help                    Show this help.

Defaults:
  candidates: ${path.relative(ROOT, DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH)}
  records: ${path.relative(ROOT, DEFAULT_REVIEWED_IFRA_SOURCE_RECORDS_PATH)}
  review queue: ${path.relative(ROOT, DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_PATH)}

Guardrails:
  This pilot creates reviewed source-evidence metadata only. It does not add IFRA limits, does not promote category limits, does not mark launch clearance, and does not change formulas.`);
}

function parseArgs(argv) {
  const args = {
    candidateId: "",
    materialName: "",
    recordType: "",
    finding: "",
    summary: "",
    allowLowPriority: false,
    json: false,
    help: false,
    updateReviewQueue: true,
    candidateExtractionsPath: DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH,
    reviewedRecordsPath: DEFAULT_REVIEWED_IFRA_SOURCE_RECORDS_PATH,
    candidateReviewQueuePath: DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--candidate-id") {
      args.candidateId = argv[++index] || "";
      if (!args.candidateId) throw new Error("--candidate-id requires a value");
    } else if (arg === "--material") {
      args.materialName = argv[++index] || "";
      if (!args.materialName) throw new Error("--material requires a value");
    } else if (arg === "--record-type") {
      args.recordType = argv[++index] || "";
      if (!args.recordType) throw new Error("--record-type requires a value");
    } else if (arg === "--finding") {
      args.finding = argv[++index] || "";
      if (!args.finding) throw new Error("--finding requires a value");
    } else if (arg === "--summary") {
      args.summary = argv[++index] || "";
      if (!args.summary) throw new Error("--summary requires a value");
    } else if (arg === "--allow-low-priority") {
      args.allowLowPriority = true;
    } else if (arg === "--candidates") {
      const value = argv[++index];
      if (!value) throw new Error("--candidates requires a path");
      args.candidateExtractionsPath = resolveRepoPath(value);
    } else if (arg === "--records") {
      const value = argv[++index];
      if (!value) throw new Error("--records requires a path");
      args.reviewedRecordsPath = resolveRepoPath(value);
    } else if (arg === "--review-queue") {
      const value = argv[++index];
      if (!value) throw new Error("--review-queue requires a path");
      args.candidateReviewQueuePath = resolveRepoPath(value);
    } else if (arg === "--no-review-queue-update") {
      args.updateReviewQueue = false;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function formatResultText(result) {
  return [
    "Reviewed IFRA Candidate Promotion Pilot",
    "",
    `Created/updated record: ${result.record.id}`,
    `Material: ${result.record.materialName}`,
    `Record type: ${result.record.recordType}`,
    `Finding: ${result.record.finding}`,
    `Runtime use: ${result.record.runtimeUse}`,
    `Source: ${result.record.sourceFile || result.record.sourceUrl || "Unknown"}`,
    `Candidate: ${result.record.candidateIds.join(", ")}`,
    `Candidate review queue: ${
      result.candidateReviewQueueUpdate.updated
        ? `accepted (${result.candidateReviewQueueUpdate.itemId})`
        : result.candidateReviewQueueUpdate.reason
    }`,
    "",
    "Guardrails:",
    ...result.guardrails.map((line) => `- ${line}`),
    "",
  ].join("\n");
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }

  const result = promoteReviewedIfraCandidateFromFiles({
    candidateExtractionsPath: args.candidateExtractionsPath,
    reviewedRecordsPath: args.reviewedRecordsPath,
    candidateReviewQueuePath: args.candidateReviewQueuePath,
    updateReviewQueue: args.updateReviewQueue,
    candidateId: args.candidateId,
    materialName: args.materialName,
    recordType: args.recordType,
    finding: args.finding,
    summary: args.summary,
    allowLowPriority: args.allowLowPriority,
  });

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          record: result.record,
          candidateReviewQueueUpdate: result.candidateReviewQueueUpdate,
          guardrails: result.guardrails,
        },
        null,
        2
      )
    );
  } else {
    console.log(formatResultText(result));
  }
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  }
}
