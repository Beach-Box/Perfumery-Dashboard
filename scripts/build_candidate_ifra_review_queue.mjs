#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH } from "./lib/ifra_source_harvest.mjs";
import { DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH } from "./lib/hero_ifra_source_acquisition_queue.mjs";
import {
  DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_MARKDOWN_PATH,
  DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_PATH,
  buildCandidateIfraReviewQueueFromFiles,
  formatCandidateIfraReviewQueueMarkdown,
  formatCandidateIfraReviewQueueText,
  writeCandidateIfraReviewQueue,
} from "./lib/candidate_ifra_review_queue.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function printHelp() {
  console.log(`Usage:
  node scripts/build_candidate_ifra_review_queue.mjs
  node scripts/build_candidate_ifra_review_queue.mjs --json
  node scripts/build_candidate_ifra_review_queue.mjs --markdown
  node scripts/build_candidate_ifra_review_queue.mjs --markdown --write docs/ifra/candidate_ifra_review_queue.md

Options:
  --candidate-extractions <path>  Candidate extraction JSON path.
  --source-queue <path>           Hero IFRA source acquisition queue path.
  --output <path>                 Review queue JSON path.
  --json                          Print JSON.
  --markdown                      Print Markdown.
  --write <path>                  Write formatted output.
  --help                          Show this help.

This script builds a human review queue for candidate IFRA/SDS/source snippets. It does not add IFRA limits, promote records, or prove launch clearance.`);
}

function parseArgs(argv) {
  const args = {
    candidateExtractionsPath: DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH,
    sourceQueuePath: DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH,
    outputPath: DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_PATH,
    format: "text",
    writePath: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--candidate-extractions") {
      const value = argv[++index];
      if (!value) throw new Error("--candidate-extractions requires a path");
      args.candidateExtractionsPath = resolveRepoPath(value);
    } else if (arg === "--source-queue") {
      const value = argv[++index];
      if (!value) throw new Error("--source-queue requires a path");
      args.sourceQueuePath = resolveRepoPath(value);
    } else if (arg === "--output") {
      const value = argv[++index];
      if (!value) throw new Error("--output requires a path");
      args.outputPath = resolveRepoPath(value);
    } else if (arg === "--json") {
      args.format = "json";
    } else if (arg === "--markdown") {
      args.format = "markdown";
    } else if (arg === "--write") {
      const value = argv[++index] || DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_MARKDOWN_PATH;
      args.writePath = resolveRepoPath(value);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function renderQueue(queue, format) {
  if (format === "json") return `${JSON.stringify(queue, null, 2)}\n`;
  if (format === "markdown") return formatCandidateIfraReviewQueueMarkdown(queue);
  return formatCandidateIfraReviewQueueText(queue);
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }

  const queue = buildCandidateIfraReviewQueueFromFiles({
    candidateExtractionsPath: args.candidateExtractionsPath,
    sourceQueuePath: args.sourceQueuePath,
    existingQueuePath: args.outputPath,
  });
  writeCandidateIfraReviewQueue(args.outputPath, queue);

  const output = renderQueue(queue, args.format);
  if (args.writePath) {
    fs.mkdirSync(path.dirname(args.writePath), { recursive: true });
    fs.writeFileSync(args.writePath, output.endsWith("\n") ? output : `${output}\n`);
    if (args.format !== "json") {
      console.log(
        `Candidate IFRA review queue written: ${path.relative(ROOT, args.writePath)}`
      );
      console.log(
        `Candidate IFRA review queue JSON written: ${path.relative(
          ROOT,
          args.outputPath
        )}`
      );
    }
  } else {
    process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
  }

  return queue;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  }
}
