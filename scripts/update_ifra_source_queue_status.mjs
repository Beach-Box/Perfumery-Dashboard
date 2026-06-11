#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH,
  loadExistingHeroIfraSourceQueue,
} from "./lib/hero_ifra_source_acquisition_queue.mjs";
import {
  DEFAULT_IFRA_SOURCE_DOCUMENT_INVENTORY_PATH,
  DEFAULT_IFRA_SOURCE_REVIEW_STATUS_MARKDOWN_PATH,
  VALID_QUEUE_STATUSES,
  VALID_REVIEW_STATUSES,
  formatHeroIfraSourceReviewStatusMarkdown,
  saveUpdatedHeroIfraSourceQueue,
  updateHeroIfraSourceQueueStatus,
} from "./lib/ifra_source_document_review.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function loadJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function printHelp() {
  console.log(`Usage:
  node scripts/update_ifra_source_queue_status.mjs --id <queue-item-id> --status acquired --review-status needs_review --source-file downloads/source_documents/ifra/example.pdf --notes "Downloaded; needs review."
  node scripts/update_ifra_source_queue_status.mjs --review-report --write docs/ifra/hero_ifra_source_review_status.md

Allowed status values:
  ${VALID_QUEUE_STATUSES.join(", ")}

Allowed reviewStatus values:
  ${VALID_REVIEW_STATUSES.join(", ")}

Options:
  --id <id>              Queue item ID. Full IDs and material/source-type aliases are accepted.
  --status <value>       Update status.
  --review-status <val>  Update reviewStatus.
  --source-file <path>   Link a local acquired source document.
  --notes <text>         Alias for --source-notes.
  --source-notes <text>  Update sourceNotes.
  --review-notes <text>  Update reviewNotes.
  --queue <path>         Queue JSON path. Defaults to data/ifra_source_acquisition/hero_ifra_source_queue.json
  --inventory <path>     Inventory JSON path for review reports.
  --review-report        Generate a Markdown review status report instead of updating an item.
  --write <path>         Review report output path.
  --help                 Show this help.

This script updates only manual review fields. It does not parse documents, add IFRA limits, promote records, or prove launch clearance.`);
}

function parseArgs(argv) {
  const args = {
    id: null,
    queuePath: DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH,
    inventoryPath: DEFAULT_IFRA_SOURCE_DOCUMENT_INVENTORY_PATH,
    writePath: null,
    reviewReport: false,
    help: false,
    updates: {},
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--id") {
      args.id = argv[++index];
      if (!args.id) throw new Error("--id requires a queue item id");
    } else if (arg === "--status") {
      args.updates.status = argv[++index];
      if (!args.updates.status) throw new Error("--status requires a value");
    } else if (arg === "--review-status") {
      args.updates.reviewStatus = argv[++index];
      if (!args.updates.reviewStatus) {
        throw new Error("--review-status requires a value");
      }
    } else if (arg === "--source-file") {
      args.updates.sourceFile = argv[++index];
      if (!args.updates.sourceFile) throw new Error("--source-file requires a path");
    } else if (arg === "--notes" || arg === "--source-notes") {
      args.updates.sourceNotes = argv[++index] || "";
    } else if (arg === "--review-notes") {
      args.updates.reviewNotes = argv[++index] || "";
    } else if (arg === "--queue") {
      const value = argv[++index];
      if (!value) throw new Error("--queue requires a path");
      args.queuePath = resolveRepoPath(value);
    } else if (arg === "--inventory") {
      const value = argv[++index];
      if (!value) throw new Error("--inventory requires a path");
      args.inventoryPath = resolveRepoPath(value);
    } else if (arg === "--review-report" || arg === "--report") {
      args.reviewReport = true;
    } else if (arg === "--write") {
      const value = argv[++index] || DEFAULT_IFRA_SOURCE_REVIEW_STATUS_MARKDOWN_PATH;
      args.writePath = resolveRepoPath(value);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function writeReviewReport({ queue, inventory, writePath }) {
  const markdown = formatHeroIfraSourceReviewStatusMarkdown({ queue, inventory });
  const outputPath = writePath || DEFAULT_IFRA_SOURCE_REVIEW_STATUS_MARKDOWN_PATH;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, markdown.endsWith("\n") ? markdown : `${markdown}\n`);
  console.log(`IFRA source review status written: ${path.relative(ROOT, outputPath)}`);
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }

  const queue = loadExistingHeroIfraSourceQueue(args.queuePath);
  if (!queue) throw new Error(`Queue not found: ${path.relative(ROOT, args.queuePath)}`);
  const inventory = loadJsonIfPresent(args.inventoryPath);

  if (args.reviewReport) {
    writeReviewReport({ queue, inventory, writePath: args.writePath });
    return queue;
  }

  const result = updateHeroIfraSourceQueueStatus({
    queue,
    id: args.id,
    updates: args.updates,
  });
  saveUpdatedHeroIfraSourceQueue(args.queuePath, result.queue);

  if (args.writePath) {
    writeReviewReport({
      queue: result.queue,
      inventory,
      writePath: args.writePath,
    });
  }

  console.log(`Updated ${result.item.id}`);
  console.log(`Material: ${result.item.materialName}`);
  console.log(`Changed fields: ${result.changedFields.join(", ")}`);
  console.log(`Status: ${result.item.status}`);
  console.log(`Review status: ${result.item.reviewStatus}`);
  if (result.item.sourceFile) console.log(`Source file: ${result.item.sourceFile}`);
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
