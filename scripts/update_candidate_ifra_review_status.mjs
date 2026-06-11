#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_MARKDOWN_PATH,
  DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_PATH,
  VALID_CANDIDATE_IFRA_REVIEW_STATUSES,
  formatCandidateIfraReviewQueueMarkdown,
  loadExistingCandidateIfraReviewQueue,
  updateCandidateIfraReviewStatus,
  writeCandidateIfraReviewQueue,
} from "./lib/candidate_ifra_review_queue.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function printHelp() {
  console.log(`Usage:
  node scripts/update_candidate_ifra_review_status.mjs --id <review-item-id> --review-status accepted --accept-candidate <candidate-id> --notes "Reviewed source; ready for later promotion review."

Allowed reviewStatus values:
  ${VALID_CANDIDATE_IFRA_REVIEW_STATUSES.join(", ")}

Options:
  --id <id>                    Candidate review item ID.
  --review-status <value>      Update review status.
  --accept-candidate <id>      Mark one candidate as accepted for this review item. Can be repeated.
  --reject-candidate <id>      Mark one candidate as rejected for this review item. Can be repeated.
  --notes <text>               Update review notes.
  --queue <path>               Review queue JSON path.
  --write <path>               Also write Markdown review queue report.
  --help                       Show this help.

This script updates review metadata only. Accepted candidates are not runtime IFRA data, do not add IFRA limits, and do not prove launch clearance.`);
}

function parseArgs(argv) {
  const args = {
    id: null,
    queuePath: DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_PATH,
    writePath: null,
    reviewStatus: null,
    acceptCandidateIds: [],
    rejectCandidateIds: [],
    notes: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--id") {
      args.id = argv[++index];
      if (!args.id) throw new Error("--id requires a review item id");
    } else if (arg === "--review-status") {
      args.reviewStatus = argv[++index];
      if (!args.reviewStatus) throw new Error("--review-status requires a value");
    } else if (arg === "--accept-candidate") {
      const value = argv[++index];
      if (!value) throw new Error("--accept-candidate requires a candidate id");
      args.acceptCandidateIds.push(value);
    } else if (arg === "--reject-candidate") {
      const value = argv[++index];
      if (!value) throw new Error("--reject-candidate requires a candidate id");
      args.rejectCandidateIds.push(value);
    } else if (arg === "--notes") {
      args.notes = argv[++index] || "";
    } else if (arg === "--queue") {
      const value = argv[++index];
      if (!value) throw new Error("--queue requires a path");
      args.queuePath = resolveRepoPath(value);
    } else if (arg === "--write") {
      const value = argv[++index] || DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_MARKDOWN_PATH;
      args.writePath = resolveRepoPath(value);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function writeMarkdownReport(queue, writePath) {
  const outputPath = writePath || DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_MARKDOWN_PATH;
  const markdown = formatCandidateIfraReviewQueueMarkdown(queue);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, markdown.endsWith("\n") ? markdown : `${markdown}\n`);
  console.log(`Candidate IFRA review queue written: ${path.relative(ROOT, outputPath)}`);
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }

  const queue = loadExistingCandidateIfraReviewQueue(args.queuePath);
  if (!queue) throw new Error(`Candidate review queue not found: ${args.queuePath}`);

  const result = updateCandidateIfraReviewStatus({
    queue,
    id: args.id,
    reviewStatus: args.reviewStatus,
    acceptCandidateIds: args.acceptCandidateIds,
    rejectCandidateIds: args.rejectCandidateIds,
    notes: args.notes,
  });
  writeCandidateIfraReviewQueue(args.queuePath, result.queue);

  if (args.writePath) writeMarkdownReport(result.queue, args.writePath);

  console.log(`Updated ${result.item.id}`);
  console.log(`Material: ${result.item.materialName}`);
  console.log(`Changed fields: ${result.changedFields.join(", ")}`);
  console.log(`Review status: ${result.item.reviewStatus}`);
  console.log(`Accepted candidates: ${result.item.acceptedCandidateIds.length}`);
  console.log(`Rejected candidates: ${result.item.rejectedCandidateIds.length}`);
  return result.queue;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  }
}
